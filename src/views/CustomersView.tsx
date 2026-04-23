import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Users, Search, Plus, MoreVertical, X, Trash2, Bell, Send, Upload, Download } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useState, useEffect, useRef } from "react";
import { Customer, subscribeToCustomers, addCustomer, updateCustomer, deleteCustomer, deleteCustomersBatch, deleteAllCustomers, subscribeToSettings, AppSettings } from "../lib/db";
import { useTranslation } from "react-i18next";
import { ConfirmModal } from "../components/ConfirmModal";
import { sendWhatsAppNotification } from "../lib/automation";
import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from "uuid";
import { db, auth } from "../firebase";
import { writeBatch, doc } from "firebase/firestore";

export function CustomersView() {
  const { t } = useTranslation();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isNotifyModalOpen, setIsNotifyModalOpen] = useState(false);
  const [notifyMessage, setNotifyMessage] = useState("");
  const [isSendingNotify, setIsSendingNotify] = useState(false);
  const [notifyProgress, setNotifyProgress] = useState(0);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: keyof Customer; direction: 'asc' | 'desc' } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleExport = () => {
    const worksheet = XLSX.utils.json_to_sheet(customers.map(c => ({
      ID: c.id,
      Name: c.name,
      Mobile: c.mobileNumber,
      Status: c.status,
      Balance: c.balance
    })));
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Customers");
    XLSX.writeFile(workbook, "customers.csv");
    showAlert("Success", "Customers data exported successfully.");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!auth.currentUser) {
       showAlert("Auth Error", "You must be authenticated to import data.");
       return;
    }

    setIsImporting(true);
    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const firstSheetName = workbook.SheetNames[0];
      const worksheet = workbook.Sheets[firstSheetName];
      
      // Expected columns: Name, Mobile, Balance, Status
      const jsonData = XLSX.utils.sheet_to_json<any>(worksheet);

      let importedCount = 0;
      const batchLimit = 500;
      let uiCustomers = [...jsonData];

      for (let i = 0; i < uiCustomers.length; i += batchLimit) {
        const batch = writeBatch(db);
        const chunk = uiCustomers.slice(i, i + batchLimit);
        
        for (const row of chunk) {
          // Robust row parsing
          let rawName = row.Name || row.name || row.Customer || "";
          let rawMobile = row.Mobile || row.mobile || row.Phone || row.mobileNumber || "";
          let rawBalance = parseFloat(row.Balance || row.balance || "0") || 0;
          let rawStatus = row.Status || row.status || "Active";

          if (rawName && rawMobile) {
            const id = `CUST-${uuidv4().substring(0, 8).toUpperCase()}`;
            const docRef = doc(db, 'customers', id);
            batch.set(docRef, {
              id,
              name: String(rawName).trim(),
              mobileNumber: String(rawMobile).trim(),
              balance: rawBalance,
              status: rawStatus.toString().toLowerCase() === "suspended" ? "Suspended" : "Active",
              ownerId: auth.currentUser.uid,
              createdAt: new Date().toISOString()
            });
            importedCount++;
          }
        }
        await batch.commit();
      }

      showAlert("Import Complete", `Successfully imported ${importedCount} customers from ${file.name}.`);
    } catch (err) {
      console.error(err);
      showAlert("Import Error", "Failed to parse or save the imported file. Ensure it contains Name and Mobile columns.");
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const preloadedMessages = [
    "Water supply will be disrupted tomorrow from 10 AM to 2 PM due to pipeline maintenance.",
    "Emergency repair work is in progress. Water supply may be affected for the next 4 hours.",
    "Water tank cleaning is scheduled for Sunday. Please store enough water.",
    "Billing cycle has started. Please check your dashboard for the latest invoice.",
    "Thank you for being a valued customer. We are committed to providing clean water."
  ];
  
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

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 100;

  const [newCustomer, setNewCustomer] = useState({
    name: "",
    mobileNumber: "",
    status: "Active" as "Active" | "Suspended" | "Faulty",
    balance: 0,
  });

  useEffect(() => {
    const unsub = subscribeToCustomers(setCustomers);
    const unsubSettings = subscribeToSettings((s) => setSettings(s));
    return () => {
      unsub();
      unsubSettings();
    };
  }, []);

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

  const handleAddCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validation
    const isMobileInvalid = newCustomer.mobileNumber && !/^\d{10}$/.test(newCustomer.mobileNumber);
    const isNameInvalid = !newCustomer.name || typeof newCustomer.name !== 'string' || newCustomer.name.trim() === '';
    
    let finalStatus = newCustomer.status;
    if (isMobileInvalid || isNameInvalid) {
      finalStatus = 'Faulty';
    } else if (newCustomer.status === 'Faulty' && !isMobileInvalid && !isNameInvalid) {
      finalStatus = 'Active';
    }
    
    if (newCustomer.balance < 0) {
      showAlert("Validation Error", "Balance cannot be negative.");
      return;
    }

    await addCustomer({ ...newCustomer, status: finalStatus });
    setIsAddModalOpen(false);
    setNewCustomer({ name: "", mobileNumber: "", status: "Active", balance: 0 });
  };

  const handleUpdateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCustomer) {
      const isMobileInvalid = editingCustomer.mobileNumber && !/^\d{10}$/.test(editingCustomer.mobileNumber);
      const isNameInvalid = !editingCustomer.name || typeof editingCustomer.name !== 'string' || editingCustomer.name.trim() === '';

      let finalStatus = editingCustomer.status;
      if (isMobileInvalid || isNameInvalid) {
        finalStatus = 'Faulty';
      } else if (editingCustomer.status === 'Faulty' && !isMobileInvalid && !isNameInvalid) {
        finalStatus = 'Active';
      }

      if (editingCustomer.balance < 0) {
        showAlert("Validation Error", "Balance cannot be negative.");
        return;
      }
      await updateCustomer({...editingCustomer, status: finalStatus});
      setIsEditModalOpen(false);
      setEditingCustomer(null);
    }
  };

  const toggleIsolateCustomer = (customer: Customer) => {
    const isSuspended = customer.status === 'Suspended';
    setConfirmConfig({
      isOpen: true,
      title: isSuspended ? "Un-isolate Customer" : "Isolate Customer",
      message: `Are you sure you want to change this customer's status to ${isSuspended ? 'Active' : 'Suspended'}?`,
      isDestructive: false,
      showCancel: true,
      onConfirm: async () => {
        await updateCustomer({...customer, status: isSuspended ? 'Active' : 'Suspended'});
        setIsEditModalOpen(false);
        setEditingCustomer(null);
      }
    });
  };

  const handleRenotify = async (customer: Customer) => {
    if (!settings) return;
    const message = `Your payment details for your water bill have been confirmed. Thank you for your payment.`;
    await sendWhatsAppNotification(customer, message, settings);
    showAlert("Success", "Notification resent successfully.");
    setIsEditModalOpen(false);
  };

  const handleDeleteAll = () => {
    setConfirmConfig({
      isOpen: true,
      title: "Delete All Customers",
      message: "Are you sure you want to delete ALL customers? This will also delete their transaction history. This action cannot be undone.",
      isDestructive: true,
      showCancel: true,
      onConfirm: async () => {
        setIsDeletingAll(true);
        try {
          await deleteAllCustomers();
          showAlert("Success", "All customers have been deleted.");
        } catch (error) {
          console.error("Error deleting all customers:", error);
          showAlert("Error", "Failed to delete all customers.");
        } finally {
          setIsDeletingAll(false);
        }
      }
    });
  };

  const handleDeleteBatch = () => {
    setConfirmConfig({
      isOpen: true,
      title: "Delete Selected Customers",
      message: `Are you sure you want to delete ${selectedIds.length} customers? This action cannot be undone.`,
      isDestructive: true,
      showCancel: true,
      onConfirm: async () => {
        await deleteCustomersBatch(selectedIds);
        setSelectedIds([]);
      }
    });
  };

  const handleDeleteSingle = (id: string) => {
    setConfirmConfig({
      isOpen: true,
      title: "Delete Customer",
      message: "Are you sure you want to delete this customer? This will also delete their transaction history.",
      isDestructive: true,
      showCancel: true,
      onConfirm: async () => {
        await deleteCustomer(id);
        setSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
        setIsEditModalOpen(false);
        setEditingCustomer(null);
      }
    });
  };

  const handleRowClick = (customer: Customer) => {
    setEditingCustomer(customer);
    setIsEditModalOpen(true);
  };

  const handleNotifyActive = async () => {
    const activeCustomers = customers.filter(c => c.status === 'Active');
    if (activeCustomers.length === 0) {
      showAlert("No Active Customers", "There are no active customers to notify.");
      return;
    }

    if (!notifyMessage.trim()) {
      showAlert("Empty Message", "Please type a message or select a preloaded one.");
      return;
    }

    // Fast fail if API is missing for bulk
    if (!settings?.metaWhatsAppApiKey || !settings?.metaWhatsAppPhoneNumberId) {
       setIsNotifyModalOpen(false);
       setConfirmConfig({
         isOpen: true,
         title: "Meta API Configuration Missing",
         message: "Bulk automated messaging requires the WhatsApp Meta API key. Would you like to use the manual backup method to forward a single general message to your WhatsApp groups or select individuals?",
         isDestructive: false,
         showCancel: true,
         onConfirm: () => {
             const genericMessage = `Important Notice: ${notifyMessage}`;
             const url = `https://wa.me/?text=${encodeURIComponent(genericMessage)}`;
             window.open(url, '_blank');
             setNotifyMessage("");
         }
       });
       return;
    }

    setIsSendingNotify(true);
    setNotifyProgress(0);

    let errors = [];
    for (let i = 0; i < activeCustomers.length; i++) {
      const customer = activeCustomers[i];
      const message = `Dear ${customer.name}, ${notifyMessage}`;
      
      const result = await sendWhatsAppNotification(customer, message, settings as AppSettings, undefined, undefined, true);
      if (!result.success) {
        errors.push(`${customer.name}: ${result.error}`);
      }

      setNotifyProgress(Math.floor(((i + 1) / activeCustomers.length) * 100));
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    setIsSendingNotify(false);
    setIsNotifyModalOpen(false);
    
    if (errors.length > 0) {
      setConfirmConfig({
         isOpen: true,
         title: "Completed with Errors",
         message: `Notifications finished with errors (${errors.length} failed). Would you like to use the backup method to forward the message manually via WhatsApp App?`,
         isDestructive: false,
         showCancel: true,
         onConfirm: () => {
             const genericMessage = `Important Notice: ${notifyMessage}`;
             const url = `https://wa.me/?text=${encodeURIComponent(genericMessage)}`;
             window.open(url, '_blank');
             setNotifyMessage("");
         }
      });
    } else {
      setNotifyMessage("");
      showAlert("Success", `Notifications sent to ${activeCustomers.length} active customers.`);
    }
  };

  const filteredCustomers = customers.filter(c => 
    c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
    c.mobileNumber.includes(searchQuery)
  );

  const sortedCustomers = [...filteredCustomers].sort((a, b) => {
    // Always prioritize Faulty status
    if (a.status === 'Faulty' && b.status !== 'Faulty') return -1;
    if (a.status !== 'Faulty' && b.status === 'Faulty') return 1;

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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR'
    }).format(amount);
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
      className="space-y-6 relative"
    >
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('Customers')}</h2>
          <p className="neu-text-muted">{t('Manage Accounts')}</p>
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.length > 0 && (
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleDeleteBatch}
              className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-red-500/30"
            >
              Delete Selected ({selectedIds.length})
            </motion.button>
          )}
          {customers.length > 0 && (
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsNotifyModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/30"
            >
              <Bell className="w-4 h-4" /> Notify
            </motion.button>
          )}
          {customers.length > 0 && (
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleDeleteAll}
              disabled={isDeletingAll}
              className="flex items-center gap-2 px-4 py-2 bg-rose-100 text-rose-600 rounded-xl text-sm font-bold shadow-lg shadow-rose-500/10 disabled:opacity-70"
            >
              <Trash2 className="w-4 h-4" />
              {isDeletingAll ? "Deleting..." : "Delete All"}
            </motion.button>
          )}
          <div className="flex gap-2">
            <input 
              type="file" 
              accept=".xlsx,.xls,.csv" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
            />
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleExport}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-100 text-indigo-700 rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/10"
            >
              <Download className="w-4 h-4" /> Export
            </motion.button>
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/10 disabled:opacity-70"
            >
              <Upload className="w-4 h-4" /> {isImporting ? 'Importing...' : 'Import'}
            </motion.button>

            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsAddModalOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/30"
            >
              <Plus className="w-4 h-4" /> {t('Add Customer')}
            </motion.button>
          </div>
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
                  <th className="px-4 py-3">
                    <input 
                      type="checkbox"
                      checked={selectedIds.length === paginatedCustomers.length && paginatedCustomers.length > 0}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedIds(paginatedCustomers.map(c => c.id));
                        } else {
                          setSelectedIds([]);
                        }
                      }}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                    />
                  </th>
                  <th className="px-4 py-3 cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('id')}>
                    ID <SortIcon column="id" />
                  </th>
                  <th className="px-4 py-3 cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('name')}>
                    {t('Name')} <SortIcon column="name" />
                  </th>
                  <th className="px-4 py-3 cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('mobileNumber')}>
                    {t('Mobile Number')} <SortIcon column="mobileNumber" />
                  </th>
                  <th className="px-4 py-3 cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('status')}>
                    {t('Status')} <SortIcon column="status" />
                  </th>
                  <th className="px-4 py-3 cursor-pointer hover:text-blue-600 transition-colors" onClick={() => handleSort('balance')}>
                    {t('Balance')} <SortIcon column="balance" />
                  </th>
                  <th className="px-4 py-3"></th>
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
                    onClick={() => handleRowClick(customer)}
                    className="border-b border-[var(--shadow-dark)] last:border-0 hover:bg-black/5 transition-colors cursor-pointer"
                  >
                    <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
                        <input 
                          type="checkbox"
                          checked={selectedIds.includes(customer.id)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedIds([...selectedIds, customer.id]);
                            } else {
                              setSelectedIds(selectedIds.filter(id => id !== customer.id));
                            }
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </td>
                      <td className="px-4 py-4 font-medium">{customer.id}</td>
                    <td className="px-4 py-4">{customer.name}</td>
                    <td className="px-4 py-4">{customer.mobileNumber}</td>
                    <td className="px-4 py-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        customer.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {customer.status}
                      </span>
                    </td>
                    <td className="px-4 py-4 font-medium">{formatCurrency(customer.balance)}</td>
                    <td className="px-4 py-4 text-right">
                      <button 
                        className="p-1 hover:bg-black/10 rounded-lg transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleRowClick(customer);
                        }}
                      >
                        <MoreVertical className="w-4 h-4 neu-text-muted" />
                      </button>
                    </td>
                  </motion.tr>
                ))}
                {filteredCustomers.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-8 text-center neu-text-muted">
                      No customers found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            
            {/* Pagination Controls */}
            {totalPages > 1 && (
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
          </div>
        </CardContent>
      </Card>

      <AnimatePresence>
        {/* Add Customer Modal */}
        {isAddModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="neu-bg p-6 rounded-2xl w-full max-w-md shadow-2xl border border-white/20"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold">{t('Add Customer')}</h3>
                <button 
                  onClick={() => setIsAddModalOpen(false)}
                  className="p-2 hover:bg-black/10 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleAddCustomer} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">{t('Name')}</label>
                  <input 
                    type="text" 
                    required
                    value={newCustomer.name}
                    onChange={e => setNewCustomer({...newCustomer, name: e.target.value})}
                    className="w-full px-4 py-2 neu-pressed rounded-xl outline-none focus:ring-2 focus:ring-blue-500/50"
                    placeholder="e.g. Rahul Sharma"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">{t('Mobile Number')}</label>
                  <input 
                    type="tel" 
                    required
                    pattern="[0-9]{10}"
                    value={newCustomer.mobileNumber}
                    onChange={e => setNewCustomer({...newCustomer, mobileNumber: e.target.value})}
                    className="w-full px-4 py-2 neu-pressed rounded-xl outline-none focus:ring-2 focus:ring-blue-500/50"
                    placeholder="10-digit mobile number"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('Status')}</label>
                    <select 
                      value={newCustomer.status}
                      onChange={e => setNewCustomer({...newCustomer, status: e.target.value as any})}
                      className="w-full px-4 py-2 neu-pressed rounded-xl outline-none focus:ring-2 focus:ring-blue-500/50 bg-transparent"
                    >
                      <option value="Active">Active</option>
                      <option value="Suspended">Suspended</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">Initial Balance (₹)</label>
                    <input 
                      type="number" 
                      min="0"
                      step="0.01"
                      value={newCustomer.balance}
                      onChange={e => setNewCustomer({...newCustomer, balance: parseFloat(e.target.value) || 0})}
                      className="w-full px-4 py-2 neu-pressed rounded-xl outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                </div>

                <div className="pt-4 flex justify-end gap-3">
                  <button 
                    type="button"
                    onClick={() => setIsAddModalOpen(false)}
                    className="px-4 py-2 neu-flat rounded-xl text-sm font-medium"
                  >
                    Cancel
                  </button>
                  <button 
                    type="submit"
                    className="px-6 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition-colors"
                  >
                    Save Customer
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* Edit Customer Modal */}
        {isEditModalOpen && editingCustomer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="neu-bg p-6 rounded-2xl w-full max-w-md shadow-2xl border border-white/20"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold">Edit Customer Details</h3>
                <button 
                  onClick={() => setIsEditModalOpen(false)}
                  className="p-2 hover:bg-black/10 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleUpdateCustomer} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Customer ID</label>
                  <input 
                    type="text" 
                    disabled
                    value={editingCustomer.id}
                    className="w-full px-4 py-2 neu-pressed rounded-xl outline-none opacity-70 cursor-not-allowed"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium mb-1">{t('Name')}</label>
                  <input 
                    type="text" 
                    required
                    value={editingCustomer.name}
                    onChange={e => setEditingCustomer({...editingCustomer, name: e.target.value})}
                    className="w-full px-4 py-2 neu-pressed rounded-xl outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium mb-1">{t('Mobile Number')}</label>
                  <input 
                    type="tel" 
                    required
                    pattern="[0-9]{10}"
                    value={editingCustomer.mobileNumber}
                    onChange={e => setEditingCustomer({...editingCustomer, mobileNumber: e.target.value})}
                    className="w-full px-4 py-2 neu-pressed rounded-xl outline-none focus:ring-2 focus:ring-blue-500/50"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('Status')}</label>
                    <select 
                      value={editingCustomer.status}
                      onChange={e => setEditingCustomer({...editingCustomer, status: e.target.value as any})}
                      className="w-full px-4 py-2 neu-pressed rounded-xl outline-none focus:ring-2 focus:ring-blue-500/50 bg-transparent"
                    >
                      <option value="Active">Active</option>
                      <option value="Suspended">Suspended</option>
                    </select>
                  </div>
                  
                  <div>
                    <label className="block text-sm font-medium mb-1">{t('Balance')} (₹)</label>
                    <input 
                      type="number" 
                      min="0"
                      step="0.01"
                      value={editingCustomer.balance}
                      onChange={e => setEditingCustomer({...editingCustomer, balance: parseFloat(e.target.value) || 0})}
                      className="w-full px-4 py-2 neu-pressed rounded-xl outline-none focus:ring-2 focus:ring-blue-500/50"
                    />
                  </div>
                </div>

                <div className="pt-4 flex justify-between gap-3">
                  <div className="flex gap-2">
                    <button 
                      type="button"
                      onClick={() => handleDeleteSingle(editingCustomer.id)}
                      className="px-4 py-2 bg-red-100 text-red-700 rounded-xl text-sm font-bold hover:bg-red-200 transition-colors"
                    >
                      Delete
                    </button>
                    {editingCustomer.paymentNotified && (
                      <button
                        type="button"
                        onClick={() => handleRenotify(editingCustomer)}
                        className="px-4 py-2 bg-purple-100 text-purple-700 rounded-xl text-sm font-bold hover:bg-purple-200 transition-colors"
                      >
                        Renotify
                      </button>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button 
                      type="button"
                      onClick={() => setIsEditModalOpen(false)}
                      className="px-4 py-2 neu-flat rounded-xl text-sm font-medium"
                    >
                      Cancel
                    </button>
                    <button 
                      type="submit"
                      className="px-6 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition-colors"
                    >
                      Save Changes
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* Notify Modal */}
        {isNotifyModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="neu-bg p-6 rounded-2xl w-full max-w-lg shadow-2xl border border-white/20"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold">Broadcast Notification</h3>
                <button 
                  onClick={() => setIsNotifyModalOpen(false)}
                  className="p-2 hover:bg-black/10 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <label className="block text-sm font-bold uppercase tracking-wider neu-text-muted mb-3">
                    Select Preloaded Message
                  </label>
                  <div className="space-y-2 max-h-48 overflow-y-auto pr-2 custom-scrollbar">
                    {preloadedMessages.map((msg, idx) => (
                      <button
                        key={idx}
                        onClick={() => setNotifyMessage(msg)}
                        className={`w-full text-left p-3 rounded-xl text-sm transition-all border-2 ${
                          notifyMessage === msg 
                            ? 'bg-blue-50 border-blue-500 text-blue-700' 
                            : 'neu-flat border-transparent hover:border-blue-300'
                        }`}
                      >
                        {msg}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold uppercase tracking-wider neu-text-muted mb-3">
                    Or Type Custom Message
                  </label>
                  <textarea
                    value={notifyMessage}
                    onChange={(e) => setNotifyMessage(e.target.value)}
                    placeholder="Type your message here..."
                    className="w-full h-32 p-4 neu-pressed rounded-xl outline-none focus:ring-2 focus:ring-blue-500/50 resize-none text-sm"
                  />
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-[var(--shadow-dark)]">
                  <div className="text-xs neu-text-muted">
                    Sending to <span className="font-bold text-blue-600">{customers.filter(c => c.status === 'Active').length}</span> active customers
                  </div>
                  <div className="flex gap-3">
                    <button 
                      onClick={() => setIsNotifyModalOpen(false)}
                      className="px-4 py-2 neu-flat rounded-xl text-sm font-medium"
                    >
                      Cancel
                    </button>
                    <button 
                      onClick={handleNotifyActive}
                      disabled={isSendingNotify}
                      className="px-6 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/30 hover:bg-emerald-700 transition-colors flex items-center gap-2 disabled:opacity-70"
                    >
                      {isSendingNotify ? (
                        <>
                          <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                          Sending... {notifyProgress}%
                        </>
                      ) : (
                        <>
                          <Send className="w-4 h-4" /> Send Broadcast
                        </>
                      )}
                    </button>
                  </div>
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
        isDestructive={confirmConfig.isDestructive}
        showCancel={confirmConfig.showCancel}
      />
    </motion.div>
  );
}
