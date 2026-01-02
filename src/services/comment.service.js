import { db } from "../config/firebase.js";
import admin from "../config/firebase.js";

export const commentService = {
  /**
   * Crear nuevo comentario
   */
  async createComment(userId, commentData) {
    try {
      // 1. Verificar que el usuario puede comentar
      const userDoc = await db.collection("users").doc(userId).get();

      if (!userDoc.exists) {
        throw new Error("Usuario no encontrado");
      }

      const userData = userDoc.data();
      if (!["doctor", "moderator", "admin"].includes(userData?.role)) {
        throw new Error("Solo usuarios verificados pueden comentar");
      }

      // 2. Verificar que el post existe
      const postDoc = await db
        .collection("posts")
        .doc(commentData.postId)
        .get();
      if (!postDoc.exists) {
        throw new Error("Post no encontrado");
      }

      // 3. Crear el comentario
      const newComment = {
        content: commentData.content,
        authorId: userId,
        postId: commentData.postId,
        parentCommentId: commentData.parentCommentId || null,
        likes: [],
        likeCount: 0,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: null,
        editHistory: [],
      };

      const commentRef = await db.collection("comments").add(newComment);

      // 4. Actualizar contadores usando batch
      const batch = db.batch();

      // Incrementar contador en el post
      const postRef = db.collection("posts").doc(commentData.postId);
      batch.update(postRef, {
        "stats.commentCount": admin.firestore.FieldValue.increment(1),
      });

      // Incrementar stats del usuario
      const userRef = db.collection("users").doc(userId);
      batch.update(userRef, {
        "stats.commentCount": admin.firestore.FieldValue.increment(1),
        "stats.contributionCount": admin.firestore.FieldValue.increment(1),
      });

      await batch.commit();

      return {
        commentId: commentRef.id,
        ...newComment,
        createdAt: new Date(),
      };
    } catch (error) {
      console.error("Error creando comentario:", error);
      throw error;
    }
  },

  /**
   * Editar comentario (solo el autor)
   */
  async editComment(userId, commentId, newContent) {
    try {
      // 1. Verificar que el comentario existe
      const commentRef = db.collection("comments").doc(commentId);
      const commentDoc = await commentRef.get();

      if (!commentDoc.exists) {
        throw new Error("Comentario no encontrado");
      }

      const commentData = commentDoc.data();

      // 2. Verificar que el usuario es el autor
      if (commentData.authorId !== userId) {
        throw new Error("Solo el autor puede editar el comentario");
      }

      // 3. Actualizar el comentario
      await commentRef.update({
        content: newContent,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return {
        commentId: commentId,
        content: newContent,
        updatedAt: new Date(),
      };
    } catch (error) {
      console.error("Error editando comentario:", error);
      throw error;
    }
  },

  /**
   * Eliminar comentario y todas sus respuestas
   */
  async deleteComment(userId, commentId) {
    try {
      // 1. Verificar permisos
      const commentRef = db.collection("comments").doc(commentId);
      const commentDoc = await commentRef.get();

      if (!commentDoc.exists) {
        throw new Error("Comentario no encontrado");
      }

      const commentData = commentDoc.data();

      // Verificar permisos del usuario
      const userDoc = await db.collection("users").doc(userId).get();
      const userData = userDoc.data();

      const isAuthor = commentData.authorId === userId;
      const isModeratorOrAdmin = ["moderator", "admin"].includes(
        userData?.role
      );

      // Verificar si es moderador del foro
      let isForumModerator = false;
      if (commentData.postId) {
        const postDoc = await db
          .collection("posts")
          .doc(commentData.postId)
          .get();
        if (postDoc.exists) {
          const postData = postDoc.data();
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
      }

      if (!isAuthor && !isModeratorOrAdmin && !isForumModerator) {
        throw new Error("No tienes permisos para eliminar este comentario");
      }

      const isModeratorAction = !isAuthor;

      // 2. Eliminar recursivamente el comentario y sus respuestas
      const totalDeleted = await this.deleteCommentRecursive(commentId, userId);

      // 3. Actualizar contador del post
      await db
        .collection("posts")
        .doc(commentData.postId)
        .update({
          "stats.commentCount": admin.firestore.FieldValue.increment(
            -totalDeleted
          ),
        });

      return {
        success: true,
        deletedCount: totalDeleted,
        isModeratorAction: isModeratorAction,
      };
    } catch (error) {
      console.error("Error eliminando comentario:", error);
      throw error;
    }
  },

  /**
   * Función auxiliar recursiva para eliminar comentarios
   */
  async deleteCommentRecursive(commentId, requestingUserId) {
    try {
      // 1. Obtener el comentario actual
      const commentRef = db.collection("comments").doc(commentId);
      const commentDoc = await commentRef.get();

      if (!commentDoc.exists) {
        return 0;
      }

      const commentData = commentDoc.data();
      let totalDeleted = 0;

      // 2. Buscar y eliminar todas las respuestas
      const repliesSnapshot = await db
        .collection("comments")
        .where("parentCommentId", "==", commentId)
        .get();

      for (const replyDoc of repliesSnapshot.docs) {
        totalDeleted += await this.deleteCommentRecursive(
          replyDoc.id,
          requestingUserId
        );
      }

      // 3. Eliminar el comentario actual
      await commentRef.delete();

      // 4. Actualizar estadísticas del autor
      const authorId = commentData.authorId;
      const authorRef = db.collection("users").doc(authorId);
      const authorDoc = await authorRef.get();

      if (authorDoc.exists) {
        const updateData = {
          "stats.commentCount": admin.firestore.FieldValue.increment(-1),
          "stats.contributionCount": admin.firestore.FieldValue.increment(-1),
        };
        await authorRef.update(updateData);
      }

      return totalDeleted + 1;
    } catch (error) {
      console.error(`Error eliminando comentario ${commentId}:`, error);
      return 0;
    }
  },
};
