import admin from "firebase-admin";
import { getFirestore, Firestore } from "firebase-admin/firestore";
import fs from "fs";
import path from "path";

let cachedDb: Firestore | null = null;

export function getAdminFirestore(): Firestore {
  if (cachedDb) return cachedDb;

  let firebaseConfig: any = {};
  try {
    const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
    if (fs.existsSync(configPath)) {
      firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    }
  } catch (e) {
    console.warn("[AdminDB] Error loading firebase-applet-config.json:", e);
  }

  let adminApp: admin.app.App;
  if (!admin.apps.length) {
    let serviceAccount: any = null;
    if (process.env.FIREBASE_SERVICE_ACCOUNT) {
      try {
        serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      } catch (e) {
        console.error("[AdminDB] Failed to parse FIREBASE_SERVICE_ACCOUNT JSON", e);
      }
    }

    if (serviceAccount) {
      adminApp = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        projectId: firebaseConfig.projectId || serviceAccount.project_id
      });
    } else {
      adminApp = admin.initializeApp();
    }
  } else {
    adminApp = admin.apps[0]!;
  }

  const databaseId = firebaseConfig.firestoreDatabaseId &&
    firebaseConfig.firestoreDatabaseId !== "(default)" &&
    firebaseConfig.firestoreDatabaseId !== "default"
      ? firebaseConfig.firestoreDatabaseId
      : undefined;

  cachedDb = databaseId ? getFirestore(adminApp, databaseId) : getFirestore(adminApp);
  return cachedDb;
}
