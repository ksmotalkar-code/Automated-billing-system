import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import * as dotenv from 'dotenv';
import * as fs from 'fs';

dotenv.config();

async function cleanReceipts() {
  const saRaw = process.env.FIREBASE_SERVICE_ACCOUNT;
  const configRaw = fs.readFileSync('firebase-applet-config.json', 'utf8');
  let config: any = {};
  
  try { config = JSON.parse(configRaw); } catch(e) {}
  
  if (saRaw) {
    let serviceAccount: any;
    try {
      serviceAccount = JSON.parse(saRaw);
    } catch(e) {}
    if (serviceAccount) {
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
      }
    }
  } else if (config.projectId) {
     if (!admin.apps.length) {
       admin.initializeApp({
         credential: admin.credential.applicationDefault(),
         projectId: config.projectId
       });
     }
  }

  if (!admin.apps.length) {
      console.log('Could not init firebase admin');
      process.exit(1);
  }

  let db: admin.firestore.Firestore;
  if (config.firestoreDatabaseId && config.firestoreDatabaseId !== '(default)' && config.firestoreDatabaseId !== 'default') {
      db = getFirestore(admin.apps[0]!, config.firestoreDatabaseId);
  } else {
      db = getFirestore(admin.apps[0]!);
  }

  
  let i = 0;
  let totalSaved = 0;
  
  const snapshot = await db.collection('payment_receipts').select('portalId').get();
  for (const doc of snapshot.docs) {
      await doc.ref.update({
          base64Image: admin.firestore.FieldValue.delete()
      });
      i++;
      console.log(`Cleaned image from receipt: ${doc.id}`);
  }
  
  const settingsSnap = await db.collection('settings').select('bulkProcessing').get();
  for (const setDoc of settingsSnap.docs) {
     await setDoc.ref.update({ upiQrCodeImage: admin.firestore.FieldValue.delete() });
     i++;
     console.log(`Cleaned QR from settings: ${setDoc.id}`);
  }
  
  console.log(`\nDone! Cleaned ${i} images. Total space saved: ${(totalSaved / 1024 / 1024).toFixed(2)} MB`);
}

cleanReceipts().catch(console.error);
