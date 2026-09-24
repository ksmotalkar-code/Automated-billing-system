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

  return router;
}
