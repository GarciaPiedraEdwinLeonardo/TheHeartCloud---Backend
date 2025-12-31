import { notificationService } from "../services/notification.service.js";

export const notificationController = {
  // Obtener todas las notificaciones del usuario
  async getNotifications(req, res, next) {
    try {
      const userId = req.user.uid;

      const notifications = await notificationService.getAllUserNotifications(
        userId
      );

      return res.status(200).json({
        success: true,
        data: notifications,
      });
    } catch (error) {
      next(error);
    }
  },

  // Marcar una notificación como leída
  async markAsRead(req, res, next) {
    try {
      const { notificationId } = req.params;

      await notificationService.markAsRead(notificationId);

      return res.status(200).json({
        success: true,
        message: "Notificación marcada como leída",
      });
    } catch (error) {
      next(error);
    }
  },

  // Marcar todas las notificaciones como leídas
  async markAllAsRead(req, res, next) {
    try {
      const userId = req.user.uid;

      const result = await notificationService.markAllAsRead(userId);

      return res.status(200).json({
        success: true,
        message: "Todas las notificaciones marcadas como leídas",
        updatedCount: result.updatedCount,
      });
    } catch (error) {
      next(error);
    }
  },

  // Eliminar una notificación
  async deleteNotification(req, res, next) {
    try {
      const { notificationId } = req.params;

      await notificationService.deleteNotification(notificationId);

      return res.status(200).json({
        success: true,
        message: "Notificación eliminada",
      });
    } catch (error) {
      next(error);
    }
  },

  // Eliminar todas las notificaciones
  async deleteAllNotifications(req, res, next) {
    try {
      const userId = req.user.uid;

      const result = await notificationService.deleteAllUserNotifications(
        userId
      );

      return res.status(200).json({
        success: true,
        message: "Todas las notificaciones eliminadas",
        deletedCount: result.deletedCount,
      });
    } catch (error) {
      next(error);
    }
  },

  // Eliminar notificaciones leídas
  async deleteReadNotifications(req, res, next) {
    try {
      const userId = req.user.uid;

      const result = await notificationService.deleteReadNotifications(userId);

      return res.status(200).json({
        success: true,
        message: "Notificaciones leídas eliminadas",
        deletedCount: result.deletedCount,
      });
    } catch (error) {
      next(error);
    }
  },
};
