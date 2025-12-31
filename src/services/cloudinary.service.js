import { config } from "../config/environment.js";

export const cloudinaryService = {
  /**
   * Extrae el public_id de una URL de Cloudinary
   */
  extractPublicId(imageUrl) {
    try {
      // Validar que sea una URL de Cloudinary
      if (!imageUrl.includes("cloudinary.com")) {
        throw new Error("URL de Cloudinary inválida");
      }

      // Extraer el path después de /upload/
      const regex = /\/upload\/(?:v\d+\/)?(.+?)(?:\.[^.]+)?$/;
      const match = imageUrl.match(regex);

      if (match && match[1]) {
        return match[1];
      }

      throw new Error("No se pudo extraer el public_id");
    } catch (error) {
      console.error("Error extrayendo public_id:", error);
      throw error;
    }
  },

  /**
   * Genera la firma (signature) requerida por Cloudinary
   */
  async generateSignature(publicId, timestamp, apiSecret) {
    const stringToSign = `invalidate=true&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;

    // Usar Web Crypto API (disponible en Node.js)
    const encoder = new TextEncoder();
    const data = encoder.encode(stringToSign);
    const hashBuffer = await crypto.subtle.digest("SHA-1", data);

    // Convertir a hexadecimal
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return hashHex;
  },

  /**
   * Elimina una imagen de Cloudinary
   */
  async deleteImage(imageUrl) {
    try {
      // Extraer el public_id
      const publicId = this.extractPublicId(imageUrl);

      // Generar timestamp
      const timestamp = Math.round(Date.now() / 1000);

      // Generar firma
      const signature = await this.generateSignature(
        publicId,
        timestamp,
        config.cloudinary.apiSecret
      );

      // Preparar el body de la petición
      const formData = new URLSearchParams();
      formData.append("public_id", publicId);
      formData.append("timestamp", timestamp.toString());
      formData.append("api_key", config.cloudinary.apiKey);
      formData.append("signature", signature);
      formData.append("invalidate", "true");

      // Hacer la petición a Cloudinary
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${config.cloudinary.cloudName}/image/destroy`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/x-www-form-urlencoded",
          },
          body: formData,
        }
      );

      const data = await response.json();

      if (data.result === "ok" || data.result === "not found") {
        return { success: true, result: data.result };
      } else {
        throw new Error(data.error?.message || "Error desconocido");
      }
    } catch (error) {
      console.error("Error eliminando de Cloudinary:", error);
      throw error;
    }
  },
  async uploadPDF(base64Data, filename) {
    try {
      const { config } = await import("../config/environment.js");

      // Preparar el body de la petición
      const formData = new URLSearchParams();
      formData.append("file", `data:application/pdf;base64,${base64Data}`);
      formData.append("upload_preset", "cedulas");
      formData.append("resource_type", "raw");
      formData.append("folder", "cedulas"); // Organizar en carpeta

      if (filename) {
        formData.append("public_id", `cedulas/${filename}`);
      }

      // Hacer la petición a Cloudinary
      const response = await fetch(
        `https://api.cloudinary.com/v1_1/${config.cloudinary.cloudName}/raw/upload`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Cloudinary error ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      if (!data.secure_url) {
        throw new Error("Cloudinary no devolvió una URL segura");
      }

      return {
        success: true,
        url: data.secure_url,
        publicId: data.public_id,
      };
    } catch (error) {
      console.error("Error subiendo PDF a Cloudinary:", error);
      throw error;
    }
  },
};
