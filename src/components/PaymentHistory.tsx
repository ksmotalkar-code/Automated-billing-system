import React, { useState, useMemo } from "react";
import { 
  CreditCard, 
  Search, 
  Download, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Sparkles, 
  Banknote, 
  Smartphone, 
  Copy, 
  Check, 
  Clock, 
  FileText, 
  X,
  Coins,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { motion } from "motion/react";
import { Transaction, Customer } from "../lib/db";
import { useData } from "../contexts/DataContext";
import { useTranslation } from "react-i18next";
import { generateInvoicePDF } from "../lib/automation";

interface PaymentHistoryProps {
  customerId?: string;
  customerName?: string;
  onClose?: () => void;
  className?: string;
}

export function PaymentHistory({ customerId, customerName, onClose, className = "" }: PaymentHistoryProps) {
  const { t } = useTranslation();
  const { transactions, customers, settings } = useData();
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<'all' | 'advance_credit' | 'advance_adjustment' | 'bill_payment'>('all');
  const [modeFilter, setModeFilter] = useState<'all' | 'cash' | 'upi' | 'advance_credit'>('all');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  const customerMap = useMemo(() => {
    const map = new Map<string, Customer>();
    customers.forEach(c => {
      map.set(c.id, c);
      if (c.docId) map.set(c.docId, c);
    });
    return map;
  }, [customers]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const formatCurrency = (amt: number | undefined | null) => {
    const val = Number(amt) || 0;
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(val);
  };

  const formatDate = (isoString: string) => {
    try {
      const d = new Date(isoString);
      if (isNaN(d.getTime())) return isoString;
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      });
    } catch {
      return isoString;
    }
  };

  // Filter transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter(txn => {
      // 1. Customer specific filter
      if (customerId && txn.customerId !== customerId) {
        return false;
      }

      // 2. Type filter
      if (typeFilter === 'advance_credit') {
        const isAdv = txn.isAdvanceCredit || (txn.advanceAdjustment && txn.advanceAdjustment > 0) || txn.paymentType === 'advance_credit' || txn.paymentType === 'bill_and_advance';
        if (!isAdv) return false;
      } else if (typeFilter === 'advance_adjustment') {
        const isAdj = (txn.advanceAdjustment && txn.advanceAdjustment < 0) || txn.paymentType === 'advance_adjustment' || txn.paymentMode === 'advance_credit';
        if (!isAdj) return false;
      } else if (typeFilter === 'bill_payment') {
        if (txn.paymentType === 'advance_adjustment' || txn.paymentType === 'advance_credit') return false;
      }

      // 3. Mode filter
      if (modeFilter !== 'all') {
        if (modeFilter === 'cash' && txn.paymentMode !== 'cash' && !txn.transactionId?.startsWith('CASH')) return false;
        if (modeFilter === 'upi' && txn.paymentMode !== 'upi' && !txn.transactionId?.startsWith('UPI') && !txn.transactionId?.startsWith('TXN')) return false;
        if (modeFilter === 'advance_credit' && txn.paymentMode !== 'advance_credit' && txn.paymentType !== 'advance_adjustment') return false;
      }

      // 4. Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const cust = customerMap.get(txn.customerId);
        const name = (txn.customerName || cust?.name || '').toLowerCase();
        const tid = (txn.transactionId || '').toLowerCase();
        const cid = (txn.customerId || '').toLowerCase();
        const notes = (txn.notes || '').toLowerCase();
        return name.includes(q) || tid.includes(q) || cid.includes(q) || notes.includes(q);
      }

      return true;
    }).sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  }, [transactions, customerId, typeFilter, modeFilter, searchQuery, customerMap]);

  // Financial KPI totals
  const stats = useMemo(() => {
    let totalCollected = 0;
    let totalAdvanceCredits = 0;
    let totalAdvanceDeductions = 0;

    filteredTransactions.forEach(t => {
      const amt = Number(t.amount) || 0;
      const advAdj = Number(t.advanceAdjustment) || 0;

      if (t.paymentType !== 'advance_adjustment') {
        totalCollected += amt;
      }

      if (advAdj > 0) {
        totalAdvanceCredits += advAdj;
      } else if (advAdj < 0) {
        totalAdvanceDeductions += Math.abs(advAdj);
      } else if (t.isAdvanceCredit) {
        totalAdvanceCredits += amt;
      }
    });

    return {
      totalCollected,
      totalAdvanceCredits,
      totalAdvanceDeductions,
      count: filteredTransactions.length
    };
  }, [filteredTransactions]);

  const totalPages = Math.ceil(filteredTransactions.length / itemsPerPage);
  const paginatedTransactions = useMemo(() => {
    return filteredTransactions.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);
  }, [filteredTransactions, currentPage]);

  const handleDownloadReceipt = (txn: Transaction) => {
    const cust = customerMap.get(txn.customerId) || {
      id: txn.customerId,
      name: txn.customerName || 'Resident',
      balance: txn.newBalance ?? 0,
      advanceBalance: txn.newAdvance ?? 0,
      status: 'Active',
      mobileNumber: ''
    } as Customer;

    const pdfBlob = generateInvoicePDF(cust, settings, true, txn.amount);
    const url = URL.createObjectURL(pdfBlob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Receipt_${txn.transactionId || txn.id}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    const headers = ["Date", "Transaction ID", "Customer ID", "Customer Name", "Amount (INR)", "Advance Adjustment (INR)", "Payment Mode", "Payment Type", "Previous Balance", "New Balance", "Previous Advance", "New Advance", "Notes"];
    const rows = filteredTransactions.map(t => {
      const cust = customerMap.get(t.customerId);
      return [
        `"${t.date}"`,
        `"${t.transactionId}"`,
        `"${t.customerId}"`,
        `"${t.customerName || cust?.name || 'N/A'}"`,
        t.amount || 0,
        t.advanceAdjustment || 0,
        `"${t.paymentMode || 'N/A'}"`,
        `"${t.paymentType || 'N/A'}"`,
        t.previousBalance ?? '',
        t.newBalance ?? '',
        t.previousAdvance ?? '',
        t.newAdvance ?? '',
        `"${t.notes || ''}"`
      ];
    });

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `Payment_History_${customerId || 'All'}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const targetCustomer = customerId ? customerMap.get(customerId) : null;

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Header Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-[var(--shadow-dark)]/40 pb-4">
        <div className="flex items-center gap-3">
          <div className="p-3 neu-flat rounded-2xl text-blue-600">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-xl font-black uppercase tracking-tight neu-text flex items-center gap-2">
              {customerId ? (
                <>
                  <span>{customerName || targetCustomer?.name || 'Resident'}</span>
                  <span className="px-2.5 py-0.5 rounded-lg neu-pressed text-xs font-mono font-bold text-blue-600 border border-blue-200/50">
                    ID: {customerId}
                  </span>
                </>
              ) : (
                <span>Transaction & Advance Credit Ledger</span>
              )}
            </h2>
            <p className="text-xs neu-text-muted font-bold mt-0.5">
              {customerId 
                ? "Complete payment timeline, advance deposits, and cycle deductions"
                : "Authoritative ledger of water bill collections, advance payments, and automatic credit adjustments"
              }
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={exportCSV}
            disabled={filteredTransactions.length === 0}
            className="px-4 py-2.5 neu-flat rounded-2xl text-xs font-black uppercase tracking-wider neu-text hover:text-blue-600 transition-all flex items-center gap-2 border border-white/60 disabled:opacity-50"
            title="Export Ledger to CSV"
          >
            <Download className="w-4 h-4 text-blue-600" />
            <span>Export CSV</span>
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="p-2.5 neu-flat rounded-2xl neu-text-muted hover:text-rose-600 transition-all"
              title="Close"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Target Resident Live Credit Profile (if single customer viewed) */}
      {targetCustomer && (
        <div className="p-5 neu-pressed rounded-[28px] border border-[var(--shadow-dark)]/10 flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <div className={`w-12 h-12 rounded-2xl neu-flat flex items-center justify-center font-black text-sm ${
              (targetCustomer.advanceBalance || 0) > 0 
                ? 'text-emerald-600' 
                : 'text-blue-600'
            }`}>
              {targetCustomer.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="text-base font-black neu-text">{targetCustomer.name}</p>
              <p className="text-xs neu-text-muted font-bold">📱 {targetCustomer.mobileNumber || "No phone linked"}</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right">
              <span className="text-[10px] uppercase font-black tracking-wider neu-text-muted block">Current Due</span>
              <span className={`text-lg font-black ${targetCustomer.balance > 0 ? 'text-rose-600' : 'neu-text'}`}>
                {formatCurrency(targetCustomer.balance)}
              </span>
            </div>

            <div className="text-right pl-6 border-l border-[var(--shadow-dark)]/20">
              <span className="text-[10px] uppercase font-black tracking-wider text-emerald-600 block flex items-center justify-end gap-1">
                <Sparkles className="w-3.5 h-3.5 text-emerald-600" /> Advance Balance
              </span>
              <span className="text-lg font-black text-emerald-600">
                {formatCurrency(targetCustomer.advanceBalance || 0)}
              </span>
            </div>

            <div className="text-right pl-6 border-l border-[var(--shadow-dark)]/20">
              <span className="text-[10px] uppercase font-black tracking-wider neu-text-muted block mb-1">Account Status</span>
              <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-black uppercase tracking-wider neu-flat ${
                targetCustomer.status === 'Advance Paid'
                  ? 'text-emerald-600'
                  : targetCustomer.status === 'Suspended'
                  ? 'text-rose-600'
                  : 'text-blue-600'
              }`}>
                {targetCustomer.status || 'Active'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* 1. Direct Collections */}
        <div className="p-4 neu-flat rounded-[28px] space-y-1 border border-blue-500/10">
          <span className="text-[10px] font-black uppercase tracking-wider text-blue-600 flex items-center justify-between">
            <span>Direct Collections</span>
            <Banknote className="w-4 h-4 text-blue-600" />
          </span>
          <p className="text-2xl font-black neu-text">
            {formatCurrency(stats.totalCollected)}
          </p>
          <p className="text-[10px] neu-text-muted font-bold">
            Gross cash & UPI receipts
          </p>
        </div>

        {/* 2. Advance Credits Received */}
        <div className="p-4 neu-flat rounded-[28px] space-y-1 border border-emerald-500/10">
          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-600 flex items-center justify-between">
            <span>Advance Credits</span>
            <ArrowDownLeft className="w-4 h-4 text-emerald-600" />
          </span>
          <p className="text-2xl font-black text-emerald-600">
            {formatCurrency(stats.totalAdvanceCredits)}
          </p>
          <p className="text-[10px] neu-text-muted font-bold">
            Pre-payments deposited
          </p>
        </div>

        {/* 3. Cycle Deductions */}
        <div className="p-4 neu-flat rounded-[28px] space-y-1 border border-purple-500/10">
          <span className="text-[10px] font-black uppercase tracking-wider text-purple-600 flex items-center justify-between">
            <span>Cycle Deductions</span>
            <ArrowUpRight className="w-4 h-4 text-purple-600" />
          </span>
          <p className="text-2xl font-black text-purple-600">
            {formatCurrency(stats.totalAdvanceDeductions)}
          </p>
          <p className="text-[10px] neu-text-muted font-bold">
            Applied to reduce bills
          </p>
        </div>

        {/* 4. Total Entries */}
        <div className="p-4 neu-flat rounded-[28px] space-y-1 border border-amber-500/10">
          <span className="text-[10px] font-black uppercase tracking-wider text-amber-600 flex items-center justify-between">
            <span>Total Entries</span>
            <Coins className="w-4 h-4 text-amber-600" />
          </span>
          <p className="text-2xl font-black neu-text">
            {stats.count}
          </p>
          <p className="text-[10px] neu-text-muted font-bold">
            Filtered ledger records
          </p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="p-4 neu-flat rounded-[28px] border border-[var(--shadow-light)] shadow-sm flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-3 px-4 py-3 neu-pressed rounded-2xl w-full max-w-md group group-focus-within:ring-2 ring-[var(--accent)]/50 transition-all">
          <Search className="w-5 h-5 neu-text-muted group-focus-within:text-[var(--accent)]" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by ID, Resident, Receipt #..."
            className="w-full bg-transparent border-none outline-none text-sm neu-text font-bold placeholder:opacity-50"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto justify-end">
          {/* Type Filter */}
          <div className="p-1 neu-pressed rounded-2xl flex items-center gap-1 text-xs">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-3 py-1.5 rounded-xl font-black text-xs transition-all ${
                typeFilter === 'all' 
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20' 
                  : 'neu-text-muted hover:neu-text'
              }`}
            >
              All Types
            </button>
            <button
              onClick={() => setTypeFilter('advance_credit')}
              className={`px-3 py-1.5 rounded-xl font-black text-xs transition-all flex items-center gap-1 ${
                typeFilter === 'advance_credit' 
                  ? 'bg-emerald-600 text-white shadow-md shadow-emerald-500/20' 
                  : 'neu-text-muted hover:text-emerald-600'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5" /> Advance Deposits
            </button>
            <button
              onClick={() => setTypeFilter('advance_adjustment')}
              className={`px-3 py-1.5 rounded-xl font-black text-xs transition-all flex items-center gap-1 ${
                typeFilter === 'advance_adjustment' 
                  ? 'bg-purple-600 text-white shadow-md shadow-purple-500/20' 
                  : 'neu-text-muted hover:text-purple-600'
              }`}
            >
              <ArrowUpRight className="w-3.5 h-3.5" /> Cycle Deductions
            </button>
          </div>

          {/* Mode Filter */}
          <select
            value={modeFilter}
            onChange={(e: any) => setModeFilter(e.target.value)}
            className="px-4 py-2.5 neu-pressed rounded-2xl text-xs neu-text font-black outline-none border-none bg-transparent cursor-pointer"
          >
            <option value="all">All Modes</option>
            <option value="cash">Cash Counter</option>
            <option value="upi">UPI / Online</option>
            <option value="advance_credit">Advance Deduction</option>
          </select>
        </div>
      </div>

      {/* Transactions Ledger Table */}
      <div className="neu-flat rounded-[28px] border border-[var(--shadow-light)] shadow-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--shadow-dark)] bg-black/5 text-[10px] font-black uppercase tracking-[0.2em] neu-text-muted">
                <th className="py-5 px-4">Date & Time</th>
                <th className="py-5 px-4">Transaction / Receipt ID</th>
                {!customerId && <th className="py-5 px-4">Resident</th>}
                <th className="py-5 px-4">Mode / Channel</th>
                <th className="py-5 px-4 text-right">Amount Paid</th>
                <th className="py-5 px-4 text-center">Advance Adjustment</th>
                <th className="py-5 px-4 text-right">Balance Result</th>
                <th className="py-5 px-4 text-center">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--shadow-dark)] text-xs">
              {paginatedTransactions.length === 0 ? (
                <tr>
                  <td colSpan={customerId ? 7 : 8} className="py-16 text-center neu-text-muted">
                    <div className="flex flex-col items-center justify-center gap-3">
                      <Clock className="w-10 h-10 neu-text-muted opacity-40" />
                      <p className="font-black text-base neu-text">No transaction records found</p>
                      <p className="text-xs neu-text-muted font-bold max-w-sm">
                        {searchQuery || typeFilter !== 'all' || modeFilter !== 'all' 
                          ? "Try clearing your search terms or filters to view all transactions."
                          : "Payments and automated advance deductions will appear here once recorded."}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                paginatedTransactions.map((txn, idx) => {
                  const cust = customerMap.get(txn.customerId);
                  const isAdvCredit = txn.isAdvanceCredit || (txn.advanceAdjustment && txn.advanceAdjustment > 0) || txn.paymentType === 'advance_credit';
                  const isAdvDeduction = (txn.advanceAdjustment && txn.advanceAdjustment < 0) || txn.paymentType === 'advance_adjustment';
                  const isCash = txn.paymentMode === 'cash' || txn.transactionId?.startsWith('CASH');
                  const isUpi = txn.paymentMode === 'upi' || txn.transactionId?.startsWith('UPI');

                  return (
                    <motion.tr 
                      key={txn.id || idx}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: Math.min(idx * 0.01, 0.5) }}
                      className="border-b border-[var(--shadow-dark)] last:border-0 hover:bg-black/5 transition-colors cursor-pointer group"
                    >
                      {/* 1. Date */}
                      <td className="py-4 px-4 font-mono text-xs font-bold neu-text whitespace-nowrap">
                        {formatDate(txn.date)}
                      </td>

                      {/* 2. Transaction ID */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2">
                          <span className="px-2.5 py-1 neu-pressed rounded-lg font-mono font-black text-xs text-blue-600">
                            #{txn.transactionId || txn.id}
                          </span>
                          <button
                            onClick={() => copyToClipboard(txn.transactionId || txn.id, txn.id)}
                            className="p-1.5 neu-flat hover:text-blue-600 text-neutral-400 transition-colors rounded-lg"
                            title="Copy ID"
                          >
                            {copiedId === txn.id ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                          </button>
                        </div>
                      </td>

                      {/* 3. Customer (if global view) */}
                      {!customerId && (
                        <td className="py-4 px-4 whitespace-nowrap">
                          <div>
                            <span className="font-black uppercase tracking-tight text-sm neu-text block truncate max-w-[180px]">
                              {txn.customerName || cust?.name || `Consumer #${txn.customerId}`}
                            </span>
                            <span className="text-xs font-bold neu-text-muted">
                              ID: {txn.customerId}
                            </span>
                          </div>
                        </td>
                      )}

                      {/* 4. Payment Mode */}
                      <td className="py-4 px-4 whitespace-nowrap">
                        {isAdvDeduction ? (
                          <span className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest inline-flex items-center gap-1.5 bg-purple-500/10 text-purple-600 border border-purple-500/20">
                            <Sparkles className="w-3 h-3 text-purple-500" /> Auto Deduction
                          </span>
                        ) : isCash ? (
                          <span className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest inline-flex items-center gap-1.5 bg-amber-500/10 text-amber-600 border border-amber-500/20">
                            <Banknote className="w-3 h-3 text-amber-500" /> Cash Counter
                          </span>
                        ) : isUpi ? (
                          <span className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest inline-flex items-center gap-1.5 bg-blue-500/10 text-blue-600 border border-blue-500/20">
                            <Smartphone className="w-3 h-3 text-blue-500" /> UPI Online
                          </span>
                        ) : (
                          <span className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest inline-flex items-center gap-1.5 bg-slate-500/10 text-slate-600 border border-slate-500/20">
                            <CreditCard className="w-3 h-3 text-slate-500" /> Direct
                          </span>
                        )}
                      </td>

                      {/* 5. Amount Paid */}
                      <td className="py-4 px-4 text-right font-mono font-black text-sm whitespace-nowrap">
                        <span className={isAdvDeduction ? 'text-purple-600' : 'text-[var(--accent)]'}>
                          {formatCurrency(txn.amount)}
                        </span>
                      </td>

                      {/* 6. Advance Payment Adjustment */}
                      <td className="py-4 px-4 text-center whitespace-nowrap">
                        {isAdvCredit ? (
                          <span className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 font-mono">
                            <ArrowDownLeft className="w-3 h-3 text-emerald-500" />
                            +{formatCurrency(txn.advanceAdjustment || txn.amount)} Credit
                          </span>
                        ) : isAdvDeduction ? (
                          <span className="px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest inline-flex items-center gap-1 bg-purple-500/10 text-purple-600 border border-purple-500/20 font-mono">
                            <ArrowUpRight className="w-3 h-3 text-purple-500" />
                            -{formatCurrency(Math.abs(txn.advanceAdjustment || txn.amount))} Adjusted
                          </span>
                        ) : (
                          <span className="text-xs font-mono neu-text-muted font-bold">
                            ₹0 (Standard)
                          </span>
                        )}
                      </td>

                      {/* 7. Balance Result */}
                      <td className="py-4 px-4 text-right whitespace-nowrap font-mono text-xs">
                        {txn.newBalance !== undefined || txn.newAdvance !== undefined ? (
                          <div className="space-y-0.5">
                            <div className="neu-text font-black">
                              Due: <span className={txn.newBalance ? 'text-rose-600' : 'text-emerald-600'}>{formatCurrency(txn.newBalance || 0)}</span>
                            </div>
                            {(txn.newAdvance && txn.newAdvance > 0) ? (
                              <div className="text-teal-600 font-black text-[10px]">
                                Adv: {formatCurrency(txn.newAdvance)}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="neu-text-muted font-bold">-</span>
                        )}
                      </td>

                      {/* 8. Receipt Download */}
                      <td className="py-4 px-4 text-center whitespace-nowrap">
                        <motion.button
                          whileHover={{ scale: 1.1, backgroundColor: 'rgba(59, 130, 246, 0.1)' }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => handleDownloadReceipt(txn)}
                          className="p-2 neu-flat text-blue-600 rounded-xl transition-all"
                          title="Download Official Receipt PDF"
                        >
                          <FileText className="w-4 h-4" />
                        </motion.button>
                      </td>
                    </motion.tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Bar */}
        {totalPages > 1 && (
          <div className="p-4 border-t border-[var(--shadow-dark)] flex items-center justify-between text-xs neu-text-muted bg-black/5">
            <span className="font-bold">
              Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredTransactions.length)} of {filteredTransactions.length} records
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="p-2 rounded-xl neu-flat hover:text-blue-600 disabled:opacity-40 transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-3 font-mono font-black neu-text">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="p-2 rounded-xl neu-flat hover:text-blue-600 disabled:opacity-40 transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
