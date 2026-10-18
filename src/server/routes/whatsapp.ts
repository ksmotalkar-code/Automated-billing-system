import express from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.ts";

export interface WhatsAppRouteDeps {
  getSettings: (ownerId: string) => Promise<any>;
  getChatbotSettings: (ownerId: string) => Promise<any>;
  getCustomerByMobile: (ownerId: string, mobile: string) => Promise<any>;
  sendMessageUtil: (params: any) => Promise<any>;
  resolveOwnerIdForWebhook?: (requestedOwnerId: string, phoneNumberId?: string) => Promise<{ ownerId: string; settings: any }>;
}

export function createWhatsAppRouter(deps: WhatsAppRouteDeps) {
  const router = express.Router();

  // Test WhatsApp message dispatch (Protected by requireAuth)
  router.post("/wa/test", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const { mobileNumber, message, settings } = req.body;
      if (!mobileNumber || !message) {
        return res.status(400).json({ error: "Missing mobile number or message" });
      }

      let effectiveSettings = settings;
      if (!effectiveSettings || (!effectiveSettings.metaWhatsAppApiKey && !effectiveSettings.watiAccessToken)) {
        if (deps.resolveOwnerIdForWebhook) {
          try {
            const resolved = await deps.resolveOwnerIdForWebhook("system");
            if (resolved?.settings) {
              effectiveSettings = { ...(resolved.settings || {}), ...(effectiveSettings || {}) };
            }
          } catch (e) {
            console.warn("[WhatsAppRouter /wa/test] Settings resolution failed:", e);
          }
        }
      }

      console.log(`\n[WhatsAppRouter] POST /wa/test received for recipient: "${mobileNumber}"`);
      console.log(`[WhatsAppRouter] Invoking deps.sendMessageUtil...`);
      const result = await deps.sendMessageUtil({
        to: mobileNumber,
        message,
        settings: effectiveSettings,
      });
      console.log(`[WhatsAppRouter] deps.sendMessageUtil returned:`, JSON.stringify(result, null, 2));

      return res.json({ success: true, result });
    } catch (err: any) {
      console.error("[WhatsAppRouter] /wa/test error:", err);
      return res.status(500).json({ error: err.message || "Failed to send test message" });
    }
  });

  function cleanMetaCreds(apiKey?: string, phoneId?: string) {
    const cleanKey = apiKey ? String(apiKey).trim().replace(/^Bearer\s+/i, '').replace(/^['"]|['"]$/g, '').trim() : undefined;
    const cleanPhone = phoneId ? String(phoneId).trim().replace(/[\s\-\+]/g, '').replace(/^['"]|['"]$/g, '').trim() : undefined;
    return { apiKey: cleanKey, phoneId: cleanPhone };
  }

  function analyzeDiagnosticFailure(
    hasApiKey: boolean,
    hasPhoneId: boolean,
    checkOk: boolean,
    checkData: any,
    apiErrorMsg?: string
  ) {
    if (!hasApiKey || !hasPhoneId) {
      return {
        issueType: "MISSING_CONFIGURATION",
        title: "WhatsApp API Configuration Missing",
        summary: "Meta API Key or Phone Number ID is not configured in Settings.",
        actionSteps: [
          "Go to System Settings > WhatsApp API Configuration.",
          "Enter your Meta System User Permanent Access Token and Phone Number ID.",
          "Save settings and rerun diagnostics."
        ],
        isTokenExpired: false,
        isDataUseCheckup: false,
        isEndpointConfigError: true
      };
    }

    if (checkOk) {
      return {
        issueType: "NONE",
        title: "100% Operational & Healthy",
        summary: "Meta Cloud API node responded successfully. Graph API connection is active.",
        actionSteps: [],
        isTokenExpired: false,
        isDataUseCheckup: false,
        isEndpointConfigError: false
      };
    }

    const errObj = checkData?.error || {};
    const code = errObj.code;
    const subcode = errObj.error_subcode || errObj.subcode;
    const msg = String(errObj.message || apiErrorMsg || "").toLowerCase();
    const errType = String(errObj.type || "").toLowerCase();

    // 1. Data Use Checkup hold
    if (
      msg.includes("data use checkup") ||
      msg.includes("data_use_checkup") ||
      subcode === 2018278 ||
      (code === 200 && msg.includes("data use"))
    ) {
      return {
        issueType: "DATA_USE_CHECKUP_HOLD",
        title: "Meta Action Required: Complete Data Use Checkup",
        summary: "Your System User Permanent Access Token is valid, but Meta has temporarily paused live Graph API calls for your App until you complete the mandatory Data Use Checkup.",
        actionSteps: [
          "Open Meta Developers Dashboard (https://developers.facebook.com/apps/).",
          "Select your App and click the top alert banner: 'Complete Data Use Checkup'.",
          "Review permissions, certify data compliance, and click Submit.",
          "Live message dispatch will unblock immediately once submitted!"
        ],
        isTokenExpired: false,
        isDataUseCheckup: true,
        isEndpointConfigError: false,
        errorCode: code,
        errorSubcode: subcode
      };
    }

    // 2. Token Expiry or Invalid OAuth Credentials
    if (
      code === 190 ||
      code === 102 ||
      code === 10 ||
      errType.includes("oauthexception") ||
      msg.includes("session has expired") ||
      msg.includes("expired") ||
      msg.includes("invalid oauth") ||
      msg.includes("access token") ||
      msg.includes("token is invalid") ||
      msg.includes("revoked")
    ) {
      return {
        issueType: "TOKEN_EXPIRATION",
        title: "Meta Access Token Expired or Revoked",
        summary: "The configured Meta API Bearer Token is invalid, expired, or was revoked in Meta Business Manager.",
        actionSteps: [
          "Log into Meta Business Manager (business.facebook.com).",
          "Navigate to System Users under User Management.",
          "Select your System User and click 'Generate New Token'.",
          "Ensure 'whatsapp_business_messaging' and 'whatsapp_business_management' permissions are checked.",
          "Copy the new permanent token and paste it into Settings > Meta WhatsApp API Key."
        ],
        isTokenExpired: true,
        isDataUseCheckup: false,
        isEndpointConfigError: false,
        errorCode: code
      };
    }

    // 3. Incorrect Endpoint Configuration
    if (
      code === 100 ||
      msg.includes("does not exist") ||
      msg.includes("unsupported get request") ||
      msg.includes("phone_number_id") ||
      msg.includes("invalid parameter") ||
      msg.includes("object with id")
    ) {
      return {
        issueType: "INCORRECT_ENDPOINT_CONFIG",
        title: "Incorrect Phone Number ID or Endpoint URL Configuration",
        summary: "The configured Phone Number ID does not exist on Graph API v21.0 or does not belong to the WABA linked to your token.",
        actionSteps: [
          "Open Meta WhatsApp Manager > API Setup.",
          "Copy the exact 'Phone number ID' (e.g. 10002893829384) shown in the top dropdown.",
          "Ensure you are NOT using the WhatsApp Business Account ID instead of the Phone Number ID.",
          "Paste the verified Phone Number ID into Settings > Meta Phone Number ID."
        ],
        isTokenExpired: false,
        isDataUseCheckup: false,
        isEndpointConfigError: true,
        errorCode: code
      };
    }

    // 4. Fallback Generic API error
    return {
      issueType: "GENERIC_API_ERROR",
      title: "Meta Graph API Response Error",
      summary: errObj.message || apiErrorMsg || "Connection to Meta Graph API failed.",
      actionSteps: [
        "Check internet connectivity and verify Meta Graph API status (status.fb.com).",
        "Re-check credentials in System Settings."
      ],
      isTokenExpired: false,
      isDataUseCheckup: false,
      isEndpointConfigError: false,
      errorCode: code
    };
  }

  // Diagnostic Endpoint (Protected by requireAuth)
  router.get("/chatbot/diagnostics", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const ownerId = req.ownerId || (req.query.ownerId as string) || "system";
      let effectiveOwnerId = ownerId;
      let settings = await deps.getSettings(ownerId);
      if (deps.resolveOwnerIdForWebhook && (!settings?.metaWhatsAppApiKey || ownerId === "system")) {
        try {
          const resolved = await deps.resolveOwnerIdForWebhook(ownerId);
          if (resolved?.settings) {
            settings = resolved.settings;
          }
          if (resolved?.ownerId) {
            effectiveOwnerId = resolved.ownerId;
          }
        } catch (resErr) {
          console.warn("[WhatsAppRouter] resolveOwnerIdForWebhook error:", resErr);
        }
      }
      const chatbotSettings = await deps.getChatbotSettings(effectiveOwnerId);

      const clean = cleanMetaCreds(settings?.metaWhatsAppApiKey, settings?.metaWhatsAppPhoneNumberId);
      const hasMetaApiKey = Boolean(clean.apiKey);
      const hasPhoneId = Boolean(clean.phoneId);
      const verifyToken = settings?.metaWhatsAppVerifyToken || "Not Set";
      const botActive = Boolean(chatbotSettings?.isActive);
      const activeRules = Array.isArray(chatbotSettings?.commands)
        ? chatbotSettings.commands.filter((c: any) => c.isActive).length
        : 0;

      let metaApiReachable = false;
      let metaDetails = "Not checked";
      let isDataUseCheckup = false;
      let isTokenExpired = false;
      let isEndpointConfigError = false;
      let verifiedName = "";
      let displayPhone = "";
      let qualityRating = "UNKNOWN";
      let checkData: any = null;
      let checkOk = false;
      let apiErrorMsg = "";

      if (hasMetaApiKey && hasPhoneId) {
        try {
          const checkRes = await fetch(`https://graph.facebook.com/v21.0/${clean.phoneId}?fields=verified_name,display_phone_number,quality_rating,code_verification_status,status`, {
            headers: {
              Authorization: `Bearer ${clean.apiKey}`,
            },
          });
          checkData = await checkRes.json();
          checkOk = checkRes.ok;

          if (checkOk) {
            metaApiReachable = true;
            verifiedName = checkData.verified_name || "";
            displayPhone = checkData.display_phone_number || "";
            qualityRating = checkData.quality_rating || "GREEN";
            metaDetails = `Connected (${verifiedName || displayPhone || "Active"})`;
          } else {
            metaDetails = checkData.error?.message || "Invalid credentials";
          }
        } catch (apiErr: any) {
          apiErrorMsg = apiErr.message || "Connection failed";
          metaDetails = apiErrorMsg;
        }
      }

      const issueAnalysis = analyzeDiagnosticFailure(
        hasMetaApiKey,
        hasPhoneId,
        checkOk,
        checkData,
        apiErrorMsg
      );

      isDataUseCheckup = issueAnalysis.isDataUseCheckup;
      isTokenExpired = issueAnalysis.isTokenExpired;
      isEndpointConfigError = issueAnalysis.isEndpointConfigError;

      return res.json({
        ok: true,
        ownerId,
        webhookUrl: `${req.protocol}://${req.get("host")}/api/whatsapp-webhook`,
        verifyToken,
        botActive,
        activeRules,
        hasMetaApiKey,
        hasPhoneId,
        isDataUseCheckup,
        isTokenExpired,
        isEndpointConfigError,
        issueAnalysis,
        dataUseCheckupGuide: isDataUseCheckup
          ? "Your token is valid in Meta debugger, but Meta has temporarily paused live API calls until you complete the required Data Use Checkup. Open https://developers.facebook.com/apps/ -> Select your App -> Click the 'Complete Data Use Checkup' banner."
          : null,
        metaApiReachable,
        metaDetails,
        metaApi: {
          reachable: metaApiReachable,
          verifiedName,
          displayPhone,
          qualityRating,
          details: metaDetails,
          isDataUseCheckup,
          isTokenExpired,
          isEndpointConfigError,
        },
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Toggle Bot Active Status (Protected by requireAuth)
  router.post("/chatbot/toggle-active", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const ownerId = req.ownerId || (req.body.ownerId as string) || "system";
      const { active } = req.body;
      let effectiveOwnerId = ownerId;
      if (deps.resolveOwnerIdForWebhook && ownerId === "system") {
        try {
          const resolved = await deps.resolveOwnerIdForWebhook("system");
          if (resolved?.ownerId) effectiveOwnerId = resolved.ownerId;
        } catch (e) {}
      }

      const current = await deps.getChatbotSettings(effectiveOwnerId) || {};
      const newActive = active !== undefined ? Boolean(active) : !Boolean(current?.isActive);
      
      const admin = (globalThis as any).admin;
      if (admin && admin.apps && admin.apps.length) {
        const db = admin.firestore();
        await db.collection("chatbotSettings").doc(effectiveOwnerId).set({
          ...current,
          ownerId: effectiveOwnerId,
          isActive: newActive,
          updatedAt: new Date().toISOString()
        }, { merge: true });
      }

      return res.json({ ok: true, botActive: newActive, ownerId: effectiveOwnerId });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Fetch Live WhatsApp Message Logs (Protected by requireAuth)
  router.get("/chatbot/live-logs", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const ownerId = req.ownerId || (req.query.ownerId as string) || "system";
      const admin = (globalThis as any).admin;
      if (!admin || !admin.apps || !admin.apps.length) {
        return res.json({ ok: true, logs: [] });
      }

      const db = admin.firestore();
      const logsSnap = await db.collection("whatsapp_logs")
        .where("ownerId", "==", ownerId)
        .orderBy("createdAt", "desc")
        .limit(20)
        .get();

      const logs = logsSnap.docs.map((doc: any) => ({
        id: doc.id,
        ...doc.data()
      }));

      return res.json({ ok: true, logs });
    } catch (e: any) {
      console.warn("[WhatsAppRouter] /chatbot/live-logs error:", e);
      return res.json({ ok: false, error: e.message, logs: [] });
    }
  });

  // Send Quick Live Test Message (Protected by requireAuth)
  router.post("/chatbot/send-live-test", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const ownerId = req.ownerId || (req.body.ownerId as string) || "system";
      const { mobile, message } = req.body;

      if (!mobile || !message) {
        return res.status(400).json({ ok: false, error: "Missing mobile or message" });
      }

      let settings = await deps.getSettings(ownerId);
      if (deps.resolveOwnerIdForWebhook && (!settings?.metaWhatsAppApiKey || ownerId === "system")) {
        const resolved = await deps.resolveOwnerIdForWebhook(ownerId);
        if (resolved?.settings) settings = resolved.settings;
      }

      if (!settings?.metaWhatsAppApiKey && !settings?.watiAccessToken) {
        return res.status(400).json({ ok: false, error: "WhatsApp not configured for this tenant" });
      }

      const result = await deps.sendMessageUtil({
        to: mobile,
        message,
        settings,
        isTestMessage: true
      });

      return res.json({ ok: true, success: true, result });
    } catch (e: any) {
      console.error("[WhatsAppRouter] /chatbot/send-live-test error:", e);
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Fetch Raw Meta Webhook Receipts (Protected by requireAuth)
  router.get("/whatsapp-webhook/raw-logs", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const ownerId = req.ownerId || (req.query.ownerId as string) || "system";
      const admin = (globalThis as any).admin;
      let dbLogs: RawWebhookLogItem[] = [];

      if (admin && admin.apps && admin.apps.length) {
        try {
          const db = admin.firestore();
          const snap = await db.collection("meta_raw_webhooks")
            .where("ownerId", "==", ownerId)
            .orderBy("createdAt", "desc")
            .limit(50)
            .get();
          dbLogs = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));
        } catch (e) {
          console.warn("[WhatsAppRouter] Firestore fetch for raw webhooks failed:", e);
        }
      }

      const map = new Map<string, RawWebhookLogItem>();
      rawWebhookLogsBuffer.forEach(l => map.set(l.id, l));
      dbLogs.forEach(l => {
        if (!map.has(l.id)) map.set(l.id, l);
      });

      const logs = Array.from(map.values())
        .sort((a, b) => new Date(b.receivedAt).getTime() - new Date(a.receivedAt).getTime())
        .slice(0, 50);

      return res.json({ ok: true, logs });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e.message, logs: [] });
    }
  });

  // Clear Raw Webhook Logs (Protected by requireAuth)
  router.post("/whatsapp-webhook/clear-raw-logs", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      rawWebhookLogsBuffer.length = 0;
      return res.json({ ok: true });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Simulate Meta Ping Webhook (Protected by requireAuth)
  router.post("/whatsapp-webhook/simulate-ping", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const ownerId = req.ownerId || (req.body.ownerId as string) || "system";
      const messageText = req.body.messageText || "BILL";
      const fromMobile = req.body.fromMobile || "919876543210";
      const senderName = req.body.senderName || "Test Resident";

      const simPayload = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "10023482394823",
            changes: [
              {
                value: {
                  messaging_product: "whatsapp",
                  metadata: {
                    display_phone_number: "15551234567",
                    phone_number_id: "10002893829384"
                  },
                  contacts: [
                    {
                      profile: { name: senderName },
                      wa_id: fromMobile
                    }
                  ],
                  messages: [
                    {
                      from: fromMobile,
                      id: `wamid.simulated_${Date.now()}`,
                      timestamp: String(Math.floor(Date.now() / 1000)),
                      type: "text",
                      text: { body: messageText }
                    }
                  ]
                },
                field: "messages"
              }
            ]
          }
        ]
      };

      const logId = `RAWH_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const logReceipt: RawWebhookLogItem = {
        id: logId,
        ownerId,
        receivedAt: new Date().toISOString(),
        clientIp: "127.0.0.1 (Simulator)",
        userAgent: "MetaWebhookSimulator/1.0",
        signaturePresent: true,
        signatureVerified: true,
        rawBody: simPayload,
        summary: `Simulated inbound message from ${fromMobile} (${senderName}): "${messageText}"`,
        eventType: "message",
        messagesCount: 1,
        statusesCount: 0,
        errorsCount: 0,
        simulated: true
      };

      recordRawWebhookReceipt(logReceipt);

      return res.json({ ok: true, logId, receipt: logReceipt });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Send Individual Message API (Protected by requireAuth)
  router.post("/wa/send", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const ownerId = req.ownerId || req.body.ownerId;
      const {
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

      // Clean up whitespace or empty/null/undefined string values to ensure fallback
      if (settings.metaWhatsAppApiKey && typeof settings.metaWhatsAppApiKey === 'string') {
        settings.metaWhatsAppApiKey = settings.metaWhatsAppApiKey.trim();
        if (settings.metaWhatsAppApiKey === "" || settings.metaWhatsAppApiKey === "null" || settings.metaWhatsAppApiKey === "undefined") {
          settings.metaWhatsAppApiKey = null;
        }
      }
      if (settings.metaWhatsAppPhoneNumberId && typeof settings.metaWhatsAppPhoneNumberId === 'string') {
        settings.metaWhatsAppPhoneNumberId = settings.metaWhatsAppPhoneNumberId.trim();
        if (settings.metaWhatsAppPhoneNumberId === "" || settings.metaWhatsAppPhoneNumberId === "null" || settings.metaWhatsAppPhoneNumberId === "undefined") {
          settings.metaWhatsAppPhoneNumberId = null;
        }
      }
      if (settings.watiAccessToken && typeof settings.watiAccessToken === 'string') {
        settings.watiAccessToken = settings.watiAccessToken.trim();
        if (settings.watiAccessToken === "" || settings.watiAccessToken === "null" || settings.watiAccessToken === "undefined") {
          settings.watiAccessToken = null;
        }
      }

      if (deps.resolveOwnerIdForWebhook) {
        try {
          const { ownerId: resolvedOwnerId, settings: resolvedSettings } =
            await deps.resolveOwnerIdForWebhook(ownerId || "system", phoneId);
          if (resolvedSettings) {
            settings = {
              ...resolvedSettings,
              ...(apiKey ? { metaWhatsAppApiKey: apiKey } : {}),
              ...(phoneId ? { metaWhatsAppPhoneNumberId: phoneId } : {}),
              ...(watiAccessToken ? { watiAccessToken: watiAccessToken } : {}),
              ...(watiApiEndpoint ? { watiApiEndpoint: watiApiEndpoint } : {}),
              ...(method ? { preferredNotificationMethod: method } : {}),
            };
          }
        } catch (e) {
          console.warn("Failed to fetch settings from resolveOwnerIdForWebhook in /api/wa/send:", e);
        }
      }

      if (!settings?.metaWhatsAppApiKey && !settings?.watiAccessToken) {
        return res
          .status(400)
          .json({ error: "WhatsApp API not configured in settings" });
      }

      const data = await deps.sendMessageUtil({
        settings,
        to,
        message,
        mediaBase64,
        mediaName,
        templateCategory,
        templateParams,
        customTemplateName,
        ownerId,
      });

      return res.json(data);
    } catch (err: any) {
      console.error("[WhatsAppRouter] /wa/send error:", err);
      return res.status(500).json({ error: err.message || "Failed to send message" });
    }
  });

  return router;
}

export interface RawWebhookLogItem {
  id: string;
  ownerId: string;
  receivedAt: string;
  clientIp: string;
  userAgent?: string;
  signaturePresent: boolean;
  signatureVerified: boolean;
  rawBody: any;
  summary: string;
  eventType: 'message' | 'status' | 'error' | 'verification' | 'other';
  messagesCount: number;
  statusesCount: number;
  errorsCount: number;
  simulated?: boolean;
}

const rawWebhookLogsBuffer: RawWebhookLogItem[] = [];

export function recordRawWebhookReceipt(log: RawWebhookLogItem) {
  rawWebhookLogsBuffer.unshift(log);
  if (rawWebhookLogsBuffer.length > 100) {
    rawWebhookLogsBuffer.pop();
  }

  const admin = (globalThis as any).admin;
  if (admin && admin.apps && admin.apps.length) {
    try {
      const db = admin.firestore();
      db.collection("meta_raw_webhooks").doc(log.id).set({
        ...log,
        createdAt: new Date()
      });
    } catch (e) {
      console.warn("Failed to store raw webhook to Firestore:", e);
    }
  }
}

