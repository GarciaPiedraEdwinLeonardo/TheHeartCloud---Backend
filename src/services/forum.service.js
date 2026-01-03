import { db } from "../config/firebase.js";
import admin from "../config/firebase.js";
import { notificationService } from "./notification.service.js";

export const forumService = {
  /**
   * Verificar si el nombre de foro ya existe
   */
  async checkForumNameExists(forumName) {
    try {
      const cleanedName = forumName.trim().toLowerCase();

      const forumsSnapshot = await db
        .collection("forums")
        .where("isDeleted", "==", false)
        .get();

      let exists = false;
      let existingForumName = "";

      forumsSnapshot.forEach((doc) => {
        const forumData = doc.data();
        if (forumData.name && forumData.name.toLowerCase() === cleanedName) {
          exists = true;
          existingForumName = forumData.name;
        }
      });

      return { exists, existingForumName };
    } catch (error) {
      console.error("Error verificando nombre de foro:", error);
      throw error;
    }
  },

  /**
   * Verificar si usuario está baneado del foro
   */
  async isUserBanned(forumId, userId) {
    try {
      const forumDoc = await db.collection("forums").doc(forumId).get();

      if (!forumDoc.exists) {
        return false;
      }

      const forumData = forumDoc.data();
      const bannedUsers = forumData.bannedUsers || [];

      const userBan = bannedUsers.find(
        (ban) => ban.userId === userId && ban.isActive !== false
      );

      if (!userBan) {
        return false;
      }

      // Verificar si el baneo ha expirado
      if (userBan.duration !== "permanent") {
        const banDate =
          userBan.bannedAt?.toDate?.() || new Date(userBan.bannedAt);
        const now = new Date();
        const daysDiff = Math.floor((now - banDate) / (1000 * 60 * 60 * 24));

        let maxDays = 0;
        switch (userBan.duration) {
          case "1d":
            maxDays = 1;
            break;
          case "7d":
            maxDays = 7;
            break;
          case "30d":
            maxDays = 30;
            break;
          default:
            maxDays = 0;
        }

        if (daysDiff >= maxDays) {
          // Baneo expirado, remover
          await db
            .collection("forums")
            .doc(forumId)
            .update({
              bannedUsers: bannedUsers.filter((ban) => ban.userId !== userId),
            });
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error("Error verificando baneo:", error);
      return false;
    }
  },

  /**
   * Crear nueva comunidad
   */
  async createForum(userId, forumData) {
    try {
      // Verificar si el nombre ya existe
      const nameCheck = await this.checkForumNameExists(forumData.name);
      if (nameCheck.exists) {
        throw new Error(
          `Ya existe una comunidad llamada "${nameCheck.existingForumName}"`
        );
      }

      const forumRef = db.collection("forums").doc();
      const forumId = forumRef.id;

      const newForum = {
        id: forumId,
        name: forumData.name,
        description: forumData.description,
        rules:
          forumData.rules ||
          "• Respeto hacia todos los miembros\n• Contenido médico verificado\n• No spam ni autopromoción\n• Confidencialidad de pacientes\n• Lenguaje profesional",
        ownerId: userId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        membershipSettings: {
          requiresApproval: forumData.requiresApproval || false,
        },
        members: [userId],
        memberCount: 1,
        pendingMembers: {},
        bannedUsers: [],
        status: "active",
        disabledAt: null,
        disabledBy: null,
        disabledReason: null,
        moderators: {
          [userId]: {
            addedAt: admin.firestore.FieldValue.serverTimestamp(),
            addedBy: userId,
          },
        },
        postCount: 0,
        lastPostAt: null,
        isDeleted: false,
        deletedAt: null,
        requiresPostApproval: forumData.requiresPostApproval || false,
      };

      await forumRef.set(newForum);

      // Actualizar estadísticas del usuario
      await db
        .collection("users")
        .doc(userId)
        .update({
          "stats.forumCount": admin.firestore.FieldValue.increment(1),
          "stats.joinedForumsCount": admin.firestore.FieldValue.increment(1),
          joinedForums: admin.firestore.FieldValue.arrayUnion(forumId),
        });

      return { success: true, forumId, forum: newForum };
    } catch (error) {
      console.error("Error creando comunidad:", error);
      throw error;
    }
  },

  /**
   * Obtener datos de un foro
   */
  async getForumData(forumId) {
    try {
      const forumDoc = await db.collection("forums").doc(forumId).get();

      if (!forumDoc.exists) {
        throw new Error("Comunidad no encontrada");
      }

      const forumData = forumDoc.data();

      return {
        id: forumDoc.id,
        ...forumData,
        memberCount: forumData.memberCount || 0,
        postCount: forumData.postCount || 0,
        bannedUsers: forumData.bannedUsers || [],
      };
    } catch (error) {
      console.error("Error obteniendo datos de comunidad:", error);
      throw error;
    }
  },

  /**
   * Unirse a una comunidad
   */
  async joinForum(userId, forumId) {
    try {
      // Verificar baneo
      const isBanned = await this.isUserBanned(forumId, userId);
      if (isBanned) {
        throw new Error(
          "No puedes unirte a esta comunidad porque has sido baneado"
        );
      }

      const forumDoc = await db.collection("forums").doc(forumId).get();

      if (!forumDoc.exists) {
        throw new Error("Comunidad no encontrada");
      }

      const forumData = forumDoc.data();

      // Verificar que no sea ya miembro
      if (forumData.members && forumData.members.includes(userId)) {
        throw new Error("Ya eres miembro de esta comunidad");
      }

      // Verificar que no tenga solicitud pendiente
      if (forumData.pendingMembers && forumData.pendingMembers[userId]) {
        throw new Error("Ya tienes una solicitud pendiente");
      }

      // Obtener datos del usuario
      const userDoc = await db.collection("users").doc(userId).get();
      const userData = userDoc.data();

      // Si requiere aprobación, agregar a pendientes
      if (forumData.membershipSettings?.requiresApproval) {
        await db
          .collection("forums")
          .doc(forumId)
          .update({
            [`pendingMembers.${userId}`]: {
              requestedAt: admin.firestore.FieldValue.serverTimestamp(),
              userEmail: userData?.email || "Email no disponible",
              userName: userData?.name
                ? `${userData.name.name || ""} ${
                    userData.name.apellidopat || ""
                  } ${userData.name.apellidomat || ""}`.trim()
                : "Usuario",
              userRole: userData?.role || "unverified",
            },
          });

        return {
          success: true,
          requiresApproval: true,
          message: "Solicitud enviada. Espera la aprobación de un moderador.",
        };
      } else {
        // Entrada libre
        await db
          .collection("forums")
          .doc(forumId)
          .update({
            members: admin.firestore.FieldValue.arrayUnion(userId),
            memberCount: admin.firestore.FieldValue.increment(1),
          });

        // Actualizar estadísticas del usuario
        await db
          .collection("users")
          .doc(userId)
          .update({
            "stats.joinedForumsCount": admin.firestore.FieldValue.increment(1),
            joinedForums: admin.firestore.FieldValue.arrayUnion(forumId),
          });

        return { success: true, requiresApproval: false };
      }
    } catch (error) {
      console.error("Error uniéndose a comunidad:", error);
      throw error;
    }
  },

  /**
   * Abandonar comunidad
   */
  async leaveForum(userId, forumId) {
    try {
      const forumDoc = await db.collection("forums").doc(forumId).get();

      if (!forumDoc.exists) {
        throw new Error("Comunidad no encontrada");
      }

      const forumData = forumDoc.data();

      // Verificar que es miembro
      if (!forumData.members || !forumData.members.includes(userId)) {
        throw new Error("No eres miembro de esta comunidad");
      }

      // No permitir que el dueño abandone sin transferir
      if (forumData.ownerId === userId) {
        throw new Error(
          "El dueño no puede abandonar la comunidad. Usa la opción de transferir propiedad."
        );
      }

      // Actualizar foro
      await db
        .collection("forums")
        .doc(forumId)
        .update({
          members: admin.firestore.FieldValue.arrayRemove(userId),
          memberCount: admin.firestore.FieldValue.increment(-1),
        });

      // Actualizar estadísticas del usuario
      await db
        .collection("users")
        .doc(userId)
        .update({
          "stats.joinedForumsCount": admin.firestore.FieldValue.increment(-1),
          joinedForums: admin.firestore.FieldValue.arrayRemove(forumId),
        });

      return { success: true };
    } catch (error) {
      console.error("Error abandonando comunidad:", error);
      throw error;
    }
  },

  /**
   * Aprobar miembro
   */
  async approveMember(userId, forumId, targetUserId) {
    try {
      const forumDoc = await db.collection("forums").doc(forumId).get();

      if (!forumDoc.exists) {
        throw new Error("Comunidad no encontrada");
      }

      const forumData = forumDoc.data();

      // Verificar permisos
      const isOwner = forumData.ownerId === userId;
      const isModerator = forumData.moderators && forumData.moderators[userId];

      if (!isOwner && !isModerator) {
        throw new Error("Solo dueños y moderadores pueden aprobar miembros");
      }

      // Verificar baneo
      const isBanned = await this.isUserBanned(forumId, targetUserId);
      if (isBanned) {
        throw new Error("No puedes aprobar este usuario porque está baneado");
      }

      // Verificar que existe solicitud pendiente
      if (
        !forumData.pendingMembers ||
        !forumData.pendingMembers[targetUserId]
      ) {
        throw new Error("No hay solicitud pendiente para este usuario");
      }

      const batch = db.batch();

      // Agregar a miembros
      const forumRef = db.collection("forums").doc(forumId);
      batch.update(forumRef, {
        members: admin.firestore.FieldValue.arrayUnion(targetUserId),
        memberCount: admin.firestore.FieldValue.increment(1),
        [`pendingMembers.${targetUserId}`]: admin.firestore.FieldValue.delete(),
      });

      // Actualizar estadísticas del usuario
      const userRef = db.collection("users").doc(targetUserId);
      batch.update(userRef, {
        "stats.joinedForumsCount": admin.firestore.FieldValue.increment(1),
        joinedForums: admin.firestore.FieldValue.arrayUnion(forumId),
      });

      await batch.commit();

      // Enviar notificación
      await notificationService.sendMembershipApproved(
        targetUserId,
        forumId,
        forumData.name
      );

      return { success: true };
    } catch (error) {
      console.error("Error aprobando miembro:", error);
      throw error;
    }
  },

  /**
   * Rechazar miembro
   */
  async rejectMember(userId, forumId, targetUserId) {
    try {
      const forumDoc = await db.collection("forums").doc(forumId).get();

      if (!forumDoc.exists) {
        throw new Error("Comunidad no encontrada");
      }

      const forumData = forumDoc.data();

      // Verificar permisos
      const isOwner = forumData.ownerId === userId;
      const isModerator = forumData.moderators && forumData.moderators[userId];

      if (!isOwner && !isModerator) {
        throw new Error("Solo dueños y moderadores pueden rechazar miembros");
      }

      // Remover de pendientes
      await db
        .collection("forums")
        .doc(forumId)
        .update({
          [`pendingMembers.${targetUserId}`]:
            admin.firestore.FieldValue.delete(),
        });

      return { success: true };
    } catch (error) {
      console.error("Error rechazando miembro:", error);
      throw error;
    }
  },

  /**
   * Agregar moderador
   */
  async addModerator(userId, forumId, targetUserId) {
    try {
      const forumDoc = await db.collection("forums").doc(forumId).get();

      if (!forumDoc.exists) {
        throw new Error("Comunidad no encontrada");
      }

      const forumData = forumDoc.data();

      // Solo el dueño puede agregar moderadores
      if (forumData.ownerId !== userId) {
        throw new Error("Solo el dueño puede agregar moderadores");
      }

      // Verificar que el usuario objetivo es miembro
      if (!forumData.members || !forumData.members.includes(targetUserId)) {
        throw new Error("El usuario debe ser miembro de la comunidad");
      }

      // Verificar que el usuario es doctor
      const userDoc = await db.collection("users").doc(targetUserId).get();
      const userData = userDoc.data();

      if (userData?.role !== "doctor") {
        throw new Error("Solo doctores pueden ser moderadores");
      }

      await db
        .collection("forums")
        .doc(forumId)
        .update({
          [`moderators.${targetUserId}`]: {
            addedAt: admin.firestore.FieldValue.serverTimestamp(),
            addedBy: userId,
          },
        });

      // Enviar notificación
      await notificationService.sendModeratorAssigned(
        targetUserId,
        forumData.name
      );

      return { success: true };
    } catch (error) {
      console.error("Error agregando moderador:", error);
      throw error;
    }
  },

  /**
   * Remover moderador
   */
  async removeModerator(userId, forumId, targetUserId) {
    try {
      const forumDoc = await db.collection("forums").doc(forumId).get();

      if (!forumDoc.exists) {
        throw new Error("Comunidad no encontrada");
      }

      const forumData = forumDoc.data();

      // Solo el dueño puede remover moderadores
      if (forumData.ownerId !== userId) {
        throw new Error("Solo el dueño puede remover moderadores");
      }

      await db
        .collection("forums")
        .doc(forumId)
        .update({
          [`moderators.${targetUserId}`]: admin.firestore.FieldValue.delete(),
        });

      return { success: true };
    } catch (error) {
      console.error("Error removiendo moderador:", error);
      throw error;
    }
  },

  /**
   * Banear usuario
   */
  async banUser(userId, forumId, targetUserId, reason, duration) {
    try {
      const forumDoc = await db.collection("forums").doc(forumId).get();

      if (!forumDoc.exists) {
        throw new Error("Comunidad no encontrada");
      }

      const forumData = forumDoc.data();

      // Verificar permisos
      const isOwner = forumData.ownerId === userId;
      const isModerator = forumData.moderators && forumData.moderators[userId];

      if (!isOwner && !isModerator) {
        throw new Error("Solo dueños y moderadores pueden banear usuarios");
      }

      // Obtener información del usuario a banear
      const userToBanDoc = await db.collection("users").doc(targetUserId).get();
      const userToBanData = userToBanDoc.data();

      // Crear objeto de baneo
      const banData = {
        userId: targetUserId,
        bannedAt: new Date(),
        bannedBy: userId,
        reason,
        duration,
        isActive: true,
        userEmail: userToBanData?.email || "Email no disponible",
        userName: userToBanData?.name
          ? `${userToBanData.name.name || ""} ${
              userToBanData.name.apellidopat || ""
            } ${userToBanData.name.apellidomat || ""}`.trim()
          : "Usuario",
        userRole: userToBanData?.role || "unverified",
        forumId: forumId,
        forumName: forumData.name,
      };

      // Preparar actualizaciones
      const updates = {
        bannedUsers: admin.firestore.FieldValue.arrayUnion(banData),
      };

      // Verificar si es miembro y removerlo
      const isMember =
        forumData.members && forumData.members.includes(targetUserId);
      if (isMember) {
        updates.members = admin.firestore.FieldValue.arrayRemove(targetUserId);
        updates.memberCount = admin.firestore.FieldValue.increment(-1);
      }

      // Remover de moderadores si lo es
      const isModeratorTarget =
        forumData.moderators && forumData.moderators[targetUserId];
      if (isModeratorTarget) {
        updates[`moderators.${targetUserId}`] =
          admin.firestore.FieldValue.delete();
      }

      // Remover de pendientes si está pendiente
      const isPending =
        forumData.pendingMembers && forumData.pendingMembers[targetUserId];
      if (isPending) {
        updates[`pendingMembers.${targetUserId}`] =
          admin.firestore.FieldValue.delete();
      }

      // Ejecutar actualizaciones
      await db.collection("forums").doc(forumId).update(updates);

      // Actualizar estadísticas del usuario si era miembro
      if (isMember) {
        await db
          .collection("users")
          .doc(targetUserId)
          .update({
            "stats.joinedForumsCount": admin.firestore.FieldValue.increment(-1),
            joinedForums: admin.firestore.FieldValue.arrayRemove(forumId),
          });
      }

      // Enviar notificación
      await notificationService.sendCommunityBan(
        targetUserId,
        forumData.name,
        reason,
        duration
      );

      return { success: true, banData, wasMember: isMember };
    } catch (error) {
      console.error("Error baneando usuario:", error);
      throw error;
    }
  },

  /**
   * Desbanear usuario
   */
  async unbanUser(userId, forumId, targetUserId) {
    try {
      const forumDoc = await db.collection("forums").doc(forumId).get();

      if (!forumDoc.exists) {
        throw new Error("Comunidad no encontrada");
      }

      const forumData = forumDoc.data();

      // Verificar permisos
      const isOwner = forumData.ownerId === userId;
      const isModerator = forumData.moderators && forumData.moderators[userId];

      if (!isOwner && !isModerator) {
        throw new Error("Solo dueños y moderadores pueden desbanear usuarios");
      }

      const bannedUsers = forumData.bannedUsers || [];

      // Filtrar el usuario de la lista de baneados
      const updatedBannedUsers = bannedUsers.filter(
        (ban) => ban.userId !== targetUserId
      );

      await db.collection("forums").doc(forumId).update({
        bannedUsers: updatedBannedUsers,
      });

      return { success: true };
    } catch (error) {
      console.error("Error desbaneando usuario:", error);
      throw error;
    }
  },

  /**
   * Actualizar configuración del foro
   */
  async updateForumSettings(userId, forumId, settings) {
    try {
      const forumDoc = await db.collection("forums").doc(forumId).get();

      if (!forumDoc.exists) {
        throw new Error("Comunidad no encontrada");
      }

      const forumData = forumDoc.data();

      // Solo el dueño puede cambiar configuración
      if (forumData.ownerId !== userId) {
        throw new Error("Solo el dueño puede cambiar la configuración");
      }

      // Estados previos y nuevos
      const wasRequiringPostApproval = forumData.requiresPostApproval || false;
      const willRequirePostApproval = settings.requiresPostApproval || false;

      const wasRequiringMemberApproval =
        forumData.membershipSettings?.requiresApproval || false;
      const willRequireMemberApproval =
        settings.membershipSettings?.requiresApproval || false;

      // Actualizar configuración
      await db
        .collection("forums")
        .doc(forumId)
        .update({
          ...settings,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      let postsActivated = 0;
      let membersApproved = 0;

      // Si se desactiva validación de posts → Activar posts pendientes
      if (wasRequiringPostApproval && !willRequirePostApproval) {
        const postsSnapshot = await db
          .collection("posts")
          .where("forumId", "==", forumId)
          .where("status", "==", "pending")
          .get();

        if (!postsSnapshot.empty) {
          const batch = db.batch();
          const authorUpdates = new Map();

          postsSnapshot.forEach((postDoc) => {
            const postData = postDoc.data();

            // Actualizar post a activo
            batch.update(postDoc.ref, {
              status: "active",
              validatedAt: admin.firestore.FieldValue.serverTimestamp(),
              validatedBy: userId,
            });

            // Acumular incrementos por autor
            const authorId = postData.authorId;
            if (authorId) {
              const currentCount = authorUpdates.get(authorId) || 0;
              authorUpdates.set(authorId, currentCount + 1);
            }
          });

          // Actualizar estadísticas del foro
          batch.update(db.collection("forums").doc(forumId), {
            postCount: admin.firestore.FieldValue.increment(postsSnapshot.size),
            lastPostAt: admin.firestore.FieldValue.serverTimestamp(),
          });

          // Actualizar estadísticas de cada autor
          for (const [authorId, postCount] of authorUpdates) {
            const authorRef = db.collection("users").doc(authorId);
            batch.update(authorRef, {
              "stats.postCount":
                admin.firestore.FieldValue.increment(postCount),
              "stats.contributionCount":
                admin.firestore.FieldValue.increment(postCount),
            });
          }

          await batch.commit();
          postsActivated = postsSnapshot.size;

          // Enviar notificaciones
          for (const postDoc of postsSnapshot.docs) {
            const postData = postDoc.data();
            if (postData.authorId) {
              await notificationService.sendPostApproved(
                postData.authorId,
                forumId,
                forumData.name
              );
            }
          }
        }
      }

      // Si se desactiva aprobación de miembros → Aprobar miembros pendientes
      if (wasRequiringMemberApproval && !willRequireMemberApproval) {
        const pendingMembers = forumData.pendingMembers || {};
        const userIds = Object.keys(pendingMembers);

        if (userIds.length > 0) {
          const batch = db.batch();
          const forumRef = db.collection("forums").doc(forumId);

          for (const memberId of userIds) {
            // Agregar al array de miembros
            batch.update(forumRef, {
              members: admin.firestore.FieldValue.arrayUnion(memberId),
            });

            // Actualizar estadísticas del usuario
            const userRef = db.collection("users").doc(memberId);
            batch.update(userRef, {
              "stats.joinedForumsCount":
                admin.firestore.FieldValue.increment(1),
              joinedForums: admin.firestore.FieldValue.arrayUnion(forumId),
            });

            // Remover de pendientes
            batch.update(forumRef, {
              [`pendingMembers.${memberId}`]:
                admin.firestore.FieldValue.delete(),
            });
          }

          // Incrementar contador de miembros
          batch.update(forumRef, {
            memberCount: admin.firestore.FieldValue.increment(userIds.length),
          });

          await batch.commit();
          membersApproved = userIds.length;

          // Enviar notificaciones
          for (const memberId of userIds) {
            await notificationService.sendMembershipApproved(
              memberId,
              forumId,
              forumData.name
            );
          }
        }
      }

      return {
        success: true,
        postsActivated,
        membersApproved,
      };
    } catch (error) {
      console.error("Error actualizando configuración:", error);
      throw error;
    }
  },

  /**
   * Transferir propiedad y abandonar (leaveForumAsOwner)
   */
  async leaveForumAsOwner(userId, forumId) {
    try {
      const forumDoc = await db.collection("forums").doc(forumId).get();

      if (!forumDoc.exists) {
        throw new Error("Comunidad no encontrada");
      }

      const forumData = forumDoc.data();

      // Verificar que es el dueño
      if (forumData.ownerId !== userId) {
        throw new Error("Solo el dueño puede usar esta función");
      }

      const moderators = forumData.moderators || {};

      // Encontrar otros moderadores (sin incluir al dueño actual)
      const otherModerators = Object.entries(moderators).filter(
        ([modId]) => modId !== userId
      );

      if (otherModerators.length === 0) {
        throw new Error(
          "No puedes abandonar la comunidad sin asignar un nuevo dueño. Agrega moderadores primero."
        );
      }

      // Encontrar el moderador más antiguo
      let oldestModerator = null;
      let oldestDate = new Date();

      for (const [modId, modData] of otherModerators) {
        const modDate =
          modData.addedAt?.toDate?.() || new Date(modData.addedAt);
        if (modDate < oldestDate) {
          oldestDate = modDate;
          oldestModerator = modId;
        }
      }

      if (!oldestModerator) {
        throw new Error(
          "No se pudo encontrar un moderador para transferir la propiedad"
        );
      }

      const batch = db.batch();
      const forumRef = db.collection("forums").doc(forumId);

      // Transferir propiedad
      batch.update(forumRef, {
        ownerId: oldestModerator,
        [`moderators.${userId}`]: admin.firestore.FieldValue.delete(),
        members: admin.firestore.FieldValue.arrayRemove(userId),
        memberCount: admin.firestore.FieldValue.increment(-1),
      });

      await batch.commit();

      // Notificar al nuevo dueño
      await notificationService.sendOwnershipTransferred(
        oldestModerator,
        forumData.name
      );

      // Actualizar estadísticas del usuario que se va
      await db
        .collection("users")
        .doc(userId)
        .update({
          "stats.joinedForumsCount": admin.firestore.FieldValue.increment(-1),
          joinedForums: admin.firestore.FieldValue.arrayRemove(forumId),
        });

      return {
        success: true,
        newOwnerId: oldestModerator,
        previousOwnerId: userId,
      };
    } catch (error) {
      console.error("Error en transferencia de propiedad:", error);
      throw error;
    }
  },

  /**
   * Eliminar comunidad completamente
   */
  async deleteForum(userId, forumId, reason) {
    try {
      const forumDoc = await db.collection("forums").doc(forumId).get();

      if (!forumDoc.exists) {
        throw new Error("Comunidad no encontrada");
      }

      const forumData = forumDoc.data();

      // Verificar permisos (admin o moderador del sistema)
      const userDoc = await db.collection("users").doc(userId).get();
      const userData = userDoc.data();

      const isSystemAdmin = ["admin", "moderator"].includes(userData?.role);

      if (!isSystemAdmin) {
        throw new Error(
          "Solo administradores del sistema pueden eliminar comunidades"
        );
      }

      // 1. Eliminar todos los posts del foro (esto también elimina comentarios asociados)
      const postsSnapshot = await db
        .collection("posts")
        .where("forumId", "==", forumId)
        .get();

      let deletedPostsCount = 0;
      let deletedCommentsCount = 0;

      for (const postDoc of postsSnapshot.docs) {
        const postData = postDoc.data();

        // Contar comentarios antes de eliminar
        const commentsSnapshot = await db
          .collection("comments")
          .where("postId", "==", postDoc.id)
          .get();

        deletedCommentsCount += commentsSnapshot.size;

        // Eliminar comentarios
        const commentsBatch = db.batch();
        commentsSnapshot.forEach((commentDoc) => {
          commentsBatch.delete(commentDoc.ref);
        });
        await commentsBatch.commit();

        // Eliminar post
        await postDoc.ref.delete();
        deletedPostsCount++;

        // Actualizar estadísticas del autor si el post estaba activo
        if (postData.status === "active" && postData.authorId) {
          try {
            const authorDoc = await db
              .collection("users")
              .doc(postData.authorId)
              .get();
            if (authorDoc.exists) {
              await db
                .collection("users")
                .doc(postData.authorId)
                .update({
                  "stats.postCount": admin.firestore.FieldValue.increment(-1),
                  "stats.contributionCount":
                    admin.firestore.FieldValue.increment(-1),
                });
            }
          } catch (error) {
            console.warn(
              `Error actualizando stats del autor ${postData.authorId}:`,
              error
            );
          }
        }
      }

      // 2. Actualizar estadísticas de usuarios que tenían el foro en joinedForums
      const usersSnapshot = await db
        .collection("users")
        .where("joinedForums", "array-contains", forumId)
        .get();

      const usersBatch = db.batch();
      let updatedUsersCount = 0;

      usersSnapshot.forEach((userDoc) => {
        const userData = userDoc.data();
        const currentJoinedForums = userData.joinedForums || [];
        const newJoinedForums = currentJoinedForums.filter(
          (id) => id !== forumId
        );

        usersBatch.update(userDoc.ref, {
          joinedForums: newJoinedForums,
          "stats.joinedForumsCount": newJoinedForums.length,
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        });
        updatedUsersCount++;
      });

      if (updatedUsersCount > 0) {
        await usersBatch.commit();
      }

      // 3. Eliminar el foro
      await db.collection("forums").doc(forumId).delete();

      return {
        success: true,
        message: "Comunidad eliminada exitosamente",
        stats: {
          deletedPosts: deletedPostsCount,
          deletedComments: deletedCommentsCount,
          updatedUsers: updatedUsersCount,
        },
      };
    } catch (error) {
      console.error("Error eliminando comunidad:", error);
      throw error;
    }
  },

  /**
   * Obtener posts pendientes de validación
   */
  async getPendingPosts(userId, forumId) {
    try {
      const forumDoc = await db.collection("forums").doc(forumId).get();

      if (!forumDoc.exists) {
        throw new Error("Comunidad no encontrada");
      }

      const forumData = forumDoc.data();

      // Verificar permisos
      const isOwner = forumData.ownerId === userId;
      const isModerator = forumData.moderators && forumData.moderators[userId];

      if (!isOwner && !isModerator) {
        throw new Error(
          "Solo dueños y moderadores pueden ver posts pendientes"
        );
      }

      const postsSnapshot = await db
        .collection("posts")
        .where("forumId", "==", forumId)
        .where("status", "==", "pending")
        .get();

      const posts = [];
      for (const postDoc of postsSnapshot.docs) {
        const postData = postDoc.data();

        // Obtener información del autor
        try {
          const authorDoc = await db
            .collection("users")
            .doc(postData.authorId)
            .get();
          const authorData = authorDoc.exists() ? authorDoc.data() : null;

          posts.push({
            id: postDoc.id,
            ...postData,
            authorName: authorData?.name
              ? `${authorData.name.name || ""} ${
                  authorData.name.apellidopat || ""
                } ${authorData.name.apellidomat || ""}`.trim()
              : "Usuario",
            authorSpecialty: authorData?.professionalInfo?.specialty || null,
          });
        } catch (error) {
          posts.push({
            id: postDoc.id,
            ...postData,
            authorName: "Usuario",
            authorSpecialty: null,
          });
        }
      }

      return posts;
    } catch (error) {
      console.error("Error obteniendo posts pendientes:", error);
      throw error;
    }
  },

  /**
   * Validar post pendiente
   */
  async validatePost(userId, forumId, postId) {
    try {
      const forumDoc = await db.collection("forums").doc(forumId).get();

      if (!forumDoc.exists) {
        throw new Error("Comunidad no encontrada");
      }

      const forumData = forumDoc.data();

      // Verificar permisos
      const isOwner = forumData.ownerId === userId;
      const isModerator = forumData.moderators && forumData.moderators[userId];

      if (!isOwner && !isModerator) {
        throw new Error("Solo dueños y moderadores pueden validar posts");
      }

      const postDoc = await db.collection("posts").doc(postId).get();

      if (!postDoc.exists) {
        throw new Error("Publicación no encontrada");
      }

      const postData = postDoc.data();

      if (postData.status !== "pending") {
        throw new Error("Esta publicación no está pendiente de validación");
      }

      // Actualizar el post a activo
      await db.collection("posts").doc(postId).update({
        status: "active",
        validatedAt: admin.firestore.FieldValue.serverTimestamp(),
        validatedBy: userId,
      });

      // Incrementar contadores
      const batch = db.batch();

      // Incrementar stats del autor
      batch.update(db.collection("users").doc(postData.authorId), {
        "stats.postCount": admin.firestore.FieldValue.increment(1),
        "stats.contributionCount": admin.firestore.FieldValue.increment(1),
      });

      // Incrementar contador del foro
      batch.update(db.collection("forums").doc(forumId), {
        postCount: admin.firestore.FieldValue.increment(1),
        lastPostAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      await batch.commit();

      // Notificar al autor
      await notificationService.sendPostApproved(
        postData.authorId,
        forumId,
        forumData.name
      );

      return { success: true };
    } catch (error) {
      console.error("Error validando post:", error);
      throw error;
    }
  },

  /**
   * Rechazar post pendiente
   */
  async rejectPost(userId, forumId, postId) {
    try {
      const forumDoc = await db.collection("forums").doc(forumId).get();

      if (!forumDoc.exists) {
        throw new Error("Comunidad no encontrada");
      }

      const forumData = forumDoc.data();

      // Verificar permisos
      const isOwner = forumData.ownerId === userId;
      const isModerator = forumData.moderators && forumData.moderators[userId];

      if (!isOwner && !isModerator) {
        throw new Error("Solo dueños y moderadores pueden rechazar posts");
      }

      const postDoc = await db.collection("posts").doc(postId).get();

      if (!postDoc.exists) {
        throw new Error("Publicación no encontrada");
      }

      const postData = postDoc.data();
      const authorId = postData.authorId;

      if (postData.status !== "pending") {
        throw new Error("Esta publicación no está pendiente de validación");
      }

      // Eliminar el post (como está pending, no afecta contadores)
      await db.collection("posts").doc(postId).delete();

      // Notificar al autor sobre el rechazo
      await notificationService.sendPostRejected(
        authorId,
        forumId,
        forumData.name
      );

      return { success: true };
    } catch (error) {
      console.error("Error rechazando post:", error);
      throw error;
    }
  },
};
