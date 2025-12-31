import express from "express";
import { notificationController } from "../controllers/notification.controller.js";
import { verifyFirebaseToken } from "../middleware/auth.middleware.js";

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(verifyFirebaseToken);

// GET /api/notifications - Obtener todas las notificaciones
router.get("/", notificationController.getNotifications);

// PUT /api/notifications/:notificationId/read - Marcar como leída
router.put("/:notificationId/read", notificationController.markAsRead);

// PUT /api/notifications/mark-all-read - Marcar todas como leídas
router.put("/mark-all-read", notificationController.markAllAsRead);

// DELETE /api/notifications/:notificationId - Eliminar una notificación
router.delete("/:notificationId", notificationController.deleteNotification);

// DELETE /api/notifications - Eliminar todas las notificaciones
router.delete("/", notificationController.deleteAllNotifications);

// DELETE /api/notifications/read - Eliminar notificaciones leídas
router.delete("/read/all", notificationController.deleteReadNotifications);

export default router;
