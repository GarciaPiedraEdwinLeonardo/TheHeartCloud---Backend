import express from "express";
import { verificationController } from "../controllers/verification.controller.js";
import { verifyFirebaseToken } from "../middleware/auth.middleware.js";

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(verifyFirebaseToken);

// GET /api/verification/status - Obtener estado de verificación
router.get("/status", verificationController.getStatus);

// POST /api/verification/submit - Enviar solicitud de verificación
router.post("/submit", verificationController.submitVerification);

// GET /api/users/:userId/full - Obtener info completa (solo admins)
router.get("/:userId/full", verificationController.getUserFullInfo);

// GET /api/users/verifications/pending - Obtener solicitudes pendientes (solo admins)
router.get(
  "/verifications/pending",
  verificationController.getPendingVerifications
);

// POST /api/users/:userId/verify - Procesar verificación (solo admins)
router.post("/:userId/verify", verificationController.processVerification);

export default router;
