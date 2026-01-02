import express from "express";
import { reportController } from "../controllers/report.controller.js";
import { verifyFirebaseToken } from "../middleware/auth.middleware.js";

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(verifyFirebaseToken);

// POST /api/reports - Crear nuevo reporte
router.post("/", reportController.createReport);

// GET /api/reports - Obtener reportes (solo moderadores)
router.get("/", reportController.getReports);

// PUT /api/reports/:reportId/resolve - Resolver reporte (solo moderadores)
router.put("/:reportId/resolve", reportController.resolveReport);

// PUT /api/reports/:reportId/dismiss - Desestimar reporte (solo moderadores)
router.put("/:reportId/dismiss", reportController.dismissReport);

// DELETE /api/reports/:reportId/content - Eliminar contenido reportado (solo moderadores)
router.delete("/:reportId/content", reportController.deleteReportedContent);

export default router;
