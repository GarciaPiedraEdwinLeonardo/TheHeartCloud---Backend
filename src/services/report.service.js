import { db } from "../config/firebase.js";
import admin from "../config/firebase.js";
import { postService } from "./post.service.js";
import { commentService } from "./comment.service.js";

export const reportService = {
  /**
   * Crear un nuevo reporte
   */
  async createReport(userId, reportData) {
    try {
      // 1. Verificar que el usuario existe y obtener sus datos
      const userDoc = await db.collection("users").doc(userId).get();
      if (!userDoc.exists) {
        throw new Error("Usuario no encontrado");
      }

      const userData = userDoc.data();
      const reporterName = userData.name
        ? `${userData.name.name || ""} ${userData.name.apellidopat || ""} ${
            userData.name.apellidomat || ""
          }`.trim()
        : userData.email || "Usuario";

      // 2. Verificar que el contenido reportado existe
      const contentExists = await this.verifyContentExists(
        reportData.type,
        reportData.targetId
      );

      if (!contentExists) {
        throw new Error(
          `El ${this.getContentTypeName(
            reportData.type
          )} no existe o fue eliminado`
        );
      }

      // 3. Obtener información adicional del contenido
      const contentInfo = await this.getContentInfo(
        reportData.type,
        reportData.targetId
      );

      // 4. Crear el reporte
      const reportWithMetadata = {
        type: reportData.type,
        targetId: reportData.targetId,
        targetName: reportData.targetName || contentInfo.targetName,

        // Información del reporter
        reporterId: userId,
        reporterName: reporterName,
        reporterEmail: userData.email,

        // Detalles del reporte
        reason: reportData.reason,
        description: reportData.description.trim(),
        urgency: reportData.urgency || "medium",

        // Información contextual
        ...(contentInfo.targetAuthorId && {
          targetAuthorId: contentInfo.targetAuthorId,
        }),
        ...(contentInfo.targetAuthorName && {
          targetAuthorName: contentInfo.targetAuthorName,
        }),
        ...(contentInfo.forumId && { forumId: contentInfo.forumId }),
        ...(contentInfo.forumName && { forumName: contentInfo.forumName }),
        ...(contentInfo.postId && { postId: contentInfo.postId }),
        ...(contentInfo.postTitle && { postTitle: contentInfo.postTitle }),

        // Metadata
        status: "pending",
        assignedModerator: null,
        resolution: null,
        resolvedAt: null,
        resolvedBy: null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      const reportRef = await db.collection("reports").add(reportWithMetadata);

      return {
        reportId: reportRef.id,
        ...reportWithMetadata,
        createdAt: new Date(),
      };
    } catch (error) {
      console.error("Error creando reporte:", error);
      throw error;
    }
  },

  /**
   * Obtener reportes con filtros
   */
  async getReports(userId, filters = {}) {
    try {
      // Verificar permisos del usuario
      const userDoc = await db.collection("users").doc(userId).get();
      if (!userDoc.exists) {
        throw new Error("Usuario no encontrado");
      }

      const userData = userDoc.data();
      const isModerator = ["moderator", "admin"].includes(userData.role);

      if (!isModerator) {
        throw new Error("No tienes permisos para ver los reportes");
      }

      // Construir query
      let query = db.collection("reports");

      // Aplicar filtros
      if (filters.status) {
        query = query.where("status", "==", filters.status);
      }

      if (filters.type) {
        query = query.where("type", "==", filters.type);
      }

      query = query.orderBy("createdAt", "desc");

      const snapshot = await query.get();

      const reports = [];
      snapshot.forEach((doc) => {
        reports.push({
          id: doc.id,
          ...doc.data(),
        });
      });

      return reports;
    } catch (error) {
      console.error("Error obteniendo reportes:", error);
      throw error;
    }
  },

  /**
   * Resolver reporte
   */
  async resolveReport(userId, reportId, resolution) {
    try {
      // Verificar permisos
      await this.verifyModeratorPermissions(userId);

      // Verificar que el reporte existe
      const reportRef = db.collection("reports").doc(reportId);
      const reportDoc = await reportRef.get();

      if (!reportDoc.exists) {
        throw new Error("Reporte no encontrado");
      }

      // Actualizar reporte
      await reportRef.update({
        status: "resolved",
        resolution: resolution,
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        resolvedBy: userId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        reportId: reportId,
        status: "resolved",
      };
    } catch (error) {
      console.error("Error resolviendo reporte:", error);
      throw error;
    }
  },

  /**
   * Desestimar reporte
   */
  async dismissReport(userId, reportId, reason) {
    try {
      // Verificar permisos
      await this.verifyModeratorPermissions(userId);

      // Verificar que el reporte existe
      const reportRef = db.collection("reports").doc(reportId);
      const reportDoc = await reportRef.get();

      if (!reportDoc.exists) {
        throw new Error("Reporte no encontrado");
      }

      // Actualizar reporte
      await reportRef.update({
        status: "dismissed",
        resolution: reason,
        resolvedAt: admin.firestore.FieldValue.serverTimestamp(),
        resolvedBy: userId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        reportId: reportId,
        status: "dismissed",
      };
    } catch (error) {
      console.error("Error desestimando reporte:", error);
      throw error;
    }
  },

  /**
   * Eliminar contenido reportado
   */
  async deleteReportedContent(userId, reportId) {
    try {
      // Verificar permisos
      await this.verifyModeratorPermissions(userId);
      // Obtener información del reporte
      const reportDoc = await db.collection("reports").doc(reportId).get();

      if (!reportDoc.exists) {
        throw new Error("Reporte no encontrado");
      }

      const reportData = reportDoc.data();
      const { type, targetId } = reportData;

      // Verificar que el contenido existe
      const contentExists = await this.verifyContentExists(type, targetId);
      if (!contentExists) {
        throw new Error(`El contenido ya no existe o fue eliminado`);
      }

      let result;

      // Eliminar según el tipo de contenido
      if (type === "post") {
        result = await postService.deletePost(userId, targetId);
      } else if (type === "comment") {
        result = await commentService.deleteComment(userId, targetId);
      } else {
        throw new Error("Tipo de contenido no soportado para eliminación");
      }

      // Resolver el reporte automáticamente
      await this.resolveReport(
        userId,
        reportId,
        "Contenido eliminado por moderador"
      );

      return {
        success: true,
        deletedContent: type,
        ...result,
      };
    } catch (error) {
      console.error("Error eliminando contenido reportado:", error);
      throw error;
    }
  },

  /**
   * Funciones auxiliares
   */

  async verifyModeratorPermissions(userId) {
    const userDoc = await db.collection("users").doc(userId).get();

    if (!userDoc.exists) {
      throw new Error("Usuario no encontrado");
    }

    const userData = userDoc.data();
    const isModerator = ["moderator", "admin"].includes(userData.role);

    if (!isModerator) {
      throw new Error("No tienes permisos para realizar esta acción");
    }

    return true;
  },

  async verifyContentExists(type, targetId) {
    try {
      let doc;

      switch (type) {
        case "post":
          doc = await db.collection("posts").doc(targetId).get();
          break;
        case "comment":
          doc = await db.collection("comments").doc(targetId).get();
          break;
        case "user":
        case "profile":
          doc = await db.collection("users").doc(targetId).get();
          break;
        case "forum":
          doc = await db.collection("forums").doc(targetId).get();
          break;
        default:
          return false;
      }

      return doc.exists;
    } catch (error) {
      console.error("Error verificando existencia:", error);
      return false;
    }
  },

  async getContentInfo(type, targetId) {
    const info = {};

    try {
      switch (type) {
        case "post": {
          const postDoc = await db.collection("posts").doc(targetId).get();
          if (postDoc.exists) {
            const postData = postDoc.data();
            info.targetName = postData.title || "Publicación sin título";
            info.targetAuthorId = postData.authorId;
            info.forumId = postData.forumId;

            // Obtener nombre del autor
            if (postData.authorId) {
              const authorDoc = await db
                .collection("users")
                .doc(postData.authorId)
                .get();
              if (authorDoc.exists) {
                const authorData = authorDoc.data();
                info.targetAuthorName = authorData.name
                  ? `${authorData.name.name || ""} ${
                      authorData.name.apellidopat || ""
                    } ${authorData.name.apellidomat || ""}`.trim()
                  : authorData.email || "Usuario";
              }
            }

            // Obtener nombre del foro
            if (postData.forumId) {
              const forumDoc = await db
                .collection("forums")
                .doc(postData.forumId)
                .get();
              if (forumDoc.exists) {
                info.forumName = forumDoc.data().name;
              }
            }
          }
          break;
        }

        case "comment": {
          const commentDoc = await db
            .collection("comments")
            .doc(targetId)
            .get();
          if (commentDoc.exists) {
            const commentData = commentDoc.data();
            info.targetName = "Comentario";
            info.targetAuthorId = commentData.authorId;
            info.postId = commentData.postId;

            // Obtener nombre del autor
            if (commentData.authorId) {
              const authorDoc = await db
                .collection("users")
                .doc(commentData.authorId)
                .get();
              if (authorDoc.exists) {
                const authorData = authorDoc.data();
                info.targetAuthorName = authorData.name
                  ? `${authorData.name.name || ""} ${
                      authorData.name.apellidopat || ""
                    } ${authorData.name.apellidomat || ""}`.trim()
                  : authorData.email || "Usuario";
              }
            }

            // Obtener título del post
            if (commentData.postId) {
              const postDoc = await db
                .collection("posts")
                .doc(commentData.postId)
                .get();
              if (postDoc.exists) {
                info.postTitle = postDoc.data().title;
              }
            }
          }
          break;
        }

        case "user":
        case "profile": {
          const userDoc = await db.collection("users").doc(targetId).get();
          if (userDoc.exists) {
            const userData = userDoc.data();
            info.targetName = userData.name
              ? `${userData.name.name || ""} ${
                  userData.name.apellidopat || ""
                } ${userData.name.apellidomat || ""}`.trim()
              : userData.email || "Usuario";
            info.targetAuthorId = targetId;
            info.targetAuthorName = info.targetName;
          }
          break;
        }

        case "forum": {
          const forumDoc = await db.collection("forums").doc(targetId).get();
          if (forumDoc.exists) {
            const forumData = forumDoc.data();
            info.targetName = forumData.name || "Comunidad";
            info.targetAuthorId = forumData.ownerId;

            if (forumData.ownerId) {
              const ownerDoc = await db
                .collection("users")
                .doc(forumData.ownerId)
                .get();
              if (ownerDoc.exists) {
                const ownerData = ownerDoc.data();
                info.targetAuthorName = ownerData.name
                  ? `${ownerData.name.name || ""} ${
                      ownerData.name.apellidopat || ""
                    } ${ownerData.name.apellidomat || ""}`.trim()
                  : ownerData.email || "Usuario";
              }
            }
          }
          break;
        }
      }
    } catch (error) {
      console.error("Error obteniendo información del contenido:", error);
    }

    return info;
  },

  getContentTypeName(type) {
    const names = {
      post: "publicación",
      comment: "comentario",
      user: "usuario",
      profile: "perfil",
      forum: "comunidad",
    };
    return names[type] || "contenido";
  },
};
