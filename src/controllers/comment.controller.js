import { commentService } from "../services/comment.service.js";

export const commentController = {
  // Crear nuevo comentario
  async createComment(req, res, next) {
    try {
      const userId = req.user.uid;
      const commentData = req.body;

      // Validaciones básicas
      if (!commentData.content || commentData.content.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: "El contenido del comentario es requerido",
        });
      }

      if (!commentData.postId) {
        return res.status(400).json({
          success: false,
          error: "El ID del post es requerido",
        });
      }

      if (commentData.content.length > 500) {
        return res.status(400).json({
          success: false,
          error: "El comentario no puede superar 500 caracteres",
        });
      }

      const result = await commentService.createComment(userId, commentData);

      return res.status(201).json({
        success: true,
        message: "Comentario creado exitosamente",
        data: result,
      });
    } catch (error) {
      if (error.message.includes("Solo usuarios verificados")) {
        return res.status(403).json({
          success: false,
          error: error.message,
        });
      }

      if (error.message === "Post no encontrado") {
        return res.status(404).json({
          success: false,
          error: error.message,
        });
      }

      next(error);
    }
  },

  // Editar comentario
  async editComment(req, res, next) {
    try {
      const userId = req.user.uid;
      const { commentId } = req.params;
      const { content } = req.body;

      // Validaciones
      if (!content || content.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: "El contenido es requerido",
        });
      }

      if (content.length > 500) {
        return res.status(400).json({
          success: false,
          error: "El comentario no puede superar 500 caracteres",
        });
      }

      const result = await commentService.editComment(
        userId,
        commentId,
        content
      );

      return res.status(200).json({
        success: true,
        message: "Comentario editado exitosamente",
        data: result,
      });
    } catch (error) {
      if (error.message === "Comentario no encontrado") {
        return res.status(404).json({
          success: false,
          error: error.message,
        });
      }

      if (
        error.message.includes("permisos") ||
        error.message.includes("autor")
      ) {
        return res.status(403).json({
          success: false,
          error: error.message,
        });
      }

      next(error);
    }
  },

  // Eliminar comentario
  async deleteComment(req, res, next) {
    try {
      const userId = req.user.uid;
      const { commentId } = req.params;

      const result = await commentService.deleteComment(userId, commentId);

      return res.status(200).json({
        success: true,
        message: "Comentario eliminado exitosamente",
        data: result,
      });
    } catch (error) {
      if (error.message === "Comentario no encontrado") {
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
};
