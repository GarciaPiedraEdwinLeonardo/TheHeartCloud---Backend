import admin from "firebase-admin";
import { config } from "./environment.js";

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(config.firebase),
  });
  console.log("✅ Firebase Admin inicializado");
}

export const db = admin.firestore();
export const auth = admin.auth();
export default admin;
