import { initializeApp } from "firebase/app";
import { getAuth, signInWithCustomToken } from "firebase/auth";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import admin from "firebase-admin";
import config from "./firebase-applet-config.json";

// Initialize admin
const account = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT!);
admin.initializeApp({ credential: admin.credential.cert(account) });

const app = initializeApp(config);
const auth = getAuth(app);

(async () => {
    const uid = "test_user_123";
    const customToken = await admin.auth().createCustomToken(uid);
    await signInWithCustomToken(auth, customToken);
    
    console.log("Trying db undefined...");
    try {
        const db1 = getFirestore(app);
        const portalId = "test_portal_id_" + Date.now();
        await setDoc(doc(db1, "public_portals", portalId), { test: 1 });
        console.log("db undefined succeeded!");
    } catch (e: any) {
        console.log("db undefined failed:", e.message);
    }
    
    console.log("Trying db 'default'...");
    try {
        const db2 = getFirestore(app, "default");
        const portalId = "test_portal_id_" + Date.now();
        await setDoc(doc(db2, "public_portals", portalId), { test: 1 });
        console.log("db 'default' succeeded!");
    } catch (e: any) {
        console.log("db 'default' failed:", e.message);
    }
    process.exit(0);
})();
