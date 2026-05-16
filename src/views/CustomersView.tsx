import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Users, Search, Plus, MoreVertical, X, Trash2, Bell, Send, Upload, Download, Loader2, AlertTriangle, Paperclip, Link as LinkIcon } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import React, { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Customer, addCustomer, updateCustomer, deleteCustomer, deleteCustomersBatch, updateCustomersBatchStatus, deleteAllCustomers, AppSettings } from "../lib/db";
import { useData } from "../contexts/DataContext";
import { useTranslation } from "react-i18next";
import { ConfirmModal } from "../components/ConfirmModal";
import { sendWhatsAppNotification } from "../lib/automation";
import { createPortalLink } from "../lib/portal";
import * as XLSX from 'xlsx';
import { v4 as uuidv4 } from "uuid";
import { db, auth } from "../firebase";
import { writeBatch, doc } from "firebase/firestore";

const CustomerTableRow = React.memo(({ 
  customer, 
  index, 
  isSelected, 
  onToggleSelect, 
  onRowClick, 
  onShareLink, 
  onMessage, 
  formatCurrency 
}: { 
  customer: Customer; 
  index: number; 
  isSelected: boolean; 
  onToggleSelect: (id: string, checked: boolean) => void;
  onRowClick: (c: Customer) => void;
  onShareLink: (e: React.MouseEvent, c: Customer) => void;
  onMessage: (e: React.MouseEvent, c: Customer) => void;
  formatCurrency: (amount: number) => string;
}) => {
  return (
    <motion.tr 
      key={customer.id}
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index * 0.01, 0.5) }}
      whileHover={{ backgroundColor: "rgba(var(--accent-rgb), 0.05)" }}
      onClick={() => onRowClick(customer)}
      className="border-b border-[var(--shadow-dark)] last:border-0 transition-colors cursor-pointer group"
    >
      <td className="px-4 py-4" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center justify-center">
            <input 
              type="checkbox"
              checked={isSelected}
              onChange={(e) => onToggleSelect(customer.id, e.target.checked)}
              className="w-4 h-4 rounded border-[var(--shadow-dark)] text-[var(--accent)] focus:ring-[var(--accent)] cursor-pointer"
            />
          </div>
        </td>
        <td className="px-4 py-4 font-mono text-[10px] uppercase tracking-tighter opacity-60 group-hover:opacity-100 transition-opacity whitespace-nowrap">{customer.id}</td>
      <td className="px-4 py-4 font-black uppercase tracking-tight text-sm whitespace-nowrap">{customer.name}</td>
      <td className="px-4 py-4 text-xs font-bold neu-text-muted whitespace-nowrap">{customer.mobileNumber}</td>
      <td className="px-4 py-4">
        <div className="flex flex-col gap-1">
          <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest inline-flex items-center gap-1.5 w-fit ${
            customer.status === 'Active' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-red-500/10 text-red-600 border border-red-500/20'
          }`}>
            <span className={`w-1.5 h-1.5 rounded-full ${customer.status === 'Active' ? 'bg-emerald-500' : 'bg-red-500'}`} />
            {customer.status}
          </span>
          {customer.status === 'Faulty' && (
            <div className="text-[9px] text-red-500 font-black uppercase tracking-tighter flex items-center gap-1 animate-pulse">
              <AlertTriangle className="w-3 h-3" />
              <span>Conflict Detected</span>
            </div>
          )}
        </div>
      </td>
      <td className="px-4 py-4 font-black text-[var(--accent)] text-base whitespace-nowrap">{formatCurrency(customer.balance)}</td>
      <td className="px-4 py-4 text-right">
        <div className="flex justify-end items-center gap-2">
          <motion.button 
            whileHover={{ scale: 1.1, backgroundColor: 'rgba(59, 130, 246, 0.1)' }}
            whileTap={{ scale: 0.9 }}
            className="p-2 neu-flat-sm text-blue-600 rounded-xl transition-all"
            onClick={(e) => onShareLink(e, customer)}
            title="Generate & Share Link"
          >
            <LinkIcon className="w-4 h-4" />
          </motion.button>
          <motion.button 
            whileHover={{ scale: 1.1, backgroundColor: 'rgba(16, 185, 129, 0.1)' }}
            whileTap={{ scale: 0.9 }}
            className="p-2 neu-flat-sm text-emerald-600 rounded-xl transition-all"
            onClick={(e) => onMessage(e, customer)}
            title="Message Customer"
          >
            <Send className="w-4 h-4" />
          </motion.button>
          <motion.button 
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            className="p-2 neu-flat-sm rounded-xl transition-all"
            onClick={(e) => {
              e.stopPropagation();
              onRowClick(customer);
            }}
          >
            <MoreVertical className="w-4 h-4 neu-text-muted" />
          </motion.button>
        </div>
      </td>
    </motion.tr>
  );
});

const CustomerMobileCard = React.memo(({ 
  customer, 
  index, 
  isSelected, 
  onToggleSelect, 
  onRowClick, 
  onShareLink, 
  onMessage, 
  formatCurrency,
  t 
}: { 
  customer: Customer; 
  index: number; 
  isSelected: boolean; 
  onToggleSelect: (id: string, checked: boolean) => void;
  onRowClick: (c: Customer) => void;
  onShareLink: (e: React.MouseEvent, c: Customer) => void;
  onMessage: (e: React.MouseEvent, c: Customer) => void;
  formatCurrency: (amount: number) => string;
  t: any;
}) => {
  return (
    <motion.div
      key={customer.id}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.05, 0.5) }}
      onClick={() => onRowClick(customer)}
      className="neu-flat p-5 flex flex-col gap-4 relative cursor-pointer border-none border-t border-white/5 active:neu-pressed transition-all"
    >
      <div className="flex justify-between items-start">
         <div className="flex gap-4">
            <div className="pt-0.5" onClick={e => e.stopPropagation()}>
              <input 
                type="checkbox"
                checked={isSelected}
                onChange={(e) => onToggleSelect(customer.id, e.target.checked)}
                className="w-5 h-5 rounded border-[var(--shadow-dark)] text-[var(--accent)] focus:ring-[var(--accent)]"
              />
            </div>
            <div>
              <h4 className="font-black text-base uppercase tracking-tight leading-tight">{customer.name}</h4>
              <p className="text-[10px] neu-text-muted font-bold mt-1 opacity-60 uppercase tracking-widest">{customer.id}</p>
            </div>
         </div>
         <span className={`px-2.5 py-1 rounded-lg text-[9px] font-black tracking-widest uppercase flex items-center gap-1.5 flex-shrink-0 ${
           customer.status === 'Active' ? 'bg-emerald-500/10 text-emerald-600 border border-emerald-500/20' : 'bg-red-500/10 text-red-600 border border-red-500/20'
         }`}>
           <span className={`w-1.5 h-1.5 rounded-full ${customer.status === 'Active' ? 'bg-emerald-500' : 'bg-red-50'}`} />
           {customer.status}
         </span>
      </div>
      {customer.status === 'Faulty' && (
        <div className="text-[10px] text-red-500 font-black uppercase tracking-widest mt-1 bg-red-500/10 px-3 py-2 rounded-xl flex items-center gap-2 animate-pulse border border-red-500/20">
          <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
          <span>Sync Failure: Fix Required</span>
        </div>
      )}
      <div className="flex justify-between items-center bg-black/5 p-3 rounded-xl">
        <span className="text-xs neu-text font-black tracking-tighter opacity-80">{customer.mobileNumber}</span>
        <span className="text-xl font-black tracking-tighter text-[var(--accent)]">{formatCurrency(customer.balance)}</span>
      </div>
      <div className="flex justify-end gap-2 mt-2">
         <motion.button
           whileTap={{ scale: 0.95 }}
           onClick={(e) => onShareLink(e, customer)}
           className="flex-1 py-3 bg-blue-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-blue-500/20"
         >
           <LinkIcon className="w-3.5 h-3.5" /> Portal
         </motion.button>
         <motion.button
           whileTap={{ scale: 0.95 }}
           onClick={(e) => onMessage(e, customer)}
           className="flex-1 py-3 bg-emerald-600 text-white rounded-xl text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
         >
           <Send className="w-3.5 h-3.5" /> Notify
         </motion.button>
         <motion.button
           whileTap={{ scale: 0.95 }}
           onClick={() => onRowClick(customer)}
           className="p-3 neu-flat rounded-xl text-slate-600 flex items-center justify-center"
         >
           <MoreVertical className="w-4 h-4" />
         </motion.button>
      </div>
    </motion.div>
  );
});

export function CustomersView() {
  const { t } = useTranslation();
  const { customers, settings } = useData();
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [isNotifyModalOpen, setIsNotifyModalOpen] = useState(false);
  const [isIndividualNotifyOpen, setIsIndividualNotifyOpen] = useState(false);
  const [individualNotifyCustomer, setIndividualNotifyCustomer] = useState<Customer | null>(null);
  const [notifyMessage, setNotifyMessage] = useState("");
  const [isSendingNotify, setIsSendingNotify] = useState(false);
  const [notifyProgress, setNotifyProgress] = useState(0);
  const [isGeneratingLink, setIsGeneratingLink] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [sortConfig, setSortConfig] = useState<{ key: keyof Customer; direction: 'asc' | 'desc' } | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [isDeletingAll, setIsDeletingAll] = useState(false);
  const [showFaultyOnly, setShowFaultyOnly] = useState(false);
  const [filterStatus, setFilterStatus] = useState<'all' | 'Active' | 'Suspended'>('all');
  const [isImporting, setIsImporting] = useState(false);
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [customAttachment, setCustomAttachment] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const broadcastFileInputRef = useRef<HTMLInputElement>(null);

  const filteredCustomers = useMemo(() => {
    const searchTerms = searchQuery.toLowerCase().split(' ').filter(term => term.trim() !== '');
    return customers.filter(c => {
      const searchStr = `${c.name} ${c.id} ${c.mobileNumber} ${c.status || ''}`.toLowerCase();
      const matchesSearch = searchTerms.length === 0 || searchTerms.every(term => searchStr.includes(term));
      
      const matchesStatus = filterStatus === 'all' || c.status === filterStatus;
      
      if (showFaultyOnly) {
        return matchesSearch && c.status === 'Faulty';
      } else {
        return matchesSearch && matchesStatus && c.status !== 'Faulty';
      }
    });
  }, [customers, searchQuery, showFaultyOnly, filterStatus]);

  const sortedCustomers = useMemo(() => {
    return [...filteredCustomers].sort((a, b) => {
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
  }, [filteredCustomers, sortConfig]);

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
      const jsonData = XLSX.utils.sheet_to_json<any>(worksheet, { defval: "" });

      const parsedCustomers = jsonData.map(row => {
          const keys = Object.keys(row);
          const nameKey = keys.find(k => k.toLowerCase().includes('name') || k.toLowerCase().includes('customer')) || keys[0];
          const mobileKey = keys.find(k => k.toLowerCase().includes('mobile') || k.toLowerCase().includes('phone') || k.toLowerCase().includes('number') || k.toLowerCase().includes('contact')) || (keys.length > 1 ? keys[1] : keys[0]);
          const balanceKey = keys.find(k => k.toLowerCase().includes('balance') || k.toLowerCase().includes('due') || k.toLowerCase().includes('amount')) || (keys.length > 2 ? keys[2] : "");
          const statusKey = keys.find(k => k.toLowerCase().includes('status') || k.toLowerCase().includes('state')) || "";

          return {
              id: `CUST-${uuidv4().substring(0, 8).toUpperCase()}`,
              name: String(row[nameKey] || row.Name || row.name || row.Customer || "Unnamed").trim() || "Unnamed",
              mobileNumber: String(row[mobileKey] || row.Mobile || row.mobile || row.Phone || row.mobileNumber || "0000000000").trim() || "0000000000",
              balance: parseFloat(row[balanceKey] || row.Balance || row.balance || "0") || 0,
              status: (row[statusKey] || row.Status || row.status || "Active").toString().toLowerCase() === "suspended" ? "Suspended" : "Active",
              ownerId: auth.currentUser?.uid,
              createdAt: new Date().toISOString()
          };
      });
      
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
      const batchLimit = 200;
      for (let i = 0; i < stagingCustomers.length; i += batchLimit) {
        const batch = writeBatch(db);
        const chunk = stagingCustomers.slice(i, i + batchLimit);
        for (const customer of chunk) {
          const docRef = doc(db, 'customers', customer.id);
          batch.set(docRef, customer);
        }
        try {
          await batch.commit();
          if (i + batchLimit < stagingCustomers.length) {
            await new Promise(r => setTimeout(r, 500));
          }
        } catch(e: any) {
          if (e.code === 'resource-exhausted') {
            showAlert("Quota Exceeded", "Firebase free limits reached during import.");
            break;
          }
          throw e; // Rethrow others to get caught by outer catch block
        }
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
    if (settings) {
      import("../services/whatsappService").then(({ whatsappService }) => {
        whatsappService.updateConfig(
          settings.metaWhatsAppApiKey || null, 
          settings.metaWhatsAppPhoneNumberId || null, 
          settings.watiAccessToken || null,
          settings.watiApiEndpoint || null
        );
      });
    }
  }, [settings]);

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
    const cleanMobileNew = newCustomer.mobileNumber ? newCustomer.mobileNumber.replace(/\D/g, '') : '';
    if (!cleanMobileNew || cleanMobileNew.length < 10 || cleanMobileNew === '0000000000') {
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
    addCustomer({ ...newCustomer, status: finalStatus }).then(() => {
      // Send Welcome Message
      if (settings && settings.automation && finalStatus === 'Active') {
         let message = `Welcome ${newCustomer.name} to our service! We are happy to have you on board.`;
         sendWhatsAppNotification({...newCustomer, status: finalStatus} as Customer, message, settings, undefined, undefined, false, true, 'welcome').catch(err => console.error("Auto notify welcome error:", err));
      }
    }).catch((err: any) => {
      if (err.message && err.message.includes('Quota')) {
        showAlert("Database Quota Exceeded", "Your Firebase free tier limit has been reached. Please try again tomorrow or upgrade your Firebase plan. Read more: https://console.firebase.google.com");
      } else {
        console.error("Failed to add customer to remote server:", err);
      }
    });
    setIsAddModalOpen(false);
    setNewCustomer({ name: "", mobileNumber: "", status: "Active", balance: 0 });
    setCurrentPage(1);
    setIsSavingUser(false);
  };

  const handleUpdateCustomer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingCustomer) {
      const cleanMobileUpdate = editingCustomer.mobileNumber ? editingCustomer.mobileNumber.replace(/\D/g, '') : '';
      const isMobileInvalid = !cleanMobileUpdate || cleanMobileUpdate.length < 10 || cleanMobileUpdate === '0000000000';
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
      updateCustomer({...editingCustomer, status: finalStatus}).catch((err: any) => {
        if (err.message && err.message.includes('Quota')) {
          showAlert("Database Quota Exceeded", "Your Firebase free tier limit has been reached. Please try again tomorrow or upgrade your Firebase plan. Read more: https://console.firebase.google.com");
        } else {
          console.error("Failed to update customer to remote server:", err);
        }
      });
      
      if (statusChanged && settings && settings.automation && finalStatus !== 'Suspended') {
         let message = `Dear ${editingCustomer.name}, your account status has been updated to ${finalStatus}.`;
         sendWhatsAppNotification({...editingCustomer, status: finalStatus}, message, settings, undefined, undefined, false, true, 'broadcast').catch(err => console.error("Auto notify status error:", err));
      }

      setIsEditModalOpen(false);
      setEditingCustomer(null);
      setIsSavingUser(false);
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
        updateCustomer({...customer, status: newStatus}).catch(err => {
          showAlert("Error", "Failed to change status on remote server. " + (err.message?.includes('Quota') ? "Database quota exceeded." : ""));
        });
        if (settings && settings.automation) {
           let message = `Dear ${customer.name}, your account status has been updated to ${newStatus}.`;
           if (newStatus === 'Suspended') message += ` Please contact support to resolve any outstanding issues.`;
           sendWhatsAppNotification({...customer, status: newStatus}, message, settings, undefined, undefined, false, true, newStatus === 'Suspended' ? 'suspension' : 'broadcast').catch(err => console.error("Auto notify isolate error:", err));
        }
        setIsEditModalOpen(false);
        setEditingCustomer(null);
      }
    });
  };

  const handleRenotify = async (customer: Customer) => {
    if (!settings) return;
    if (customer.status === 'Suspended') {
      showAlert("Cannot Send", "This customer is suspended.");
      return;
    }
    const message = `Your payment details for your water bill have been confirmed. Thank you for your payment.`;
    await sendWhatsAppNotification(customer, message, settings, undefined, undefined, false, true, 'receipt');
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
        try {
          await deleteCustomersBatch(selectedIds);
          setSelectedIds([]);
        } catch (err: any) {
          showAlert("Error", "Failed to delete customers. " + (err.message?.includes('Quota') ? "Database quota exceeded." : ""));
        }
      }
    });
  };

  const handleUpdateStatusBatch = (status: 'Active' | 'Suspended') => {
    setConfirmConfig({
      isOpen: true,
      title: `${status === 'Active' ? 'Activate' : 'Suspend'} Selected Customers`,
      message: `Are you sure you want to mark ${selectedIds.length} customers as ${status}?`,
      isDestructive: status === 'Suspended',
      showCancel: true,
      onConfirm: async () => {
        try {
          await updateCustomersBatchStatus(selectedIds, status);
          setSelectedIds([]);
        } catch (err: any) {
          showAlert("Error", `Failed to ${status === 'Active' ? 'activate' : 'suspend'} customers. ` + (err.message?.includes('Quota') ? "Database quota exceeded." : ""));
        }
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
        try {
          await deleteCustomer(id);
          setSelectedIds(prev => prev.filter(selectedId => selectedId !== id));
          setIsEditModalOpen(false);
          setEditingCustomer(null);
        } catch (err: any) {
          showAlert("Error", "Failed to delete customer. " + (err.message?.includes('Quota') ? "Database quota exceeded." : ""));
        }
      }
    });
  };

  const handleRowClick = (customer: Customer) => {
    setEditingCustomer(customer);
    setIsEditModalOpen(true);
  };

  const handleShareLink = async (e: React.MouseEvent, customer: Customer) => {
    e.stopPropagation();
    if (!settings) {
      alert("Settings not loaded yet.");
      return;
    }
    
    // Open modal immediately to provide instant feedback
    setIndividualNotifyCustomer(customer);
    setNotifyMessage(`Hi ${customer.name},\nGenerating your secure portal link...`);
    setIsIndividualNotifyOpen(true);
    setIsGeneratingLink(true);

    try {
      const link = await createPortalLink(customer, settings);
      const text = `Hi ${customer.name},\nHere is your secure portal link to view your invoice, generate QR and pay online:\n\n${link}\n\nThank you!`;
      setNotifyMessage(text);
    } catch(err: any) {
      console.error("Error generating link:", err);
      setNotifyMessage(`Hi ${customer.name},\n(Error generating link: ${err.message})`);
    } finally {
      setIsGeneratingLink(false);
    }
  };

  const handleOpenIndividualNotify = (e: React.MouseEvent, customer: Customer) => {
    e.stopPropagation();
    setIndividualNotifyCustomer(customer);
    setNotifyMessage(`Hi ${customer.name},\n`);
    setIsIndividualNotifyOpen(true);
  };

  const [individualAttachment, setIndividualAttachment] = useState<File | null>(null);

  const handleUploadAttachment = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setIndividualAttachment(file);
    e.target.value = ''; // clear input
  };

  const handleSendIndividualNotify = async () => {
    if (!individualNotifyCustomer || !notifyMessage.trim() || !settings) return;
    
    if (individualNotifyCustomer.status === 'Suspended') {
      showAlert("Cannot Send", "This customer is suspended. Please make them active first to send messages.");
      return;
    }

    const hasMeta = !!(settings.metaWhatsAppApiKey && settings.metaWhatsAppPhoneNumberId);
    const hasWati = !!settings.watiAccessToken;
    
    const sendFn = async (preferredMethod: string) => {
      setIsSendingNotify(true);
      try {
        const tempSettings = { ...settings, preferredNotificationMethod: preferredMethod };
        const message = notifyMessage;
        const result = await sendWhatsAppNotification(individualNotifyCustomer, message, tempSettings, individualAttachment || undefined, individualAttachment?.name, false, true, 'broadcast');
        
        if (result.success) {
          showAlert("Success", `Message sent to ${individualNotifyCustomer.name}${result.fellBackToManual ? ' (opened in WhatsApp App)' : ''}.`);
          setIsIndividualNotifyOpen(false);
          setIndividualNotifyCustomer(null);
          setNotifyMessage("");
          setIndividualAttachment(null);
        } else {
          showAlert("Failed", result.error || "Could not send notification.");
        }
      } catch (err) {
        showAlert("Error", "An unexpected error occurred.");
      } finally {
        setIsSendingNotify(false);
      }
    };

    if (hasMeta && hasWati) {
       const providerRef = { current: settings.preferredNotificationMethod === 'wati' ? 'wati' : 'api' };
       const deliveryRef = { current: 'api' };
       
       setConfirmConfig({
          isOpen: true,
          title: "Select Sending Method",
          message: "Both Meta and WATI APIs are configured. Select how to send this message:",
          isDestructive: false,
          showCancel: true,
          children: (
            <div className="flex flex-col gap-4 mt-2">
              <div className="space-y-2">
                 <label className="text-sm font-semibold">WhatsApp Provider</label>
                 <select onChange={(e) => providerRef.current = e.target.value} defaultValue={providerRef.current} className="w-full px-3 py-2 bg-[var(--bg-color)] border border-[var(--shadow-light)] rounded-lg text-sm">
                   <option value="api">Meta Official API</option>
                   <option value="wati">WATI API</option>
                 </select>
              </div>
              <div className="space-y-2">
                 <label className="text-sm font-semibold">Delivery Method</label>
                 <select onChange={(e) => deliveryRef.current = e.target.value} defaultValue="api" className="w-full px-3 py-2 bg-[var(--bg-color)] border border-[var(--shadow-light)] rounded-lg text-sm">
                   <option value="api">Automated (Background via API)</option>
                   <option value="manual_link">Manual: WhatsApp App/Web</option>
                 </select>
              </div>
            </div>
          ),
          onConfirm: () => {
             setConfirmConfig(prev => ({...prev, isOpen: false}));
             sendFn(deliveryRef.current === 'manual_link' ? 'manual_link' : providerRef.current);
          }
       });
    } else {
       sendFn(settings.preferredNotificationMethod || 'api');
    }
  };

  const deliveryModeRef = useRef("api");

  const handleNotifyActive = async () => {
    let targetCustomers = customers.filter(c => c.status === 'Active');
    
    // If user has manually checked boxes, only notify them
    if (selectedIds.length > 0) {
      targetCustomers = customers.filter(c => selectedIds.includes(c.id!));
    }

    if (targetCustomers.length === 0) {
      showAlert("No Targets", "There are no valid customers to notify based on your selection.");
      return;
    }

    if (!notifyMessage.trim()) {
      showAlert("Empty Message", "Please type a message or select a preloaded one.");
      return;
    }

    if (!settings) return;

    const hasMeta = !!(settings.metaWhatsAppApiKey && settings.metaWhatsAppPhoneNumberId);
    const hasWati = !!settings.watiAccessToken;
    const hasAnyApi = hasMeta || hasWati;

    setIsNotifyModalOpen(false);

    const providerRef = { current: settings.preferredNotificationMethod === 'wati' ? 'wati' : 'api' };
    const deliveryRef = { current: hasAnyApi ? 'api' : 'broadcast' };

    setConfirmConfig({
      isOpen: true,
      title: "Send Bulk Notification",
      message: `Send custom message to ${targetCustomers.length} target(s)?`,
      isDestructive: false,
      showCancel: true,
      children: (
        <div className="flex flex-col gap-4 mt-2">
          {hasMeta && hasWati && (
             <div className="space-y-2">
               <label className="text-sm font-semibold">WhatsApp Provider</label>
               <select 
                 className="w-full px-3 py-2 bg-[var(--bg-color)] border border-[var(--shadow-light)] rounded-lg text-sm"
                 onChange={(e) => providerRef.current = e.target.value}
                 defaultValue={providerRef.current}
               >
                 <option value="api">Meta Official API</option>
                 <option value="wati">WATI API</option>
               </select>
             </div>
          )}
          <div className="space-y-2">
            <label className="text-sm font-semibold">Delivery Method</label>
            <select 
              className="w-full px-3 py-2 bg-[var(--bg-color)] border border-[var(--shadow-light)] rounded-lg text-sm"
              onChange={(e) => deliveryRef.current = e.target.value}
              defaultValue={deliveryRef.current}
            >
              {hasAnyApi && <option value="api">Automated (Background via API)</option>}
              <option value="broadcast">Manual: WhatsApp App (Forward to Broadcast List)</option>
              <option value="web">Manual: WhatsApp Web (Manual Prompts - 1 by 1)</option>
            </select>
          </div>
        </div>
      ),
      onConfirm: async () => {
        setConfirmConfig(prev => ({...prev, isOpen: false}));

        if (deliveryRef.current === "broadcast") {
           const genericMessage = notifyMessage;
           const url = `https://wa.me/?text=${encodeURIComponent(genericMessage)}`;
           window.open(url, '_blank');
           setIsSendingNotify(false);
           setNotifyMessage("");
           return;
        }

        setIsSendingNotify(true);
        setNotifyProgress(0);
        
        let errors = [];
        const isApiMode = deliveryRef.current === "api";
        const selectedProvider = providerRef.current;
        
        // Pass the chosen provider via tempSettings
        const tempSettings = { ...settings, preferredNotificationMethod: selectedProvider };
        
        // If meta was not chosen, we can clear meta fields temporarily to ensure it doesn't default to it if WATI fails, 
        // but 'preferredNotificationMethod' is enough for automation.ts route.

        let combinedMessage = notifyMessage;

        for (let i = 0; i < targetCustomers.length; i++) {
          const customer = targetCustomers[i];
          const finalMsg = `Dear ${customer.name}, ${combinedMessage}`;
          
          let attachment: Blob | undefined = undefined;
          let fileName: string | undefined = undefined;
          if (customAttachment) {
            attachment = customAttachment;
            fileName = customAttachment.name;
          }

          const result = await sendWhatsAppNotification(customer, finalMsg, tempSettings, attachment, fileName, false, true, 'broadcast');
          if (!result.success) {
            errors.push(`${customer.name}: ${result.error}`);
          }

          setNotifyProgress(Math.floor(((i + 1) / targetCustomers.length) * 100));
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
              children: <></>, // Reset children
              onConfirm: () => {
                const genericMessage = `Important Notice:\n\n${notifyMessage}`;
                const url = `https://wa.me/?text=${encodeURIComponent(genericMessage)}`;
                window.open(url, '_blank');
                setConfirmConfig(prev => ({...prev, isOpen: false}));
              }
            });
          } else {
            showAlert("Completed with Errors", `Notifications finished with some errors:\n\n${errors.join('\n')}`);
          }
        } else {
          showAlert("Success", "All selected customers notified successfully!");
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
      
      const result = await sendWhatsAppNotification(customer, message, settings as AppSettings, undefined, undefined, true, true, 'broadcast');
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

  const totalPages = Math.ceil(sortedCustomers.length / itemsPerPage);
  const paginatedCustomers = useMemo(() => sortedCustomers.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  ), [sortedCustomers, currentPage, itemsPerPage]);

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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div>
          <h2 className="text-3xl font-black tracking-tight uppercase">{t('Customers')}</h2>
          <p className="neu-text-muted flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] mt-1">
            <span className="w-2 h-2 rounded-full bg-[var(--accent)]" />
            {t('Manage Accounts')}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full sm:w-auto">
          {selectedIds.length > 0 && (
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="flex flex-wrap items-center gap-2 pr-4 border-r border-[var(--shadow-dark)]"
            >
              <button 
                onClick={() => handleUpdateStatusBatch('Active')}
                className="flex-1 sm:flex-none flex justify-center items-center gap-2 px-4 py-3 bg-emerald-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-emerald-500/20 hover:bg-emerald-600 transition-colors"
              >
                Activate
              </button>
              <button 
                onClick={() => handleUpdateStatusBatch('Suspended')}
                className="flex-1 sm:flex-none flex justify-center items-center gap-2 px-4 py-3 bg-amber-500 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-amber-500/20 hover:bg-amber-600 transition-colors"
              >
                Suspend
              </button>
              <button 
                onClick={() => setIsNotifyModalOpen(true)}
                className="flex-1 sm:flex-none flex justify-center items-center gap-2 px-4 py-3 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-blue-500/20 hover:bg-blue-700 transition-colors"
              >
                <Send className="w-4 h-4" />
                Broadcast
              </button>
              <button 
                onClick={handleDeleteBatch}
                className="flex-1 sm:flex-none flex justify-center items-center gap-2 px-4 py-3 bg-red-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-red-500/20 hover:bg-red-700 transition-colors"
              >
                <Trash2 className="w-4 h-4" />
                Kill ({selectedIds.length})
              </button>
            </motion.div>
          )}
          <div className="flex flex-wrap w-full sm:w-auto gap-3">
            <input 
              type="file" 
              accept=".xlsx,.xls,.csv" 
              className="hidden" 
              ref={fileInputRef} 
              onChange={handleFileUpload} 
            />
            <div className="p-1.5 neu-pressed rounded-2xl flex gap-1.5">
              <motion.button 
                whileHover={{ scale: 1.05, backgroundColor: 'rgba(255,255,255,0.1)' }}
                whileTap={{ scale: 0.95 }}
                onClick={handleExport}
                className="p-2.5 neu-flat-sm text-indigo-700 rounded-xl"
                title="Export Catalog"
              >
                <Download className="w-4 h-4" />
              </motion.button>
              <motion.button 
                whileHover={{ scale: 1.05, backgroundColor: 'rgba(255,255,255,0.1)' }}
                whileTap={{ scale: 0.95 }}
                onClick={() => fileInputRef.current?.click()}
                disabled={isImporting}
                className="p-2.5 neu-flat-sm text-emerald-700 rounded-xl disabled:opacity-50"
                title="Import Catalog"
              >
                <Upload className="w-4 h-4" />
              </motion.button>
            </div>

            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsNotifyModalOpen(true)}
              className="flex-1 sm:flex-none flex justify-center items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-blue-500/20"
            >
              <Bell className="w-4 h-4" /> Bulk Notify
            </motion.button>

            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={handleDeleteAll}
              disabled={isDeletingAll || customers.length === 0}
              className="flex-1 sm:flex-none flex justify-center items-center gap-2 px-6 py-3 bg-red-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-xl shadow-red-500/20 disabled:opacity-50"
            >
              <Trash2 className="w-4 h-4" /> Delete All
            </motion.button>

            <motion.button 
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={() => setIsAddModalOpen(true)}
              className="flex-1 sm:flex-none flex justify-center items-center gap-3 px-8 py-3 bg-[var(--accent)] text-white rounded-2xl text-[11px] font-black uppercase tracking-[0.1em] shadow-xl shadow-[var(--accent)]/30"
            >
              <Plus className="w-5 h-5" /> {t('Add Customer')}
            </motion.button>
          </div>
        </div>
      </div>

      <Card className="border-none border-t border-white/5">
        <CardHeader className="flex flex-col md:flex-row items-center justify-between gap-4 pb-4">
          <div className="flex flex-1 flex-col md:flex-row items-center gap-4 w-full">
            <div className="flex items-center gap-3 px-4 py-3 neu-pressed rounded-2xl w-full max-w-md group group-focus-within:ring-2 ring-[var(--accent)]/50 transition-all">
              <Search className="w-5 h-5 neu-text-muted group-focus-within:text-[var(--accent)]" />
              <input 
                type="text" 
                placeholder={t('Search Catalog...')} 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="bg-transparent border-none outline-none text-sm w-full neu-text font-bold placeholder:opacity-50"
              />
            </div>
            
            <div className="flex gap-2 w-full md:w-auto">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setShowFaultyOnly(!showFaultyOnly)}
                className={`flex-1 md:flex-none flex items-center justify-center gap-3 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${
                  showFaultyOnly 
                    ? 'neu-flat bg-amber-500 text-white shadow-lg shadow-amber-500/30' 
                    : 'neu-flat-sm neu-text-muted opacity-80'
                }`}
              >
                <AlertTriangle className={`w-4 h-4 ${showFaultyOnly ? 'animate-bounce' : ''}`} />
                <span>{showFaultyOnly ? 'Conflict View' : 'All Valid'}</span>
              </motion.button>

              <div className="flex p-1 neu-pressed rounded-2xl">
                <motion.button 
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setFilterStatus('all')}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filterStatus === 'all' && !showFaultyOnly ? 'neu-flat bg-[var(--accent)] text-white' : 'neu-text-muted opacity-60'}`}
                >
                  All
                </motion.button>
                <motion.button 
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setFilterStatus('Active')}
                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${filterStatus === 'Active' ? 'neu-flat bg-emerald-500 text-white' : 'neu-text-muted opacity-60'}`}
                >
                  Active
                </motion.button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="hidden md:block overflow-x-auto">
            <table className="w-full text-sm text-left border-collapse">
              <thead className="text-[10px] font-black uppercase tracking-[0.2em] neu-text-muted border-b border-[var(--shadow-dark)] bg-black/5">
                <tr>
                  <th className="px-4 py-5 text-center">
                    <div className="flex items-center justify-center">
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
                        className="w-4 h-4 rounded border-[var(--shadow-dark)] text-[var(--accent)] focus:ring-[var(--accent)] cursor-pointer"
                      />
                    </div>
                  </th>
                  <th className="px-4 py-5 cursor-pointer hover:text-[var(--accent)] transition-colors whitespace-nowrap" onClick={() => handleSort('id')}>
                    ID <SortIcon column="id" />
                  </th>
                  <th className="px-4 py-5 cursor-pointer hover:text-[var(--accent)] transition-colors whitespace-nowrap" onClick={() => handleSort('name')}>
                    {t('Name')} <SortIcon column="name" />
                  </th>
                  <th className="px-4 py-5 cursor-pointer hover:text-[var(--accent)] transition-colors whitespace-nowrap" onClick={() => handleSort('mobileNumber')}>
                    {t('Phone')} <SortIcon column="mobileNumber" />
                  </th>
                  <th className="px-4 py-5 cursor-pointer hover:text-[var(--accent)] transition-colors whitespace-nowrap" onClick={() => handleSort('status')}>
                    {t('Status')} <SortIcon column="status" />
                  </th>
                  <th className="px-4 py-5 cursor-pointer hover:text-[var(--accent)] transition-colors whitespace-nowrap" onClick={() => handleSort('balance')}>
                    {t('Balance')} <SortIcon column="balance" />
                  </th>
                  <th className="px-4 py-5"></th>
                </tr>
              </thead>
              <tbody>
                {paginatedCustomers.map((customer, i) => (
                  <CustomerTableRow 
                    key={customer.id}
                    customer={customer}
                    index={i}
                    isSelected={selectedIds.includes(customer.id)}
                    onToggleSelect={(id, checked) => {
                      if (checked) setSelectedIds(prev => [...prev, id]);
                      else setSelectedIds(prev => prev.filter(sid => sid !== id));
                    }}
                    onRowClick={handleRowClick}
                    onShareLink={handleShareLink}
                    onMessage={handleOpenIndividualNotify}
                    formatCurrency={formatCurrency}
                  />
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
              <CustomerMobileCard
                key={customer.id}
                customer={customer}
                index={i}
                isSelected={selectedIds.includes(customer.id)}
                onToggleSelect={(id, checked) => {
                  if (checked) setSelectedIds(prev => [...prev, id]);
                  else setSelectedIds(prev => prev.filter(sid => sid !== id));
                }}
                onRowClick={handleRowClick}
                onShareLink={handleShareLink}
                onMessage={handleOpenIndividualNotify}
                formatCurrency={formatCurrency}
                t={t}
              />
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
                {isGeneratingLink && <Loader2 className="w-5 h-5 animate-spin text-blue-600" />}
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
                    disabled={isGeneratingLink}
                    placeholder="Type your message here..."
                    className="w-full h-32 px-4 py-3 neu-pressed rounded-xl bg-transparent outline-none text-sm font-medium resize-none focus:ring-2 focus:ring-emerald-500/50 mb-2 disabled:opacity-50"
                  />
                  <div className="flex items-center gap-2">
                    <label className="flex items-center gap-2 px-3 py-2 cursor-pointer bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm font-bold">
                      <Paperclip className="w-4 h-4" />
                      Attach File
                      <input type="file" className="hidden" onChange={handleUploadAttachment} />
                    </label>
                    <span className="text-xs text-gray-500">
                      {individualAttachment ? individualAttachment.name : "Supported via API Mode"}
                    </span>
                    {individualAttachment && (
                       <button onClick={() => setIndividualAttachment(null)} className="text-red-500 hover:text-red-700 text-xs">Remove</button>
                    )}
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
                    className="w-full h-32 p-4 neu-pressed rounded-xl outline-none focus:ring-2 focus:ring-blue-500/50 resize-none text-sm mb-4"
                  />
                  
                  <div className="flex items-center gap-2">
                    <input 
                      type="file" 
                      ref={broadcastFileInputRef} 
                      className="hidden" 
                      onChange={(e) => setCustomAttachment(e.target.files?.[0] || null)}
                    />
                    <button 
                      onClick={() => broadcastFileInputRef.current?.click()}
                      className="px-4 py-2 bg-slate-100 text-slate-700 rounded-xl text-sm font-bold shadow-sm hover:bg-slate-200 transition-colors flex items-center gap-2"
                    >
                      {customAttachment ? (
                        <>
                          <div className="w-2 h-2 rounded-full bg-emerald-500"></div>
                          <span className="truncate max-w-[150px]">{customAttachment.name}</span>
                          <div 
                            className="p-1 hover:bg-slate-300 rounded-full ml-1 text-rose-500"
                            onClick={(e) => {
                              e.stopPropagation();
                              setCustomAttachment(null);
                              if (broadcastFileInputRef.current) broadcastFileInputRef.current.value = "";
                            }}
                          >
                            <X className="w-3 h-3" />
                          </div>
                        </>
                      ) : (
                        <>
                          <Paperclip className="w-4 h-4" /> Attach File
                        </>
                      )}
                    </button>
                    <span className="text-xs text-gray-500 ml-2">File will be sent along with your message</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-4 border-t border-[var(--shadow-dark)]">
                  <div className="text-xs neu-text-muted">
                    Sending to <span className="font-bold text-blue-600">{selectedIds.length > 0 ? selectedIds.length : customers.filter(c => c.status === 'Active').length}</span> target customers
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
