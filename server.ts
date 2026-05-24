import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import express from "express";
import path from "path";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import admin from "firebase-admin";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
// Support for Client SDK Fallback (Service User Pattern)
import { initializeApp as initializeClientApp } from "firebase/app";
import {
  getFirestore as getClientFirestore,
  doc as docClient,
  getDoc as getDocClient,
  collection as collectionClient,
  query as queryClient,
  where as whereClient,
  getDocs as getDocsClient,
  setDoc as setDocClient,
} from "firebase/firestore";
import {
  getAuth as getClientAuth,
  signInWithEmailAndPassword,
} from "firebase/auth";
import fs from "fs";

enum OperationType {
  CREATE = "create",
  UPDATE = "update",
  DELETE = "delete",
  LIST = "list",
  GET = "get",
  WRITE = "write",
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
  };
}

function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: "server-admin",
    },
    operationType,
    path,
  };
  console.error("[Firestore Error Details]:", JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

// Load config from root regardless of where the script runs
const configPath = path.resolve(process.cwd(), "firebase-applet-config.json");
const firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));

const DEFAULT_SYSTEM_COMMANDS = [
  {
    id: "sysdlbill",
    buttonLabel: "📄 Download Bill PDF",
    triggerWord: "Download Bill",
    response: "Here is your PDF bill.",
    isActive: true,
  },
  {
    id: "sysqrpay",
    buttonLabel: "💰 QR For Payment",
    triggerWord: "Pay Bill",
    response: "Scan this UPI QR code to make your payment.",
    isActive: true,
  },
  {
    id: "sysbill",
    buttonLabel: "📄 See My Bill",
    triggerWord: "My Bill",
    response: "Your current bill status is computed live.",
    isActive: true,
  },
  {
    id: "sysbalance",
    buttonLabel: "💳 View Balance",
    triggerWord: "Check Balance",
    response: "Your total remaining balance is Rs. {{balance}}.",
    isActive: true,
  },
  {
    id: "syscomplaint",
    buttonLabel: "🛠️ Register Complaint",
    triggerWord: "Complaint",
    response: "Please describe your complaint in the next message.",
    isActive: true,
  },
  {
    id: "sysreport",
    buttonLabel: "📊 Deep Detail Report",
    triggerWord: "Deep Report",
    response: "Let me find your deep detail report.",
    isActive: true,
  },
  {
    id: "syswater",
    buttonLabel: "💧 Water Quality",
    triggerWord: "Water Quality",
    response:
      "Our water quality currently meets all regulatory standards. Safe for drinking!",
    isActive: true,
  },
  {
    id: "syssupply",
    buttonLabel: "🕒 Supply Timings",
    triggerWord: "Supply Timings",
    response:
      "Water supply timings are: Morning 6:00 AM - 8:00 AM, Evening 6:00 PM - 8:00 PM.",
    isActive: true,
  },
  {
    id: "syscontact",
    buttonLabel: "📞 Contact Us",
    triggerWord: "Contact",
    response: "Contact the Panchayat office at 1800-123-4567.",
    isActive: true,
  },
  {
    id: "sysnotify",
    buttonLabel: "🔔 Notify History",
    triggerWord: "Notifications",
    response:
      "Your recent notifications are available in your portal dashboard.",
    isActive: true,
  },
  {
    id: "sysusage",
    buttonLabel: "📝 Usage History",
    triggerWord: "Usage",
    response: "Check the portal dashboard for your usage history.",
    isActive: true,
  },
  {
    id: "sysmaint",
    buttonLabel: "⚠️ Maintenance Alerts",
    triggerWord: "Maintenance",
    response: "No scheduled maintenance for your zone currently.",
    isActive: true,
  },
  {
    id: "syslink",
    buttonLabel: "🔗 Portal Link",
    triggerWord: "Link",
    response: "Here is your portal link.",
    isActive: true,
  },
];

function getAdminDb() {
  if (!admin.apps.length) return null;
  try {
    const adminApp = admin.apps[0];

    // Determine whether to use the specific Database ID or the default
    let saProjectId;
    try {
      if (
        process.env.FIREBASE_SERVICE_ACCOUNT &&
        process.env.FIREBASE_SERVICE_ACCOUNT.trim().startsWith("{")
      ) {
        saProjectId = JSON.parse(
          process.env.FIREBASE_SERVICE_ACCOUNT,
        ).project_id;
      }
    } catch (e) {}

    // Attempt to connect to the specific database instance, or use default if specified
    if (
      firebaseConfig.firestoreDatabaseId &&
      firebaseConfig.firestoreDatabaseId !== "(default)" &&
      firebaseConfig.firestoreDatabaseId !== "default" &&
      (!saProjectId || saProjectId === firebaseConfig.projectId)
    ) {
      return getFirestore(adminApp, firebaseConfig.firestoreDatabaseId);
    } else {
      // Using custom service account or default db ID
      return getFirestore(adminApp);
    }
  } catch (err: any) {
    if (err.code === 5 || (err.message && err.message.includes("NOT_FOUND"))) {
      let saProjectId = "unknown";
      try {
        if (process.env.FIREBASE_SERVICE_ACCOUNT) {
          saProjectId = JSON.parse(
            process.env.FIREBASE_SERVICE_ACCOUNT,
          ).project_id;
        }
      } catch (e) {}

      console.error(
        `\n=======================================================\n[ACTION REQUIRED] Firestore Database Not Found!\nYour Admin SDK is connected to the project: ${saProjectId}\nHowever, this project DOES NOT have a Firestore Database created yet.\n\nPlease go to:\nhttps://console.firebase.google.com/project/${saProjectId}/firestore\nAnd click "Create Database".\n=======================================================\n`,
      );
      return null;
    }
    console.error("Error getting Admin Firestore:", err.message);
    return null;
  }
}

function getRequiredAdminDb() {
  const db = getAdminDb();
  if (!db) {
    const msg =
      "CRITICAL: Firebase Admin Database is not available. This is often due to a Project ID mismatch or missing FIREBASE_SERVICE_ACCOUNT. Check server logs for details.";
    console.error(msg);
    throw new Error(msg);
  }
  return db;
}

export async function getSettings(
  ownerId: string,
): Promise<AppSettings | null> {
  const adminDb = getAdminDb();
  if (adminDb) {
    try {
      const docRef = adminDb.collection("settings").doc(ownerId);
      const snap = await docRef.get();
      if (snap.exists) return snap.data() as AppSettings;
    } catch (error: any) {
      handleFirestoreError(error, OperationType.GET, `settings/${ownerId}`);
    }
  }

  try {
    // Fallback to client SDK
    const docRef = docClient(clientDb, "settings", ownerId);
    const snap = await getDocClient(docRef);
    if (snap.exists()) return snap.data() as AppSettings;
  } catch (error) {
    console.error("Client getSettings error:", error);
  }
  return null;
}

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
  publicPortalBaseUrl?: string;
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
  metaTemplateBilling?: string;
  metaTemplateReceipt?: string;
  metaTemplateBroadcast?: string;
  metaCustomTemplates?: any[];
  watiAccessToken?: string;
  watiApiEndpoint?: string;
  preferredNotificationMethod?: string;
  paymentGatewayKey?: string;
  paymentGatewaySecret?: string;
  enableWhatsappWeb?: boolean;
  automation?: AutomationSettings;
}

// Optional: Initialize Firebase Admin gracefully
if (
  process.env.FIREBASE_SERVICE_ACCOUNT &&
  process.env.FIREBASE_SERVICE_ACCOUNT.trim().startsWith("{")
) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    const saProjectId = serviceAccount.project_id;
    const configProjectId = firebaseConfig.projectId;

    if (saProjectId !== configProjectId) {
      console.warn(
        `[FIREBASE] Project ID mismatch DETECTED on service account! SA Project: ${saProjectId}, Config Project: ${configProjectId}. Admin DB operations may not work as expected.`,
      );
    }

    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: firebaseConfig.storageBucket,
      });
      console.log("Firebase Admin Initialized Successfully.");
    }
  } catch (error) {
    console.error("Failed to parse FIREBASE_SERVICE_ACCOUNT", error);
  }
} else if (process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.warn(
    "FIREBASE_SERVICE_ACCOUNT found but is not valid JSON. Ignoring.",
  );
} else {
  console.warn(
    "FIREBASE_SERVICE_ACCOUNT not found. Attempting to use Google Cloud Application Default Credentials (ADC)...",
  );
  try {
    if (!admin.apps.length) {
      admin.initializeApp({
        credential: admin.credential.applicationDefault(),
        projectId: firebaseConfig.projectId,
        storageBucket: firebaseConfig.storageBucket,
      });
      console.log(
        "Firebase Admin Initialized using Application Default Credentials (ADC).",
      );
    }
  } catch (err: any) {
    console.warn(
      "Failed to initialize with ADC. Webhook/Cron automation will be limited. You can still use the app.",
      err.message,
    );
  }
}

// Initialize Client SDK as a fallback for Hosted environments (Service User Pattern)
const clientApp = initializeClientApp(firebaseConfig);
const clientDbId =
  firebaseConfig.firestoreDatabaseId === "(default)" ||
  firebaseConfig.firestoreDatabaseId === "default"
    ? undefined
    : firebaseConfig.firestoreDatabaseId;
const clientDb = getClientFirestore(clientApp, clientDbId);
const clientAuth = getClientAuth(clientApp);

// Attempt to log in as a "Service User" if configured
const botEmail = process.env.BACKEND_BOT_EMAIL;
const botPassword = process.env.BACKEND_BOT_PASSWORD;

if (botEmail && botPassword) {
  signInWithEmailAndPassword(clientAuth, botEmail, botPassword)
    .then((user) =>
      console.log(`✓ Backend LOGGED IN as service user: ${botEmail}`),
    )
    .catch((err) =>
      console.error(`✗ Backend FAILED to log in as ${botEmail}:`, err.message),
    );
} else if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  console.warn(
    "No FIREBASE_SERVICE_ACCOUNT and no BACKEND_BOT_EMAIL. Webhooks will not be able to access your database.",
  );
}

// Database helpers to support both Admin SDK and Client SDK fallback
function testChatbotCommand(
  msgBody: string,
  triggerWord: string,
  btnBase?: string,
): boolean {
  const msgLower = msgBody.toLowerCase().trim();
  if (!triggerWord && !btnBase) return false;

  if (btnBase) {
    const btnLower = btnBase.toLowerCase().trim();
    if (msgLower === btnLower) return true;

    // Strip emojis and check again (human-friendly matching)
    const btnNoEmoji = btnBase
      .replace(
        /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{1F900}-\u{1F9FF}\u{1F1E6}-\u{1F1FF}]/gu,
        "",
      )
      .trim()
      .toLowerCase();
    if (msgLower === btnNoEmoji && btnNoEmoji.length > 3) return true;
  }
  if (!triggerWord) return false;

  if (triggerWord.startsWith("/") && triggerWord.endsWith("/")) {
    try {
      const regex = new RegExp(triggerWord.slice(1, -1), "i");
      return regex.test(msgBody);
    } catch (e) {
      console.warn("Invalid regex in chatbot trigger:", triggerWord);
    }
  }

  const triggers = triggerWord
    .split(",")
    .map((t) => t.trim().toLowerCase())
    .filter((t) => t);
  for (const t of triggers) {
    if (msgLower.includes(t)) return true;
  }

  return false;
}

function processDynamicResponse(response: string, userCustData: any): string {
  let r = response || "";
  r = r.replace(/{{name}}/gi, userCustData.name || "Customer");
  r = r.replace(/{{balance}}/gi, (userCustData.balance || 0).toString());
  r = r.replace(/{{mobileNumber}}/gi, userCustData.mobileNumber || "N/A");
  r = r.replace(/{{status}}/gi, userCustData.status || "Active");
  r = r.replace(/{{dueDate}}/gi, userCustData.dueDate || "N/A");
  return r;
}

const SERVER_TRANSLATIONS: any = {
  en: {
    invoiceMsg: "Here is your invoice. Your outstanding balance is Rs. {{amt}}.",
    paymentSuccess: "Dear {{name}}, your payment of Rs. {{amt}} was received! Your balance is now 0. Thank you!",
    receipt: "PAYMENT RECEIPT",
    invoice: "INVOICE / BILL DETAILS",
    name: "Name",
    amountPaidLabel: "Amount Paid",
    balanceLabel: "Outstanding Balance",
    date: "Date",
    thankYou: "Thank you for using SmartBilling.",
    payBillMsg: "Scan the attached UPI QR code to pay your bill.",
    noQrCodeMsg: "Sorry, no UPI QR code has been set by the administration yet."
  },
  hi: {
    invoiceMsg: "यहाँ आपका चालान है। आपकी बकाया राशि रु. {{amt}} है।",
    paymentSuccess: "प्रिय {{name}}, आपका रु. {{amt}} का भुगतान प्राप्त हुआ! आपका बैलेंस अब 0 है। धन्यवाद!",
    receipt: "PAYMENT RECEIPT (भुगतान रसीद)",
    invoice: "INVOICE (चालान विवरण)",
    name: "Name (नाम)",
    amountPaidLabel: "Amount Paid (भुगतान राशि)",
    balanceLabel: "Balance (बकाया)",
    date: "Date (दिनांक)",
    thankYou: "Thank you for using SmartBilling. धन्यवाद।",
    payBillMsg: "अपने बिल का भुगतान करने के लिए संलग्न UPI QR कोड को स्कैन करें।",
    noQrCodeMsg: "क्षमा करें, प्रशासन द्वारा अभी तक कोई UPI QR कोड सेट नहीं किया गया है।"
  },
  pa: {
    invoiceMsg: "ਇੱਥੇ ਤੁਹਾਡਾ ਇਨਵੌਇਸ ਹੈ। ਤੁਹਾਡੀ ਬਾਕੀ ਰਕਮ ਰੁਪਏ {{amt}} ਹੈ।",
    paymentSuccess: "ਪਿਆਰੇ {{name}}, ਤੁਹਾਡਾ ਰੁਪਏ {{amt}} ਦਾ ਭੁਗਤਾਨ ਪ੍ਰਾਪਤ ਹੋਇਆ! ਤੁਹਾਡਾ ਬਾਕੀ ਹੁਣ 0 ਹੈ। ਧੰਨਵਾਦ!",
    receipt: "PAYMENT RECEIPT (ਭੁਗਤਾਨ ਰਸੀਦ)",
    invoice: "INVOICE (ਬਿੱਲ ਵੇਰਵੇ)",
    name: "Name (ਨਾਮ)",
    amountPaidLabel: "Amount Paid (ਭੁਗਤਾਨ)",
    balanceLabel: "Balance (ਬਾਕੀ)",
    date: "Date (ਮਿਤੀ)",
    thankYou: "Thank you for using SmartBilling. ਧੰਨਵਾਦ।",
    payBillMsg: "ਆਪਣੇ ਬਿੱਲ ਦਾ ਭੁਗਤਾਨ ਕਰਨ ਲਈ ਨੱਥੀ UPI QR ਕੋਡ ਨੂੰ ਸਕੈਨ ਕਰੋ।",
    noQrCodeMsg: "ਮਾਫ ਕਰਨਾ, ਪ੍ਰਸ਼ਾਸਨ ਦੁਆਰਾ ਅਜੇ ਤੱਕ ਕੋਈ UPI QR ਕੋਡ ਸੈੱਟ ਨਹੀਂ ਕੀਤਾ ਗਿਆ ਹੈ।"
  }
};

function getSvrT(lang: string = 'en', key: string, params: any = {}) {
  const translations = SERVER_TRANSLATIONS[lang] || SERVER_TRANSLATIONS['en'];
  let text = translations[key] || SERVER_TRANSLATIONS['en'][key] || key;
  Object.keys(params).forEach(k => {
    text = text.replace(`{{${k}}}`, params[k]);
  });
  return text;
}

async function generateInvoicePdf(
  name: string,
  balance: number,
  amountPaid?: number,
  templateImage?: string | null,
  lang: string = 'en'
): Promise<string> {
  const pdfDoc = await PDFDocument.create();
  const page = pdfDoc.addPage([600, 480]);
  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  if (templateImage) {
    try {
      let image;
      let imgData: any;
      if (templateImage.startsWith("http://") || templateImage.startsWith("https://")) {
        const res = await fetch(templateImage);
        imgData = await res.arrayBuffer();
      } else {
        imgData = templateImage.split(',')[1] || templateImage;
      }
      
      if (templateImage.includes('png') || templateImage.includes('.png')) {
        image = await pdfDoc.embedPng(imgData);
      } else {
        image = await pdfDoc.embedJpg(imgData);
      }
      
      const dims = image.scaleToFit(600, 480);
      page.drawImage(image, {
        x: page.getWidth() / 2 - dims.width / 2,
        y: page.getHeight() / 2 - dims.height / 2,
        width: dims.width,
        height: dims.height,
        opacity: 0.3, // Faint background so text is readable
      });
    } catch (e) {
      console.error("Failed to embed template image", e);
    }
  }

  const t = (k: string, p?: any) => getSvrT(lang, k, p);

  if (amountPaid !== undefined && balance === 0) {
    page.drawText(t('receipt'), {
      x: 50,
      y: 400,
      size: 20,
      font: fontBold,
      color: rgb(0.1, 0.6, 0.2),
    });
    page.drawText(`${t('name')}: ${name}`, { x: 50, y: 340, size: 14, font });
    page.drawText(`${t('amountPaidLabel')}: Rs. ${amountPaid}`, {
      x: 50,
      y: 310,
      size: 14,
      font,
      color: rgb(0.1, 0.6, 0.2),
    });
    page.drawText(`${t('balanceLabel')}: Rs. 0`, { x: 50, y: 280, size: 14, font });
  } else {
    page.drawText(t('invoice'), { x: 50, y: 400, size: 20, font: fontBold });
    page.drawText(`${t('name')}: ${name}`, { x: 50, y: 340, size: 14, font });
    page.drawText(`${t('balanceLabel')}: Rs. ${balance}`, {
      x: 50,
      y: 310,
      size: 14,
      font,
      color: rgb(0.8, 0.1, 0.1),
    });
    if (amountPaid) {
      page.drawText(`${t('amountPaidLabel')}: Rs. ${amountPaid}`, {
        x: 50,
        y: 280,
        size: 12,
        font,
        color: rgb(0.1, 0.6, 0.2),
      });
    }
  }

  page.drawText(`${t('date')}: ${new Date().toLocaleDateString()}`, {
    x: 50,
    y: 200,
    size: 12,
    font
  });
  page.drawText(t('thankYou'), {
    x: 50,
    y: 150,
    size: 12,
    font
  });
  return await pdfDoc.saveAsBase64({ dataUri: true });
}

async function routeSystemIntent(
  rawMsgLower: string,
  custData: any,
  ownerId: string,
  adminSettings: any,
  baseText: string = "",
  chatbotSettings?: any,
  reqHost: string = "your-app-url",
) {
  const msgLower = (rawMsgLower || "").toLowerCase().trim();
  let replyText = baseText;
  let matched = false;
  let attachments: any[] = [];
  let action: string = "";

  if (
    msgLower === "download bill" ||
    msgLower === "download my bill" ||
    msgLower === "sysdlbill" ||
    msgLower === "system_dl_bill" ||
    msgLower.includes("invoice")
  ) {
    const amt = custData.balance || 0;
    const lang = adminSettings?.preferredLanguage || 'en';
    replyText =
      replyText ||
      getSvrT(lang, 'invoiceMsg', { amt });
    try {
      const b64Pdf = await generateInvoicePdf(
        custData.name || "Customer", 
        amt, 
        undefined, 
        adminSettings?.billTemplateImage,
        lang
      );
      attachments.push({ type: "file", name: "Invoice.pdf", data: b64Pdf });
    } catch (e) {
      console.error("PDF generation failed:", e);
    }
    matched = true;
  } else if (
    msgLower === "pay bill" ||
    msgLower === "system_qr_pay" ||
    msgLower.includes("qr for pay") ||
    msgLower.includes("upi")
  ) {
    const lang = adminSettings?.preferredLanguage || 'en';
    replyText = replyText || getSvrT(lang, 'payBillMsg');
    const qrImage = adminSettings?.upiQrCodeImage || custData?.upiQrCodeImage;
    if (qrImage) {
      const ext = qrImage.includes("png") ? ".png" : ".jpg";
      attachments.push({ type: "image", data: qrImage, name: `qrcode${ext}` });
    } else {
      replyText = getSvrT(lang, 'noQrCodeMsg');
    }
    matched = true;
  } else if (
    msgLower === "hi" ||
    msgLower === "hello" ||
    msgLower === "menu" ||
    msgLower === "help"
  ) {
    const userCommands = chatbotSettings?.commands || [];
    const activeCommands = [...userCommands];

    for (const sys of DEFAULT_SYSTEM_COMMANDS) {
      if (!activeCommands.find((c: any) => c.triggerWord === sys.triggerWord)) {
        if (sys.isActive) activeCommands.push(sys);
      }
    }

    const activeFiltered = activeCommands.filter((c: any) => c.isActive);

    let cmdListText = activeFiltered
      .map((cmd, idx) => {
        let emoji = "🔹";
        switch (idx % 6) {
          case 0:
            emoji = "1️⃣";
            break;
          case 1:
            emoji = "2️⃣";
            break;
          case 2:
            emoji = "3️⃣";
            break;
          case 3:
            emoji = "4️⃣";
            break;
          case 4:
            emoji = "5️⃣";
            break;
          case 5:
            emoji = "6️⃣";
            break;
        }
        // Use trigger word as instruction if description is too long, we keep it simple here
        return `${emoji} *${cmd.triggerWord}* - ${cmd.buttonLabel}`;
      })
      .join("\n");

    replyText = `Hello ${custData.name}! I am your Smart Billing Assistant. How can I help you today?
       
Available Commands:
${cmdListText}`;
    matched = true;
  } else if (
    msgLower === "my bill" ||
    msgLower === "system_bill" ||
    msgLower.includes("see my bill") ||
    msgLower === "bill"
  ) {
    const amt = custData.balance || 0;
    replyText =
      replyText ||
      `Your current bill status is: ${amt > 0 ? "Pending (Rs. " + amt + ")" : "Paid"}.`;
    matched = true;
  } else if (
    msgLower === "check balance" ||
    msgLower === "system_balance" ||
    msgLower.includes("view balance") ||
    msgLower.includes("balance")
  ) {
    replyText =
      replyText ||
      `You have a total remaining balance of Rs. ${custData.balance || 0}.`;
    matched = true;
  } else if (
    msgLower === "complaint" ||
    msgLower === "complaints" ||
    msgLower === "syscomplaint" ||
    msgLower === "system_complaint" ||
    msgLower.includes("register complaint") ||
    msgLower === "issue"
  ) {
    replyText =
      replyText ||
      `Please describe your complaint in the next message.`;
    matched = true;
    action = "complaint";
  } else if (
    msgLower === "monthly report" ||
    msgLower === "sysmonthly" ||
    msgLower.includes("monthly report")
  ) {
    replyText = replyText || "Which month's report do you need? (e.g. January 2026)";
    matched = true;
    action = "monthly_report";
  } else if (
    msgLower === "deep report" ||
    msgLower === "system_report" ||
    msgLower.includes("deep detail report") ||
    msgLower === "report"
  ) {
    replyText =
      replyText ||
      `Thank you for asking for a Deep Detail Report. Please specify the month and the corresponding bill or voucher number you are inquiring about.

For Example - 
1. January me Sekhupuria Gurdwara ke paas Jo pipe leak repair ki hai uska d joint kha se purchase Kiya or kitne ka aaya
2. Feburary me Bleaching powder kitne rupay ka lekar aaye
3. November me jo motor repair karvai thi usme jo new wire lagi. Motor khol kr dikhao ki lagi hai ya nhi.

After submitting your inquiry, please wait for a response. We will inform you of the next steps within 24 working hours. Thank you.`;
    matched = true;
    action = "deep_report";
  } else if (
    msgLower === "water quality" ||
    msgLower === "system_water_quality" ||
    msgLower.includes("water quality")
  ) {
    replyText =
      replyText ||
      "Our water quality currently meets all regulatory standards. Safe for drinking!";
    matched = true;
  } else if (
    msgLower === "supply timings" ||
    msgLower === "system_supply_time" ||
    msgLower.includes("supply timing")
  ) {
    replyText =
      replyText ||
      "Water supply timings are: Morning 6:00 AM - 8:00 AM, Evening 6:00 PM - 8:00 PM.";
    matched = true;
  } else if (
    msgLower === "contact" ||
    msgLower === "system_contact" ||
    msgLower.includes("contact us")
  ) {
    replyText =
      replyText || "You can contact the Panchayat office at 1800-123-4567.";
    matched = true;
  } else if (
    msgLower === "notifications" ||
    msgLower === "system_notify" ||
    msgLower.includes("notify history") ||
    msgLower.includes("notification")
  ) {
    replyText =
      replyText ||
      "Your recent notifications are available in the portal dashboard.";
    matched = true;
  } else if (
    msgLower === "usage" ||
    msgLower === "system_usage" ||
    msgLower.includes("usage history")
  ) {
    replyText =
      replyText || "Check the portal dashboard for your usage history.";
    matched = true;
  } else if (
    msgLower === "maintenance" ||
    msgLower === "system_maintenance" ||
    msgLower.includes("maintenance alert")
  ) {
    replyText =
      replyText ||
      "There are no scheduled maintenance activities affecting your connection at the moment.";
    matched = true;
  } else if (
    msgLower === "link" ||
    msgLower === "system_link" ||
    msgLower.includes("portal link")
  ) {
    const protocol = reqHost.includes("localhost") ? "http" : "https";
    
    // Auto-create/update portal document so it doesn't say "Not found or expired"
    if (admin.apps.length && custData.id) {
      try {
        await getRequiredAdminDb().collection("public_portals").doc(custData.id).set({
          portalId: custData.id,
          ownerId: ownerId,
          customerId: custData.id,
          customerName: custData.name || "Customer",
          mobileNumber: custData.mobileNumber || "",
          balance: custData.balance || 0,
          billingAmount: adminSettings?.billingAmount || 0,
          penaltyAmount: adminSettings?.penaltyAmount || 0,
          penaltyDays: adminSettings?.penaltyDays || 0,
          upiQrCodeImage: adminSettings?.upiQrCodeImage || null,
          createdAt: Date.now()
        }, { merge: true });
        console.log(`[Auto-Portal] Created/Updated portal link for ${custData.id}`);
      } catch (e) {
        console.error("Failed to auto-create portal link via Chatbot:", e);
      }
    }
    
    replyText =
      replyText ||
      `Here is your personal portal link:\n${protocol}://${reqHost}/?portal=true&customerId=${custData.id}`;
    matched = true;
  }
  return { matched, replyText, attachments, action };
}

async function getChatbotSettings(ownerId: string) {
  try {
    if (admin.apps.length) {
      const doc = await getRequiredAdminDb()
        .collection("chatbotSettings")
        .doc(ownerId)
        .get();
      return doc.exists ? doc.data() : null;
    } else {
      const docSnap = await getDocClient(
        docClient(clientDb, "chatbotSettings", ownerId),
      );
      return docSnap.exists() ? docSnap.data() : null;
    }
  } catch (e) {
    console.warn("Failed to get chatbotSettings in server", e);
    return null;
  }
}

async function getCustomerByMobile(ownerId: string, mobileSearch: string) {
  if (admin.apps.length) {
    const snap = await getRequiredAdminDb()
      .collection("customers")
      .where("ownerId", "==", ownerId)
      .get();
    // Since mobile numbers might contain country codes, dashes, etc., we fetch all and find, OR better: if possible we query.
    // Firestore doesn't do "endsWith" queries natively well without a specific field.
    // For efficiency, we will fetch and filter, but we could improve this later. For now, it's ok.
    const customers = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
    }));
    return customers.find((c) => {
      const dataMobile = (c.mobileNumber || "").replace(/\D/g, "");
      return (
        mobileSearch.endsWith(dataMobile) || dataMobile.endsWith(mobileSearch)
      );
    });
  } else {
    const q = queryClient(
      collectionClient(clientDb, "customers"),
      whereClient("ownerId", "==", ownerId),
    );
    const snap = await getDocsClient(q);
    const customers = snap.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
    }));
    return customers.find((c) => {
      const dataMobile = (c.mobileNumber || "").replace(/\D/g, "");
      return (
        mobileSearch.endsWith(dataMobile) || dataMobile.endsWith(mobileSearch)
      );
    });
  }
}

async function getCustomers(ownerId: string) {
  if (admin.apps.length) {
    const snap = await getRequiredAdminDb()
      .collection("customers")
      .where("ownerId", "==", ownerId)
      .get();
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  } else {
    const q = queryClient(
      collectionClient(clientDb, "customers"),
      whereClient("ownerId", "==", ownerId),
    );
    const snap = await getDocsClient(q);
    return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
  }
}

async function saveComplaintData(complaintId: string, data: any) {
  if (admin.apps.length) {
    await getRequiredAdminDb()
      .collection("complaints")
      .doc(complaintId)
      .set(data);
  } else {
    await setDocClient(docClient(clientDb, "complaints", complaintId), data);
  }
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Security and performance middleware
  app.use(
    helmet({
      contentSecurityPolicy: false, // Disabled for Vite dev server compatibility
      crossOriginEmbedderPolicy: false,
      crossOriginOpenerPolicy: false,
      crossOriginResourcePolicy: false,
      frameguard: false,
    }),
  );
  app.use(compression());
  app.use(cors());
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // API Routes (Before Vite Middleware)
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", message: "SmartBilling Server is running" });
  });

  // Webhook for Web Portal Uploads (bypass storage rules)
  app.post("/api/upload-receipt", async (req, res) => {
    try {
      const { ownerId, base64Image, receiptId } = req.body;
      if (!ownerId || !base64Image || !receiptId) {
        return res.status(400).json({ error: "Missing required fields" });
      }

      const bucket = admin.storage().bucket();
      const file = bucket.file(`receipts/${ownerId}/${receiptId}`);

      const base64Data = base64Image.split(";base64,").pop() || base64Image;
      let contentType = "image/jpeg";
      if (base64Image.startsWith("data:")) {
        contentType = base64Image.split(";")[0].split(":")[1];
      }

      const buffer = Buffer.from(base64Data, "base64");

      await file.save(buffer, {
        metadata: { contentType },
      });

      const signedUrls = await file.getSignedUrl({
        action: "read",
        expires: "01-01-2499",
      });

      res.json({ imageUrl: signedUrls[0] });
    } catch (err: any) {
      console.error("Failed to upload via API", err);
      res.status(500).json({ error: err.message });
    }
  });

  // 1. Payment Webhook Endpoint (e.g. WhatsApp Pay, Cashfree)
  // The bank sends a POST request here when someone scans your dynamic QR and pays
  app.post("/api/payment-webhook/:ownerId", async (req, res) => {
    try {
      const { ownerId } = req.params;
      const signature =
        req.headers["x-whatsapp-signature"] ||
        req.headers["x-webhook-signature"];

      let webhookSecret = null;
      const settings = await getSettings(ownerId);
      if (settings?.paymentGatewaySecret) {
        webhookSecret = settings.paymentGatewaySecret;
      }

      // In production, we actively verify the signature here using webhookSecret or process.env variables
      // if (webhookSecret && !verifySignature(req.body, signature, webhookSecret)) return res.sendStatus(403);

      const payload = req.body;
      console.log(`Received payment Webhook for owner ${ownerId}:`, payload);

      // Expected structure from your payment gateway (example WhatsApp Pay)
      const customerId =
        payload.payload?.payment?.entity?.notes?.customerId ||
        payload.metadata?.customerId;
      const amountPaid =
        payload.payload?.payment?.entity?.amount || payload.amount || 0;

      // Fallback: Check if they just sent plain root attributes
      const fallbackCustomerId = payload.customerId || payload.customer_id;
      const finalCustomerId = customerId || fallbackCustomerId;

      if (!finalCustomerId) {
        return res
          .status(400)
          .json({
            status: "error",
            message: "Missing customer tracking details",
          });
      }

      console.log(
        `Payment confirmed for ${finalCustomerId} amount ₹${amountPaid}`,
      );

      /* 
         If `firebase-admin` is connected (requires Service Account):
         1. getRequiredAdminDb().collection('customers').doc(finalCustomerId).get()
         2. Deduct `amountPaid` from `balance`
         3. Save to `transactions` subcollection
         4. If balance == 0, trigger `generateInvoicePDF` and `sendWhatsAppNotification` natively using Node.js logic!
      */
      if (admin.apps.length) {
        try {
          const db = getAdminDb();
          if (!db)
            throw new Error(
              "Firebase Admin Database is not available. Please verify your FIREBASE_SERVICE_ACCOUNT setting.",
            );
          const custRef = db.collection("customers").doc(finalCustomerId);
          const custDoc = await custRef.get();
          if (custDoc.exists) {
            const customer = custDoc.data();
            const newBalance = Math.max(
              0,
              (customer?.balance || 0) - amountPaid,
            );
            await custRef.update({ balance: newBalance });

            // Save transaction
            await db
              .collection("customers")
              .doc(finalCustomerId)
              .collection("transactions")
              .add({
                amount: amountPaid,
                date: new Date().toISOString(),
                id: `TXN-${Date.now()}`,
              });

            // Automate WhatsApp Receipt
            if (
              newBalance === 0 &&
              ownerId &&
              customer?.status !== "Suspended"
            ) {
              const settingsDoc = await db
                .collection("settings")
                .doc(ownerId)
                .get();
              const settings = settingsDoc.data() as any;
              if (
                settings?.automation?.smartNotifications &&
                ((settings.metaWhatsAppApiKey &&
                  settings.metaWhatsAppPhoneNumberId) ||
                  settings.watiAccessToken)
              ) {
                  const lang = settings?.preferredLanguage || 'en';
                  const mobile = customer?.mobileNumber?.replace(/\D/g, "");
                  if (mobile && mobile.length >= 10) {
                    const message = getSvrT(lang, 'paymentSuccess', { name: customer?.name, amt: amountPaid });
                    try {
                      const generatedPdf = await generateInvoicePdf(
                        customer?.name || "Customer",
                        0,
                        amountPaid,
                        settings?.billTemplateImage,
                        lang
                      );
                      
                      let finalTemplateParams: any[] = [
                        customer?.name || "Customer",
                        amountPaid,
                        {
                          isButtonParam: true,
                          value: finalCustomerId,
                          index: "0",
                        },
                      ];
                      
                      const templateName = settings?.metaTemplateReceipt;
                      if (templateName && settings?.metaCustomTemplates) {
                        const matchedConfig = settings.metaCustomTemplates.find((t:any) => t.templateName === templateName);
                        if (matchedConfig && matchedConfig.parameters) {
                          const paramKeys = matchedConfig.parameters.split(',').map((s:string) => s.trim());
                          finalTemplateParams = paramKeys.map((key:string) => {
                            if (key === 'customer_name') return customer?.name || "Customer";
                            if (key === 'customer_balance') return customer?.balance || 0;
                            if (key === 'billing_amount') return settings?.billingAmount || 0;
                            if (key === 'new_balance') return customer?.balance || 0;
                            if (key === 'payment_amount') return amountPaid;
                            if (key === 'overdue_amount') return customer?.balance || 0;
                            if (key === 'date') return new Date().toLocaleDateString('en-GB');
                            if (key === 'portal_link') return `${settings.publicPortalBaseUrl || 'https://ais-dev-bgo3e3yfqihdrbor7bolgx-496681651924.asia-southeast1.run.app'}/?portal=true&customerId=${finalCustomerId}`;
                            if (key === 'button_param') return { isButtonParam: true, value: `?portal=true&customerId=${finalCustomerId}`, index: "0" };
                            return '';
                          });
                        }
                      }

                    await sendWhatsAppMessage(
                      settings,
                      mobile,
                      message,
                      generatedPdf,
                      "Payment_Receipt.pdf",
                      false,
                      "receipt",
                      finalTemplateParams,
                    );
                  } catch (e) {
                    console.error("Webhook Auto-Receipt failed", e);
                  }
                  await custRef.update({ paymentNotified: true });
                }
              }
            }
          }
        } catch (err) {
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
  async function sendMetaWhatsApp(
    settings: any,
    to: string,
    message: string,
    mediaBase64?: string,
    mediaName?: string,
    isTestMessage: boolean = false,
    templateCategory?:
      | "billing"
      | "receipt"
      | "broadcast"
      | "welcome"
      | "overdue"
      | "suspension"
      | "custom",
    templateParams?: any[],
    customTemplateName?: string,
    contextData?: any,
  ) {
    if (!settings?.metaWhatsAppApiKey || !settings?.metaWhatsAppPhoneNumberId) {
      throw new Error("WhatsApp API not configured");
    }

    const mobile = to.replace(/\D/g, "");
    let formattedTo = mobile;
    if (mobile.length === 10) {
      formattedTo = `91${mobile}`;
    } else if (mobile.length === 12 && mobile.startsWith("91")) {
      formattedTo = mobile;
    } else if (mobile.length === 13 && mobile.startsWith("0")) {
      // Sometimes people add 091 ?
      formattedTo = mobile.substring(mobile.length - 12);
    } else {
      // fallback, if it's strangely formatted just prepend 91 and hope for the best if it doesn't have it
      formattedTo = mobile.startsWith("91") ? mobile : `91${mobile}`;
    }

    console.log(`[WhatsApp] Sending to ${formattedTo}...`);

    let bodyPayload: any = {
      messaging_product: "whatsapp",
      to: formattedTo,
    };

    let mediaId: string | undefined = undefined;
    let mediaUrl: string | undefined = undefined;

    // Upload media to Meta first if provided
    if (mediaBase64) {
      if (mediaBase64.startsWith("http://") || mediaBase64.startsWith("https://")) {
         mediaUrl = mediaBase64;
         console.log(`[WhatsApp] Using provided media URL instead of uploading`);
      } else {
        try {
          const base64Data = mediaBase64.split(",")[1] || mediaBase64;
          const mimeType =
            mediaBase64.split(";")[0].split(":")[1] || "application/pdf";
          const isImage = mimeType.startsWith("image/");

          const buffer = Buffer.from(base64Data, "base64");
          const formData = new FormData();
          const blob = new Blob([buffer], { type: mimeType });
          formData.append(
            "file",
            blob,
            mediaName || (isImage ? "image.png" : "document.pdf"),
          );
          formData.append("messaging_product", "whatsapp");

          const uploadRes = await fetch(
            `https://graph.facebook.com/v17.0/${settings.metaWhatsAppPhoneNumberId}/media`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${settings.metaWhatsAppApiKey}`,
              },
              body: formData as any,
            },
          );

          const uploadData = await uploadRes.json();
          if (!uploadRes.ok) {
            console.error(`[WhatsApp] Media Upload Error:`, uploadData);
            if (
              uploadData.error &&
              uploadData.error.message &&
              uploadData.error.message.includes("register this phone number")
            ) {
              throw new Error(
                "Meta Error: The 'Phone Number ID' you provided is invalid. Please make sure you are using the 'Phone Number ID' (usually 15-digits) from your Meta App Dashboard, and NOT your actual phone number.",
              );
            }
            throw new Error(
              uploadData.error?.message || "Failed to upload media to WhatsApp",
            );
          }
          mediaId = uploadData.id;
          console.log(`[WhatsApp] Successfully uploaded media, ID: ${mediaId}`);
        } catch (err) {
          console.error(`[WhatsApp] Error handling media:`, err);
        }
      }
    }

    if (
      message &&
      message.toLowerCase().trim() === "hello world" &&
      !templateCategory &&
      !customTemplateName
    ) {
      // isTestMessage is only inferred if no explicit template info is given, meaning it comes from a generic ping.
      isTestMessage = true;
    }

    if (isTestMessage && !customTemplateName) {
      bodyPayload.type = "template";
      bodyPayload.template = {
        name: "hello_world",
        language: { code: "en_US" },
      };
    } else if (templateCategory || customTemplateName) {
      bodyPayload.type = "template";
      let templateName =
        customTemplateName ||
        settings.metaTemplateBroadcast ||
        "general_announcement";
      let components: any[] = [];

      if (!customTemplateName) {
        if (templateCategory === "billing") {
          templateName =
            settings.metaTemplateBilling || "monthly_bill_notification";
        } else if (templateCategory === "receipt") {
          templateName = settings.metaTemplateReceipt || "payment_ack_v3";
        } else if (templateCategory === "broadcast") {
          templateName =
            settings.metaTemplateBroadcast || "mass_broadcast_generic";
        } else if (templateCategory === "welcome") {
          templateName = settings.metaTemplateWelcome || "welcome_customer_v1";
        } else if (templateCategory === "overdue") {
          templateName = settings.metaTemplateOverdue || "penalty_alert_v1";
        } else if (templateCategory === "suspension") {
          templateName = settings.metaTemplateSuspension || "service_suspended";
        } else if (templateCategory === "custom") {
          templateName = settings.metaTemplateCustom || "custom_alert";
        }
      }

      if (mediaId || mediaUrl) {
        const docObj: any = {};
        if (mediaUrl) {
          docObj.link = mediaUrl;
        } else {
          docObj.id = mediaId;
        }
        docObj.filename = mediaName || "Invoice.pdf";

        components.push({
          type: "header",
          parameters: [
            {
              type: "document",
              document: docObj,
            },
          ],
        });
      }

      if (templateParams && templateParams.length > 0) {
        let bodyParams = templateParams.filter(
          (_, i) => !templateParams[i]?.isButtonParam,
        );
        let btnParams = templateParams.filter(
          (_, i) => templateParams[i]?.isButtonParam,
        );

        if (bodyParams.length > 0) {
          components.push({
            type: "body",
            parameters: bodyParams.map((p) => ({
              type: "text",
              text: String(p.value || p),
            })),
          });
        }

        if (btnParams.length > 0) {
          btnParams.forEach((bp, i) => {
            components.push({
              type: "button",
              sub_type: "url", // Most common parameter requirement
              index: String(bp.index !== undefined ? bp.index : i),
              parameters: [{ type: "text", text: String(bp.value) }],
            });
          });
        }
      } else if (isTestMessage && customTemplateName) {
        // generic fallback param when test template is used
      }

      const lang = settings.preferredLanguage === 'hi' ? 'hi' : settings.preferredLanguage === 'pa' ? 'pa' : settings.preferredLanguage || "en_US";
      
      bodyPayload.template = {
        name: templateName,
        language: { code: lang },
        components: components.length > 0 ? components : undefined,
      };
    } else {
      if (mediaId || mediaUrl) {
        const mimeType = mediaBase64?.split(";")[0].split(":")[1] || "";
        const isImage = mimeType.startsWith("image/") || (mediaName && (mediaName.endsWith(".png") || mediaName.endsWith(".jpg") || mediaName.endsWith(".jpeg")));

        if (isImage) {
          bodyPayload.type = "image";
          const imgObj: any = { caption: message };
          if (mediaUrl) imgObj.link = mediaUrl;
          else imgObj.id = mediaId;
          bodyPayload.image = imgObj;
        } else {
          bodyPayload.type = "document";
          const docObj: any = {
            caption: message,
            filename: mediaName || "document.pdf",
          };
          if (mediaUrl) docObj.link = mediaUrl;
          else docObj.id = mediaId;
          bodyPayload.document = docObj;
        }
      } else {
        bodyPayload.type = "text";
        bodyPayload.text = { body: message };
      }
    }

    const response = await fetch(
      `https://graph.facebook.com/v17.0/${settings.metaWhatsAppPhoneNumberId}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${settings.metaWhatsAppApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(bodyPayload),
      },
    );

    let latestData = await response.json();
    if (!response.ok) {
      let isRecovered = false;
      
      for (let attempt = 0; attempt < 3; attempt++) {
        if (isRecovered) break;
        
        let errMsg = latestData.error?.message || "Meta API Error";
        let detailsStr = latestData.error?.error_data?.details?.toLowerCase() || "";
        
        const isParamCountError = errMsg.toLowerCase().includes("132000") || latestData.error?.code === 132000 || detailsStr.includes("does not match the expected number of params");
        const isHeaderIssue = errMsg.toLowerCase().includes("132018") || latestData.error?.code === 132018 || detailsStr.includes("title component") || detailsStr.includes("header") || detailsStr.includes("no parameters allowed");
        const isButtonNoParamAllowed = detailsStr.includes("button") && detailsStr.includes("no parameters allowed");
        const isButtonMissingParam = errMsg.toLowerCase().includes("131008") || latestData.error?.code === 131008 || (detailsStr.includes("button") && detailsStr.includes("requires a parameter"));

        let madeChanges = false;
        
        if (bodyPayload.type === "template" && bodyPayload.template.components) {
          if (isHeaderIssue || isButtonNoParamAllowed || isButtonMissingParam) {
            const hasHeader = bodyPayload.template.components.some((c: any) => c.type === "header");
            const hasButton = bodyPayload.template.components.some((c: any) => c.type === "button");
            
            if (hasHeader && (detailsStr.includes("header") || (!isButtonNoParamAllowed && !isButtonMissingParam))) {
              console.warn("[WhatsApp] Retrying message without header component as template may not support it...");
              bodyPayload.template.components = bodyPayload.template.components.filter((c: any) => c.type !== "header");
              madeChanges = true;
            } else if (isButtonNoParamAllowed && hasButton) {
              console.warn("[WhatsApp] Retrying message without button component as template does not allow it...");
              bodyPayload.template.components = bodyPayload.template.components.filter((c: any) => c.type !== "button");
              madeChanges = true;
            } else if (isButtonMissingParam) {
              console.warn("[WhatsApp] Retrying message by injecting missing button parameter...");
              if (!hasButton) {
                 bodyPayload.template.components.push({
                   type: "button",
                   sub_type: "url",
                   index: "0",
                   parameters: [{ type: "text", text: "?portal=true" }]
                 });
              } else {
                 bodyPayload.template.components = bodyPayload.template.components.map((c: any) => {
                   if (c.type === "button") {
                     return {
                       ...c,
                       parameters: [{ type: "text", text: "?portal=true" }]
                     };
                   }
                   return c;
                 });
              }
              madeChanges = true;
            }
          }
          
          if (!madeChanges && isParamCountError) {
            const match = detailsStr.match(/expected number of params \((\d+)\)/);
            if (match && match[1]) {
              const expectedCount = parseInt(match[1], 10);
              console.warn(`[WhatsApp] Retrying message with exactly ${expectedCount} body parameters...`);
              
              let bodyComponentOpt = bodyPayload.template.components.find((c: any) => c.type === "body");
              bodyPayload.template.components = bodyPayload.template.components.map((c: any) => {
                if (c.type === "body") {
                  const currentParams = c.parameters || [];
                  const paddedParams = [...currentParams];
                  while (paddedParams.length < expectedCount) {
                    paddedParams.push({ type: "text", text: "N/A" });
                  }
                  if (paddedParams.length > expectedCount) {
                    paddedParams.length = expectedCount;
                  }
                  return { ...c, parameters: paddedParams };
                }
                return c;
              });
              
              if (!bodyComponentOpt && expectedCount > 0) {
                const injectedParams = Array(expectedCount).fill({ type: "text", text: "N/A" });
                bodyPayload.template.components.push({ type: "body", parameters: injectedParams });
              }
              madeChanges = true;
            }
          }
        }
        
        if (bodyPayload.template && bodyPayload.template.components && bodyPayload.template.components.length === 0) {
           bodyPayload.template.components = undefined;
        }

        if (madeChanges) {
          const retryResponse = await fetch(
            `https://graph.facebook.com/v17.0/${settings.metaWhatsAppPhoneNumberId}/messages`,
            {
              method: "POST",
              headers: {
                Authorization: `Bearer ${settings.metaWhatsAppApiKey}`,
                "Content-Type": "application/json",
              },
              body: JSON.stringify(bodyPayload),
            }
          );
          latestData = await retryResponse.json();
          if (retryResponse.ok) {
            isRecovered = true;
            return latestData;
          }
        } else {
          break; // No more automated fixes available
        }
      }
      
      let finalErrMsg = latestData.error?.message || "Meta API Error";
      let finalDetailsStr = latestData.error?.error_data?.details?.toLowerCase() || "";
      const errStr = finalErrMsg.toLowerCase();

      const isExpectedFallbackError =
        isTestMessage &&
        (errStr.includes("hello_world") ||
          errStr.includes("hello world") ||
          errStr.includes("test number") ||
          errStr.includes("does not exist") ||
          errStr.includes("131058") ||
          latestData.error?.code === 131058);
          
      if (!isRecovered && !isExpectedFallbackError) {
        console.error(`[WhatsApp] Meta API Error Details:`, JSON.stringify(latestData));
      }

      if (
        latestData.error &&
        latestData.error.message &&
        latestData.error.message.includes("register this phone number")
      ) {
        finalErrMsg =
          "Meta Error: The 'Phone Number ID' you provided is invalid. Please make sure you are using the 'Phone Number ID' (usually 15-digits) from your Meta App Dashboard, and NOT your actual phone number.";
      } else if (latestData.error?.type === "OAuthException") {
        finalErrMsg = `OAuthException: ${latestData.error?.message || "Invalid or expired token"}. Please ensure you're using the Phone Number ID (not App ID), the token is valid, and 'whatsapp_business_messaging' permissions are granted.`;
        if (latestData.error.error_data && latestData.error.error_data.details) {
          finalErrMsg += ` Details: ${latestData.error.error_data.details}`;
        }
      }
      
      throw new Error(finalErrMsg);
    }
    return latestData;
  }

  // Helper for WATI WhatsApp API
  async function sendWatiWhatsApp(
    settings: any,
    to: string,
    message: string,
    mediaBase64?: string,
    mediaName?: string,
  ) {
    if (!settings?.watiAccessToken || !settings?.watiApiEndpoint) {
      throw new Error("WATI API not configured");
    }

    const mobile = to.replace(/\D/g, "");
    let formattedTo = mobile;
    if (mobile.length === 10) {
      formattedTo = `91${mobile}`;
    } else {
      formattedTo = mobile.startsWith("91") ? mobile : `91${mobile}`;
    }

    console.log(`[WATI] Sending to ${formattedTo}...`);

    const baseUrl = settings.watiApiEndpoint.replace(/\/$/, ""); // Remove trailing slash

    let url = `${baseUrl}/api/v1/sendSessionMessage/${formattedTo}`;
    let body: any = { messageText: message };

    if (mediaBase64) {
      url = `${baseUrl}/api/v1/sendSessionFile/${formattedTo}?caption=${encodeURIComponent(message)}`;
      // WATI sometimes expects different payload for files. Assuming standard base64 or URL.
      // For this implementation, we will try to pass base64 if supported or just the text if not.
      // Actually WATI API for files usually takes a URL or multipart.
      // But we will stick to the text session message if it's simpler for now,
      // or try to use their endpoint if we have the file.
      body = { file: mediaBase64 };
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${settings.watiAccessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    const data = await response.json();
    if (!response.ok) {
      console.error(`[WATI] API Error:`, data);
      throw new Error(data.message || data.result || "WATI API Error");
    }
    return data;
  }

  // Generic Send WhatsApp API
  async function sendWhatsAppMessage(
    settings: AppSettings,
    to: string,
    message: string,
    mediaBase64?: string,
    mediaName?: string,
    isTestMessage: boolean = false,
    templateCategory?:
      | "billing"
      | "receipt"
      | "broadcast"
      | "welcome"
      | "overdue"
      | "suspension"
      | "custom",
    templateParams?: any[],
    customTemplateName?: string,
    contextData?: any,
  ) {
    if (settings.preferredNotificationMethod === "manual_link") {
      throw new Error("Manual link selected, API disabled.");
    }

    if (settings.preferredNotificationMethod === "wati") {
      return await sendWatiWhatsApp(
        settings,
        to,
        message,
        mediaBase64,
        mediaName,
      );
    } else if (
      !settings.preferredNotificationMethod &&
      settings.watiAccessToken &&
      !settings.metaWhatsAppApiKey
    ) {
      return await sendWatiWhatsApp(
        settings,
        to,
        message,
        mediaBase64,
        mediaName,
      );
    } else {
      // Default to Meta or explicit 'api'
      return await sendMetaWhatsApp(
        settings,
        to,
        message,
        mediaBase64,
        mediaName,
        isTestMessage,
        templateCategory,
        templateParams,
        customTemplateName,
        contextData,
      );
    }
  }

  // Reusable Automation Engine
  async function runDailyAutomation(specificOwnerId: string | null = null) {
    if (!admin.apps.length) return;
    const db = getAdminDb();
    if (!db)
      throw new Error(
        "Firebase Admin Database is not available. Please verify your FIREBASE_SERVICE_ACCOUNT setting.",
      );

    // 1. Fetch settings
    let settingsSnap;
    if (specificOwnerId) {
      const doc = await db.collection("settings").doc(specificOwnerId).get();
      if (!doc.exists) return;
      settingsSnap = { docs: [doc] };
    } else {
      settingsSnap = await db.collection("settings").get();
    }

    for (const doc of settingsSnap.docs) {
      const settings = doc.data() as AppSettings;
      if (!settings.automation) continue;

      const ownerId = doc.id;
      console.log(`[Automation] Processing user: ${ownerId}`);

      const istTime = new Date(
        new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" }),
      );
      const istHour = istTime.getHours();

      // Optimization: Use a shared standard font set if we process many customers

      if (settings.automation.enforceIstTimeWindow && !specificOwnerId) {
        if (istHour < 9 || istHour >= 18) {
          // Expanded window for general automation check
          console.log(
            `[Automation] Skipping user ${ownerId} due to IST time window constraint (Current IST Hour: ${istHour})`,
          );
          continue;
        }
      }

      let shouldTriggerBilling = false;
      const todayStr = istTime.toISOString().split("T")[0]; // YYYY-MM-DD in IST

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
      if (
        settings.automation.scheduledBilling &&
        (shouldTriggerBilling ||
          (specificOwnerId && !settings.lastBillingDate?.includes(todayStr)))
      ) {
        console.log(`[Automation] Billing cycle triggered for ${ownerId}`);

        // Optimization: Only fetch and update customers who haven't been billed in this specific cycle yet
        const custRef = db
          .collection("customers")
          .where("ownerId", "==", ownerId)
          .where("status", "==", "Active");

        const customersSnap = await custRef.get();

        if (!customersSnap.empty) {
          let batch = db.batch();
          let count = 0;
          let updatedCustomerIds: string[] = [];

          for (const cDoc of customersSnap.docs) {
            const customer = cDoc.data();

            // SKIP if already billed in the last 24 hours to save quota
            if (
              customer.lastBilledDate &&
              customer.lastBilledDate.includes(todayStr)
            ) {
              continue;
            }

            const cleanMobile = customer.mobileNumber
              ? customer.mobileNumber.replace(/\D/g, "")
              : "";
            if (
              !cleanMobile ||
              cleanMobile.length < 10 ||
              cleanMobile === "0000000000"
            ) {
              continue;
            }

            const newBalance =
              (customer.balance || 0) + (settings.billingAmount || 0);

            batch.update(cDoc.ref, {
              balance: newBalance,
              invoiceSent: false,
              paymentNotified: false,
              lastBilledDate: istTime.toISOString(),
              lastBillingNote: `Auto-${todayStr}`,
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

          console.log(
            `[Automation] Billed ${updatedCustomerIds.length} customers for ${ownerId}`,
          );

          // Send Automated WhatsApp Bill (only for the ones we actually updated in this run)
          if (
            ((settings.metaWhatsAppApiKey &&
              settings.metaWhatsAppPhoneNumberId) ||
              settings.watiAccessToken) &&
            settings.automation.smartNotifications &&
            updatedCustomerIds.length > 0
          ) {
            for (const cDoc of customersSnap.docs) {
              if (!updatedCustomerIds.includes(cDoc.id)) continue;

              const customer = cDoc.data();
              const newBalance =
                (customer.balance || 0) + (settings.billingAmount || 0);

              let mediaBase64: string | undefined = undefined;
              let mediaName = "Invoice.pdf";
              if (newBalance > 0) {
                try {
                  const pdfDoc = await PDFDocument.create();
                  const page = pdfDoc.addPage([595.28, 841.89]); // A4
                  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
                  const boldFont = await pdfDoc.embedFont(
                    StandardFonts.HelveticaBold,
                  );

                  page.drawText("SMART BILLING INVOICE", {
                    x: 200,
                    y: 800,
                    size: 18,
                    font: boldFont,
                    color: rgb(0.1, 0.4, 0.8),
                  });
                  page.drawText(
                    `Invoice Date: ${new Date().toLocaleDateString()}`,
                    { x: 220, y: 780, size: 10, font },
                  );

                  page.drawText("BILL TO:", {
                    x: 50,
                    y: 730,
                    size: 12,
                    font: boldFont,
                  });
                  page.drawText(customer.name, {
                    x: 50,
                    y: 715,
                    size: 12,
                    font,
                  });
                  page.drawText(`ID: ${customer.id || "N/A"}`, {
                    x: 50,
                    y: 700,
                    size: 12,
                    font,
                  });
                  page.drawText(`Mobile: ${customer.mobileNumber || "N/A"}`, {
                    x: 50,
                    y: 685,
                    size: 12,
                    font,
                  });

                  page.drawText(
                    `Billing Cycle: ${settings.billingCycleMonths || 1} Months`,
                    { x: 50, y: 640, size: 12, font },
                  );
                  page.drawText(
                    `Current Bill: Rs. ${(settings.billingAmount || 0).toFixed(2)}`,
                    { x: 50, y: 620, size: 12, font },
                  );
                  page.drawText(
                    `Previous Outstanding: Rs. ${(customer.balance || 0).toFixed(2)}`,
                    { x: 50, y: 600, size: 12, font },
                  );

                  page.drawText("TOTAL PAYABLE:", {
                    x: 50,
                    y: 560,
                    size: 14,
                    font: boldFont,
                  });
                  page.drawText(`Rs. ${newBalance.toFixed(2)}`, {
                    x: 200,
                    y: 560,
                    size: 14,
                    font: boldFont,
                    color: rgb(0.8, 0.1, 0.1),
                  });

                  // Embed QR Code if available
                  if (settings.upiQrCodeImage) {
                    try {
                      let qrBytes: any;
                      if (settings.upiQrCodeImage.startsWith("http://") || settings.upiQrCodeImage.startsWith("https://")) {
                        const res = await fetch(settings.upiQrCodeImage);
                        qrBytes = await res.arrayBuffer();
                      } else {
                        const qrData = settings.upiQrCodeImage.split(",")[1] || settings.upiQrCodeImage;
                        qrBytes = Buffer.from(qrData, "base64");
                      }
                      
                      let qrImage;
                      if (settings.upiQrCodeImage.includes("png")) {
                        qrImage = await pdfDoc.embedPng(qrBytes);
                      } else {
                        qrImage = await pdfDoc.embedJpg(qrBytes);
                      }

                      page.drawText("SCAN TO PAY VIA UPI:", {
                        x: 220,
                        y: 350,
                        size: 12,
                        font: boldFont,
                      });
                      page.drawImage(qrImage, {
                        x: 220,
                        y: 180,
                        width: 150,
                        height: 150,
                      });
                      page.drawText("Secure Payment Guarantee", {
                        x: 240,
                        y: 160,
                        size: 8,
                        font,
                        color: rgb(0.5, 0.5, 0.5),
                      });
                    } catch (qrErr) {
                      console.error("[Automation] QR Embedding failed:", qrErr);
                    }
                  } else {
                    page.drawText(
                      "Payment Method: Please use UPI or Cash at Panchayat Office.",
                      { x: 50, y: 400, size: 10, font },
                    );
                  }

                  const pdfBytes = await pdfDoc.save();
                  mediaBase64 = Buffer.from(pdfBytes).toString("base64");
                } catch (e: any) {
                  console.error(
                    `[Automation] Failed to generate PDF for ${customer.name}: ${e.message}`,
                  );
                }
              }

              const message = `Dear ${customer.name}, your new water bill of Rs. ${settings.billingAmount} has been generated. Total outstanding: Rs. ${newBalance}. Please pay on time.`;
              try {
                let finalTemplateParams: any[] = [
                    customer.name,
                    settings.billingAmount,
                    newBalance,
                    new Date().toLocaleDateString('en-GB'),
                    { isButtonParam: true, value: customer.id, index: "0" },
                ];
                
                // Map Custom parameters for billing template
                const templateName = settings.metaTemplateBilling;
                if (templateName && settings.metaCustomTemplates) {
                  const matchedConfig = settings.metaCustomTemplates.find((t:any) => t.templateName === templateName);
                  if (matchedConfig && matchedConfig.parameters) {
                    const paramKeys = matchedConfig.parameters.split(',').map((s:string) => s.trim());
                    finalTemplateParams = paramKeys.map((key:string) => {
                      if (key === 'customer_name') return customer.name;
                      if (key === 'customer_balance') return customer.balance; // Old balance
                      if (key === 'billing_amount') return settings.billingAmount;
                      if (key === 'new_balance') return newBalance;
                      if (key === 'payment_amount') return 0;
                      if (key === 'overdue_amount') return newBalance;
                      if (key === 'date') return new Date().toLocaleDateString('en-GB');
                      if (key === 'portal_link') return `${settings.publicPortalBaseUrl || 'https://ais-dev-bgo3e3yfqihdrbor7bolgx-496681651924.asia-southeast1.run.app'}/?portal=true&customerId=${customer.id}`;
                      if (key === 'button_param') return { isButtonParam: true, value: `?portal=true&customerId=${customer.id}`, index: "0" };
                      return '';
                    });
                  }
                }

                await sendWhatsAppMessage(
                  settings,
                  customer.mobileNumber,
                  message,
                  mediaBase64,
                  mediaName,
                  false,
                  "billing",
                  finalTemplateParams,
                );
              } catch (e: any) {
                console.error(
                  `[Automation] Failed to auto-send bill to ${customer.name}: ${e.message}`,
                );
              }
            }
          }
        }

        let updatePayload: any = { lastBillingDate: istTime.toISOString() };
        if (settings.nextBillingDate) {
          const nd = new Date(settings.nextBillingDate);
          nd.setMonth(nd.getMonth() + (settings.billingCycleMonths || 1));
          updatePayload.nextBillingDate = nd.toISOString().split("T")[0];
        }
        await doc.ref.update(updatePayload);
      }

      // Handle Automated Penalty
      if (settings.automation.lateFee && settings.lastBillingDate) {
        const lastBilling = new Date(settings.lastBillingDate);
        const daysSinceBilling = Math.floor(
          (istTime.getTime() - lastBilling.getTime()) / (1000 * 60 * 60 * 24),
        );

        const lastPenaltyDate = settings.lastPenaltyDate
          ? new Date(settings.lastPenaltyDate)
          : null;
        const isSameMonthPenalty =
          lastPenaltyDate &&
          lastPenaltyDate.getMonth() === istTime.getMonth() &&
          lastPenaltyDate.getFullYear() === istTime.getFullYear();

        if (
          daysSinceBilling >= (settings.penaltyDays || 10) &&
          !isSameMonthPenalty
        ) {
          console.log(
            `[Automation] Applying late fee penalties for ${ownerId}`,
          );

          const overdueRef = db
            .collection("customers")
            .where("ownerId", "==", ownerId)
            .where("status", "==", "Active")
            .where("balance", ">", 0);

          const overdueSnap = await overdueRef.get();
          if (!overdueSnap.empty) {
            let batch = db.batch();
            let count = 0;
            for (const cDoc of overdueSnap.docs) {
              const customer = cDoc.data();
              batch.update(cDoc.ref, {
                balance:
                  (customer.balance || 0) + (settings.penaltyAmount || 0),
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
            console.log(
              `[Automation] Late fee applied to ${overdueSnap.size} customers for ${ownerId}`,
            );
          }
        }
      }
    }
  }

  // 2. Daily Cron Automation Trigger
  // Runs at midnight every day
  cron.schedule("0 0 * * *", async () => {
    console.log("Running Daily Automation Engine (Cron)...");

    if (!admin.apps.length) return;
    const db = getAdminDb();
    if (!db)
      throw new Error(
        "Firebase Admin Database is not available. Please verify your FIREBASE_SERVICE_ACCOUNT setting.",
      );

    // Auto-Delete resolved complaints older than 6 months
    try {
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
      console.log(
        `Checking for resolved complaints before ${sixMonthsAgo.toISOString()} to auto-delete`,
      );

      const oldComplaintsSnap = await db
        .collection("complaints")
        .where("status", "==", "Resolved")
        .where("createdAt", "<", sixMonthsAgo.toISOString())
        .limit(50)
        .get();

      if (!oldComplaintsSnap.empty) {
        const batch = db.batch();
        oldComplaintsSnap.forEach((doc) => {
          batch.delete(doc.ref);
        });
        await batch.commit();
        console.log(`Auto-deleted ${oldComplaintsSnap.size} old complaints.`);
      }

      // Auto-Delete old payment_receipts (e.g. approved/rejected > 6 months) to save Cloud Storage space
      const oldReceiptsSnap = await db
        .collection("payment_receipts")
        .where("submittedAt", "<", sixMonthsAgo.toISOString())
        .limit(50)
        .get();

      if (!oldReceiptsSnap.empty) {
        const batch = db.batch();
        const bucket = admin.storage().bucket();
        for (const docSnap of oldReceiptsSnap.docs) {
          const receipt = docSnap.data();
          batch.delete(docSnap.ref);

          // If the base64Image is a URL, there's a good chance it's in our storage bucket
          if (
            receipt.base64Image &&
            receipt.base64Image.includes("firebasestorage")
          ) {
            try {
              // Extacting path from generated signed URLs or standard URLs is tricky securely
              // but we know the path we uploaded to: `receipts/${ownerId}/${id}`
              const filePath = `receipts/${receipt.ownerId}/${receipt.id}`;
              const file = bucket.file(filePath);
              await file.delete();
            } catch (e: any) {
              // File might already be deleted or missing
              if (e.code !== 404) {
                console.error(
                  "Failed to delete old receipt image from storage",
                  e,
                );
              }
            }
          }
        }
        await batch.commit();
        console.log(
          `Auto-deleted ${oldReceiptsSnap.size} old payment receipts & freed storage.`,
        );
      }
    } catch (err: any) {
      if (
        err.code === 5 ||
        (err.message && err.message.includes("NOT_FOUND"))
      ) {
        // Warning already logged by getAdminDb
      } else if (
        err.code === 8 ||
        (err.message && err.message.includes("Quota exceeded"))
      ) {
        console.warn(
          "Auto-delete skipped: Quota exceeded (Database limit reached)",
        );
      } else {
        console.error("Failed to auto-delete old complaints", err);
      }
    }

    try {
      await runDailyAutomation();
    } catch (autoErr: any) {
      if (
        autoErr.code === 5 ||
        (autoErr.message && autoErr.message.includes("NOT_FOUND"))
      ) {
        // Warning already logged by getAdminDb
      } else {
        console.error("Daily automation failed", autoErr);
      }
    }
  });

  app.post("/api/cron/daily", async (req, res) => {
    try {
      const { ownerId } = req.body;
      console.log(
        `Starting Manual Daily Automation Engine Trigger for ${ownerId || "ALL"}...`,
      );
      await runDailyAutomation(ownerId);
      res.json({ status: "success" });
    } catch (error: any) {
      if (
        error.code === 5 ||
        (error.message && error.message.includes("NOT_FOUND"))
      ) {
        console.error(
          `[ACTION REQUIRED] Manual automation skipped. Firestore Database not found in project ${firebaseConfig.projectId}.`,
        );
        res
          .status(404)
          .json({
            error:
              "Firestore Database not found. Please create it in the Firebase console.",
          });
      } else {
        console.error("Cron Error", error);
        res.status(500).json({ error: "Automation failed" });
      }
    }
  });

  // Send Individual Message API (Proxied for CORS safety)
  app.post("/api/wa/send", async (req, res) => {
    try {
      const {
        ownerId,
        to,
        message,
        apiKey,
        phoneId,
        watiAccessToken,
        watiApiEndpoint,
        method,
        mediaBase64,
        mediaName,
        templateCategory,
        templateParams,
        customTemplateName,
      } = req.body;
      if (!to || !message)
        return res.status(400).json({ error: "Missing required fields" });

      let settings: any = {
        metaWhatsAppApiKey: apiKey,
        metaWhatsAppPhoneNumberId: phoneId,
        watiAccessToken: watiAccessToken,
        watiApiEndpoint: watiApiEndpoint,
        preferredNotificationMethod: method,
      };

      if (
        admin.apps.length &&
        !settings.metaWhatsAppApiKey &&
        !settings.watiAccessToken
      ) {
        try {
          const db = getAdminDb();
          if (db) {
            const settingsDoc = await db
              .collection("settings")
              .doc(ownerId)
              .get();
            if (settingsDoc.exists) {
              const dbSettings = settingsDoc.data() as any;
              if (!settings.metaWhatsAppApiKey)
                settings.metaWhatsAppApiKey = dbSettings.metaWhatsAppApiKey;
              if (!settings.metaWhatsAppPhoneNumberId)
                settings.metaWhatsAppPhoneNumberId =
                  dbSettings.metaWhatsAppPhoneNumberId;
              if (!settings.watiAccessToken)
                settings.watiAccessToken = dbSettings.watiAccessToken;
              if (!settings.watiApiEndpoint)
                settings.watiApiEndpoint = dbSettings.watiApiEndpoint;
              if (!settings.preferredNotificationMethod)
                settings.preferredNotificationMethod =
                  dbSettings.preferredNotificationMethod;
              if (!settings.metaTemplateBilling)
                settings.metaTemplateBilling = dbSettings.metaTemplateBilling;
              if (!settings.metaTemplateReceipt)
                settings.metaTemplateReceipt = dbSettings.metaTemplateReceipt;
              if (!settings.metaTemplateBroadcast)
                settings.metaTemplateBroadcast =
                  dbSettings.metaTemplateBroadcast;
            }
          }
        } catch (e) {
          console.warn("Failed to fetch settings from internal DB:", e);
        }
      }

      if (!settings?.metaWhatsAppApiKey && !settings?.watiAccessToken) {
        return res
          .status(400)
          .json({ error: "WhatsApp API not configured in settings" });
      }

      const data = await sendWhatsAppMessage(
        settings,
        to,
        message,
        mediaBase64,
        mediaName,
        false,
        templateCategory,
        templateParams,
        customTemplateName,
      );
      res.json({ success: true, messageId: data.messages?.[0]?.id || data.id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Bulk Broadcast API
  app.post("/api/wa/broadcast", async (req, res) => {
    try {
      const {
        ownerId,
        message,
        apiKey,
        phoneId,
        watiAccessToken,
        watiApiEndpoint,
        recipients,
        mediaBase64,
        mediaName,
        method,
      } = req.body;
      if (!message) return res.status(400).json({ error: "Missing message" });

      let settings: any = {
        metaWhatsAppApiKey: apiKey,
        metaWhatsAppPhoneNumberId: phoneId,
        watiAccessToken: watiAccessToken,
        watiApiEndpoint: watiApiEndpoint,
        preferredNotificationMethod: method,
      };

      if (
        admin.apps.length &&
        !settings.metaWhatsAppApiKey &&
        !settings.watiAccessToken
      ) {
        try {
          const db = getAdminDb();
          if (db) {
            const settingsDoc = await db
              .collection("settings")
              .doc(ownerId)
              .get();
            if (settingsDoc.exists) {
              const dbSettings = settingsDoc.data() as any;
              if (!settings.metaWhatsAppApiKey)
                settings.metaWhatsAppApiKey = dbSettings.metaWhatsAppApiKey;
              if (!settings.metaWhatsAppPhoneNumberId)
                settings.metaWhatsAppPhoneNumberId =
                  dbSettings.metaWhatsAppPhoneNumberId;
              if (!settings.watiAccessToken)
                settings.watiAccessToken = dbSettings.watiAccessToken;
              if (!settings.watiApiEndpoint)
                settings.watiApiEndpoint = dbSettings.watiApiEndpoint;
              if (!settings.preferredNotificationMethod)
                settings.preferredNotificationMethod =
                  dbSettings.preferredNotificationMethod;
              if (!settings.metaTemplateBilling)
                settings.metaTemplateBilling = dbSettings.metaTemplateBilling;
              if (!settings.metaTemplateReceipt)
                settings.metaTemplateReceipt = dbSettings.metaTemplateReceipt;
              if (!settings.metaTemplateBroadcast)
                settings.metaTemplateBroadcast =
                  dbSettings.metaTemplateBroadcast;
            }
          }
        } catch (e) {
          console.warn(
            "Failed to fetch settings from internal DB for broadcast:",
            e,
          );
        }
      }
      if (!settings?.metaWhatsAppApiKey && !settings?.watiAccessToken) {
        return res.status(400).json({ error: "WhatsApp API not configured" });
      }

      let customers = recipients || [];
      if (!recipients && admin.apps.length) {
        const db = getAdminDb();
        if (!db)
          throw new Error(
            "Firebase Admin Database is not available. Please verify your FIREBASE_SERVICE_ACCOUNT setting.",
          );
        const customersSnap = await db
          .collection("customers")
          .where("ownerId", "==", ownerId)
          .where("status", "==", "Active")
          .get();
        customers = customersSnap.docs.map((d) => d.data());
      }

      // Filter out invalid mobiles
      customers = customers.filter((c: any) => {
        const cleanMobile = c.mobileNumber
          ? c.mobileNumber.replace(/\D/g, "")
          : "";
        return (
          cleanMobile &&
          cleanMobile.length >= 10 &&
          cleanMobile !== "0000000000"
        );
      });

      console.log(`Broadcasting to ${customers.length} customers...`);

      const results = { success: 0, failed: 0, errors: [] as string[] };

      for (const customer of customers) {
        try {
          let finalTemplateParams: any[] = [message]; // Default parameter is just the message
          
          const templateName = settings.metaTemplateBroadcast || "mass_broadcast_generic";
          if (settings.metaCustomTemplates) {
            const matchedConfig = settings.metaCustomTemplates.find((t:any) => t.templateName === templateName);
            if (matchedConfig && matchedConfig.parameters) {
              const paramKeys = matchedConfig.parameters.split(',').map((s:string) => s.trim());
              finalTemplateParams = paramKeys.map((key:string) => {
                if (key === 'customer_name') return customer.name || "Customer";
                if (key === 'customer_balance') return customer.balance || 0;
                if (key === 'billing_amount') return settings.billingAmount || 0;
                if (key === 'new_balance') return customer.balance || 0;
                if (key === 'payment_amount') return customer.balance || 0;
                if (key === 'overdue_amount') return customer.balance || 0;
                if (key === 'date') return new Date().toLocaleDateString('en-GB');
                if (key === 'portal_link') return `${settings.publicPortalBaseUrl || 'https://ais-dev-bgo3e3yfqihdrbor7bolgx-496681651924.asia-southeast1.run.app'}/?portal=true&customerId=${customer.id}`;
                if (key === 'button_param') return { isButtonParam: true, value: `?portal=true&customerId=${customer.id}`, index: "0" };
                if (key === 'message') return message;
                return message; // Default mapping
              });
            }
          }

          await sendWhatsAppMessage(
            settings,
            customer.mobileNumber,
            message,
            mediaBase64,
            mediaName,
            false,
            "broadcast",
            finalTemplateParams,
          );
          results.success++;
        } catch (e: any) {
          results.failed++;
          results.errors.push(`${customer.name}: ${e.message}`);
        }
      }

      if (results.failed > 0) {
        console.warn(`[Broadcast] Completed with failures:`, results.errors);
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
      const {
        ownerId,
        testMobile,
        apiKey,
        phoneId,
        watiAccessToken,
        watiApiEndpoint,
        method,
        templateToTest,
      } = req.body;
      if (!ownerId) {
        return res.status(400).json({ error: "No user authenticated." });
      }

      let settings: any = {
        metaWhatsAppApiKey: apiKey,
        metaWhatsAppPhoneNumberId: phoneId,
        watiAccessToken: watiAccessToken,
        watiApiEndpoint: watiApiEndpoint,
        preferredNotificationMethod: method,
      };

      if (admin.apps.length) {
        const db = getAdminDb();
        if (!db)
          throw new Error(
            "Firebase Admin Database is not available. Please verify your FIREBASE_SERVICE_ACCOUNT setting.",
          );
        const settingsDoc = await db.collection("settings").doc(ownerId).get();
        if (settingsDoc.exists) {
          const dbSettings = settingsDoc.data() as any;
          if (!settings.metaWhatsAppApiKey)
            settings.metaWhatsAppApiKey = dbSettings.metaWhatsAppApiKey;
          if (!settings.metaWhatsAppPhoneNumberId)
            settings.metaWhatsAppPhoneNumberId =
              dbSettings.metaWhatsAppPhoneNumberId;
          if (!settings.watiAccessToken)
            settings.watiAccessToken = dbSettings.watiAccessToken;
          if (!settings.watiApiEndpoint)
            settings.watiApiEndpoint = dbSettings.watiApiEndpoint;
          if (!settings.preferredNotificationMethod)
            settings.preferredNotificationMethod =
              dbSettings.preferredNotificationMethod;
          // Also fetch template names for convenience if not provided
          if (!settings.metaTemplateBilling)
            settings.metaTemplateBilling = dbSettings.metaTemplateBilling;
          if (!settings.metaTemplateReceipt)
            settings.metaTemplateReceipt = dbSettings.metaTemplateReceipt;
          if (!settings.metaTemplateBroadcast)
            settings.metaTemplateBroadcast = dbSettings.metaTemplateBroadcast;
        }
      }

      if (!settings?.metaWhatsAppApiKey && !settings?.watiAccessToken) {
        return res
          .status(400)
          .json({ error: "WhatsApp API not configured in settings" });
      }

      let testCustName = "Customer";
      let testCustBalance = 0;
      let testCustId =
        "CUST-" + Math.random().toString(36).substr(2, 6).toUpperCase();

      if (admin.apps.length) {
        try {
          // Try to fetch at least one real customer to make test data genuine
          const db = getAdminDb();
          const custSnap = await db
            ?.collection("customers")
            .where("ownerId", "==", ownerId)
            .limit(1)
            .get();
          if (custSnap && !custSnap.empty) {
            const custData = custSnap.docs[0].data();
            testCustName = custData.name || "Customer";
            testCustBalance = custData.balance || 0;
            testCustId = custData.id || testCustId;
          }
        } catch (e) {}
      }

      const lang = settings?.preferredLanguage || 'en';
      const generatedTestPdfBase64 = await generateInvoicePdf(
        testCustName,
        testCustBalance,
        undefined,
        settings?.billTemplateImage,
        lang
      );

      const message = lang === 'hi' 
        ? "यह आपके स्मार्टबिलिंग इंजन से एक परीक्षण सूचना है! यदि आप इसे देखते हैं, तो आपका एपीआई कॉन्फ़िगरेशन एकदम सही है। ✅" 
        : lang === 'pa'
        ? "ਇਹ ਤੁਹਾਡੇ ਸਮਾਰਟਬਿਲਿੰਗ ਇੰਜਨ ਤੋਂ ਇੱਕ ਟੈਸਟ ਨੋਟੀਫਿਕੇਸ਼ਨ ਹੈ! ਜੇਕਰ ਤੁਸੀਂ ਇਸਨੂੰ ਦੇਖਦੇ ਹੋ, ਤਾਂ ਤੁਹਾਡੀ API ਕੌਂਫਿਗਰੇਸ਼ਨ ਬਿਲਕੁਲ ਸਹੀ ਹੈ। ✅"
        : "This is a test notification from your SmartBilling Engine! If you see this, your API configuration is PERFECT. ✅";

      try {
        let templateName;
        if (templateToTest && templateToTest !== "hello_world") {
          // Test specific template
          templateName = templateToTest;
          if (templateToTest === "billing")
            templateName = settings.metaTemplateBilling;
          else if (templateToTest === "receipt")
            templateName = settings.metaTemplateReceipt;
          else if (templateToTest === "broadcast")
            templateName = settings.metaTemplateBroadcast;

          if (!templateName)
            throw new Error(
              `The '${templateToTest}' template name is not configured in your settings.`,
            );

          let finalTemplateParams: any[] = [testCustName];
          if (settings.metaCustomTemplates) {
            const matchedConfig = settings.metaCustomTemplates.find((t:any) => t.templateName === templateName);
            if (matchedConfig && matchedConfig.parameters) {
              const paramKeys = matchedConfig.parameters.split(',').map((s:string) => s.trim());
              finalTemplateParams = paramKeys.map((key:string) => {
                if (key === 'customer_name') return testCustName;
                if (key === 'customer_balance') return testCustBalance;
                if (key === 'billing_amount') return settings?.billingAmount || 0;
                if (key === 'new_balance') return testCustBalance;
                if (key === 'payment_amount') return testCustBalance;
                if (key === 'overdue_amount') return testCustBalance;
                if (key === 'date') return new Date().toLocaleDateString('en-GB');
                if (key === 'portal_link') return `${settings.publicPortalBaseUrl || 'https://ais-dev-bgo3e3yfqihdrbor7bolgx-496681651924.asia-southeast1.run.app'}/?portal=true&customerId=${testCustId}`;
                if (key === 'button_param') return { isButtonParam: true, value: `?portal=true&customerId=${testCustId}`, index: "0" };
                return '';
              });
            }
          }

          await sendWhatsAppMessage(
            settings,
            testMobile,
            message,
            generatedTestPdfBase64,
            "Test_Invoice.pdf",
            true,
            "custom",
            finalTemplateParams,
            templateName,
          );
        } else {
          // Default test (hello_world)
          await sendWhatsAppMessage(
            settings,
            testMobile,
            message,
            generatedTestPdfBase64,
            "Test_Invoice.pdf",
            true,
          );
        }
      } catch (err: any) {
        // If meta throws template not found (meaning it's a live number which lacks hello_world)
        const errLower = err.message.toLowerCase();
        let needsFallback = false;

        if (
          errLower.includes("132012") ||
          errLower.includes("132000") ||
          errLower.includes("expected number of params") ||
          errLower.includes("131008") ||
          errLower.includes("parameter is missing") ||
          errLower.includes("format mismatch")
        ) {
          let numParams = 1;
          const match = err.message.match(
            /expected number of params \((\d+)\)/,
          );
          if (match && match[1]) numParams = parseInt(match[1]);
          else if (errLower.includes("button")) numParams = 6; // Just add some params to body and assume 1 button param needed

          const paramsArr: any[] = Array(numParams).fill(testCustName);
          paramsArr[0] = testCustName;

          if (errLower.includes("button") || errLower.includes("131008")) {
            paramsArr.push({
              isButtonParam: true,
              value: testCustId,
              index: "0",
            }); // Provide real ID for the portal link
          }

          const tCat =
            templateToTest && templateToTest !== "hello_world"
              ? "custom"
              : undefined;
          const tName =
            templateToTest && templateToTest !== "hello_world"
              ? templateToTest === "billing"
                ? settings.metaTemplateBilling
                : templateToTest === "receipt"
                  ? settings.metaTemplateReceipt
                  : templateToTest === "broadcast"
                    ? settings.metaTemplateBroadcast
                    : templateToTest
              : undefined;
          try {
            // We will always try to pass the generated PDF so that if it expects a DOCUMENT, it succeeds
            await sendWhatsAppMessage(
              settings,
              testMobile,
              message,
              generatedTestPdfBase64,
              "Test_Invoice.pdf",
              true,
              tCat as any,
              paramsArr,
              tName,
            );
            return res.json({
              status: "success",
              info: `Message sent! Auto-filled parameter(s) using customer: ${testCustName}`,
            });
          } catch (err2: any) {
            const err2Lower = err2.message.toLowerCase();
            let handled = false;

            // If it still wants button params and we haven't satisfied it, or vice versa
            if (
              err2Lower.includes("expected number of params") &&
              !errLower.includes("expected number of params")
            ) {
              const match2 = err2.message.match(
                /expected number of params \((\d+)\)/,
              );
              if (match2 && match2[1]) {
                const newParams: any[] = Array(parseInt(match2[1])).fill(
                  testCustName,
                );
                newParams.push({
                  isButtonParam: true,
                  value: testCustId,
                  index: "0",
                });
                try {
                  await sendWhatsAppMessage(
                    settings,
                    testMobile,
                    message,
                    generatedTestPdfBase64,
                    "Test_Invoice.pdf",
                    true,
                    tCat as any,
                    newParams,
                    tName,
                  );
                  handled = true;
                  return res.json({
                    status: "success",
                    info: `Message sent! Auto-filled parameter(s) using: ${testCustName}.`,
                  });
                } catch (e) {}
              }
            }
            if (
              !handled &&
              (err2Lower.includes("132012") ||
                err2Lower.includes("format mismatch"))
            ) {
              // Attempt without document
              try {
                await sendWhatsAppMessage(
                  settings,
                  testMobile,
                  message,
                  undefined,
                  undefined,
                  true,
                  tCat as any,
                  paramsArr,
                  tName,
                );
                handled = true;
                return res.json({
                  status: "success",
                  info: `Message sent! Adjusted header format.`,
                });
              } catch (e) {}
            }

            if (!handled) {
              if (
                err2Lower.includes("131058") ||
                err2Lower.includes("hello_world") ||
                err2Lower.includes("hello world") ||
                err2Lower.includes("test number") ||
                err2Lower.includes("does not exist")
              ) {
                needsFallback = true;
              } else {
                throw err2;
              }
            }
          }
        } else if (
          errLower.includes("hello_world") ||
          errLower.includes("hello world") ||
          errLower.includes("test number") ||
          errLower.includes("does not exist") ||
          errLower.includes("131058")
        ) {
          needsFallback = true;
        } else {
          throw err;
        }

        if (needsFallback) {
          try {
            // Try sending as a broadcast template first (useful for live numbers without 24h window)
            await sendWhatsAppMessage(
              settings,
              testMobile,
              message,
              generatedTestPdfBase64,
              "Test_Invoice.pdf",
              false,
              "broadcast",
              [testCustName],
            );
          } catch (fallbackErr: any) {
            const fbLower = fallbackErr.message.toLowerCase();
            let finalErrFallback = fallbackErr;

            if (
              fbLower.includes("132000") ||
              fbLower.includes("expected number of params") ||
              fbLower.includes("131008") ||
              fbLower.includes("parameter is missing")
            ) {
              let numParams = 1;
              const match2 = fallbackErr.message.match(
                /expected number of params \((\d+)\)/,
              );
              if (match2 && match2[1]) {
                numParams = parseInt(match2[1]);
              } else if (
                fbLower.includes("button") ||
                fbLower.includes("131008")
              ) {
                numParams = 6;
              }
              const paramsArr: any[] = Array(numParams).fill(testCustName);
              paramsArr[0] = testCustName;
              if (fbLower.includes("button") || fbLower.includes("131008")) {
                paramsArr.push({
                  isButtonParam: true,
                  value: testCustId,
                  index: "0",
                });
              }
              try {
                await sendWhatsAppMessage(
                  settings,
                  testMobile,
                  message,
                  generatedTestPdfBase64,
                  "Test_Invoice.pdf",
                  false,
                  "broadcast",
                  paramsArr,
                );
                return res.json({
                  status: "success",
                  info: `Message sent! Auto-filled parameter(s) for Broadcast.`,
                });
              } catch (err3) {
                finalErrFallback = err3;
              }
            }

            try {
              // Final Attempt: standard text message (only works if 24h window is open)
              await sendWhatsAppMessage(
                settings,
                testMobile,
                message,
                undefined,
                undefined,
                false,
              );
            } catch (finalErr: any) {
              const finalLower = finalErr.message.toLowerCase();
              if (
                finalLower.includes("131047") ||
                finalLower.includes("24 hours") ||
                finalLower.includes("free-form")
              ) {
                throw new Error(
                  `Live Number detected: To test on a live phone number, you MUST do ONE of two things: 1) Configure an approved 'Broadcast Template' in the UI settings below (current broadcast template got error: ${finalErrFallback.message}), OR 2) Send an initial WhatsApp message (e.g. 'Hi') from your phone to your Business Phone Number to open a 24-hour service window.`,
                );
              }
              throw new Error(
                `Live Number test failed. Ensure your Meta Cloud API and templates are set up correctly. (API response: ${finalErr.message})`,
              );
            }
          }
        }
      }

      res.json({ status: "success", info: "Message sent! Check your phone." });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
  // 3. WhatsApp Chatbot Webhooks

  // Meta Webhook Verification
  app.get("/api/portal-chat/init/:portalId", async (req, res) => {
    try {
      const { portalId } = req.params;
      const portalSnap = await getDocClient(
        docClient(clientDb, "public_portals", portalId),
      );
      let portalData = portalSnap.exists() ? (portalSnap.data() as any) : null;
      
      if (!portalData) {
          const custSnap = await getDocClient(docClient(clientDb, "customers", portalId));
          if (custSnap.exists()) {
              const c = custSnap.data() as any;
              portalData = {
                  ownerId: c.ownerId,
                  customerId: portalId
              };
          }
      }

      if (!portalData) {
        return res.status(404).json({ error: "Portal not found" });
      }
      const ownerId = portalData.ownerId;
      const customerId = portalData.customerId;

      const chatbotSettings = (await getChatbotSettings(ownerId)) as any;
      const commands =
        chatbotSettings && chatbotSettings.isActive
          ? chatbotSettings.commands || []
          : [];

      let history: any[] = [];
      const dbInstance = admin.apps.length ? getRequiredAdminDb() : null;
      if (dbInstance) {
        const chatHistoryRef = dbInstance
          .collection("customers")
          .doc(customerId)
          .collection("chat_history")
          .orderBy("timestamp", "asc")
          .limit(20);
        const chatSnap = await chatHistoryRef.get();
        history = chatSnap.docs.map((d) => ({
          role: d.data().role,
          content: d.data().content,
          attachments: d.data().attachments,
        }));
      } else {
        const chatHistoryRef = queryClient(
          collectionClient(clientDb, "customers", customerId, "chat_history"),
        ); // Simplified without sorting due to index needs
        const chatSnap = await getDocsClient(chatHistoryRef);
        history = chatSnap.docs.map((d) => ({
          role: d.data().role,
          content: d.data().content,
          timestamp: d.data().timestamp || "",
          attachments: d.data().attachments,
        }));
        history.sort((a, b) => {
          if (!a.timestamp) return -1;
          if (!b.timestamp) return 1;
          if (a.timestamp.seconds)
            return a.timestamp.seconds - b.timestamp.seconds;
          return (
            new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
          );
        });
        history = history.map((h) => ({
          role: h.role,
          content: h.content,
          attachments: h.attachments,
        }));
      }

      // Merge DEFAULT_SYSTEM_COMMANDS into user commands if not present
      const activeCommands = [...commands];
      for (const sys of DEFAULT_SYSTEM_COMMANDS) {
        if (
          !activeCommands.find((c: any) => c.triggerWord === sys.triggerWord)
        ) {
          if (sys.isActive) activeCommands.push(sys);
        }
      }

      res.json({
        commands: activeCommands.filter((c: any) => c.isActive),
        history,
      });
    } catch (err: any) {
      console.error(err);
      res.status(500).json({ error: "Internal Server Error" });
    }
  });

  app.post("/api/portal-chat/:portalId", async (req, res) => {
    try {
      const { portalId } = req.params;
      const { message, customerId, ownerId } = req.body;

      if (!message || !customerId || !ownerId)
        return res.status(400).json({ error: "Missing parameters" });

      const chatbotSettings = await getChatbotSettings(ownerId);
      if (!chatbotSettings || !(chatbotSettings as any).isActive) {
        return res.status(400).json({ error: "Chatbot is not enabled." });
      }

      const dbInstance = admin.apps.length ? getRequiredAdminDb() : null;

      // Save user message
      if (dbInstance) {
        await dbInstance
          .collection("customers")
          .doc(customerId)
          .collection("chat_history")
          .add({
            role: "user",
            content: message,
            timestamp: FieldValue.serverTimestamp(),
          });
      }

      // Check rules
      let replyText =
        "I'm sorry, I don't understand that command. Please select from the available options or contact the office.";
      const msgLower = message.toLowerCase().trim();
      let matched = false;
      let attachments: any[] = [];
      let sysTrigger = "";
      let hasCustomCommandMatched = false;

      // Also fetch customer for variables
      let custData: any = {};
      if (dbInstance) {
        try {
          const cDoc = await dbInstance
            .collection("customers")
            .doc(customerId)
            .get();
          custData = cDoc.data() || {};
        } catch (e) {}
      }

      // Fallback: get portalData because it contains the snapshot of balance
      if (!custData.name) {
        const portalSnap = await getDocClient(
          docClient(clientDb, "public_portals", portalId),
        );
        if (portalSnap.exists()) {
          custData = portalSnap.data() || {};
          custData.name = custData.customerName; // map customerName to name for variables
        }
      }

      let matchedCommand: any = null;
      // First check user defined commands (which includes modified system commands!)
      for (const cmd of (chatbotSettings as any).commands || []) {
        if (!cmd.isActive) continue;
        if (testChatbotCommand(message, cmd.triggerWord, cmd.buttonLabel)) {
          replyText = cmd.response || "";
          sysTrigger = cmd.triggerWord;
          hasCustomCommandMatched = true;
          matchedCommand = cmd;
          matched = true;
          break;
        }
      }

      const adminSettings = await getSettings(ownerId);

      if (!hasCustomCommandMatched) {
        sysTrigger = msgLower;
      }

      const intentRes = await routeSystemIntent(
        sysTrigger,
        custData,
        ownerId,
        adminSettings,
        hasCustomCommandMatched ? replyText : "",
        chatbotSettings,
        req.get("host"),
      );
      if (intentRes.matched) {
        replyText = intentRes.replyText;
        attachments = intentRes.attachments;
        matched = true;
      } else if (hasCustomCommandMatched) {
        matched = true;
        if (matchedCommand?.mediaUrl) {
          attachments.push({
            type: "file",
            name: matchedCommand.mediaName || "Attachment",
            data: matchedCommand.mediaUrl
          });
        }
      } else if (msgLower.startsWith("complaint:")) {
        const complaintText = message.substring(10).trim();
        if (complaintText.length > 5) {
          const complaintId =
            "COMP-" + Math.random().toString(36).substr(2, 8).toUpperCase();
          await saveComplaintData(complaintId, {
            id: complaintId,
            customerId: customerId,
            ownerId: ownerId,
            customerName: custData.name,
            mobileNumber: custData.mobileNumber || "",
            category: "General",
            description: complaintText,
            billStatus:
              custData.balance > 0 ? `Unpaid (₹${custData.balance})` : "Paid",
            status: "Pending",
            priority: "Medium",
            createdAt: new Date().toISOString(),
            expiresAt: new Date(
              Date.now() + 180 * 24 * 60 * 60 * 1000,
            ).toISOString(), // 6 months
          });
          replyText = `Thank you. Your complaint has been registered successfully. We will resolve it soon!`;
        } else {
          replyText = `Please provide more details for your complaint.`;
        }
        matched = true;
      }

      // Replace variables
      replyText = processDynamicResponse(replyText, custData);

      // Save bot reply
      if (dbInstance) {
        await dbInstance
          .collection("customers")
          .doc(customerId)
          .collection("chat_history")
          .add({
            role: "assistant",
            content: replyText,
            attachments: attachments.length > 0 ? attachments : null,
            timestamp: FieldValue.serverTimestamp(),
          });
      }

      return res.json({
        reply: replyText,
        attachments: attachments.length > 0 ? attachments : undefined,
      });
    } catch (err: any) {
      console.error("[Webhook] Portal AI error:", err);
      res.status(500).json({ error: "Internal Server Error: " + err.message });
    }
  });

  app.post("/api/complaints/notify-resolution", async (req, res) => {
    try {
      const { complaintId, ownerId, customerId } = req.body;
      if (!complaintId || !ownerId || !customerId)
        return res.status(400).json({ error: "Missing params" });

      const db = getAdminDb();
      if (!db)
        throw new Error(
          "Firebase Admin Database is not available. Please verify your FIREBASE_SERVICE_ACCOUNT setting.",
        );
      const settingsSnap = await db.collection("settings").doc(ownerId).get();
      const settings = settingsSnap.exists ? settingsSnap.data() : null;

      const customerDoc = await db
        .collection("customers")
        .doc(customerId)
        .get();
      const customer = customerDoc.exists ? customerDoc.data() : null;

      if (
        customer &&
        settings &&
        ((settings.metaWhatsAppApiKey && settings.metaWhatsAppPhoneNumberId) ||
          settings.watiAccessToken)
      ) {
        const msg = `Dear ${customer.name}, your complaint (${complaintId}) has been resolved. ✅ Thank you for your patience!`;
        await sendWhatsAppMessage(settings as any, customer.mobileNumber, msg);

        await db
          .collection("customers")
          .doc(customerId)
          .collection("chat_history")
          .add({
            role: "assistant",
            content: msg,
            timestamp: FieldValue.serverTimestamp(),
          });

        return res.json({ success: true });
      }
      res
        .status(400)
        .json({ error: "Could not send notification. Check WhatsApp setup." });
    } catch (err) {
      console.error("[Complaint] Resolution notify failed:", err);
      res.status(500).json({ error: "Automation failed" });
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
          res.set("Content-Type", "text/plain");
          return res.status(200).send(challenge);
        } else {
          console.warn(
            `[Webhook] Token mismatch. Expected: ${storedToken}, Got: ${token}`,
          );
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
  const processedMessageIds: string[] = [];
  app.post("/api/whatsapp-webhook/:ownerId", async (req, res) => {
    try {
      const { ownerId } = req.params;

      const body = req.body;
      if (!body.object) {
        return res.sendStatus(200);
      }

      // Note: On Render, background processing works perfectly.
      // Note: On Google Cloud Run free tier, background processing might pause unless "CPU is always allocated".
      // Therefore, we process synchronously.
      // We use a safety timeout to ensure Meta gets a 200 OK within its 15s window
      // even if the database or API calls are slow.
      const safetyTimeout = setTimeout(() => {
        if (!res.headersSent) {
          console.warn(
            "[Webhook] Safety timeout reached (12s). Sending 200 to Meta early.",
          );
          res.sendStatus(200);
        }
      }, 12000);

      const entries = body.entry || [];

      try {
        for (const entry of entries) {
          const changes = entry.changes || [];
          for (const change of changes) {
            const messages = change.value?.messages || [];
            for (const messageObj of messages) {
              const msgId = messageObj.id;
              if (msgId) {
                if (processedMessageIds.includes(msgId)) {
                  console.log(`[Webhook] Ignoring duplicate message: ${msgId}`);
                  continue;
                }
                processedMessageIds.push(msgId);
                if (processedMessageIds.length > 2000)
                  processedMessageIds.shift();

                // DB-backed deduplication to handle Cloud Run multi-instance scaling
                const dbInstance = admin.apps.length ? getRequiredAdminDb() : null;
                if (dbInstance) {
                  try {
                    const dedupRef = dbInstance.collection("webhook_dedup").doc(msgId);
                    const dedupDoc = await dedupRef.get();
                    if (dedupDoc.exists) {
                      console.log(`[Webhook] Ignoring duplicate message (DB): ${msgId}`);
                      continue;
                    }
                    await dedupRef.set({ timestamp: FieldValue.serverTimestamp() });
                  } catch (e) {
                    console.error("Dedup DB check failed:", e);
                  }
                }
              }

              const fromMobile = messageObj.from;
              const msgBody = messageObj.text?.body;
              const msgType = messageObj.type;

              console.log(
                `[Webhook] Received message from ${fromMobile} for owner ${ownerId}: ${msgBody || msgType}`,
              );

              try {
                const cleanMobile = fromMobile.replace(/\D/g, "");
                let matchedCustomer = await getCustomerByMobile(
                  ownerId,
                  cleanMobile,
                );

                if (matchedCustomer && matchedCustomer.status !== "Suspended") {
                  const settings = await getSettings(ownerId);

                  if (msgType === "image") {
                    const imageId = messageObj.image?.id;
                    if (imageId && settings && settings.metaWhatsAppApiKey) {
                      try {
                        // Fetch media URL
                        const mediaRes = await fetch(
                          `https://graph.facebook.com/v17.0/${imageId}`,
                          {
                            headers: {
                              Authorization: `Bearer ${settings.metaWhatsAppApiKey}`,
                            },
                          },
                        );
                        const mediaData = await mediaRes.json();

                        if (mediaData.url) {
                          // Fetch image binary
                          const imgRes = await fetch(mediaData.url, {
                            headers: {
                              Authorization: `Bearer ${settings.metaWhatsAppApiKey}`,
                            },
                          });
                          const contentType =
                            imgRes.headers.get("content-type") || "image/jpeg";
                          const arrayBuf = await imgRes.arrayBuffer();
                          const buffer = Buffer.from(arrayBuf);

                          const dbInstance = admin.apps.length
                            ? getRequiredAdminDb()
                            : null;
                          if (dbInstance) {
                            const receiptId = `REC-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
                            let imageUrl = "";

                            try {
                              const bucket = admin.storage().bucket();
                              const file = bucket.file(
                                `receipts/${ownerId}/${receiptId}`,
                              );
                              await file.save(buffer, {
                                metadata: { contentType },
                              });
                              const signedUrls = await file.getSignedUrl({
                                action: "read",
                                expires: "01-01-2499",
                              });
                              imageUrl = signedUrls[0];
                            } catch (e: any) {
                              console.error(
                                "Storage upload failed, fallback to base64",
                                e,
                              );
                              imageUrl = `data:${contentType};base64,${buffer.toString("base64")}`;
                            }

                            await dbInstance
                              .collection("payment_receipts")
                              .doc(receiptId)
                              .set({
                                id: receiptId,
                                customerId: matchedCustomer.id,
                                customerName: matchedCustomer.name,
                                ownerId: ownerId,
                                amount: matchedCustomer.balance || 0, // Default to their full balance
                                base64Image: imageUrl,
                                status: "Pending",
                                submittedAt: new Date().toISOString(),
                              });

                            // Send Acknowledgment
                            await sendWhatsAppMessage(
                              settings as unknown as AppSettings,
                              fromMobile,
                              "Thank you! We have received your payment screenshot. It is currently under verification. We will notify you once your payment is approved.",
                            );

                            // Log in chat history
                            await dbInstance
                              .collection("customers")
                              .doc(matchedCustomer.id)
                              .collection("chat_history")
                              .add({
                                role: "user",
                                content: "Uploaded payment screenshot.",
                                source: "whatsapp",
                                timestamp: FieldValue.serverTimestamp(),
                              });
                          }
                        }
                      } catch (e) {
                        console.error("Failed to process image receipt:", e);
                      }
                    }
                  } else if (msgBody) {
                    const dbInstance = admin.apps.length
                      ? getRequiredAdminDb()
                      : null;
                    if (dbInstance) {
                      try {
                        await dbInstance
                          .collection("customers")
                          .doc(matchedCustomer.id)
                          .collection("chat_history")
                          .add({
                            role: "user",
                            content: msgBody,
                            source: "whatsapp",
                            timestamp: FieldValue.serverTimestamp(),
                          });
                      } catch (e) {}
                      
                      if (matchedCustomer.pendingMonthlyReport) {
                        try {
                          await dbInstance.collection("customers").doc(matchedCustomer.id).update({
                            pendingMonthlyReport: false
                          });
                          
                          // Convert user input to lower case for case-insensitive matching
                          const requestedMonthYear = msgBody.trim().toLowerCase();
                          
                          // Search for the report
                          const reportSnap = await dbInstance
                            .collection("reports")
                            .where("ownerId", "==", ownerId)
                            .get();
                            
                          let foundReport = null;
                          let reportFileUrl = "";
                          let reportFileName = "";
                          
                          for (const doc of reportSnap.docs) {
                            const r = doc.data();
                            if (r.title && r.title.toLowerCase().includes(requestedMonthYear)) {
                              foundReport = r;
                              if (r.files && r.files.length > 0) {
                                reportFileUrl = r.files[0].data;
                                reportFileName = r.files[0].name || "Report.pdf";
                              } else if (r.assetLink) {
                                reportFileUrl = r.assetLink;
                                reportFileName = "DriveLink";
                              }
                              break;
                            }
                          }
                          
                          let compResText = "";
                          
                          if (foundReport && reportFileUrl) {
                            compResText = `Here is the requested report for ${requestedMonthYear}.`;
                            await dbInstance.collection("customers").doc(matchedCustomer.id).collection("chat_history").add({
                              role: "assistant",
                              content: compResText,
                              source: "whatsapp",
                              timestamp: FieldValue.serverTimestamp(),
                            });
                            
                            if (settings && settings.metaWhatsAppPhoneNumberId) {
                               // Send the report file via WhatsApp
                               if (reportFileName === "DriveLink" || reportFileUrl.includes("drive.google.com") || (!reportFileUrl.startsWith("data:") && reportFileUrl.startsWith("http"))) {
                                  // Send as a link in text
                                  compResText = `Here is the requested report for ${requestedMonthYear}:\n${reportFileUrl}`;
                                  await sendWhatsAppMessage(settings as any, matchedCustomer.mobileNumber, compResText);
                               } else if (reportFileUrl.startsWith("data:")) {
                                  const base64Data = reportFileUrl.split(',')[1];
                                  await sendWhatsAppMessage(settings as any, matchedCustomer.mobileNumber, compResText, base64Data, reportFileName);
                               }
                            }
                          } else {
                            compResText = `The report does not exist.`;
                            await dbInstance.collection("customers").doc(matchedCustomer.id).collection("chat_history").add({
                              role: "assistant",
                              content: compResText,
                              source: "whatsapp",
                              timestamp: FieldValue.serverTimestamp(),
                            });
                            if (settings && settings.metaWhatsAppPhoneNumberId) {
                              await sendWhatsAppMessage(settings as any, matchedCustomer.mobileNumber, compResText);
                            }
                          }
                          
                          continue;
                        } catch (e) {
                          console.error("Error processing monthly report fetch:", e);
                        }
                      }
                      
                      if (matchedCustomer.pendingComplaint) {
                        try {
                          const complaintId = "COMP-" + Math.random().toString(36).substr(2, 8).toUpperCase();
                          await saveComplaintData(complaintId, {
                            id: complaintId,
                            customerId: matchedCustomer.id,
                            ownerId: ownerId,
                            customerName: matchedCustomer.name,
                            mobileNumber: matchedCustomer.mobileNumber || "",
                            category: "Service Request",
                            message: "WhatsApp Complaint",
                            description: msgBody,
                            billStatus: matchedCustomer.balance > 0 ? `Unpaid (₹${matchedCustomer.balance})` : "Paid",
                            status: "Pending",
                            priority: "Medium",
                            createdAt: new Date().toISOString(),
                            expiresAt: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
                          });
                          
                          await dbInstance.collection("customers").doc(matchedCustomer.id).update({
                            pendingComplaint: false
                          });
                          
                          const compResText = `Thank you. Your complaint has been registered successfully. We will resolve it soon!`;
                          
                          await dbInstance.collection("customers").doc(matchedCustomer.id).collection("chat_history").add({
                            role: "assistant",
                            content: compResText,
                            source: "whatsapp",
                            timestamp: FieldValue.serverTimestamp(),
                          });
                          
                          if (settings && settings.metaWhatsAppPhoneNumberId) {
                            try {
                              await sendWhatsAppMessage(settings as any, matchedCustomer.mobileNumber, compResText);
                            } catch (err) {}
                          }
                          continue; // skip further bot processing for this message
                        } catch (e) {}
                      }
                      
                      if (matchedCustomer.pendingDeepReportInquiry) {
                        try {
                           await dbInstance.collection("customers").doc(matchedCustomer.id).update({
                             pendingDeepReportInquiry: false
                           });
                           
                           const auditId = Math.random().toString(36).substr(2, 9);
                           await dbInstance.collection("billing_audit").doc(auditId).set({
                             id: auditId,
                             ownerId: ownerId,
                             type: 'inquiry',
                             customerId: matchedCustomer.id,
                             customerName: matchedCustomer.name,
                             description: msgBody,
                             affectedCustomersCount: 1,
                             totalAmount: 0,
                             timestamp: new Date().toISOString(),
                             executedBy: 'system'
                           });
                           
                           const compResText = `Thank you. The request has been submitted. We will inform you of the next steps within 24 working hours.`;
                           
                           await dbInstance.collection("customers").doc(matchedCustomer.id).collection("chat_history").add({
                             role: "assistant",
                             content: compResText,
                             source: "whatsapp",
                             timestamp: FieldValue.serverTimestamp(),
                           });
                           
                           if (settings && settings.metaWhatsAppPhoneNumberId) {
                             try {
                               await sendWhatsAppMessage(settings as any, matchedCustomer.mobileNumber, compResText);
                             } catch (err) {}
                           }
                           continue; // skip further bot processing for this message
                        } catch (e) {}
                      }
                    }

                    const chatbotSettings = (await getChatbotSettings(
                      ownerId,
                    )) as any;
                    let handled = false;
                    const msgLower = msgBody.toLowerCase().trim();
                    let responseText =
                      "I'm sorry, I don't understand that command.";
                    let sysTrigger = "";
                    let hasCustomCommandMatched = false;
                    let matchedCommand: any = null;

                    if (
                      chatbotSettings &&
                      chatbotSettings.isActive &&
                      Array.isArray(chatbotSettings.commands)
                    ) {
                      for (const cmd of chatbotSettings.commands) {
                        if (
                          cmd.isActive &&
                          testChatbotCommand(
                            msgBody,
                            cmd.triggerWord,
                            cmd.buttonLabel,
                          )
                        ) {
                          console.log(
                            `[Webhook] Matched chatbot command: ${cmd.triggerWord} for ${matchedCustomer.name}`,
                          );
                          responseText = processDynamicResponse(
                            cmd.response || "",
                            matchedCustomer,
                          );
                          sysTrigger = cmd.triggerWord;
                          hasCustomCommandMatched = true;
                          matchedCommand = cmd;
                          break;
                        }
                      }
                    }

                    if (!hasCustomCommandMatched) {
                      sysTrigger = msgLower;
                    }

                    const intentRes = await routeSystemIntent(
                      sysTrigger,
                      matchedCustomer,
                      ownerId,
                      settings,
                      hasCustomCommandMatched ? responseText : "",
                      chatbotSettings,
                      req.get("host"),
                    );

                    let attachmentsToPass: any[] = [];
                    if (intentRes.matched) {
                      responseText = intentRes.replyText;
                      if (
                        intentRes.attachments &&
                        intentRes.attachments.length > 0
                      ) {
                        attachmentsToPass = intentRes.attachments;
                      }
                      handled = true;
                      
                      if (intentRes.action === "complaint" && dbInstance) {
                        try {
                           await dbInstance.collection("customers").doc(matchedCustomer.id).update({
                             pendingComplaint: true
                           });
                        } catch (e) {}
                      } else if (intentRes.action === "monthly_report" && dbInstance) {
                        try {
                           await dbInstance.collection("customers").doc(matchedCustomer.id).update({
                             pendingMonthlyReport: true
                           });
                        } catch (e) {}
                      } else if (intentRes.action === "deep_report" && dbInstance) {
                         try {
                           await dbInstance.collection("customers").doc(matchedCustomer.id).update({
                             pendingDeepReportInquiry: true
                           });
                         } catch (e) {}
                      }
                    } else if (hasCustomCommandMatched) {
                      handled = true;
                      if (matchedCommand?.mediaUrl) {
                        attachmentsToPass.push({
                          type: "file",
                          name: matchedCommand.mediaName || "Attachment",
                          data: matchedCommand.mediaUrl
                        });
                      }
                    } else if (
                      msgLower.startsWith("complaint") ||
                      msgLower.startsWith("issue")
                    ) {
                      // Extract content after "complaint" or "complaint:"
                      let complaintText = msgBody;
                      if (msgLower.startsWith("complaint:")) {
                        complaintText = msgBody.substring(10).trim();
                      } else if (msgLower.startsWith("complaint ")) {
                        complaintText = msgBody.substring(10).trim();
                      } else if (msgLower.startsWith("issue ")) {
                        complaintText = msgBody.substring(6).trim();
                      } else if (msgLower.startsWith("issue:")) {
                        complaintText = msgBody.substring(6).trim();
                      }

                      // Strip quotes if they provided them
                      if (
                        complaintText.startsWith('"') &&
                        complaintText.endsWith('"')
                      ) {
                        complaintText = complaintText.substring(
                          1,
                          complaintText.length - 1,
                        );
                      } else if (
                        complaintText.startsWith("'") &&
                        complaintText.endsWith("'")
                      ) {
                        complaintText = complaintText.substring(
                          1,
                          complaintText.length - 1,
                        );
                      }

                      if (
                        complaintText.length > 5 &&
                        complaintText.toLowerCase() !== "complaint" &&
                        complaintText.toLowerCase() !== "issue"
                      ) {
                        const complaintId =
                          "COMP-" +
                          Math.random().toString(36).substr(2, 8).toUpperCase();
                        await saveComplaintData(complaintId, {
                          id: complaintId,
                          customerId: matchedCustomer.id,
                          ownerId: ownerId,
                          customerName: matchedCustomer.name,
                          mobileNumber: matchedCustomer.mobileNumber || "",
                          category: "Service Request",
                          message: "WhatsApp Complaint",
                          description: complaintText,
                          billStatus:
                            matchedCustomer.balance > 0
                              ? `Unpaid (₹${matchedCustomer.balance})`
                              : "Paid",
                          status: "Pending",
                          priority: "Medium",
                          createdAt: new Date().toISOString(),
                          expiresAt: new Date(
                            Date.now() + 180 * 24 * 60 * 60 * 1000,
                          ).toISOString(), // 6 months
                        });
                        responseText = `Thank you. Your complaint has been registered successfully. We will resolve it soon!`;
                      } else {
                        responseText = `Please provide more details. Try typing "Complaint " followed by your issue in quotes. (Example: Complaint "my meter is broken")`;
                      }
                      handled = true;
                    } else {
                      // Unrecognized command
                      // The user requested that we do not reply at all to unrecognized commands to prevent spam.
                      handled = false;
                    }

                    if (
                      handled &&
                      settings &&
                      ((settings.metaWhatsAppApiKey &&
                        settings.metaWhatsAppPhoneNumberId) ||
                        settings.watiAccessToken)
                    ) {
                      try {
                        if (attachmentsToPass.length > 0) {
                          await sendWhatsAppMessage(
                            settings as unknown as AppSettings,
                            fromMobile,
                            responseText,
                            attachmentsToPass[0].data,
                            attachmentsToPass[0].name,
                          );
                        } else {
                          await sendWhatsAppMessage(
                            settings as unknown as AppSettings,
                            fromMobile,
                            responseText,
                          );
                        }
                        const dbInstance = admin.apps.length
                          ? getRequiredAdminDb()
                          : null;
                        if (dbInstance) {
                          try {
                            await dbInstance
                              .collection("customers")
                              .doc(matchedCustomer.id)
                              .collection("chat_history")
                              .add({
                                role: "assistant",
                                content: responseText,
                                source: "whatsapp",
                                timestamp: FieldValue.serverTimestamp(),
                              });
                          } catch (e) {}
                        }
                      } catch (e) {
                        console.error(
                          "[Webhook] Failed to send chatbot reply:",
                          e,
                        );
                      }
                    }

                    const isComplaint =
                      msgBody.toLowerCase().includes("complaint") ||
                      msgBody.toLowerCase().includes("complain");
                    if (
                      !handled &&
                      isComplaint &&
                      settings?.automation?.autoCreateComplaints !== false
                    ) {
                      const complaintId = `COMP-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
                      await saveComplaintData(complaintId, {
                        id: complaintId,
                        customerId: matchedCustomer.id,
                        customerName: matchedCustomer.name,
                        message: "Automated Log",
                        description: msgBody,
                        billStatus:
                          matchedCustomer.balance > 0
                            ? `Unpaid (₹${matchedCustomer.balance})`
                            : "Paid",
                        status: "Pending",
                        createdAt: new Date().toISOString(),
                        ownerId: ownerId,
                      });
                      console.log(
                        `[Webhook] Logged complaint for ${matchedCustomer.name}`,
                      );

                      // Auto-reply
                      if (
                        settings &&
                        ((settings.metaWhatsAppApiKey &&
                          settings.metaWhatsAppPhoneNumberId) ||
                          settings.watiAccessToken)
                      ) {
                        try {
                          await sendWhatsAppMessage(
                            settings as unknown as AppSettings,
                            fromMobile,
                            `Dear ${matchedCustomer.name}, we have received your complaint (ID: ${complaintId}). We will look into it soon.`,
                          );
                        } catch (e) {
                          console.error(
                            "[Webhook] Failed to send auto-reply:",
                            e,
                          );
                        }
                      }
                      handled = true;
                    }

                    if (!handled) {
                      // All messages were handled either by exact keyword matches or complaints.
                    }
                  } // End of else if (msgBody)
                } else {
                  console.log(
                    "[Webhook] Message received from unknown number. Ignored.",
                  );
                }
              } catch (innerErr) {
                console.error("[Webhook] Processing error:", innerErr);
              }
            }
          }
        }
      } catch (botErr) {
        console.error("Bot execution error", botErr);
      } finally {
        clearTimeout(safetyTimeout);
        if (!res.headersSent) {
          res.sendStatus(200);
        }
      }
    } catch (err) {
      console.error("[Webhook] Handler error:", err);
      if (!res.headersSent) {
        res.sendStatus(200); // Always return 200 so Meta doesn't retry failed webhooks infinitely
      }
    }
  });

  // WhatsApp Web JS Integration
  let whatsappWebStatus = {
    status: "disabled",
    qr: null,
    error: null,
    solution: null,
  };
  // Compatibility endpoint for frontend checks
  app.get("/api/wweb/status", (req, res) => {
    res.json({ status: "disabled" });
  });

  app.post("/api/wweb/send", (req, res) => {
    res
      .status(400)
      .json({
        error:
          "WhatsApp Web is disabled on this server. Please use Meta Official API or WATI API.",
      });
  });

  // Portal Short Links format redirect
  app.get("/p/:portalId", (req, res) => {
    res.redirect(`/?portal=${req.params.portalId}`);
  });

  app.get("/api/portal-data/:portalId", async (req, res) => {
    try {
      const db = getAdminDb();
      if (!db) return res.status(500).json({ error: "No DB" });
      const portalId = req.params.portalId;
      
      const portalDoc = await db.collection("public_portals").doc(portalId).get();
      if (portalDoc.exists) {
        return res.json(portalDoc.data());
      }
      
      const custDoc = await db.collection("customers").doc(portalId).get();
      if (!custDoc.exists) return res.status(404).json({ error: "Portal not found" });
      
      const customer = custDoc.data() as any;
      const settingsDoc = await db.collection("settings").doc(customer.ownerId).get();
      const settings: any = settingsDoc.exists ? settingsDoc.data() : {};
      
      return res.json({
        portalId: customer.id,
        ownerId: customer.ownerId,
        customerId: customer.id,
        customerName: customer.name || "Customer",
        mobileNumber: customer.mobileNumber || "",
        balance: customer.balance || 0,
        billingAmount: settings.billingAmount || 0,
        penaltyAmount: settings.penaltyAmount || 0,
        penaltyDays: settings.penaltyDays || 0,
        upiQrCodeImage: settings.upiQrCodeImage || null,
        createdAt: Date.now()
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
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
    console.log(
      `SmartBilling Full-Stack Server running on http://localhost:${PORT}`,
    );
  });
}

startServer().catch((err) => {
  console.error("CRITICAL SERVER STARTUP ERROR:", err);
  process.exit(1);
});
