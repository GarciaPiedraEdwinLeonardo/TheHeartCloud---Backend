import { db } from "../config/firebase.js";
import admin from "../config/firebase.js";

export const firebaseService = {
  // Obtener datos de usuario
  async getUserData(userId) {
    const userDoc = await db.collection("users").doc(userId).get();

    if (!userDoc.exists) {
      throw new Error("Usuario no encontrado");
    }

    return userDoc.data();
  },

  // Verificar permisos de usuario
  async checkUserRole(userId, allowedRoles) {
    const userData = await this.getUserData(userId);

    if (!allowedRoles.includes(userData?.role)) {
      return false;
    }

    return true;
  },

  // Verificar si el foro existe
  async forumExists(forumId) {
    const forumDoc = await db.collection("forums").doc(forumId).get();
    return forumDoc.exists;
  },
};
