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
          const custId = String(customer.id || customer.customerId || `c_${Math.random().toString(36).substring(2, 8)}`);
          const custDocId = customer.id ? customer.id : `${ownerId}_${custId}`;
          const docRef = db.collection('customers').doc(custDocId);
          
          const customerPayload = {
            ...customer,
            id: custId,
            ownerId,
            createdAt: customer.createdAt || new Date().toISOString()
          };
          batch.set(docRef, customerPayload, { merge: true });

          // Keep public_portals in sync for instant portal access
          try {
            const pRef = db.collection("public_portals").doc(custId);
            batch.set(pRef, {
              portalId: custId,
              customerId: custId,
              customerName: customer.name || "Customer",
              mobileNumber: customer.mobileNumber || "",
              balance: Number(customer.balance) || 0,
              advanceBalance: Number(customer.advanceBalance) || 0,
              ownerId: ownerId,
            }, { merge: true });
          } catch (e) {
            console.warn("[ImportRouter] Portal sync error:", e);
          }
        }
      }

      if (Array.isArray(transactions)) {
        for (const transaction of transactions) {
          const docRef = db.collection('transactions').doc(); // Auto ID for transactions
          batch.set(docRef, { ...transaction, ownerId, createdAt: transaction.createdAt || new Date().toISOString() }, { merge: true });
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
