import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { CreditCard, Search, Plus, MoreVertical, X, QrCode, CheckCircle2, Image as ImageIcon, Check, XCircle, Loader2, Banknote, RefreshCw, Smartphone } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Customer, AppSettings, updateCustomer, addTransaction, updateReceiptStatus } from "../lib/db";
import { useData } from "../contexts/DataContext";
import { PaymentReceipt } from "../lib/portal";
import { useTranslation } from "react-i18next";
import { ConfirmModal } from "../components/ConfirmModal";
import { sendWhatsAppNotification, generateInvoicePDF } from "../lib/automation";
import { writeBatch, doc } from "firebase/firestore";
import { db, auth } from "../firebase";
import { v4 as uuidv4 } from "uuid";

export function PaymentsView() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'pending' | 'list'>('pending');
  const { customers, settings, pendingReceipts } = useData();
  const [searchQuery, setSearchQuery] = useState("");
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<PaymentReceipt | null>(null);
  const [isReceiptModalOpen, setIsReceiptModalOpen] = useState(false);
  const [paymentAmount, setPaymentAmount] = useState<string>("");
  const [paymentMode, setPaymentMode] = useState<'cash' | 'upi'>('cash');
  const [transactionId, setTransactionId] = useState<string>("");
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [isBulkConfirmModalOpen, setIsBulkConfirmModalOpen] = useState(false);
  const [bulkTransactionId, setBulkTransactionId] = useState("");
  const [sortConfig, setSortConfig] = useState<{ key: keyof Customer; direction: 'asc' | 'desc' } | null>(null);
  const deliveryModeRef = useRef("api");
  
  const [isConfirming, setIsConfirming] = useState(false);
  const [isActioningReceipt, setIsActioningReceipt] = useState<string | null>(null);

  const generateCashReceiptId = () => {
    const timestamp = Date.now().toString().slice(-6);
    return `CASH-${timestamp}`;
  };

  const [confirmConfig, setConfirmConfig] = useState<{
    isOpen: boolean;
    title: string;
    message: string;
    onConfirm: () => void;
    showCancel: boolean;
  }>({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
    showCancel: true
  });

  const showAlert = (title: string, message: string) => {
    setConfirmConfig({
      isOpen: true,
      title,
      message,
      onConfirm: () => {},
      showCancel: false
    });
  };

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 100;

  // Reset to first page when search query changes
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  const handleSort = (key: keyof Customer) => {
    let direction: 'asc' | 'desc' = 'asc';
    if (sortConfig && sortConfig.key === key && sortConfig.direction === 'asc') {
      direction = 'desc';
    }
    setSortConfig({ key, direction });
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  const filteredCustomers = customers.filter(c => {
    const searchTerms = searchQuery.toLowerCase().split(' ').filter(term => term.trim() !== '');
    const searchStr = `${c.name} ${c.id} ${c.mobileNumber} ${c.status || ''}`.toLowerCase();
    return searchTerms.length === 0 || searchTerms.every(term => searchStr.includes(term));
  });

  const sortedCustomers = [...filteredCustomers].sort((a, b) => {
    if (!sortConfig) return 0;
    const { key, direction } = sortConfig;
    if (a[key]! < b[key]!) return direction === 'asc' ? -1 : 1;
    if (a[key]! > b[key]!) return direction === 'asc' ? 1 : -1;
    return 0;
  });

  const totalPages = Math.ceil(sortedCustomers.length / itemsPerPage);
  const paginatedCustomers = sortedCustomers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const handleOpenPayment = (customer: Customer) => {
    setSelectedCustomer(customer);
    const initialAmount = customer.balance > 0 ? customer.balance.toString() : "0";
    setPaymentAmount(initialAmount);
    setPaymentMode('cash');
    setTransactionId(generateCashReceiptId());
    setIsPaymentModalOpen(true);
  };

  const handleConfirmPayment = async () => {
    if (!selectedCustomer) return;
    
    const amount = parseFloat(paymentAmount);
    if (isNaN(amount) || amount <= 0) {
      showAlert("Invalid Amount", "Please enter a valid payment amount greater than ₹0.");
      return;
    }

    if (!transactionId.trim()) {
      showAlert("Missing ID", "Please enter a Transaction ID or Cash Receipt Number.");
      return;
    }

    setIsConfirming(true);
    try {
      // Calculate updated balance
      const newBalance = Math.max(0, selectedCustomer.balance - amount);
      const updatedCustomer = {
        ...selectedCustomer,
        balance: newBalance
      };
      
      await updateCustomer(updatedCustomer);

      // Save transaction
      await addTransaction({
        customerId: selectedCustomer.id,
        amount: amount,
        transactionId: transactionId.trim()
      });

      setIsPaymentModalOpen(false);
      const paymentStatusText = newBalance === 0 
        ? "fully settled with zero remaining balance" 
        : `recorded with remaining balance of ${formatCurrency(newBalance)}`;
      showAlert("Payment Recorded", `Payment of ${formatCurrency(amount)} (${paymentMode === 'cash' ? 'Cash at Counter' : 'UPI/Online'}) processed successfully! The customer's account is ${paymentStatusText}.`);

      // Automatically send invoice or receipt if enabled
      if (settings.automation?.smartNotifications) {
        if (newBalance === 0) {
          const message = `Dear ${updatedCustomer.name}, your water bill payment of ${formatCurrency(amount)} has been received and fully SETTLED. Thank you! Attached is your official receipt.`;
          const pdfBlob = generateInvoicePDF(updatedCustomer, settings, true, amount);
          await updateCustomer({ ...updatedCustomer, invoiceSent: true, paymentNotified: true });
          sendWhatsAppNotification(updatedCustomer, message, settings, pdfBlob, `Receipt_${updatedCustomer.id}.pdf`, false, true, 'receipt').catch(err => console.error("Auto notify error:", err));
        } else {
          const message = `Dear ${updatedCustomer.name}, we have received your payment of ${formatCurrency(amount)}. Your remaining balance is ${formatCurrency(newBalance)}. Attached is your updated receipt.`;
          const pdfBlob = generateInvoicePDF(updatedCustomer, settings, true, amount);
          sendWhatsAppNotification(updatedCustomer, message, settings, pdfBlob, `Receipt_${updatedCustomer.id}.pdf`, false, true, 'receipt').catch(err => console.error("Auto notify error:", err));
        }
      } else if (newBalance === 0) {
        await updateCustomer({ ...updatedCustomer, invoiceSent: true, paymentNotified: false });
      }
    } catch (error) {
      console.error("Payment confirmation error:", error);
      showAlert("Error", "Failed to confirm payment. Please check your connection and try again.");
    } finally {
      setIsConfirming(false);
    }
  };

  const handleBulkConfirm = async () => {
    if (selectedCustomerIds.length === 0) return;
    if (!bulkTransactionId.trim()) {
      showAlert("Missing ID", "Please enter a Transaction ID for the batch.");
      return;
    }

    const customersToUpdate = customers.filter(c => selectedCustomerIds.includes(c.id) && c.balance > 0);
    
    if (customersToUpdate.length === 0) {
      showAlert("No Outstanding Balance", "No customers with outstanding balance selected.");
      return;
    }

    setIsConfirming(true);
    try {
      const isApiMode = deliveryModeRef.current === "api";
      const tempSettings = { ...settings, metaWhatsAppApiKey: isApiMode ? settings.metaWhatsAppApiKey : "" };

      const chunkedCustomers = [];
      const chunkSize = 200; // Safe batch limit
      for (let i = 0; i < customersToUpdate.length; i += chunkSize) {
          chunkedCustomers.push(customersToUpdate.slice(i, i + chunkSize));
      }

      for (const chunk of chunkedCustomers) {
          const batch = writeBatch(db);
          for (const customer of chunk) {
              const amount = customer.balance;
              const updatedCustomer = { ...customer, balance: 0, invoiceSent: true, paymentNotified: true };
              
              // Direct batch update to avoid updateCustomer queries
              batch.update(doc(db, 'customers', customer.id), updatedCustomer);

              const txnId = `TXN-${uuidv4().substring(0, 8).toUpperCase()}`;
              batch.set(doc(db, 'transactions', txnId), {
                id: txnId,
                customerId: customer.id,
                amount: amount,
                transactionId: bulkTransactionId.trim(),
                date: new Date().toISOString(),
                ownerId: auth.currentUser?.uid || ''
              });

              // Background auto-notify for bulk manual payments
              if (settings.automation?.smartNotifications) {
                const message = `Dear ${updatedCustomer.name}, your bill of ${formatCurrency(amount)} has been completely PAID. Thank you for your promptness! Attached is your official invoice.`;
                const pdfBlob = generateInvoicePDF(updatedCustomer, settings, true, amount);
                sendWhatsAppNotification(updatedCustomer, message, tempSettings, pdfBlob, `Invoice_${updatedCustomer.id}.pdf`, isApiMode, true, 'receipt').catch(err => console.error("Auto notify error:", err));
              }
          }
          await batch.commit();
          await new Promise(resolve => setTimeout(resolve, 800)); // Sleep between batches
      }

      setSelectedCustomerIds([]);
      setBulkTransactionId("");
      setIsBulkConfirmModalOpen(false);
      showAlert("Bulk Success", `Bulk payment confirmed for ${customersToUpdate.length} customers!`);
    } catch (error) {
      console.error("Bulk payment error:", error);
      showAlert("Partial Failure", "Failed to process bulk payments. Some records may not have updated.");
    } finally {
      setIsConfirming(false);
    }
  };

  const handleApproveReceipt = async (receipt: PaymentReceipt) => {
    const customer = customers.find(c => c.id === receipt.customerId);
    if (!customer) {
      showAlert("Error", "Customer not found for this receipt.");
      return;
    }

    setIsActioningReceipt(`${receipt.id}-approve`);
    try {
      const updatedCustomer = {
        ...customer,
        balance: Math.max(0, customer.balance - receipt.amount)
      };
      
      await updateCustomer(updatedCustomer);

      await addTransaction({
        customerId: customer.id,
        amount: receipt.amount,
        transactionId: `REC-${receipt.id.substring(0, 8).toUpperCase()}`
      });

      await updateReceiptStatus(receipt.id, 'Approved');
      
      setIsReceiptModalOpen(false);
      setSelectedReceipt(null);
      showAlert("Approved", `Receipt approved and payment of ${formatCurrency(receipt.amount)} recorded.`);

      if (updatedCustomer.balance === 0) {
        const message = `Dear ${updatedCustomer.name}, your payment screenshot has been verified and your bill is now fully PAID. Attached is your official invoice.`;
        const pdfBlob = generateInvoicePDF(updatedCustomer, settings, true, receipt.amount);
        await updateCustomer({ ...updatedCustomer, invoiceSent: true, paymentNotified: true });
        sendWhatsAppNotification(updatedCustomer, message, settings, pdfBlob, `Invoice_${updatedCustomer.id}.pdf`, false, true, 'receipt').catch(err => console.error("Auto notify error:", err));
      } else {
        const message = `Dear ${updatedCustomer.name}, your payment screenshot has been verified for a partial payment of ${formatCurrency(receipt.amount)}. Your remaining balance is ${formatCurrency(updatedCustomer.balance)}. Attached is your updated invoice.`;
        const pdfBlob = generateInvoicePDF(updatedCustomer, settings, true, receipt.amount);
        sendWhatsAppNotification(updatedCustomer, message, settings, pdfBlob, `Invoice_${updatedCustomer.id}.pdf`, false, true, 'receipt').catch(err => console.error("Auto notify error:", err));
      }
    } catch (error) {
      console.error("Error approving receipt:", error);
      showAlert("Error", "Failed to approve receipt.");
    } finally {
      setIsActioningReceipt(null);
    }
  };

  const handleRejectReceipt = async (receiptId: string) => {
    setIsActioningReceipt(`${receiptId}-reject`);
    try {
      await updateReceiptStatus(receiptId, 'Rejected');
      setIsReceiptModalOpen(false);
      setSelectedReceipt(null);
    } catch (error) {
      console.error("Error rejecting receipt:", error);
      showAlert("Error", "Failed to reject receipt.");
    } finally {
      setIsActioningReceipt(null);
    }
  };

  const toggleSelectAll = () => {
    if (selectedCustomerIds.length === paginatedCustomers.length) {
      setSelectedCustomerIds([]);
    } else {
      setSelectedCustomerIds(paginatedCustomers.map(c => c.id));
    }
  };

  const toggleSelectCustomer = (id: string) => {
    if (selectedCustomerIds.includes(id)) {
      setSelectedCustomerIds(selectedCustomerIds.filter(i => i !== id));
    } else {
      setSelectedCustomerIds([...selectedCustomerIds, id]);
    }
  };

  const SortIcon = ({ column }: { column: keyof Customer }) => {
    if (sortConfig?.key !== column) return <span className="ml-1 opacity-30">↕</span>;
    return sortConfig.direction === 'asc' ? <span className="ml-1 text-blue-600">↑</span> : <span className="ml-1 text-blue-600">↓</span>;
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
          <h2 className="text-2xl font-bold tracking-tight">{t('Payments')}</h2>
          <p className="neu-text-muted">Process payments and confirm transactions</p>
        </div>
        {selectedCustomerIds.length > 0 && activeTab === 'list' && (
          <motion.button
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            onClick={() => setIsBulkConfirmModalOpen(true)}
            className="flex items-center gap-2 px-6 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/30"
          >
            <CheckCircle2 className="w-4 h-4" /> Confirm {selectedCustomerIds.length} Payments
          </motion.button>
        )}
      </div>

      <div className="flex bg-[var(--bg-color)] p-1 rounded-xl w-full max-w-sm border border-[var(--shadow-light)]">
        <button
          onClick={() => setActiveTab('pending')}
          className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
            activeTab === 'pending' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <ImageIcon className="w-4 h-4" /> Pending Approvals 
          {pendingReceipts.length > 0 && (
            <span className="bg-rose-500 text-white text-[10px] px-2 py-0.5 rounded-full">{pendingReceipts.length}</span>
          )}
        </button>
        <button
          onClick={() => setActiveTab('list')}
          className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${
            activeTab === 'list' ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <CreditCard className="w-4 h-4" /> Receivables
        </button>
      </div>

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
          {activeTab === 'list' && (
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
          )}
          {activeTab === 'pending' && (
            <CardTitle className="text-sm font-medium neu-text-muted uppercase tracking-widest">
              Awaiting Verification
            </CardTitle>
          )}
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            {activeTab === 'pending' ? (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {pendingReceipts.length === 0 ? (
                  <div className="col-span-full py-12 text-center flex flex-col items-center justify-center">
                    <CheckCircle2 className="w-12 h-12 text-emerald-400 mb-4 opacity-50" />
                    <p className="text-lg font-medium text-slate-500">All caught up!</p>
                    <p className="text-sm text-slate-400">No pending receipts to approve.</p>
                  </div>
                ) : (
                  pendingReceipts.map(receipt => (
                    <motion.div 
                      key={receipt.id}
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="bg-white p-4 rounded-2xl border border-blue-100 shadow-sm hover:shadow-md transition-all flex flex-col"
                    >
                      <div className="flex justify-between items-start mb-4 gap-4">
                        <div>
                          <p className="font-bold text-slate-900 line-clamp-1">{receipt.customerName}</p>
                          <p className="text-xs text-slate-500">ID: {receipt.customerId}</p>
                          <p className="text-xs text-slate-400 mt-1">{new Date(receipt.submittedAt).toLocaleString()}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-black text-rose-600 leading-none">{formatCurrency(receipt.amount)}</p>
                          <p className="text-[10px] uppercase font-bold text-slate-400 mt-1">Claimed Paid</p>
                        </div>
                      </div>
                      <div 
                        onClick={() => {
                          setSelectedReceipt(receipt);
                          setIsReceiptModalOpen(true);
                        }}
                        className="w-full h-40 bg-slate-100 rounded-xl mb-4 overflow-hidden cursor-pointer relative group flex items-center justify-center border border-slate-200"
                      >
                        <img 
                          src={receipt.base64Image} 
                          alt="Payment Receipt" 
                          className="w-full h-full object-cover transition-transform group-hover:scale-105"
                        />
                        <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                          <span className="text-white font-bold text-sm bg-black/50 px-3 py-1 rounded-lg flex items-center gap-2">
                            <ImageIcon className="w-4 h-4" /> View Full Image
                          </span>
                        </div>
                      </div>
                      <div className="flex gap-2 mt-auto">
                        <button 
                          onClick={() => handleRejectReceipt(receipt.id)}
                          disabled={isActioningReceipt !== null}
                          className="flex-1 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg text-sm font-bold transition-colors flex justify-center items-center gap-1 disabled:opacity-50"
                        >
                          {isActioningReceipt === `${receipt.id}-reject` ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />}
                          {isActioningReceipt === `${receipt.id}-reject` ? 'Rejecting...' : 'Reject'}
                        </button>
                        <button 
                          onClick={() => handleApproveReceipt(receipt)}
                          disabled={isActioningReceipt !== null}
                          className="flex-1 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-sm font-bold shadow-md shadow-emerald-500/20 transition-colors flex justify-center items-center gap-1 disabled:opacity-50"
                        >
                          {isActioningReceipt === `${receipt.id}-approve` ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                          {isActioningReceipt === `${receipt.id}-approve` ? 'Approving...' : 'Approve'}
                        </button>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            ) : (
              <>
              <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase neu-text-muted border-b border-[var(--shadow-dark)]">
                <tr>
                  <th className="px-4 py-3 w-10">
                    <input 
                      type="checkbox" 
                      checked={selectedCustomerIds.length === paginatedCustomers.length && paginatedCustomers.length > 0}
                      onChange={toggleSelectAll}
                      className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-4 py-3 cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('id')}>
                    Customer ID <SortIcon column="id" />
                  </th>
                  <th className="px-4 py-3 cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('name')}>
                    {t('Name')} <SortIcon column="name" />
                  </th>
                  <th className="px-4 py-3 cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('mobileNumber')}>
                    Mobile <SortIcon column="mobileNumber" />
                  </th>
                  <th className="px-4 py-3 cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('balance')}>
                    Outstanding Balance <SortIcon column="balance" />
                  </th>
                  <th className="px-4 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {paginatedCustomers.map((customer, i) => (
                  <motion.tr 
                    key={customer.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.01 }}
                    whileHover={{ x: 5, backgroundColor: "rgba(255, 255, 255, 0.05)" }}
                    className={`border-b border-[var(--shadow-dark)] last:border-0 hover:bg-black/5 transition-colors ${selectedCustomerIds.includes(customer.id) ? 'bg-blue-50/30' : ''}`}
                  >
                    <td className="px-4 py-4">
                      <input 
                        type="checkbox" 
                        checked={selectedCustomerIds.includes(customer.id)}
                        onChange={() => toggleSelectCustomer(customer.id)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                    </td>
                    <td className="px-4 py-4 font-medium flex items-center gap-2">
                      <CreditCard className="w-4 h-4 text-emerald-500" /> {customer.id}
                    </td>
                    <td className="px-4 py-4 font-medium">{customer.name}</td>
                    <td className="px-4 py-4 text-neu-text-muted">{customer.mobileNumber}</td>
                    <td className="px-4 py-4 font-bold text-rose-600">{formatCurrency(customer.balance)}</td>
                    <td className="px-4 py-4 text-right">
                      <button 
                        onClick={() => handleOpenPayment(customer)}
                        className="px-3 py-1.5 bg-emerald-600 text-white rounded-lg text-xs font-bold shadow-md shadow-emerald-500/20 hover:bg-emerald-700 transition-colors flex items-center gap-1 ml-auto"
                      >
                        <QrCode className="w-3 h-3" /> Receive Payment
                      </button>
                    </td>
                  </motion.tr>
                ))}
                {filteredCustomers.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-8 text-center neu-text-muted">
                      No customers found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
            
            {/* Pagination Controls */}
            {activeTab === 'list' && totalPages > 1 && (
              <div className="flex items-center justify-between px-4 py-4 border-t border-[var(--shadow-dark)]">
                <span className="text-sm neu-text-muted">
                  Showing {(currentPage - 1) * itemsPerPage + 1} to {Math.min(currentPage * itemsPerPage, filteredCustomers.length)} of {filteredCustomers.length} customers
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
            </>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Bulk Confirm Modal */}
      <AnimatePresence>
        {isBulkConfirmModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md bg-[var(--bg-color)] rounded-2xl shadow-2xl border border-[var(--shadow-light)] p-6"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-bold">Bulk Payment Confirmation</h3>
                <button 
                  onClick={() => setIsBulkConfirmModalOpen(false)}
                  className="p-1 rounded-full hover:bg-black/10 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <p className="text-sm neu-text-muted">
                  You are about to confirm payments for <span className="font-bold text-neu-text">{selectedCustomerIds.length}</span> selected customers. All their outstanding balances will be cleared.
                </p>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider neu-text-muted ml-1">
                    Batch Transaction ID / UTR
                  </label>
                  <input
                    type="text"
                    value={bulkTransactionId}
                    onChange={(e) => setBulkTransactionId(e.target.value)}
                    className="w-full px-4 py-3 neu-pressed rounded-xl bg-transparent outline-none text-sm font-medium"
                    placeholder="Enter transaction ID for this batch..."
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider neu-text-muted ml-1">Delivery Method</label>
                  <select 
                    className="w-full px-3 py-2 bg-[var(--bg-color)] border border-[var(--shadow-light)] rounded-lg text-sm"
                    onChange={(e) => deliveryModeRef.current = e.target.value}
                    defaultValue="api"
                  >
                    <option value="api">WhatsApp Cloud API (Automated)</option>
                    <option value="web">WhatsApp Web (Manual Prompts - Slow)</option>
                  </select>
                </div>

                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => setIsBulkConfirmModalOpen(false)}
                    className="flex-1 py-3 neu-flat rounded-xl font-bold"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleBulkConfirm}
                    disabled={isConfirming}
                    className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold shadow-lg shadow-emerald-500/30 hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-70"
                  >
                    {isConfirming ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                    {isConfirming ? "Confirming..." : "Confirm All"}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Payment QR Modal */}
      <AnimatePresence>
        {isPaymentModalOpen && selectedCustomer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-lg bg-[var(--bg-color)] rounded-2xl shadow-2xl border border-[var(--shadow-light)] overflow-hidden my-6"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-4 sm:p-5 border-b border-[var(--shadow-dark)]">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-emerald-500/10 text-emerald-600 rounded-lg">
                    <CreditCard className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="text-base sm:text-lg font-bold">Receive Payment</h3>
                    <p className="text-xs neu-text-muted">Gram Panchayat Water Billing Collection</p>
                  </div>
                </div>
                <button 
                  onClick={() => setIsPaymentModalOpen(false)}
                  className="p-1.5 rounded-full hover:bg-black/10 transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
              
              <div className="p-4 sm:p-6 space-y-5 max-h-[82vh] overflow-y-auto">
                {/* Customer Snapshot */}
                <div className="p-3.5 neu-pressed rounded-xl flex items-center justify-between">
                  <div>
                    <p className="text-xs neu-text-muted font-medium">Customer Account</p>
                    <p className="font-bold text-base">{selectedCustomer.name}</p>
                    <p className="text-xs neu-text-muted">ID: <span className="font-mono">{selectedCustomer.id}</span> | Mob: {selectedCustomer.mobileNumber}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs neu-text-muted font-medium">Current Outstanding</p>
                    <p className="font-bold text-lg text-rose-600">{formatCurrency(selectedCustomer.balance)}</p>
                  </div>
                </div>

                {/* Payment Method Switcher */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider neu-text-muted ml-1">
                    Payment Method
                  </label>
                  <div className="grid grid-cols-2 gap-2 p-1 neu-pressed rounded-xl">
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentMode('cash');
                        if (!transactionId || transactionId.startsWith('UPI-')) {
                          setTransactionId(generateCashReceiptId());
                        }
                      }}
                      className={`py-2 px-3 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                        paymentMode === 'cash' 
                          ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30' 
                          : 'neu-flat hover:text-emerald-600'
                      }`}
                    >
                      <Banknote className="w-4 h-4" /> Cash on Counter
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPaymentMode('upi');
                        if (transactionId.startsWith('CASH-')) {
                          setTransactionId('');
                        }
                      }}
                      className={`py-2 px-3 rounded-lg text-xs sm:text-sm font-bold flex items-center justify-center gap-2 transition-all ${
                        paymentMode === 'upi' 
                          ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/30' 
                          : 'neu-flat hover:text-emerald-600'
                      }`}
                    >
                      <Smartphone className="w-4 h-4" /> UPI / Online QR
                    </button>
                  </div>
                </div>

                {/* Editable Payment Amount Input */}
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-bold uppercase tracking-wider neu-text-muted ml-1">
                      Received Amount (INR ₹)
                    </label>
                    <span className="text-xs font-medium text-emerald-600">Editable (Supports Partial or Full)</span>
                  </div>
                  
                  <div className="relative">
                    <span className="absolute left-4 top-1/2 -translate-y-1/2 text-2xl font-bold text-slate-400">₹</span>
                    <input
                      type="number"
                      step="any"
                      min="1"
                      value={paymentAmount}
                      onChange={(e) => setPaymentAmount(e.target.value)}
                      className="w-full pl-10 pr-4 py-3 neu-pressed rounded-xl bg-transparent outline-none text-2xl font-bold text-center focus:ring-2 focus:ring-emerald-500 transition-all"
                      placeholder="Enter amount..."
                    />
                  </div>

                  {/* Quick Preset Buttons */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    <button
                      type="button"
                      onClick={() => setPaymentAmount(selectedCustomer.balance > 0 ? selectedCustomer.balance.toString() : "0")}
                      className="px-2.5 py-1 text-xs font-semibold rounded-lg neu-flat hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                    >
                      Full (₹{selectedCustomer.balance})
                    </button>
                    {selectedCustomer.balance > 100 && (
                      <button
                        type="button"
                        onClick={() => setPaymentAmount("100")}
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg neu-flat hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                      >
                        ₹100
                      </button>
                    )}
                    {selectedCustomer.balance > 200 && (
                      <button
                        type="button"
                        onClick={() => setPaymentAmount("200")}
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg neu-flat hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                      >
                        ₹200
                      </button>
                    )}
                    {selectedCustomer.balance > 500 && (
                      <button
                        type="button"
                        onClick={() => setPaymentAmount("500")}
                        className="px-2.5 py-1 text-xs font-semibold rounded-lg neu-flat hover:bg-emerald-50 hover:text-emerald-600 transition-colors"
                      >
                        ₹500
                      </button>
                    )}
                  </div>
                </div>

                {/* Real-time Ledger Calculation Preview */}
                {(() => {
                  const numAmount = parseFloat(paymentAmount) || 0;
                  const newBalance = Math.max(0, selectedCustomer.balance - numAmount);
                  const isFullSettlement = numAmount >= selectedCustomer.balance && selectedCustomer.balance > 0;
                  const isPartial = numAmount > 0 && numAmount < selectedCustomer.balance;

                  return (
                    <div className="p-3.5 rounded-xl border border-[var(--shadow-light)] bg-black/5 space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="neu-text-muted">Total Outstanding:</span>
                        <span className="font-semibold">{formatCurrency(selectedCustomer.balance)}</span>
                      </div>
                      <div className="flex justify-between text-xs">
                        <span className="neu-text-muted">Paying Now:</span>
                        <span className="font-bold text-emerald-600">- {formatCurrency(numAmount)}</span>
                      </div>
                      <div className="h-px bg-slate-200 dark:bg-slate-700 my-1" />
                      <div className="flex justify-between items-center text-sm">
                        <span className="font-bold">Remaining Balance:</span>
                        <span className={`font-bold ${newBalance === 0 ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {formatCurrency(newBalance)}
                        </span>
                      </div>

                      <div className="pt-1">
                        {isFullSettlement && (
                          <div className="flex items-center gap-1.5 text-xs text-emerald-700 bg-emerald-100/70 dark:bg-emerald-900/30 px-2.5 py-1.5 rounded-lg font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>Full Settlement: Account will be marked in good standing.</span>
                          </div>
                        )}
                        {isPartial && (
                          <div className="flex items-center gap-1.5 text-xs text-amber-700 bg-amber-100/70 dark:bg-amber-900/30 px-2.5 py-1.5 rounded-lg font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" />
                            <span>Partial Payment: Remaining ₹{newBalance} rolls forward as arrears.</span>
                          </div>
                        )}
                        {numAmount <= 0 && (
                          <p className="text-xs text-rose-500 font-medium">Please enter an amount greater than ₹0.</p>
                        )}
                      </div>
                    </div>
                  );
                })()}

                {/* Mode Specific Details */}
                {paymentMode === 'upi' ? (
                  <div className="space-y-3">
                    <div className="flex flex-col items-center justify-center p-4 neu-flat rounded-2xl bg-white">
                      {settings.upiQrCodeImage ? (
                        <img 
                          src={settings.upiQrCodeImage} 
                          alt="UPI QR Code" 
                          className="w-32 h-32 sm:w-44 sm:h-44 object-contain"
                        />
                      ) : (
                        <div className="w-32 h-32 sm:w-44 sm:h-44 flex flex-col items-center justify-center border-2 border-dashed border-slate-300 rounded-xl text-center p-2">
                          <QrCode className="w-6 h-6 text-slate-400 mb-1" />
                          <p className="text-xs text-slate-500 font-medium">No QR Configured</p>
                          <p className="text-[10px] text-slate-400">Upload in Settings</p>
                        </div>
                      )}
                      <p className="mt-2 text-xs font-medium text-center text-gray-500">
                        Ask villager to scan with GPay / PhonePe / Paytm
                      </p>
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider neu-text-muted ml-1">
                        Bank UTR / UPI Transaction Reference
                      </label>
                      <input
                        type="text"
                        value={transactionId}
                        onChange={(e) => setTransactionId(e.target.value)}
                        className="w-full px-4 py-2.5 neu-pressed rounded-xl bg-transparent outline-none text-sm font-medium"
                        placeholder="Enter 12-digit UTR or Reference..."
                      />
                    </div>
                  </div>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold uppercase tracking-wider neu-text-muted ml-1">
                        Cash Receipt / Voucher Number
                      </label>
                      <button
                        type="button"
                        onClick={() => setTransactionId(generateCashReceiptId())}
                        className="text-xs font-medium text-emerald-600 hover:underline flex items-center gap-1"
                      >
                        <RefreshCw className="w-3 h-3" /> New Receipt ID
                      </button>
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={transactionId}
                        onChange={(e) => setTransactionId(e.target.value)}
                        className="w-full px-4 py-2.5 neu-pressed rounded-xl bg-transparent outline-none text-sm font-mono font-medium"
                        placeholder="e.g. CASH-123456"
                      />
                    </div>
                    <p className="text-[11px] neu-text-muted italic ml-1">
                      Counter staff collects physical cash and issues an official receipt.
                    </p>
                  </div>
                )}

                {/* Submit Button */}
                <div className="pt-2 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setIsPaymentModalOpen(false)}
                    className="w-1/3 py-3 neu-flat rounded-xl font-bold text-sm hover:bg-black/5 transition-colors"
                  >
                    Cancel
                  </button>
                  <button 
                    onClick={handleConfirmPayment}
                    disabled={isConfirming || !paymentAmount || parseFloat(paymentAmount) <= 0}
                    className="w-2/3 py-3 bg-emerald-600 text-white rounded-xl font-bold text-sm shadow-lg shadow-emerald-500/30 hover:bg-emerald-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {isConfirming ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
                    {isConfirming ? "Recording..." : `Confirm ₹${parseFloat(paymentAmount) || 0}`}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Receipt Image Modal */}
      <AnimatePresence>
        {isReceiptModalOpen && selectedReceipt && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-4xl rounded-2xl overflow-hidden relative flex flex-col items-center"
            >
              <button 
                onClick={() => setIsReceiptModalOpen(false)}
                className="absolute top-4 right-4 p-2 bg-black/50 text-white rounded-full hover:bg-black/80 transition-colors z-10"
              >
                <X className="w-6 h-6" />
              </button>
              
              <img 
                src={selectedReceipt.base64Image} 
                alt="Receipt Screenshot" 
                className="max-w-full max-h-[80vh] object-contain rounded-xl"
              />
              
              <div className="w-full bg-white p-4 mt-4 flex gap-4 rounded-xl items-center justify-between">
                <div>
                  <p className="font-bold">{selectedReceipt.customerName} - {selectedReceipt.customerId}</p>
                  <p className="text-sm text-slate-500">Amount claimed: <span className="font-bold text-slate-900">{formatCurrency(selectedReceipt.amount)}</span></p>
                </div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => handleRejectReceipt(selectedReceipt.id)}
                    disabled={isActioningReceipt !== null}
                    className="px-6 py-2 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg font-bold transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {isActioningReceipt === `${selectedReceipt.id}-reject` ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Reject
                  </button>
                  <button 
                    onClick={() => handleApproveReceipt(selectedReceipt)}
                    disabled={isActioningReceipt !== null}
                    className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-lg transition-colors flex items-center gap-2 disabled:opacity-50"
                  >
                    {isActioningReceipt === `${selectedReceipt.id}-approve` ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Approve Payment
                  </button>
                </div>
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
        showCancel={confirmConfig.showCancel}
      />
    </motion.div>
  );
}
