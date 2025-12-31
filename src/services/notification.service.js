import { db } from "../config/firebase.js";
import admin from "../config/firebase.js";

const getExpirationDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 30); // Las notificaciones expirarán en 30 días
  return date;
};

export const notificationService = {
  // ============= OBTENER NOTIFICACIONES =============

  async getAllUserNotifications(userId) {
    try {
      const notificationsSnapshot = await db
        .collection("notifications")
        .where("userId", "==", userId)
        .orderBy("createdAt", "desc")
        .get();

      const notifications = [];
      notificationsSnapshot.forEach((doc) => {
        notifications.push({
          id: doc.id,
          ...doc.data(),
        });
      });

      return notifications;
    } catch (error) {
      console.error("Error obteniendo notificaciones:", error);
      throw error;
    }
  },

  // ============= ELIMINAR NOTIFICACIONES =============

  async deleteNotification(notificationId) {
    try {
      await db.collection("notifications").doc(notificationId).delete();
      return { success: true };
    } catch (error) {
      console.error("Error eliminando notificación:", error);
      throw error;
    }
  },

  async deleteAllUserNotifications(userId) {
    try {
      const notifications = await this.getAllUserNotifications(userId);

      if (notifications.length === 0) {
        return { success: true, deletedCount: 0 };
      }

      const batch = db.batch();
      notifications.forEach((notif) => {
        const docRef = db.collection("notifications").doc(notif.id);
        batch.delete(docRef);
      });

      await batch.commit();
      return { success: true, deletedCount: notifications.length };
    } catch (error) {
      console.error("Error eliminando todas las notificaciones:", error);
      throw error;
    }
  },

  async deleteReadNotifications(userId) {
    try {
      const notifications = await this.getAllUserNotifications(userId);
      const readNotifications = notifications.filter((n) => n.isRead);

      if (readNotifications.length === 0) {
        return { success: true, deletedCount: 0 };
      }

      const batch = db.batch();
      readNotifications.forEach((notif) => {
        const docRef = db.collection("notifications").doc(notif.id);
        batch.delete(docRef);
      });

      await batch.commit();
      return { success: true, deletedCount: readNotifications.length };
    } catch (error) {
      console.error("Error eliminando notificaciones leídas:", error);
      throw error;
    }
  },

  // ============= MARCAR COMO LEÍDA =============

  async markAsRead(notificationId) {
    try {
      await db.collection("notifications").doc(notificationId).update({
        isRead: true,
      });
      return { success: true };
    } catch (error) {
      console.error("Error marcando notificación como leída:", error);
      throw error;
    }
  },

  async markAllAsRead(userId) {
    try {
      const notifications = await this.getAllUserNotifications(userId);
      const unreadNotifications = notifications.filter((n) => !n.isRead);

      if (unreadNotifications.length === 0) {
        return { success: true, updatedCount: 0 };
      }

      const batch = db.batch();
      unreadNotifications.forEach((notif) => {
        const docRef = db.collection("notifications").doc(notif.id);
        batch.update(docRef, { isRead: true });
      });

      await batch.commit();
      return { success: true, updatedCount: unreadNotifications.length };
    } catch (error) {
      console.error("Error marcando todas como leídas:", error);
      throw error;
    }
  },

  // ============= LIMPIEZA AUTOMÁTICA =============

  async smartCleanup(userId) {
    try {
      const allNotifications = await this.getAllUserNotifications(userId);

      if (allNotifications.length === 0) {
        return { success: true, expiredDeleted: 0, oldDeleted: 0 };
      }

      const batch = db.batch();
      let expiredDeleted = 0;
      let oldDeleted = 0;

      // 1. Filtrar notificaciones expiradas
      const now = new Date();
      const expiredNotifications = allNotifications.filter((notif) => {
        const expiresAt = notif.expiresAt?.toDate?.();
        return expiresAt && expiresAt <= now;
      });

      expiredNotifications.forEach((notif) => {
        const docRef = db.collection("notifications").doc(notif.id);
        batch.delete(docRef);
        expiredDeleted++;
      });

      // 2. Verificar límite de cantidad
      const remainingNotifications = allNotifications.length - expiredDeleted;

      if (remainingNotifications > 80) {
        const sortedNotifications = allNotifications
          .filter(
            (notif) => !expiredNotifications.find((exp) => exp.id === notif.id)
          )
          .sort((a, b) => {
            const timeA = a.createdAt?.seconds || 0;
            const timeB = b.createdAt?.seconds || 0;
            return timeB - timeA;
          });

        const notificationsToDelete = sortedNotifications.slice(80);
        notificationsToDelete.forEach((notif) => {
          const docRef = db.collection("notifications").doc(notif.id);
          batch.delete(docRef);
          oldDeleted++;
        });
      }

      if (expiredDeleted > 0 || oldDeleted > 0) {
        await batch.commit();
      }

      return { success: true, expiredDeleted, oldDeleted };
    } catch (error) {
      console.error("Error en limpieza inteligente:", error);
      throw error;
    }
  },

  // ============= ENVIAR NOTIFICACIONES =============

  async sendPostDeletedByModerator(userId, postTitle) {
    try {
      await this.smartCleanup(userId);

      await db.collection("notifications").add({
        userId,
        type: "post_deleted",
        title: "Publicación Eliminada",
        message: `Tu publicación "${postTitle}" fue eliminada por un moderador.`,
        isRead: false,
        isActionable: false,
        actionData: { postTitle },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromDate(getExpirationDate()),
      });

      return { success: true };
    } catch (error) {
      console.error("Error enviando notificación:", error);
      throw error;
    }
  },

  async sendPostApproved(userId, forumId, forumName) {
    try {
      await this.smartCleanup(userId);

      await db.collection("notifications").add({
        userId,
        type: "post_approved",
        title: "Publicación Aprobada",
        message: `Tu publicación en "${forumName}" ha sido aprobada y ahora es visible para todos.`,
        isRead: false,
        isActionable: false,
        actionData: { forumId, forumName },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromDate(getExpirationDate()),
      });

      return { success: true };
    } catch (error) {
      console.error("Error enviando notificación:", error);
      throw error;
    }
  },

  async sendPostRejected(userId, forumId, forumName, reason) {
    try {
      await this.smartCleanup(userId);

      await db.collection("notifications").add({
        userId,
        type: "post_rejected",
        title: "Publicación Rechazada",
        message: `Tu publicación en "${forumName}" fue rechazada. Motivo: ${reason}`,
        isRead: false,
        isActionable: true,
        actionData: { forumId, forumName, reason },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromDate(getExpirationDate()),
      });

      return { success: true };
    } catch (error) {
      console.error("Error enviando notificación:", error);
      throw error;
    }
  },
};
