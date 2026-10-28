import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Customer, AppSettings, updateCustomer, saveSettings, Report, logAutomationError, saveBillingAuditLog, WhatsAppTemplate, getWhatsAppTemplates } from './db';
import { db, auth } from '../firebase';
import { collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore';
import { whatsappService } from '../services/whatsappService';
import { createPortalLink } from './portal';
import { DEFAULT_VWSC_LOGO_BASE64 } from './sealLogo';
import { isQuotaExceeded } from './db';
import { authFetchJson } from './api';

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
    const currentCharges = typeof settings.billingAmount === 'number' ? settings.billingAmount : (settings.billingAmount !== undefined && settings.billingAmount !== null && !isNaN(Number(settings.billingAmount)) ? Number(settings.billingAmount) : 200);
    const arrears = customer.balance > currentCharges ? customer.balance - currentCharges : 0;
    const penaltyAmt = typeof settings.penaltyAmount === 'number' ? settings.penaltyAmount : (Number(settings.penaltyAmount) || 0);
    const isLateFeeEnabled = settings.lateFee !== false && (settings.lateFee === true || (settings as any).automation?.lateFee === true) && penaltyAmt > 0;
    const surcharge = (arrears > 0 && isLateFeeEnabled) ? penaltyAmt : 0;
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
    (Number(settings.penaltyAmount) > 0 && settings.lateFee !== false)
      ? `If this bill is not paid by the due date, a late fee surcharge of Rs. ${(Number(settings.penaltyAmount) || 0).toFixed(2)} will be levied, and if payment is not made within ${settings.penaltyDays || 10} days after the due date, the connection will be disconnected without any notice.`
      : `If payment is not made within ${settings.penaltyDays || 10} days after the due date, the connection will be disconnected without any notice.`,
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
  templateCategory?: 'billing' | 'receipt' | 'broadcast' | 'welcome' | 'overdue' | 'suspension' | 'complaint' | 'custom',
  templateParams?: any[],
  customTemplateName?: string
): Promise<{ success: boolean; error?: string; fellBackToManual?: boolean }> => {
  try {
    if (templateCategory !== 'broadcast' && (customer.status === 'Suspended' || (customer.status as string) === 'Inactive')) {
      return { success: false, error: `Customer status is "${customer.status}". Automated notifications are disabled for inactive accounts.` };
    }
    if (!customer.mobileNumber || customer.mobileNumber.replace(/\D/g, '').length < 10) {
      console.warn(`Customer ${customer.name} has missing or invalid mobile number, skipping automation.`);
      return { success: false, error: "Missing or invalid mobile number (at least 10 digits required)" };
    }

    if (!settings) {
      console.error("[sendWhatsAppNotification] Settings are missing.");
      return { success: false, error: "Settings are missing." };
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
  } else if (whatsappService.isConfigured()) {
    usePortalLink = false; // Send direct PDF document attachment via API
  } else {
    usePortalLink = true;
  }

  usePortalLink = usePortalLink && includePortalLink;

  // Extract clean message without greeting for template variable mapping
  let cleanMsg = message;
  if (customer && customer.name) {
    if (cleanMsg.startsWith(`Dear ${customer.name}, `)) {
      cleanMsg = cleanMsg.slice(`Dear ${customer.name}, `.length);
    } else if (cleanMsg.startsWith(`Hi ${customer.name}, `)) {
      cleanMsg = cleanMsg.slice(`Hi ${customer.name}, `.length);
    }
  }

  // Load templates from Firestore collection
  let firestoreTemplates: WhatsAppTemplate[] = [];
  try {
    firestoreTemplates = await getWhatsAppTemplates(settings.ownerId || auth.currentUser?.uid);
  } catch (err) {
    // Graceful fallback to settings
  }

  // First priority: Check Firestore templates collection
  let matchedFirestoreTemplate: WhatsAppTemplate | undefined = undefined;
  if (customTemplateName) {
    matchedFirestoreTemplate = firestoreTemplates.find(t => t.templateName === customTemplateName || t.id === customTemplateName);
  }
  if (!matchedFirestoreTemplate && templateCategory) {
    matchedFirestoreTemplate = firestoreTemplates.find(t => t.category === templateCategory && t.isDefault && t.isActive)
      || firestoreTemplates.find(t => t.category === templateCategory && t.isActive)
      || firestoreTemplates.find(t => t.category === templateCategory);
  }

  // Determine Template Name
  let templateName = customTemplateName || matchedFirestoreTemplate?.templateName;
  if (!templateName) {
    if (templateCategory === 'billing') templateName = settings.metaTemplateBilling;
    else if (templateCategory === 'receipt') templateName = settings.metaTemplateReceipt;
    else if (templateCategory === 'broadcast') templateName = settings.metaTemplateBroadcast;
    else if (templateCategory === 'welcome') templateName = settings.metaTemplateWelcome;
    else if (templateCategory === 'overdue') templateName = settings.metaTemplateOverdue;
    else if (templateCategory === 'suspension') templateName = settings.metaTemplateSuspension;
    else if (templateCategory === 'complaint') templateName = settings.metaTemplateComplaint;
    else if (templateCategory === 'custom') templateName = settings.metaTemplateCustom;
  }

  // Fallback to Template Registry (metaCustomTemplates) if category template not set
  if ((!templateName || templateName.trim() === '') && settings.metaCustomTemplates && templateCategory) {
    const cat = templateCategory.toLowerCase();
    const matched = settings.metaCustomTemplates.find(t => {
      const tName = (t.templateName || '').toLowerCase();
      const tId = (t.id || '').toLowerCase();
      if (tId === `def_${cat}` || tId === cat || tName === cat) return true;
      if (cat === 'welcome' && (tName.includes('welcome') || tName.includes('join') || tId.includes('welcome'))) return true;
      if (cat === 'receipt' && (tName.includes('receipt') || tName.includes('payment') || tId.includes('receipt'))) return true;
      if (cat === 'billing' && (tName.includes('bill') || tId.includes('bill'))) return true;
      if (cat === 'broadcast' && (tName.includes('broadcast') || tName.includes('notice') || tName.includes('announcement') || tId.includes('broadcast'))) return true;
      if (cat === 'overdue' && (tName.includes('overdue') || tName.includes('due') || tId.includes('overdue'))) return true;
      if (cat === 'suspension' && (tName.includes('suspen') || tName.includes('disconnect') || tId.includes('suspension'))) return true;
      if (cat === 'complaint' && (tName.includes('complain') || tName.includes('ticket') || tName.includes('issue') || tId.includes('complaint'))) return true;
      return false;
    });
    if (matched?.templateName) {
      templateName = matched.templateName.trim();
    }
  }

  // Final default template names by category if still missing
  if (!templateName || templateName.trim() === '') {
    if (templateCategory === 'welcome') templateName = 'welcome';
    else if (templateCategory === 'broadcast') templateName = settings.metaCustomTemplates?.[0]?.templateName || 'broadcast';
    else if (templateCategory === 'receipt') templateName = 'receipt';
    else if (templateCategory === 'billing') templateName = 'billing';
    else if (templateCategory === 'complaint') templateName = 'complaint_resolved';
  }

  // Look for custom parameters mapping in Firestore template or Settings Registry
  let dynamicParamsResolved = false;
  let paramKeys: string[] = [];

  if (matchedFirestoreTemplate) {
    if (matchedFirestoreTemplate.parameterMappings && matchedFirestoreTemplate.parameterMappings.length > 0) {
      paramKeys = matchedFirestoreTemplate.parameterMappings.map(m => m.key);
    } else if (matchedFirestoreTemplate.parameters !== undefined) {
      paramKeys = matchedFirestoreTemplate.parameters ? matchedFirestoreTemplate.parameters.split(',').map(s => s.trim()).filter(Boolean) : [];
    } else if (matchedFirestoreTemplate.bodyText) {
      const matches = matchedFirestoreTemplate.bodyText.match(/\{\{(\d+)\}\}/g) || [];
      paramKeys = matches.map((_, idx) => idx === 0 ? 'customer_name' : (idx === 1 ? 'message' : `param_${idx + 1}`));
    }
    // If the matched template explicitly defines 0 parameters (static text template like freeflow_3)
    if (paramKeys.length === 0) {
      templateParams = [];
      dynamicParamsResolved = true;
    }
  }

  if (paramKeys.length === 0 && !dynamicParamsResolved && templateName && settings.metaCustomTemplates) {
    let matchedConfig = settings.metaCustomTemplates.find(t => t.templateName === templateName);
    if (!matchedConfig && templateCategory) {
      // Fallback matching by default template category IDs or names
      matchedConfig = settings.metaCustomTemplates.find(t => 
        t.id === `def_${templateCategory}` || 
        t.id === `def_metaTemplate${templateCategory.charAt(0).toUpperCase() + templateCategory.slice(1)}`
      );
    }
    if (matchedConfig && typeof matchedConfig.parameters === 'string') {
      const rawParamStr = matchedConfig.parameters.trim();
      if (rawParamStr === '') {
        // Explicitly 0 parameters defined for static template
        templateParams = [];
        dynamicParamsResolved = true;
      } else {
        paramKeys = rawParamStr.split(',').map(s => s.trim()).filter(Boolean);
      }
    }
  }

  // Only apply 2-variable broadcast fallback if no specific Firestore/custom template was resolved
  if (!matchedFirestoreTemplate && !dynamicParamsResolved && templateCategory === 'broadcast' && paramKeys.length === 0) {
    paramKeys = ['customer_name', 'message'];
  }

  if (paramKeys.length > 0) {
        templateParams = paramKeys.map(key => {
          const lowerKey = key.toLowerCase();
          if (lowerKey === 'customer_name' || lowerKey === 'name' || lowerKey === 'customer') {
            return customer.name;
          }
          if (lowerKey === 'customer_id' || lowerKey === 'id' || lowerKey === 'account_no') {
            return customer.id;
          }
          if (lowerKey === 'customer_balance' || lowerKey === 'balance') {
            return String(customer.balance ?? 0);
          }
          if (lowerKey === 'billing_amount' || lowerKey === 'amount' || lowerKey === 'bill_amount') {
            return String(settings.billingAmount || 200);
          }
          if (lowerKey === 'new_balance' || lowerKey === 'total_balance') {
            return String((customer.balance || 0) + (settings.billingAmount || 200));
          }
          if (lowerKey === 'payment_amount' || lowerKey === 'paid_amount') {
            return String((customer as any).lastPaymentAmount || customer.balance || settings.billingAmount || 200);
          }
          if (lowerKey === 'overdue_amount' || lowerKey === 'pending_amount') {
            return String((customer.balance || 0) + (settings.penaltyAmount || 50));
          }
          if (lowerKey === 'penalty_amount' || lowerKey === 'late_fee') {
            return String(settings.penaltyAmount || 50);
          }
          if (lowerKey === 'date' || lowerKey === 'today' || lowerKey === 'due_date') {
            return new Date().toLocaleDateString('en-GB');
          }
          if (lowerKey === 'portal_link' || lowerKey === 'button_param' || lowerKey === 'button') {
            return { isButtonParam: true, value: customer.id, index: '0' };
          }
          if (
            lowerKey === 'message' || 
            lowerKey === 'broadcast_message' || 
            lowerKey === 'custom_message' || 
            lowerKey === 'announcement' || 
            lowerKey === 'notice' || 
            lowerKey === 'details' || 
            lowerKey === 'text' || 
            lowerKey === 'body' || 
            lowerKey === 'content' || 
            lowerKey === 'msg' || 
            lowerKey === 'reason' || 
            lowerKey === 'info' || 
            lowerKey === 'var2' || 
            lowerKey === '2' || 
            lowerKey === '{{2}}'
          ) {
            return cleanMsg;
          }
          if (lowerKey === '1' || lowerKey === '{{1}}' || lowerKey === 'var1') {
            return paramKeys.length > 1 ? customer.name : cleanMsg;
          }
          return key;
        });
        dynamicParamsResolved = true;
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
        if (templateCategory === 'welcome') {
          templateParams.push(customer.name);
        } else if (templateCategory === 'broadcast' || templateCategory === 'custom') {
          // Send customer name and clean message without button param
          templateParams.push(customer.name);
          templateParams.push(cleanMsg);
        } else if (templateCategory === 'billing') {
          templateParams.push(customer.name);
          templateParams.push(settings.billingAmount || 200);
          templateParams.push(customer.balance || 0);
          templateParams.push(new Date().toLocaleDateString('en-GB'));
        } else if (templateCategory === 'receipt') {
          templateParams.push(customer.name);
          templateParams.push(String((customer as any).lastPaymentAmount ?? settings.billingAmount ?? 200));
          templateParams.push(String(customer.balance ?? 0));
        } else {
          templateParams.push(customer.name);
        }
      }
   }
  
  // 2. Try automated API if configured
  const shouldTryApi = whatsappService.isConfigured() || settings.preferredNotificationMethod === 'api' || settings.preferredNotificationMethod === 'wati' || Boolean(settings.metaWhatsAppApiKey) || Boolean(settings.watiAccessToken);

  if (shouldTryApi && settings.preferredNotificationMethod !== 'manual_link') {
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
      console.warn(`Automated WhatsApp API status: ${result.error}.`);
      // If single message dispatch fails and manual fallback is permitted, attempt manual wa.me link
      if (!isBulkMode && (result.fellBackToManual || settings.preferredNotificationMethod === 'hybrid')) {
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
        let popupOpened = false;
        if (typeof window !== 'undefined' && window.open) {
          try {
            const win = window.open(url, '_blank');
            if (win && !win.closed) {
              popupOpened = true;
            }
          } catch (e) {
            console.warn("window.open failed:", e);
          }
        }
        if (popupOpened) {
          return { success: true, fellBackToManual: true };
        } else {
          return { 
            success: false, 
            error: `Automated dispatch failed (${result.error || 'Network connection error'}). Pop-up was blocked. Click to open manual WhatsApp: ${url}`, 
            fellBackToManual: true 
          };
        }
      }
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
  } catch (notificationErr: any) {
    console.warn(`[sendWhatsAppNotification] Notification delivery failed for ${customer?.name}:`, notificationErr?.message || notificationErr);
    return {
      success: false,
      error: notificationErr?.message || "Failed to deliver WhatsApp message due to a network or service issue.",
      fellBackToManual: true
    };
  }
};

export const runAutomationCycle = async (_customers: Customer[], settings: AppSettings) => {
  if (!settings.automation) return;
  if ((window as any)._automationRunning) return;
  
  if (isQuotaExceeded()) {
    console.log("Automation skipped: Quota Limit Exceeded");
    return;
  }

  (window as any)._automationRunning = true;

  try {
    console.log("[Client Automation] Delegating daily automation check to authoritative server engine...");
    await authFetchJson('/api/cron/daily', {
      method: 'POST',
      body: JSON.stringify({ ownerId: settings.ownerId || auth.currentUser?.uid }),
    });
  } catch (err) {
    console.warn("[Client Automation] Server automation trigger warning:", err);
  } finally {
    setTimeout(() => { (window as any)._automationRunning = false; }, 300000); // 5 min client cooldown
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
