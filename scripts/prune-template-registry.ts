#!/usr/bin/env tsx
import dotenv from "dotenv";
dotenv.config();

import { pruneTemplateRegistry } from "../src/server/services/templatePruner.ts";

async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run");
  
  let targetOwner: string | undefined = undefined;
  const ownerArg = args.find(a => a.startsWith("--owner="));
  if (ownerArg) {
    targetOwner = ownerArg.split("=")[1];
  }

  console.log("================================================================================");
  console.log("       METAGRAPH TEMPLATE REGISTRY PRUNING & ANTI-DRIFT DAEMON                 ");
  console.log("================================================================================");
  console.log(`Execution Mode  : ${isDryRun ? "DRY RUN (Preview Only - No Firestore Writes)" : "LIVE PRUNE (Applying Changes to Firestore)"}`);
  console.log(`Target Tenant   : ${targetOwner || "ALL (Global Cluster)"}`);
  console.log(`Timestamp       : ${new Date().toISOString()}`);
  console.log("--------------------------------------------------------------------------------\n");

  const startTime = Date.now();

  try {
    const report = await pruneTemplateRegistry({
      dryRun: isDryRun,
      ownerId: targetOwner
    });

    const elapsedMs = Date.now() - startTime;

    console.log("\n================================================================================");
    console.log("                             PRUNE AUDIT SUMMARY                                ");
    console.log("================================================================================");
    console.log(`Tenants Inspected : ${report.totalTenants}`);
    console.log(`Total Templates   : ${report.totalInspected}`);
    console.log(`Pruned (Drifted)  : ${report.totalPruned}`);
    console.log(`Retained (Active) : ${report.totalRetained}`);
    console.log(`Elapsed Time      : ${elapsedMs}ms`);
    console.log("--------------------------------------------------------------------------------\n");

    for (const tenant of report.tenants) {
      console.log(`[Tenant: ${tenant.ownerId}] Status: ${tenant.status}`);
      if (tenant.prunedTemplates.length > 0) {
        console.log("  ❌ Pruned Entries (Configuration Drift):");
        for (const p of tenant.prunedTemplates) {
          console.log(`     - Token: "${p.templateName}" | Reason: ${p.reason}`);
          if (p.details) {
            console.log(`       Details: ${p.details}`);
          }
        }
      } else {
        console.log("  ✅ Zero drifted templates found. Registry is in sync with Meta.");
      }

      if (tenant.categoryResets.length > 0) {
        console.log("  ⚠️ Category Pointers Reset to Verified Meta Fallbacks:");
        for (const r of tenant.categoryResets) {
          console.log(`     - ${r.label} (${r.categoryField}): "${r.previousToken}" -> "${r.newFallbackToken}"`);
        }
      }

      console.log(`  🛡️ Retained Verified Templates (${tenant.retainedTemplates.length}):`);
      for (const ret of tenant.retainedTemplates) {
        console.log(`     - [${ret.status}] ${ret.templateName} (${ret.language}): ${ret.parameters}`);
      }
      console.log("");
    }

    console.log("================================================================================");
    console.log(` Prune operation completed successfully ${isDryRun ? "(DRY RUN)" : "(CHANGES APPLIED)"}.`);
    console.log("================================================================================");

    process.exit(0);
  } catch (err: any) {
    console.error("\n❌ Fatal error executing Template Registry Pruner:", err);
    process.exit(1);
  }
}

main();
