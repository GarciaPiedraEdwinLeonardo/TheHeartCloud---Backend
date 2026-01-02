import { db, auth } from "../config/firebase.js";
import admin from "../config/firebase.js";

export const authService = {
  /**
   * Elimina un usuario no verificado (ya lo tienes, pero lo mejoramos)
   */
  async deleteUnverifiedUser(email, userId) {
    try {
      let userIdToDelete = userId;

      // Si solo se proporcionó email, buscar el userId
      if (!userId && email) {
        const usersSnapshot = await db
          .collection("users")
          .where("email", "==", email)
          .where("emailVerified", "==", false)
          .limit(1)
          .get();

        if (usersSnapshot.empty) {
          throw new Error("Usuario no encontrado");
        }

        userIdToDelete = usersSnapshot.docs[0].id;
        const userData = usersSnapshot.docs[0].data();

        // Verificar si realmente expiró
        const expiresAt = userData.verificationExpiresAt?.toDate();
        const now = new Date();

        if (expiresAt && expiresAt >= now) {
          throw new Error("El usuario aún no ha expirado");
        }
      }

      const result = {
        userId: userIdToDelete,
        email: email,
        deletedFromAuth: false,
        deletedFromFirestore: false,
        errors: [],
      };

      // 1. Eliminar de Firebase Authentication
      try {
        await auth.deleteUser(userIdToDelete);
        result.deletedFromAuth = true;
        console.log("✅ Usuario eliminado de Authentication");
      } catch (authError) {
        if (authError.code === "auth/user-not-found") {
          result.deletedFromAuth = true;
        } else {
          console.error("❌ Error eliminando de Auth:", authError.message);
          result.errors.push({
            service: "Authentication",
            error: authError.message,
          });
        }
      }

      // 2. Eliminar de Firestore
      try {
        await db.collection("users").doc(userIdToDelete).delete();
        result.deletedFromFirestore = true;
        console.log("✅ Usuario eliminado de Firestore");
      } catch (firestoreError) {
        console.error(
          "❌ Error eliminando de Firestore:",
          firestoreError.message
        );
        result.errors.push({
          service: "Firestore",
          error: firestoreError.message,
        });
      }

      const success = result.deletedFromAuth && result.deletedFromFirestore;

      return { success, ...result };
    } catch (error) {
      console.error("Error eliminando usuario no verificado:", error);
      throw error;
    }
  },

  /**
   * Limpia todos los usuarios no verificados expirados
   */
  async cleanupExpiredUsers() {
    try {
      const now = new Date();

      // Buscar usuarios no verificados expirados
      const expiredUsersSnapshot = await db
        .collection("users")
        .where("emailVerified", "==", false)
        .where(
          "verificationExpiresAt",
          "<=",
          admin.firestore.Timestamp.fromDate(now)
        )
        .get();

      if (expiredUsersSnapshot.empty) {
        return {
          success: true,
          deletedCount: 0,
          message: "No hay usuarios expirados",
        };
      }

      const deletionResults = [];

      // Eliminar cada usuario expirado
      for (const userDoc of expiredUsersSnapshot.docs) {
        const userData = userDoc.data();
        try {
          const result = await this.deleteUnverifiedUser(
            userData.email,
            userDoc.id
          );
          deletionResults.push(result);
        } catch (error) {
          console.error(`Error eliminando usuario ${userDoc.id}:`, error);
          deletionResults.push({
            success: false,
            userId: userDoc.id,
            error: error.message,
          });
        }
      }

      const successCount = deletionResults.filter((r) => r.success).length;

      return {
        success: true,
        totalFound: expiredUsersSnapshot.size,
        deletedCount: successCount,
        results: deletionResults,
      };
    } catch (error) {
      console.error("Error en limpieza de usuarios expirados:", error);
      throw error;
    }
  },

  /**
   * Verifica el estado de verificación de un usuario
   */
  async checkUserVerificationStatus(userId) {
    try {
      const userDoc = await db.collection("users").doc(userId).get();

      if (!userDoc.exists) {
        throw new Error("Usuario no encontrado");
      }

      const userData = userDoc.data();
      const now = new Date();
      const expiresAt = userData.verificationExpiresAt?.toDate();

      return {
        emailVerified: userData.emailVerified,
        isExpired: expiresAt ? expiresAt < now : false,
        expiresAt: expiresAt,
        timeRemaining: expiresAt ? Math.max(0, expiresAt - now) : null,
      };
    } catch (error) {
      console.error("Error verificando estado de usuario:", error);
      throw error;
    }
  },

  /**
   * Registra un nuevo usuario con email y contraseña
   */
  async registerUser(email, password) {
    try {
      // 1. Verificar y limpiar usuario no verificado existente
      const existingUsers = await db
        .collection("users")
        .where("email", "==", email)
        .where("emailVerified", "==", false)
        .get();

      if (!existingUsers.empty) {
        const userDoc = existingUsers.docs[0];
        const userData = userDoc.data();
        const now = new Date();
        const expiresAt = userData.verificationExpiresAt?.toDate();
        const lastSent = userData.emailVerificationSentAt?.toDate();

        // Si ya expiró, eliminar
        if (expiresAt && expiresAt < now) {
          await this.deleteUnverifiedUser(email, userDoc.id);
        } else if (lastSent && now - lastSent < 60 * 60 * 1000) {
          // Si se envió recientemente
          const timeRemaining = Math.ceil(
            (60 * 60 * 1000 - (now - lastSent)) / 60000
          );
          throw new Error(
            `Ya se envió un email de verificación recientemente. Espera ${timeRemaining} minutos.`
          );
        } else {
          // Eliminar el antiguo si no ha expirado pero sí pasó el tiempo de reenvío
          await this.deleteUnverifiedUser(email, userDoc.id);
        }
      }

      // 2. Crear usuario en Firebase Auth
      const userRecord = await auth.createUser({
        email: email,
        password: password,
        emailVerified: false,
      });

      // 3. Crear custom token para que el frontend pueda autenticarse temporalmente
      const customToken = await auth.createCustomToken(userRecord.uid);

      // 4. Calcular fecha de expiración (24 horas)
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

      // 5. Crear documento en Firestore
      const userData = {
        id: userRecord.uid,
        email: email,
        name: null,
        role: "unverified",
        profileMedia: null,
        professionalInfo: null,
        stats: {
          aura: 0,
          contributionCount: 0,
          postCount: 0,
          commentCount: 0,
          forumCount: 0,
          joinedForumsCount: 0,
          totalImagesUploaded: 0,
          totalStorageUsed: 0,
        },
        suspension: {
          isSuspended: false,
          reason: null,
          startDate: null,
          endDate: null,
          suspendedBy: null,
        },
        joinedForums: [],
        joinDate: admin.firestore.FieldValue.serverTimestamp(),
        lastLogin: admin.firestore.FieldValue.serverTimestamp(),
        isActive: true,
        isDeleted: false,
        deletedAt: null,
        emailVerified: false,
        emailVerificationSentAt: admin.firestore.FieldValue.serverTimestamp(),
        verificationExpiresAt: admin.firestore.Timestamp.fromDate(expiresAt),
        verificationAttempts: 1,
        hasPassword: true,
      };

      await db.collection("users").doc(userRecord.uid).set(userData);

      // 6. Retornar información del usuario y link de verificación
      return {
        success: true,
        userId: userRecord.uid,
        email: email,
        customToken: customToken,
        expiresAt: expiresAt,
      };
    } catch (error) {
      console.error("Error registrando usuario:", error);

      // Manejar errores específicos de Firebase Auth
      if (error.code === "auth/email-already-exists") {
        throw new Error(
          "Este correo electrónico ya está registrado en el sistema."
        );
      } else if (error.code === "auth/invalid-email") {
        throw new Error("El correo electrónico no es válido.");
      } else if (error.code === "auth/weak-password") {
        throw new Error("La contraseña es demasiado débil.");
      }

      throw error;
    }
  },

  /**
   * Registra usuario con Google OAuth
   */
  async registerOrLoginWithGoogle(idToken) {
    try {
      // 1. Verificar el token de Google
      const decodedToken = await auth.verifyIdToken(idToken);
      const { uid, email, email_verified } = decodedToken;

      // 2. Verificar si el usuario ya existe
      const userDoc = await db.collection("users").doc(uid).get();

      if (userDoc.exists) {
        // Usuario existente - actualizar lastLogin
        await db.collection("users").doc(uid).update({
          lastLogin: admin.firestore.FieldValue.serverTimestamp(),
          emailVerified: true,
        });

        return {
          success: true,
          isNewUser: false,
          userId: uid,
          userData: userDoc.data(),
        };
      } else {
        // Usuario nuevo - crear documento
        const userData = {
          id: uid,
          email: email,
          name: null,
          role: "unverified",
          profileMedia: null,
          professionalInfo: null,
          stats: {
            aura: 0,
            contributionCount: 0,
            postCount: 0,
            commentCount: 0,
            forumCount: 0,
            joinedForumsCount: 0,
            totalImagesUploaded: 0,
            totalStorageUsed: 0,
          },
          suspension: {
            isSuspended: false,
            reason: null,
            startDate: null,
            endDate: null,
            suspendedBy: null,
          },
          joinedForums: [],
          joinDate: admin.firestore.FieldValue.serverTimestamp(),
          lastLogin: admin.firestore.FieldValue.serverTimestamp(),
          isActive: true,
          isDeleted: false,
          deletedAt: null,
          emailVerified: true, // Google ya verifica el email
          emailVerificationSentAt: admin.firestore.FieldValue.serverTimestamp(),
          hasPassword: false, // Usuario de Google no tiene contraseña aún
        };

        await db.collection("users").doc(uid).set(userData);

        return {
          success: true,
          isNewUser: true,
          userId: uid,
          userData: userData,
        };
      }
    } catch (error) {
      console.error("Error con Google OAuth:", error);
      throw error;
    }
  },
  async updateLastLogin(userId) {
    try {
      // Verificar que el usuario existe antes de actualizar
      const userDoc = await db.collection("users").doc(userId).get();

      if (!userDoc.exists) {
        console.warn(
          `⚠️ Usuario ${userId} no encontrado para actualizar lastLogin`
        );
        return { success: false, error: "Usuario no encontrado" };
      }

      await db.collection("users").doc(userId).update({
        lastLogin: admin.firestore.FieldValue.serverTimestamp(),
      });
      return { success: true };
    } catch (error) {
      console.error("Error actualizando lastLogin:", error);
      // No lanzar error, solo registrarlo
      return { success: false, error: error.message };
    }
  },
  /**
   * Eliminar cuenta de usuario
   */
  async deleteAccount(userId) {
    try {
      const result = {
        userId: userId,
        deletedFromAuth: false,
        deletedFromFirestore: false,
        errors: [],
      };

      // 1. Obtener datos del usuario antes de eliminar
      const userDoc = await db.collection("users").doc(userId).get();
      if (!userDoc.exists) {
        throw new Error("Usuario no encontrado");
      }

      const userData = userDoc.data();

      // 2. Eliminar foto de perfil de Cloudinary si existe
      if (userData.photoURL && userData.photoURL.includes("cloudinary.com")) {
        try {
          const { cloudinaryService } = await import("./cloudinary.service.js");
          await cloudinaryService.deleteImage(userData.photoURL);
          console.log("✅ Foto de perfil eliminada de Cloudinary");
        } catch (error) {
          console.warn("⚠️ Error eliminando foto de perfil:", error);
          // No fallar la eliminación por esto
        }
      }

      // 3. Eliminar documento de cédula si existe
      if (
        userData.professionalInfo?.licenseDocument &&
        userData.professionalInfo.licenseDocument.includes("cloudinary.com")
      ) {
        try {
          const { cloudinaryService } = await import("./cloudinary.service.js");
          await cloudinaryService.deleteImage(
            userData.professionalInfo.licenseDocument
          );
          console.log("✅ Documento de cédula eliminado de Cloudinary");
        } catch (error) {
          console.warn("⚠️ Error eliminando documento:", error);
        }
      }

      // 4. Eliminar de Firebase Authentication
      try {
        await auth.deleteUser(userId);
        result.deletedFromAuth = true;
        console.log("✅ Usuario eliminado de Authentication");
      } catch (authError) {
        if (authError.code === "auth/user-not-found") {
          result.deletedFromAuth = true;
        } else {
          console.error("❌ Error eliminando de Auth:", authError.message);
          result.errors.push({
            service: "Authentication",
            error: authError.message,
            code: authError.code,
          });
          // Si falla Auth, lanzar el error para que el frontend lo maneje
          throw authError;
        }
      }

      // 5. Eliminar de Firestore
      try {
        await db.collection("users").doc(userId).delete();
        result.deletedFromFirestore = true;
        console.log("✅ Usuario eliminado de Firestore");
      } catch (firestoreError) {
        console.error(
          "❌ Error eliminando de Firestore:",
          firestoreError.message
        );
        result.errors.push({
          service: "Firestore",
          error: firestoreError.message,
        });
      }

      const success = result.deletedFromAuth && result.deletedFromFirestore;

      return { success, ...result };
    } catch (error) {
      console.error("Error eliminando cuenta:", error);
      throw error;
    }
  },
};
