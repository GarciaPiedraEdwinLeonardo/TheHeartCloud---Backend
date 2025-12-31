export const validateCreatePost = (req, res, next) => {
  const { title, content, forumId } = req.body;

  const errors = [];

  if (!title || title.trim().length === 0) {
    errors.push("El título es requerido");
  }

  if (title && title.length > 200) {
    errors.push("El título no puede superar 200 caracteres");
  }

  if (!content || content.trim().length === 0) {
    errors.push("El contenido es requerido");
  }

  if (!forumId || forumId.trim().length === 0) {
    errors.push("El ID del foro es requerido");
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      errors,
    });
  }

  next();
};

export const validateEditPost = (req, res, next) => {
  const { title, content, images } = req.body;
  const errors = [];

  // Validar título (si se envía)
  if (title !== undefined) {
    if (typeof title !== "string") {
      errors.push("El título debe ser una cadena de texto");
    } else if (title.trim().length === 0) {
      errors.push("El título no puede estar vacío");
    } else if (title.length > 200) {
      errors.push("El título no puede superar 200 caracteres");
    }
  }

  // Validar contenido (si se envía)
  if (content !== undefined) {
    if (typeof content !== "string") {
      errors.push("El contenido debe ser una cadena de texto");
    } else if (content.trim().length === 0) {
      errors.push("El contenido no puede estar vacío");
    } else if (content.length > 10000) {
      errors.push("El contenido no puede superar 10000 caracteres");
    }
  }

  // Validar imágenes (si se envían)
  if (images !== undefined) {
    if (!Array.isArray(images)) {
      errors.push("Las imágenes deben ser un array");
    } else if (images.length > 1) {
      errors.push("Máximo 1 imagen permitida");
    }
  }

  if (errors.length > 0) {
    return res.status(400).json({
      success: false,
      errors,
    });
  }

  next();
};
