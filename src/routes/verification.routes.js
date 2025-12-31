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

export default router;
