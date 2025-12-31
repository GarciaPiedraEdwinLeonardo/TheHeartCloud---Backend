import { db } from "../config/firebase.js";
import admin from "../config/firebase.js";
import { firebaseService } from "./firebase.service.js";
import { notificationService } from "./notification.service.js";

export const postService = {
  async createPost(userId, postData) {
    // 1. Verificar rol del usuario
    const canPost = await firebaseService.checkUserRole(userId, [
      "doctor",
      "moderator",
      "admin",
    ]);

    if (!canPost) {
      throw new Error("Solo usuarios verificados pueden publicar");
    }

    // 2. Verificar que el foro existe
    const forumExists = await firebaseService.forumExists(postData.forumId);
    if (!forumExists) {
      throw new Error("El foro especificado no existe");
    }

    // 3. Crear el post
    const newPost = {
      title: postData.title,
      content: postData.content,
      authorId: userId,
      forumId: postData.forumId,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      updatedAt: null,
      likes: [],
      dislikes: [],
      images: postData.images || [],
      stats: {
        commentCount: 0,
        viewCount: 0,
      },
      status: postData.status || "active",
    };

    const postRef = await db.collection("posts").add(newPost);

    // 4. Actualizar estadísticas si el post está activo
    if (newPost.status === "active") {
      const batch = db.batch();

      // Incrementar contador del foro
      const forumRef = db.collection("forums").doc(postData.forumId);
      batch.update(forumRef, {
        postCount: admin.firestore.FieldValue.increment(1),
        lastPostAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      // Incrementar stats del usuario
      const userRef = db.collection("users").doc(userId);
      batch.update(userRef, {
        "stats.postCount": admin.firestore.FieldValue.increment(1),
        "stats.contributionCount": admin.firestore.FieldValue.increment(1),
      });

      await batch.commit();
    }

    return {
      postId: postRef.id,
      ...newPost,
      createdAt: new Date(), // Para la respuesta
    };
  },

  async editPost(userId, postId, updates) {
    try {
      // 1️⃣ Verificar que el post existe y obtener sus datos
      const postRef = db.collection("posts").doc(postId);
      const postDoc = await postRef.get();

      if (!postDoc.exists) {
        throw new Error("Publicación no encontrada");
      }

      const postData = postDoc.data();

      // 2️⃣ Verificar permisos del usuario
      const userDoc = await db.collection("users").doc(userId).get();
      if (!userDoc.exists) {
        throw new Error("Usuario no encontrado");
      }

      const userData = userDoc.data();
      const isAuthor = postData.authorId === userId;
      const isModeratorOrAdmin = ["moderator", "admin"].includes(
        userData?.role
      );

      // Verificar si es moderador del foro
      let isForumModerator = false;
      if (postData.forumId) {
        const forumDoc = await db
          .collection("forums")
          .doc(postData.forumId)
          .get();
        if (forumDoc.exists) {
          const forumData = forumDoc.data();
          isForumModerator =
            forumData.moderators && forumData.moderators[userId];
        }
      }

      // Verificar permisos
      if (!isAuthor && !isModeratorOrAdmin && !isForumModerator) {
        throw new Error("No tienes permisos para editar esta publicación");
      }

      // 3️⃣ Procesar imágenes (si se enviaron actualizaciones)
      if (updates.images !== undefined) {
        const oldImages = postData.images || [];
        const newImages = updates.images || [];

        // Encontrar imágenes que se eliminaron
        const newImageUrls = newImages.map((img) => img.url);
        const imagesToDelete = oldImages.filter(
          (img) => !newImageUrls.includes(img.url)
        );

        // Eliminar imágenes antiguas de Cloudinary
        if (imagesToDelete.length > 0) {
          // Importar el servicio de Cloudinary
          const { cloudinaryService } = await import("./cloudinary.service.js");

          // Eliminar cada imagen en paralelo (no bloqueante)
          const deletionPromises = imagesToDelete.map(async (image) => {
            try {
              await cloudinaryService.deleteImage(image.url);
              console.log("✅ Imagen eliminada de Cloudinary:", image.url);
            } catch (err) {
              console.error("⚠️ Error eliminando imagen (continuando):", err);
              // No fallar la edición si falla la eliminación de imagen
            }
          });

          // Ejecutar todas las eliminaciones en paralelo
          await Promise.allSettled(deletionPromises);
        }
      }

      // 4️⃣ Preparar datos actualizados
      const updateData = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      };

      // Solo actualizar campos que se enviaron
      if (updates.title !== undefined) updateData.title = updates.title;
      if (updates.content !== undefined) updateData.content = updates.content;
      if (updates.images !== undefined) updateData.images = updates.images;

      // 5️⃣ Actualizar el post
      await postRef.update(updateData);

      // 6️⃣ Obtener el post actualizado
      const updatedPostDoc = await postRef.get();
      const updatedPostData = updatedPostDoc.data();

      return {
        postId: postId,
        ...updatedPostData,
        updatedAt: new Date(),
      };
    } catch (error) {
      console.error("Error editando post:", error);
      throw error;
    }
  },
  async deletePost(userId, postId) {
    try {
      // 1️⃣ Verificar que el post existe y obtener sus datos
      const postRef = db.collection("posts").doc(postId);
      const postDoc = await postRef.get();

      if (!postDoc.exists) {
        throw new Error("Publicación no encontrada");
      }

      const postData = postDoc.data();

      // 2️⃣ Verificar permisos del usuario
      const userDoc = await db.collection("users").doc(userId).get();
      if (!userDoc.exists) {
        throw new Error("Usuario no encontrado");
      }

      const userData = userDoc.data();
      const isAuthor = postData.authorId === userId;
      const isModeratorOrAdmin = ["moderator", "admin"].includes(
        userData?.role
      );

      // Verificar si es moderador del foro
      let isForumModerator = false;
      if (postData.forumId) {
        const forumDoc = await db
          .collection("forums")
          .doc(postData.forumId)
          .get();
        if (forumDoc.exists) {
          const forumData = forumDoc.data();
          isForumModerator =
            forumData.moderators && forumData.moderators[userId];
        }
      }

      // Verificar permisos
      if (!isAuthor && !isModeratorOrAdmin && !isForumModerator) {
        throw new Error("No tienes permisos para eliminar esta publicación");
      }

      // Determinar si es eliminación por moderador (para notificación)
      const isModeratorDeletion =
        !isAuthor && (isModeratorOrAdmin || isForumModerator);

      // 3️⃣ PRIMERO: Obtener y contar comentarios del post
      const commentsSnapshot = await db
        .collection("comments")
        .where("postId", "==", postId)
        .get();

      const authorsMap = new Map();

      // Contar comentarios por autor
      commentsSnapshot.forEach((commentDoc) => {
        const commentData = commentDoc.data();
        const authorId = commentData.authorId;
        if (authorId) {
          authorsMap.set(authorId, (authorsMap.get(authorId) || 0) + 1);
        }
      });

      const deletedCommentsCount = commentsSnapshot.size;

      // 4️⃣ SEGUNDO: Eliminar comentarios del post
      const batch = db.batch();
      commentsSnapshot.forEach((commentDoc) => {
        batch.delete(commentDoc.ref);
      });
      await batch.commit();

      // 5️⃣ TERCERO: Eliminar imágenes del post de Cloudinary
      const deletedImagesCount = postData.images?.length || 0;
      if (postData.images && postData.images.length > 0) {
        const { cloudinaryService } = await import("./cloudinary.service.js");

        const deletionPromises = postData.images.map(async (image) => {
          try {
            await cloudinaryService.deleteImage(image.url);
            console.log("✅ Imagen eliminada:", image.url);
          } catch (err) {
            console.error("⚠️ Error eliminando imagen:", err);
          }
        });

        await Promise.allSettled(deletionPromises);
      }

      // 6️⃣ CUARTO: Actualizar estadísticas de autores de comentarios
      // ✅ SOLO SI EL USUARIO EXISTE
      let updatedAuthorsCount = 0;
      if (deletedCommentsCount > 0) {
        const statsBatch = db.batch();

        for (const [authorId, commentCount] of authorsMap) {
          try {
            // Verificar si el usuario existe antes de actualizar
            const authorRef = db.collection("users").doc(authorId);
            const authorDoc = await authorRef.get();

            if (authorDoc.exists) {
              statsBatch.update(authorRef, {
                "stats.commentCount": admin.firestore.FieldValue.increment(
                  -commentCount
                ),
                "stats.contributionCount": admin.firestore.FieldValue.increment(
                  -commentCount
                ),
              });
              updatedAuthorsCount++;
            } else {
              console.warn(
                `⚠️ Usuario ${authorId} no existe, omitiendo actualización de stats`
              );
            }
          } catch (error) {
            console.error(
              `⚠️ Error verificando usuario ${authorId}:`,
              error.message
            );
            // Continuar con los demás usuarios
          }
        }

        // Solo hacer commit si hay actualizaciones
        if (updatedAuthorsCount > 0) {
          await statsBatch.commit();
        }
      }

      // 7️⃣ QUINTO: Eliminar el post y actualizar contadores
      const finalBatch = db.batch();

      // Eliminar post
      finalBatch.delete(postRef);

      // Actualizar contador del foro (solo si estaba activo)
      if (postData.status === "active" && postData.forumId) {
        try {
          const forumRef = db.collection("forums").doc(postData.forumId);
          const forumDoc = await forumRef.get();

          if (forumDoc.exists) {
            finalBatch.update(forumRef, {
              postCount: admin.firestore.FieldValue.increment(-1),
            });
          } else {
            console.warn(`⚠️ Foro ${postData.forumId} no existe`);
          }
        } catch (error) {
          console.error(`⚠️ Error verificando foro:`, error.message);
        }
      }

      // Actualizar estadísticas del autor del post
      // ✅ SOLO SI EL USUARIO EXISTE
      if (postData.authorId && postData.status === "active") {
        try {
          const authorRef = db.collection("users").doc(postData.authorId);
          const authorDoc = await authorRef.get();

          if (authorDoc.exists) {
            finalBatch.update(authorRef, {
              "stats.postCount": admin.firestore.FieldValue.increment(-1),
              "stats.contributionCount":
                admin.firestore.FieldValue.increment(-1),
            });
          } else {
            console.warn(
              `⚠️ Autor ${postData.authorId} no existe, omitiendo actualización de stats`
            );
          }
        } catch (error) {
          console.error(`⚠️ Error verificando autor del post:`, error.message);
        }
      }

      await finalBatch.commit();

      // 8️⃣ SEXTO: Enviar notificación si es eliminación por moderador
      // ✅ VERIFICAR QUE EL AUTOR EXISTE ANTES DE NOTIFICAR
      if (
        isModeratorDeletion &&
        postData.authorId &&
        postData.authorId !== userId
      ) {
        try {
          // Verificar que el usuario destinatario existe
          const recipientDoc = await db
            .collection("users")
            .doc(postData.authorId)
            .get();

          if (recipientDoc.exists) {
            await notificationService.sendPostDeletedByModerator(
              postData.authorId,
              postData.title || "tu publicación"
            );
            console.log(
              "✅ Notificación enviada: Post eliminado por moderador"
            );
          } else {
            console.warn(
              `⚠️ No se envió notificación: usuario ${postData.authorId} no existe`
            );
          }
        } catch (notifError) {
          console.error("⚠️ Error enviando notificación:", notifError);
          // No lanzar error, la eliminación fue exitosa
        }
      }

      return {
        success: true,
        deletedComments: deletedCommentsCount,
        updatedAuthors: updatedAuthorsCount,
        deletedImages: deletedImagesCount,
        moderatorDeletion: isModeratorDeletion,
      };
    } catch (error) {
      console.error("❌ Error eliminando post:", error);
      throw error;
    }
  },
};
