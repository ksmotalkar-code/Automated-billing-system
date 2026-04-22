import express from "express";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import * as admin from "firebase-admin";

// We'll import node-cron when the user sets up their Firebase Admin
import cron from "node-cron";

// Optional: Initialize Firebase Admin gracefully
try {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
      console.log("Firebase Admin Initialized Successfully.");
    }
  } else {
    console.warn("FIREBASE_SERVICE_ACCOUNT not found. Webhook/Cron automation will be limited.");
  }
} catch (error) {
  console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT", error);
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Security and performance middleware
  app.use(helmet({
    contentSecurityPolicy: false, // Disabled for Vite dev server compatibility
  }));
  app.use(compression());
  app.use(cors());
  app.use(express.json());

  // API Routes (Before Vite Middleware)
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "SmartBilling Server is running" });
  });

  // 1. Payment Webhook Endpoint (e.g. Razorpay, Cashfree)
  // The bank sends a POST request here when someone scans your dynamic QR and pays
  app.post("/api/payment-webhook", async (req, res) => {
    try {
      // In a real app, you would verify the signature using process.env.PAYMENT_GATEWAY_WEBHOOK_SECRET
      const payload = req.body;
      
      console.log("Received payment Webhook:", payload);
      
      // Expected structure from your payment gateway (example)
      // { "event": "payment.captured", "payload": { "payment": { "entity": { "amount": 20000, "notes": { "customerId": "..." } } } } }

      // We extract the tracking ID from the payment payload
      const customerId = payload.payload?.payment?.entity?.notes?.customerId;
      const amountPaid = (payload.payload?.payment?.entity?.amount || 0) / 100; // if in paise
      
      if (!customerId) {
        return res.status(400).json({ status: "error", message: "Missing customer tracking details" });
      }

      /* 
        This is where `firebase-admin` is needed. You cannot access Firestore properly from an auto-webhook 
        without Admin access. Once `firebase-admin` is set up:
        
        1. admin.firestore().collection('customers').doc(customerId).get()
        2. Deduct `amountPaid` from `balance`
        3. Save to `transactions` subcollection
        4. If balance == 0, trigger `generateInvoicePDF` and `sendWhatsAppNotification`
      */

      console.log(`Payment confirmed for ${customerId} amount ₹${amountPaid}`);

      // Respond immediately to the bank so they know we got the webhook
      res.json({ received: true });
    } catch (error) {
      console.error("Webhook processing error:", error);
      res.status(500).json({ error: "Webhook processing failed" });
    }
  });

// 2. Daily Cron Automation Trigger
  // Runs at midnight every day
  cron.schedule('0 0 * * *', async () => {
    console.log("Running Daily Automation Engine (Cron)...");
    
    if (!admin.apps.length) return;
    const db = admin.firestore();
    
    // 1. Fetch settings to read automation toggles
    const settingsSnap = await db.collection('settings').get();
    
    for (const doc of settingsSnap.docs) {
      const settings = doc.data() as AppSettings;
      if (!settings.automation) continue;

      // Logic for each automation trigger based on settings.automation
      console.log(`Processing automation for user: ${settings.ownerId}`);
      // ... In a real app, instantiate automated billing logic via Admin SDK
    }
  });

  app.post("/api/cron/daily", async (req, res) => {
    try {
      console.log("Starting Manual Daily Automation Engine Trigger...");
      // Placeholder for triggered automation call
      res.json({ status: "success" });
    } catch (error) {
       console.error("Cron Error", error);
       res.status(500).json({ error: "Automation failed" });
    }
  });

  // 3. WhatsApp Chatbot Webhooks

  // Meta Webhook Verification
  app.get("/api/whatsapp-webhook/:ownerId", async (req, res) => {
    try {
      const { ownerId } = req.params;
      const mode = req.query["hub.mode"];
      const token = req.query["hub.verify_token"];
      const challenge = req.query["hub.challenge"];

      if (mode && token) {
        if (!admin.apps.length) return res.status(500).send("Admin not initialized");
        const db = admin.firestore();
        const settingsDoc = await db.collection("settings").doc(ownerId).get();
        if (!settingsDoc.exists) return res.sendStatus(403);
        
        const storedToken = settingsDoc.data()?.metaWhatsAppVerifyToken;
        if (mode === "subscribe" && token === storedToken) {
           console.log("WEBHOOK_VERIFIED for user:", ownerId);
           res.status(200).send(challenge);
        } else {
           res.sendStatus(403);
        }
      } else {
        res.sendStatus(400);
      }
    } catch (err) {
      console.error(err);
      res.sendStatus(500);
    }
  });

  // Meta Incoming Message Receipt
  app.post("/api/whatsapp-webhook/:ownerId", async (req, res) => {
    try {
      const { ownerId } = req.params;
      
      const body = req.body;
      if (body.object) {
        if (body.entry && body.entry[0].changes && body.entry[0].changes[0] && body.entry[0].changes[0].value.messages && body.entry[0].changes[0].value.messages[0]) {
           const messageObj = body.entry[0].changes[0].value.messages[0];
           const fromMobile = messageObj.from; // WhatsApp returns mobile e.g. "919000000000"
           const msgBody = messageObj.text?.body;
           
           console.log(`Received message from ${fromMobile} for owner ${ownerId}: ${msgBody}`);

           if (msgBody && admin.apps.length) {
              const db = admin.firestore();
              
              // Formatting: Strip standard prefixes like "91" if our DB format doesn't use it, 
              // or perform a highly forgiving query (in a real production app we'd standardize E.164 formats everywhere)
              // We'll search across active customers.
              const customersSnap = await db.collection("customers").where("ownerId", "==", ownerId).get();
              
              let matchedCustomer = null;
              for (const doc of customersSnap.docs) {
                 const data = doc.data();
                 // Naive matching - if the whatsapp number ends with the customer's mobile number
                 if (fromMobile.endsWith(data.mobileNumber.replace(/\D/g, ''))) {
                    matchedCustomer = data;
                    break;
                 }
              }

              if (matchedCustomer) {
                  // Save as a complaint
                  const complaintId = `COMP-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
                  await db.collection("complaints").doc(complaintId).set({
                     id: complaintId,
                     customerId: matchedCustomer.id,
                     customerName: matchedCustomer.name,
                     message: msgBody,
                     status: 'Pending',
                     createdAt: new Date().toISOString(),
                     ownerId: ownerId
                  });
                  console.log(`Logged complaint for ${matchedCustomer.name}`);
                  
                  // In a real system, you'd use the settings.metaWhatsAppApiKey here to send an API reply acknowledging receipt.
              } else {
                 console.log("Message received from unknown number. Ignored.");
              }
           }
        }
        res.sendStatus(200);
      } else {
        res.sendStatus(404);
      }
    } catch (err) {
      console.error(err);
      res.sendStatus(500);
    }
  });

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

startServer();
