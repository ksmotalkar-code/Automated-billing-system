import express from "express";

export function createPortalsRouter(getDb: () => any) {
  const router = express.Router();

  // Redirect shortlink /p/:portalId
  router.get("/p/:portalId", (req, res) => {
    res.redirect(`/?portal=${req.params.portalId}`);
  });

  // Fetch Public Portal Data for Citizen Self-Service
  router.get("/api/portal-data/:portalId", async (req, res) => {
    try {
      const db = getDb();
      if (!db) {
        return res.status(500).json({ error: "Database service unavailable" });
      }
      const portalId = req.params.portalId;

      // 1. Try public_portals collection
      const portalDoc = await db.collection("public_portals").doc(portalId).get();
      if (portalDoc.exists) {
        return res.json(portalDoc.data());
      }

      // 2. Direct customer lookup fallback (by doc ID or sequential ID)
      let customer: any = null;
      const custDoc = await db.collection("customers").doc(portalId).get();
      if (custDoc.exists) {
        customer = custDoc.data();
      } else {
        const querySnap = await db.collection("customers").where("id", "==", portalId).limit(1).get();
        if (!querySnap.empty) {
          customer = querySnap.docs[0].data();
        }
      }

      if (!customer) {
        return res.status(404).json({ error: "Citizen portal record not found" });
      }
      const settingsDoc = await db.collection("settings").doc(customer.ownerId).get();
      const settings: any = settingsDoc.exists ? settingsDoc.data() : {};

      return res.json({
        portalId: customer.id,
        ownerId: customer.ownerId,
        customerId: customer.id,
        customerName: customer.name || "Customer",
        mobileNumber: customer.mobileNumber || "",
        balance: customer.balance || 0,
        advanceBalance: customer.advanceBalance || 0,
        billingAmount: settings.billingAmount || 0,
        penaltyAmount: settings.penaltyAmount || 0,
        penaltyDays: settings.penaltyDays || 0,
        upiQrCodeImage: settings.upiQrCodeImage || null,
        createdAt: Date.now(),
      });
    } catch (e: any) {
      console.error("[PortalsRouter] /api/portal-data error:", e);
      return res.status(500).json({ error: e.message || "Failed to load citizen portal" });
    }
  });

  // Simple IP rate limiter for public citizen submissions
  const submissionRateLimits = new Map<string, { count: number; resetAt: number }>();
  function checkSubmissionRateLimit(ip: string, limit = 15, windowMs = 600000): boolean {
    const now = Date.now();
    const existing = submissionRateLimits.get(ip);
    if (!existing || now > existing.resetAt) {
      submissionRateLimits.set(ip, { count: 1, resetAt: now + windowMs });
      return true;
    }
    if (existing.count >= limit) {
      return false;
    }
    existing.count += 1;
    return true;
  }

  // Secure Citizen Public Complaint Submission Endpoint
  router.post("/api/portal/complaint", async (req, res) => {
    try {
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      if (!checkSubmissionRateLimit(clientIp)) {
        return res.status(429).json({ error: "Too many submissions. Please wait a few minutes before trying again." });
      }

      const { customerId, customerName, message, description, ownerId, billStatus } = req.body;
      if (!customerId || !customerName || !message || !ownerId) {
        return res.status(400).json({ error: "Missing required complaint fields (customerId, customerName, message, ownerId)" });
      }

      const cleanMessage = String(message).trim();
      if (cleanMessage.length < 3 || cleanMessage.length > 2000) {
        return res.status(400).json({ error: "Complaint message must be between 3 and 2000 characters" });
      }

      const db = getDb();
      if (!db) {
        return res.status(500).json({ error: "Database service unavailable" });
      }

      const complaintId = `COMP-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const record = {
        id: complaintId,
        customerId: String(customerId).trim(),
        customerName: String(customerName).trim().substring(0, 100),
        message: cleanMessage,
        description: description ? String(description).trim().substring(0, 2000) : "",
        billStatus: billStatus ? String(billStatus).trim().substring(0, 100) : "Pending",
        status: "Pending",
        createdAt: new Date().toISOString(),
        ownerId: String(ownerId).trim(),
      };

      await db.collection("complaints").doc(complaintId).set(record);
      return res.json({ success: true, complaintId, message: "Complaint submitted successfully" });
    } catch (err: any) {
      console.error("[PortalsRouter] /api/portal/complaint error:", err);
      return res.status(500).json({ error: err.message || "Failed to record complaint" });
    }
  });

  // Secure Citizen Payment Receipt Submission Endpoint
  router.post("/api/portal/receipt", async (req, res) => {
    try {
      const clientIp = req.ip || req.socket.remoteAddress || "unknown";
      if (!checkSubmissionRateLimit(clientIp)) {
        return res.status(429).json({ error: "Too many receipt submissions. Please try again later." });
      }

      const { customerId, customerName, portalId, ownerId, amount, base64Image } = req.body;
      if (!customerId || !customerName || !ownerId || amount === undefined) {
        return res.status(400).json({ error: "Missing required receipt fields (customerId, customerName, ownerId, amount)" });
      }

      const numAmount = Number(amount);
      if (isNaN(numAmount) || numAmount < 0 || numAmount > 1000000) {
        return res.status(400).json({ error: "Invalid payment amount" });
      }

      const db = getDb();
      if (!db) {
        return res.status(500).json({ error: "Database service unavailable" });
      }

      const receiptId = `RCPT-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).substring(2, 6).toUpperCase()}`;
      const record = {
        id: receiptId,
        portalId: portalId ? String(portalId).trim() : String(customerId).trim(),
        customerId: String(customerId).trim(),
        ownerId: String(ownerId).trim(),
        customerName: String(customerName).trim().substring(0, 100),
        base64Image: base64Image ? String(base64Image) : "",
        submittedAt: new Date().toISOString(),
        status: "Pending",
        amount: numAmount,
      };

      await db.collection("payment_receipts").doc(receiptId).set(record);
      return res.json({ success: true, receiptId, message: "Payment proof submitted successfully" });
    } catch (err: any) {
      console.error("[PortalsRouter] /api/portal/receipt error:", err);
      return res.status(500).json({ error: err.message || "Failed to record payment receipt" });
    }
  });

  return router;
}
