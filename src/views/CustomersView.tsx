import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Users, Search, Plus, MoreVertical, X, Trash2, Bell, Send, Upload, Download, Loader2, AlertTriangle, Paperclip } from "lucide-react";
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
  const [isIndividualNotifyOpen, setIsIndividualNotifyOpen] = useState(false);
  const [individualNotifyCustomer, setIndividualNotifyCustomer] = useState<Customer | null>(null);
  const [notifyMessage, setNotifyMessage] = useState("");
  const [isSendingNotify, setIsSendingNotify] = useState(false);
  const [notifyProgress, setNotifyProgress] = useState(0);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: keyof Customer; direction: 'asc' | 'desc' } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [showFaultyOnly, setShowFaultyOnly] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isSavingUser, setIsSavingUser] = useState(false);
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

  const [isUploadStagingModalOpen, setIsUploadStagingModalOpen] = useState(false);
  const [stagingCustomers, setStagingCustomers] = useState<any[]>([]);
  const [stagingPage, setStagingPage] = useState(1);
  const stagingLimit = 50;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);
      const worksheet = workbook.Sheets[workbook.SheetNames[0]];
      const jsonData = XLSX.utils.sheet_to_json<any>(worksheet);

      const parsedCustomers = jsonData.map(row => ({
          id: `CUST-${uuidv4().substring(0, 8).toUpperCase()}`,
          name: String(row.Name || row.name || row.Customer || "").trim(),
          mobileNumber: String(row.Mobile || row.mobile || row.Phone || row.mobileNumber || "").trim(),
          balance: parseFloat(row.Balance || row.balance || "0") || 0,
          status: (row.Status || row.status || "Active").toString().toLowerCase() === "suspended" ? "Suspended" : "Active",
          ownerId: auth.currentUser?.uid,
          createdAt: new Date().toISOString()
      })).filter(c => c.name && c.mobileNumber);
      
      setStagingCustomers(parsedCustomers);
      setStagingPage(1);
      setIsUploadStagingModalOpen(true);
    } catch (err) {
      console.error(err);
      showAlert("Import Error", "Failed to parse file.");
    }
  };

  const confirmBulkUpload = async () => {
    setIsImporting(true);
    try {
      const batchLimit = 500;
      for (let i = 0; i < stagingCustomers.length; i += batchLimit) {
        const batch = writeBatch(db);
        const chunk = stagingCustomers.slice(i, i + batchLimit);
        for (const customer of chunk) {
          const docRef = doc(db, 'customers', customer.id);
          batch.set(docRef, customer);
        }
        await batch.commit();
      }
      showAlert("Import Complete", `Successfully imported ${stagingCustomers.length} customers.`);
      setIsUploadStagingModalOpen(false);
      setStagingCustomers([]);
    } catch (err) {
      console.error(err);
      showAlert("Import Error", "Failed to save the records.");
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
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
    children?: React.ReactNode;
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
  const [itemsPerPage, setItemsPerPage] = useState(window.innerWidth < 768 ? 50 : 100);

  useEffect(() => {
    const handleResize = () => {
      setItemsPerPage(window.innerWidth < 768 ? 50 : 100);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const [newCustomer, setNewCustomer] = useState({
    name: "",
    mobileNumber: "",
    status: "Active" as "Active" | "Suspended" | "Faulty",
    balance: 0,
  });

  useEffect(() => {
    const unsub = subscribeToCustomers(setCustomers);
    const unsubSettings = subscribeToSettings((s) => {
      setSettings(s);
      if (s?.metaWhatsAppApiKey && s?.metaWhatsAppPhoneNumberId) {
        import("../services/whatsappService").then(({ whatsappService }) => {
          whatsappService.updateConfig(s.metaWhatsAppApiKey!, s.metaWhatsAppPhoneNumberId!);
        });
      }
    });
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
    
    let finalStatus = newCustomer.status;
    if (!newCustomer.mobileNumber || !/^\d{10}$/.test(newCustomer.mobileNumber.replace(/\D/g, ''))) {
      if (newCustomer.mobileNumber && newCustomer.mobileNumber.length > 0 && !/^\d{10}$/.test(newCustomer.mobileNumber)) {
        showAlert("Validation Error", "Mobile number must be exactly 10 digits if provided.");
        return;
      }
      finalStatus = 'Suspended';
    }
    
    if (newCustomer.balance < 0) {
      showAlert("Validation Error", "Balance cannot be negative.");
      return;
    }

    setIsSavingUser(true);
    try {
      await addCustomer({ ...newCustomer, status: finalStatus });
      setIsAddModalOpen(false);
      setNewCustomer({ name: "", mobileNumber: "", status: "Active", balance: 0 });
      setCurrentPage(1);
    } finally {
      setIsSavingUser(false);
    }
  };

  const handleUpdateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCustomer) {
      const isMobileInvalid = !editingCustomer.mobileNumber || editingCustomer.mobileNumber.replace(/\D/g, '').length < 10;
      const isNameInvalid = !editingCustomer.name || typeof editingCustomer.name !== 'string' || editingCustomer.name.trim() === '';

      let finalStatus = editingCustomer.status;
      if (isMobileInvalid || isNameInvalid) {
        finalStatus = 'Suspended';
      } else if (editingCustomer.status === 'Suspended' && !isMobileInvalid && !isNameInvalid) {
        finalStatus = 'Active';
      }

      const originalCustomer = customers.find(c => c.id === editingCustomer.id);
      const statusChanged = originalCustomer && originalCustomer.status !== finalStatus;

      if (editingCustomer.balance < 0) {
        showAlert("Validation Error", "Balance cannot be negative.");
        return;
      }
      setIsSavingUser(true);
      try {
        await updateCustomer({...editingCustomer, status: finalStatus});
        
        if (statusChanged && settings && settings.automation && finalStatus !== 'Suspended') {
           let message = `Dear ${editingCustomer.name}, your account status has been updated to ${finalStatus}.`;
           sendWhatsAppNotification({...editingCustomer, status: finalStatus}, message, settings, undefined, undefined, true).catch(err => console.error("Auto notify status error:", err));
        }

        setIsEditModalOpen(false);
        setEditingCustomer(null);
      } finally {
        setIsSavingUser(false);
      }
    }
  };

  const toggleIsolateCustomer = (customer: Customer) => {
    const isSuspended = customer.status === 'Suspended';
    const newStatus = isSuspended ? 'Active' : 'Suspended';
    setConfirmConfig({
      isOpen: true,
      title: isSuspended ? "Un-isolate Customer" : "Isolate Customer",
      message: `Are you sure you want to change this customer's status to ${newStatus}?`,
      isDestructive: false,
      showCancel: true,
      onConfirm: async () => {
        await updateCustomer({...customer, status: newStatus});
        if (settings && settings.automation) {
           let message = `Dear ${customer.name}, your account status has been updated to ${newStatus}.`;
           if (newStatus === 'Suspended') message += ` Please contact support to resolve any outstanding issues.`;
           sendWhatsAppNotification({...customer, status: newStatus}, message, settings, undefined, undefined, true).catch(err => console.error("Auto notify isolate error:", err));
        }
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

  const handleOpenIndividualNotify = (e: React.MouseEvent, customer: Customer) => {
    e.stopPropagation();
    setIndividualNotifyCustomer(customer);
    setNotifyMessage(`Hi ${customer.name},\n`);
    setIsIndividualNotifyOpen(true);
  };

  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false);
  const handleUploadAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !auth.currentUser) return;
    
    setIsUploadingAttachment(true);
    try {
      const { storage } = await import('../firebase');
      const { ref, uploadBytes, getDownloadURL } = await import('firebase/storage');
      const fileRef = ref(storage, `attachments/${auth.currentUser.uid}/${Date.now()}_${file.name}`);
      await uploadBytes(fileRef, file);
      const url = await getDownloadURL(fileRef);
      setNotifyMessage(prev => prev + `\n\nAttachment: ${url}`);
      showAlert("Success", "Attachment uploaded and link added to message.");
    } catch(err) {
      console.error(err);
      showAlert("Failed", "Could not upload attachment.");
    } finally {
      setIsUploadingAttachment(false);
      e.target.value = ''; // clear input
    }
  };

  const handleSendIndividualNotify = async () => {
    if (!individualNotifyCustomer || !notifyMessage.trim() || !settings) return;
    
    setIsSendingNotify(true);
    try {
      const message = notifyMessage;
      const result = await sendWhatsAppNotification(individualNotifyCustomer, message, settings, undefined, undefined, false, false);
      
      if (result.success) {
        showAlert("Success", `Message sent to ${individualNotifyCustomer.name}${result.fellBackToManual ? ' (opened in WhatsApp App)' : ''}.`);
        setIsIndividualNotifyOpen(false);
        setIndividualNotifyCustomer(null);
        setNotifyMessage("");
      } else {
        showAlert("Failed", result.error || "Could not send notification.");
      }
    } catch (err) {
      showAlert("Error", "An unexpected error occurred.");
    } finally {
      setIsSendingNotify(false);
    }
  };

  const deliveryModeRef = useRef("api");

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

    deliveryModeRef.current = "api";

    setIsNotifyModalOpen(false);

    setConfirmConfig({
      isOpen: true,
      title: "Send Bulk Notification",
      message: `Send custom message to all ${activeCustomers.length} active customers?`,
      isDestructive: false,
      showCancel: true,
      children: (
        <div className="flex flex-col gap-2 mt-2">
          <label className="text-sm font-semibold">Delivery Method</label>
          <select 
            className="w-full px-3 py-2 bg-[var(--bg-color)] border border-[var(--shadow-light)] rounded-lg text-sm"
            onChange={(e) => deliveryModeRef.current = e.target.value}
            defaultValue="api"
          >
            <option value="api">WhatsApp Cloud API (Automated)</option>
            <option value="web">WhatsApp Web (Manual Prompts - Slow)</option>
          </select>
        </div>
      ),
      onConfirm: async () => {
        setIsSendingNotify(true);
        setNotifyProgress(0);
        
        let errors = [];
        const isApiMode = deliveryModeRef.current === "api";
        const tempSettings = { ...settings!, metaWhatsAppApiKey: isApiMode ? settings!.metaWhatsAppApiKey : "" };

        for (let i = 0; i < activeCustomers.length; i++) {
          const customer = activeCustomers[i];
          const message = `Dear ${customer.name}, ${notifyMessage}`;
          
          const result = await sendWhatsAppNotification(customer, message, tempSettings, undefined, undefined, isApiMode, false);
          if (!result.success) {
            errors.push(`${customer.name}: ${result.error}`);
          }

          setNotifyProgress(Math.floor(((i + 1) / activeCustomers.length) * 100));
          await new Promise(resolve => setTimeout(resolve, isApiMode ? 1000 : 3500));
        }

        setIsSendingNotify(false);
        setNotifyMessage("");
        
        if (errors.length > 0) {
          if (isApiMode) {
            setConfirmConfig({
              isOpen: true,
              title: "API Delivery Failed",
              message: `Notifications finished with errors (${errors.length} failed):\n${errors.slice(0, 3).join('\n')}${errors.length > 3 ? '\n...' : ''}\n\nWould you like to use the manual fallback to select and message them in WhatsApp?`,
              isDestructive: false,
              showCancel: true,
              onConfirm: () => {
                const genericMessage = `Important Notice:\n\n${notifyMessage}`;
                const url = `https://wa.me/?text=${encodeURIComponent(genericMessage)}`;
                window.open(url, '_blank');
                setConfirmConfig({...confirmConfig, isOpen: false});
              }
            });
          } else {
            showAlert("Completed with Errors", `Notifications finished with some errors:\n\n${errors.join('\n')}`);
          }
        } else {
          showAlert("Success", "All active customers notified successfully!");
        }
      }
    });

    /* == ISOLATED AUTOMATION BLOCK ==
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
      
      const result = await sendWhatsAppNotification(customer, message, settings as AppSettings, undefined, undefined, true, false);
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
    =============================== */
  };

  const filteredCustomers = customers.filter(c => {
    const matchesSearch = c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.mobileNumber.includes(searchQuery);
    
    if (showFaultyOnly) {
      return matchesSearch && c.status === 'Faulty';
    } else {
      return matchesSearch && c.status !== 'Faulty';
    }
  });

  const sortedCustomers = [...filteredCustomers].sort((a, b) => {
    // Always prioritize Faulty status
    if (a.status === 'Faulty' && b.status !== 'Faulty') return -1;
    if (a.status !== 'Faulty' && b.status === 'Faulty') return 1;

    if (!sortConfig) {
      if (a.createdAt && b.createdAt) return b.createdAt.localeCompare(a.createdAt);
      if (a.createdAt) return -1;
      if (b.createdAt) return 1;
      return 0;
    }
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
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {selectedIds.length > 0 && (
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleDeleteBatch}
              className="flex-1 sm:flex-none flex justify-center items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-red-500/30"
            >
              Delete Selected ({selectedIds.length})
            </motion.button>
          )}
          {customers.length > 0 && (
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsNotifyModalOpen(true)}
              className="flex-1 sm:flex-none flex justify-center items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/30"
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
              className="flex-1 sm:flex-none flex justify-center items-center gap-2 px-4 py-2 bg-rose-100 text-rose-600 rounded-xl text-sm font-bold shadow-lg shadow-rose-500/10 disabled:opacity-70"
            >
              <Trash2 className="w-4 h-4" />
              {isDeletingAll ? "Deleting..." : "Delete All"}
            </motion.button>
          )}
          <div className="flex flex-wrap w-full sm:w-auto gap-2">
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
              className="flex-1 sm:flex-none flex justify-center items-center gap-2 px-4 py-2 bg-indigo-100 text-indigo-700 rounded-xl text-sm font-bold shadow-lg shadow-indigo-500/10"
            >
              <Download className="w-4 h-4" /> Export
            </motion.button>
            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="flex-1 sm:flex-none flex justify-center items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/10 disabled:opacity-70"
            >
              <Upload className="w-4 h-4" /> {isImporting ? 'Importing...' : 'Import'}
            </motion.button>

            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsAddModalOpen(true)}
              className="w-full sm:w-auto flex justify-center items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/30"
            >
              <Plus className="w-4 h-4" /> {t('Add Customer')}
            </motion.button>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader className="flex flex-col sm:flex-row items-start sm:items-center justify-between space-y-4 sm:space-y-0 pb-4">
          <div className="flex flex-1 items-center gap-4 w-full">
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
            
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => setShowFaultyOnly(!showFaultyOnly)}
              className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all duration-300 ${
                showFaultyOnly 
                  ? 'bg-amber-100 text-amber-700 shadow-lg shadow-amber-500/20' 
                  : 'bg-slate-100 text-slate-600'
              }`}
            >
              <AlertTriangle className={`w-4 h-4 ${showFaultyOnly ? 'animate-pulse' : ''}`} />
              <span>{showFaultyOnly ? 'Showing Faulty' : 'Show Faulty'}</span>
              <div className={`w-8 h-4 rounded-full relative transition-colors duration-300 ${showFaultyOnly ? 'bg-amber-500' : 'bg-slate-300'}`}>
                <motion.div 
                  animate={{ x: showFaultyOnly ? 16 : 2 }}
                  className="absolute top-1 w-2 h-2 bg-white rounded-full"
                />
              </div>
            </motion.button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="hidden md:block overflow-x-auto">
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
                      <div className="flex justify-end items-center gap-1">
                        <button 
                          className="p-1 hover:bg-emerald-50 text-emerald-600 rounded-lg transition-colors"
                          onClick={(e) => handleOpenIndividualNotify(e, customer)}
                          title="Message Customer"
                        >
                          <Send className="w-4 h-4" />
                        </button>
                        <button 
                          className="p-1 hover:bg-black/10 rounded-lg transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleRowClick(customer);
                          }}
                        >
                          <MoreVertical className="w-4 h-4 neu-text-muted" />
                        </button>
                      </div>
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
          </div>
            
          <div className="md:hidden flex flex-col gap-3 mt-4 mb-4">
            <div className="flex items-center gap-2 px-1 pb-2 border-b border-[var(--shadow-dark)]">
               <input 
                 type="checkbox"
                 checked={selectedIds.length === paginatedCustomers.length && paginatedCustomers.length > 0}
                 onChange={(e) => {
                   if (e.target.checked) setSelectedIds(paginatedCustomers.map(c => c.id));
                   else setSelectedIds([]);
                 }}
                 className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
               />
               <span className="text-xs font-bold uppercase neu-text-muted tracking-widest leading-none mt-0.5">Select All Visible</span>
            </div>
            {paginatedCustomers.map((customer, i) => (
              <motion.div
                key={customer.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                onClick={() => handleRowClick(customer)}
                className="neu-flat p-4 flex flex-col gap-3 relative cursor-pointer border border-[var(--shadow-dark)]"
              >
                <div className="flex justify-between items-start">
                   <div className="flex gap-4">
                      <div className="pt-0.5">
                        <input 
                          type="checkbox"
                          checked={selectedIds.includes(customer.id)}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => {
                            if (e.target.checked) setSelectedIds([...selectedIds, customer.id]);
                            else setSelectedIds(selectedIds.filter(id => id !== customer.id));
                          }}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                        />
                      </div>
                      <div>
                        <h4 className="font-bold text-base leading-tight tracking-tight">{customer.name}</h4>
                        <p className="text-[10px] neu-text-muted font-mono mt-0.5 opacity-70">{customer.id}</p>
                      </div>
                   </div>
                   <span className={`px-2 py-1 rounded-full text-[9px] font-black tracking-wider uppercase flex-shrink-0 ${
                     customer.status === 'Active' ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'
                   }`}>
                     {customer.status}
                   </span>
                </div>
                <div className="flex justify-between items-end mt-1 pl-8">
                  <span className="text-xs neu-text-muted font-medium opacity-80">{customer.mobileNumber}</span>
                  <span className="text-lg font-black tracking-tight">{formatCurrency(customer.balance)}</span>
                </div>
                <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-[var(--shadow-dark)]">
                   <motion.button
                     whileTap={{ scale: 0.95 }}
                     onClick={(e) => handleOpenIndividualNotify(e, customer)}
                     className="px-4 py-2 bg-emerald-50 text-emerald-600 rounded-lg text-xs font-bold flex items-center gap-2"
                   >
                     <Send className="w-3.5 h-3.5" /> Message
                   </motion.button>
                   <motion.button
                     whileTap={{ scale: 0.95 }}
                     onClick={() => handleRowClick(customer)}
                     className="px-4 py-2 bg-slate-100 text-slate-600 rounded-lg text-xs font-bold flex items-center gap-2"
                   >
                     <MoreVertical className="w-3.5 h-3.5" /> Details
                   </motion.button>
                </div>
              </motion.div>
            ))}
            {filteredCustomers.length === 0 && (
              <div className="py-8 text-center text-sm font-medium neu-text-muted">No customers found.</div>
            )}
          </div>
            
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
                    disabled={isSavingUser}
                    className="px-6 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
                  >
                    {isSavingUser ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    {isSavingUser ? "Saving..." : "Save Customer"}
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
                      disabled={isSavingUser}
                      className="px-6 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
                    >
                      {isSavingUser ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                      {isSavingUser ? "Saving..." : "Save Changes"}
                    </button>
                  </div>
                </div>
              </form>
            </motion.div>
          </div>
        )}

        {/* Individual Notify Modal */}
        {isIndividualNotifyOpen && individualNotifyCustomer && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="neu-bg p-6 rounded-2xl w-full max-w-md shadow-2xl border border-white/20"
            >
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h3 className="text-xl font-bold">Message Customer</h3>
                  <p className="text-xs neu-text-muted">Sending to {individualNotifyCustomer.name}</p>
                </div>
                <button 
                  onClick={() => setIsIndividualNotifyOpen(false)}
                  className="p-2 hover:bg-black/10 rounded-full transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-bold uppercase tracking-wider neu-text-muted mb-2">
                    Quick Messages
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {preloadedMessages.slice(0, 3).map((msg, idx) => (
                      <button
                        key={idx}
                        onClick={() => setNotifyMessage(`Hi ${individualNotifyCustomer?.name || ''},\n${msg}`)}
                        className="px-3 py-1.5 neu-flat hover:bg-blue-50 hover:text-blue-600 rounded-lg text-xs transition-colors"
                      >
                        {msg.split('.')[0]}...
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-bold uppercase tracking-wider neu-text-muted mb-2">
                    Your Message
                  </label>
                  <textarea
                    value={notifyMessage}
                    onChange={e => setNotifyMessage(e.target.value)}
                    placeholder="Type your message here..."
                    className="w-full h-32 px-4 py-3 neu-pressed rounded-xl bg-transparent outline-none text-sm font-medium resize-none focus:ring-2 focus:ring-emerald-500/50 mb-2"
                  />
                  <div className="flex items-center gap-2">
                    <label className={`flex items-center gap-2 px-3 py-2 cursor-pointer bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm font-bold ${isUploadingAttachment ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      {isUploadingAttachment ? <span className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></span> : <Paperclip className="w-4 h-4" />}
                      {isUploadingAttachment ? 'Uploading...' : 'Attach File'}
                      <input type="file" className="hidden" disabled={isUploadingAttachment} onChange={handleUploadAttachment} />
                    </label>
                    <span className="text-xs text-gray-500">Uploads a file & appends a link</span>
                  </div>
                </div>

                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={handleSendIndividualNotify}
                  disabled={isSendingNotify || !notifyMessage.trim()}
                  className="w-full py-4 bg-emerald-600 text-white rounded-2xl font-bold shadow-lg shadow-emerald-500/30 flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSendingNotify ? <Loader2 className="w-5 h-5 animate-spin" /> : <Send className="w-5 h-5" />}
                  {isSendingNotify ? "Sending..." : "Send via WhatsApp"}
                </motion.button>
              </div>
            </motion.div>
          </div>
        )}

        {/* Upload Staging Modal */}
        {isUploadStagingModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="neu-bg p-6 rounded-2xl w-full max-w-4xl shadow-2xl border border-white/20 max-h-[80vh] flex flex-col"
            >
              <h3 className="text-xl font-bold mb-4">Review Bulk Upload ({stagingCustomers.length} records)</h3>
              <p className="text-xs neu-text-muted mb-4">Edit details below if needed before confirming the upload.</p>
              <div className="flex-1 overflow-auto rounded-xl">
                <table className="w-full text-sm text-left">
                  <thead>
                     <tr className="text-xs text-slate-500 uppercase bg-black/5">
                        <th className="p-3 rounded-tl-xl">Name</th>
                        <th className="p-3">Mobile</th>
                        <th className="p-3 rounded-tr-xl">Balance</th>
                     </tr>
                  </thead>
                  <tbody>
                    {stagingCustomers.slice((stagingPage-1)*stagingLimit, stagingPage*stagingLimit).map((c, i) => {
                      const globalIndex = (stagingPage-1)*stagingLimit + i;
                      const updateField = (field: string, value: string) => {
                        const newArr = [...stagingCustomers];
                        newArr[globalIndex] = { ...newArr[globalIndex], [field]: field === 'balance' ? parseFloat(value) || 0 : value };
                        setStagingCustomers(newArr);
                      };
                      return (
                        <tr key={i} className="border-b border-black/5">
                          <td className="p-2">
                            <input 
                              value={c.name} 
                              onChange={e => updateField('name', e.target.value)} 
                              className="w-full bg-transparent outline-none p-1 border-b border-transparent focus:border-indigo-500 transition"
                            />
                          </td>
                          <td className="p-2">
                            <input 
                              value={c.mobileNumber} 
                              onChange={e => updateField('mobileNumber', e.target.value)} 
                              className="w-full bg-transparent outline-none p-1 border-b border-transparent focus:border-indigo-500 transition"
                            />
                          </td>
                          <td className="p-2">
                            <input 
                              type="number"
                              value={c.balance} 
                              onChange={e => updateField('balance', e.target.value)} 
                              className="w-full bg-transparent outline-none p-1 border-b border-transparent focus:border-indigo-500 transition"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <div className="flex justify-between items-center mt-6 pt-4 border-t border-black/10">
                 <div className="flex gap-2 items-center">
                    <button onClick={() => setStagingPage(p=>Math.max(1, p-1))} className="neu-flat px-3 py-1.5 rounded-lg text-sm">Prev</button>
                    <span className="text-sm font-medium">Page {stagingPage} of {Math.ceil(stagingCustomers.length/stagingLimit)}</span>
                    <button onClick={() => setStagingPage(p=>Math.min(Math.ceil(stagingCustomers.length/stagingLimit), p+1))} className="neu-flat px-3 py-1.5 rounded-lg text-sm">Next</button>
                 </div>
                 <div className="flex gap-4">
                    <button onClick={() => setIsUploadStagingModalOpen(false)} className="px-6 py-2 neu-flat rounded-xl font-medium">Cancel</button>
                    <button onClick={confirmBulkUpload} className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold shadow-lg">Confirm Upload</button>
                 </div>
              </div>
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
                          <Loader2 className="w-4 h-4 animate-spin" />
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
      >
        {confirmConfig.children}
      </ConfirmModal>
    </motion.div>
  );
}
