import { db } from "../config/firebase.js";
import admin from "../config/firebase.js";

export const verificationService = {
  /**
   * Obtiene el estado de verificación de un usuario
   */
  async getVerificationStatus(userId) {
    try {
      const userDoc = await db.collection("users").doc(userId).get();

      if (!userDoc.exists) {
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
};
