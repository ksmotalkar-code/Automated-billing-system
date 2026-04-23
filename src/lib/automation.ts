import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Customer, AppSettings, updateCustomer, saveSettings, Report } from './db';
import { db } from '../firebase';
import { collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore';
import { whatsappService } from '../services/whatsappService';
import { createPortalLink } from './portal';

// ...

export const generateInvoicePDF = (customer: Customer, settings: AppSettings) => {
  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(22);
  doc.setTextColor(40, 40, 40);
  doc.text('SMART BILLING INVOICE', 105, 20, { align: 'center' });
  
  doc.setFontSize(10);
  doc.text(`Invoice Date: ${new Date().toLocaleDateString()}`, 105, 30, { align: 'center' });
  
  // Company Info (Mock)
  doc.setFontSize(12);
  doc.text('Punjab Water Management Authority', 20, 45);
  doc.setFontSize(10);
  doc.text('Sector 17, Chandigarh, Punjab', 20, 50);
  doc.text('Email: support@punjabwater.gov.in', 20, 55);
  
  // Customer Info
  doc.setFontSize(12);
  doc.text('BILL TO:', 140, 45);
  doc.setFontSize(10);
  doc.text(customer.name, 140, 50);
  doc.text(`ID: ${customer.id}`, 140, 55);
  doc.text(`Mobile: ${customer.mobileNumber}`, 140, 60);
  
  // Table
  autoTable(doc, {
    startY: 75,
    head: [['Description', 'Cycle', 'Amount (INR)']],
    body: [
      ['Water Usage Charges', `${settings.billingCycleMonths} Months`, settings.billingAmount.toFixed(2)],
      ['Previous Outstanding', '-', (customer.balance - settings.billingAmount).toFixed(2)],
      ['Total Payable', '-', customer.balance.toFixed(2)],
    ],
    theme: 'striped',
    headStyles: { fillColor: [37, 99, 235] },
  });
  
  // Footer
  const finalY = (doc as any).lastAutoTable.finalY + 20;
  doc.setFontSize(12);
  doc.text('Payment Instructions:', 20, finalY);
  doc.setFontSize(10);
  doc.text('1. Please pay via UPI using the QR code in the app.', 20, finalY + 7);
  doc.text('2. Late payments will attract a penalty of INR ' + settings.penaltyAmount, 20, finalY + 12);
  
  doc.setFontSize(14);
  doc.setTextColor(37, 99, 235);
  doc.text(`TOTAL DUE: INR ${customer.balance.toFixed(2)}`, 140, finalY + 10);
  
  
  return doc.output('blob');
};

export const sendWhatsAppNotification = async (
  customer: Customer, 
  message: string, 
  settings: AppSettings, 
  attachment?: Blob, 
  attachmentName?: string,
  isBulkMode?: boolean
): Promise<{ success: boolean; error?: string; fellBackToManual?: boolean }> => {
  if (settings.metaWhatsAppApiKey && settings.metaWhatsAppPhoneNumberId) {
    whatsappService.updateConfig(settings.metaWhatsAppApiKey, settings.metaWhatsAppPhoneNumberId);
  }
  
  let finalMessage = message;
  let usePortalLink = false;

  // Modify logic based on preferred notification method
  if (settings.preferredNotificationMethod === 'manual_link') {
    usePortalLink = true;
  } else if (settings.preferredNotificationMethod === 'api' && !whatsappService.isConfigured()) {
    usePortalLink = true;
  }

  if (usePortalLink) {
    try {
      const portalUrl = await createPortalLink(customer, settings);
      finalMessage = `${message}\n\n📄 View Invoice & Pay Securely:\n${portalUrl}`;
      
      // If we use a portal link, we strip out the binary attachments since manual links can't use them anyway
      attachment = undefined;
      attachmentName = undefined;
    } catch (e) {
      console.warn("Failed to generate portal link", e);
    }
  }

  // 1. Try WhatsApp Web Method
  if (settings.preferredNotificationMethod === 'whatsapp_web') {
    try {
      let mediaBase64: string | undefined = undefined;
      if (attachment) {
        mediaBase64 = await new Promise((resolve, reject) => {
           const reader = new FileReader();
           reader.onloadend = () => resolve(reader.result as string);
           reader.onerror = reject;
           reader.readAsDataURL(attachment);
        });
      }
      
      const res = await fetch('/api/whatsapp-web/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: customer.mobileNumber,
          message: finalMessage,
          mediaBase64,
          mediaName: attachmentName
        })
      });
      const data = await res.json();
      if (data.success) {
        return { success: true };
      } else {
        console.error("WhatsApp Web sending error, attempting fallback...", data.error);
        // Do NOT return here, let it flow to other methods
      }
    } catch (e: any) {
      console.error("WhatsApp Web connection failed, attempting fallback...", e);
      // Do NOT return here, let it flow to other methods
    }
  }
  
  // 2. Try automated API if configured
  if (whatsappService.isConfigured()) {
    const result = await whatsappService.sendMessage({
      to: customer.mobileNumber,
      message: finalMessage,
      attachment,
      attachmentName,
      attachmentType: attachment ? 'application/pdf' : undefined
    });

    if (result.success) {
      console.log(`Automated WhatsApp message sent to ${customer.name}`);
      return { success: true };
    } else {
      console.error(`Automated WhatsApp API failed: ${result.error}.`);
      // If bulk mode and no other options, we might fail here, but let's keep going for manual if not bulk
    }
  }

  // 3. Fallback to manual link if not in bulk mode
  if (!isBulkMode) {
    const url = `https://wa.me/91${customer.mobileNumber}?text=${encodeURIComponent(finalMessage)}`;
    window.open(url, '_blank');
    return { success: true, fellBackToManual: true };
  }
  
  return { success: false, error: usePortalLink ? "Bulk manual notifications disabled. Please enable Meta API for bulk messaging." : "API not configured and manual fallback disabled for bulk mode." };
};

export const runAutomationCycle = async (customers: Customer[], settings: AppSettings) => {
  if (!settings.automation) return;
  const { automation } = settings;
  const now = new Date();
  const lastBilling = settings.lastBillingDate ? new Date(settings.lastBillingDate) : null;
  const lastPenalty = settings.lastPenaltyDate ? new Date(settings.lastPenaltyDate) : null;
  const lastNotification = settings.lastNotificationDate ? new Date(settings.lastNotificationDate) : null;

  let updatedSettings = { ...settings };
  let needsSettingsUpdate = false;

  // 1. Automatic Bill Generation
  const defaultDay = parseInt(settings.defaultBillingDate || '1');
  const isBillingDay = now.getDate() === defaultDay;
  const monthsSinceLastBill = lastBilling ? (now.getTime() - lastBilling.getTime()) / (1000 * 60 * 60 * 24 * 30.44) : 999;
  
  if (automation.scheduledBilling && isBillingDay && monthsSinceLastBill >= settings.billingCycleMonths) {
    console.log("Automated Billing Cycle Triggered on Day:", defaultDay);
    for (const customer of customers) {
      if (customer.status === 'Active') {
        await updateCustomer({ 
          ...customer, 
          balance: customer.balance + settings.billingAmount,
          invoiceSent: false 
        });
      }
    }
    updatedSettings.lastBillingDate = now.toISOString();
    needsSettingsUpdate = true;
  }

  // 2. Automatic Penalty Application
  const daysSinceLastBill = lastBilling ? (now.getTime() - lastBilling.getTime()) / (1000 * 60 * 60 * 24) : 0;
  if (automation.lateFee && daysSinceLastBill >= settings.penaltyDays && (!lastPenalty || lastPenalty < (lastBilling || now))) {
    console.log("Automated Penalty Application Triggered");
    for (const customer of customers) {
      if (customer.status === 'Active' && customer.balance >= settings.billingAmount) {
        await updateCustomer({ ...customer, balance: customer.balance + settings.penaltyAmount });
      }
    }
    updatedSettings.lastPenaltyDate = now.toISOString();
    needsSettingsUpdate = true;
  }

  // 3. Escalation Check
  const escalationDays = settings.escalationDays || 60;
  if (automation.billingLifecycle && automation.ruleBased && daysSinceLastBill >= escalationDays && settings.autoSuspend) {
    console.log("Automated Escalation / Suspension Triggered");
    for (const customer of customers) {
      if (customer.status === 'Active' && customer.balance >= settings.billingAmount) {
         await updateCustomer({ ...customer, status: 'Suspended' });
         
         if (automation.bulkProcessing) {
           const escalationMessage = `FINAL NOTICE: Your account has been SUSPENDED due to an outstanding balance of INR ${customer.balance.toFixed(2)} unpaid for over ${escalationDays} days. Please pay immediately.`;
           const escalationPdf = generateEscalationPDF(customer, settings);
           await sendWhatsAppNotification(customer, escalationMessage, settings, escalationPdf, `Final_Notice_${customer.id}.pdf`, true);
         }
      }
    }
  }

  // 4. Daily Notification Check
  if (automation.smartNotifications) {
      const isNewDay = !lastNotification || new Date(lastNotification).toDateString() !== now.toDateString();
      if (isNewDay) {
        console.log("Daily Notification Flag Set");
        updatedSettings.lastNotificationDate = now.toISOString();
        needsSettingsUpdate = true;
      }
  }

  if (needsSettingsUpdate) {
    await saveSettings(updatedSettings);
  }
};

export const shareReportToCustomers = async (report: Report, customers: Customer[], settings: AppSettings) => {
  if (settings.metaWhatsAppApiKey && settings.metaWhatsAppPhoneNumberId) {
    whatsappService.updateConfig(settings.metaWhatsAppApiKey, settings.metaWhatsAppPhoneNumberId);
  }

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
       true // isBulkMode
     );
  }
};

export const generateEscalationPDF = (customer: Customer, settings: AppSettings) => {
  const doc = new jsPDF();
  
  // Header
  doc.setFontSize(26);
  doc.setTextColor(220, 38, 38); // Red color
  doc.text('FINAL OVERDUE NOTICE', 105, 20, { align: 'center' });
  
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text(`Notice Date: ${new Date().toLocaleDateString()}`, 105, 30, { align: 'center' });
  
  // Company Info
  doc.setFontSize(12);
  doc.text('Trismart ABS Billing Authority', 20, 45);
  doc.setFontSize(10);
  doc.text('Sector 17, Chandigarh, Punjab', 20, 50);
  doc.text('Email: legal@trismartabs.in', 20, 55);
  
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
