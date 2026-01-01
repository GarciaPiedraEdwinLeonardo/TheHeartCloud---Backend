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
  async getUserFullInfo(req, res, next) {
    try {
      const { userId } = req.params;
      const requestingUserId = req.user.uid;

      const userData = await verificationController.getUserFullInfo(
        userId,
        requestingUserId
      );

      return res.status(200).json({
        success: true,
        data: userData,
      });
    } catch (error) {
      if (error.message === "Usuario no encontrado") {
        return res.status(404).json({
          success: false,
          error: error.message,
        });
      }

      if (error.message.includes("permisos")) {
        return res.status(403).json({
          success: false,
          error: error.message,
        });
      }

      next(error);
    }
  },
  async getPendingVerifications(req, res, next) {
    try {
      const requestingUserId = req.user.uid;

      const requests = await verificationService.getPendingVerifications(
        requestingUserId
      );

      return res.status(200).json({
        success: true,
        data: requests,
      });
    } catch (error) {
      if (error.message.includes("permisos")) {
        return res.status(403).json({
          success: false,
          error: error.message,
        });
      }

      next(error);
    }
  },
  // Verificar o rechazar una solicitud
  async processVerification(req, res, next) {
    try {
      const { userId } = req.params;
      const { action, reason } = req.body; // action: 'approve' | 'reject'
      const adminId = req.user.uid;

      if (!["approve", "reject"].includes(action)) {
        return res.status(400).json({
          success: false,
          error: 'Acción inválida. Usa "approve" o "reject"',
        });
      }

      if (action === "reject" && !reason) {
        return res.status(400).json({
          success: false,
          error: "Se requiere una razón para rechazar",
        });
      }

      const result = await verificationService.processVerification(
        userId,
        adminId,
        action,
        reason
      );

      return res.status(200).json({
        success: true,
        message: result.message,
        data: result,
      });
    } catch (error) {
      if (error.message === "Usuario no encontrado") {
        return res.status(404).json({
          success: false,
          error: error.message,
        });
      }

      if (error.message.includes("permisos")) {
        return res.status(403).json({
          success: false,
          error: error.message,
        });
      }

      next(error);
    }
  },
};
