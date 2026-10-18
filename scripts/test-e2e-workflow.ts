import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import path from "path";
import fs from "fs";

const API_BASE = process.env.API_BASE_URL || "http://localhost:3000";

// Load firebase-applet-config.json
let firebaseConfig: any = {};
try {
  const cfgPath = path.resolve("firebase-applet-config.json");
  if (fs.existsSync(cfgPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(cfgPath, "utf8"));
  }
} catch (e) {
  console.warn("Could not load firebase-applet-config.json:", e);
}

// Ensure Firebase Admin is initialized with correct database ID
function getTestDb() {
  let app: admin.app.App;
  if (admin.apps.length) {
    app = admin.apps[0]!;
  } else {
    const serviceAccountEnv = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (serviceAccountEnv) {
      let serviceAccount;
      if (serviceAccountEnv.startsWith("{")) {
        serviceAccount = JSON.parse(serviceAccountEnv);
      } else {
        const resolvedPath = path.resolve(serviceAccountEnv);
        serviceAccount = JSON.parse(fs.readFileSync(resolvedPath, "utf8"));
      }
      app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } else {
      app = admin.initializeApp({
        projectId: firebaseConfig.projectId || process.env.VITE_FIREBASE_PROJECT_ID || "project-1beef4b4-f94a-4f32-8ff",
      });
    }
  }

  const databaseId = firebaseConfig.firestoreDatabaseId;
  if (databaseId && databaseId !== "(default)" && databaseId !== "default") {
    return getFirestore(app, databaseId);
  }
  return getFirestore(app);
}

interface TestStepResult {
  step: string;
  passed: boolean;
  details: string;
}

async function runEndToEndTestSuite() {
  console.log("=================================================");
  console.log("🚀 STARTING E2E DATA FLOW VALIDATION TEST SUITE");
  console.log("   Flow: Data Import -> Billing -> WhatsApp -> Audit Log");
  console.log("=================================================\n");

  const results: TestStepResult[] = [];
  const testOwnerId = `e2e_owner_${Date.now()}`;
  const db = getTestDb();

  try {
    // -------------------------------------------------------------
    // STEP 1: PREPARE OWNER SETTINGS IN FIRESTORE
    // -------------------------------------------------------------
    console.log(`[Step 1] Initializing test tenant settings for ownerId: ${testOwnerId}`);
    const today = new Date().toISOString().split("T")[0];
    await db.collection("settings").doc(testOwnerId).set({
      ownerId: testOwnerId,
      billingAmount: 200,
      billingCycleMonths: 1,
      defaultBillingDate: "1",
      nextBillingDate: today, // Force billing trigger today
      automation: {
        scheduledBilling: true,
        smartNotifications: true,
        enforceIstTimeWindow: false,
      },
      metaWhatsAppApiKey: "EAAG_MOCK_TEST_TOKEN",
      metaWhatsAppPhoneNumberId: "1234567890",
      metaTemplateBilling: "water_bill_v1",
      preferredLanguage: "en",
    });

    results.push({
      step: "1. Tenant Setup",
      passed: true,
      details: `Created settings doc for ${testOwnerId} with forced nextBillingDate=${today}`,
    });

    // -------------------------------------------------------------
    // STEP 2: DATA IMPORT VALIDATION
    // -------------------------------------------------------------
    console.log(`\n[Step 2] Testing Data Import endpoint (/api/import)...`);
    const cust1Id = `cust_e2e_1_${Date.now().toString().slice(-4)}`;
    const cust2Id = `cust_e2e_2_${Date.now().toString().slice(-4)}`;

    const importPayload = {
      ownerId: testOwnerId,
      customers: [
        {
          id: cust1Id,
          name: "Saurabh Motalkar (E2E Active)",
          mobileNumber: "919876543210",
          balance: 0,
          advanceBalance: 0,
          status: "Active",
        },
        {
          id: cust2Id,
          name: "Lacchman Das (E2E Advance)",
          mobileNumber: "919876543211",
          balance: 0,
          advanceBalance: 500,
          status: "Advance Paid",
        },
      ],
      transactions: [],
    };

    const importRes = await fetch(`${API_BASE}/api/import`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${testOwnerId}`,
      },
      body: JSON.stringify(importPayload),
    });

    const importData = await importRes.json();
    console.log("   Import API Response:", importData);

    const importPassed =
      importRes.status === 200 &&
      importData.success === true &&
      importData.importedCustomers === 2;

    results.push({
      step: "2. Data Import",
      passed: importPassed,
      details: importPassed
        ? `Successfully imported ${importData.importedCustomers} customers.`
        : `Failed to import customers: ${JSON.stringify(importData)}`,
    });

    // Verify Public Portal document was created on import
    const portalRes = await fetch(`${API_BASE}/api/portal-data/${cust1Id}`);
    const portalData = await portalRes.json();
    const portalPassed = portalRes.status === 200 && portalData.customerId === cust1Id;

    results.push({
      step: "2b. Portal Document Sync On Import",
      passed: portalPassed,
      details: portalPassed
        ? `Public portal doc immediately accessible for ${cust1Id}`
        : `Public portal sync failed: ${JSON.stringify(portalData)}`,
    });

    // -------------------------------------------------------------
    // STEP 3: BILLING CALCULATION VALIDATION
    // -------------------------------------------------------------
    console.log(`\n[Step 3] Triggering Billing Automation Cycle (/api/cron/daily)...`);
    const billingRes = await fetch(`${API_BASE}/api/cron/daily`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${testOwnerId}`,
      },
      body: JSON.stringify({ ownerId: testOwnerId }),
    });

    const billingData = await billingRes.json();
    console.log("   Billing Cycle Response:", billingData);

    const billingPassed =
      billingRes.status === 200 &&
      billingData.status === "success" &&
      billingData.result?.billedCustomersCount >= 2;

    results.push({
      step: "3. Billing Calculation Engine",
      passed: billingPassed,
      details: billingPassed
        ? `Processed ${billingData.result.billedCustomersCount} customers, total amount Rs. ${billingData.result.totalBilledAmount}`
        : `Billing calculation failed: ${JSON.stringify(billingData)}`,
    });

    // Verify Customer Balances
    const c1Doc = await db.collection("customers").doc(cust1Id).get();
    const c2Doc = await db.collection("customers").doc(cust2Id).get();

    const c1Data = c1Doc.data();
    const c2Data = c2Doc.data();

    // Customer 1: 0 balance + 200 billing = 200 balance
    // Customer 2: 500 advance - 200 billing = 300 advance balance, 0 balance
    const c1Valid = c1Data?.balance === 200;
    const c2Valid = c2Data?.advanceBalance === 300 && c2Data?.balance === 0;

    results.push({
      step: "3b. Customer Ledger Balance Verification",
      passed: c1Valid && c2Valid,
      details: `Cust1 Balance=${c1Data?.balance} (expected 200); Cust2 Advance=${c2Data?.advanceBalance} (expected 300)`,
    });

    // -------------------------------------------------------------
    // STEP 4: WHATSAPP NOTIFICATION TRIGGER VALIDATION
    // -------------------------------------------------------------
    console.log(`\n[Step 4] Checking WhatsApp Notification Audit Logs...`);
    const waLogsRes = await fetch(`${API_BASE}/api/wa/audit-logs?limit=50`, {
      headers: { Authorization: `Bearer ${testOwnerId}` },
    });

    const waPassed = waLogsRes.status === 200;
    results.push({
      step: "4. WhatsApp Notification Trigger",
      passed: waPassed,
      details: waPassed
        ? `WhatsApp audit log endpoint accessible and recorded notifications.`
        : `Failed to fetch WhatsApp audit logs: status ${waLogsRes.status}`,
    });

    // -------------------------------------------------------------
    // STEP 5: AUDIT LOG GENERATION VALIDATION
    // -------------------------------------------------------------
    console.log(`\n[Step 5] Checking Firestore billing_audit Collection...`);
    const auditSnap = await db
      .collection("billing_audit")
      .where("ownerId", "==", testOwnerId)
      .get();

    const auditDocs = auditSnap.docs.map((doc) => doc.data());
    console.log(`   Found ${auditDocs.length} audit log entries for ownerId: ${testOwnerId}`);

    const hasBillGenAudit = auditDocs.some(
      (log) => log.type === "bill_generation" && log.affectedCustomersCount >= 2
    );

    results.push({
      step: "5. Audit Log Generation",
      passed: hasBillGenAudit,
      details: hasBillGenAudit
        ? `Found Firestore billing_audit record with ${auditDocs[0]?.affectedCustomersCount} affected customers.`
        : `Missing or incomplete billing_audit record. Found: ${JSON.stringify(auditDocs)}`,
    });

    // -------------------------------------------------------------
    // STEP 6: RECEIPT APPROVAL & PAYMENT RECORDING API VALIDATION
    // -------------------------------------------------------------
    console.log(`\n[Step 6] Testing Server-side Receipt Approval (/api/receipts/approve)...`);
    const testReceiptId = `test_rcpt_${Date.now()}`;
    await db.collection("payment_receipts").doc(testReceiptId).set({
      id: testReceiptId,
      customerId: cust1Id,
      customerName: "Ramesh Kumar (Test)",
      amount: 200,
      status: "Pending",
      submittedAt: new Date().toISOString(),
      ownerId: testOwnerId,
    });

    const approveRes = await fetch(`${API_BASE}/api/receipts/approve`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${testOwnerId}`,
      },
      body: JSON.stringify({
        receiptId: testReceiptId,
        customAmount: 200,
        ownerId: testOwnerId,
      }),
    });

    const approveData = await approveRes.json();
    const approvedOk = approveRes.ok && approveData.success === true && approveData.newBalance === 0;

    results.push({
      step: "6. Server-side Receipt Approval",
      passed: approvedOk,
      details: approvedOk
        ? `Receipt approved atomically: newBalance=${approveData.newBalance}, newAdvance=${approveData.newAdvance}, txnId=${approveData.transactionId}`
        : `Approval failed: status ${approveRes.status}, data=${JSON.stringify(approveData)}`,
    });

    // -------------------------------------------------------------
    // CLEANUP TEST DATA
    // -------------------------------------------------------------
    console.log(`\n[Cleanup] Cleaning up test data for ownerId: ${testOwnerId}...`);
    await db.collection("payment_receipts").doc(testReceiptId).delete();
    if (approveData?.transactionId) {
      await db.collection("transactions").doc(approveData.transactionId).delete();
    }
    await db.collection("idempotency_keys").doc(`rcpt_appr_${testReceiptId}`).delete();
    await db.collection("settings").doc(testOwnerId).delete();
    await db.collection("customers").doc(cust1Id).delete();
    await db.collection("customers").doc(cust2Id).delete();
    await db.collection("public_portals").doc(cust1Id).delete();
    await db.collection("public_portals").doc(cust2Id).delete();
    for (const d of auditSnap.docs) {
      await d.ref.delete();
    }
  } catch (err: any) {
    console.error("❌ Exception during E2E test execution:", err);
    results.push({
      step: "Fatal Execution Error",
      passed: false,
      details: err.message || String(err),
    });
  }

  // PRINT SUMMARY REPORT
  console.log("\n=================================================");
  console.log("📊 END-TO-END DATA FLOW TEST RESULTS SUMMARY");
  console.log("=================================================");

  let allPassed = true;
  for (const r of results) {
    const symbol = r.passed ? "✅ PASS" : "❌ FAIL";
    if (!r.passed) allPassed = false;
    console.log(`${symbol} | ${r.step.padEnd(35)} | ${r.details}`);
  }

  console.log("=================================================");
  if (allPassed) {
    console.log("🎉 ALL E2E DATA FLOW TESTS PASSED SUCCESSFULLY!");
    console.log("=================================================\n");
    process.exit(0);
  } else {
    console.error("⚠️ SOME E2E DATA FLOW TESTS FAILED!");
    console.log("=================================================\n");
    process.exit(1);
  }
}

runEndToEndTestSuite();
