import admin from "./_firebase.js";

export default async function handler(req, res) {
  // Configurar CORS para permitir peticiones desde tu frontend
  res.setHeader("Access-Control-Allow-Credentials", true);
  res.setHeader("Access-Control-Allow-Origin", "*"); // En producción cambia * por tu dominio
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Manejar preflight request
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  // Solo permitir POST
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
      allowedMethods: ["POST"],
    });
  }

  try {
    const { email, userId } = req.body;

    // Validar que se proporcionó email o userId
    if (!email && !userId) {
      return res.status(400).json({
        error: "Se requiere email o userId",
        received: req.body,
      });
    }

    console.log("🔍 Procesando eliminación para:", email || userId);

    const auth = admin.auth();
    const db = admin.firestore();

    let userIdToDelete = userId;
    let userEmail = email;

    // Si solo se proporcionó email, buscar el userId en Firestore
    if (!userId && email) {
      console.log("📋 Buscando userId en Firestore...");

      const usersRef = db.collection("users");
      const snapshot = await usersRef
        .where("email", "==", email)
        .where("emailVerified", "==", false)
        .limit(1)
        .get();

      if (snapshot.empty) {
        console.log("⚠️ Usuario no encontrado en Firestore");
        return res.status(404).json({
          error: "Usuario no encontrado en Firestore",
        });
      }

      userIdToDelete = snapshot.docs[0].id;
      const userData = snapshot.docs[0].data();

      // Verificar si realmente expiró
      const expiresAt = userData.verificationExpiresAt?.toDate();
      const now = new Date();

      console.log("📅 Fecha actual:", now);
      console.log("⏰ Fecha de expiración:", expiresAt);

      if (expiresAt && expiresAt >= now) {
        console.log("❌ Usuario no ha expirado todavía");
        return res.status(400).json({
          error: "El usuario aún no ha expirado",
          expiresAt: expiresAt.toISOString(),
          now: now.toISOString(),
        });
      }

      console.log("✅ Usuario expirado, procediendo a eliminar");
    }

    console.log("🗑️ Eliminando usuario con ID:", userIdToDelete);

    // Resultado de las operaciones
    const result = {
      userId: userIdToDelete,
      email: userEmail,
      deletedFromAuth: false,
      deletedFromFirestore: false,
      errors: [],
    };

    // 1. Intentar eliminar de Firebase Authentication
    try {
      await auth.deleteUser(userIdToDelete);
      result.deletedFromAuth = true;
      console.log("✅ Usuario eliminado de Authentication");
    } catch (authError) {
      if (authError.code === "auth/user-not-found") {
        console.log(
          "⚠️ Usuario no encontrado en Auth (probablemente ya eliminado)"
        );
        result.deletedFromAuth = true; // Consideramos éxito si ya no existe
      } else {
        console.error("❌ Error eliminando de Auth:", authError.message);
        result.errors.push({
          service: "Authentication",
          error: authError.message,
        });
        // No lanzar error, continuar con Firestore
      }
    }

    // 2. Intentar eliminar de Firestore
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

    // Determinar si fue exitoso
    const success = result.deletedFromAuth && result.deletedFromFirestore;

    if (success) {
      console.log("🎉 Usuario eliminado exitosamente de todos los servicios");
      return res.status(200).json({
        success: true,
        message: "Usuario eliminado exitosamente",
        ...result,
      });
    } else {
      console.log("⚠️ Eliminación parcial");
      return res.status(207).json({
        // 207 Multi-Status
        success: false,
        message: "Eliminación parcial - revisa los detalles",
        ...result,
      });
    }
  } catch (error) {
    console.error("💥 Error general:", error);
    return res.status(500).json({
      error: "Error interno del servidor",
      details: error.message,
      stack: process.env.NODE_ENV === "development" ? error.stack : undefined,
    });
  }
}
