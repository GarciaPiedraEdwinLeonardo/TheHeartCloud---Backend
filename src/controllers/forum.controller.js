import { forumService } from "../services/forum.service.js";

export const forumController = {
  /**
   * Crear nueva comunidad
   * POST /api/forums
   */
  async createForum(req, res, next) {
    try {
      const userId = req.user.uid;
      const forumData = req.body;

      // Validaciones
      if (!forumData.name || forumData.name.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: "El nombre de la comunidad es requerido",
        });
      }

      if (forumData.name.trim().length < 3) {
        return res.status(400).json({
          success: false,
          error: "El nombre debe tener al menos 3 caracteres",
        });
      }

      if (forumData.name.trim().length > 50) {
        return res.status(400).json({
          success: false,
          error: "El nombre no puede exceder 50 caracteres",
        });
      }

      if (!forumData.description || forumData.description.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: "La descripción es requerida",
        });
      }

      if (forumData.description.trim().length < 10) {
        return res.status(400).json({
          success: false,
          error: "La descripción debe tener al menos 10 caracteres",
        });
      }

      if (forumData.description.trim().length > 500) {
        return res.status(400).json({
          success: false,
          error: "La descripción no puede exceder 500 caracteres",
        });
      }

      if (forumData.rules && forumData.rules.length > 1000) {
        return res.status(400).json({
          success: false,
          error: "Las reglas no pueden exceder 1000 caracteres",
        });
      }

      const result = await forumService.createForum(userId, forumData);

      return res.status(201).json({
        success: true,
        message: "Comunidad creada exitosamente",
        data: result,
      });
    } catch (error) {
      if (error.message.includes("Ya existe una comunidad")) {
        return res.status(409).json({
          success: false,
          error: error.message,
        });
      }

      next(error);
    }
  },

  /**
   * Obtener datos de un foro
   * GET /api/forums/:forumId
   */
  async getForumData(req, res, next) {
    try {
      const { forumId } = req.params;

      if (!forumId) {
        return res.status(400).json({
          success: false,
          error: "ID del foro es requerido",
        });
      }

      const forumData = await forumService.getForumData(forumId);

      return res.status(200).json({
        success: true,
        data: forumData,
      });
    } catch (error) {
      if (error.message === "Comunidad no encontrada") {
        return res.status(404).json({
          success: false,
          error: error.message,
        });
      }

      next(error);
    }
  },

  /**
   * Verificar si el nombre de foro existe
   * POST /api/forums/check-name
   */
  async checkForumName(req, res, next) {
    try {
      const { name } = req.body;

      if (!name || name.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: "El nombre es requerido",
        });
      }

      const result = await forumService.checkForumNameExists(name);

      return res.status(200).json({
        success: true,
        data: result,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Unirse a una comunidad
   * POST /api/forums/:forumId/join
   */
  async joinForum(req, res, next) {
    try {
      const userId = req.user.uid;
      const { forumId } = req.params;

      if (!forumId) {
        return res.status(400).json({
          success: false,
          error: "ID del foro es requerido",
        });
      }

      const result = await forumService.joinForum(userId, forumId);

      return res.status(200).json({
        success: true,
        message: result.requiresApproval
          ? "Solicitud enviada exitosamente"
          : "Te has unido a la comunidad",
        data: result,
      });
    } catch (error) {
      if (error.message.includes("baneado")) {
        return res.status(403).json({
          success: false,
          error: error.message,
        });
      }

      if (error.message === "Comunidad no encontrada") {
        return res.status(404).json({
          success: false,
          error: error.message,
        });
      }

      if (
        error.message.includes("Ya eres miembro") ||
        error.message.includes("solicitud pendiente")
      ) {
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }

      next(error);
    }
  },

  /**
   * Abandonar comunidad
   * POST /api/forums/:forumId/leave
   */
  async leaveForum(req, res, next) {
    try {
      const userId = req.user.uid;
      const { forumId } = req.params;

      if (!forumId) {
        return res.status(400).json({
          success: false,
          error: "ID del foro es requerido",
        });
      }

      const result = await forumService.leaveForum(userId, forumId);

      return res.status(200).json({
        success: true,
        message: "Has abandonado la comunidad",
        data: result,
      });
    } catch (error) {
      if (error.message === "Comunidad no encontrada") {
        return res.status(404).json({
          success: false,
          error: error.message,
        });
      }

      if (
        error.message.includes("No eres miembro") ||
        error.message.includes("dueño no puede")
      ) {
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }

      next(error);
    }
  },

  /**
   * Aprobar miembro pendiente
   * POST /api/forums/:forumId/members/:userId/approve
   */
  async approveMember(req, res, next) {
    try {
      const requestingUserId = req.user.uid;
      const { forumId, userId } = req.params;

      if (!forumId || !userId) {
        return res.status(400).json({
          success: false,
          error: "ID del foro y del usuario son requeridos",
        });
      }

      const result = await forumService.approveMember(
        requestingUserId,
        forumId,
        userId
      );

      return res.status(200).json({
        success: true,
        message: "Miembro aprobado exitosamente",
        data: result,
      });
    } catch (error) {
      if (error.message === "Comunidad no encontrada") {
        return res.status(404).json({
          success: false,
          error: error.message,
        });
      }

      if (
        error.message.includes("permisos") ||
        error.message.includes("baneado")
      ) {
        return res.status(403).json({
          success: false,
          error: error.message,
        });
      }

      if (error.message.includes("No hay solicitud")) {
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }

      next(error);
    }
  },

  /**
   * Rechazar miembro pendiente
   * POST /api/forums/:forumId/members/:userId/reject
   */
  async rejectMember(req, res, next) {
    try {
      const requestingUserId = req.user.uid;
      const { forumId, userId } = req.params;

      if (!forumId || !userId) {
        return res.status(400).json({
          success: false,
          error: "ID del foro y del usuario son requeridos",
        });
      }

      const result = await forumService.rejectMember(
        requestingUserId,
        forumId,
        userId
      );

      return res.status(200).json({
        success: true,
        message: "Solicitud rechazada",
        data: result,
      });
    } catch (error) {
      if (error.message === "Comunidad no encontrada") {
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

  /**
   * Agregar moderador
   * POST /api/forums/:forumId/moderators/:userId
   */
  async addModerator(req, res, next) {
    try {
      const requestingUserId = req.user.uid;
      const { forumId, userId } = req.params;

      if (!forumId || !userId) {
        return res.status(400).json({
          success: false,
          error: "ID del foro y del usuario son requeridos",
        });
      }

      const result = await forumService.addModerator(
        requestingUserId,
        forumId,
        userId
      );

      return res.status(200).json({
        success: true,
        message: "Moderador agregado exitosamente",
        data: result,
      });
    } catch (error) {
      if (error.message === "Comunidad no encontrada") {
        return res.status(404).json({
          success: false,
          error: error.message,
        });
      }

      if (
        error.message.includes("Solo el dueño") ||
        error.message.includes("debe ser miembro") ||
        error.message.includes("Solo doctores")
      ) {
        return res.status(403).json({
          success: false,
          error: error.message,
        });
      }

      next(error);
    }
  },

  /**
   * Remover moderador
   * DELETE /api/forums/:forumId/moderators/:userId
   */
  async removeModerator(req, res, next) {
    try {
      const requestingUserId = req.user.uid;
      const { forumId, userId } = req.params;

      if (!forumId || !userId) {
        return res.status(400).json({
          success: false,
          error: "ID del foro y del usuario son requeridos",
        });
      }

      const result = await forumService.removeModerator(
        requestingUserId,
        forumId,
        userId
      );

      return res.status(200).json({
        success: true,
        message: "Moderador removido exitosamente",
        data: result,
      });
    } catch (error) {
      if (error.message === "Comunidad no encontrada") {
        return res.status(404).json({
          success: false,
          error: error.message,
        });
      }

      if (error.message.includes("Solo el dueño")) {
        return res.status(403).json({
          success: false,
          error: error.message,
        });
      }

      next(error);
    }
  },

  /**
   * Banear usuario
   * POST /api/forums/:forumId/bans
   */
  async banUser(req, res, next) {
    try {
      const requestingUserId = req.user.uid;
      const { forumId } = req.params;
      const { userId, reason, duration } = req.body;

      if (!forumId || !userId) {
        return res.status(400).json({
          success: false,
          error: "ID del foro y del usuario son requeridos",
        });
      }

      if (!reason || reason.trim().length < 10) {
        return res.status(400).json({
          success: false,
          error: "El motivo debe tener al menos 10 caracteres",
        });
      }

      if (!duration) {
        return res.status(400).json({
          success: false,
          error: "La duración del baneo es requerida",
        });
      }

      const validDurations = ["1d", "7d", "30d", "permanent"];
      if (!validDurations.includes(duration)) {
        return res.status(400).json({
          success: false,
          error: "Duración de baneo inválida",
        });
      }

      const result = await forumService.banUser(
        requestingUserId,
        forumId,
        userId,
        reason,
        duration
      );

      return res.status(200).json({
        success: true,
        message: "Usuario baneado exitosamente",
        data: result,
      });
    } catch (error) {
      if (error.message === "Comunidad no encontrada") {
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

  /**
   * Desbanear usuario
   * DELETE /api/forums/:forumId/bans/:userId
   */
  async unbanUser(req, res, next) {
    try {
      const requestingUserId = req.user.uid;
      const { forumId, userId } = req.params;

      if (!forumId || !userId) {
        return res.status(400).json({
          success: false,
          error: "ID del foro y del usuario son requeridos",
        });
      }

      const result = await forumService.unbanUser(
        requestingUserId,
        forumId,
        userId
      );

      return res.status(200).json({
        success: true,
        message: "Usuario desbaneado exitosamente",
        data: result,
      });
    } catch (error) {
      if (error.message === "Comunidad no encontrada") {
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

  /**
   * Verificar si usuario está baneado
   * GET /api/forums/:forumId/bans/:userId
   */
  async checkBanStatus(req, res, next) {
    try {
      const { forumId, userId } = req.params;

      if (!forumId || !userId) {
        return res.status(400).json({
          success: false,
          error: "ID del foro y del usuario son requeridos",
        });
      }

      const isBanned = await forumService.isUserBanned(forumId, userId);

      return res.status(200).json({
        success: true,
        data: {
          isBanned,
        },
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Actualizar configuración del foro
   * PUT /api/forums/:forumId/settings
   */
  async updateSettings(req, res, next) {
    try {
      const userId = req.user.uid;
      const { forumId } = req.params;
      const settings = req.body;

      if (!forumId) {
        return res.status(400).json({
          success: false,
          error: "ID del foro es requerido",
        });
      }

      // Validar descripción si se envía
      if (settings.description !== undefined) {
        if (!settings.description || settings.description.trim().length === 0) {
          return res.status(400).json({
            success: false,
            error: "La descripción es requerida",
          });
        }

        if (settings.description.trim().length < 10) {
          return res.status(400).json({
            success: false,
            error: "La descripción debe tener al menos 10 caracteres",
          });
        }

        if (settings.description.trim().length > 500) {
          return res.status(400).json({
            success: false,
            error: "La descripción no puede exceder 500 caracteres",
          });
        }
      }

      const result = await forumService.updateForumSettings(
        userId,
        forumId,
        settings
      );

      const messages = [];
      if (result.postsActivated > 0) {
        messages.push(`${result.postsActivated} publicación(es) activada(s)`);
      }
      if (result.membersApproved > 0) {
        messages.push(`${result.membersApproved} miembro(s) aprobado(s)`);
      }

      return res.status(200).json({
        success: true,
        message:
          messages.length > 0
            ? `Configuración actualizada. ${messages.join(" y ")}.`
            : "Configuración actualizada exitosamente",
        data: result,
      });
    } catch (error) {
      if (error.message === "Comunidad no encontrada") {
        return res.status(404).json({
          success: false,
          error: error.message,
        });
      }

      if (error.message.includes("Solo el dueño")) {
        return res.status(403).json({
          success: false,
          error: error.message,
        });
      }

      next(error);
    }
  },

  /**
   * Transferir propiedad y abandonar como dueño
   * POST /api/forums/:forumId/transfer-ownership
   */
  async transferOwnership(req, res, next) {
    try {
      const userId = req.user.uid;
      const { forumId } = req.params;

      if (!forumId) {
        return res.status(400).json({
          success: false,
          error: "ID del foro es requerido",
        });
      }

      const result = await forumService.leaveForumAsOwner(userId, forumId);

      return res.status(200).json({
        success: true,
        message:
          "Has abandonado la comunidad. La propiedad ha sido transferida.",
        data: result,
      });
    } catch (error) {
      if (error.message === "Comunidad no encontrada") {
        return res.status(404).json({
          success: false,
          error: error.message,
        });
      }

      if (
        error.message.includes("Solo el dueño") ||
        error.message.includes("sin asignar un nuevo dueño") ||
        error.message.includes("No se pudo encontrar")
      ) {
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }

      next(error);
    }
  },

  /**
   * Eliminar comunidad (solo admins del sistema)
   * DELETE /api/forums/:forumId
   */
  async deleteForum(req, res, next) {
    try {
      const userId = req.user.uid;
      const { forumId } = req.params;
      const { reason } = req.body;

      if (!forumId) {
        return res.status(400).json({
          success: false,
          error: "ID del foro es requerido",
        });
      }

      if (!reason || reason.trim().length < 10) {
        return res.status(400).json({
          success: false,
          error: "El motivo debe tener al menos 10 caracteres",
        });
      }

      if (reason.length > 100) {
        return res.status(400).json({
          success: false,
          error: "El motivo no puede exceder 100 caracteres",
        });
      }

      const result = await forumService.deleteForum(userId, forumId, reason);

      return res.status(200).json({
        success: true,
        message: result.message,
        data: result.stats,
      });
    } catch (error) {
      if (error.message === "Comunidad no encontrada") {
        return res.status(404).json({
          success: false,
          error: error.message,
        });
      }

      if (error.message.includes("administradores del sistema")) {
        return res.status(403).json({
          success: false,
          error: error.message,
        });
      }

      next(error);
    }
  },

  /**
   * Obtener posts pendientes de validación
   * GET /api/forums/:forumId/pending-posts
   */
  async getPendingPosts(req, res, next) {
    try {
      const userId = req.user.uid;
      const { forumId } = req.params;

      if (!forumId) {
        return res.status(400).json({
          success: false,
          error: "ID del foro es requerido",
        });
      }

      const posts = await forumService.getPendingPosts(userId, forumId);

      return res.status(200).json({
        success: true,
        data: posts,
      });
    } catch (error) {
      if (error.message === "Comunidad no encontrada") {
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

  /**
   * Validar post pendiente
   * POST /api/forums/:forumId/posts/:postId/validate
   */
  async validatePost(req, res, next) {
    try {
      const userId = req.user.uid;
      const { forumId, postId } = req.params;

      if (!forumId || !postId) {
        return res.status(400).json({
          success: false,
          error: "ID del foro y del post son requeridos",
        });
      }

      const result = await forumService.validatePost(userId, forumId, postId);

      return res.status(200).json({
        success: true,
        message: "Publicación validada exitosamente",
        data: result,
      });
    } catch (error) {
      if (
        error.message === "Comunidad no encontrada" ||
        error.message === "Publicación no encontrada"
      ) {
        return res.status(404).json({
          success: false,
          error: error.message,
        });
      }

      if (
        error.message.includes("permisos") ||
        error.message.includes("no está pendiente")
      ) {
        return res.status(403).json({
          success: false,
          error: error.message,
        });
      }

      next(error);
    }
  },

  /**
   * Rechazar post pendiente
   * POST /api/forums/:forumId/posts/:postId/reject
   */
  async rejectPost(req, res, next) {
    try {
      const userId = req.user.uid;
      const { forumId, postId } = req.params;

      if (!forumId || !postId) {
        return res.status(400).json({
          success: false,
          error: "ID del foro y del post son requeridos",
        });
      }

      const result = await forumService.rejectPost(userId, forumId, postId);

      return res.status(200).json({
        success: true,
        message: "Publicación rechazada exitosamente",
        data: result,
      });
    } catch (error) {
      if (
        error.message === "Comunidad no encontrada" ||
        error.message === "Publicación no encontrada"
      ) {
        return res.status(404).json({
          success: false,
          error: error.message,
        });
      }

      if (
        error.message.includes("permisos") ||
        error.message.includes("no está pendiente")
      ) {
        return res.status(403).json({
          success: false,
          error: error.message,
        });
      }

      next(error);
    }
  },
};
