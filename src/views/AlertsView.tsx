import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { BellRing, CheckCircle, AlertCircle, MessageCircle, Send } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { subscribeToCustomers, Customer, subscribeToSettings, AppSettings, updateCustomer } from "../lib/db";
import { sendWhatsAppNotification } from "../lib/automation";
import { base64ToBlob } from "../lib/utils";

export function AlertsView() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isSendingBulk, setIsSendingBulk] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);

  useEffect(() => {
    const unsubCustomers = subscribeToCustomers(setCustomers);
    const unsubSettings = subscribeToSettings(setSettings);
    return () => {
      unsubCustomers();
      unsubSettings();
    };
  }, []);

  const [viewMode, setViewMode] = useState<'all' | 'paid' | 'paid_notified' | 'unpaid'>('all');

  if (!settings) return null;

  const paidCustomers = customers.filter(c => c.balance === 0 && !c.paymentNotified);
  const paidNotifiedCustomers = customers.filter(c => c.balance === 0 && c.paymentNotified);
  const unpaidCustomers = customers.filter(c => c.balance > 0);

  const displayedCustomers = viewMode === 'paid' ? paidCustomers : viewMode === 'paid_notified' ? paidNotifiedCustomers : viewMode === 'unpaid' ? unpaidCustomers : customers;

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  const handleSendWhatsApp = async (customer: Customer, isPaid: boolean) => {
    let message = "";
    let attachment: Blob | undefined = undefined;
    
    if (isPaid) {
      if (customer.paymentNotified) return; // Skip if already notified
      message = `Dear ${customer.name}, thank you for your payment! Your account is now clear. We appreciate your promptness.`;
    } else {
      const penaltyAmount = customer.balance >= settings.billingAmount ? settings.penaltyAmount : 0;
      const totalAmount = customer.balance + penaltyAmount;
      message = `Dear ${customer.name}, your water bill of ${formatCurrency(totalAmount)} is pending (including late fees if applicable). Please pay immediately to avoid service disconnection.`;
      
      // Attach QR code if available
      if (settings.upiQrCodeImage) {
        try {
          attachment = base64ToBlob(settings.upiQrCodeImage);
        } catch (e) {
          console.error("Failed to convert QR code to blob", e);
        }
      }
    }
    const result = await sendWhatsAppNotification(customer, message, settings, attachment, attachment ? 'payment_qr.png' : undefined, false);
    
    if (!result.success) {
      alert(`Could not notify ${customer.name}: ${result.error}`);
      return;
    }

    if (isPaid) {
      await updateCustomer({ ...customer, paymentNotified: true });
    }
  };

  const handleNotifyAllPaid = async () => {
    if (paidCustomers.length === 0) return;
    
    if (confirm(`Are you sure you want to notify all ${paidCustomers.length} paid customers?`)) {
      setIsSendingBulk(true);
      setBulkProgress(0);
      
      let errors = [];
      for (let i = 0; i < paidCustomers.length; i++) {
        const customer = paidCustomers[i];
        const message = `Dear ${customer.name}, thank you for your payment! Your account is now clear. We appreciate your promptness.`;

        const result = await sendWhatsAppNotification(customer, message, settings, undefined, undefined, true);
        if (result.success) {
           await updateCustomer({ ...customer, paymentNotified: true });
        } else {
           errors.push(`${customer.name}: ${result.error}`);
        }
        
        setBulkProgress(Math.floor(((i + 1) / paidCustomers.length) * 100));
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      setIsSendingBulk(false);
      if (errors.length > 0) {
         alert(`Completed with some errors:\n\n${errors.join('\n')}\n\nNote: Make sure recipients are in your Meta Developer allowed list if using a test number.`);
      } else {
         alert("All paid customers have been notified!");
      }
    }
  };

  const handleNotifyAllUnpaid = async () => {
    if (unpaidCustomers.length === 0) return;
    
    if (confirm(`Are you sure you want to notify all ${unpaidCustomers.length} unpaid customers?`)) {
      setIsSendingBulk(true);
      setBulkProgress(0);
      
      let errors = [];
      for (let i = 0; i < unpaidCustomers.length; i++) {
        const customer = unpaidCustomers[i];
        const penaltyAmount = customer.balance >= settings.billingAmount ? settings.penaltyAmount : 0;
        const totalAmount = customer.balance + penaltyAmount;
        const message = `Dear ${customer.name}, your water bill of ${formatCurrency(totalAmount)} is pending. Please pay immediately to avoid service disconnection.`;
        
        let attachment: Blob | undefined = undefined;
        if (settings.upiQrCodeImage) {
          try {
            attachment = base64ToBlob(settings.upiQrCodeImage);
          } catch (e) {
            console.error("Failed to convert QR code to blob", e);
          }
        }

        const result = await sendWhatsAppNotification(customer, message, settings, attachment, attachment ? 'payment_qr.png' : undefined, true);
        if (!result.success) {
           errors.push(`${customer.name}: ${result.error}`);
        }
        
        setBulkProgress(Math.floor(((i + 1) / unpaidCustomers.length) * 100));
        
        // Small delay to prevent rate limits
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
      
      setIsSendingBulk(false);
      if (errors.length > 0) {
         alert(`Completed with some errors:\n\n${errors.join('\n')}\n\nNote: If using a Meta test number, recipients must be in your allowed list.`);
      } else {
         alert("All unpaid customers have been notified!");
      }
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Alerts & Notifications</h2>
          <p className="neu-text-muted">Monitor payments and send reminders</p>
        </div>
        {unpaidCustomers.length > 0 && viewMode === 'unpaid' && (
          <div className="flex items-center gap-3">
            <button 
              onClick={handleNotifyAllUnpaid}
              disabled={isSendingBulk}
              className="px-4 py-2 bg-rose-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-rose-500/30 hover:bg-rose-700 transition-colors disabled:opacity-70 flex items-center gap-2"
            >
              {isSendingBulk ? (
                <>
                  <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                  Notifying... {bulkProgress}%
                </>
              ) : (
                <>
                  <Send className="w-4 h-4" /> Notify All Unpaid
                </>
              )}
            </button>
          </div>
        )}
        {(viewMode === 'paid' || viewMode === 'paid_notified') && (
          <div className="flex items-center gap-3">
            <button 
              onClick={() => setViewMode(viewMode === 'paid' ? 'paid_notified' : 'paid')}
              className="px-4 py-2 neu-flat text-emerald-600 rounded-xl text-sm font-bold hover:bg-emerald-500/10 transition-colors"
            >
              {viewMode === 'paid' ? 'Show Sent Messages' : 'Back to Pending Notifications'}
            </button>
            {paidCustomers.length > 0 && viewMode === 'paid' && (
              <button 
                onClick={handleNotifyAllPaid}
                disabled={isSendingBulk}
                className="px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/30 hover:bg-emerald-700 transition-colors disabled:opacity-70 flex items-center gap-2"
              >
                {isSendingBulk ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    Notifying... {bulkProgress}%
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" /> Notify All Paid
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <motion.div 
          whileHover={{ scale: 1.05, y: -5 }} 
          whileTap={{ scale: 0.95 }}
          onClick={() => setViewMode('paid')}
        >
          <Card className="bg-emerald-500/10 border-emerald-500/20 cursor-pointer hover:bg-emerald-500/20 transition-all shadow-lg hover:shadow-emerald-500/20">
            <CardContent className="p-6 flex items-center gap-4">
              <motion.div 
                whileHover={{ rotate: 360 }}
                transition={{ duration: 0.5 }}
                className="p-4 bg-emerald-500/20 rounded-2xl text-emerald-600"
              >
                <CheckCircle className="w-8 h-8" />
              </motion.div>
              <div>
                <p className="text-sm font-bold text-emerald-600/80 uppercase tracking-wider">Paid Customers</p>
                <h3 className="text-3xl font-black text-emerald-700">{paidCustomers.length}</h3>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div 
          whileHover={{ scale: 1.05, y: -5 }} 
          whileTap={{ scale: 0.95 }}
          onClick={() => setViewMode('unpaid')}
        >
          <Card className="bg-rose-500/10 border-rose-500/20 cursor-pointer hover:bg-rose-500/20 transition-all shadow-lg hover:shadow-rose-500/20">
            <CardContent className="p-6 flex items-center gap-4">
              <motion.div 
                whileHover={{ rotate: 360 }}
                transition={{ duration: 0.5 }}
                className="p-4 bg-rose-500/20 rounded-2xl text-rose-600"
              >
                <AlertCircle className="w-8 h-8" />
              </motion.div>
              <div>
                <p className="text-sm font-bold text-rose-600/80 uppercase tracking-wider">Unpaid Customers</p>
                <h3 className="text-3xl font-black text-rose-700">{unpaidCustomers.length}</h3>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        
        <motion.div 
          whileHover={{ scale: 1.05, y: -5 }} 
          whileTap={{ scale: 0.95 }}
          onClick={() => setViewMode('all')}
        >
          <Card className="bg-blue-500/10 border-blue-500/20 cursor-pointer hover:bg-blue-500/20 transition-all shadow-lg hover:shadow-blue-500/20">
            <CardContent className="p-6 flex items-center gap-4">
              <motion.div 
                whileHover={{ rotate: 360 }}
                transition={{ duration: 0.5 }}
                className="p-4 bg-blue-500/20 rounded-2xl text-blue-600"
              >
                <BellRing className="w-8 h-8" />
              </motion.div>
              <div>
                <p className="text-sm font-bold text-blue-600/80 uppercase tracking-wider">Total Pending</p>
                <h3 className="text-3xl font-black text-blue-700">
                  {formatCurrency(unpaidCustomers.reduce((acc, c) => acc + c.balance, 0))}
                </h3>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            {viewMode === 'paid' ? 'Paid (Notification Pending)' : 
             viewMode === 'paid_notified' ? 'Paid & Notified' : 
             viewMode === 'unpaid' ? 'Unpaid Customers' : 'All Customers'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase neu-text-muted border-b border-[var(--shadow-dark)]">
                <tr>
                  <th className="px-4 py-3">Customer</th>
                  <th className="px-4 py-3">Mobile</th>
                  <th className="px-4 py-3 text-right">Outstanding</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Action</th>
                </tr>
              </thead>
              <tbody>
                {displayedCustomers.map((customer, i) => {
                  const isPaid = customer.balance === 0;
                  return (
                    <motion.tr 
                      key={customer.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: i * 0.01 }}
                      className="border-b border-[var(--shadow-dark)] last:border-0 hover:bg-black/5 transition-colors"
                    >
                      <td className="px-4 py-4">
                        <p className="font-bold">{customer.name}</p>
                        <p className="text-xs neu-text-muted">{customer.id}</p>
                      </td>
                      <td className="px-4 py-4 text-neu-text-muted">{customer.mobileNumber}</td>
                      <td className="px-4 py-4 text-right font-medium text-rose-600">
                        {formatCurrency(customer.balance)}
                      </td>
                      <td className="px-4 py-4 text-center">
                        {isPaid ? (
                          <span className={`px-2 py-1 rounded-full text-xs font-bold ${customer.paymentNotified ? 'bg-blue-100 text-blue-700' : 'bg-emerald-100 text-emerald-700'}`}>
                            {customer.paymentNotified ? 'Paid & Notified' : 'Paid'}
                          </span>
                        ) : (
                          <span className="px-2 py-1 bg-rose-100 text-rose-700 rounded-full text-xs font-bold">Unpaid</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-center">
                        {(!isPaid || !customer.paymentNotified) && (
                          <button 
                            onClick={() => handleSendWhatsApp(customer, isPaid)}
                            className={`px-3 py-2 text-white rounded-xl text-xs font-bold shadow-lg transition-colors inline-flex items-center gap-2 ${
                              isPaid ? 'bg-[#25D366] shadow-[#25D366]/30 hover:bg-[#1ebd5a]' : 'bg-rose-600 shadow-rose-500/30 hover:bg-rose-700'
                            }`}
                          >
                            <MessageCircle className="w-4 h-4" /> Notify
                          </button>
                        )}
                      </td>
                    </motion.tr>
                  );
                })}
                {displayedCustomers.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center neu-text-muted">
                      No customers found in this category.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}
