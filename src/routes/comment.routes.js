import express from "express";
import { commentController } from "../controllers/comment.controller.js";
import { verifyFirebaseToken } from "../middleware/auth.middleware.js";

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(verifyFirebaseToken);

// POST /api/comments - Crear nuevo comentario
router.post("/", commentController.createComment);

// PUT /api/comments/:commentId - Editar comentario
router.put("/:commentId", commentController.editComment);

// DELETE /api/comments/:commentId - Eliminar comentario
router.delete("/:commentId", commentController.deleteComment);

export default router;
