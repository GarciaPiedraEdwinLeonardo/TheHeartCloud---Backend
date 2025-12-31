import { cloudinaryService } from "../services/cloudinary.service.js";

export const cloudinaryController = {
  async deleteImage(req, res, next) {
    try {
      const { imageUrl } = req.body;

      // Validar que se envió la URL
      if (!imageUrl) {
        return res.status(400).json({
          success: false,
          error: "imageUrl es requerido",
        });
      }

      // Validar que sea una URL de Cloudinary
      if (!imageUrl.includes("cloudinary.com")) {
        return res.status(400).json({
          success: false,
          error: "URL de Cloudinary inválida",
        });
      }

      // Eliminar la imagen
      const result = await cloudinaryService.deleteImage(imageUrl);

      return res.status(200).json({
        success: true,
        message: "Imagen eliminada correctamente",
        result: result.result,
      });
    } catch (error) {
      console.error("Error eliminando imagen de Cloudinary:", error);

      // Si el error es de public_id inválido, retornar 400
      if (error.message.includes("public_id")) {
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }

      next(error);
    }
  },
};
