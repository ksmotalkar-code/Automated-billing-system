import express from "express";

export interface WhatsAppRouteDeps {
  getSettings: (ownerId: string) => Promise<any>;
  getChatbotSettings: (ownerId: string) => Promise<any>;
  getCustomerByMobile: (ownerId: string, mobile: string) => Promise<any>;
  sendMessageUtil: (params: any) => Promise<any>;
  resolveOwnerIdForWebhook?: (requestedOwnerId: string, phoneNumberId?: string) => Promise<{ ownerId: string; settings: any }>;
}

export function createWhatsAppRouter(deps: WhatsAppRouteDeps) {
  const router = express.Router();

  // Test WhatsApp message dispatch
  router.post("/wa/test", async (req, res) => {
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

  // Diagnostic Endpoint
  router.get("/chatbot/diagnostics", async (req, res) => {
    try {
      const ownerId = (req.query.ownerId as string) || "system";
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
      let verifiedName = "";
      let displayPhone = "";
      let qualityRating = "UNKNOWN";

      if (hasMetaApiKey && hasPhoneId) {
        try {
          const checkRes = await fetch(`https://graph.facebook.com/v21.0/${clean.phoneId}?fields=verified_name,display_phone_number,quality_rating,code_verification_status,status`, {
            headers: {
              Authorization: `Bearer ${clean.apiKey}`,
            },
          });
          const checkData = await checkRes.json();
          if (checkRes.ok) {
            metaApiReachable = true;
            verifiedName = checkData.verified_name || "";
            displayPhone = checkData.display_phone_number || "";
            qualityRating = checkData.quality_rating || "GREEN";
            metaDetails = `Connected (${verifiedName || displayPhone || "Active"})`;
          } else {
            metaDetails = checkData.error?.message || "Invalid credentials";
            if (metaDetails.toLowerCase().includes("data use checkup")) {
              isDataUseCheckup = true;
            }
          }
        } catch (apiErr: any) {
          metaDetails = apiErr.message || "Connection failed";
        }
      }

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
        },
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  // Toggle Bot Active Status
  router.post("/chatbot/toggle-active", async (req, res) => {
    try {
      const ownerId = (req.body.ownerId as string) || "system";
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

  return router;
}
