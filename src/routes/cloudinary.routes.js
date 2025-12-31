import express from "express";
import { cloudinaryController } from "../controllers/cloudinary.controller.js";

const router = express.Router();

// POST /api/cloudinary/delete - Eliminar imagen de Cloudinary
router.post("/delete", cloudinaryController.deleteImage);

export default router;
