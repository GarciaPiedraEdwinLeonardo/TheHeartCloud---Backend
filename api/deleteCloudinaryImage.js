export default async function handler(req, res) {
  // Configurar CORS headers
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,OPTIONS,PATCH,DELETE,POST,PUT"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version"
  );

  // Manejar OPTIONS request (preflight)
  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  // Solo permitir POST para la funcionalidad real
  if (req.method !== "POST") {
    return res.status(405).json({
      success: false,
      error: "Método no permitido",
    });
  }

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

    // Extraer el public_id de la URL
    const publicId = extractPublicId(imageUrl);

    if (!publicId) {
      return res.status(400).json({
        success: false,
        error: "No se pudo extraer el public_id de la URL",
      });
    }

    // Verificar que las variables de entorno estén configuradas
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;

    if (!cloudName || !apiKey || !apiSecret) {
      return res.status(500).json({
        success: false,
        error: "Cloudinary no está configurado correctamente",
      });
    }

    // Llamar a la API de Cloudinary para eliminar la imagen
    const result = await deleteFromCloudinary(
      publicId,
      cloudName,
      apiKey,
      apiSecret
    );

    if (result.success) {
      return res.status(200).json({
        success: true,
        message: "Imagen eliminada correctamente",
        result: result.result,
      });
    } else {
      return res.status(500).json({
        success: false,
        error: result.error || "No se pudo eliminar la imagen",
      });
    }
  } catch (error) {
    console.error("Error en deleteCloudinaryImage:", error);
    return res.status(500).json({
      success: false,
      error: "Error del servidor al eliminar la imagen",
    });
  }
}

/**
 * Extrae el public_id de una URL de Cloudinary
 * Ejemplo: https://res.cloudinary.com/demo/image/upload/v1234567890/sample.jpg
 * Retorna: sample
 */
function extractPublicId(imageUrl) {
  try {
    // Extraer el path después de /upload/
    const regex = /\/upload\/(?:v\d+\/)?(.+?)(?:\.[^.]+)?$/;
    const match = imageUrl.match(regex);

    if (match && match[1]) {
      return match[1];
    }

    return null;
  } catch (error) {
    console.error("Error extrayendo public_id:", error);
    return null;
  }
}

/**
 * Elimina una imagen de Cloudinary usando la API REST
 */
async function deleteFromCloudinary(publicId, cloudName, apiKey, apiSecret) {
  try {
    // Generar el timestamp
    const timestamp = Math.round(Date.now() / 1000);

    // Crear la firma (signature)
    const signature = await generateSignature(publicId, timestamp, apiSecret);

    // Preparar el body de la petición
    const formData = new URLSearchParams();
    formData.append("public_id", publicId);
    formData.append("timestamp", timestamp.toString());
    formData.append("api_key", apiKey);
    formData.append("signature", signature);
    formData.append("invalidate", "true"); // Invalida el cache del CDN

    // Hacer la petición a Cloudinary
    const response = await fetch(
      `https://api.cloudinary.com/v1_1/${cloudName}/image/destroy`,
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
      return {
        success: false,
        error: data.error?.message || "Error desconocido",
      };
    }
  } catch (error) {
    console.error("Error eliminando de Cloudinary:", error);
    return { success: false, error: error.message };
  }
}

/**
 * Genera la firma (signature) requerida por Cloudinary
 */
async function generateSignature(publicId, timestamp, apiSecret) {
  // Crear el string a firmar
  const stringToSign = `invalidate=true&public_id=${publicId}&timestamp=${timestamp}${apiSecret}`;

  // Usar Web Crypto API (disponible en Vercel)
  const encoder = new TextEncoder();
  const data = encoder.encode(stringToSign);
  const hashBuffer = await crypto.subtle.digest("SHA-1", data);

  // Convertir a hexadecimal
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return hashHex;
}
