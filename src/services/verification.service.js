import { db } from "../config/firebase.js";
import admin from "../config/firebase.js";
import { notificationService } from "./notification.service.js";

export const verificationService = {
  /**
   * Obtiene el estado de verificación de un usuario
   */
  async getVerificationStatus(userId) {
    try {
      const userDoc = await db.collection("users").doc(userId).get();

      if (!userDoc.exists) {
        console.warn(
          `⚠️ Usuario ${userId} no encontrado para obtener estado de verificación`
        );
        throw new Error("Usuario no encontrado");
      }

      const userData = userDoc.data();
      const status = userData.professionalInfo?.verificationStatus || "";

      return {
        status: status,
        canSubmit: status !== "pending" && status !== "verified",
        professionalInfo: userData.professionalInfo || null,
      };
    } catch (error) {
      console.error("Error obteniendo estado de verificación:", error);
      throw error;
    }
  },

  /**
   * Envía solicitud de verificación
   */
  async submitVerification(userId, verificationData) {
    try {
      // 1. Verificar que el usuario existe
      const userDoc = await db.collection("users").doc(userId).get();

      if (!userDoc.exists) {
        throw new Error("Usuario no encontrado");
      }

      const userData = userDoc.data();
      const currentStatus = userData.professionalInfo?.verificationStatus;

      // 2. Verificar que puede enviar solicitud
      if (currentStatus === "pending") {
        throw new Error("Ya tienes una solicitud de verificación en proceso");
      }

      if (currentStatus === "verified") {
        throw new Error("Tu cuenta ya está verificada");
      }

      // 3. Validar datos
      const {
        apellidoPaterno,
        apellidoMaterno,
        nombre,
        especialidad,
        cedula,
        paisCedula,
        universidad,
        anioTitulacion,
        documentoCedula,
      } = verificationData;

      // Validaciones
      if (!apellidoPaterno || !apellidoMaterno || !nombre) {
        throw new Error("Nombre completo es requerido");
      }

      if (!especialidad || !cedula || !universidad || !anioTitulacion) {
        throw new Error("Información profesional incompleta");
      }

      if (!documentoCedula) {
        throw new Error("Documento de cédula es requerido");
      }

      // Validar formato de cédula (7 dígitos)
      if (!/^\d{7}$/.test(cedula)) {
        throw new Error("La cédula debe tener exactamente 7 dígitos");
      }

      // Validar año de titulación
      const year = parseInt(anioTitulacion);
      const currentYear = new Date().getFullYear();
      if (isNaN(year) || year < 1950 || year > currentYear) {
        throw new Error(
          `Año de titulación debe estar entre 1950 y ${currentYear}`
        );
      }

      // 4. Actualizar documento del usuario
      const userUpdate = {
        name: {
          apellidopat: apellidoPaterno,
          apellidomat: apellidoMaterno,
          name: nombre,
        },
        professionalInfo: {
          specialty: especialidad,
          licenseNumber: cedula,
          licenseCountry: paisCedula || "México",
          university: universidad,
          titulationYear: year,
          licenseDocument: documentoCedula,
          verificationStatus: "pending",
          submittedAt: admin.firestore.FieldValue.serverTimestamp(),
          verifiedAt: null,
          verifiedBy: null,
        },
      };

      await db.collection("users").doc(userId).update(userUpdate);

      return {
        success: true,
        message: "Solicitud de verificación enviada exitosamente",
        status: "pending",
      };
    } catch (error) {
      console.error("Error enviando verificación:", error);
      throw error;
    }
  },
  async getUserFullInfo(userId, requestingUserId) {
    try {
      // Verificar permisos del solicitante
      const requestingUserDoc = await db
        .collection("users")
        .doc(requestingUserId)
        .get();

      if (!requestingUserDoc.exists) {
        throw new Error("Usuario solicitante no encontrado");
      }

      const requestingUserData = requestingUserDoc.data();
      const isAdmin = ["admin", "moderator"].includes(requestingUserData.role);

      if (!isAdmin) {
        throw new Error("No tienes permisos para acceder a esta información");
      }

      // Obtener información completa
      const userDoc = await db.collection("users").doc(userId).get();

      if (!userDoc.exists) {
        throw new Error("Usuario no encontrado");
      }

      const userData = userDoc.data();

      return {
        id: userId,
        ...userData,
      };
    } catch (error) {
      console.error("Error obteniendo info completa:", error);
      throw error;
    }
  },
  async getPendingVerifications(requestingUserId) {
    try {
      // Verificar permisos
      const requestingUserDoc = await db
        .collection("users")
        .doc(requestingUserId)
        .get();

      if (!requestingUserDoc.exists) {
        throw new Error("Usuario no encontrado");
      }

      const requestingUserData = requestingUserDoc.data();
      const isAdmin = ["admin", "moderator"].includes(requestingUserData.role);

      if (!isAdmin) {
        throw new Error("No tienes permisos para ver las solicitudes");
      }

      // Obtener solicitudes pendientes
      const snapshot = await db
        .collection("users")
        .where("professionalInfo.verificationStatus", "==", "pending")
        .orderBy("professionalInfo.submittedAt", "asc")
        .get();

      const requests = [];
      snapshot.forEach((doc) => {
        requests.push({
          id: doc.id,
          ...doc.data(),
        });
      });

      return requests;
    } catch (error) {
      console.error("Error obteniendo solicitudes:", error);
      throw error;
    }
  },
  async processVerification(userId, adminId, action, reason = null) {
    try {
      // Verificar permisos del admin
      const adminDoc = await db.collection("users").doc(adminId).get();

      if (!adminDoc.exists) {
        throw new Error("Admin no encontrado");
      }

      const adminData = adminDoc.data();
      const isAdmin = ["admin", "moderator"].includes(adminData.role);

      if (!isAdmin) {
        throw new Error("No tienes permisos para procesar verificaciones");
      }

      // Obtener datos del usuario a verificar
      const userDoc = await db.collection("users").doc(userId).get();

      if (!userDoc.exists) {
        throw new Error("Usuario no encontrado");
      }

      const userData = userDoc.data();

      if (userData.professionalInfo?.verificationStatus !== "pending") {
        throw new Error("Esta solicitud no está pendiente");
      }

      const userName = `${userData.name?.name || ""} ${
        userData.name?.apellidopat || ""
      }`.trim();

      if (action === "approve") {
        // Aprobar verificación
        await db.collection("users").doc(userId).update({
          role: "doctor",
          "professionalInfo.verificationStatus": "verified",
          "professionalInfo.verifiedAt":
            admin.firestore.FieldValue.serverTimestamp(),
          "professionalInfo.verifiedBy": adminData.email,
        });

        // Enviar notificación
        await notificationService.sendVerificationApproved(
          userId,
          userName,
          adminData.email
        );

        return {
          success: true,
          message: "Verificación aprobada exitosamente",
          action: "approved",
        };
      } else {
        // Rechazar verificación

        // 1. Eliminar PDF de Cloudinary si existe
        let pdfDeleted = false;
        if (userData.professionalInfo?.licenseDocument) {
          try {
            const { cloudinaryService } = await import(
              "./cloudinary.service.js"
            );
            await cloudinaryService.deleteImage(
              userData.professionalInfo.licenseDocument
            );
            pdfDeleted = true;
            console.log("✅ PDF de cédula eliminado de Cloudinary");
          } catch (error) {
            console.error("⚠️ Error eliminando PDF de Cloudinary:", error);
            // No lanzar error, continuar con el rechazo
          }
        }

        const updateData = {
          // Eliminar nombre completo
          name: admin.firestore.FieldValue.delete(),

          // Resetear professionalInfo pero mantener historial de rechazo
          professionalInfo: {
            verificationStatus: "rejected",
            verifiedAt: admin.firestore.FieldValue.serverTimestamp(),
            verifiedBy: adminData.email,
            rejectionReason: reason,
            // Los demás campos se eliminan al no incluirlos
          },
        };

        await db.collection("users").doc(userId).update(updateData);

        // Enviar notificación
        await notificationService.sendVerificationRejected(
          userId,
          reason,
          adminData.email
        );

        return {
          success: true,
          message: "Verificación rechazada",
          action: "rejected",
        };
      }
    } catch (error) {
      console.error("Error procesando verificación:", error);
      throw error;
    }
  },
};
