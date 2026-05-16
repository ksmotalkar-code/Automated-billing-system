import { initializeApp } from "firebase/app";
import { getFirestore, doc, setDoc } from "firebase/firestore";
import config from "./firebase-applet-config.json";

const app = initializeApp(config);
const dbId = config.firestoreDatabaseId === "(default)" ? undefined : config.firestoreDatabaseId;
const db = getFirestore(app, dbId);

(async () => {
    try {
        console.log("Not logging in... testing write (should fail due to missing auth)");
        await setDoc(doc(db, "public_portals", "test2"), { ownerId: "any" });
        console.log("Write success!");
    } catch(e) {
        console.log("Write failed as expected:", e.message);
    }
    process.exit(0);
})();
