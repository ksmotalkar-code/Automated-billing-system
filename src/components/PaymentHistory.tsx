import React, { useState, useMemo } from "react";
import { 
  CreditCard, 
  Search, 
  Calendar, 
  Download, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Sparkles, 
  CheckCircle2, 
  Filter, 
  Banknote, 
  Smartphone, 
  Copy, 
  Check, 
  Clock, 
  FileText, 
  X,
  TrendingUp,
  Coins,
  ShieldCheck,
  ChevronLeft,
  ChevronRight
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { Transaction, Customer, AppSettings } from "../lib/db";
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

    const netAdvance = totalAdvanceCredits - totalAdvanceDeductions;

    return {
      totalCollected,
      totalAdvanceCredits,
      totalAdvanceDeductions,
      netAdvance,
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
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="p-2.5 bg-blue-600/10 text-blue-500 rounded-xl border border-blue-500/20">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-100 uppercase tracking-wide flex items-center gap-2">
                {customerId ? (
                  <>
                    <span>{customerName || targetCustomer?.name || 'Resident'}</span>
                    <span className="text-xs font-mono font-normal px-2 py-0.5 rounded-md bg-slate-800 text-slate-300 border border-slate-700">
                      ID: {customerId}
                    </span>
                  </>
                ) : (
                  "Transaction & Advance Credit Ledger"
                )}
              </h2>
              <p className="text-xs text-slate-400 font-bold">
                {customerId 
                  ? "Track complete payment history, advance deposits, and billing cycle deductions"
                  : "Authoritative ledger of all water bill collections, advance payments, and automatic credit adjustments"
                }
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={exportCSV}
            disabled={filteredTransactions.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
            title="Export Ledger to CSV"
          >
            <Download className="w-3.5 h-3.5 text-blue-400" />
            <span>Export CSV</span>
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-slate-100 hover:bg-slate-800 rounded-xl transition-all"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Target Resident Live Credit Profile (if single customer viewed) */}
      {targetCustomer && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-900/20 via-slate-900/40 to-emerald-950/20 border border-blue-500/20 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-black text-sm ${
              (targetCustomer.advanceBalance || 0) > 0 
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30' 
                : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
            }`}>
              {targetCustomer.name.slice(0, 2).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-black text-slate-100">{targetCustomer.name}</p>
              <p className="text-[11px] text-slate-400 font-mono">📱 {targetCustomer.mobileNumber || "No phone linked"}</p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right">
              <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 block">Current Outstanding Due</span>
              <span className={`text-base font-black ${targetCustomer.balance > 0 ? 'text-red-400' : 'text-slate-300'}`}>
                {formatCurrency(targetCustomer.balance)}
              </span>
            </div>

            <div className="text-right pl-6 border-l border-white/10">
              <span className="text-[10px] uppercase font-black tracking-wider text-emerald-400 block flex items-center justify-end gap-1">
                <Sparkles className="w-3 h-3 text-emerald-400" /> Active Advance Balance
              </span>
              <span className="text-base font-black text-emerald-400">
                {formatCurrency(targetCustomer.advanceBalance || 0)}
              </span>
            </div>

            <div className="text-right pl-6 border-l border-white/10">
              <span className="text-[10px] uppercase font-black tracking-wider text-slate-400 block">Account Status</span>
              <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                targetCustomer.status === 'Advance Paid'
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20'
                  : targetCustomer.status === 'Suspended'
                  ? 'bg-red-500/10 text-red-400 border border-red-500/20'
                  : 'bg-blue-500/10 text-blue-400 border border-blue-500/20'
              }`}>
                {targetCustomer.status || 'Active'}
              </span>
            </div>
          </div>
        </div>
      )}

      {/* KPI Stats Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {/* 1. Total Collections */}
        <div className="p-3.5 neu-pressed rounded-2xl border border-white/5 space-y-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>Direct Collections</span>
            <Banknote className="w-3.5 h-3.5 text-blue-400" />
          </span>
          <p className="text-lg font-black text-slate-100">
            {formatCurrency(stats.totalCollected)}
          </p>
          <p className="text-[10px] text-slate-400 font-bold">
            Gross cash & UPI receipts
          </p>
        </div>

        {/* 2. Advance Credits Received */}
        <div className="p-3.5 neu-pressed rounded-2xl border border-emerald-500/10 bg-emerald-500/[0.02] space-y-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center justify-between">
            <span>Advance Credits</span>
            <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" />
          </span>
          <p className="text-lg font-black text-emerald-400">
            {formatCurrency(stats.totalAdvanceCredits)}
          </p>
          <p className="text-[10px] text-emerald-300/70 font-bold">
            Pre-payments deposited
          </p>
        </div>

        {/* 3. Advance Billing Deductions */}
        <div className="p-3.5 neu-pressed rounded-2xl border border-purple-500/10 bg-purple-500/[0.02] space-y-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-purple-400 flex items-center justify-between">
            <span>Cycle Deductions</span>
            <ArrowUpRight className="w-3.5 h-3.5 text-purple-400" />
          </span>
          <p className="text-lg font-black text-purple-400">
            {formatCurrency(stats.totalAdvanceDeductions)}
          </p>
          <p className="text-[10px] text-purple-300/70 font-bold">
            Applied to reduce bills
          </p>
        </div>

        {/* 4. Net Advance Reserve */}
        <div className="p-3.5 neu-pressed rounded-2xl border border-white/5 space-y-1">
          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center justify-between">
            <span>Total Entries</span>
            <Coins className="w-3.5 h-3.5 text-amber-400" />
          </span>
          <p className="text-lg font-black text-slate-100">
            {stats.count}
          </p>
          <p className="text-[10px] text-slate-400 font-bold">
            Filtered ledger records
          </p>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="flex flex-col md:flex-row gap-3 items-center justify-between p-3.5 bg-slate-900/40 rounded-2xl border border-white/5">
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by ID, Resident, Receipt #..."
            className="w-full pl-9 pr-4 py-2 bg-slate-950/60 border border-slate-700/60 rounded-xl text-xs text-slate-200 outline-none focus:border-blue-500/60 transition-all font-medium"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
          {/* Type Filter */}
          <div className="flex items-center gap-1 bg-slate-950/60 p-1 rounded-xl border border-slate-800 text-xs">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all ${typeFilter === 'all' ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-slate-200'}`}
            >
              All Types
            </button>
            <button
              onClick={() => setTypeFilter('advance_credit')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all flex items-center gap-1 ${typeFilter === 'advance_credit' ? 'bg-emerald-600 text-white' : 'text-slate-400 hover:text-emerald-400'}`}
            >
              <Sparkles className="w-3 h-3" /> Advance Deposits
            </button>
            <button
              onClick={() => setTypeFilter('advance_adjustment')}
              className={`px-2.5 py-1 rounded-lg font-bold text-[11px] transition-all flex items-center gap-1 ${typeFilter === 'advance_adjustment' ? 'bg-purple-600 text-white' : 'text-slate-400 hover:text-purple-400'}`}
            >
              <ArrowUpRight className="w-3 h-3" /> Cycle Deductions
            </button>
          </div>

          {/* Mode Filter */}
          <select
            value={modeFilter}
            onChange={(e: any) => setModeFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-950/60 border border-slate-800 rounded-xl text-xs text-slate-300 font-bold outline-none"
          >
            <option value="all">All Modes</option>
            <option value="cash">Cash at Counter</option>
            <option value="upi">UPI / Online</option>
            <option value="advance_credit">Advance Deduction</option>
          </select>
        </div>
      </div>

      {/* Transactions Ledger Table */}
      <div className="overflow-hidden rounded-2xl border border-white/5 bg-slate-900/20 shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/5 bg-slate-900/60 text-[10px] font-black uppercase tracking-wider text-slate-400">
                <th className="py-3.5 px-4">Date & Time</th>
                <th className="py-3.5 px-4">Transaction / Receipt ID</th>
                {!customerId && <th className="py-3.5 px-4">Resident</th>}
                <th className="py-3.5 px-4">Mode / Channel</th>
                <th className="py-3.5 px-4 text-right">Amount Paid</th>
                <th className="py-3.5 px-4 text-center">Advance Payment Adjustment</th>
                <th className="py-3.5 px-4 text-right">Balance Result</th>
                <th className="py-3.5 px-4 text-center">Receipt</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-xs">
              {paginatedTransactions.length === 0 ? (
                <tr>
                  <td colSpan={customerId ? 7 : 8} className="py-12 text-center text-slate-400">
                    <div className="flex flex-col items-center justify-center gap-2">
                      <Clock className="w-8 h-8 text-slate-600" />
                      <p className="font-bold text-sm text-slate-300">No transaction records found</p>
                      <p className="text-[11px] text-slate-500 max-w-sm">
                        {searchQuery || typeFilter !== 'all' || modeFilter !== 'all' 
                          ? "Try clearing your filters or search terms to view all transactions."
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
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(idx * 0.02, 0.3) }}
                      className="hover:bg-slate-800/30 transition-colors group"
                    >
                      {/* 1. Date */}
                      <td className="py-3.5 px-4 font-mono text-[11px] text-slate-300 whitespace-nowrap">
                        {formatDate(txn.date)}
                      </td>

                      {/* 2. Transaction ID */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-bold text-slate-200 text-xs">
                            {txn.transactionId || txn.id}
                          </span>
                          <button
                            onClick={() => copyToClipboard(txn.transactionId || txn.id, txn.id)}
                            className="text-slate-500 hover:text-slate-300 transition-colors p-1"
                            title="Copy ID"
                          >
                            {copiedId === txn.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                          </button>
                        </div>
                      </td>

                      {/* 3. Customer (if global view) */}
                      {!customerId && (
                        <td className="py-3.5 px-4">
                          <div>
                            <span className="font-bold text-slate-100 block truncate max-w-[160px]">
                              {txn.customerName || cust?.name || `Consumer #${txn.customerId}`}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400">
                              ID: {txn.customerId}
                            </span>
                          </div>
                        </td>
                      )}

                      {/* 4. Payment Mode */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {isAdvDeduction ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-purple-500/10 text-purple-400 border border-purple-500/20">
                            <Sparkles className="w-3 h-3" /> Auto Deduction
                          </span>
                        ) : isCash ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-400 border border-amber-500/20">
                            <Banknote className="w-3 h-3" /> Cash Counter
                          </span>
                        ) : isUpi ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-blue-500/10 text-blue-400 border border-blue-500/20">
                            <Smartphone className="w-3 h-3" /> UPI Online
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-slate-800 text-slate-300 border border-slate-700">
                            <CreditCard className="w-3 h-3" /> Direct
                          </span>
                        )}
                      </td>

                      {/* 5. Amount Paid */}
                      <td className="py-3.5 px-4 text-right font-mono font-bold whitespace-nowrap">
                        <span className={isAdvDeduction ? 'text-purple-400' : 'text-slate-100 text-sm'}>
                          {formatCurrency(txn.amount)}
                        </span>
                      </td>

                      {/* 6. Advance Payment Adjustment */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        {isAdvCredit ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-black bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                            <ArrowDownLeft className="w-3.5 h-3.5" />
                            +{formatCurrency(txn.advanceAdjustment || txn.amount)} Credit
                          </span>
                        ) : isAdvDeduction ? (
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-black bg-purple-500/10 text-purple-400 border border-purple-500/20 font-mono">
                            <ArrowUpRight className="w-3.5 h-3.5" />
                            -{formatCurrency(Math.abs(txn.advanceAdjustment || txn.amount))} Adjusted
                          </span>
                        ) : (
                          <span className="text-[11px] font-mono text-slate-500 font-bold">
                            ₹0 (Standard)
                          </span>
                        )}
                      </td>

                      {/* 7. Balance Result */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap font-mono text-[11px]">
                        {txn.newBalance !== undefined || txn.newAdvance !== undefined ? (
                          <div className="space-y-0.5">
                            <div className="text-slate-300 font-bold">
                              Due: <span className={txn.newBalance ? 'text-red-400' : 'text-emerald-400'}>{formatCurrency(txn.newBalance || 0)}</span>
                            </div>
                            {(txn.newAdvance && txn.newAdvance > 0) ? (
                              <div className="text-emerald-400 font-bold text-[10px]">
                                Adv: {formatCurrency(txn.newAdvance)}
                              </div>
                            ) : null}
                          </div>
                        ) : (
                          <span className="text-slate-500">-</span>
                        )}
                      </td>

                      {/* 8. Receipt Download */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap">
                        <button
                          onClick={() => handleDownloadReceipt(txn)}
                          className="p-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg transition-all border border-slate-700/60 group-hover:border-blue-500/30"
                          title="Download Official Receipt PDF"
                        >
                          <FileText className="w-3.5 h-3.5 text-blue-400" />
                        </button>
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
          <div className="p-3.5 border-t border-white/5 flex items-center justify-between text-xs text-slate-400 bg-slate-900/40">
            <span>
              Showing {((currentPage - 1) * itemsPerPage) + 1} to {Math.min(currentPage * itemsPerPage, filteredTransactions.length)} of {filteredTransactions.length} records
            </span>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => setCurrentPage(prev => Math.max(prev - 1, 1))}
                disabled={currentPage === 1}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 border border-slate-700"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="px-2 font-mono font-bold text-slate-200">
                {currentPage} / {totalPages}
              </span>
              <button
                onClick={() => setCurrentPage(prev => Math.min(prev + 1, totalPages))}
                disabled={currentPage === totalPages}
                className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 disabled:opacity-40 border border-slate-700"
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
