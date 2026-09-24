import express from "express";

export function createBillingRouter(runDailyAutomation: (ownerId?: string) => Promise<any>) {
  const router = express.Router();

  // Daily Automation Engine Cron trigger
  router.post("/cron/daily", async (req, res) => {
    try {
      const { ownerId } = req.body;
      console.log(`[BillingEngine] Starting automation cycle for owner: ${ownerId || "ALL"}`);
      await runDailyAutomation(ownerId);
      return res.json({ status: "success", timestamp: new Date().toISOString() });
    } catch (error: any) {
      console.error("[BillingEngine] Cron execution error:", error);
      return res.status(500).json({ error: error.message || "Automation failed" });
    }
  });

  // Dynamic Payment Webhook endpoint
  router.post("/payment-webhook/:ownerId", async (req, res) => {
    try {
      const { ownerId } = req.params;
      const paymentData = req.body;
      console.log(`[PaymentWebhook] Received payment webhook for tenant ${ownerId}:`, paymentData);
      return res.json({ success: true, received: true });
    } catch (err: any) {
      console.error("[PaymentWebhook] Error processing webhook:", err);
      return res.status(500).json({ error: err.message });
    }
  });

  return router;
}
