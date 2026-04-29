import express from "express";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import admin from "firebase-admin";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

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
  lastBillingDate?: string;
  lastPenaltyDate?: string;
  lastNotificationDate?: string;
  ownerId?: string;
  metaWhatsAppApiKey?: string;
  metaWhatsAppPhoneNumberId?: string;
  metaWhatsAppVerifyToken?: string;
  preferredNotificationMethod?: 'api' | 'manual_link' | 'whatsapp_web';
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

async function startServer() {
  const app = express();
  const PORT = parseInt(process.env.PORT as string, 10) || 3000;

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
  app.post("/api/payment-webhook/:ownerId", async (req, res) => {
    try {
      const { ownerId } = req.params;
      const signature = req.headers['x-razorpay-signature'] || req.headers['x-webhook-signature'];
      
      let webhookSecret = null;

      // Ensure Admin SDK is active to pull settings dynamically
      if (admin.apps.length) {
         const db = admin.firestore();
         const settingsDoc = await db.collection("settings").doc(ownerId).get();
         if (settingsDoc.exists) {
            webhookSecret = settingsDoc.data()?.paymentGatewaySecret;
         }
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
                 if (settings?.automation?.smartNotifications && settings.metaWhatsAppApiKey && settings.metaWhatsAppPhoneNumberId) {
                   const mobile = customer?.mobileNumber?.replace(/\D/g, '');
                   if (mobile && mobile.length >= 10) {
                     const message = `Dear ${customer?.name}, your payment of Rs. ${amountPaid} was received! Your balance is now 0. Thank you!`;
                     let formattedTo = mobile;
                     if (mobile.length === 10) {
                       formattedTo = `91${mobile}`;
                     } else if (mobile.length === 12 && mobile.startsWith('91')) {
                       formattedTo = mobile;
                     } else {
                       formattedTo = mobile.startsWith('91') ? mobile : `91${mobile}`;
                     }
                     await fetch(`https://graph.facebook.com/v17.0/${settings.metaWhatsAppPhoneNumberId}/messages`, {
                       method: 'POST',
                       headers: {
                         'Authorization': `Bearer ${settings.metaWhatsAppApiKey}`,
                         'Content-Type': 'application/json',
                       },
                       body: JSON.stringify({
                         messaging_product: 'whatsapp',
                         to: formattedTo,
                         type: 'text',
                         text: { body: message }
                       }),
                     }).catch(e => console.error("Webhook Auto-Receipt failed", e));
                     
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
  async function sendMetaWhatsApp(settings: any, to: string, message: string) {
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
    const response = await fetch(`https://graph.facebook.com/v17.0/${settings.metaWhatsAppPhoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${settings.metaWhatsAppApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: formattedTo,
        type: 'text',
        text: { body: message }
      }),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error(`[WhatsApp] Meta API Error:`, data.error);
      throw new Error(data.error?.message || "Meta API Error");
    }
    return data;
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
       
       const today = new Date();
       const defaultDate = parseInt(settings.defaultBillingDate || "1");
       
       // Handle Billing Cycle
       if (settings.automation.scheduledBilling && (today.getDate() === defaultDate || specificOwnerId)) {
          console.log(`[Automation] Billing cycle triggered for ${ownerId}`);
          
          const custRef = db.collection('customers').where('ownerId', '==', ownerId).where('status', '==', 'Active');
          const customersSnap = await custRef.get();
          
          for (const cDoc of customersSnap.docs) {
             const customer = cDoc.data();
             const newBalance = (customer.balance || 0) + (settings.billingAmount || 0);
             
             await cDoc.ref.update({
                balance: newBalance,
                invoiceSent: false,
                paymentNotified: false
             });
             
             // Send Automated WhatsApp Bill
             if (settings.metaWhatsAppApiKey && settings.metaWhatsAppPhoneNumberId && settings.automation.smartNotifications) {
               const message = `Dear ${customer.name}, your new water bill of Rs. ${settings.billingAmount} has been generated. Total outstanding: Rs. ${newBalance}. Please pay on time.`;
               try {
                 await sendMetaWhatsApp(settings, customer.mobileNumber, message);
               } catch (e: any) {
                 console.error(`[Automation] Failed to auto-send bill to ${customer.name}: ${e.message}`);
               }
             }
          }
          await doc.ref.update({ lastBillingDate: new Date().toISOString() });
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
      const { ownerId, to, message, apiKey, phoneId } = req.body;
      if (!to || !message) return res.status(400).json({ error: "Missing required fields" });
      
      let settings = { metaWhatsAppApiKey: apiKey, metaWhatsAppPhoneNumberId: phoneId };
      if (!apiKey && admin.apps.length) {
         const db = admin.firestore();
         const settingsDoc = await db.collection("settings").doc(ownerId).get();
         settings = settingsDoc.data() as any;
      }
      
      const data = await sendMetaWhatsApp(settings, to, message);
      res.json({ success: true, messageId: data.messages?.[0]?.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Bulk Broadcast API
  app.post("/api/whatsapp/broadcast", async (req, res) => {
    try {
      const { ownerId, message, apiKey, phoneId, recipients } = req.body;
      if (!message) return res.status(400).json({ error: "Missing message" });
      
      let settings = { metaWhatsAppApiKey: apiKey, metaWhatsAppPhoneNumberId: phoneId };
      if (!apiKey && admin.apps.length) {
         const db = admin.firestore();
         const settingsDoc = await db.collection("settings").doc(ownerId).get();
         if (settingsDoc.exists) settings = settingsDoc.data() as any;
      }
      if (!settings?.metaWhatsAppApiKey || !settings?.metaWhatsAppPhoneNumberId) {
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
          await sendMetaWhatsApp(settings, customer.mobileNumber, message);
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
      const { ownerId, testMobile, apiKey, phoneId } = req.body;
      let settings = { metaWhatsAppApiKey: apiKey, metaWhatsAppPhoneNumberId: phoneId };
      if (!apiKey && admin.apps.length) {
         const db = admin.firestore();
         const settingsDoc = await db.collection("settings").doc(ownerId).get();
         settings = settingsDoc.data() as any;
      }
      if (!settings?.metaWhatsAppApiKey || !settings?.metaWhatsAppPhoneNumberId) {
        return res.status(400).json({ error: "WhatsApp API not configured in settings" });
      }

      const mobile = testMobile.replace(/\D/g, '');
      let formattedTo = mobile;
      if (mobile.length === 10) {
        formattedTo = `91${mobile}`;
      } else if (mobile.length === 12 && mobile.startsWith('91')) {
        formattedTo = mobile;
      } else {
        formattedTo = mobile.startsWith('91') ? mobile : `91${mobile}`;
      }

      const response = await fetch(`https://graph.facebook.com/v17.0/${settings.metaWhatsAppPhoneNumberId}/messages`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${settings.metaWhatsAppApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: formattedTo,
          type: 'text',
          text: { body: "This is a test notification from your SmartBilling Engine! If you see this, your API configuration is PERFECT. ✅" }
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        return res.status(response.status).json({ error: data.error?.message || "Meta API Error" });
      }

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
      console.log(`[Webhook] hub.mode: ${mode}, hub.verify_token: ${token ? 'PROVIDED' : 'MISSING'}`);

      if (mode && token) {
        let storedToken = process.env.META_VERIFY_TOKEN;

        // Try to fetch from Firebase if not in ENV and Admin is initialized
        if (!storedToken && admin.apps.length) {
          try {
            const db = admin.firestore();
            const settingsDoc = await db.collection("settings").doc(ownerId).get();
            if (settingsDoc.exists) {
              storedToken = settingsDoc.data()?.metaWhatsAppVerifyToken;
            }
          } catch (err) {
            console.error(`[Webhook] Error fetching settings for ${ownerId}:`, err);
          }
        }

        if (mode === "subscribe" && token === storedToken && storedToken) {
           console.log(`[Webhook] VERIFIED successfully for user: ${ownerId}`);
           res.set('Content-Type', 'text/plain');
           return res.status(200).send(challenge);
        } else {
           console.warn(`[Webhook] Verification FAILED for user: ${ownerId}. 
             Expectation: ${storedToken ? 'Token defined' : 'Token MISSING in DB/ENV'} 
             Received: ${token === storedToken ? 'MATCH' : 'MISMATCH'}`);
           return res.sendStatus(403);
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

            if (msgBody && admin.apps.length) {
              try {
                const db = admin.firestore();
                const customersSnap = await db.collection("customers").where("ownerId", "==", ownerId).get();
                
                let matchedCustomer = null;
                const cleanMobile = fromMobile.replace(/\D/g, '');
                for (const doc of customersSnap.docs) {
                   const data = doc.data();
                   const dataMobile = (data.mobileNumber || '').replace(/\D/g, '');
                   if (cleanMobile.endsWith(dataMobile)) {
                      matchedCustomer = { id: doc.id, ...data };
                      break;
                   }
                }

                if (matchedCustomer) {
                     const settingsDoc = await db.collection("settings").doc(ownerId).get();
                     const settings = settingsDoc.exists ? settingsDoc.data() : null;
                     if (msgBody.toLowerCase().includes('complain') && settings?.automation?.autoCreateComplaints !== false) {
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
                        console.log(`[Webhook] Logged complaint for ${matchedCustomer.name}`);

                        // Auto-reply
                        if (settings.metaWhatsAppApiKey && settings.metaWhatsAppPhoneNumberId) {
                          try {
                            await sendMetaWhatsApp(settings, fromMobile, `Dear ${matchedCustomer.name}, we have received your complaint (ID: ${complaintId}). We will look into it soon.`);
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
  let whatsappClient: any = null;
  let isInitializing = false;

  async function initWhatsappWeb() {
    if (isInitializing || (whatsappClient && whatsappWebStatus.status !== 'error')) return;
    isInitializing = true;
    whatsappWebStatus = { status: 'initializing', qr: null, error: null, solution: null };
    
    try {
      const { Client, LocalAuth } = require('whatsapp-web.js');
      const qrcode = require('qrcode');
      const fs = require('fs');

      // Auto-detect common chrome paths if none provided (especially for Render)
      let autoExecPath = process.env.PUPPETEER_EXECUTABLE_PATH;
      if (!autoExecPath) {
        const commonPaths = [
          '/usr/bin/google-chrome-stable',
          '/usr/bin/chromium-browser',
          '/usr/bin/google-chrome',
          '/usr/bin/chromium'
        ];
        for (const path of commonPaths) {
          if (fs.existsSync(path)) {
            autoExecPath = path;
            console.log(`Auto-detected Chrome/Chromium at: ${path}`);
            break;
          }
        }
      }

      whatsappClient = new Client({
        authStrategy: new LocalAuth(),
        puppeteer: {
          executablePath: autoExecPath || undefined,
          args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-accelerated-2d-canvas', '--no-first-run', '--no-zmq', '--single-process', '--disable-gpu']
        }
      });

      whatsappClient.on('qr', async (qrData: string) => {
        try {
          const qrBase64 = await qrcode.toDataURL(qrData);
          whatsappWebStatus = { status: 'qr', qr: qrBase64, error: null, solution: null };
        } catch (e) {
          console.error("QR Error", e);
        }
      });

      whatsappClient.on('ready', () => {
        console.log('WhatsApp Web Client is ready!');
        whatsappWebStatus = { status: 'connected', qr: null, error: null, solution: null };
        isInitializing = false;
      });

      whatsappClient.on('disconnected', (reason: any) => {
        whatsappWebStatus = { status: 'disconnected', qr: null, error: null, solution: null };
        isInitializing = false;
      });

      whatsappClient.initialize().catch((err: any) => {
        isInitializing = false;
        whatsappWebStatus = { 
          status: 'error', 
          qr: null, 
          error: err.message, 
          solution: "Puppeteer failed to launch. If you are on Render, make sure to use a environment that includes Chromium (e.g. use a Dockerfile or install chromium-browser). This won't affect core app functionality."
        };
        console.error("WhatsApp Web JS init error (deferred)", err);
      });

    } catch (err: any) {
      isInitializing = false;
      whatsappWebStatus = { 
        status: 'error', 
        qr: null, 
        error: err.message, 
        solution: "Make sure all Node dependencies for whatsapp-web.js are correctly compiled and present in your hosting environment."
      };
      console.error("WhatsApp Web JS import error", err);
    }
  }

  app.post("/api/whatsapp-web/start", async (req, res) => {
    initWhatsappWeb();
    res.json({ status: "starting" });
  });

  app.post("/api/whatsapp-web/stop", async (req, res) => {
    if (whatsappClient) {
       try {
         await whatsappClient.destroy();
         whatsappClient = null;
       } catch (e) {}
    }
    whatsappWebStatus = { status: 'disabled', qr: null, error: null, solution: null };
    res.json({ status: "stopped" });
  });

  app.get("/api/whatsapp-web/status", (req, res) => {
    res.json(whatsappWebStatus);
  });

  app.post("/api/whatsapp-web/send", async (req, res) => {
    try {
      const { to, message, mediaBase64, mediaName } = req.body;
      if (whatsappWebStatus.status !== 'connected' || !whatsappClient) {
         return res.status(400).json({ success: false, error: "WhatsApp Web not connected" });
      }
      
      let chatId = to;
      if (!chatId.includes('@')) {
         let mobile = chatId.replace(/\D/g, '');
         if (mobile.length === 10) {
           mobile = `91${mobile}`;
         } else if (mobile.length === 12 && mobile.startsWith('91')) {
           // already has 91
         } else if (mobile.length === 13 && mobile.startsWith('0')) {
           mobile = mobile.substring(mobile.length - 12);
         } else if (mobile.startsWith('91')) {
           // fallback but avoid double 91 if it seems long enough
           mobile = mobile;
         } else {
           mobile = `91${mobile}`; // generic fallback
         }
         chatId = `${mobile}@c.us`; 
      }
      
      let media = null;
      if (mediaBase64) {
         const { MessageMedia } = require('whatsapp-web.js');
         const b64Data = mediaBase64.includes(',') ? mediaBase64.split(',')[1] : mediaBase64;
         let mimeType = mediaBase64.match(/data:([a-zA-Z0-9]+\/[a-zA-Z0-9-.+]+).*,.*/);
         mimeType = mimeType && mimeType.length ? mimeType[1] : 'application/pdf';
         media = new MessageMedia(mimeType, b64Data, mediaName || undefined);
      }
      
      if (media) {
         await whatsappClient.sendMessage(chatId, media, { caption: message });
      } else {
         await whatsappClient.sendMessage(chatId, message);
      }
      
      res.json({ success: true });
    } catch(e: any) {
      res.status(500).json({ success: false, error: e.message });
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

startServer().catch(err => {
  console.error("CRITICAL SERVER STARTUP ERROR:", err);
  process.exit(1);
});
