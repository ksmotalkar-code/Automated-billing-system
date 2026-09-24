import express from "express";

export interface WhatsAppRouteDeps {
  getSettings: (ownerId: string) => Promise<any>;
  getChatbotSettings: (ownerId: string) => Promise<any>;
  getCustomerByMobile: (ownerId: string, mobile: string) => Promise<any>;
  sendMessageUtil: (params: any) => Promise<any>;
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

      const result = await deps.sendMessageUtil({
        to: mobileNumber,
        message,
        settings,
      });

      return res.json({ success: true, result });
    } catch (err: any) {
      console.error("[WhatsAppRouter] /wa/test error:", err);
      return res.status(500).json({ error: err.message || "Failed to send test message" });
    }
  });

  // Diagnostic Endpoint
  router.get("/chatbot/diagnostics", async (req, res) => {
    try {
      const ownerId = (req.query.ownerId as string) || "system";
      const settings = await deps.getSettings(ownerId);
      const chatbotSettings = await deps.getChatbotSettings(ownerId);

      const hasMetaApiKey = Boolean(settings?.metaWhatsAppApiKey);
      const hasPhoneId = Boolean(settings?.metaWhatsAppPhoneNumberId);
      const verifyToken = settings?.metaWhatsAppVerifyToken || "Not Set";
      const botActive = Boolean(chatbotSettings?.isActive);
      const activeRules = Array.isArray(chatbotSettings?.commands)
        ? chatbotSettings.commands.filter((c: any) => c.isActive).length
        : 0;

      let metaApiReachable = false;
      let metaDetails = "Not checked";
      if (hasMetaApiKey && hasPhoneId) {
        try {
          const checkRes = await fetch(`https://graph.facebook.com/v21.0/${settings.metaWhatsAppPhoneNumberId}`, {
            headers: {
              Authorization: `Bearer ${settings.metaWhatsAppApiKey}`,
            },
          });
          const checkData = await checkRes.json();
          if (checkRes.ok) {
            metaApiReachable = true;
            metaDetails = `Connected (${checkData.verified_name || checkData.display_phone_number || "Active"})`;
          } else {
            metaDetails = checkData.error?.message || "Invalid credentials";
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
        metaApiReachable,
        metaDetails,
        timestamp: new Date().toISOString(),
      });
    } catch (e: any) {
      return res.status(500).json({ ok: false, error: e.message });
    }
  });

  return router;
}
