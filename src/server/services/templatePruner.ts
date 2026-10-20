import { getAdminFirestore } from "./adminDb.ts";

export interface TemplateDefinition {
  id?: string;
  templateName: string;
  parameters: string;
  language?: string;
  [key: string]: any;
}

export interface PruneTemplateEntry {
  id?: string;
  templateName: string;
  parameters?: string;
  language?: string;
  reason: string;
  details?: string;
}

export interface RetainedTemplateEntry {
  id: string;
  templateName: string;
  parameters: string;
  language: string;
  status: string;
}

export interface CategoryResetEntry {
  categoryField: string;
  label: string;
  previousToken: string;
  newFallbackToken: string;
}

export interface PruneTenantReport {
  ownerId: string;
  totalInspected: number;
  prunedCount: number;
  retainedCount: number;
  prunedTemplates: PruneTemplateEntry[];
  retainedTemplates: RetainedTemplateEntry[];
  categoryResets: CategoryResetEntry[];
  dryRun: boolean;
  timestamp: string;
  status: "CLEAN" | "PRUNED" | "ERROR";
  error?: string;
}

export interface PruneOverallReport {
  timestamp: string;
  dryRun: boolean;
  totalTenants: number;
  totalInspected: number;
  totalPruned: number;
  totalRetained: number;
  tenants: PruneTenantReport[];
}

export const VERIFIED_CATEGORY_SPECIFICATIONS = [
  {
    key: "welcome",
    label: "Welcome / Onboarding",
    settingField: "metaTemplateWelcome",
    defaultFallback: "welcome",
    expectedParams: ["customer_name"],
    bodyCount: 1,
    supportsButton: false,
    requiresDocHeader: false,
    language: "en_US"
  },
  {
    key: "billing",
    label: "Cyclic Invoice / Billing",
    settingField: "metaTemplateBilling",
    defaultFallback: "payment_due_reminder",
    expectedParams: ["customer_name", "billing_amount", "new_balance", "date", "button_param"],
    bodyCount: 4,
    supportsButton: true,
    requiresDocHeader: false,
    language: "en_US"
  },
  {
    key: "receipt",
    label: "Success Payment Receipt",
    settingField: "metaTemplateReceipt",
    defaultFallback: "invoice_bill",
    expectedParams: ["customer_name", "payment_amount", "button_param"],
    bodyCount: 2,
    supportsButton: true,
    requiresDocHeader: true,
    language: "en_US"
  },
  {
    key: "broadcast",
    label: "Bulk Broadcast / Outage",
    settingField: "metaTemplateBroadcast",
    defaultFallback: "operation_disruption_2",
    expectedParams: ["customer_name", "billing_amount", "new_balance", "date", "overdue_amount", "penalty_amount", "button_param"],
    bodyCount: 6,
    supportsButton: true,
    requiresDocHeader: false,
    language: "en_US"
  },
  {
    key: "overdue",
    label: "Overdue Penalty Alert",
    settingField: "metaTemplateOverdue",
    defaultFallback: "payment_overdue_1",
    expectedParams: ["customer_name", "overdue_amount", "date", "penalty_amount", "button_param"],
    bodyCount: 4,
    supportsButton: true,
    requiresDocHeader: false,
    language: "en_US"
  },
  {
    key: "suspension",
    label: "Service Suspension / Autopay",
    settingField: "metaTemplateSuspension",
    defaultFallback: "autopay",
    expectedParams: ["customer_name", "customer_balance", "date"],
    bodyCount: 3,
    supportsButton: false,
    requiresDocHeader: false,
    language: "en_US"
  },
  {
    key: "complaint",
    label: "Complaint Resolution",
    settingField: "metaTemplateComplaint",
    defaultFallback: "complaint_resolved",
    expectedParams: ["customer_name", "complaint_id", "complaint_category", "complaint_status"],
    bodyCount: 4,
    supportsButton: false,
    requiresDocHeader: false,
    language: "en_US"
  },
  {
    key: "custom",
    label: "Custom / General Alert",
    settingField: "metaTemplateCustom",
    defaultFallback: "general_notification",
    expectedParams: ["customer_name", "billing_amount", "new_balance", "date", "overdue_amount", "button_param"],
    bodyCount: 5,
    supportsButton: true,
    requiresDocHeader: false,
    language: "en_US"
  }
];

interface ProbeResult {
  valid: boolean;
  status: string;
  details: string;
}

/**
 * Probe a template candidate against live Meta Cloud API
 */
async function probeMetaTemplate(
  apiKey: string,
  phoneId: string,
  testMobile: string,
  templateName: string,
  parametersStr: string,
  language: string = "en_US",
  requiresDocHeader: boolean = false,
  supportsButton: boolean = false
): Promise<ProbeResult> {
  const paramList = parametersStr
    ? parametersStr.split(",").map(p => p.trim()).filter(Boolean)
    : [];
  
  const hasButton = supportsButton && paramList.includes("button_param");
  const bodyCount = paramList.filter(p => p !== "button_param" && p !== "portal_link").length;

  const probeComponents: any[] = [];
  if (requiresDocHeader) {
    probeComponents.push({
      type: "header",
      parameters: [{
        type: "document",
        document: {
          link: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
          filename: "Invoice.pdf"
        }
      }]
    });
  }

  if (bodyCount > 0) {
    probeComponents.push({
      type: "body",
      parameters: Array.from({ length: bodyCount }, (_, i) => ({ type: "text", text: `Sample_${i + 1}` }))
    });
  }

  if (hasButton) {
    probeComponents.push({
      type: "button",
      sub_type: "url",
      index: "0",
      parameters: [{ type: "text", text: "?portal=true&customerId=1" }]
    });
  }

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: testMobile,
        type: "template",
        template: {
          name: templateName,
          language: { code: language },
          components: probeComponents.length > 0 ? probeComponents : undefined
        }
      })
    });

    const data = await res.json();
    if (res.ok) {
      return { valid: true, status: "ACTIVE_VERIFIED", details: "Template accepted by Meta API." };
    }

    const err = data.error || {};
    const errCode = err.code;
    const msg = err.message || "Unknown error";
    const details = err.error_data?.details || msg;

    if (errCode === 132000) {
      return { valid: false, status: "PARAM_COUNT_MISMATCH", details: `Parameter count mismatch on Meta: ${details}` };
    } else if (errCode === 131008) {
      return { valid: false, status: "BUTTON_PARAM_MISSING", details: `Required dynamic button parameter is missing: ${details}` };
    } else if (errCode === 132018) {
      return { valid: false, status: "BUTTON_NOT_ALLOWED", details: `Button component not allowed for this template: ${details}` };
    } else if (errCode === 132012) {
      return { valid: false, status: "HEADER_FORMAT_MISMATCH", details: `Header format mismatch on Meta: ${details}` };
    } else if (errCode === 132001 || msg.includes("does not exist in language")) {
      return { valid: false, status: "LANGUAGE_NOT_FOUND", details: `Template not registered in language "${language}": ${details}` };
    } else if (errCode === 100 || errCode === 132007 || msg.includes("does not exist")) {
      return { valid: false, status: "TOKEN_NOT_REGISTERED", details: `Template token "${templateName}" does not exist on Meta: ${details}` };
    }

    return { valid: false, status: `META_ERROR_${errCode || "UNKNOWN"}`, details };
  } catch (netErr: any) {
    return { valid: false, status: "PROBE_NETWORK_ERROR", details: netErr.message };
  }
}

export interface PruneOptions {
  ownerId?: string;
  dryRun?: boolean;
  forceProbe?: boolean;
}

/**
 * Core Pruning Engine:
 * Evaluates templateRegistry & metaCustomTemplates against active Meta templates,
 * prunes structurally invalid / drifted / non-existent entries,
 * repairs category fallback pointers, and logs full audit trails.
 */
export async function pruneTemplateRegistry(options: PruneOptions = {}): Promise<PruneOverallReport> {
  const { ownerId, dryRun = false } = options;
  const db = getAdminFirestore();

  console.log(`[TemplatePruner] Starting template registry prune (dryRun: ${dryRun}, targetOwner: ${ownerId || "ALL"})...`);

  // 1. Fetch settings documents
  let settingsDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
  if (ownerId && ownerId !== "ALL" && ownerId !== "system") {
    const singleDoc = await db.collection("settings").doc(ownerId).get();
    if (singleDoc.exists) {
      settingsDocs = [singleDoc as any];
    }
  }

  if (settingsDocs.length === 0) {
    const allSettingsSnap = await db.collection("settings").get();
    settingsDocs = allSettingsSnap.docs;
  }

  // 2. Discover master credentials fallback
  let masterApiKey = "";
  let masterPhoneId = "";
  let masterTestMobile = "918683968672";

  for (const doc of settingsDocs) {
    const d = doc.data();
    if (d.metaWhatsAppApiKey && d.metaWhatsAppPhoneNumberId) {
      masterApiKey = d.metaWhatsAppApiKey;
      masterPhoneId = d.metaWhatsAppPhoneNumberId;
      break;
    }
  }

  const overallReport: PruneOverallReport = {
    timestamp: new Date().toISOString(),
    dryRun,
    totalTenants: settingsDocs.length,
    totalInspected: 0,
    totalPruned: 0,
    totalRetained: 0,
    tenants: []
  };

  // 3. Process each tenant document
  for (const docSnap of settingsDocs) {
    const docId = docSnap.id;
    const settings = docSnap.data();

    const tenantReport: PruneTenantReport = {
      ownerId: docId,
      totalInspected: 0,
      prunedCount: 0,
      retainedCount: 0,
      prunedTemplates: [],
      retainedTemplates: [],
      categoryResets: [],
      dryRun,
      timestamp: new Date().toISOString(),
      status: "CLEAN"
    };

    const effectiveApiKey = settings.metaWhatsAppApiKey || masterApiKey;
    const effectivePhoneId = settings.metaWhatsAppPhoneNumberId || masterPhoneId;

    // Resolve test recipient safely
    let effectiveTestMobile = masterTestMobile;
    try {
      const sampleCust = await db.collection("customers").where("ownerId", "==", docId).limit(1).get();
      if (!sampleCust.empty) {
        const raw = (sampleCust.docs[0].data().mobileNumber || sampleCust.docs[0].data().phone || "").replace(/\D/g, "");
        if (raw && raw.length >= 10) {
          effectiveTestMobile = raw;
        }
      }
    } catch (_) {}

    // Gather templates from metaCustomTemplates and templateRegistry
    const existingList: TemplateDefinition[] = Array.isArray(settings.metaCustomTemplates)
      ? [...settings.metaCustomTemplates]
      : Array.isArray(settings.templateRegistry)
      ? [...settings.templateRegistry]
      : [];

    tenantReport.totalInspected = existingList.length;
    overallReport.totalInspected += existingList.length;

    const retainedList: RetainedTemplateEntry[] = [];
    const prunedList: PruneTemplateEntry[] = [];

    // Map of known verified specs for fast lookup
    const specMap = new Map(VERIFIED_CATEGORY_SPECIFICATIONS.map(s => [s.defaultFallback, s]));

    for (const entry of existingList) {
      const rawName = (entry.templateName || "").trim();
      if (!rawName) {
        prunedList.push({
          id: entry.id,
          templateName: rawName || "UNNAMED_ENTRY",
          parameters: entry.parameters,
          language: entry.language,
          reason: "EMPTY_TEMPLATE_NAME",
          details: "Template registry entry missing required templateName."
        });
        continue;
      }

      const matchingSpec = specMap.get(rawName);

      // Check structural parameters
      if (matchingSpec) {
        // This is one of the pre-approved standard Meta templates
        const paramStr = entry.parameters || "";
        const paramList = paramStr.split(",").map(p => p.trim()).filter(Boolean);
        const hasButtonParam = paramList.includes("button_param");
        const bodyCount = paramList.filter(p => p !== "button_param" && p !== "portal_link").length;

        let isStructurallyValid = true;
        let driftReason = "";

        if (bodyCount !== matchingSpec.bodyCount) {
          isStructurallyValid = false;
          driftReason = `Parameter count mismatch: configured ${bodyCount} body params, Meta template requires ${matchingSpec.bodyCount}.`;
        } else if (matchingSpec.supportsButton && !hasButtonParam) {
          isStructurallyValid = false;
          driftReason = `Missing required dynamic button parameter "button_param" for ${rawName}.`;
        } else if (!matchingSpec.supportsButton && hasButtonParam) {
          isStructurallyValid = false;
          driftReason = `Unexpected "button_param" configured for template ${rawName} which has no button.`;
        }

        if (!isStructurallyValid) {
          prunedList.push({
            id: entry.id,
            templateName: rawName,
            parameters: entry.parameters,
            language: entry.language,
            reason: "STRUCTURAL_PARAM_MISMATCH",
            details: driftReason
          });
          continue;
        }

        // Structural parameters match the official spec!
        retainedList.push({
          id: entry.id || `def_${matchingSpec.key}`,
          templateName: rawName,
          parameters: matchingSpec.expectedParams.join(", "),
          language: entry.language || "en_US",
          status: "ACTIVE_VERIFIED"
        });
      } else {
        // Custom user-defined template name
        if (!effectiveApiKey || !effectivePhoneId) {
          // Cannot verify live on Meta and not in standard registry -> prune unknown drift
          prunedList.push({
            id: entry.id,
            templateName: rawName,
            parameters: entry.parameters,
            language: entry.language,
            reason: "UNVERIFIED_CUSTOM_TEMPLATE",
            details: `Template "${rawName}" is not part of pre-approved Meta registry and cannot be verified without Meta credentials.`
          });
          continue;
        }

        // Probe against live Meta API
        console.log(`[TemplatePruner] Probing custom template "${rawName}" on Meta...`);
        const probeRes = await probeMetaTemplate(
          effectiveApiKey,
          effectivePhoneId,
          effectiveTestMobile,
          rawName,
          entry.parameters || "",
          entry.language || "en_US",
          false,
          (entry.parameters || "").includes("button_param")
        );

        if (probeRes.valid) {
          retainedList.push({
            id: entry.id || `custom_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            templateName: rawName,
            parameters: entry.parameters,
            language: entry.language || "en_US",
            status: "ACTIVE_VERIFIED"
          });
        } else {
          prunedList.push({
            id: entry.id,
            templateName: rawName,
            parameters: entry.parameters,
            language: entry.language,
            reason: probeRes.status,
            details: probeRes.details
          });
        }
      }
    }

    // Ensure all 7 standard categories have active verified fallback entries present
    for (const spec of VERIFIED_CATEGORY_SPECIFICATIONS) {
      if (!retainedList.some(r => r.templateName === spec.defaultFallback)) {
        retainedList.push({
          id: `def_${spec.key}`,
          templateName: spec.defaultFallback,
          parameters: spec.expectedParams.join(", "),
          language: spec.language,
          status: "ACTIVE_VERIFIED"
        });
      }
    }

    // Check category setting pointers in settings
    const categoryUpdates: Record<string, any> = {};
    const prunedNames = new Set(prunedList.map(p => p.templateName));

    for (const spec of VERIFIED_CATEGORY_SPECIFICATIONS) {
      const currentToken = (settings as any)[spec.settingField];
      if (currentToken && prunedNames.has(currentToken)) {
        tenantReport.categoryResets.push({
          categoryField: spec.settingField,
          label: spec.label,
          previousToken: currentToken,
          newFallbackToken: spec.defaultFallback
        });
        categoryUpdates[spec.settingField] = spec.defaultFallback;
      } else if (!currentToken) {
        categoryUpdates[spec.settingField] = spec.defaultFallback;
      }
    }

    tenantReport.prunedTemplates = prunedList;
    tenantReport.retainedTemplates = retainedList;
    tenantReport.prunedCount = prunedList.length;
    tenantReport.retainedCount = retainedList.length;
    tenantReport.status = prunedList.length > 0 ? "PRUNED" : "CLEAN";

    overallReport.totalPruned += prunedList.length;
    overallReport.totalRetained += retainedList.length;
    overallReport.tenants.push(tenantReport);

    // Apply updates to Firestore if not dry-run
    if (!dryRun) {
      const updatePayload: Record<string, any> = {
        metaCustomTemplates: retainedList,
        templateRegistry: retainedList,
        lastTemplatePruneAt: new Date().toISOString(),
        lastTemplatePruneSummary: {
          timestamp: new Date().toISOString(),
          prunedCount: prunedList.length,
          retainedCount: retainedList.length,
          status: tenantReport.status,
          prunedNames: prunedList.map(p => p.templateName)
        },
        ...categoryUpdates
      };

      await db.collection("settings").doc(docId).set(updatePayload, { merge: true });

      // Save audit log entry
      try {
        const auditLogRef = db.collection("template_prune_logs").doc();
        await auditLogRef.set({
          id: auditLogRef.id,
          timestamp: new Date().toISOString(),
          ownerId: docId,
          dryRun: false,
          totalInspected: tenantReport.totalInspected,
          prunedCount: prunedList.length,
          retainedCount: retainedList.length,
          prunedTemplates: prunedList,
          retainedTemplates: retainedList,
          categoryResets: tenantReport.categoryResets,
          status: tenantReport.status
        });
      } catch (logErr) {
        console.warn(`[TemplatePruner] Failed to write template_prune_logs for ${docId}:`, logErr);
      }

      console.log(`[TemplatePruner] Successfully updated settings for ${docId}: pruned ${prunedList.length}, retained ${retainedList.length}`);
    } else {
      console.log(`[TemplatePruner] [DRY RUN] Would update settings for ${docId}: prune ${prunedList.length}, retain ${retainedList.length}`);
    }
  }

  console.log(`[TemplatePruner] Pruning cycle complete. Total pruned: ${overallReport.totalPruned}, retained: ${overallReport.totalRetained}`);
  return overallReport;
}
