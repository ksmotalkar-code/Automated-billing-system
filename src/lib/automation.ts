import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { Customer, AppSettings, updateCustomer, saveSettings, Report, logAutomationError } from './db';
import { db } from '../firebase';
import { collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore';
import { whatsappService } from '../services/whatsappService';
import { createPortalLink } from './portal';

// ...

export const generateInvoicePDF = (customer: Customer, settings: AppSettings) => {
  const doc = new jsPDF({ compress: true });
  
  const isPaid = customer.balance <= 0;

  // Header
  doc.setFontSize(22);
  doc.setTextColor(isPaid ? 34 : 40, isPaid ? 197 : 40, isPaid ? 94 : 40); // green if paid, dark if unpaid
  doc.text(isPaid ? 'PAYMENT RECEIPT' : 'SMART BILLING INVOICE', 105, 20, { align: 'center' });
  
  doc.setFontSize(10);
  doc.setTextColor(100, 100, 100);
  doc.text(`Date: ${new Date().toLocaleDateString()}`, 105, 30, { align: 'center' });

  // Watermark
  doc.setFontSize(60);
  doc.setTextColor(isPaid ? 220 : 255, isPaid ? 255 : 220, isPaid ? 220 : 220); // faint green or red
  doc.text(isPaid ? 'PAID' : 'UNPAID', 105, 150, { align: 'center', angle: -45 });
  
  // Company Info (Mock)
  doc.setFontSize(12);
  doc.setTextColor(40, 40, 40);
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
  const tableData = isPaid ? [
    ['Water Usage Charges', `${settings.billingCycleMonths} Months`, settings.billingAmount.toFixed(2)],
    ['Payment Received', '-', `-${settings.billingAmount.toFixed(2)}`],
    ['Total Payable', '-', '0.00'],
  ] : [
    ['Water Usage Charges', `${settings.billingCycleMonths} Months`, settings.billingAmount.toFixed(2)],
    ['Previous/Late Outstanding', '-', (customer.balance - settings.billingAmount).toFixed(2)],
    ['Total Payable', '-', customer.balance.toFixed(2)],
  ];

  autoTable(doc, {
    startY: 75,
    head: [['Description', 'Cycle', 'Amount (INR)']],
    body: tableData,
    theme: 'striped',
    headStyles: { fillColor: isPaid ? [34, 197, 94] : [37, 99, 235] },
  });
  
  // Footer
  const finalY = (doc as any).lastAutoTable.finalY + 20;
  doc.setFontSize(12);
  if (!isPaid) {
    doc.text('Payment Instructions:', 20, finalY);
    doc.setFontSize(10);
    doc.text('1. Please pay via UPI using the QR code in the app.', 20, finalY + 7);
    doc.text('2. Late payments will attract a penalty of INR ' + settings.penaltyAmount, 20, finalY + 12);
  } else {
    doc.text('Thank you for your timely payment!', 20, finalY);
  }
  
  doc.setFontSize(14);
  doc.setTextColor(isPaid ? 34 : 37, isPaid ? 197 : 99, isPaid ? 94 : 235);
  doc.text(`TOTAL DUE: INR ${isPaid ? '0.00' : customer.balance.toFixed(2)}`, 140, finalY + 10);
  
  
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
      // If bulk mode and no other options, we might fail here, but let's keep going for manual if not bulk
    }
  }

  // 3. Fallback to manual link if not in bulk mode
  if (!isBulkMode) {
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
    
      for (let i = 0; i < activeCustomers.length; i += 200) {
      const batch = writeBatch(db);
      const chunk = activeCustomers.slice(i, i + 200);

      for (const customer of chunk) {
        batch.update(doc(db, 'customers', customer.id), {
          balance: customer.balance + settings.penaltyAmount
        });
        
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
  }

  // 3. Escalation Check
  const escalationDays = settings.escalationDays || 60;
  if (automation.billingLifecycle && automation.ruleBased && daysSinceLastBill >= escalationDays && settings.autoSuspend) {
    console.log("Automated Escalation / Suspension Triggered");
    const suspendedCustomers = customers.filter(c => c.status === 'Active' && c.balance >= settings.billingAmount);
    
    localStorage.setItem(`automation_penalty_${settings.ownerId || 'sys'}`, now.toISOString());
    for (let i = 0; i < suspendedCustomers.length; i += 200) {
      const batch = writeBatch(db);
      const chunk = suspendedCustomers.slice(i, i + 200);
      
      for (const customer of chunk) {
         batch.update(doc(db, 'customers', customer.id), { status: 'Suspended' });
         
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
