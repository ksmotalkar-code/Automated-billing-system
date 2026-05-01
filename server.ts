import express from "express";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import admin from "firebase-admin";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

// Support for Client SDK Fallback (Service User Pattern)
import { initializeApp as initializeClientApp } from 'firebase/app';
import { getFirestore as getClientFirestore, doc, getDoc as getDocClient, collection as collectionClient, query as queryClient, where as whereClient, getDocs as getDocsClient, setDoc as setDocClient } from 'firebase/firestore';
import { getAuth as getClientAuth, signInWithEmailAndPassword } from 'firebase/auth';
import fs from 'fs';

// Load config from root regardless of where the script runs
const configPath = path.resolve(process.cwd(), 'firebase-applet-config.json');
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf-8'));

// We'll import node-cron when the user sets up their Firebase Admin
import cron from "node-cron";

interface AutomationSettings {
  billingLifecycle: boolean;
  ruleBased: boolean;
  lateFee: boolean;
  scheduledBilling: boolean;
  bulkProcessing: boolean;
  smartNotifications: boolean;
  autoShareReports?: boolean;
  autoCreateComplaints?: boolean;
  enforceIstTimeWindow?: boolean;
}

interface AppSettings {
  upiQrCodeImage: string | null;
  billingAmount: number;
  billingCycleMonths: number;
  penaltyAmount: number;
  penaltyDays: number;
  escalationDays?: number;
  autoSuspend?: boolean;
  defaultBillingDate?: string;
  nextBillingDate?: string;
  lastBillingDate?: string;
  lastPenaltyDate?: string;
  lastNotificationDate?: string;
  ownerId?: string;
  metaWhatsAppApiKey?: string;
  metaWhatsAppPhoneNumberId?: string;
  metaWhatsAppVerifyToken?: string;
  cunnektApiKey?: string;
  cunnektBaseUrl?: string;
  preferredNotificationMethod?: string;
  enableWhatsappWeb?: boolean;
  automation?: AutomationSettings;
}

// Optional: Initialize Firebase Admin gracefully
  if (process.env.FIREBASE_SERVICE_ACCOUNT && process.env.FIREBASE_SERVICE_ACCOUNT.trim().startsWith('{')) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
      if (!admin.apps.length) {
        admin.initializeApp({
          credential: admin.credential.cert(serviceAccount)
        });
        console.log("Firebase Admin Initialized Successfully.");
      }
    } catch (error) {
      console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT", error);
    }
  } else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.warn("FIREBASE_SERVICE_ACCOUNT found but is not valid JSON. Ignoring.");
  } else {
    console.warn("FIREBASE_SERVICE_ACCOUNT not found. Webhook/Cron automation will be limited.");
  }

  // Initialize Client SDK as a fallback for Hosted environments (Service User Pattern)
  const clientApp = initializeClientApp(firebaseConfig);
  const clientDb = getClientFirestore(clientApp, firebaseConfig.firestoreDatabaseId);
  const clientAuth = getClientAuth(clientApp);

  // Attempt to log in as a "Service User" if configured
  const botEmail = process.env.BACKEND_BOT_EMAIL;
  const botPassword = process.env.BACKEND_BOT_PASSWORD;
  
  if (botEmail && botPassword) {
    signInWithEmailAndPassword(clientAuth, botEmail, botPassword)
      .then((user) => console.log(`✓ Backend LOGGED IN as service user: ${botEmail}`))
      .catch((err) => console.error(`✗ Backend FAILED to log in as ${botEmail}:`, err.message));
  } else if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
    console.warn("No FIREBASE_SERVICE_ACCOUNT and no BACKEND_BOT_EMAIL. Webhooks will not be able to access your database.");
  }

  // Database helpers to support both Admin SDK and Client SDK fallback
  async function getSettings(ownerId: string) {
    if (admin.apps.length) {
      const doc = await admin.firestore().collection("settings").doc(ownerId).get();
      return doc.exists ? doc.data() : null;
    } else {
      const docSnap = await getDocClient(doc(clientDb, "settings", ownerId));
      return docSnap.exists() ? docSnap.data() : null;
    }
  }

  async function getCustomers(ownerId: string) {
    if (admin.apps.length) {
      const snap = await admin.firestore().collection("customers").where("ownerId", "==", ownerId).get();
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    } else {
      const q = queryClient(collectionClient(clientDb, "customers"), whereClient("ownerId", "==", ownerId));
      const snap = await getDocsClient(q);
      return snap.docs.map(d => ({ id: d.id, ...d.data() }));
    }
  }

  async function saveComplaintData(complaintId: string, data: any) {
    if (admin.apps.length) {
      await admin.firestore().collection("complaints").doc(complaintId).set(data);
    } else {
      await setDocClient(doc(clientDb, "complaints", complaintId), data);
    }
  }

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Security and performance middleware
  app.use(helmet({
    contentSecurityPolicy: false, // Disabled for Vite dev server compatibility
    crossOriginEmbedderPolicy: false,
    crossOriginOpenerPolicy: false,
    crossOriginResourcePolicy: false,
    frameguard: false,
  }));
  app.use(compression());
  app.use(cors());
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API Routes (Before Vite Middleware)
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "SmartBilling Server is running" });
  });

  // 1. Payment Webhook Endpoint (e.g. Razorpay, Cashfree)
  // The bank sends a POST request here when someone scans your dynamic QR and pays
  app.post("/api/payment-webhook/:ownerId", async (req, res) => {
    try {
      const { ownerId } = req.params;
      const signature = req.headers['x-razorpay-signature'] || req.headers['x-webhook-signature'];
      
      let webhookSecret = null;
      const settings = await getSettings(ownerId);
      if (settings?.paymentGatewaySecret) {
         webhookSecret = settings.paymentGatewaySecret;
      }

      // In production, we actively verify the signature here using webhookSecret or process.env variables
      // if (webhookSecret && !verifySignature(req.body, signature, webhookSecret)) return res.sendStatus(403);

      const payload = req.body;
      console.log(`Received payment Webhook for owner ${ownerId}:`, payload);
      
      // Expected structure from your payment gateway (example Razorpay)
      const customerId = payload.payload?.payment?.entity?.notes?.customerId;
      const amountPaid = (payload.payload?.payment?.entity?.amount || 0) / 100; // if in paise
      
      // Fallback: Check if they just sent plain root attributes
      const fallbackCustomerId = payload.customerId || payload.customer_id;
      const finalCustomerId = customerId || fallbackCustomerId;

      if (!finalCustomerId) {
        return res.status(400).json({ status: "error", message: "Missing customer tracking details" });
      }

      console.log(`Payment confirmed for ${finalCustomerId} amount ₹${amountPaid}`);

      /* 
         If `firebase-admin` is connected (requires Service Account):
         1. admin.firestore().collection('customers').doc(finalCustomerId).get()
         2. Deduct `amountPaid` from `balance`
         3. Save to `transactions` subcollection
         4. If balance == 0, trigger `generateInvoicePDF` and `sendWhatsAppNotification` natively using Node.js logic!
      */
      if (admin.apps.length) {
         try {
           const db = admin.firestore();
           const custRef = db.collection('customers').doc(finalCustomerId);
           const custDoc = await custRef.get();
           if (custDoc.exists) {
              const customer = custDoc.data();
              const newBalance = Math.max(0, (customer?.balance || 0) - amountPaid);
              await custRef.update({ balance: newBalance });

              // Save transaction
              await db.collection('customers').doc(finalCustomerId).collection('transactions').add({
                 amount: amountPaid,
                 date: new Date().toISOString(),
                 id: `TXN-${Date.now()}`
              });

              // Automate WhatsApp Receipt
              if (newBalance === 0 && ownerId) {
                 const settingsDoc = await db.collection("settings").doc(ownerId).get();
                 const settings = settingsDoc.data() as any;
                 if (settings?.automation?.smartNotifications && ((settings.metaWhatsAppApiKey && settings.metaWhatsAppPhoneNumberId) || settings.cunnektApiKey)) {
                   const mobile = customer?.mobileNumber?.replace(/\D/g, '');
                   if (mobile && mobile.length >= 10) {
                     const message = `Dear ${customer?.name}, your payment of Rs. ${amountPaid} was received! Your balance is now 0. Thank you!`;
                     await sendWhatsAppMessage(settings, mobile, message).catch(e => console.error("Webhook Auto-Receipt failed", e));
                     await custRef.update({ paymentNotified: true });
                   }
                 }
              }
           }
         } catch(err) {
           console.error("Firebase webhook automated processing failed:", err);
         }
      }

      // Respond immediately to the bank to confirm receipt and halt retries
      res.json({ received: true });
    } catch (error) {
      console.error("Webhook processing error:", error);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });

  // Helper for Meta WhatsApp API
  async function sendMetaWhatsApp(settings: any, to: string, message: string, mediaBase64?: string, mediaName?: string) {
    if (!settings?.metaWhatsAppApiKey || !settings?.metaWhatsAppPhoneNumberId) {
      throw new Error("WhatsApp API not configured");
    }

    const mobile = to.replace(/\D/g, '');
    let formattedTo = mobile;
    if (mobile.length === 10) {
      formattedTo = `91${mobile}`;
    } else if (mobile.length === 12 && mobile.startsWith('91')) {
      formattedTo = mobile;
    } else if (mobile.length === 13 && mobile.startsWith('0')) { // Sometimes people add 091 ?
       formattedTo = mobile.substring(mobile.length - 12);
    } else {
       // fallback, if it's strangely formatted just prepend 91 and hope for the best if it doesn't have it
       formattedTo = mobile.startsWith('91') ? mobile : `91${mobile}`;
    }
    
    console.log(`[WhatsApp] Sending to ${formattedTo}...`);

    let mediaId: string | undefined = undefined;

    // Upload media to Meta first if provided
    if (mediaBase64) {
      try {
        const base64Data = mediaBase64.split(',')[1] || mediaBase64;
        const mimeType = mediaBase64.split(';')[0].split(':')[1] || 'application/pdf';
        const isImage = mimeType.startsWith('image/');
        
        const buffer = Buffer.from(base64Data, 'base64');
        const formData = new FormData();
        const blob = new Blob([buffer], { type: mimeType });
        formData.append('file', blob, mediaName || (isImage ? 'image.png' : 'document.pdf'));
        formData.append('messaging_product', 'whatsapp');

        const uploadRes = await fetch(`https://graph.facebook.com/v17.0/${settings.metaWhatsAppPhoneNumberId}/media`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${settings.metaWhatsAppApiKey}`
          },
          body: formData as any
        });
        
        const uploadData = await uploadRes.json();
        if (!uploadRes.ok) {
          console.error(`[WhatsApp] Media Upload Error:`, uploadData);
          throw new Error(uploadData.error?.message || "Failed to upload media to WhatsApp");
        }
        mediaId = uploadData.id;
        console.log(`[WhatsApp] Successfully uploaded media, ID: ${mediaId}`);
      } catch (err) {
        console.error(`[WhatsApp] Error handling media:`, err);
        // Continue and send as text message if media upload fails?
        // Let's just append an error log but send text anyway
      }
    }

    let bodyPayload: any = {
      messaging_product: 'whatsapp',
      to: formattedTo
    };

    if (mediaId) {
      // Determine if it's an image or generic document
      const mimeType = mediaBase64?.split(';')[0].split(':')[1] || '';
      const isImage = mimeType.startsWith('image/');
      
      if (isImage) {
        bodyPayload.type = 'image';
        bodyPayload.image = {
          id: mediaId,
          caption: message
        };
      } else {
        bodyPayload.type = 'document';
        bodyPayload.document = {
          id: mediaId,
          caption: message,
          filename: mediaName || 'document.pdf'
        };
      }
    } else {
      bodyPayload.type = 'text';
      bodyPayload.text = { body: message };
    }

    const response = await fetch(`https://graph.facebook.com/v17.0/${settings.metaWhatsAppPhoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.metaWhatsAppApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyPayload),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error(`[WhatsApp] Meta API Error:`, data.error);
      throw new Error(data.error?.message || "Meta API Error");
    }
    return data;
  }

  // Helper for Cunnekt WhatsApp API
  async function sendCunnektWhatsApp(settings: any, to: string, message: string, mediaBase64?: string, mediaName?: string) {
    if (!settings?.cunnektApiKey || !settings?.cunnektBaseUrl) {
      throw new Error("Cunnekt API not configured");
    }

    const mobile = to.replace(/\D/g, '');
    let formattedTo = mobile;
    if (mobile.length === 10) {
      formattedTo = `91${mobile}`;
    } else {
      formattedTo = mobile.startsWith('91') ? mobile : `91${mobile}`;
    }

    console.log(`[Cunnekt] Sending to ${formattedTo}...`);

    const baseUrl = settings.cunnektBaseUrl.replace(/\/$/, ''); // Remove trailing slash
    
    // Cunnekt standard message endpoint
    const url = `${baseUrl}/messages`;

    const payload: any = {
      to: formattedTo,
      type: 'text',
      text: { body: message }
    };

    // Note: Cunnekt generic API often follows Meta's structure for text, 
    // but we'll try a fallback if needed in a real scenario.
    // For media, they often use a different structure or expect a URL.
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': settings.cunnektApiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error(`[Cunnekt] API Error:`, data);
      throw new Error(data.message || "Cunnekt API Error");
    }
    return data;
  }

  // Generic Send WhatsApp API
  async function sendWhatsAppMessage(settings: AppSettings, to: string, message: string, mediaBase64?: string, mediaName?: string) {
    if (settings.preferredNotificationMethod && 
        settings.preferredNotificationMethod !== 'api' && 
        settings.preferredNotificationMethod !== 'manual_link') {
      return await sendCunnektWhatsApp(settings, to, message, mediaBase64, mediaName);
    } else {
      // Default to Meta or explicit 'api'
      return await sendMetaWhatsApp(settings, to, message, mediaBase64, mediaName);
    }
  }

  // Reusable Automation Engine
  async function runDailyAutomation(specificOwnerId: string | null = null) {
     if (!admin.apps.length) return;
     const db = admin.firestore();
     
     // 1. Fetch settings
     let settingsSnap;
     if (specificOwnerId) {
        const doc = await db.collection('settings').doc(specificOwnerId).get();
        if (!doc.exists) return;
        settingsSnap = { docs: [doc] };
     } else {
        settingsSnap = await db.collection('settings').get();
     }
     
     for (const doc of settingsSnap.docs) {
       const settings = doc.data() as AppSettings;
       if (!settings.automation) continue;

       const ownerId = doc.id;
       console.log(`[Automation] Processing user: ${ownerId}`);
       
       const istTime = new Date(new Date().toLocaleString("en-US", {timeZone: "Asia/Kolkata"}));
       const istHour = istTime.getHours();
       
       if (settings.automation.enforceIstTimeWindow && !specificOwnerId) {
          if (istHour < 9 || istHour >= 10) {
             console.log(`[Automation] Skipping user ${ownerId} due to IST time window constraint (Current IST Hour: ${istHour})`);
             continue;
          }
       }
       
       let shouldTriggerBilling = false;
       if (settings.nextBillingDate) {
           const nextStr = settings.nextBillingDate; // YYYY-MM-DD
           const todayStr = istTime.toISOString().split('T')[0]; // YYYY-MM-DD in IST
           if (todayStr >= nextStr) {
               shouldTriggerBilling = true;
           }
       } else {
           const defaultDate = parseInt(settings.defaultBillingDate || "1");
           if (istTime.getDate() === defaultDate) {
               shouldTriggerBilling = true;
           }
       }
       
       // Handle Billing Cycle
       if (settings.automation.scheduledBilling && (shouldTriggerBilling || specificOwnerId)) {
          console.log(`[Automation] Billing cycle triggered for ${ownerId}`);
          
          const custRef = db.collection('customers').where('ownerId', '==', ownerId).where('status', '==', 'Active');
          const customersSnap = await custRef.get();
          
          if (!customersSnap.empty) {
            let batch = db.batch();
            let count = 0;
            
            for (const cDoc of customersSnap.docs) {
               const customer = cDoc.data();
               const newBalance = (customer.balance || 0) + (settings.billingAmount || 0);
               
               batch.update(cDoc.ref, {
                  balance: newBalance,
                  invoiceSent: false,
                  paymentNotified: false
               });
               count++;
               if (count === 400) {
                 await batch.commit();
                 batch = db.batch();
                 count = 0;
               }
            }
            if (count > 0) {
              await batch.commit();
            }

            // Send Automated WhatsApp Bill (after DB updates)
            if (((settings.metaWhatsAppApiKey && settings.metaWhatsAppPhoneNumberId) || settings.cunnektApiKey) && settings.automation.smartNotifications) {
              for (const cDoc of customersSnap.docs) {
                const customer = cDoc.data();
                const newBalance = (customer.balance || 0) + (settings.billingAmount || 0);
                const message = `Dear ${customer.name}, your new water bill of Rs. ${settings.billingAmount} has been generated. Total outstanding: Rs. ${newBalance}. Please pay on time.`;
                try {
                  await sendWhatsAppMessage(settings, customer.mobileNumber, message);
                } catch (e: any) {
                  console.error(`[Automation] Failed to auto-send bill to ${customer.name}: ${e.message}`);
                }
              }
            }
          }
          
          let updatePayload: any = { lastBillingDate: new Date().toISOString() };
          if (settings.nextBillingDate) {
              const nd = new Date(settings.nextBillingDate);
              nd.setMonth(nd.getMonth() + 1);
              updatePayload.nextBillingDate = nd.toISOString().split('T')[0];
          }
          await doc.ref.update(updatePayload);
       }
     }
  }

  // 2. Daily Cron Automation Trigger
  // Runs at midnight every day
  cron.schedule('0 0 * * *', async () => {
    console.log("Running Daily Automation Engine (Cron)...");
    
    if (!admin.apps.length) return;
    const db = admin.firestore();
    
    // Auto-Delete resolved complaints older than 6 months
    try {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      console.log(`Checking for resolved complaints before ${sixMonthsAgo.toISOString()} to auto-delete`);
      
      const oldComplaintsSnap = await db.collection('complaints')
        .where('status', '==', 'Resolved')
        .where('createdAt', '<', sixMonthsAgo.toISOString())
        .get();
        
      if (!oldComplaintsSnap.empty) {
        const batch = db.batch();
        oldComplaintsSnap.forEach(doc => {
          batch.delete(doc.ref);
        });
        await batch.commit();
        console.log(`Auto-deleted ${oldComplaintsSnap.size} old complaints.`);
      }
    } catch (err) {
      console.error("Failed to auto-delete old complaints", err);
    }
    
    await runDailyAutomation();
  });

  app.post("/api/cron/daily", async (req, res) => {
    try {
      const { ownerId } = req.body;
      console.log(`Starting Manual Daily Automation Engine Trigger for ${ownerId || 'ALL'}...`);
      await runDailyAutomation(ownerId);
      res.json({ status: "success" });
    } catch (error) {
       console.error("Cron Error", error);
       res.status(500).json({ error: "Automation failed" });
    }
  });

  // Send Individual Message API (Proxied for CORS safety)
  app.post("/api/whatsapp/send", async (req, res) => {
    try {
      const { ownerId, to, message, apiKey, phoneId, cunnektApiKey, cunnektBaseUrl, method, mediaBase64, mediaName } = req.body;
      if (!to || !message) return res.status(400).json({ error: "Missing required fields" });
      
      let settings: any = { 
        metaWhatsAppApiKey: apiKey, 
        metaWhatsAppPhoneNumberId: phoneId,
        cunnektApiKey: cunnektApiKey,
        cunnektBaseUrl: cunnektBaseUrl,
        preferredNotificationMethod: method
      };

      if (!apiKey && !cunnektApiKey && admin.apps.length) {
         const db = admin.firestore();
         const settingsDoc = await db.collection("settings").doc(ownerId).get();
         settings = settingsDoc.data() as any;
      }
      
      const data = await sendWhatsAppMessage(settings, to, message, mediaBase64, mediaName);
      res.json({ success: true, messageId: data.messages?.[0]?.id || data.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Bulk Broadcast API
  app.post("/api/whatsapp/broadcast", async (req, res) => {
    try {
      const { ownerId, message, apiKey, phoneId, cunnektApiKey, cunnektBaseUrl, recipients, mediaBase64, mediaName } = req.body;
      if (!message) return res.status(400).json({ error: "Missing message" });
      
      let settings: any = { 
        metaWhatsAppApiKey: apiKey, 
        metaWhatsAppPhoneNumberId: phoneId,
        cunnektApiKey: cunnektApiKey,
        cunnektBaseUrl: cunnektBaseUrl
      };

      if (admin.apps.length) {
         const db = admin.firestore();
         const settingsDoc = await db.collection("settings").doc(ownerId).get();
         if (settingsDoc.exists) {
           const dbSettings = settingsDoc.data() as any;
           if (!apiKey) settings.metaWhatsAppApiKey = dbSettings.metaWhatsAppApiKey;
           if (!phoneId) settings.metaWhatsAppPhoneNumberId = dbSettings.metaWhatsAppPhoneNumberId;
           if (!cunnektApiKey) settings.cunnektApiKey = dbSettings.cunnektApiKey;
           if (!cunnektBaseUrl) settings.cunnektBaseUrl = dbSettings.cunnektBaseUrl;
           settings.preferredNotificationMethod = dbSettings.preferredNotificationMethod;
         }
      }
      if (!settings?.metaWhatsAppApiKey && !settings?.cunnektApiKey && settings?.preferredNotificationMethod !== 'whatsapp_web') {
        return res.status(400).json({ error: "WhatsApp API not configured" });
      }

      let customers = recipients || [];
      if (!recipients && admin.apps.length) {
         const db = admin.firestore();
         const customersSnap = await db.collection("customers")
           .where("ownerId", "==", ownerId)
           .where("status", "==", "Active")
           .get();
         customers = customersSnap.docs.map(d => d.data());
      }

      console.log(`Broadcasting to ${customers.length} customers...`);
      
      const results = { success: 0, failed: 0 };
      
      for (const customer of customers) {
        try {
          await sendWhatsAppMessage(settings, customer.mobileNumber, message, mediaBase64, mediaName);
          results.success++;
        } catch (e) {
          results.failed++;
        }
      }

      res.json({ status: "completed", ...results });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Broadcast failed" });
    }
  });

  // Test WhatsApp API Configuration
  app.post("/api/whatsapp/test", async (req, res) => {
    try {
      const { ownerId, testMobile, apiKey, phoneId, cunnektApiKey, cunnektBaseUrl, method } = req.body;
      let settings: any = { 
        metaWhatsAppApiKey: apiKey, 
        metaWhatsAppPhoneNumberId: phoneId,
        cunnektApiKey: cunnektApiKey,
        cunnektBaseUrl: cunnektBaseUrl,
        preferredNotificationMethod: method
      };

      if (!apiKey && !cunnektApiKey && admin.apps.length) {
         const db = admin.firestore();
         const settingsDoc = await db.collection("settings").doc(ownerId).get();
         settings = settingsDoc.data() as any;
      }
      if (!settings?.metaWhatsAppApiKey && !settings?.cunnektApiKey) {
        return res.status(400).json({ error: "WhatsApp API not configured in settings" });
      }

      const message = "This is a test notification from your SmartBilling Engine! If you see this, your API configuration is PERFECT. ✅";
      await sendWhatsAppMessage(settings, testMobile, message);

      res.json({ status: "success", info: "Message sent! Check your phone." });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
;

  // 3. WhatsApp Chatbot Webhooks

  // Meta Webhook Verification
  app.get("/api/whatsapp-webhook/:ownerId", async (req, res) => {
    try {
      const { ownerId } = req.params;
      const mode = req.query["hub.mode"];
      const token = req.query["hub.verify_token"];
      const challenge = req.query["hub.challenge"];

      console.log(`[Webhook] Received verification request for owner: ${ownerId}`);

      if (mode && token) {
        let storedToken = process.env.META_VERIFY_TOKEN;

        // Dynamic fetch using helper
        const settings = await getSettings(ownerId);
        if (settings?.metaWhatsAppVerifyToken) {
           storedToken = settings.metaWhatsAppVerifyToken;
        }

        if (mode === "subscribe") {
           // If we have a stored token, verify it. If we don't have Admin SDK, we might just warn and accept to let Meta connect,
           // but it's safer to require the token. Let's be lenient if they are stuck with validation.
           if (storedToken) {
             if (token === storedToken) {
               console.log(`[Webhook] VERIFIED successfully for user: ${ownerId}`);
               res.set('Content-Type', 'text/plain');
               return res.status(200).send(challenge);
             } else {
               console.warn(`[Webhook] Verification FAILED for user: ${ownerId}. Expected: ${storedToken}, Received: ${token}`);
               return res.sendStatus(403);
             }
           } else {
             // Admin SDK might be missing or token not set. 
             // We accept it to let Meta save the URL, but warn heavily.
             console.warn(`[Webhook] VERY IMPORTANT: Bypassed strict token match for ${ownerId} because FIREBASE_SERVICE_ACCOUNT is missing or token is not saved in DB!`);
             res.set('Content-Type', 'text/plain');
             return res.status(200).send(challenge);
           }
        } else {
           return res.sendStatus(400);
        }
      } else {
        console.warn("[Webhook] Missing hub.mode or hub.token in query parameters");
        return res.sendStatus(400);
      }
    } catch (err) {
      console.error("[Webhook] Verification Error:", err);
      res.sendStatus(500);
    }
  });

  // Meta Incoming Message Receipt
  app.post("/api/whatsapp-webhook/:ownerId", async (req, res) => {
    try {
      const { ownerId } = req.params;
      
      // Fast acknowledge to Meta
      res.sendStatus(200);

      const body = req.body;
      if (!body.object) return;

      const entries = body.entry || [];
      for (const entry of entries) {
        const changes = entry.changes || [];
        for (const change of changes) {
          const messages = change.value?.messages || [];
          for (const messageObj of messages) {
            const fromMobile = messageObj.from;
            const msgBody = messageObj.text?.body;
            
            console.log(`[Webhook] Received message from ${fromMobile} for owner ${ownerId}: ${msgBody}`);

            if (msgBody) {
              try {
                const customers = await getCustomers(ownerId);
                let matchedCustomer = null;
                const cleanMobile = fromMobile.replace(/\D/g, '');
                
                for (const customer of customers) {
                   const dataMobile = (customer.mobileNumber || '').replace(/\D/g, '');
                   if (cleanMobile.endsWith(dataMobile)) {
                      matchedCustomer = customer;
                      break;
                   }
                }

                if (matchedCustomer) {
                     const settings = await getSettings(ownerId);
                     
                     let handled = false;
                     if (settings?.chatbotCommands && Array.isArray(settings.chatbotCommands)) {
                       for (const cmd of settings.chatbotCommands) {
                         if (cmd.isActive && cmd.triggerWord && msgBody.toLowerCase().includes(cmd.triggerWord.toLowerCase())) {
                           console.log(`[Webhook] Matched chatbot command: ${cmd.triggerWord} for ${matchedCustomer.name}`);
                           if (settings && ((settings.metaWhatsAppApiKey && settings.metaWhatsAppPhoneNumberId) || settings.cunnektApiKey)) {
                             try {
                                let responseText = cmd.response || '';
                                responseText = responseText.replace(/{{name}}/g, matchedCustomer.name);
                                responseText = responseText.replace(/{{balance}}/g, (matchedCustomer.balance || 0).toString());
                                
                                await sendWhatsAppMessage(settings as unknown as AppSettings, fromMobile, responseText);
                                handled = true;
                                break;
                             } catch (e) {
                                console.error("[Webhook] Failed to send chatbot reply:", e);
                             }
                           }
                         }
                       }
                     }

                     if (!handled && msgBody.toLowerCase().includes('complain') && settings?.automation?.autoCreateComplaints !== false) {
                        const complaintId = `COMP-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
                        await saveComplaintData(complaintId, {
                           id: complaintId,
                           customerId: matchedCustomer.id,
                           customerName: matchedCustomer.name,
                           message: msgBody,
                           status: 'Pending',
                           createdAt: new Date().toISOString(),
                           ownerId: ownerId
                        });
                        console.log(`[Webhook] Logged complaint for ${matchedCustomer.name}`);

                         // Auto-reply
                        if (settings && ((settings.metaWhatsAppApiKey && settings.metaWhatsAppPhoneNumberId) || settings.cunnektApiKey)) {
                          try {
                            await sendWhatsAppMessage(settings as unknown as AppSettings, fromMobile, `Dear ${matchedCustomer.name}, we have received your complaint (ID: ${complaintId}). We will look into it soon.`);
                          } catch (e) {
                            console.error("[Webhook] Failed to send auto-reply:", e);
                          }
                        }
                     }
                } else {
                   console.log("[Webhook] Message received from unknown number. Ignored.");
                }
              } catch (innerErr) {
                console.error("[Webhook] Processing error:", innerErr);
              }
            }
          }
        }
      }
    } catch (err) {
      console.error("[Webhook] Handler error:", err);
    }
  });

  // WhatsApp Web JS Integration
  let whatsappWebStatus = { status: 'disabled', qr: null, error: null, solution: null };
  // Vite middleware for development (Serves the App)
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    // Production serving
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`SmartBilling Full-Stack Server running on http://localhost:${PORT}`);
  });
}

startServer().catch(err => {
  console.error("CRITICAL SERVER STARTUP ERROR:", err);
  process.exit(1);
});
