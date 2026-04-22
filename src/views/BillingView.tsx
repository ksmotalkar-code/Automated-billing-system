import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { FileText, Search, Play, Download, MessageCircle, Settings, X, Upload, CheckCircle2, AlertTriangle, Send } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { subscribeToCustomers, Customer, subscribeToSettings, saveSettings, AppSettings, updateCustomer } from "../lib/db";
import { useTranslation } from "react-i18next";
import { generateInvoicePDF, sendWhatsAppNotification, generateEscalationPDF, runAutomationCycle } from "../lib/automation";
import { ConfirmModal } from "../components/ConfirmModal";

export function BillingView() {
  const { t } = useTranslation();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 100;

  const [settings, setSettings] = useState<AppSettings>({ 
    upiQrCodeImage: null,
    billingAmount: 200,
    billingCycleMonths: 2,
    penaltyAmount: 40,
    penaltyDays: 10
  });
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isInvoiceModalOpen, setIsInvoiceModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isSendingBulk, setIsSendingBulk] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [showPaidAndSent, setShowPaidAndSent] = useState(false);
  const [sortConfig, setSortConfig] = useState<{ key: string; direction: 'asc' | 'desc' } | null>(null);

  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    isDestructive: boolean;
    showCancel: boolean;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
    isDestructive: false,
    showCancel: true
  });

  const showAlert = (title: string, message: string) => {
    setConfirmConfig({
      isOpen: true,
      title,
      message,
      onConfirm: () => {},
      showCancel: false,
      isDestructive: false
    });
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const unsubCustomers = subscribeToCustomers(setCustomers);
    const unsubSettings = subscribeToSettings((s) => {
      if (s) setSettings(s);
    });
    return () => {
      unsubCustomers();
      unsubSettings();
    };
  }, []);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const handleSort = (key: string) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const getMockStatus = (customer: Customer) => {
    if (customer.balance === 0) {
      return customer.invoiceSent ? "Paid & Notified" : "Paid";
    }
    if (customer.balance > settings.billingAmount) return "Overdue";
    return "Pending";
  };

  const filteredCustomers = customers.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         c.id.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (!matchesSearch) return false;

    const status = getMockStatus(c);
    if (status === "Paid & Notified" && !showPaidAndSent) {
      return false; // hide Paid & Notified if toggle is off
    }
    return true;
  });

  const sortedCustomers = [...filteredCustomers].sort((a, b) => {
    if (!sortConfig) return 0;
    const { key, direction } = sortConfig;
    
    let valA: any = a[key as keyof Customer];
    let valB: any = b[key as keyof Customer];

    if (key === 'status') {
      valA = getMockStatus(a);
      valB = getMockStatus(b);
    }

    if (valA < valB) return direction === 'asc' ? -1 : 1;
    if (valA > valB) return direction === 'asc' ? 1 : -1;
    return 0;
  });

  const totalPages = Math.ceil(sortedCustomers.length / itemsPerPage);
  const paginatedCustomers = sortedCustomers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  const SortIcon = ({ column }: { column: string }) => {
    if (sortConfig?.key !== column) return <span className="ml-1 opacity-30">↕</span>;
    return sortConfig.direction === 'asc' ? <span className="ml-1 text-blue-600">↑</span> : <span className="ml-1 text-blue-600">↓</span>;
  };

  const currentMonth = new Date().toLocaleString('default', { month: 'short', year: 'numeric' });
  
  // Calculate due date based on settings
  const dueDate = new Date();
  dueDate.setDate(settings.penaltyDays || 10);
  const formattedDueDate = dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  const getInvoiceId = (customerId: string) => {
    return `INV-${new Date().getFullYear()}-${customerId.replace('CUST-', '').substring(0, 4)}`;
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64String = reader.result as string;
        const newSettings = { ...settings, upiQrCodeImage: base64String };
        setSettings(newSettings);
        saveSettings(newSettings);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleSendWhatsApp = async (customer: Customer) => {
    const message = `Dear ${customer.name}, your water bill for ${currentMonth} has been PAID. Thank you for your promptness! Attached is your official invoice.`;
    
    // Generate PDF
    const pdfBlob = generateInvoicePDF(customer, settings);
    
    // Open WhatsApp (Automated if API configured, else manual)
    const result = await sendWhatsAppNotification(customer, message, settings, pdfBlob, `Invoice_${customer.id}.pdf`, false);
    
    if (!result.success) {
       showAlert("Sending Failed", `Could not send notification: ${result.error}`);
    } else {
       // Mark as sent
       await updateCustomer({ ...customer, invoiceSent: true, paymentNotified: true });
       showAlert("Success", "Notification sent successfully!");
    }
  };

  const promptResendNotification = (customer: Customer) => {
    setConfirmConfig({
      isOpen: true,
      title: "Resend Notification",
      message: `Are you sure you want to resend the payment confirmation to ${customer.name}? This will perform a manual send.`,
      isDestructive: false,
      showCancel: true,
      onConfirm: async () => {
        await handleSendWhatsApp(customer);
      }
    });
  };

  const handleDownloadPDF = (customer: Customer) => {
    const pdfBlob = generateInvoicePDF(customer, settings);
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Invoice_${customer.id}_${currentMonth}.pdf`;
    link.click();
  };

  const handleDownloadEscalationPDF = (customer: Customer) => {
    const pdfBlob = generateEscalationPDF(customer, settings);
    const url = URL.createObjectURL(pdfBlob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `FINAL_NOTICE_${customer.id}.pdf`;
    link.click();
  };

  const handleSendMonthlyPaidBills = () => {
    const paidCustomers = customers.filter(c => getMockStatus(c) === "Paid");
    if (paidCustomers.length === 0) {
      showAlert("No Pending Invoices", "No customers currently need a paid bill receipt sent.");
      return;
    }

    setConfirmConfig({
      isOpen: true,
      title: "Send Bulk WhatsApp Invoices",
      message: `Send authentic PDF invoices to all ${paidCustomers.length} newly paid customers via WhatsApp?`,
      isDestructive: false,
      showCancel: true,
      onConfirm: async () => {
        setIsSendingBulk(true);
        setBulkProgress(0);
        
        let errors = [];
        for (let i = 0; i < paidCustomers.length; i++) {
          const customer = paidCustomers[i];
          const message = `Dear ${customer.name}, your water bill for ${currentMonth} has been PAID. Thank you for your promptness! Attached is your official invoice.`;
          
          // Generate PDF for attachment
          const pdfBlob = generateInvoicePDF(customer, settings);
          
          const result = await sendWhatsAppNotification(customer, message, settings, pdfBlob, `Invoice_${customer.id}.pdf`, true);
          if (result.success) {
            await updateCustomer({ ...customer, invoiceSent: true, paymentNotified: true });
          } else {
            errors.push(`${customer.name}: ${result.error}`);
          }
          
          setBulkProgress(Math.floor(((i + 1) / paidCustomers.length) * 100));
          await new Promise(resolve => setTimeout(resolve, 1500)); // Delay to avoid WhatsApp rate limits
        }
        
        setIsSendingBulk(false);
        if (errors.length > 0) {
          showAlert("Completed with Errors", `Some customers couldn't be notified:\n\n${errors.join('\n')}`);
        } else {
          showAlert("Success", "WhatsApp notifications queued and statuses updated!");
        }

        // Ensure automated system keeps running after clicking sent monthly bills
        try {
          await runAutomationCycle(customers, settings);
        } catch (e) {
          console.error("Failed to run automation cycle post-dispatch", e);
        }
      }
    });
  };

  const runBillingCycle = () => {
    setConfirmConfig({
      isOpen: true,
      title: "Run Billing Cycle",
      message: `Are you sure you want to generate bills of ${formatCurrency(settings.billingAmount)} for all active customers?`,
      isDestructive: false,
      showCancel: true,
      onConfirm: async () => {
        for (const customer of customers) {
          if (customer.status === 'Active') {
            await updateCustomer({ 
              ...customer, 
              balance: customer.balance + settings.billingAmount,
              invoiceSent: false
            });
          }
        }
        showAlert("Success", "Billing cycle completed successfully!");
      }
    });
  };

  const applyPenalties = () => {
    setConfirmConfig({
      isOpen: true,
      title: "Apply Penalties",
      message: `Are you sure you want to apply a penalty of ${formatCurrency(settings.penaltyAmount)} to all overdue customers?`,
      isDestructive: true,
      showCancel: true,
      onConfirm: async () => {
        for (const customer of customers) {
          if (customer.status === 'Active' && customer.balance >= settings.billingAmount) {
            await updateCustomer({ ...customer, balance: customer.balance + settings.penaltyAmount });
          }
        }
        showAlert("Success", "Penalties applied successfully!");
      }
    });
  };

  const openInvoice = (customer: Customer) => {
    setSelectedCustomer(customer);
    setIsInvoiceModalOpen(true);
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('Invoices')}</h2>
          <p className="neu-text-muted">{t('Manage Invoices')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-2 mr-4 px-3 py-1.5 neu-pressed rounded-xl">
            <span className="text-xs font-bold uppercase tracking-wider neu-text-muted">Show Sent</span>
            <button 
              onClick={() => setShowPaidAndSent(!showPaidAndSent)}
              className={`w-10 h-5 rounded-full transition-colors relative ${showPaidAndSent ? 'bg-blue-600' : 'bg-gray-300'}`}
            >
              <div className={`absolute top-1 w-3 h-3 bg-white rounded-full transition-all ${showPaidAndSent ? 'left-6' : 'left-1'}`} />
            </button>
          </div>
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={runBillingCycle}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/30"
          >
            <Play className="w-4 h-4" /> Run Billing Cycle
          </motion.button>
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={applyPenalties}
            className="flex items-center gap-2 px-4 py-2 bg-rose-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-rose-500/30"
          >
            <AlertTriangle className="w-4 h-4" /> Apply Penalties
          </motion.button>
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => setIsSettingsModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2 neu-flat rounded-xl text-sm font-bold"
          >
            <Settings className="w-4 h-4" /> Configure UPI QR
          </motion.button>
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleSendMonthlyPaidBills}
            disabled={isSendingBulk}
            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/30 disabled:opacity-70"
          >
            {isSendingBulk ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                Sending... {bulkProgress}%
              </span>
            ) : (
              <>
                <Send className="w-4 h-4" /> Send Monthly WhatsApp Bill (Paid)
              </>
            )}
          </motion.button>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          <div className="flex items-center gap-2 px-3 py-2 neu-pressed rounded-xl w-full max-w-sm">
            <Search className="w-4 h-4 neu-text-muted" />
            <input 
              type="text" 
              placeholder={t('Search')} 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none text-sm w-full neu-text"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase neu-text-muted border-b border-[var(--shadow-dark)]">
                <tr>
                  <th className="px-4 py-3 cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('id')}>
                    Invoice ID <SortIcon column="id" />
                  </th>
                  <th className="px-4 py-3 cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('name')}>
                    {t('Name')} <SortIcon column="name" />
                  </th>
                  <th className="px-4 py-3">Period</th>
                  <th className="px-4 py-3 cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('balance')}>
                    Amount <SortIcon column="balance" />
                  </th>
                  <th className="px-4 py-3 cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('status')}>
                    {t('Status')} <SortIcon column="status" />
                  </th>
                  <th className="px-4 py-3">Due Date</th>
                  <th className="px-4 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedCustomers.map((customer, i) => {
                  const status = getMockStatus(customer);
                  return (
                    <motion.tr 
                      key={customer.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.01 }}
                      whileHover={{ x: 5, backgroundColor: "rgba(255, 255, 255, 0.05)" }}
                      className="border-b border-[var(--shadow-dark)] last:border-0 hover:bg-black/5 transition-colors cursor-pointer"
                      onClick={() => openInvoice(customer)}
                    >
                      <td className="px-4 py-4 font-medium flex items-center gap-2">
                        <FileText className="w-4 h-4 text-blue-500" /> {getInvoiceId(customer.id)}
                      </td>
                      <td className="px-4 py-4">{customer.name}</td>
                      <td className="px-4 py-4">{currentMonth}</td>
                      <td className="px-4 py-4 font-medium">{formatCurrency(customer.balance)}</td>
                      <td className="px-4 py-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                          customer.status === 'Suspended' ? 'bg-red-200 text-red-900 border border-red-500 font-bold tracking-wider' :
                          status === 'Paid' ? 'bg-emerald-100 text-emerald-700' : 
                          status === 'Paid & Notified' ? 'bg-blue-100 text-blue-700' :
                          status === 'Overdue' ? 'bg-red-100 text-red-700' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {customer.status === 'Suspended' ? 'SUSPENDED' : status}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-xs neu-text-muted">{formattedDueDate}</td>
                      <td className="px-4 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-2">
                          <button 
                            onClick={() => {
                              if (status === 'Paid & Notified') {
                                promptResendNotification(customer);
                              } else {
                                handleSendWhatsApp(customer);
                              }
                            }}
                            className="p-1.5 bg-emerald-100 text-emerald-700 hover:bg-emerald-200 rounded-lg transition-colors" 
                            title={status === 'Paid & Notified' ? "Resend WhatsApp Notification" : "Send WhatsApp"}
                          >
                            <MessageCircle className="w-4 h-4" />
                          </button>
                          
                          {customer.status === 'Suspended' ? (
                             <button 
                               onClick={(e) => { e.stopPropagation(); handleDownloadEscalationPDF(customer); }}
                               className="p-1.5 bg-red-100 text-red-700 hover:bg-red-200 rounded-lg transition-colors border border-red-200" 
                               title="Download Final Notice"
                             >
                               <AlertTriangle className="w-4 h-4" />
                             </button>
                          ) : (
                             <button 
                               onClick={(e) => { e.stopPropagation(); handleDownloadPDF(customer); }}
                               className="p-1.5 hover:bg-black/10 rounded-lg transition-colors" 
                               title="Download PDF"
                             >
                               <Download className="w-4 h-4 neu-text-muted" />
                             </button>
                          )}
                        </div>
                      </td>
                    </motion.tr>
                  );
                })}
                {filteredCustomers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center neu-text-muted">
                      No invoices found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            
            {/* Pagination Controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-4 border-t border-[var(--shadow-dark)]">
                <span className="text-sm neu-text-muted">
                  Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredCustomers.length)} of {filteredCustomers.length} invoices
                </span>
                <div className="flex gap-2">
                  <button 
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-3 py-1 neu-flat rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                  >
                    Previous
                  </button>
                  <div className="px-3 py-1 text-sm font-medium flex items-center">
                    Page {currentPage} of {totalPages}
                  </div>
                  <button 
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1 neu-flat rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
                  >
                    Next
                  </button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Settings Modal for UPI QR */}
      <AnimatePresence>
        {isSettingsModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-[var(--bg-color)] rounded-2xl shadow-2xl border border-[var(--shadow-light)] overflow-hidden"
            >
              <div className="flex items-center justify-between p-4 border-b border-[var(--shadow-dark)]">
                <h3 className="text-lg font-bold">Configure UPI QR Code</h3>
                <button 
                  onClick={() => setIsSettingsModalOpen(false)}
                  className="p-1 rounded-full hover:bg-black/10 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-6 space-y-6">
                <p className="text-sm neu-text-muted">
                  Upload your official UPI QR code image here. This image will be displayed on all customer invoices for easy payments.
                </p>

                <div className="flex flex-col items-center justify-center space-y-4">
                  {settings.upiQrCodeImage ? (
                    <div className="relative group">
                      <img 
                        src={settings.upiQrCodeImage} 
                        alt="UPI QR Code" 
                        className="w-48 h-48 object-contain border-4 border-white shadow-lg rounded-xl"
                      />
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity rounded-xl flex items-center justify-center">
                        <button 
                          onClick={() => fileInputRef.current?.click()}
                          className="px-4 py-2 bg-white text-black rounded-lg text-sm font-bold shadow-lg"
                        >
                          Change Image
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button 
                      onClick={() => fileInputRef.current?.click()}
                      className="w-48 h-48 flex flex-col items-center justify-center gap-2 neu-pressed rounded-xl border-2 border-dashed border-[var(--shadow-dark)] hover:border-blue-500 transition-colors"
                    >
                      <Upload className="w-8 h-8 text-blue-500" />
                      <span className="text-sm font-medium text-blue-500">Upload QR Code</span>
                    </button>
                  )}
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={handleImageUpload} 
                    accept="image/*" 
                    className="hidden" 
                  />
                </div>

                <div className="flex justify-end gap-3 pt-4 border-t border-[var(--shadow-dark)]">
                  <button 
                    onClick={() => setIsSettingsModalOpen(false)}
                    className="px-4 py-2 neu-flat rounded-xl font-bold"
                  >
                    Done
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Invoice Modal */}
      <AnimatePresence>
        {isInvoiceModalOpen && selectedCustomer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, y: 50 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 50 }}
              className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl overflow-hidden my-8"
            >
              {/* Invoice Header */}
              <div className="bg-slate-50 p-6 sm:p-8 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                <div>
                  <h1 className="text-3xl font-black text-slate-900 tracking-tight">INVOICE</h1>
                  <p className="text-slate-500 font-medium mt-1">Smart Water Billing System</p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-sm font-bold text-slate-400 uppercase tracking-wider">Invoice Number</p>
                  <p className="text-lg font-bold text-slate-900">{getInvoiceId(selectedCustomer.id)}</p>
                  <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mt-2">Date of Issue</p>
                  <p className="text-md font-medium text-slate-900">{new Date().toLocaleDateString('en-IN')}</p>
                </div>
              </div>

              {/* Invoice Body */}
              <div className="p-6 sm:p-8 space-y-8">
                <div className="flex flex-col sm:flex-row justify-between gap-8">
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">Billed To</p>
                    <h3 className="text-xl font-bold text-slate-900">{selectedCustomer.name}</h3>
                    <p className="text-slate-600 mt-1">Customer ID: {selectedCustomer.id}</p>
                    <p className="text-slate-600">Mobile: +91 {selectedCustomer.mobileNumber}</p>
                  </div>
                  <div className="bg-slate-50 p-4 rounded-xl border border-slate-100 min-w-[200px]">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">Amount Due</p>
                    <p className="text-3xl font-black text-rose-600">{formatCurrency(selectedCustomer.balance)}</p>
                    <p className="text-sm font-medium text-slate-500 mt-1">Due by {formattedDueDate}</p>
                  </div>
                </div>

                {/* Line Items */}
                <div className="border border-slate-200 rounded-xl overflow-hidden">
                  <table className="w-full text-left text-sm">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-bold uppercase tracking-wider text-xs">
                      <tr>
                        <th className="px-4 py-3">Description</th>
                        <th className="px-4 py-3 text-right">Amount</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      <tr>
                        <td className="px-4 py-4">
                          <p className="font-bold text-slate-900">Water Consumption</p>
                          <p className="text-slate-500 text-xs mt-1">Billing Period: {settings.billingCycleMonths} Months</p>
                        </td>
                        <td className="px-4 py-4 text-right font-medium text-slate-900">
                          {formatCurrency(selectedCustomer.balance > 0 ? settings.billingAmount : 0)}
                        </td>
                      </tr>
                      {selectedCustomer.balance > settings.billingAmount && (
                        <tr>
                          <td className="px-4 py-4">
                            <p className="font-bold text-slate-900 text-rose-600">Late Payment Penalty</p>
                            <p className="text-slate-500 text-xs mt-1">Applied after {settings.penaltyDays} days</p>
                          </td>
                          <td className="px-4 py-4 text-right font-medium text-rose-600">
                            {formatCurrency(selectedCustomer.balance - settings.billingAmount)}
                          </td>
                        </tr>
                      )}
                    </tbody>
                    <tfoot className="bg-slate-50 border-t border-slate-200">
                      <tr>
                        <td className="px-4 py-4 font-bold text-slate-900 text-right">Total Amount</td>
                        <td className="px-4 py-4 font-black text-slate-900 text-right text-lg">
                          {formatCurrency(selectedCustomer.balance)}
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>

                {/* Payment Section */}
                <div className="flex flex-col sm:flex-row items-center gap-6 bg-blue-50/50 p-6 rounded-xl border border-blue-100">
                  <div className="flex-1 space-y-2">
                    <h4 className="font-bold text-blue-900 flex items-center gap-2">
                      <CheckCircle2 className="w-5 h-5 text-blue-600" /> Payment Instructions
                    </h4>
                    <p className="text-sm text-blue-800/80 leading-relaxed">
                      Please scan the QR code to make your payment via any UPI app (GPay, PhonePe, Paytm). 
                      Ensure you verify the receiver name before proceeding.
                    </p>
                  </div>
                  <div className="shrink-0 bg-white p-2 rounded-xl shadow-sm border border-blue-100">
                    {settings.upiQrCodeImage ? (
                      <img 
                        src={settings.upiQrCodeImage} 
                        alt="UPI QR Code" 
                        className="w-32 h-32 object-contain"
                      />
                    ) : (
                      <div className="w-32 h-32 flex flex-col items-center justify-center bg-slate-50 border border-dashed border-slate-300 rounded-lg text-center p-2">
                        <p className="text-xs text-slate-500 font-medium">No QR Code Configured</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Invoice Footer / Actions */}
              <div className="bg-slate-50 p-4 border-t border-slate-200 flex justify-end gap-3">
                <button 
                  onClick={() => setIsInvoiceModalOpen(false)}
                  className="px-4 py-2 text-slate-600 font-bold hover:bg-slate-200 rounded-xl transition-colors"
                >
                  Close
                </button>
                <button 
                  onClick={async () => {
                     await handleSendWhatsApp(selectedCustomer);
                     setIsInvoiceModalOpen(false);
                  }}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-bold shadow-lg shadow-emerald-500/30 hover:bg-emerald-700 transition-colors flex items-center gap-2"
                >
                  <MessageCircle className="w-4 h-4" /> Notify
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        onClose={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
        onConfirm={confirmConfig.onConfirm}
        title={confirmConfig.title}
        message={confirmConfig.message}
        isDestructive={confirmConfig.isDestructive}
        showCancel={confirmConfig.showCancel}
      />
    </motion.div>
  );
}
