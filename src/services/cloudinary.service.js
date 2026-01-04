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

      // Para archivos raw (PDFs), MANTENER LA EXTENSIÓN
      if (imageUrl.includes("/raw/upload/")) {
        // Ejemplo: https://res.cloudinary.com/xxx/raw/upload/v123/archivo.pdf
        // Necesitamos: archivo.pdf (CON extensión)
        const regex = /\/raw\/upload\/(?:v\d+\/)?(.+)$/;
        const match = imageUrl.match(regex);

        if (match && match[1]) {
          return match[1]; // Retorna "archivo.pdf" completo
        }
      }

      // Para imágenes normales (SIN extensión)
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
    // La firma para destroy NUNCA incluye resource_type, solo estos parámetros en orden alfabético
    const stringToSign = `public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;

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
   * Elimina una imagen o PDF de Cloudinary
   */
  async deleteImage(imageUrl) {
    try {
      // Extraer el public_id
      const publicId = this.extractPublicId(imageUrl);

      // Determinar si es un archivo raw (PDF) o imagen
      const isRawFile =
        imageUrl.includes("/raw/upload/") || imageUrl.includes(".pdf");
      const resourceType = isRawFile ? "raw" : "image";

      // Generar timestamp
      const timestamp = Math.round(Date.now() / 1000);

      // Generar firma (sin resource_type)
      const signature = await this.generateSignature(
        publicId,
        timestamp,
        config.cloudinary.apiSecret
      );

      // Preparar el body de la petición EN ORDEN ALFABÉTICO
      const formData = new URLSearchParams();
      formData.append("api_key", config.cloudinary.apiKey);
      formData.append("public_id", publicId);
      formData.append("signature", signature);
      formData.append("timestamp", timestamp.toString());

      // Hacer la petición a Cloudinary con el endpoint correcto
      const endpoint = `https://api.cloudinary.com/v1_1/${config.cloudinary.cloudName}/${resourceType}/destroy`;

      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData,
      });

      const data = await response.json();

      if (data.result === "ok" || data.result === "not found") {
        return { success: true, result: data.result };
      } else {
        console.error("❌ Error en respuesta de Cloudinary:", data);
        throw new Error(data.error?.message || "Error desconocido al eliminar");
      }
    } catch (error) {
      console.error("❌ Error eliminando de Cloudinary:", error);
      throw error;
    }
  },
};
