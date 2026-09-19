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
  const isPaid = isReceiptMode || customer.balance <= 0;
  
  // 1. Header with Official Circular Emblem & Serif Typography
  const logoToUse = settings.appLogoImage || DEFAULT_VWSC_LOGO_BASE64;
  if (logoToUse) {
    try {
      doc.addImage(logoToUse, 'PNG', 16, 10, 24, 24);
    } catch (e) {
      console.warn("Could not embed logo in PDF", e);
    }
  }

  // Header Title beside Logo
  doc.setFont("times", "bold");
  doc.setFontSize(16);
  doc.setTextColor(15, 23, 42); // dark navy/black
  doc.text("VILLAGE WATER & SANITATION COMMITTEE", 46, 20);

  doc.setFont("times", "normal");
  doc.setFontSize(11);
  doc.text("VILLAGE - JHANDA KHURD (MANSA)", 46, 28);

  // Top Solid Horizontal Divider Line (spanning across the page)
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.8);
  doc.line(14, 38, 196, 38);

  // 2. Document Title (Centered as in reference)
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(0, 0, 0);
  const docTitle = isPaid ? "RECEIPT" : "WATER BILL";
  doc.text(docTitle, 105, 50, { align: 'center' });

  // 3. Metadata Key-Value Block
  const currentDate = new Date().toLocaleDateString();
  const currentMonth = new Date().toLocaleString('default', { month: 'long', year: 'numeric' });

  doc.setFontSize(10.5);
  // Row 1: Date
  doc.setFont("helvetica", "bold");
  doc.text("Date:", 20, 60);
  doc.setFont("helvetica", "normal");
  doc.text(currentDate, 65, 60);

  // Row 2: Account No.
  doc.setFont("helvetica", "bold");
  doc.text("Account No.:", 20, 68);
  doc.setFont("helvetica", "normal");
  const acctRaw = customer.id ? customer.id.substring(0, 8).toUpperCase() : "N/A";
  const acctDisplay = acctRaw.startsWith("CUST-") ? acctRaw : `CUST-${acctRaw.substring(0, 4)}`;
  doc.text(acctDisplay, 65, 68);

  // Row 3: Consumer Name
  doc.setFont("helvetica", "bold");
  const nameLabel = isPaid ? "Received From (Consumer's Name) :" : "Consumer's Name :";
  doc.text(nameLabel, 20, 76);
  doc.setFont("helvetica", "normal");
  const nameX = isPaid ? 90 : 65;

  let displayName = customer.name || "";
  if (doc.getTextWidth(displayName) > (190 - nameX)) {
    while (doc.getTextWidth(displayName + "...") > (190 - nameX) && displayName.length > 5) {
      displayName = displayName.slice(0, -1);
    }
    displayName += "...";
  }
  doc.text(displayName, nameX, 76);

  // Row 4: Water Bill For Month
  doc.setFont("helvetica", "bold");
  doc.text("Water Bill For Month :", 20, 84);
  doc.setFont("helvetica", "normal");
  doc.text(currentMonth, 65, 84);

  // 4. Financial Calculation (Reconstruct exact forward ledger math)
  const currentCharges = settings.billingAmount || 200;
  const totalDueBeforePayment = customer.balance + paymentReceived;
  let previousBalanceAndSurcharge = totalDueBeforePayment - currentCharges;
  if (previousBalanceAndSurcharge < 0) previousBalanceAndSurcharge = 0;

  const arrears = previousBalanceAndSurcharge / 1.2;
  const surcharge = arrears > 0 ? arrears * 0.20 : 0;
  const waterPayableCharges = currentCharges + arrears;

  // 5. 5-Row Exact Table Layout Geometry
  const startY = 94;
  const rowHeight = 9.5;
  const colLeft = 20;
  const colRight = 190; // Spans full content width 170mm (20mm to 190mm)
  const verticalLineX = 130; // Description width 110mm, Amount width 60mm
  const totalRows = 6; // 1 header + 5 data rows

  // 6. Watermark (Centered perfectly inside the table boundary)
  const watermarkCenterX = (colLeft + colRight) / 2; // 105mm (exact center of page)
  const watermarkCenterY = startY + (rowHeight * totalRows) / 2; // 122.5mm (exact center of table)

  if (isPaid || customer.balance <= 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(55);
    doc.setTextColor(190, 245, 205); // soft faint pastel green
    doc.text("PAID", watermarkCenterX, watermarkCenterY, { align: 'center', angle: 35 });
  } else if (paymentReceived > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(30);
    doc.setTextColor(254, 240, 190); // soft faint yellow/orange
    doc.text("PARTIAL PAYMENT", watermarkCenterX, watermarkCenterY, { align: 'center', angle: 22 });
  } else {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(55);
    doc.setTextColor(254, 215, 215); // soft faint red/salmon pink matching the reference screenshot
    doc.text("UNPAID", watermarkCenterX, watermarkCenterY, { align: 'center', angle: 35 });
  }

  // Draw Table Outer Rectangle
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.3);
  doc.rect(colLeft, startY, colRight - colLeft, rowHeight * totalRows);

  // Horizontal row dividers
  for (let i = 1; i < totalRows; i++) {
    doc.line(colLeft, startY + (rowHeight * i), colRight, startY + (rowHeight * i));
  }
  // Vertical column divider
  doc.line(verticalLineX, startY, verticalLineX, startY + (rowHeight * totalRows));

  // Table Headers
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(0, 0, 0);
  doc.text("Description", colLeft + 4, startY + 6.5);
  doc.text("Amount (Rs)", verticalLineX + 4, startY + 6.5);

  // Row 1: Water consumption charges for last two months
  doc.setFont("helvetica", "bold");
  doc.text("Water consumption charges for last two months", colLeft + 4, startY + rowHeight + 6.5);
  doc.setFont("helvetica", "normal");
  doc.text(String(Math.round(currentCharges)), verticalLineX + 4, startY + rowHeight + 6.5);

  // Row 2: Water Payable Charges
  doc.setFont("helvetica", "bold");
  doc.text("Water Payable Charges", colLeft + 4, startY + (rowHeight * 2) + 6.5);
  doc.setFont("helvetica", "normal");
  doc.text(String(Math.round(waterPayableCharges)), verticalLineX + 4, startY + (rowHeight * 2) + 6.5);

  // Row 3: Surcharges ( if any )
  doc.setFont("helvetica", "bold");
  doc.text("Surcharges ( if any )", colLeft + 4, startY + (rowHeight * 3) + 6.5);
  doc.setFont("helvetica", "normal");
  doc.text(surcharge > 0 ? surcharge.toFixed(2) : "0.00", verticalLineX + 4, startY + (rowHeight * 3) + 6.5);

  // Row 4: Total Payment Received
  doc.setFont("helvetica", "bold");
  doc.text("Total Payment Received", colLeft + 4, startY + (rowHeight * 4) + 6.5);
  doc.setFont("helvetica", "normal");
  doc.text(paymentReceived > 0 ? paymentReceived.toFixed(2) : "0", verticalLineX + 4, startY + (rowHeight * 4) + 6.5);

  // Row 5: Total Payable
  doc.setFont("helvetica", "bold");
  doc.text("Total Payable", colLeft + 4, startY + (rowHeight * 5) + 6.5);
  doc.setFont("helvetica", "normal");
  const totalPayableStr = (customer.balance <= 0 && isPaid) ? "None" : customer.balance.toFixed(2);
  doc.text(totalPayableStr, verticalLineX + 4, startY + (rowHeight * 5) + 6.5);

  // 7. Bottom Solid Horizontal Divider Line (edge to edge)
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.8);
  doc.line(14, 163, 196, 163);

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
    return { success: false, error: "Customer is suspended. Notifications are disabled for suspended accounts." };
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
      const activeCustomers = customers.filter(c => c.status === 'Active');
      
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
          const newBalance = customer.balance + settings.billingAmount;
          batch.update(doc(db, 'customers', customer.id), {
            balance: newBalance,
            invoiceSent: false,
            paymentNotified: false
          });
          processedCount++;
          totalBilled += settings.billingAmount;

          // If smart notifications are enabled, automatically text them their new bill
          if (automation.smartNotifications && automation.bulkProcessing) {
            try {
              const message = `Dear ${customer.name}, your water bill for the new cycle has been generated. Your amount due is ${newBalance.toFixed(2)}. Please pay by the due date.`;
              const pdfBlob = generateInvoicePDF({ ...customer, balance: newBalance }, updatedSettings);
              sendWhatsAppNotification(customer, message, updatedSettings, pdfBlob, `Bill_${customer.id}.pdf`, true, true, 'billing')
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

      if (processedCount > 0 && auth.currentUser) {
        try {
          await saveBillingAuditLog({
            ownerId: auth.currentUser.uid,
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
    const activeCustomers = customers.filter(c => c.status === 'Active' && c.balance >= settings.billingAmount);
    
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
        batch.update(doc(db, 'customers', customer.id), {
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
    
    if (processedCount > 0 && auth.currentUser) {
      try {
        await saveBillingAuditLog({
          ownerId: auth.currentUser.uid,
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
    const suspendedCustomers = customers.filter(c => c.status === 'Active' && c.balance >= settings.billingAmount);
    
    localStorage.setItem(`automation_penalty_${settings.ownerId || 'sys'}`, now.toISOString());
    let suspendProcessedCount = 0;
    for (let i = 0; i < suspendedCustomers.length; i += 200) {
      const batch = writeBatch(db);
      const chunk = suspendedCustomers.slice(i, i + 200);
      
      for (const customer of chunk) {
         batch.update(doc(db, 'customers', customer.id), { status: 'Suspended' });
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
    
    if (suspendProcessedCount > 0 && auth.currentUser) {
      try {
        await saveBillingAuditLog({
          ownerId: auth.currentUser.uid,
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
  doc.text('Gram Panchayat GP. Jhanda Khurd', 20, 45);
  doc.setFontSize(10);
  doc.text('Office of the Sarpanch', 20, 50);
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
