import express from "express";
import { postController } from "../controllers/post.controller.js";
import { verifyFirebaseToken } from "../middleware/auth.middleware.js";
import {
  validateCreatePost,
  validateEditPost,
} from "../middleware/validateRequest.js";

const router = express.Router();

// POST /api/posts - Crear nuevo post
router.post(
  "/",
  verifyFirebaseToken, // 1. Verificar autenticación
  validateCreatePost, // 2. Validar datos
  postController.createPost // 3. Crear post
);

// PUT /api/posts/:postId - Editar post existente
router.put(
  "/:postId",
  verifyFirebaseToken, // 1. Verificar autenticación
  validateEditPost, // 2. Validar datos
  postController.editPost // 3. Editar post
);

// DELETE /api/posts/:postId - Eliminar post
router.delete(
  "/:postId",
  verifyFirebaseToken, // 1. Verificar autenticación
  postController.deletePost // 2. Eliminar post
);

export default router;
