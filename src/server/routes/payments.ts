import express from "express";
import { requireAuth, AuthenticatedRequest } from "../middleware/auth.ts";

export interface PaymentsRouteDeps {
  getDb: () => any;
}

export function createPaymentsRouter(deps: PaymentsRouteDeps) {
  const router = express.Router();

  /**
   * POST /api/receipts/approve
   * Approves a payment receipt atomically using Firebase Admin SDK.
   * Completely immune to client-side Firestore security rules restrictions.
   */
  router.post("/receipts/approve", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const db = deps.getDb();
      if (!db) {
        return res.status(503).json({ error: "Database service unavailable on server" });
      }

      const ownerId = req.ownerId || req.body.ownerId || "system";
      const { receiptId, customAmount } = req.body;

      if (!receiptId) {
        return res.status(400).json({ error: "Missing required receiptId" });
      }

      const receiptRef = db.collection("payment_receipts").doc(receiptId);

      const result = await db.runTransaction(async (txn: any) => {
        const receiptSnap = await txn.get(receiptRef);
        if (!receiptSnap.exists) {
          throw new Error(`Receipt ${receiptId} not found`);
        }

        const receipt = receiptSnap.data();

        // Idempotency: If already approved, return early without duplicate crediting
        if (receipt.status === "Approved") {
          return {
            success: true,
            alreadyApproved: true,
            transactionId: receipt.transactionId || `TXN-RCPT-${receiptId.substring(0, 8).toUpperCase()}`,
            effectiveAmount: receipt.approvedAmount || receipt.amount || 0,
            isAdvanceCredit: false,
            newBalance: 0,
            newAdvance: 0,
          };
        }

        if (receipt.status === "Rejected") {
          throw new Error("Cannot approve a rejected receipt.");
        }

        const effectiveAmount = typeof customAmount === "number" && customAmount > 0
          ? customAmount
          : (Number(receipt.amount) || 0);

        let customer: any = null;
        let custRef = db.collection("customers").doc(receipt.customerId);
        let custSnap = await txn.get(custRef);

        if (!custSnap.exists) {
          // Fallback query if document ID differed from customer ID field
          const qSnap = await db.collection("customers").where("id", "==", receipt.customerId).limit(1).get();
          if (!qSnap.empty) {
            custRef = qSnap.docs[0].ref;
            custSnap = qSnap.docs[0];
            customer = custSnap.data();
          } else {
            throw new Error(`Customer ${receipt.customerId} not found for this receipt`);
          }
        } else {
          customer = custSnap.data();
        }

        const currentDue = Number(customer.balance) || 0;
        const currentAdvance = Number(customer.advanceBalance) || 0;

        let newBalance = 0;
        let newAdvance = currentAdvance;
        let status = customer.status || "Active";
        let isAdvanceCredit = false;

        if (effectiveAmount <= currentDue) {
          newBalance = currentDue - effectiveAmount;
          if (newBalance === 0) {
            status = newAdvance > 0 ? "Advance Paid" : (status === "Advance Paid" ? "Active" : status);
          }
        } else {
          newBalance = 0;
          const excess = effectiveAmount - currentDue;
          newAdvance = currentAdvance + excess;
          status = "Advance Paid";
          isAdvanceCredit = true;
        }

        const updatedCustomer = {
          ...customer,
          balance: newBalance,
          advanceBalance: newAdvance,
          status,
          invoiceSent: true,
          paymentNotified: true,
          ownerId: customer.ownerId || ownerId,
          updatedAt: new Date().toISOString(),
        };

        const txnId = `TXN-RCPT-${receiptId.substring(0, 8).toUpperCase()}`;
        const txnRef = db.collection("transactions").doc(txnId);

        const newTxn = {
          id: txnId,
          customerId: customer.id,
          customerName: customer.name,
          amount: effectiveAmount,
          transactionId: txnId,
          date: new Date().toISOString(),
          ownerId,
          paymentMode: "upi",
          isAdvanceCredit,
          advanceAdjustment: isAdvanceCredit ? (newAdvance - currentAdvance) : 0,
          paymentType: isAdvanceCredit ? "bill_and_advance" : "bill_payment",
          previousBalance: currentDue,
          newBalance,
          previousAdvance: currentAdvance,
          newAdvance,
          notes: isAdvanceCredit
            ? `Receipt verified: Bill settled & ₹${newAdvance - currentAdvance} credited as Advance Balance`
            : `Receipt verified payment of ₹${effectiveAmount}`,
          idempotencyKey: receiptId,
        };

        // 1. Commit customer update
        txn.set(custRef, updatedCustomer, { merge: true });

        // 2. Commit transaction record
        txn.set(txnRef, newTxn);

        // 3. Mark receipt as Approved
        txn.update(receiptRef, {
          status: "Approved",
          approvedAt: new Date().toISOString(),
          approvedAmount: effectiveAmount,
          transactionId: txnId,
        });

        // 4. Record idempotency marker
        const idempRef = db.collection("idempotency_keys").doc(`rcpt_appr_${receiptId}`);
        txn.set(idempRef, {
          id: `rcpt_appr_${receiptId}`,
          ownerId,
          resourceType: "receipt_approval",
          resourceId: txnId,
          status: "completed",
          createdAt: new Date().toISOString(),
        });

        return {
          success: true,
          alreadyApproved: false,
          transactionId: txnId,
          customer: updatedCustomer,
          effectiveAmount,
          isAdvanceCredit,
          newBalance,
          newAdvance,
        };
      });

      // Synchronize public portal document in background so citizen portal displays latest numbers
      try {
        const portalRef = db.collection("public_portals").doc(`${ownerId}_${result.customer.id}`);
        await portalRef.set({
          balance: result.newBalance,
          advanceBalance: result.newAdvance,
          updatedAt: new Date().toISOString(),
        }, { merge: true });
      } catch (portalErr) {
        console.warn("[PaymentsRouter] Background portal sync notice:", portalErr);
      }

      return res.json(result);
    } catch (err: any) {
      console.error("[PaymentsRouter] /receipts/approve error:", err);
      return res.status(500).json({ error: err.message || "Failed to approve payment receipt" });
    }
  });

  /**
   * POST /api/receipts/reject
   * Rejects a payment receipt atomically using Firebase Admin SDK.
   */
  router.post("/receipts/reject", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const db = deps.getDb();
      if (!db) {
        return res.status(503).json({ error: "Database service unavailable on server" });
      }

      const { receiptId } = req.body;
      if (!receiptId) {
        return res.status(400).json({ error: "Missing required receiptId" });
      }

      await db.collection("payment_receipts").doc(receiptId).update({
        status: "Rejected",
        rejectedAt: new Date().toISOString(),
      });

      return res.json({ success: true, receiptId, status: "Rejected" });
    } catch (err: any) {
      console.error("[PaymentsRouter] /receipts/reject error:", err);
      return res.status(500).json({ error: err.message || "Failed to reject payment receipt" });
    }
  });

  /**
   * POST /api/payments/record
   * Records a manual / counter payment atomically using Firebase Admin SDK.
   */
  router.post("/payments/record", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const db = deps.getDb();
      if (!db) {
        return res.status(503).json({ error: "Database service unavailable on server" });
      }

      const ownerId = req.ownerId || req.body.ownerId || "system";
      const {
        customerId,
        amount,
        transactionId,
        paymentMode,
        isDirectAdvanceDeposit,
        idempotencyKey,
      } = req.body;

      if (!customerId || typeof amount !== "number" || amount <= 0) {
        return res.status(400).json({ error: "Invalid payment payload" });
      }

      const effectiveKey = idempotencyKey || `${customerId}_${amount}_${transactionId || Date.now()}`;
      const idempRef = db.collection("idempotency_keys").doc(`pay_${effectiveKey}`);

      const result = await db.runTransaction(async (txn: any) => {
        const idempSnap = await txn.get(idempRef);
        if (idempSnap.exists) {
          const idempData = idempSnap.data();
          if (idempData.status === "completed") {
            const custSnap = await txn.get(db.collection("customers").doc(customerId));
            const existingCustomer = custSnap.exists ? custSnap.data() : null;
            return {
              success: true,
              alreadyProcessed: true,
              transactionId: idempData.resourceId,
              customer: existingCustomer,
              effectiveAmount: amount,
              isAdvanceCredit: false,
              newBalance: existingCustomer?.balance ?? 0,
              newAdvance: existingCustomer?.advanceBalance ?? 0,
            };
          }
        }

        let custRef = db.collection("customers").doc(customerId);
        let custSnap = await txn.get(custRef);

        if (!custSnap.exists) {
          const qSnap = await db.collection("customers").where("id", "==", customerId).limit(1).get();
          if (!qSnap.empty) {
            custRef = qSnap.docs[0].ref;
            custSnap = qSnap.docs[0];
          } else {
            throw new Error(`Customer ${customerId} not found`);
          }
        }

        const customer = custSnap.data();
        const currentDue = Number(customer.balance) || 0;
        const currentAdvance = Number(customer.advanceBalance) || 0;

        let newBalance = currentDue;
        let newAdvance = currentAdvance;
        let status = customer.status || "Active";
        let isAdvanceCreditAdded = false;
        let advanceAdjustment = 0;
        let paymentType = "bill_payment";
        let ledgerNote = "";

        if (isDirectAdvanceDeposit) {
          newBalance = currentDue;
          newAdvance = currentAdvance + amount;
          status = "Advance Paid";
          isAdvanceCreditAdded = true;
          advanceAdjustment = amount;
          paymentType = "advance_credit";
          ledgerNote = `Direct Advance Credit pre-payment of ₹${amount} recorded`;
        } else if (amount <= currentDue) {
          newBalance = currentDue - amount;
          ledgerNote = `Water bill payment of ₹${amount} recorded`;
          if (newBalance === 0) {
            status = newAdvance > 0 ? "Advance Paid" : (status === "Advance Paid" ? "Active" : status);
          }
        } else {
          newBalance = 0;
          const excess = amount - currentDue;
          newAdvance = currentAdvance + excess;
          status = "Advance Paid";
          isAdvanceCreditAdded = true;
          advanceAdjustment = excess;
          paymentType = "bill_and_advance";
          ledgerNote = `Bill fully settled (₹${currentDue}) & ₹${excess} added as Advance Credit`;
        }

        const updatedCustomer = {
          ...customer,
          balance: newBalance,
          advanceBalance: newAdvance,
          status,
          invoiceSent: true,
          paymentNotified: true,
          ownerId: customer.ownerId || ownerId,
          updatedAt: new Date().toISOString(),
        };

        const finalTxnId = (transactionId && String(transactionId).trim().startsWith("TXN-"))
          ? String(transactionId).trim()
          : (transactionId ? `TXN-${String(transactionId).trim()}` : `TXN-${Date.now()}`);

        const txnRef = db.collection("transactions").doc(finalTxnId);

        const newTxn = {
          id: finalTxnId,
          customerId: customer.id,
          customerName: customer.name,
          amount,
          transactionId: finalTxnId,
          date: new Date().toISOString(),
          ownerId,
          paymentMode: paymentMode || "cash",
          isAdvanceCredit: isAdvanceCreditAdded || isDirectAdvanceDeposit,
          advanceAdjustment,
          paymentType,
          previousBalance: currentDue,
          newBalance,
          previousAdvance: currentAdvance,
          newAdvance,
          notes: ledgerNote,
          idempotencyKey: effectiveKey,
        };

        // 1. Commit customer update
        txn.set(custRef, updatedCustomer, { merge: true });

        // 2. Commit transaction record
        txn.set(txnRef, newTxn);

        // 3. Commit idempotency marker
        txn.set(idempRef, {
          id: `pay_${effectiveKey}`,
          ownerId,
          resourceType: "counter_payment",
          resourceId: finalTxnId,
          status: "completed",
          createdAt: new Date().toISOString(),
        });

        return {
          success: true,
          alreadyProcessed: false,
          transactionId: finalTxnId,
          customer: updatedCustomer,
          effectiveAmount: amount,
          isAdvanceCredit: isAdvanceCreditAdded,
          newBalance,
          newAdvance,
        };
      });

      return res.json(result);
    } catch (err: any) {
      console.error("[PaymentsRouter] /payments/record error:", err);
      return res.status(500).json({ error: err.message || "Failed to record payment" });
    }
  });

  return router;
}
