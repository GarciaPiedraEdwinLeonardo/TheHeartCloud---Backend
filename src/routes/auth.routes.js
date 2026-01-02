import express from "express";
import { authController } from "../controllers/auth.controller.js";
import { verifyFirebaseToken } from "../middleware/auth.middleware.js";

const router = express.Router();

// POST /api/auth/register - Registrar usuario con email/password
router.post("/register", authController.register);

// POST /api/auth/google - Login/Registro con Google
router.post("/google", authController.googleAuth);

router.post("/update-login", authController.updateLogin);

// POST /api/auth/delete-unverified - Eliminar usuario no verificado
router.post("/delete-unverified", authController.deleteUnverifiedUser);

// POST /api/auth/cleanup-expired - Limpiar usuarios expirados (cron)
router.post("/cleanup-expired", authController.cleanupExpiredUsers);

// GET /api/auth/verification-status/:userId - Verificar estado
router.get(
  "/verification-status/:userId",
  authController.checkVerificationStatus
);

// DELETE /api/auth/account - Eliminar cuenta (requiere autenticación)
router.delete("/account", verifyFirebaseToken, authController.deleteAccount);

export default router;
