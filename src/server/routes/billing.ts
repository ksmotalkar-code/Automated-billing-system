import express from "express";
import { cronAuth, requireAuth, AuthenticatedRequest, DistributedLock, AutomationSessionManager } from "../middleware/auth.ts";

export function createBillingRouter(
  runDailyAutomation: (ownerId?: string, workerId?: string) => Promise<any>,
  lockGetter?: () => DistributedLock,
  sessionGetter?: () => AutomationSessionManager,
) {
  const router = express.Router();
  const lock = lockGetter ? lockGetter() : new DistributedLock();
  const sessionMgr = sessionGetter ? sessionGetter() : new AutomationSessionManager();

  // Status endpoint reading consistent 'source of truth' document from Firestore 'automation_sessions'
  router.get("/automation/status", requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const ownerId = req.ownerId || (req.query.ownerId as string);
      if (!ownerId) return res.status(400).json({ error: "Missing ownerId" });

      const session = await sessionMgr.getSession(ownerId);
      return res.json({
        ownerId,
        session: session || {
          status: "idle",
          lastRunTimestamp: null,
          updatedAt: new Date().toISOString(),
        },
      });
    } catch (e: any) {
      return res.status(500).json({ error: e.message });
    }
  });

  // Daily Automation Engine Cron trigger (Protected by cronAuth, Distributed Lock with 5-min TTL, and Server Session State)
  router.post("/cron/daily", cronAuth, async (req: AuthenticatedRequest, res) => {
    const ownerId = req.ownerId || req.body?.ownerId;
    const effectiveOwnerId = ownerId || "ALL";
    const lockName = `cron_billing_${effectiveOwnerId}`;
    const ttlMs = 300000; // 5-minute TTL lock window
    const workerId = `container_${process.env.HOSTNAME || process.pid}_${Math.random().toString(36).substring(2, 6)}`;

    // 1. Atomically acquire distributed lock in Firestore 'lock' and 'distributed_locks'
    const lockResult = await lock.acquire(lockName, ttlMs, workerId);
    if (!lockResult.acquired) {
      console.warn(`[BillingEngine] Concurrent execution blocked by Distributed Lock (${lockName}): ${lockResult.reason}`);
      return res.status(409).json({
        status: "locked",
        message: "Another container is currently executing this billing cycle.",
        lock: lockResult,
        timestamp: new Date().toISOString(),
      });
    }

    // 2. Update server-side session persistence state in 'automation_sessions'
    await sessionMgr.updateSession(effectiveOwnerId, {
      status: "running",
      activeWorkerId: workerId,
      lastError: null,
    });

    try {
      console.log(`[BillingEngine] Starting locked automation cycle for owner: ${effectiveOwnerId} [Worker: ${workerId}]`);
      const result = await runDailyAutomation(ownerId, workerId);

      // Record successful run in server session state
      await sessionMgr.updateSession(effectiveOwnerId, {
        status: "completed",
        lastRunTimestamp: new Date().toISOString(),
        lastProcessedCustomerCount: result?.billedCustomersCount || result?.processedCount || 0,
        lastBilledAmountTotal: result?.totalBilledAmount || 0,
        activeWorkerId: null,
      });

      return res.json({
        status: "success",
        result,
        workerId,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      console.error("[BillingEngine] Cron execution error under lock:", error);
      await sessionMgr.updateSession(effectiveOwnerId, {
        status: "failed",
        lastError: error.message || String(error),
        activeWorkerId: null,
      });
      return res.status(500).json({ error: error.message || "Automation failed" });
    } finally {
      // 3. Safely release lock upon completion
      await lock.release(lockName, workerId);
    }
  });

  return router;
}
