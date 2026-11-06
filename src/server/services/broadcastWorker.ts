import { backgroundQueue, QueueJob } from "./queue.ts";

export interface BroadcastRecipient {
  id?: string;
  docId?: string;
  name: string;
  mobileNumber: string;
  balance?: number;
  advanceBalance?: number;
  status?: string;
}

export interface BroadcastJobPayload {
  ownerId: string;
  message: string;
  templateName?: string;
  templateCategory?: string;
  templateParams?: any[];
  mediaBase64?: string;
  mediaName?: string;
  method?: string;
  recipients: BroadcastRecipient[];
  settings: any;
}

export interface RecipientDeliveryRecord {
  customerId: string;
  name: string;
  mobileNumber: string;
  status: "sent" | "failed" | "skipped";
  error?: string;
  timestamp: string;
  durationMs: number;
}

export interface BroadcastJobResult {
  jobId: string;
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  userProgress: RecipientDeliveryRecord[];
  startedAt: string;
  completedAt?: string;
}

/**
 * Registers the background worker for WhatsApp Broadcast batch processing
 */
export function registerBroadcastWorker(deps: {
  sendWhatsAppMessage: (
    settings: any,
    to: string,
    message: string,
    mediaBase64?: string,
    mediaName?: string,
    isTestMessage?: boolean,
    templateCategory?: any,
    templateParams?: any[],
    customTemplateName?: string,
    contextData?: any,
  ) => Promise<any>;
  getDb?: () => any;
}) {
  backgroundQueue.registerWorker<BroadcastJobPayload>(
    "WHATSAPP_BROADCAST",
    async (job: QueueJob<BroadcastJobPayload>, onProgress) => {
      const { data } = job;
      const {
        ownerId,
        message,
        templateName,
        templateCategory = "broadcast",
        mediaBase64,
        mediaName,
        recipients = [],
        settings = {},
      } = data;

      const total = recipients.length;
      const startedAt = new Date().toISOString();
      const userProgress: RecipientDeliveryRecord[] = [];
      let sent = 0;
      let failed = 0;
      let skipped = 0;

      console.log(`\n========================================================================`);
      console.log(`[BroadcastQueue] Starting Job ${job.id} for Owner: "${ownerId}"`);
      console.log(`[BroadcastQueue] Total Recipients: ${total}`);
      console.log(`[BroadcastQueue] Template Name: ${templateName || "default (broadcast)"}`);
      console.log(`[BroadcastQueue] Delivery Method: ${settings.preferredNotificationMethod || "api"}`);
      console.log(`========================================================================\n`);

      const db = deps.getDb ? deps.getDb() : null;

      // Query template definition from Firestore whatsapp_templates if present
      let matchedFirestoreTemplate: any = null;
      if (db) {
        try {
          const wtSnap = await db
            .collection("whatsapp_templates")
            .where("ownerId", "==", ownerId)
            .get();
          if (!wtSnap.empty) {
            const allTmpls = wtSnap.docs.map((d: any) => d.data());
            if (templateName && templateName !== "default") {
              matchedFirestoreTemplate = allTmpls.find(
                (t: any) => t.templateName === templateName || t.id === templateName,
              );
            }
            if (!matchedFirestoreTemplate) {
              matchedFirestoreTemplate =
                allTmpls.find((t: any) => t.category === "broadcast" && t.isDefault && t.isActive) ||
                allTmpls.find((t: any) => t.category === "broadcast" && t.isActive) ||
                allTmpls.find((t: any) => t.category === "broadcast");
            }
          }
        } catch (tmplErr) {
          console.warn(`[BroadcastQueue] Failed to query whatsapp_templates:`, tmplErr);
        }
      }

      // Process every single recipient in the queue without premature exits
      for (let i = 0; i < total; i++) {
        const customer = recipients[i];
        const custId = customer.id || customer.docId || `idx_${i}`;
        const custName = customer.name || "Customer";
        const rawDigits = (customer.mobileNumber || "").replace(/\D/g, "");
        const itemStartTime = Date.now();

        console.log(`[BroadcastQueue] [Job ${job.id}] [${i + 1}/${total}] Recipient: "${custName}" (ID: #${custId}, Mobile: "${customer.mobileNumber || "MISSING"}")`);

        // 1. Phone number validation check
        if (!rawDigits || rawDigits.length < 10 || rawDigits === "0000000000") {
          const durationMs = Date.now() - itemStartTime;
          skipped++;
          const record: RecipientDeliveryRecord = {
            customerId: custId,
            name: custName,
            mobileNumber: customer.mobileNumber || "MISSING",
            status: "skipped",
            error: "Missing or invalid phone number (< 10 digits required)",
            timestamp: new Date().toISOString(),
            durationMs,
          };
          userProgress.push(record);
          console.warn(`[BroadcastQueue] [Job ${job.id}] [${i + 1}/${total}] SKIPPED: "${custName}" -> Invalid phone number.`);

          // Update progress
          const pct = Math.floor(((i + 1) / total) * 100);
          await onProgress(pct, {
            jobId: job.id,
            total,
            sent,
            failed,
            skipped,
            userProgress,
            startedAt,
          });
          continue;
        }

        // 2. Resolve template parameters
        let finalTemplateParams: any[] = [];
        let paramKeys: string[] = [];

        if (templateName === 'freeflow_3' || matchedFirestoreTemplate?.templateName === 'freeflow_3') {
          paramKeys = ["customer_name", "message"];
        } else if (matchedFirestoreTemplate) {
          if (Array.isArray(matchedFirestoreTemplate.parameterMappings) && matchedFirestoreTemplate.parameterMappings.length > 0) {
            paramKeys = matchedFirestoreTemplate.parameterMappings.map((m: any) => m.key);
          } else if (matchedFirestoreTemplate.parameters !== undefined) {
            paramKeys = matchedFirestoreTemplate.parameters
              ? matchedFirestoreTemplate.parameters.split(",").map((s: string) => s.trim()).filter(Boolean)
              : [];
          } else if (matchedFirestoreTemplate.bodyText) {
            const matches = matchedFirestoreTemplate.bodyText.match(/\{\{(\d+)\}\}/g) || [];
            paramKeys = matches.map((_: any, idx: number) => (idx === 0 ? "customer_name" : idx === 1 ? "message" : `param_${idx + 1}`));
          }
        } else if (settings?.metaCustomTemplates) {
          const effectiveTName = templateName || settings.metaTemplateBroadcast || "freeflow_3";
          const matchedConfig = settings.metaCustomTemplates.find((t: any) => t.templateName === effectiveTName);
          if (matchedConfig && typeof matchedConfig.parameters === "string") {
            paramKeys = matchedConfig.parameters.split(",").map((s: string) => s.trim()).filter(Boolean);
          }
        }

        // Fallback default: broadcast always expects 2 parameters (customer_name, message)
        if (paramKeys.length === 0) {
          paramKeys = ["customer_name", "message"];
        }

        if (paramKeys.length > 0) {
          finalTemplateParams = paramKeys.map((key: string) => {
            const lk = key.toLowerCase();
            if (lk === "customer_name" || lk === "name" || lk === "customer") return custName;
            if (lk === "customer_id" || lk === "id" || lk === "account_no") return custId;
            if (lk === "customer_balance" || lk === "balance") return String(customer.balance ?? 0);
            if (lk === "billing_amount" || lk === "amount") return String(settings.billingAmount || 200);
            if (lk === "new_balance") return String(customer.balance ?? 0);
            if (lk === "date" || lk === "today") return new Date().toLocaleDateString("en-GB");
            if (lk === "portal_link") return `${settings.publicPortalBaseUrl || "https://ais-dev-bgo3e3yfqihdrbor7bolgx-496681651924.asia-southeast1.run.app"}/?portal=true&customerId=${custId}`;
            if (lk === "button_param" || lk === "button") return { isButtonParam: true, value: `?portal=true&customerId=${custId}`, index: "0" };
            if (["message", "broadcast_message", "custom_message", "text", "body", "announcement", "notice"].includes(lk)) return message;
            return message;
          });
        }

        // 3. Attempt message dispatch with isolated error boundary
        try {
          const effectiveTemplateName = templateName && templateName !== "default"
            ? templateName
            : matchedFirestoreTemplate?.templateName || settings.metaTemplateBroadcast || "broadcast";

          await deps.sendWhatsAppMessage(
            settings,
            customer.mobileNumber,
            message,
            mediaBase64,
            mediaName,
            false,
            templateCategory,
            finalTemplateParams,
            effectiveTemplateName,
            { customerName: custName, name: custName, customerId: custId }
          );

          sent++;
          const durationMs = Date.now() - itemStartTime;
          const record: RecipientDeliveryRecord = {
            customerId: custId,
            name: custName,
            mobileNumber: customer.mobileNumber,
            status: "sent",
            timestamp: new Date().toISOString(),
            durationMs,
          };
          userProgress.push(record);
          console.log(`[BroadcastQueue] [Job ${job.id}] [${i + 1}/${total}] SUCCESS: Delivered to "${custName}" in ${durationMs}ms`);
        } catch (sendErr: any) {
          failed++;
          const durationMs = Date.now() - itemStartTime;
          const errMsg = sendErr?.message || String(sendErr);
          const record: RecipientDeliveryRecord = {
            customerId: custId,
            name: custName,
            mobileNumber: customer.mobileNumber,
            status: "failed",
            error: errMsg,
            timestamp: new Date().toISOString(),
            durationMs,
          };
          userProgress.push(record);
          console.error(`[BroadcastQueue] [Job ${job.id}] [${i + 1}/${total}] FAILED: "${custName}" -> ${errMsg} (Continuing next recipient...)`);
        }

        // 4. Update progress and emit intermediate state
        const pct = Math.floor(((i + 1) / total) * 100);
        await onProgress(pct, {
          jobId: job.id,
          total,
          sent,
          failed,
          skipped,
          userProgress,
          startedAt,
        });

        // 5. Rate-limiting throttle to protect Meta burst quotas
        if (i < total - 1) {
          await new Promise((r) => setTimeout(r, 1000));
        }
      }

      const completedAt = new Date().toISOString();
      const finalResult: BroadcastJobResult = {
        jobId: job.id,
        total,
        sent,
        failed,
        skipped,
        userProgress,
        startedAt,
        completedAt,
      };

      console.log(`\n========================================================================`);
      console.log(`[BroadcastQueue] Job ${job.id} COMPLETED.`);
      console.log(`[BroadcastQueue] Outcome: Sent=${sent}, Failed=${failed}, Skipped=${skipped} (Total: ${total})`);
      console.log(`========================================================================\n`);

      // 6. Record audit log in Firestore if available
      if (db) {
        try {
          const auditId = `audit_broadcast_${job.id}`;
          await db.collection("billing_audit").doc(auditId).set({
            id: auditId,
            ownerId,
            type: "broadcast_notification",
            description: `Bulk WhatsApp Broadcast: Processed ${total} recipients (${sent} sent, ${failed} failed, ${skipped} skipped)`,
            affectedCustomersCount: sent,
            timestamp: completedAt,
            executedBy: job.lockedBy || "queue_worker",
            metadata: {
              jobId: job.id,
              total,
              sent,
              failed,
              skipped,
              userProgress: userProgress.slice(0, 200), // Cap for Firestore 1MB document limit
            },
          });
        } catch (auditErr) {
          console.warn(`[BroadcastQueue] Failed to record billing_audit entry:`, auditErr);
        }
      }

      return finalResult;
    },
  );

  console.log(`[BroadcastQueue] Registered WHATSAPP_BROADCAST worker on BackgroundJobQueue.`);
}
