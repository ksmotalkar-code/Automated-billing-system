import express from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.ts";
import { FieldValue } from "firebase-admin/firestore";

export function createImportRouter(getDb: () => any) {
  const router = express.Router();

  router.post("/import", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const db = getDb();
      if (!db) return res.status(500).json({ error: "Database unavailable" });

      const { customers, transactions } = req.body;
      const ownerId = req.ownerId || req.body.ownerId;
      if (!ownerId) return res.status(400).json({ error: "Owner ID required" });

      const batch = db.batch();
      
      if (Array.isArray(customers)) {
        for (const customer of customers) {
          const docRef = db.collection('customers').doc(`${ownerId}_${customer.id}`);
          batch.set(docRef, { ...customer, ownerId, createdAt: customer.createdAt || new Date().toISOString() });
        }
      }

      if (Array.isArray(transactions)) {
        for (const transaction of transactions) {
          const docRef = db.collection('transactions').doc(); // Auto ID for transactions
          batch.set(docRef, { ...transaction, ownerId, createdAt: transaction.createdAt || new Date().toISOString() });
        }
      }

      await batch.commit();
      res.json({ success: true, importedCustomers: customers?.length || 0, importedTransactions: transactions?.length || 0 });
    } catch (err: any) {
      console.error("[ImportRouter] Error:", err);
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
