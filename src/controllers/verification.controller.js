import { verificationService } from "../services/verification.service.js";

export const verificationController = {
  // Obtener estado de verificación
  async getStatus(req, res, next) {
    try {
      const userId = req.user.uid; // Del middleware de autenticación

      const status = await verificationService.getVerificationStatus(userId);

      return res.status(200).json({
        success: true,
        data: status,
      });
    } catch (error) {
      if (error.message === "Usuario no encontrado") {
        return res.status(404).json({
          success: false,
          error: error.message,
        });
      }

      next(error);
    }
  },

  // Enviar solicitud de verificación
  async submitVerification(req, res, next) {
    try {
      const userId = req.user.uid;
      const verificationData = req.body;

      const result = await verificationService.submitVerification(
        userId,
        verificationData
      );

      return res.status(200).json({
        success: true,
        message: result.message,
        data: {
          status: result.status,
        },
      });
    } catch (error) {
      if (error.message === "Usuario no encontrado") {
        return res.status(404).json({
          success: false,
          error: error.message,
        });
      }

      if (
        error.message.includes("Ya tienes una solicitud") ||
        error.message.includes("ya está verificada")
      ) {
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }

      if (
        error.message.includes("requerido") ||
        error.message.includes("incompleta") ||
        error.message.includes("cédula") ||
        error.message.includes("Año")
      ) {
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }

      next(error);
    }
  },
};
