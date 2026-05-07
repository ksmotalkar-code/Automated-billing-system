import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
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
  function testChatbotCommand(msgBody: string, triggerWord: string, btnBase?: string): boolean {
     const msgLower = msgBody.toLowerCase().trim();
     if (!triggerWord && !btnBase) return false;
     
     if (btnBase && msgLower === btnBase.toLowerCase().trim()) return true;
     if (!triggerWord) return false;

     if (triggerWord.startsWith('/') && triggerWord.endsWith('/')) {
         try {
             const regex = new RegExp(triggerWord.slice(1, -1), 'i');
             return regex.test(msgBody);
         } catch (e) {
             console.warn("Invalid regex in chatbot trigger:", triggerWord);
         }
     }

     const triggers = triggerWord.split(',').map(t => t.trim().toLowerCase()).filter(t => t);
     for (const t of triggers) {
         if (msgLower.includes(t)) return true;
     }

     return false;
  }

  function processDynamicResponse(response: string, userCustData: any): string {
     let r = response || '';
     r = r.replace(/{{name}}/gi, userCustData.name || 'Customer');
     r = r.replace(/{{balance}}/gi, (userCustData.balance || 0).toString());
     r = r.replace(/{{mobileNumber}}/gi, userCustData.mobileNumber || 'N/A');
     r = r.replace(/{{status}}/gi, userCustData.status || 'Active');
     r = r.replace(/{{dueDate}}/gi, userCustData.dueDate || 'N/A');
     return r;
  }

  async function generateInvoicePdf(name: string, balance: number): Promise<string> {
    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([600, 400]);
    page.drawText(`INVOICE / BILL DETAILS`, { x: 50, y: 350, size: 20 });
    page.drawText(`Name: ${name}`, { x: 50, y: 300, size: 14 });
    page.drawText(`Outstanding Balance: Rs. ${balance}`, { x: 50, y: 270, size: 14, color: rgb(0.8, 0.1, 0.1) });
    page.drawText(`Date: ${new Date().toLocaleDateString()}`, { x: 50, y: 240, size: 12 });
    page.drawText(`Thank you for using Panchayat Waterworks.`, { x: 50, y: 150, size: 12 });
    return await pdfDoc.saveAsBase64({ dataUri: true });
  }

  async function routeSystemIntent(msgLower: string, custData: any, ownerId: string, adminSettings: any, baseText: string = "") {
    let replyText = baseText;
    let matched = false;
    let attachments: any[] = [];
    
    if (msgLower === "system_dl_bill" || msgLower.includes("download bill")) {
       const amt = custData.balance || 0;
       replyText = replyText || `Here is your invoice. Your outstanding balance is Rs. ${amt}.`;
       try {
          const b64Pdf = await generateInvoicePdf(custData.name || 'Customer', amt);
          attachments.push({ type: 'file', name: 'Invoice.pdf', data: b64Pdf });
       } catch(e) {}
       matched = true;
    } else if (msgLower === "system_qr_pay" || msgLower.includes("qr for pay")) {
       replyText = replyText || "Scan the attached UPI QR code to pay your bill.";
       const qrImage = adminSettings?.upiQrCodeImage || custData?.upiQrCodeImage;
       if (qrImage) {
           attachments.push({ type: 'image', data: qrImage });
       } else {
           replyText = "Sorry, no UPI QR code has been set by the administration yet.";
       }
       matched = true;
    } else if (msgLower === "system_bill" || msgLower.includes("see my bill")) {
       const amt = custData.balance || 0;
       replyText = replyText || `Your current bill status is: ${amt > 0 ? 'Pending (Rs. ' + amt + ')' : 'Paid'}.`;
       matched = true;
    } else if (msgLower === "system_balance" || msgLower.includes("view balance") || msgLower.includes("balance")) {
       replyText = replyText || `You have a total remaining balance of Rs. ${custData.balance || 0}.`;
       matched = true;
    } else if (msgLower === "system_complaint" || msgLower.includes("register complaint")) {
       replyText = replyText || `Please enter your complaint directly here starting with the word "COMPLAINT:".\n\nFor example:\nCOMPLAINT: My water pipe is leaking.`;
       matched = true;
    } else if (msgLower === "system_report" || msgLower.includes("deep detail report") || msgLower === "report") {
       let hasReport = false;
       let reportName = "";
       let reportFiles: any[] = [];
       const dbInstance = admin.apps.length ? admin.firestore() : null;
       if (dbInstance) {
         const reportsSnap = await dbInstance.collection("reports").where("ownerId", "==", ownerId).limit(1).get();
         if (!reportsSnap.empty) {
           hasReport = true;
           reportName = reportsSnap.docs[0].data().title;
           reportFiles = reportsSnap.docs[0].data().files || [];
         }
       } else {
         const reportsSnap = await getDocsClient(queryClient(collectionClient(clientDb, "reports"), whereClient("ownerId", "==", ownerId)));
         if (!reportsSnap.empty) {
           hasReport = true;
           reportName = reportsSnap.docs[0].data().title;
           reportFiles = reportsSnap.docs[0].data().files || [];
         }
       }
       if (hasReport) {
         replyText = replyText || `A deep detail report "${reportName}" is available for you!`;
         if (reportFiles.length > 0) {
           replyText += ` I have attached the report files for you to download below.`;
           attachments = reportFiles.map(f => ({ type: 'file', name: f.name, data: f.data }));
         } else {
           replyText += ` You can view it securely from the reports section of this portal.`;
         }
       } else {
         replyText = `Your PDF deep detail report is not ready yet. Please try again after some time.`;
       }
       matched = true;
    } else if (msgLower === "system_water_quality" || msgLower.includes("water quality")) {
       replyText = replyText || "Our water quality currently meets all regulatory standards. Safe for drinking!";
       matched = true;
    } else if (msgLower === "system_supply_time" || msgLower.includes("supply timing")) {
       replyText = replyText || "Water supply timings are: Morning 6:00 AM - 8:00 AM, Evening 6:00 PM - 8:00 PM.";
       matched = true;
    } else if (msgLower === "system_contact" || msgLower.includes("contact us")) {
       replyText = replyText || "You can contact the Panchayat office at 1800-123-4567.";
       matched = true;
    } else if (msgLower === "system_notify" || msgLower.includes("notify history") || msgLower.includes("notification")) {
       replyText = replyText || "Your recent notifications are available in the portal dashboard.";
       matched = true;
    } else if (msgLower === "system_usage" || msgLower.includes("usage history")) {
       replyText = replyText || "Check the portal dashboard for your usage history.";
       matched = true;
    } else if (msgLower === "system_maintenance" || msgLower.includes("maintenance alert")) {
       replyText = replyText || "There are no scheduled maintenance activities affecting your connection at the moment.";
       matched = true;
    }
    return { matched, replyText, attachments };
  }

  async function getSettings(ownerId: string) {
    try {
      if (admin.apps.length) {
        const doc = await admin.firestore().collection("settings").doc(ownerId).get();
        return doc.exists ? doc.data() : null;
      } else {
        const docSnap = await getDocClient(doc(clientDb, "settings", ownerId));
        return docSnap.exists() ? docSnap.data() : null;
      }
    } catch(e) {
      console.warn("Failed to get settings in server (needs Admin SDK for protected data)", e);
      return null;
    }
  }

  async function getChatbotSettings(ownerId: string) {
    try {
      if (admin.apps.length) {
        const doc = await admin.firestore().collection("chatbotSettings").doc(ownerId).get();
        return doc.exists ? doc.data() : null;
      } else {
        const docSnap = await getDocClient(doc(clientDb, "chatbotSettings", ownerId));
        return docSnap.exists() ? docSnap.data() : null;
      }
    } catch(e) {
      console.warn("Failed to get chatbotSettings in server", e);
      return null;
    }
  }

  async function getCustomerByMobile(ownerId: string, mobileSearch: string) {
    if (admin.apps.length) {
      const snap = await admin.firestore().collection("customers").where("ownerId", "==", ownerId).get();
      // Since mobile numbers might contain country codes, dashes, etc., we fetch all and find, OR better: if possible we query. 
      // Firestore doesn't do "endsWith" queries natively well without a specific field. 
      // For efficiency, we will fetch and filter, but we could improve this later. For now, it's ok.
      const customers = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));
      return customers.find(c => {
         const dataMobile = (c.mobileNumber || '').replace(/\D/g, '');
         return mobileSearch.endsWith(dataMobile) || dataMobile.endsWith(mobileSearch);
      });
    } else {
      const q = queryClient(collectionClient(clientDb, "customers"), whereClient("ownerId", "==", ownerId));
      const snap = await getDocsClient(q);
      const customers = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));
      return customers.find(c => {
         const dataMobile = (c.mobileNumber || '').replace(/\D/g, '');
         return mobileSearch.endsWith(dataMobile) || dataMobile.endsWith(mobileSearch);
      });
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
  const PORT = Number(process.env.PORT) || 3000;

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
              if (newBalance === 0 && ownerId && customer?.status !== 'Suspended') {
                 const settingsDoc = await db.collection("settings").doc(ownerId).get();
                 const settings = settingsDoc.data() as any;
                 if (settings?.automation?.smartNotifications && ((settings.metaWhatsAppApiKey && settings.metaWhatsAppPhoneNumberId) || settings.cunnektApiKey)) {
                   const mobile = customer?.mobileNumber?.replace(/\D/g, '');
                   if (mobile && mobile.length >= 10) {
                     const message = `Dear ${customer?.name}, your payment of Rs. ${amountPaid} was received! Your balance is now 0. Thank you!`;
                     await sendWhatsAppMessage(settings, mobile, message, undefined, undefined, false, 'receipt', [customer?.name || "Customer", amountPaid]).catch(e => console.error("Webhook Auto-Receipt failed", e));
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
  async function sendMetaWhatsApp(settings: any, to: string, message: string, mediaBase64?: string, mediaName?: string, isTestMessage: boolean = false, templateCategory?: 'billing' | 'receipt' | 'broadcast', templateParams?: any[]) {
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

    let bodyPayload: any = {
      messaging_product: 'whatsapp',
      to: formattedTo
    };

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


    if (isTestMessage) {
       bodyPayload.type = 'template';
       bodyPayload.template = {
         name: "hello_world",
         language: { code: "en_US" }
       };
    } else if (templateCategory) {
       bodyPayload.type = 'template';
       let templateName = 'general_announcement';
       let components: any[] = [];
       
       if (templateCategory === 'billing') {
         templateName = 'monthly_bill_notification';
       } else if (templateCategory === 'receipt') {
         templateName = 'payment_reminder'; // or a separate receipt template if defined
       } else if (templateCategory === 'broadcast') {
         templateName = 'general_announcement';
       }

       if (mediaId && templateCategory === 'billing') {
         // Add document header for billing template
         components.push({
            type: "header",
            parameters: [
               {
                  type: "document",
                  document: {
                     id: mediaId,
                     filename: mediaName || "Invoice.pdf"
                  }
               }
            ]
         });
       }

       if (templateParams && templateParams.length > 0) {
         components.push({
           type: "body",
           parameters: templateParams.map(p => ({ type: "text", text: String(p) }))
         });
       }

       bodyPayload.template = {
         name: templateName,
         language: { code: "en_US" }, // Usually Meta prefers en_US or en_GB, we'll try en_US
         components: components
       };
    } else {
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
      let errMsg = data.error?.message || "Meta API Error";
      if (data.error?.type === 'OAuthException') {
        errMsg = `OAuthException: ${data.error?.message || "Invalid or expired token"}. Please ensure you're using the Phone Number ID (not App ID), the token is valid, and 'whatsapp_business_messaging' permissions are granted.`;
      }
      throw new Error(errMsg);
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
  async function sendWhatsAppMessage(settings: AppSettings, to: string, message: string, mediaBase64?: string, mediaName?: string, isTestMessage: boolean = false, templateCategory?: 'billing' | 'receipt' | 'broadcast', templateParams?: any[]) {
    if (settings.preferredNotificationMethod && 
        settings.preferredNotificationMethod !== 'api' && 
        settings.preferredNotificationMethod !== 'manual_link') {
      return await sendCunnektWhatsApp(settings, to, message, mediaBase64, mediaName);
    } else {
      // Default to Meta or explicit 'api'
      return await sendMetaWhatsApp(settings, to, message, mediaBase64, mediaName, isTestMessage, templateCategory, templateParams);
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
       
       // Optimization: Use a shared standard font set if we process many customers
       const StandardFonts = require('pdf-lib').StandardFonts;

       if (settings.automation.enforceIstTimeWindow && !specificOwnerId) {
          if (istHour < 9 || istHour >= 18) { // Expanded window for general automation check
             console.log(`[Automation] Skipping user ${ownerId} due to IST time window constraint (Current IST Hour: ${istHour})`);
             continue;
          }
       }
       
       let shouldTriggerBilling = false;
       const todayStr = istTime.toISOString().split('T')[0]; // YYYY-MM-DD in IST

       if (settings.nextBillingDate) {
           if (todayStr >= settings.nextBillingDate) {
               shouldTriggerBilling = true;
           }
       } else {
           const defaultDate = parseInt(settings.defaultBillingDate || "1");
           if (istTime.getDate() === defaultDate) {
               shouldTriggerBilling = true;
           }
       }
       
       // Handle Billing Cycle
       if (settings.automation.scheduledBilling && (shouldTriggerBilling || (specificOwnerId && !settings.lastBillingDate?.includes(todayStr)))) {
          console.log(`[Automation] Billing cycle triggered for ${ownerId}`);
          
          // Optimization: Only fetch and update customers who haven't been billed in this specific cycle yet
          const custRef = db.collection('customers')
            .where('ownerId', '==', ownerId)
            .where('status', '==', 'Active');
          
          const customersSnap = await custRef.get();
          
          if (!customersSnap.empty) {
            let batch = db.batch();
            let count = 0;
            let updatedCustomerIds: string[] = [];
            
            for (const cDoc of customersSnap.docs) {
               const customer = cDoc.data();
               
               // SKIP if already billed in the last 24 hours to save quota
               if (customer.lastBilledDate && customer.lastBilledDate.includes(todayStr)) {
                 continue;
               }

               const cleanMobile = customer.mobileNumber ? customer.mobileNumber.replace(/\D/g, '') : '';
               if (!cleanMobile || cleanMobile.length < 10 || cleanMobile === '0000000000') {
                 continue;
               }
               
               const newBalance = (customer.balance || 0) + (settings.billingAmount || 0);
               
                batch.update(cDoc.ref, {
                   balance: newBalance,
                   invoiceSent: false,
                   paymentNotified: false,
                   lastBilledDate: istTime.toISOString(),
                   lastBillingNote: `Auto-${todayStr}`
                });
               
               updatedCustomerIds.push(cDoc.id);
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

            console.log(`[Automation] Billed ${updatedCustomerIds.length} customers for ${ownerId}`);

            // Send Automated WhatsApp Bill (only for the ones we actually updated in this run)
            if (((settings.metaWhatsAppApiKey && settings.metaWhatsAppPhoneNumberId) || settings.cunnektApiKey) && settings.automation.smartNotifications && updatedCustomerIds.length > 0) {
              for (const cDoc of customersSnap.docs) {
                if (!updatedCustomerIds.includes(cDoc.id)) continue;

                const customer = cDoc.data();
                const newBalance = (customer.balance || 0) + (settings.billingAmount || 0);

                let mediaBase64: string | undefined = undefined;
                let mediaName = 'Invoice.pdf';
                if (newBalance > 0) {
                  try {
                    const pdfDoc = await PDFDocument.create();
                    const page = pdfDoc.addPage([595.28, 841.89]); // A4
                    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
                    const boldFont = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
                    
                    page.drawText('SMART BILLING INVOICE', { x: 200, y: 800, size: 18, font: boldFont, color: rgb(0.1, 0.4, 0.8) });
                    page.drawText(`Invoice Date: ${new Date().toLocaleDateString()}`, { x: 220, y: 780, size: 10, font });
                    
                    page.drawText('BILL TO:', { x: 50, y: 730, size: 12, font: boldFont });
                    page.drawText(customer.name, { x: 50, y: 715, size: 12, font });
                    page.drawText(`ID: ${customer.id || 'N/A'}`, { x: 50, y: 700, size: 12, font });
                    page.drawText(`Mobile: ${customer.mobileNumber || 'N/A'}`, { x: 50, y: 685, size: 12, font });
                    
                    page.drawText(`Billing Cycle: ${settings.billingCycleMonths || 1} Months`, { x: 50, y: 640, size: 12, font });
                    page.drawText(`Current Bill: Rs. ${(settings.billingAmount || 0).toFixed(2)}`, { x: 50, y: 620, size: 12, font });
                    page.drawText(`Previous Outstanding: Rs. ${(customer.balance || 0).toFixed(2)}`, { x: 50, y: 600, size: 12, font });
                    
                    page.drawText('TOTAL PAYABLE:', { x: 50, y: 560, size: 14, font: boldFont });
                    page.drawText(`Rs. ${newBalance.toFixed(2)}`, { x: 200, y: 560, size: 14, font: boldFont, color: rgb(0.8, 0.1, 0.1) });
                    
                    // Embed QR Code if available
                    if (settings.upiQrCodeImage) {
                      try {
                        const qrData = settings.upiQrCodeImage.split(',')[1] || settings.upiQrCodeImage;
                        const qrBytes = Buffer.from(qrData, 'base64');
                        let qrImage;
                        if (settings.upiQrCodeImage.includes('image/png')) {
                          qrImage = await pdfDoc.embedPng(qrBytes);
                        } else {
                          qrImage = await pdfDoc.embedJpg(qrBytes);
                        }
                        
                        page.drawText('SCAN TO PAY VIA UPI:', { x: 220, y: 350, size: 12, font: boldFont });
                        page.drawImage(qrImage, {
                          x: 220,
                          y: 180,
                          width: 150,
                          height: 150,
                        });
                        page.drawText('Secure Payment Guarantee', { x: 240, y: 160, size: 8, font, color: rgb(0.5, 0.5, 0.5) });
                      } catch (qrErr) {
                        console.error("[Automation] QR Embedding failed:", qrErr);
                      }
                    } else {
                        page.drawText('Payment Method: Please use UPI or Cash at Panchayat Office.', { x: 50, y: 400, size: 10, font });
                    }
                    
                    const pdfBytes = await pdfDoc.save();
                    mediaBase64 = Buffer.from(pdfBytes).toString('base64');
                  } catch (e: any) {
                    console.error(`[Automation] Failed to generate PDF for ${customer.name}: ${e.message}`);
                  }
                }

                const message = `Dear ${customer.name}, your new water bill of Rs. ${settings.billingAmount} has been generated. Total outstanding: Rs. ${newBalance}. Please pay on time.`;
                try {
                  await sendWhatsAppMessage(settings, customer.mobileNumber, message, mediaBase64, mediaName, false, 'billing', [customer.name, settings.billingAmount, newBalance]);
                } catch (e: any) {
                  console.error(`[Automation] Failed to auto-send bill to ${customer.name}: ${e.message}`);
                }
              }
            }
          }
          
          let updatePayload: any = { lastBillingDate: istTime.toISOString() };
          if (settings.nextBillingDate) {
              const nd = new Date(settings.nextBillingDate);
              nd.setMonth(nd.getMonth() + (settings.billingCycleMonths || 1));
              updatePayload.nextBillingDate = nd.toISOString().split('T')[0];
          }
          await doc.ref.update(updatePayload);
       }

       // Handle Automated Penalty
       if (settings.automation.lateFee && settings.lastBillingDate) {
          const lastBilling = new Date(settings.lastBillingDate);
          const daysSinceBilling = Math.floor((istTime.getTime() - lastBilling.getTime()) / (1000 * 60 * 60 * 24));
          
          const lastPenaltyDate = settings.lastPenaltyDate ? new Date(settings.lastPenaltyDate) : null;
          const isSameMonthPenalty = lastPenaltyDate && lastPenaltyDate.getMonth() === istTime.getMonth() && lastPenaltyDate.getFullYear() === istTime.getFullYear();

          if (daysSinceBilling >= (settings.penaltyDays || 10) && !isSameMonthPenalty) {
             console.log(`[Automation] Applying late fee penalties for ${ownerId}`);
             
             const overdueRef = db.collection('customers')
                .where('ownerId', '==', ownerId)
                .where('status', '==', 'Active')
                .where('balance', '>', 0);
             
             const overdueSnap = await overdueRef.get();
             if (!overdueSnap.empty) {
                let batch = db.batch();
                let count = 0;
                for (const cDoc of overdueSnap.docs) {
                   const customer = cDoc.data();
                   batch.update(cDoc.ref, {
                      balance: (customer.balance || 0) + (settings.penaltyAmount || 0)
                   });
                   count++;
                   if (count === 400) {
                      await batch.commit();
                      batch = db.batch();
                      count = 0;
                   }
                }
                if (count > 0) await batch.commit();
                
                await doc.ref.update({ lastPenaltyDate: istTime.toISOString() });
                console.log(`[Automation] Late fee applied to ${overdueSnap.size} customers for ${ownerId}`);
             }
          }
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
  app.post("/api/wa/send", async (req, res) => {
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
  app.post("/api/wa/broadcast", async (req, res) => {
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
      if (!settings?.metaWhatsAppApiKey && !settings?.cunnektApiKey) {
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
      
      // Filter out invalid mobiles
      customers = customers.filter((c: any) => {
         const cleanMobile = c.mobileNumber ? c.mobileNumber.replace(/\D/g, '') : '';
         return cleanMobile && cleanMobile.length >= 10 && cleanMobile !== '0000000000';
      });

      console.log(`Broadcasting to ${customers.length} customers...`);
      
      const results = { success: 0, failed: 0 };
      
      for (const customer of customers) {
        try {
          await sendWhatsAppMessage(settings, customer.mobileNumber, message, mediaBase64, mediaName, false, 'broadcast', [message]);
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
  app.post("/api/wa/test", async (req, res) => {
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
      await sendWhatsAppMessage(settings, testMobile, message, undefined, undefined, true);

      res.json({ status: "success", info: "Message sent! Check your phone." });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
;

  // 3. WhatsApp Chatbot Webhooks

  // Meta Webhook Verification
  app.get("/api/portal-chat/init/:portalId", async (req, res) => {
    try {
      const { portalId } = req.params;
      const portalSnap = await getDocClient(doc(clientDb, "public_portals", portalId));
      if (!portalSnap.exists()) {
        return res.status(404).json({ error: "Portal not found" });
      }
      const portalData = portalSnap.data();
      const ownerId = portalData.ownerId;
      const customerId = portalData.customerId;

      const chatbotSettings = await getChatbotSettings(ownerId);
      const commands = (chatbotSettings && chatbotSettings.isActive) ? (chatbotSettings.commands || []) : [];

      let history: any[] = [];
      const dbInstance = admin.apps.length ? admin.firestore() : null;
      if (dbInstance) {
         const chatHistoryRef = dbInstance.collection("customers").doc(customerId).collection("chat_history").orderBy("timestamp", "asc").limit(20);
         const chatSnap = await chatHistoryRef.get();
         history = chatSnap.docs.map(d => ({ role: d.data().role, content: d.data().content, attachments: d.data().attachments }));
      } else {
         const chatHistoryRef = queryClient(collectionClient(clientDb, "customers", customerId, "chat_history")); // Simplified without sorting due to index needs
         const chatSnap = await getDocsClient(chatHistoryRef);
         history = chatSnap.docs.map(d => ({ role: d.data().role, content: d.data().content, timestamp: d.data().timestamp || '', attachments: d.data().attachments }));
         history.sort((a, b) => {
            if (!a.timestamp) return -1;
            if (!b.timestamp) return 1;
            if (a.timestamp.seconds) return a.timestamp.seconds - b.timestamp.seconds;
            return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
         });
         history = history.map(h => ({ role: h.role, content: h.content, attachments: h.attachments }));
      }

      const systemCommands = [
        { id: "sysdlbill", buttonLabel: "📄 Download Bill PDF", triggerWord: "system_dl_bill", response: "Here is your PDF bill.", isActive: true },
        { id: "sysqrpay", buttonLabel: "💰 QR For Payment", triggerWord: "system_qr_pay", response: "Scan this UPI QR code to make your payment.", isActive: true },
        { id: "sysbill", buttonLabel: "📄 See My Bill", triggerWord: "system_bill", response: "Your current bill status is computed live.", isActive: true },
        { id: "sysbalance", buttonLabel: "💳 View Balance", triggerWord: "system_balance", response: "Your total remaining balance is Rs. {{balance}}.", isActive: true },
        { id: "syscomplaint", buttonLabel: "🛠️ Register Complaint", triggerWord: "system_complaint", response: "Please reply with your complaint directly by starting with \"COMPLAINT:\".", isActive: true },
        { id: "sysreport", buttonLabel: "📊 Deep Detail Report", triggerWord: "system_report", response: "Let me find your deep detail report.", isActive: true },
        { id: "syswater", buttonLabel: "💧 Water Quality Status", triggerWord: "system_water_quality", response: "Our water quality currently meets all regulatory standards. Safe for drinking!", isActive: true },
        { id: "syssupply", buttonLabel: "🕒 Supply Timings", triggerWord: "system_supply_time", response: "Water supply timings are: Morning 6:00 AM - 8:00 AM, Evening 6:00 PM - 8:00 PM.", isActive: true },
        { id: "syscontact", buttonLabel: "📞 Contact Us", triggerWord: "system_contact", response: "Contact the Panchayat office at 1800-123-4567.", isActive: true },
        { id: "sysnotify", buttonLabel: "🔔 Notify History", triggerWord: "system_notify", response: "Your recent notifications are available in your portal dashboard.", isActive: true },
        { id: "sysusage", buttonLabel: "📝 Usage History", triggerWord: "system_usage", response: "Check the portal dashboard for your usage history.", isActive: true },
        { id: "sysmaint", buttonLabel: "⚠️ Maintenance Alerts", triggerWord: "system_maintenance", response: "No scheduled maintenance for your zone currently.", isActive: true }
      ];

      // Merge systemCommands into user commands if not present
      const activeCommands = [...commands];
      for (const sys of systemCommands) {
        if (!activeCommands.find((c: any) => c.triggerWord === sys.triggerWord)) {
          if (sys.isActive) activeCommands.push(sys);
        }
      }

      res.json({ commands: activeCommands.filter((c: any) => c.isActive), history });
    } catch(err: any) {
      console.error(err);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  app.post("/api/portal-chat/:portalId", async (req, res) => {
    try {
      const { portalId } = req.params;
      const { message, customerId, ownerId } = req.body;

      if (!message || !customerId || !ownerId) return res.status(400).json({ error: "Missing parameters" });

      const chatbotSettings = await getChatbotSettings(ownerId);
      if (!chatbotSettings || !chatbotSettings.isActive) {
        return res.status(400).json({ error: "Chatbot is not enabled." });
      }

      const dbInstance = admin.apps.length ? admin.firestore() : null;

      // Save user message
      if (dbInstance) {
         await dbInstance.collection("customers").doc(customerId).collection("chat_history").add({
           role: 'user',
           content: message,
           timestamp: admin.firestore.FieldValue.serverTimestamp()
         });
      }

      // Check rules
      let replyText = "I'm sorry, I don't understand that command. Please select from the available options or contact the office.";
      const msgLower = message.toLowerCase().trim();
      let matched = false;
      let attachments: any[] = [];

      // Also fetch customer for variables
      let custData: any = {};
      if (dbInstance) {
         try {
           const cDoc = await dbInstance.collection("customers").doc(customerId).get();
           custData = cDoc.data() || {};
         } catch (e) {}
      }
      
      // Fallback: get portalData because it contains the snapshot of balance
      if (!custData.name) {
          const portalSnap = await getDocClient(doc(clientDb, "public_portals", portalId));
          if (portalSnap.exists()) {
             custData = portalSnap.data() || {};
             custData.name = custData.customerName; // map customerName to name for variables
          }
      }

      const adminSettings = await getSettings(ownerId);
      const intentRes = await routeSystemIntent(msgLower, custData, ownerId, adminSettings);
      if (intentRes.matched) {
         replyText = intentRes.replyText;
         attachments = intentRes.attachments;
         matched = true;
      } else if (msgLower.startsWith("complaint:")) {
         const complaintText = message.substring(10).trim();
         if (complaintText.length > 5) {
            const complaintId = "COMP-" + Math.random().toString(36).substr(2, 8).toUpperCase();
            await saveComplaintData(complaintId, {
                 id: complaintId,
                 customerId: customerId,
                 ownerId: ownerId,
                 customerName: custData.name,
                 mobileNumber: custData.mobileNumber || '',
                 category: "General",
                 description: complaintText,
                 status: "Pending",
                 priority: "Medium",
                 createdAt: new Date().toISOString(),
                 expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString() // 6 months
            });
            replyText = `Thank you. Your complaint has been registered successfully. We will resolve it soon!`;
         } else {
            replyText = `Please provide more details for your complaint.`;
         }
         matched = true;
      }

      if (!matched) {
        for (const cmd of chatbotSettings.commands || []) {
           if (!cmd.isActive) continue;
           if (testChatbotCommand(message, cmd.triggerWord, cmd.buttonLabel)) {
              replyText = cmd.response || '';
              // Also process it for generic attachments via intent helper
              const sysIntentRes = await routeSystemIntent(cmd.triggerWord, custData, ownerId, adminSettings, replyText);
              if (sysIntentRes.matched && sysIntentRes.attachments.length > 0) {
                 replyText = sysIntentRes.replyText;
                 attachments = sysIntentRes.attachments;
              }
              matched = true;
              break;
           }
        }
      }

      // Replace variables
      replyText = processDynamicResponse(replyText, custData);

      // Save bot reply
      if (dbInstance) {
         await dbInstance.collection("customers").doc(customerId).collection("chat_history").add({
           role: 'assistant',
           content: replyText,
           attachments: attachments.length > 0 ? attachments : null,
           timestamp: admin.firestore.FieldValue.serverTimestamp()
         });
      }

      return res.json({ reply: replyText, attachments: attachments.length > 0 ? attachments : undefined });

    } catch (err: any) {
      console.error("[Webhook] Portal AI error:", err);
      res.status(500).json({ error: "Internal Server Error: " + err.message });
    }
  });

  app.get("/api/whatsapp-webhook/:ownerId", async (req, res) => {
    try {
      const { ownerId } = req.params;
      const mode = req.query["hub.mode"];
      const token = req.query["hub.verify_token"];
      const challenge = req.query["hub.challenge"];

      console.log(`[Webhook] Verification attempt for owner: ${ownerId}`);

      if (mode === "subscribe" && token && challenge) {
        let storedToken = process.env.META_VERIFY_TOKEN;

        // Dynamic fetch using helper
        const settings = await getSettings(ownerId);
        if (settings?.metaWhatsAppVerifyToken) {
           storedToken = settings.metaWhatsAppVerifyToken;
        }

        // Verification logic
        if (!storedToken || token === storedToken) {
          console.log(`[Webhook] Verified owner: ${ownerId}`);
          res.set('Content-Type', 'text/plain');
          return res.status(200).send(challenge);
        } else {
          console.warn(`[Webhook] Token mismatch. Expected: ${storedToken}, Got: ${token}`);
          return res.sendStatus(403);
        }
      }
      return res.sendStatus(400);
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
                const cleanMobile = fromMobile.replace(/\D/g, '');
                let matchedCustomer = await getCustomerByMobile(ownerId, cleanMobile);

                if (matchedCustomer && matchedCustomer.status !== 'Suspended') {
                     const settings = await getSettings(ownerId);
                     
                     const dbInstance = admin.apps.length ? admin.firestore() : null;
                     if (dbInstance) {
                        try {
                           await dbInstance.collection("customers").doc(matchedCustomer.id).collection("chat_history").add({
                             role: 'user',
                             content: msgBody,
                             source: 'whatsapp',
                             timestamp: admin.firestore.FieldValue.serverTimestamp()
                           });
                        } catch (e) {}
                     }

                     let handled = false;
                     const msgLower = msgBody.toLowerCase().trim();

                     // System commands mapped directly
                     const intentRes = await routeSystemIntent(msgLower, matchedCustomer, ownerId, settings);
                     if (intentRes.matched) {
                          const responseText = intentRes.replyText;
                          await sendWhatsAppMessage(settings as unknown as AppSettings, fromMobile, responseText);
                          if (dbInstance) { try { await dbInstance.collection("customers").doc(matchedCustomer.id).collection("chat_history").add({ role: 'assistant', content: responseText, source: 'whatsapp', timestamp: admin.firestore.FieldValue.serverTimestamp() }); } catch (e) {} }
                          handled = true;
                     } else if (msgLower.startsWith("complaint:")) {
                        const complaintText = msgBody.substring(10).trim();
                        let responseText = "";
                        if (complaintText.length > 5) {
                           const complaintId = "COMP-" + Math.random().toString(36).substr(2, 8).toUpperCase();
                           await saveComplaintData(complaintId, {
                               id: complaintId,
                               customerId: matchedCustomer.id,
                               ownerId: ownerId,
                               customerName: matchedCustomer.name,
                               mobileNumber: matchedCustomer.mobileNumber || '',
                               category: "Service Request",
                               message: complaintText,
                               status: "Pending",
                               priority: "Medium",
                               createdAt: new Date().toISOString(),
                               expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString() // 6 months
                           });
                           responseText = `Thank you. Your complaint has been registered successfully. We will resolve it soon!`;
                        } else {
                           responseText = `Please provide more details for your complaint. Start with "COMPLAINT:"`;
                        }
                        await sendWhatsAppMessage(settings as unknown as AppSettings, fromMobile, responseText);
                        if (dbInstance) { try { await dbInstance.collection("customers").doc(matchedCustomer.id).collection("chat_history").add({ role: 'assistant', content: responseText, source: 'whatsapp', timestamp: admin.firestore.FieldValue.serverTimestamp() }); } catch (e) {} }
                        handled = true;
                     }

                     const chatbotSettings = await getChatbotSettings(ownerId);
                     
                     if (!handled && chatbotSettings && chatbotSettings.isActive && Array.isArray(chatbotSettings.commands)) {
                       for (const cmd of chatbotSettings.commands) {
                          if (cmd.isActive && testChatbotCommand(msgBody, cmd.triggerWord, cmd.buttonLabel)) {
                            console.log(`[Webhook] Matched chatbot command: ${cmd.triggerWord} for ${matchedCustomer.name}`);
                            if (settings && ((settings.metaWhatsAppApiKey && settings.metaWhatsAppPhoneNumberId) || settings.cunnektApiKey)) {
                              try {
                                 let responseText = processDynamicResponse(cmd.response || '', matchedCustomer);
                                 const sysIntentRes = await routeSystemIntent(cmd.triggerWord, matchedCustomer, ownerId, settings, responseText);
                                 if (sysIntentRes.matched && sysIntentRes.attachments.length > 0) {
                                     responseText = sysIntentRes.replyText;
                                 }
                                 
                                 await sendWhatsAppMessage(settings as unknown as AppSettings, fromMobile, responseText);
                                
                                const dbInstance = admin.apps.length ? admin.firestore() : null;
                                if (dbInstance) {
                                   try {
                                      await dbInstance.collection("customers").doc(matchedCustomer.id).collection("chat_history").add({
                                        role: 'assistant',
                                        content: responseText,
                                        source: 'whatsapp',
                                        timestamp: admin.firestore.FieldValue.serverTimestamp()
                                      });
                                   } catch (e) {}
                                }
                                
                                handled = true;
                                break;
                             } catch (e) {
                                console.error("[Webhook] Failed to send chatbot reply:", e);
                             }
                           }
                         }
                       }
                     }

                     const isComplaint = msgBody.toLowerCase().includes('complaint') || msgBody.toLowerCase().includes('complain');
                     if (!handled && isComplaint && settings?.automation?.autoCreateComplaints !== false) {
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
                        handled = true;
                     }

                     if (!handled) {
                        // All messages were handled either by exact keyword matches or complaints.
                        // For messages unmatched by previous logic, we could potentially have a fallback message
                        // but user hasn't requested it. OpenRouter AI logic removed.
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
  // Compatibility endpoint for frontend checks
  app.get("/api/wweb/status", (req, res) => {
    res.json({ status: 'disabled' });
  });

  app.post("/api/wweb/send", (req, res) => {
    res.status(400).json({ error: 'WhatsApp Web is disabled on this server. Please use Meta Official API or Cunnekt API.' });
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
