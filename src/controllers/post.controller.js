import { postService } from "../services/post.service.js";

export const postController = {
  async createPost(req, res, next) {
    try {
      const userId = req.user.uid; // Del middleware de autenticación
      const postData = req.body;

      const result = await postService.createPost(userId, postData);

      return res.status(201).json({
        success: true,
        message: "Post creado exitosamente",
        data: result,
      });
    } catch (error) {
      next(error); // Pasa al error handler
    }
  },

  async editPost(req, res, next) {
    try {
      const userId = req.user.uid;
      const postId = req.params.postId; // Del parámetro de ruta
      const updates = req.body;

      // Validar que al menos se envíe algo para actualizar
      if (!updates.title && !updates.content && updates.images === undefined) {
        return res.status(400).json({
          success: false,
          error: "Debes proporcionar al menos un campo para actualizar",
        });
      }

      const result = await postService.editPost(userId, postId, updates);

      return res.status(200).json({
        success: true,
        message: "Post actualizado exitosamente",
        data: result,
      });
    } catch (error) {
      // Si el error es de permisos o no encontrado, devolver código apropiado
      if (error.message === "Publicación no encontrada") {
        return res.status(404).json({
          success: false,
          error: error.message,
        });
      }

      if (error.message.includes("No tienes permisos")) {
        return res.status(403).json({
          success: false,
          error: error.message,
        });
      }

      next(error);
    }
  },

  async deletePost(req, res, next) {
    try {
      const userId = req.user.uid;
      const postId = req.params.postId;

      // Validar que se envió el postId
      if (!postId) {
        return res.status(400).json({
          success: false,
          error: "ID del post es requerido",
        });
      }

      const result = await postService.deletePost(userId, postId);

      return res.status(200).json({
        success: true,
        message: "Post eliminado exitosamente",
        data: result,
      });
    } catch (error) {
      // Si el error es de permisos o no encontrado, devolver código apropiado
      if (error.message === "Publicación no encontrada") {
        return res.status(404).json({
          success: false,
          error: error.message,
        });
      }

      if (error.message.includes("No tienes permisos")) {
        return res.status(403).json({
          success: false,
          error: error.message,
        });
      }

      next(error);
    }
  },
};
