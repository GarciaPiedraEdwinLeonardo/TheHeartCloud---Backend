import express from "express";
import postRoutes from "./post.routes.js";
import cloudinaryRoutes from "./cloudinary.routes.js";
import notificationRoutes from "./notification.routes.js";
import authRoutes from "./auth.routes.js";
import verificationRoutes from "./verification.routes.js";
import commentRoutes from "./comment.routes.js";
import reportRoutes from "./report.routes.js";
import forumRoutes from "./forum.routes.js";

const router = express.Router();

// Health check
router.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Backend funcionando ✅",
    timestamp: new Date().toISOString(),
  });
});

// Rutas
router.use("/posts", postRoutes);
router.use("/cloudinary", cloudinaryRoutes);
router.use("/notifications", notificationRoutes);
router.use("/auth", authRoutes);
router.use("/verification", verificationRoutes);
router.use("/comments", commentRoutes);
router.use("/reports", reportRoutes);
router.use("/forums", forumRoutes);

export default router;
