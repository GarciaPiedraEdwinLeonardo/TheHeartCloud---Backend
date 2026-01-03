import express from "express";
import { forumController } from "../controllers/forum.controller.js";
import { verifyFirebaseToken } from "../middleware/auth.middleware.js";

const router = express.Router();

// Todas las rutas de foros requieren autenticación
router.use(verifyFirebaseToken);

// ============= RUTAS BÁSICAS =============

// POST /api/forums - Crear nueva comunidad
router.post("/", forumController.createForum);

// POST /api/forums/check-name - Verificar disponibilidad de nombre
router.post("/check-name", forumController.checkForumName);

// GET /api/forums/:forumId - Obtener datos de un foro
router.get("/:forumId", forumController.getForumData);

// PUT /api/forums/:forumId/settings - Actualizar configuración del foro
router.put("/:forumId/settings", forumController.updateSettings);

// DELETE /api/forums/:forumId - Eliminar comunidad (solo admins)
router.delete("/:forumId", forumController.deleteForum);

// ============= MEMBRESÍA =============

// POST /api/forums/:forumId/join - Unirse a una comunidad
router.post("/:forumId/join", forumController.joinForum);

// POST /api/forums/:forumId/leave - Abandonar comunidad
router.post("/:forumId/leave", forumController.leaveForum);

// POST /api/forums/:forumId/transfer-ownership - Transferir propiedad y abandonar
router.post("/:forumId/transfer-ownership", forumController.transferOwnership);

// ============= GESTIÓN DE MIEMBROS =============

// POST /api/forums/:forumId/members/:userId/approve - Aprobar miembro pendiente
router.post("/:forumId/members/:userId/approve", forumController.approveMember);

// POST /api/forums/:forumId/members/:userId/reject - Rechazar miembro pendiente
router.post("/:forumId/members/:userId/reject", forumController.rejectMember);

// ============= MODERADORES =============

// POST /api/forums/:forumId/moderators/:userId - Agregar moderador
router.post("/:forumId/moderators/:userId", forumController.addModerator);

// DELETE /api/forums/:forumId/moderators/:userId - Remover moderador
router.delete("/:forumId/moderators/:userId", forumController.removeModerator);

// ============= BANEOS =============

// POST /api/forums/:forumId/bans - Banear usuario
router.post("/:forumId/bans", forumController.banUser);

// DELETE /api/forums/:forumId/bans/:userId - Desbanear usuario
router.delete("/:forumId/bans/:userId", forumController.unbanUser);

// GET /api/forums/:forumId/bans/:userId - Verificar si usuario está baneado
router.get("/:forumId/bans/:userId", forumController.checkBanStatus);

// ============= VALIDACIÓN DE POSTS =============

// GET /api/forums/:forumId/pending-posts - Obtener posts pendientes
router.get("/:forumId/pending-posts", forumController.getPendingPosts);

// POST /api/forums/:forumId/posts/:postId/validate - Validar post
router.post("/:forumId/posts/:postId/validate", forumController.validatePost);

// POST /api/forums/:forumId/posts/:postId/reject - Rechazar post
router.post("/:forumId/posts/:postId/reject", forumController.rejectPost);

export default router;
