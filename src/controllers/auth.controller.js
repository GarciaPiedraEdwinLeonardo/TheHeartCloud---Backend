import { authService } from "../services/auth.service.js";

export const authController = {
  // Eliminar usuario no verificado
  async deleteUnverifiedUser(req, res, next) {
    try {
      const { email, userId } = req.body;

      if (!email && !userId) {
        return res.status(400).json({
          success: false,
          error: "Se requiere email o userId",
        });
      }

      const result = await authService.deleteUnverifiedUser(email, userId);

      if (result.success) {
        return res.status(200).json({
          success: true,
          message: "Usuario eliminado exitosamente",
          ...result,
        });
      } else {
        return res.status(207).json({
          success: false,
          message: "Eliminación parcial",
          ...result,
        });
      }
    } catch (error) {
      if (error.message === "Usuario no encontrado") {
        return res.status(404).json({
          success: false,
          error: error.message,
        });
      }

      if (error.message === "El usuario aún no ha expirado") {
        return res.status(400).json({
          success: false,
          error: error.message,
        });
      }

      next(error);
    }
  },

  // Limpiar usuarios expirados (cron job o manual)
  async cleanupExpiredUsers(req, res, next) {
    try {
      const result = await authService.cleanupExpiredUsers();

      return res.status(200).json({
        success: true,
        message: "Limpieza completada",
        ...result,
      });
    } catch (error) {
      next(error);
    }
  },

  // Verificar estado de verificación
  async checkVerificationStatus(req, res, next) {
    try {
      const { userId } = req.params;

      const status = await authService.checkUserVerificationStatus(userId);

      return res.status(200).json({
        success: true,
        data: status,
      });
    } catch (error) {
      if (error.message === "Usuario no encontrado") {
        return res.status(404).json({
          success: false,
          error: error.message,
        });
      }

      next(error);
    }
  },

  // Registrar usuario con email/password
  async register(req, res, next) {
    try {
      const { email, password } = req.body;

      // Validaciones básicas
      if (!email || !password) {
        return res.status(400).json({
          success: false,
          error: "Email y contraseña son requeridos",
        });
      }

      // Validar formato de email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        return res.status(400).json({
          success: false,
          error: "Formato de email inválido",
        });
      }

      // Validar contraseña
      if (password.length < 8 || password.length > 18) {
        return res.status(400).json({
          success: false,
          error: "La contraseña debe tener entre 8 y 18 caracteres",
        });
      }

      const result = await authService.registerUser(email, password);

      return res.status(201).json({
        success: true,
        message: "Usuario registrado exitosamente. Verifica tu email.",
        data: {
          userId: result.userId,
          email: result.email,
          customToken: result.customToken,
          expiresAt: result.expiresAt,
        },
      });
    } catch (error) {
      if (error.message.startsWith("Ya se envió un email")) {
        return res.status(429).json({
          success: false,
          error: error.message,
        });
      }

      if (error.message.includes("ya está registrado")) {
        return res.status(409).json({
          success: false,
          error: error.message,
        });
      }

      next(error);
    }
  },

  // Login/Registro con Google
  async googleAuth(req, res, next) {
    try {
      const { idToken } = req.body;

      if (!idToken) {
        return res.status(400).json({
          success: false,
          error: "Token de Google es requerido",
        });
      }

      const result = await authService.registerOrLoginWithGoogle(idToken);

      return res.status(200).json({
        success: true,
        message: result.isNewUser
          ? "Usuario creado exitosamente"
          : "Login exitoso",
        data: result,
      });
    } catch (error) {
      if (error.code === "auth/invalid-id-token") {
        return res.status(401).json({
          success: false,
          error: "Token de Google inválido",
        });
      }

      next(error);
    }
  },
  async updateLogin(req, res, next) {
    try {
      const { userId } = req.body;

      if (!userId) {
        return res.status(400).json({
          success: false,
          error: "userId es requerido",
        });
      }

      await authService.updateLastLogin(userId);

      return res.status(200).json({
        success: true,
        message: "LastLogin actualizado",
      });
    } catch (error) {
      next(error);
    }
  },
};
