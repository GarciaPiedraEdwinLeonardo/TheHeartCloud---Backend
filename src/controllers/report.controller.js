import { reportService } from "../services/report.service.js";

export const reportController = {
  // Crear reporte
  async createReport(req, res, next) {
    try {
      const userId = req.user.uid;
      const reportData = req.body;

      // Validaciones básicas
      if (!reportData.type) {
        return res.status(400).json({
          success: false,
          error: "El tipo de reporte es requerido",
        });
      }

      if (!reportData.targetId) {
        return res.status(400).json({
          success: false,
          error: "El ID del contenido reportado es requerido",
        });
      }

      if (!reportData.reason) {
        return res.status(400).json({
          success: false,
          error: "El motivo del reporte es requerido",
        });
      }

      if (
        !reportData.description ||
        reportData.description.trim().length < 10
      ) {
        return res.status(400).json({
          success: false,
          error: "La descripción debe tener al menos 10 caracteres",
        });
      }

      if (reportData.description.length > 100) {
        return res.status(400).json({
          success: false,
          error: "La descripción no puede superar 100 caracteres",
        });
      }

      const result = await reportService.createReport(userId, reportData);

      return res.status(201).json({
        success: true,
        message: "Reporte creado exitosamente",
        data: result,
      });
    } catch (error) {
      if (error.message.includes("no encontrado")) {
        return res.status(404).json({
          success: false,
          error: error.message,
        });
      }

      next(error);
    }
  },

  // Obtener reportes (con filtros)
  async getReports(req, res, next) {
    try {
      const userId = req.user.uid;
      const { status, type } = req.query;

      const filters = {};
      if (status) filters.status = status;
      if (type) filters.type = type;

      const reports = await reportService.getReports(userId, filters);

      return res.status(200).json({
        success: true,
        data: reports,
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

  // Resolver reporte
  async resolveReport(req, res, next) {
    try {
      const userId = req.user.uid;
      const { reportId } = req.params;
      const { resolution } = req.body;

      if (!resolution) {
        return res.status(400).json({
          success: false,
          error: "La resolución es requerida",
        });
      }

      const result = await reportService.resolveReport(
        userId,
        reportId,
        resolution
      );

      return res.status(200).json({
        success: true,
        message: "Reporte resuelto exitosamente",
        data: result,
      });
    } catch (error) {
      if (error.message === "Reporte no encontrado") {
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

  // Desestimar reporte
  async dismissReport(req, res, next) {
    try {
      const userId = req.user.uid;
      const { reportId } = req.params;
      const { reason } = req.body;

      if (!reason) {
        return res.status(400).json({
          success: false,
          error: "La razón es requerida",
        });
      }

      const result = await reportService.dismissReport(
        userId,
        reportId,
        reason
      );

      return res.status(200).json({
        success: true,
        message: "Reporte desestimado exitosamente",
        data: result,
      });
    } catch (error) {
      if (error.message === "Reporte no encontrado") {
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

  // Eliminar contenido reportado
  async deleteReportedContent(req, res, next) {
    try {
      const userId = req.user.uid;
      const { reportId } = req.params;

      const result = await reportService.deleteReportedContent(
        userId,
        reportId
      );

      return res.status(200).json({
        success: true,
        message: "Contenido eliminado exitosamente",
        data: result,
      });
    } catch (error) {
      if (error.message === "Reporte no encontrado") {
        return res.status(404).json({
          success: false,
          error: error.message,
        });
      }

      if (
        error.message.includes("no existe") ||
        error.message.includes("no encontrado")
      ) {
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
