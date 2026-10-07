import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Customer, AppSettings, updateCustomer, saveSettings, Report, logAutomationError, saveBillingAuditLog } from './db';
import { db, auth } from '../firebase';
import { collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore';
import { whatsappService } from '../services/whatsappService';
import { createPortalLink } from './portal';
import { DEFAULT_VWSC_LOGO_BASE64 } from './sealLogo';

export const generateInvoicePDF = (customer: Customer, settings: AppSettings, isReceiptMode: boolean = false, paymentAmount: number = 0) => {
  const doc = new jsPDF({ format: 'a4', unit: 'mm' });
  
  const paymentReceived = paymentAmount || 0;
  const isPaid = isReceiptMode || customer.balance <= 0 || paymentReceived > 0;
  
  // 0. Full Page Yellow Background
  doc.setFillColor(254, 240, 138); // rich clean yellow
  doc.rect(0, 0, 210, 297, 'F');
  
  // 1. Header with Official Circular Emblem & Bold Typography
  const logoToUse = settings.appLogoImage || DEFAULT_VWSC_LOGO_BASE64;
  if (logoToUse) {
    try {
      const isJpeg = logoToUse.includes('jpeg') || logoToUse.includes('jpg');
      doc.addImage(logoToUse, isJpeg ? 'JPEG' : 'PNG', 16, 10, 24, 24);
    } catch (e) {
      console.warn("Could not embed custom logo, falling back to default seal", e);
      try {
        doc.addImage(DEFAULT_VWSC_LOGO_BASE64, 'PNG', 16, 10, 24, 24);
      } catch (e2) {
        console.warn("Could not embed default logo in PDF", e2);
      }
    }
  }

  // Header Title beside Logo (Bold, dark black text)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(15);
  doc.setTextColor(0, 0, 0); // dark black
  doc.text("VILLAGE WATER & SANITATION COMMITTEE", 46, 20);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(0, 0, 0);
  doc.text("VILLAGE - JHANDA KHURD (MANSA)", 46, 28);

  // Top Solid Horizontal Divider Line (spanning across the page)
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.8);
  doc.line(14, 38, 196, 38);

  // 2. Document Title (Centered, bold dark black)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  
  const docTitle = isPaid ? "RECEIPT" : "WATER BILL";
  doc.text(docTitle, 105, 48, { align: 'center' });

  // 3. Metadata Key-Value Block (All bold, dark black text)
  const currentDate = new Date().toLocaleDateString('en-IN');
  const currentMonth = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

  doc.setFontSize(10.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 0);

  let startY = 92;

  if (isPaid) {
    // ---- RECEIPT METADATA ----
    doc.text("DATE :", 20, 58);
    doc.text(currentDate, 65, 58);

    doc.text("RECEIPT NUMBER :", 20, 66);
    const receiptNum = `REC-${Date.now().toString().slice(-6)}`;
    doc.text(receiptNum, 65, 66);

    doc.text("ACCOUNT NUMBER :", 20, 74);
    const acctDisplay = customer.id ? String(customer.id).trim() : "N/A";
    doc.text(acctDisplay, 65, 74);

    doc.text("NAME :", 20, 82);
    let displayName = customer.name || "";
    doc.text(displayName, 65, 82);
  } else {
    // ---- WATER BILL METADATA ----
    doc.text("Date:", 20, 58);
    doc.text(currentDate, 65, 58);

    doc.text("Account No.:", 20, 66);
    const acctDisplay = customer.id ? String(customer.id).trim() : "N/A";
    doc.text(acctDisplay, 65, 66);

    doc.text("Consumer's Name :", 20, 74);
    let displayName = customer.name || "";
    doc.text(displayName, 65, 74);
  }

  // 4. Table Settings & Drawing
  const rowHeight = 11;
  const colLeft = 20;
  const colRight = 190; // Spans full content width 170mm (20mm to 190mm)
  const verticalLineX = 130; // Description width 110mm, Amount width 60mm

  const tableRowsUsed = isPaid ? 4 : 5;
  const tableBottomY = startY + (rowHeight * tableRowsUsed);

  if (isPaid) {
    // ---- RECEIPT TABLE ROW DATA ----
    // 3 Rows: Header + 3 data rows
    
    // Draw Table Outer Rectangle (sharp black border)
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.6);
    doc.rect(colLeft, startY, colRight - colLeft, rowHeight * tableRowsUsed);

    // Horizontal row dividers
    for (let i = 1; i < tableRowsUsed; i++) {
      doc.line(colLeft, startY + (rowHeight * i), colRight, startY + (rowHeight * i));
    }
    // Vertical column divider
    doc.line(verticalLineX, startY, verticalLineX, startY + (rowHeight * tableRowsUsed));

    // Headers
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.text("DESCRIPTION", colLeft + 4, startY + 7.5);
    doc.text("AMOUNT ( RS )", verticalLineX + 4, startY + 7.5);

    // Row 1: Payment Received -
    doc.text("Payment Received -", colLeft + 4, startY + rowHeight + 7.5);
    doc.text(paymentReceived > 0 ? paymentReceived.toFixed(2) : (settings.billingAmount || 200).toFixed(2), verticalLineX + 4, startY + rowHeight + 7.5);

    // Row 2: Pending amount ( If any ) -
    const pendingBalance = customer.balance;
    doc.text("Pending amount ( If any ) -", colLeft + 4, startY + (rowHeight * 2) + 7.5);
    doc.text(pendingBalance > 0 ? pendingBalance.toFixed(2) : "0.00", verticalLineX + 4, startY + (rowHeight * 2) + 7.5);

    // Row 3: TOTAL PENDING AMOUNT -
    doc.text("TOTAL PENDING AMOUNT -", colLeft + 4, startY + (rowHeight * 3) + 7.5);
    doc.text(pendingBalance > 0 ? pendingBalance.toFixed(2) : "0.00", verticalLineX + 4, startY + (rowHeight * 3) + 7.5);

    // Advance Credit Balance Notice
    if (customer.advanceBalance && customer.advanceBalance > 0) {
      doc.setFont("helvetica", "bold");
      doc.setFontSize(10);
      doc.text(`* Pre-paid Advance Credit Balance: Rs. ${customer.advanceBalance.toFixed(2)} (Will automatically apply to future bills)`, 20, tableBottomY + 6);
    }

  } else {
    // ---- WATER BILL TABLE ROW DATA ----
    // 4 Rows: Header + 4 data rows
    
    // Draw Table Outer Rectangle (sharp black border)
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.6);
    doc.rect(colLeft, startY, colRight - colLeft, rowHeight * tableRowsUsed);

    // Horizontal row dividers
    for (let i = 1; i < tableRowsUsed; i++) {
      doc.line(colLeft, startY + (rowHeight * i), colRight, startY + (rowHeight * i));
    }
    // Vertical column divider
    doc.line(verticalLineX, startY, verticalLineX, startY + (rowHeight * tableRowsUsed));

    // Headers
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10.5);
    doc.text("DESCRIPTION", colLeft + 4, startY + 7.5);
    doc.text("AMOUNT ( RS )", verticalLineX + 4, startY + 7.5);

    // Dynamic charges calculation
    const currentCharges = settings.billingAmount || 200;
    const arrears = customer.balance > currentCharges ? customer.balance - currentCharges : 0;
    const surcharge = arrears > 0 ? arrears * 0.10 : 0; // 10% surcharge
    const totalPayable = arrears + currentCharges + surcharge;

    // Row 1: Previous month's arrears, if any
    doc.text("Previous month's arrears, if any", colLeft + 4, startY + rowHeight + 7.5);
    doc.text(arrears > 0 ? arrears.toFixed(2) : "0.00", verticalLineX + 4, startY + rowHeight + 7.5);

    // Row 2: Water Consumption charges for last two months
    doc.text("Water Consumption charges for last two months", colLeft + 4, startY + (rowHeight * 2) + 7.5);
    doc.text(currentCharges.toFixed(2), verticalLineX + 4, startY + (rowHeight * 2) + 7.5);

    // Row 3: Surcharges ( if any )
    doc.text("Surcharges ( if any )", colLeft + 4, startY + (rowHeight * 3) + 7.5);
    doc.text(surcharge > 0 ? surcharge.toFixed(2) : "0.00", verticalLineX + 4, startY + (rowHeight * 3) + 7.5);

    // Row 4: TOTAL PAYABLE
    doc.text("TOTAL PAYABLE", colLeft + 4, startY + (rowHeight * 4) + 7.5);
    doc.text(totalPayable.toFixed(2), verticalLineX + 4, startY + (rowHeight * 4) + 7.5);
  }

  // Draw divider line before Important Instructions for both receipts and bills
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.8);
  doc.line(14, tableBottomY + (isPaid && customer.advanceBalance && customer.advanceBalance > 0 ? 10 : 4), 196, tableBottomY + (isPaid && customer.advanceBalance && customer.advanceBalance > 0 ? 10 : 4));

  // ---- IMPORTANT INSTRUCTIONS ----
  const instructionsY = tableBottomY + (isPaid && customer.advanceBalance && customer.advanceBalance > 0 ? 16 : 10);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.text("Important Instructions", 105, instructionsY, { align: 'center' });

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  
  const instructions = [
    "Present this bill at the time of payment.",
    "Despite any disputes or errors found in the bill, it is mandatory to pay this bill every month by the due date. In case an error is found, the adjustment for the difference in the amount will be made in the subsequent month's bill sent to the consumer by the department after resolving the discrepancy.",
    "The fee for disconnecting a connection is Rs. 200/- and for reconnecting is Rs. 500/-.",
    "If this bill is not paid by the due date, a 10% surcharge will be levied, and if payment is not made within 10 days after the due date, the connection will be disconnected without any notice.",
    "The bill can be paid at the Gram Panchayat office on any working day from 8:00 AM to 5:00 PM until the due date.",
    "Households whose previous bills remain pending as arrears are informed by the Chairman and all members of the Nagar Panchayat to deposit their pending bills by the last date; otherwise, their connections will be disconnected."
  ];

  let currentY = instructionsY + 5;
  instructions.forEach((inst, index) => {
    const idxText = `${index + 1}. `;
    doc.setFont("helvetica", "bold");
    doc.text(idxText, 20, currentY);
    
    doc.setFont("helvetica", "normal");
    const lines = doc.splitTextToSize(inst, 166);
    doc.text(lines, 24, currentY);
    currentY += (lines.length * 4.2) + 1; // Increment spacing dynamically
  });

  // Draw final horizontal line
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.8);
  doc.line(14, currentY + 2, 196, currentY + 2);

  return doc.output('blob');
};

export const sendWhatsAppNotification = async (
  customer: Customer, 
  message: string, 
  settings: AppSettings, 
  attachment?: Blob, 
  attachmentName?: string,
  isBulkMode?: boolean,
  includePortalLink: boolean = true,
  templateCategory?: 'billing' | 'receipt' | 'broadcast' | 'welcome' | 'overdue' | 'suspension' | 'custom',
  templateParams?: any[],
  customTemplateName?: string
): Promise<{ success: boolean; error?: string; fellBackToManual?: boolean }> => {
  if (customer.status === 'Suspended') {
    return { success: false, error: `Customer status is "${customer.status}". Automated billing notifications are disabled for this account.` };
  }
  if (!customer.mobileNumber || customer.mobileNumber.replace(/\D/g, '').length < 10) {
    console.warn(`Customer ${customer.name} has missing or invalid mobile number, skipping automation.`);
    return { success: false, error: "Customer has missing or invalid mobile number, cannot send automated messages." };
  }

  whatsappService.updateConfig(
    settings.metaWhatsAppApiKey || null, 
    settings.metaWhatsAppPhoneNumberId || null, 
    settings.watiAccessToken || null, 
    settings.watiApiEndpoint || null,
    settings.preferredNotificationMethod || null
  );
  
  let finalMessage = message;
  let usePortalLink = false;

  // Modify logic based on preferred notification method
  if (settings.preferredNotificationMethod === 'manual_link') {
    usePortalLink = true;
  } else if (settings.preferredNotificationMethod === 'api' && !whatsappService.isConfigured()) {
    usePortalLink = true;
  }

  usePortalLink = usePortalLink && includePortalLink;

  // Determine Template Name
  let templateName = customTemplateName;
  if (!templateName) {
    if (templateCategory === 'billing') templateName = settings.metaTemplateBilling;
    else if (templateCategory === 'receipt') templateName = settings.metaTemplateReceipt;
    else if (templateCategory === 'broadcast') templateName = settings.metaTemplateBroadcast;
    else if (templateCategory === 'welcome') templateName = settings.metaTemplateWelcome;
    else if (templateCategory === 'overdue') templateName = settings.metaTemplateOverdue;
    else if (templateCategory === 'suspension') templateName = settings.metaTemplateSuspension;
    else if (templateCategory === 'custom') templateName = settings.metaTemplateCustom;
  }

  // Look for custom parameters mapping
  let dynamicParamsResolved = false;
  if (templateName && settings.metaCustomTemplates) {
    const matchedConfig = settings.metaCustomTemplates.find(t => t.templateName === templateName);
    if (matchedConfig && matchedConfig.parameters) {
      const paramKeys = matchedConfig.parameters.split(',').map(s => s.trim());
      templateParams = paramKeys.map(key => {
        let val: any = '';
        if (key === 'customer_name') val = customer.name;
        else if (key === 'customer_balance') val = customer.balance;
        else if (key === 'billing_amount') val = settings.billingAmount;
        else if (key === 'new_balance') val = customer.balance + settings.billingAmount;
        else if (key === 'payment_amount') val = customer.balance; // Approximation if unknown
        else if (key === 'overdue_amount') val = customer.balance + settings.penaltyAmount;
        else if (key === 'date') val = new Date().toLocaleDateString('en-GB');
        else if (key === 'portal_link' || key === 'button_param') val = { isButtonParam: true, value: customer.id, index: '0' };
        else val = '';
        return val;
      });
      dynamicParamsResolved = true;
    }
  }

  if (usePortalLink) {
    try {
      const portalUrl = await createPortalLink(customer, settings);
      finalMessage = `${message}\n\n📄 View Invoice & Pay Securely:\n${portalUrl}`;
      
      if (!dynamicParamsResolved) {
        templateParams = templateParams || [];
        if (templateParams.length === 0) {
          templateParams.push(customer.name);
          if (templateCategory === 'billing') {
            templateParams.push(settings.billingAmount);
            templateParams.push(customer.balance);
            templateParams.push(new Date().toLocaleDateString('en-GB'));
          }
          templateParams.push({ isButtonParam: true, value: customer.id, index: '0' });
        }
      }
      
      // If we use a portal link, we strip out the binary attachments since manual links can't use them anyway
      attachment = undefined;
      attachmentName = undefined;
    } catch (e) {
      console.warn("Failed to generate portal link", e);
    }
   } else if (!dynamicParamsResolved) {
      templateParams = templateParams || [];
      if (templateParams.length === 0) {
        templateParams.push(customer.name);
        if (templateCategory === 'billing') {
          templateParams.push(settings.billingAmount);
          templateParams.push(customer.balance);
          templateParams.push(new Date().toLocaleDateString('en-GB'));
        }
        templateParams.push({ isButtonParam: true, value: customer.id, index: '0' });
      }
   }
  
  // 2. Try automated API if configured
  if (whatsappService.isConfigured() && settings.preferredNotificationMethod !== 'manual_link') {
    const result = await whatsappService.sendMessage({
      to: customer.mobileNumber,
      message: finalMessage,
      attachment,
      attachmentName,
      attachmentType: attachment ? 'application/pdf' : undefined,
      templateCategory,
      templateParams,
      customTemplateName: templateName
    });

    if (result.success) {
      console.log(`Automated WhatsApp message sent to ${customer.name}`);
      return { success: true };
    } else {
      console.error(`Automated WhatsApp API failed: ${result.error}.`);
      return { success: false, error: result.error };
    }
  } else if (settings.preferredNotificationMethod === 'api' || settings.preferredNotificationMethod === 'wati') {
    return { success: false, error: "API method selected but not configured properly." };
  }

  // 3. Fallback to manual link if not in bulk mode and preferred method is manual
  if (!isBulkMode && (!settings.preferredNotificationMethod || settings.preferredNotificationMethod === 'manual_link')) {
    const mobile = customer.mobileNumber.replace(/\D/g, '');
    let formattedTo = mobile;
    if (mobile.length === 10) {
      formattedTo = `91${mobile}`;
    } else if (mobile.length === 12 && mobile.startsWith('91')) {
      formattedTo = mobile;
    } else {
      formattedTo = mobile.startsWith('91') ? mobile : `91${mobile}`;
    }
    const url = `https://wa.me/${formattedTo}?text=${encodeURIComponent(finalMessage)}`;
    window.open(url, '_blank');
    return { success: true, fellBackToManual: true };
  }
  
  return { success: false, error: usePortalLink ? "Bulk manual notifications disabled. Please enable Meta API for bulk messaging." : "API not configured and manual fallback disabled for bulk mode." };
};

export const runAutomationCycle = async (customers: Customer[], settings: AppSettings) => {
  if (!settings.automation) return;
  if ((window as any)._automationRunning) return;
  
  const { isQuotaExceeded } = await import('./db');
  if (isQuotaExceeded()) {
    console.log("Automation skipped: Quota Limit Exceeded");
    return;
  }

  (window as any)._automationRunning = true;

  try {
    const { automation } = settings;
    const now = new Date();
    const effectiveOwnerId = settings.ownerId || auth.currentUser?.uid;
    
    const localLastBillingSafe = localStorage.getItem(`automation_billing_${settings.ownerId || 'sys'}`);
    const localLastPenaltySafe = localStorage.getItem(`automation_penalty_${settings.ownerId || 'sys'}`);
    const localLastNotifSafe = localStorage.getItem(`automation_notif_${settings.ownerId || 'sys'}`);

    const lastBilling = (localLastBillingSafe || settings.lastBillingDate) ? new Date((localLastBillingSafe || settings.lastBillingDate) as string) : null;
    const lastPenalty = (localLastPenaltySafe || settings.lastPenaltyDate) ? new Date((localLastPenaltySafe || settings.lastPenaltyDate) as string) : null;
    const lastNotification = (localLastNotifSafe || settings.lastNotificationDate) ? new Date((localLastNotifSafe || settings.lastNotificationDate) as string) : null;

    let updatedSettings = { ...settings };
    let needsSettingsUpdate = false;

    // 1. Automatic Bill Generation
    const defaultDay = parseInt(settings.defaultBillingDate || '1');
    const isBillingDay = now.getDate() === defaultDay;
    const monthsSinceLastBill = lastBilling ? (now.getTime() - lastBilling.getTime()) / (1000 * 60 * 60 * 24 * 30.44) : 999;
    
    if (automation.scheduledBilling && isBillingDay && monthsSinceLastBill >= settings.billingCycleMonths) {
      console.log("Automated Billing Cycle Triggered on Day:", defaultDay);
      const activeCustomers = customers.filter(c => c.status === 'Active' || c.status === 'Advance Paid');
      
      // Prevent loop immediately by saving locally
      localStorage.setItem(`automation_billing_${settings.ownerId || 'sys'}`, now.toISOString());
      updatedSettings.lastBillingDate = now.toISOString();
      needsSettingsUpdate = true;

      // Process in batches
      let processedCount = 0;
      let totalBilled = 0;
      for (let i = 0; i < activeCustomers.length; i += 200) {
        const batch = writeBatch(db);
        const chunk = activeCustomers.slice(i, i + 200);
        
        for (const customer of chunk) {
          const advance = Number(customer.advanceBalance) || 0;
          const billingAmt = Number(settings.billingAmount) || 200;
          let newBalance = Number(customer.balance) || 0;
          let newAdvance = advance;
          let newStatus = customer.status;
          let isCoveredByAdvance = false;

          if (advance >= billingAmt) {
            newAdvance = advance - billingAmt;
            newBalance = 0;
            newStatus = newAdvance > 0 ? 'Advance Paid' : 'Active';
            isCoveredByAdvance = true;
          } else if (advance > 0) {
            newBalance = (Number(customer.balance) || 0) + (billingAmt - advance);
            newAdvance = 0;
            newStatus = 'Active';
          } else {
            newBalance = (Number(customer.balance) || 0) + billingAmt;
            newAdvance = 0;
          }

          const targetDocId = customer.docId || (effectiveOwnerId ? `${effectiveOwnerId}_${customer.id}` : customer.id);
          batch.update(doc(db, 'customers', targetDocId), {
            balance: newBalance,
            advanceBalance: newAdvance,
            status: newStatus,
            invoiceSent: isCoveredByAdvance,
            paymentNotified: isCoveredByAdvance
          });

          // Log transaction for advance credit deductions
          if (advance > 0) {
            const usedAdvance = advance >= billingAmt ? billingAmt : advance;
            const autoTxnId = `AUTO-ADV-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
            batch.set(doc(db, 'transactions', autoTxnId), {
              id: autoTxnId,
              customerId: customer.id,
              customerName: customer.name,
              amount: usedAdvance,
              transactionId: `CYCLE-ADJ-${now.toISOString().split('T')[0]}`,
              date: now.toISOString(),
              ownerId: effectiveOwnerId || auth.currentUser?.uid || '',
              paymentMode: 'advance_credit',
              paymentType: 'advance_adjustment',
              isAdvanceCredit: false,
              advanceAdjustment: -usedAdvance,
              previousBalance: Number(customer.balance) || 0,
              newBalance: newBalance,
              previousAdvance: advance,
              newAdvance: newAdvance,
              notes: `Automated advance credit adjustment of INR ${usedAdvance.toFixed(2)} applied to billing cycle`
            });
          }

          processedCount++;
          totalBilled += billingAmt;

          // If smart notifications are enabled, automatically text them their new bill
          if (automation.smartNotifications && automation.bulkProcessing) {
            try {
              let message = "";
              if (isCoveredByAdvance) {
                message = `Dear ${customer.name}, your water bill of INR ${billingAmt.toFixed(2)} for the new cycle has been automatically paid from your advance credit. Remaining advance balance: INR ${newAdvance.toFixed(2)}. No payment is required. Thank you!`;
              } else if (advance > 0) {
                message = `Dear ${customer.name}, your water bill of INR ${billingAmt.toFixed(2)} has been partially covered by your INR ${advance.toFixed(2)} advance credit. Remaining balance due is INR ${newBalance.toFixed(2)}. Please pay by the due date.`;
              } else {
                message = `Dear ${customer.name}, your water bill for the new cycle has been generated. Your amount due is ${newBalance.toFixed(2)}. Please pay by the due date.`;
              }
              const pdfBlob = generateInvoicePDF({ ...customer, balance: newBalance, advanceBalance: newAdvance, status: newStatus }, updatedSettings);
              sendWhatsAppNotification(customer, message, updatedSettings, pdfBlob, `Bill_${customer.id}.pdf`, true, true, isCoveredByAdvance ? 'receipt' : 'billing')
                .then(res => {
                  if (!res.success && res.error) {
                    logAutomationError({ customerId: customer.id, customerName: customer.name, errorMessage: res.error, type: 'billing' });
                  }
                })
                .catch(e => {
                  console.error("Auto billing notice error", e);
                  logAutomationError({ customerId: customer.id, customerName: customer.name, errorMessage: String(e), type: 'billing' });
                });
            } catch (err: any) {
              logAutomationError({ customerId: customer.id, customerName: customer.name, errorMessage: err.message || String(err), type: 'billing' });
            }
          }
        }
        try {
          await batch.commit();
        } catch(e: any) { 
          console.error("Quota Exceeded on Billing", e); 
          if (e.message?.includes('Quota') || e.code === 'resource-exhausted') throw e; 
          break; 
        }
        await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limit protection
      }

      if (processedCount > 0 && effectiveOwnerId) {
        try {
          await saveBillingAuditLog({
            ownerId: effectiveOwnerId,
            type: 'bill_generation',
            description: 'Automated Billing Cycle',
            affectedCustomersCount: processedCount,
            totalAmount: totalBilled,
            timestamp: new Date().toISOString(),
            executedBy: 'system'
          });
        } catch(e) { console.error(e) }
      }
    }

  // 2. Automatic Penalty Application
  const daysSinceLastBill = lastBilling ? (now.getTime() - lastBilling.getTime()) / (1000 * 60 * 60 * 24) : 0;
  if (automation.lateFee && daysSinceLastBill >= settings.penaltyDays && (!lastPenalty || lastPenalty < (lastBilling || now))) {
    console.log("Automated Penalty Application Triggered");
    const activeCustomers = customers.filter(c => c.status === 'Active' && c.balance >= settings.billingAmount && (!c.advanceBalance || c.advanceBalance === 0));
    
    // Pre-save to avoid quota loop
    localStorage.setItem(`automation_penalty_${settings.ownerId || 'sys'}`, now.toISOString());
    updatedSettings.lastPenaltyDate = now.toISOString();
    needsSettingsUpdate = true;
    
      let processedCount = 0;
      let totalPenalties = 0;
      for (let i = 0; i < activeCustomers.length; i += 200) {
      const batch = writeBatch(db);
      const chunk = activeCustomers.slice(i, i + 200);

      for (const customer of chunk) {
        const targetDocId = customer.docId || (effectiveOwnerId ? `${effectiveOwnerId}_${customer.id}` : customer.id);
        batch.update(doc(db, 'customers', targetDocId), {
          balance: customer.balance + settings.penaltyAmount
        });
        processedCount++;
        totalPenalties += settings.penaltyAmount;
        
        if (automation.bulkProcessing) {
          try {
            const overdueMessage = `NOTICE: A late fee of INR ${settings.penaltyAmount.toFixed(2)} has been applied to your account. Your new balance is INR ${(customer.balance + settings.penaltyAmount).toFixed(2)}. Please pay at earliest.`;
            sendWhatsAppNotification({...customer, balance: customer.balance + settings.penaltyAmount}, overdueMessage, settings, undefined, undefined, true, true, 'overdue')
              .then(res => {
                if (!res.success && res.error) {
                  logAutomationError({ customerId: customer.id, customerName: customer.name, errorMessage: res.error, type: 'overdue' });
                }
              })
              .catch(e => {
                console.error("Overdue notice error", e);
                logAutomationError({ customerId: customer.id, customerName: customer.name, errorMessage: String(e), type: 'overdue' });
              });
          } catch (err: any) {
             logAutomationError({ customerId: customer.id, customerName: customer.name, errorMessage: err.message || String(err), type: 'overdue' });
          }
        }
      }
      try {
        await batch.commit();
      } catch(e: any) { 
        console.error("Quota Exceeded on Penalty", e); 
        if (e.message?.includes('Quota') || e.code === 'resource-exhausted') throw e;
        break; 
      }
      await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limit protection
    }
    
    if (processedCount > 0 && effectiveOwnerId) {
      try {
        await saveBillingAuditLog({
          ownerId: effectiveOwnerId,
          type: 'penalty_application',
          description: 'Automated Late Fee Penalty',
          affectedCustomersCount: processedCount,
          totalAmount: totalPenalties,
          timestamp: new Date().toISOString(),
          executedBy: 'system'
        });
      } catch(e) { console.error(e) }
    }
  }

  // 3. Escalation Check
  const escalationDays = settings.escalationDays || 60;
  if (automation.billingLifecycle && automation.ruleBased && daysSinceLastBill >= escalationDays && settings.autoSuspend) {
    console.log("Automated Escalation / Suspension Triggered");
    const suspendedCustomers = customers.filter(c => c.status === 'Active' && c.balance >= settings.billingAmount && (!c.advanceBalance || c.advanceBalance <= 0));
    
    localStorage.setItem(`automation_penalty_${settings.ownerId || 'sys'}`, now.toISOString());
    let suspendProcessedCount = 0;
    for (let i = 0; i < suspendedCustomers.length; i += 200) {
      const batch = writeBatch(db);
      const chunk = suspendedCustomers.slice(i, i + 200);
      
      for (const customer of chunk) {
         const targetDocId = customer.docId || (effectiveOwnerId ? `${effectiveOwnerId}_${customer.id}` : customer.id);
         batch.update(doc(db, 'customers', targetDocId), { status: 'Suspended' });
         suspendProcessedCount++;
         
         if (automation.bulkProcessing) {
           try {
             const escalationMessage = `FINAL NOTICE: Your account has been SUSPENDED due to an outstanding balance of INR ${customer.balance.toFixed(2)} unpaid for over ${escalationDays} days. Please pay immediately.`;
             const escalationPdf = generateEscalationPDF(customer, settings);
             sendWhatsAppNotification(customer, escalationMessage, settings, escalationPdf, `Final_Notice_${customer.id}.pdf`, true, true, 'suspension')
               .then(res => {
                 if (!res.success && res.error) {
                   logAutomationError({ customerId: customer.id, customerName: customer.name, errorMessage: res.error, type: 'suspension' });
                 }
               })
               .catch(e => {
                 console.error("Escalation notice error", e);
                 logAutomationError({ customerId: customer.id, customerName: customer.name, errorMessage: String(e), type: 'suspension' });
               });
           } catch (err: any) {
             logAutomationError({ customerId: customer.id, customerName: customer.name, errorMessage: err.message || String(err), type: 'suspension' });
           }
         }
      }
      try {
        await batch.commit();
      } catch(e: any) { 
        console.error("Quota Exceeded on Escalation", e); 
        if (e.message?.includes('Quota') || e.code === 'resource-exhausted') throw e;
        break; 
      }
      await new Promise(resolve => setTimeout(resolve, 1000)); // Rate limit protection
    }
    
    if (suspendProcessedCount > 0 && effectiveOwnerId) {
      try {
        await saveBillingAuditLog({
          ownerId: effectiveOwnerId,
          type: 'auto_suspend',
          description: 'Automated Account Suspension',
          affectedCustomersCount: suspendProcessedCount,
          totalAmount: 0,
          timestamp: new Date().toISOString(),
          executedBy: 'system'
        });
      } catch(e) { console.error(e) }
    }
  }

  // 4. Daily Notification Check
  if (automation.smartNotifications) {
      const isNewDay = !lastNotification || new Date(lastNotification).toDateString() !== now.toDateString();
      if (isNewDay) {
        console.log("Daily Notification Flag Set");

        // 3-Day Reminder Logic
        const daysSinceLastBillInt = lastBilling ? Math.floor((now.getTime() - lastBilling.getTime()) / (1000 * 60 * 60 * 24)) : 0;
        if (daysSinceLastBillInt > 0 && daysSinceLastBillInt % 3 === 0 && automation.bulkProcessing) {
          console.log("3-Day Reminder Triggered for unpaid customers");
          const unpaidCustomers = customers.filter(c => c.status === 'Active' && c.balance > 0);
          for (let i = 0; i < unpaidCustomers.length; i++) {
            const customer = unpaidCustomers[i];
            try {
              const pdfBlob = generateInvoicePDF(customer, settings);
              const reminderMessage = `Dear ${customer.name}, this is a gentle reminder that your updated balance of INR ${customer.balance.toFixed(2)} is unpaid (including any applicable late fees). Please find your updated bill attached and pay promptly to avoid service impacts.`;
              try {
                const res = await sendWhatsAppNotification(customer, reminderMessage, settings, pdfBlob, `Updated_Bill_${customer.id}.pdf`, true, true, 'billing');
                if (!res.success && res.error) {
                  logAutomationError({ customerId: customer.id, customerName: customer.name, errorMessage: res.error, type: 'reminder' });
                }
              } catch (e) {
                console.error("Auto reminder notice error", e);
                logAutomationError({ customerId: customer.id, customerName: customer.name, errorMessage: String(e), type: 'reminder' });
              }
            } catch (err: any) {
              logAutomationError({ customerId: customer.id, customerName: customer.name, errorMessage: err.message || String(err), type: 'reminder' });
            }
            if ((i + 1) % 5 === 0) {
              await new Promise(resolve => setTimeout(resolve, 1500)); // Rate limit protection
            }
          }
        }

        localStorage.setItem(`automation_notif_${settings.ownerId || 'sys'}`, now.toISOString());
        updatedSettings.lastNotificationDate = now.toISOString();
        needsSettingsUpdate = true;
      }
  }

  if (needsSettingsUpdate) {
    try {
      await saveSettings(updatedSettings);
    } catch(e) { console.error("Failed to update final automation timestamps", e); }
  }

  } finally {
     setTimeout(() => { (window as any)._automationRunning = false; }, 60000); // 1 minute lock to prevent flapping
  }
};

export const shareReportToCustomers = async (report: Report, customers: Customer[], settings: AppSettings) => {
  whatsappService.updateConfig(
    settings.metaWhatsAppApiKey || null, 
    settings.metaWhatsAppPhoneNumberId || null, 
    settings.watiAccessToken || null,
    settings.watiApiEndpoint || null,
    settings.preferredNotificationMethod || null
  );

  let blob: Blob | undefined = undefined;
  let attachmentName: string | undefined = undefined;
  
  if (report.files && report.files.length > 0) {
     const fileUrl = report.files[0].data;
     if (fileUrl.startsWith('data:')) {
       // Convert base64 back to Blob
       const [header, base64] = fileUrl.split(',');
       const mimeType = header.match(/:(.*?);/)?.[1] || 'application/pdf';
       const byteCharacters = atob(base64);
       const byteNumbers = new Array(byteCharacters.length);
       for (let i = 0; i < byteCharacters.length; i++) {
           byteNumbers[i] = byteCharacters.charCodeAt(i);
       }
       const byteArray = new Uint8Array(byteNumbers);
       blob = new Blob([byteArray], {type: mimeType});
       attachmentName = report.files[0].name;
     }
  }

  // Iterate sequentially to avoid overwhelming rate limits, or use batching in a real system
  let sends = 0;
  for (const customer of customers) {
     if (customer.status !== 'Active') continue;
     
     // Generate the portal link (assuming portal logic can read ?reportId)
     const baseUrl = window.location.origin;
     const portalUrl = `${baseUrl}/?portal=true&customerId=${customer.id}&reportId=${report.id}`;
     
     const message = `*Notice: ${report.title}*\n\nHello ${customer.name}, a new report/notice has been published.`;
     const fullMsg = blob ? message : `${message}\n\nView details here: ${portalUrl}`;
     
     await sendWhatsAppNotification(
       customer,
       fullMsg,
       settings,
       blob,
       attachmentName,
       true,
       true,
       'billing'
     );
     
     sends++;
     if (sends % 5 === 0) {
       await new Promise(resolve => setTimeout(resolve, 1500)); // Delay to prevent HTTP 429
     }
  }
};

export const generateEscalationPDF = (customer: Customer, settings: AppSettings) => {
  const doc = new jsPDF({ compress: true });
  
  // Header
  doc.setFontSize(26);
  doc.setTextColor(220, 38, 38); // Red color
  doc.text('FINAL OVERDUE NOTICE', 105, 20, { align: 'center' });
  
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(`Notice Date: ${new Date().toLocaleDateString()}`, 105, 30, { align: 'center' });
  
  // Company Info
  doc.setFontSize(12);
  doc.text(settings.organizationName || 'Billing Authority Office', 20, 45);
  doc.setFontSize(10);
  doc.text('Administrative Billing Department', 20, 50);
  doc.text('Email: info@gpjhandakhurd.in', 20, 55);
  
  // Customer Info
  doc.setFontSize(14);
  doc.setTextColor(220, 38, 38);
  doc.text('ACCOUNT SUSPENDED', 140, 45);
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.text(`Customer Name: ${customer.name}`, 140, 52);
  doc.text(`Account ID: ${customer.id}`, 140, 58);
  doc.text(`Mobile: ${customer.mobileNumber}`, 140, 64);
  
  // Table
  autoTable(doc, {
    startY: 75,
    head: [['Outstanding Details', 'Duration Overdue', 'Amount Due (INR)']],
    body: [
      ['Unpaid Usage & Accumulated Fees', `> ${settings.escalationDays || 60} Days`, customer.balance.toFixed(2)],
    ],
    theme: 'plain',
    headStyles: { fillColor: [220, 38, 38], textColor: 255 },
    styles: { fontSize: 11, cellPadding: 6, fontStyle: 'bold' }
  });
  
  // Footer
  const finalY = (doc as any).lastAutoTable.finalY + 30;
  doc.setFontSize(12);
  doc.text('URGENT INSTRUCTIONS:', 20, finalY);
  doc.setFontSize(10);
  doc.text('1. Your services have been officially suspended due to non-payment.', 20, finalY + 7);
  doc.text('2. Failure to clear the dues within 7 days may result in permanent termination.', 20, finalY + 12);
  doc.text('3. Use the public portal link to pay via secure UPI scanning.', 20, finalY + 17);
  
  doc.setFontSize(16);
  doc.setTextColor(220, 38, 38);
  doc.text(`MANDATORY PAYMENT: INR ${customer.balance.toFixed(2)}`, 140, finalY + 20, { align: 'center' });
  
  return doc.output('blob');
};
