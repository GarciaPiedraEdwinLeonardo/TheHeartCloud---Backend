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

      const batch = admin.firestore().batch();
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

      const batch = admin.firestore().batch();
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

      const batch = admin.firestore().batch();
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

      const batch = admin.firestore().batch();
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

  // ============= ENVIAR NOTIFICACIONES - VERIFICACIÓN =============

  async sendVerificationApproved(userId, userName, adminEmail) {
    try {
      await this.smartCleanup(userId);

      await db.collection("notifications").add({
        userId,
        type: "verification_approved",
        title: "¡Verificación Aprobada! 🎉",
        message: `Felicidades ${userName}, tu cuenta médica ha sido verificada y ahora puedes publicar y comentar.`,
        isRead: false,
        isActionable: false,
        actionData: {
          triggeredByUsername: adminEmail,
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromDate(getExpirationDate()),
      });

      return { success: true };
    } catch (error) {
      console.error(
        "Error enviando notificación de verificación aprobada:",
        error
      );
      throw error;
    }
  },

  async sendVerificationRejected(userId, reason, adminEmail) {
    try {
      await this.smartCleanup(userId);

      await db.collection("notifications").add({
        userId,
        type: "verification_rejected",
        title: "Solicitud Rechazada ❌",
        message: `Tu solicitud de verificación fue rechazada. Razón: ${reason}`,
        isRead: false,
        isActionable: true,
        actionData: {
          triggeredByUsername: adminEmail,
          actionRequired: "resubmit_verification",
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromDate(getExpirationDate()),
      });

      return { success: true };
    } catch (error) {
      console.error(
        "Error enviando notificación de verificación rechazada:",
        error
      );
      throw error;
    }
  },

  // ============= ENVIAR NOTIFICACIONES - POSTS =============

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
      console.error("Error enviando notificación de post aprobado:", error);
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
        message: `Tu publicación en "${forumName}" fue rechazada${
          reason ? `. Motivo: ${reason}` : ""
        }`,
        isRead: false,
        isActionable: true,
        actionData: {
          forumId,
          forumName,
          reason,
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromDate(getExpirationDate()),
      });

      return { success: true };
    } catch (error) {
      console.error("Error enviando notificación de post rechazado:", error);
      throw error;
    }
  },

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
      console.error("Error enviando notificación de post eliminado:", error);
      throw error;
    }
  },

  // ============= ENVIAR NOTIFICACIONES - COMENTARIOS =============

  async sendCommentDeletedByModerator(userId, commentId, reason) {
    try {
      await this.smartCleanup(userId);

      await db.collection("notifications").add({
        userId,
        type: "comment_deleted",
        title: "Comentario Eliminado",
        message: `Tu comentario fue eliminado por un moderador${
          reason ? `. Motivo: ${reason}` : ""
        }`,
        isRead: false,
        isActionable: false,
        actionData: { commentId, reason },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromDate(getExpirationDate()),
      });

      return { success: true };
    } catch (error) {
      console.error(
        "Error enviando notificación de comentario eliminado:",
        error
      );
      throw error;
    }
  },

  // ============= ENVIAR NOTIFICACIONES - COMUNIDADES =============

  async sendMembershipApproved(userId, forumId, forumName) {
    try {
      await this.smartCleanup(userId);

      await db.collection("notifications").add({
        userId,
        type: "membership_approved",
        title: "Solicitud Aprobada ✅",
        message: `Tu solicitud para unirte a "${forumName}" ha sido aprobada. ¡Bienvenido!`,
        isRead: false,
        isActionable: false,
        actionData: { forumId, forumName },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromDate(getExpirationDate()),
      });

      return { success: true };
    } catch (error) {
      console.error(
        "Error enviando notificación de membresía aprobada:",
        error
      );
      throw error;
    }
  },

  async sendModeratorAssigned(userId, forumName) {
    try {
      await this.smartCleanup(userId);

      await db.collection("notifications").add({
        userId,
        type: "moderator_assigned",
        title: "Eres Ahora Moderador 🛡️",
        message: `Has sido asignado como moderador en la comunidad "${forumName}". Ahora puedes gestionar publicaciones y miembros.`,
        isRead: false,
        isActionable: false,
        actionData: { forumName },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromDate(getExpirationDate()),
      });

      return { success: true };
    } catch (error) {
      console.error(
        "Error enviando notificación de moderador asignado:",
        error
      );
      throw error;
    }
  },

  async sendOwnershipTransferred(userId, forumName) {
    try {
      await this.smartCleanup(userId);

      await db.collection("notifications").add({
        userId,
        type: "ownership_transferred",
        title: "Eres Ahora Dueño 👑",
        message: `Has sido asignado como dueño de la comunidad "${forumName}". Ahora tienes control total.`,
        isRead: false,
        isActionable: false,
        actionData: { forumName },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromDate(getExpirationDate()),
      });

      return { success: true };
    } catch (error) {
      console.error(
        "Error enviando notificación de transferencia de propiedad:",
        error
      );
      throw error;
    }
  },

  async sendCommunityBan(userId, forumName, reason, duration) {
    try {
      await this.smartCleanup(userId);

      const durationLabels = {
        "1d": "1 día",
        "7d": "7 días",
        "30d": "30 días",
        permanent: "Permanente",
      };

      await db.collection("notifications").add({
        userId,
        type: "community_ban",
        title: "Baneado de Comunidad 🚫",
        message: `Has sido baneado de "${forumName}". Motivo: ${reason}. Duración: ${
          durationLabels[duration] || duration
        }`,
        isRead: false,
        isActionable: false,
        actionData: { forumName, reason, duration },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromDate(getExpirationDate()),
      });

      return { success: true };
    } catch (error) {
      console.error("Error enviando notificación de baneo:", error);
      throw error;
    }
  },

  // ============= ENVIAR NOTIFICACIONES - SANCIONES =============

  async sendSanctionNotification(userId, duration, reason, moderatorEmail) {
    try {
      await this.smartCleanup(userId);

      const title =
        duration === "Permanente"
          ? "Suspensión Permanente 🔴"
          : `Suspensión Temporal - ${duration} ⚠️`;

      const message =
        duration === "Permanente"
          ? `Tu cuenta ha sido suspendida permanentemente. Razón: ${reason}`
          : `Tu cuenta ha sido suspendida por ${duration}. Razón: ${reason}`;

      await db.collection("notifications").add({
        userId,
        type: "user_suspended",
        title: title,
        message: message,
        isRead: false,
        isActionable: false,
        actionData: {
          triggeredByUsername: moderatorEmail,
          duration,
          reason,
        },
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        expiresAt: admin.firestore.Timestamp.fromDate(getExpirationDate()),
      });

      return { success: true };
    } catch (error) {
      console.error("Error enviando notificación de sanción:", error);
      throw error;
    }
  },
};
