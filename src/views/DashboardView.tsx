import React, { useState, useEffect, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { DollarSign, Users, AlertTriangle, FileText, Bell, Inbox } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { motion, AnimatePresence } from "motion/react";
import { resolveAutomationError } from "../lib/db";
import { useData } from "../contexts/DataContext";
import { useTranslation } from "react-i18next";

export function DashboardView() {
  const { t } = useTranslation();
  const { customers, transactions, complaints, settings, automationErrors } = useData();

  const [whatsappWebStatus, setWhatsappWebStatus] = useState<any>(null);

  useEffect(() => {
    // Fetch WhatsApp Web Status
    const fetchWaStatus = async () => {
      try {
        const res = await fetch('/api/wweb/status');
        const contentType = res.headers.get("content-type");
        if (res.ok && contentType && contentType.includes("application/json")) {
           const data = await res.json();
           setWhatsappWebStatus(data);
        }
      } catch (err) {
        console.warn("wweb status not available");
      }
    };
    fetchWaStatus();
    const interval = setInterval(fetchWaStatus, 15000); // Check every 15s
    
    return () => {
      clearInterval(interval);
    };
  }, []);

  const {
    totalRevenue,
    activeCustomersCount,
    suspendedCustomersCount,
    pendingInvoices,
    pendingAmount,
    overdueAccounts,
    pendingComplaints
  } = useMemo(() => {
    return {
      totalRevenue: transactions.reduce((sum, t) => sum + t.amount, 0),
      activeCustomersCount: customers.filter(c => c.status === 'Active').length,
      suspendedCustomersCount: customers.filter(c => c.status === 'Suspended').length,
      pendingInvoices: customers.filter(c => c.status === 'Active' && c.balance > 0 && c.balance <= 2000).length,
      pendingAmount: customers.filter(c => c.status === 'Active' && c.balance > 0 && c.balance <= 2000).reduce((sum, c) => sum + c.balance, 0),
      overdueAccounts: customers.filter(c => c.status === 'Active' && c.balance > 2000).length,
      pendingComplaints: complaints.filter(c => c.status === 'Pending')
    };
  }, [customers, transactions, complaints]);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  const chartData = useMemo(() => {
    return transactions.reduce((acc: any[], txn) => {
      const date = new Date(txn.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
      const existing = acc.find(d => d.month === date);
      if (existing) {
        existing.revenue += txn.amount;
        existing.expected += txn.amount; // Just for visual
      } else {
        acc.push({ month: date, revenue: txn.amount, expected: txn.amount + 500 });
      }
      return acc;
    }, []).slice(-7);
  }, [transactions]);

  const displayData = chartData;

  const pieData = useMemo(() => {
    return [
      { name: 'Paid (Active)', value: activeCustomersCount - pendingInvoices - overdueAccounts },
      { name: 'Pending (Active)', value: pendingInvoices },
      { name: 'Overdue (Active)', value: overdueAccounts },
      { name: 'Suspended', value: suspendedCustomersCount }
    ].filter(d => d.value > 0);
  }, [activeCustomersCount, pendingInvoices, overdueAccounts, suspendedCustomersCount]);
  const pieColors = ['#10b981', '#f59e0b', '#ef4444', '#94a3b8'];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('Dashboard')}</h2>
          <p className="neu-text-muted">{t('Overview & Metrics')}</p>
        </div>
        <div className="flex flex-wrap items-center gap-4">
          {pendingComplaints.length > 0 && (
            <motion.div 
               initial={{ scale: 0.8, opacity: 0 }} 
               animate={{ scale: 1, opacity: 1 }} 
               className="flex flex-wrap items-center gap-2 px-3 py-1.5 bg-amber-100 text-amber-700 rounded-full border border-amber-200"
            >
               <Bell className="w-4 h-4 animate-bounce" />
               <span className="text-xs font-bold">{pendingComplaints.length} New Complaints</span>
            </motion.div>
          )}
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500"></span>
            <span className="text-sm font-medium text-emerald-600 hidden sm:inline-block">Automated Billing Active</span>
          </div>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3 lg:grid-cols-5">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          whileHover={{ scale: 1.02, y: -5 }} 
          className="group"
        >
          <Card className="overflow-hidden relative border-none border-t border-white/10">
            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
              <DollarSign className="h-12 w-12 text-[var(--accent)] rotate-12" />
            </div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] neu-text-muted">{t('Total Revenue')}</CardTitle>
              <div className="p-2 neu-pressed-sm rounded-lg">
                <DollarSign className="h-4 w-4 text-[var(--accent)]" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black tracking-tighter mt-1">{formatCurrency(totalRevenue)}</div>
              <p className="text-[10px] text-emerald-500 font-black mt-2 flex items-center gap-1 uppercase tracking-wider">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Trending Up +12%
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          whileHover={{ scale: 1.02, y: -5 }}
          className="group"
        >
          <Card className="overflow-hidden relative border-none border-t border-white/10">
            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
              <Users className="h-12 w-12 text-blue-500 -rotate-12" />
            </div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] neu-text-muted">{t('Active Customers')}</CardTitle>
              <div className="p-2 neu-pressed-sm rounded-lg">
                <Users className="h-4 w-4 text-blue-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black tracking-tighter mt-1">{activeCustomersCount.toLocaleString('en-IN')}</div>
              <p className="text-[10px] neu-text-muted font-bold mt-2 uppercase tracking-wider">
                {suspendedCustomersCount} {t('Suspended')}
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          whileHover={{ scale: 1.02, y: -5 }}
          className="group"
        >
          <Card className="overflow-hidden relative border-none border-t border-white/10">
            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
              <FileText className="h-12 w-12 text-amber-500 rotate-45" />
            </div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] neu-text-muted">{t('Pending Payments')}</CardTitle>
              <div className="p-2 neu-pressed-sm rounded-lg">
                <FileText className="h-4 w-4 text-amber-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black tracking-tighter mt-1">{pendingInvoices.toLocaleString('en-IN')}</div>
              <p className="text-[10px] text-amber-500 font-bold mt-2 uppercase tracking-wider">{formatCurrency(pendingAmount)} DUE</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
          whileHover={{ scale: 1.02, y: -5 }}
          className="group"
        >
          <Card className="overflow-hidden relative border-none border-t border-white/10">
            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
              <AlertTriangle className="h-12 w-12 text-red-500 -rotate-12" />
            </div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] neu-text-muted">Overdue</CardTitle>
              <div className="p-2 neu-pressed-sm rounded-lg">
                <AlertTriangle className="h-4 w-4 text-red-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black tracking-tighter mt-1">{overdueAccounts.toLocaleString('en-IN')}</div>
              <p className="text-[10px] text-red-500 font-black mt-2 uppercase tracking-wider">ACTION REQUIRED</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.5 }}
          whileHover={{ scale: 1.02, y: -5 }}
          className="group"
        >
          <Card className="overflow-hidden relative border-none border-t border-white/10 shadow-lg shadow-[var(--accent)]/5">
            <div className="absolute top-0 right-0 p-3 opacity-10 group-hover:opacity-20 transition-opacity">
              <Bell className="h-12 w-12 text-indigo-500 rotate-12" />
            </div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-[10px] font-black uppercase tracking-[0.2em] neu-text-muted">Next Billing</CardTitle>
              <div className="p-2 neu-pressed-sm rounded-lg">
                <Bell className="h-4 w-4 text-indigo-500" />
              </div>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-black tracking-tighter mt-1">
                {settings?.nextBillingDate 
                  ? new Date(settings.nextBillingDate).toLocaleDateString('en-US', { day: 'numeric', month: 'short' })
                  : `Day ${settings?.defaultBillingDate || '1'}`
                }
              </div>
              <p className="text-[10px] text-indigo-500 font-bold mt-2 uppercase tracking-wider">STATUS: SCHEDULED</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-7">
        <motion.div className="col-span-full lg:col-span-4" whileHover={{ scale: 1.01 }} transition={{ type: "spring", stiffness: 300 }}>
          <Card className="h-full border-none border-t border-white/5">
            <CardHeader>
              <CardTitle className="text-xs font-black uppercase tracking-[0.2em] neu-text-muted">Revenue vs Expected Flow</CardTitle>
            </CardHeader>
            <CardContent className="pl-2">
              <div className="h-[300px] w-full min-h-[300px]">
                <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <AreaChart data={displayData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--accent)" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="var(--accent)" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorExpected" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="var(--text-muted)" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="var(--text-muted)" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="month" stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} />
                    <YAxis stroke="var(--text-muted)" fontSize={10} tickLine={false} axisLine={false} tickFormatter={(value) => `₹${value}`} />
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="var(--shadow-dark)" opacity={0.3} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'var(--bg-color)', border: '1px solid var(--shadow-dark)', borderRadius: '12px', fontSize: '12px', fontWeight: 'bold' }}
                      itemStyle={{ color: 'var(--text-main)' }}
                      formatter={(value: any) => [`₹${value}`, ""]} 
                    />
                    <Area type="monotone" dataKey="revenue" stroke="var(--accent)" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" name="Actual Revenue" />
                    <Area type="monotone" dataKey="expected" stroke="var(--text-muted)" strokeWidth={1} strokeDasharray="5 5" fillOpacity={1} fill="url(#colorExpected)" name="Expected" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div className="col-span-full lg:col-span-3" whileHover={{ scale: 1.01 }} transition={{ type: "spring", stiffness: 300 }}>
          <Card className="h-full border-none border-t border-white/5">
            <CardHeader>
              <CardTitle className="text-xs font-black uppercase tracking-[0.2em] neu-text-muted">Account Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[200px] w-full min-h-[200px]">
                <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={8}
                      dataKey="value"
                      stroke="none"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                       contentStyle={{ backgroundColor: 'var(--bg-color)', border: '1px solid var(--shadow-dark)', borderRadius: '12px', fontSize: '12px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-wrap justify-center gap-3 mt-4">
                {pieData.map((entry, index) => (
                  <div key={entry.name} className="flex items-center gap-2 p-2 neu-pressed-sm rounded-xl text-[10px] font-black uppercase tracking-wider neu-text-muted">
                    <span className="w-2.5 h-2.5 rounded-full shadow-sm" style={{ backgroundColor: pieColors[index % pieColors.length] }}></span>
                    {entry.name}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {automationErrors.filter(e => !e.resolved).length > 0 && (
        <div className="grid gap-4 grid-cols-1">
          <motion.div className="col-span-1" whileHover={{ scale: 1.01 }} transition={{ type: "spring", stiffness: 300 }}>
            <Card className="h-full border-2 border-red-500/20">
              <CardHeader className="bg-red-500/5 pb-4">
                <CardTitle className="flex items-center gap-2 text-red-600">
                  <AlertTriangle className="w-5 h-5" /> Automation Issues Need Attention
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 max-h-[300px] overflow-y-auto">
                <div className="space-y-4">
                  <AnimatePresence>
                    {automationErrors.filter(e => !e.resolved).map(err => (
                      <motion.div 
                        key={err.id}
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="flex items-start gap-4 p-4 neu-pressed rounded-xl border border-red-500/10 bg-white"
                      >
                        <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                        <div className="flex-1 space-y-1">
                          <div className="flex justify-between items-start">
                            <p className="text-sm font-bold text-slate-800">
                              Error sending <span className="uppercase text-xs bg-red-100 text-red-800 px-2 py-0.5 rounded ml-1">{err.type}</span>
                            </p>
                            <span className="text-xs text-slate-500">{new Date(err.timestamp).toLocaleDateString()}</span>
                          </div>
                          <p className="text-xs font-medium text-slate-600">Customer: <span className="font-bold">{err.customerName}</span> (ID: {err.customerId})</p>
                          <p className="text-xs text-red-600 bg-red-50 p-2 rounded flex-1 mt-2 font-mono break-all line-clamp-3">{err.errorMessage}</p>
                        </div>
                        <button 
                          onClick={() => resolveAutomationError(err.id)}
                          className="px-3 py-1.5 bg-green-50 text-green-700 hover:bg-green-100 border border-green-200 rounded-lg text-xs font-bold whitespace-nowrap"
                        >
                          Mark Resolved
                        </button>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>
      )}

      <div className="grid gap-6 grid-cols-1">
        <motion.div className="col-span-1" whileHover={{ scale: 1.005 }} transition={{ type: "spring", stiffness: 300 }}>
          <Card className="h-full border-none border-t border-white/10">
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle className="text-xs font-black uppercase tracking-[0.2em] neu-text-muted">Recent Activity Log</CardTitle>
              <Inbox className="w-5 h-5 neu-text-muted" />
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {whatsappWebStatus?.status === 'error' && (
                   <motion.div 
                     initial={{ opacity: 0, x: 20 }}
                     animate={{ opacity: 1, x: 0 }}
                     className="flex items-start gap-4 p-5 neu-pressed rounded-2xl border-l-4 border-red-500 bg-red-500/5"
                   >
                     <AlertTriangle className="mt-0.5 w-6 h-6 shrink-0 text-red-500" />
                     <div className="space-y-2">
                       <p className="text-sm font-black text-red-600 leading-none uppercase tracking-wider">WhatsApp Integration Blocked</p>
                       <p className="text-xs text-red-500/80 font-medium">{whatsappWebStatus.error}</p>
                       <div className="mt-3 p-4 neu-flat-sm rounded-xl bg-white/30 dark:bg-black/10 border border-red-500/20 shadow-sm">
                         <span className="text-[10px] font-black uppercase text-red-500 block mb-1 tracking-widest">Recommended Action</span>
                         <span className="text-xs text-red-600/90 font-bold">{whatsappWebStatus.solution}</span>
                       </div>
                       <p className="text-[10px] uppercase font-black opacity-40 mt-3 tracking-widest">System Note: Manual links remain active.</p>
                     </div>
                   </motion.div>
                )}
                {whatsappWebStatus?.status === 'qr' && (
                   <motion.div 
                     initial={{ opacity: 0, x: 20 }}
                     animate={{ opacity: 1, x: 0 }}
                     className="flex items-center gap-6 p-5 neu-pressed rounded-2xl border-l-4 border-[var(--accent)] bg-[var(--accent)]/5"
                   >
                     <div className="p-3 bg-white rounded-2xl shadow-xl border-4 border-white">
                       {whatsappWebStatus.qr && <img src={whatsappWebStatus.qr} alt="Scan QR" className="w-24 h-24 object-contain" />}
                     </div>
                     <div className="space-y-2">
                       <p className="text-sm font-black text-[var(--accent)] leading-none uppercase tracking-wider">Device Synchronization Required</p>
                       <p className="text-xs neu-text font-bold leading-relaxed">Scan this QR with your WhatsApp mobile app to enable native automated message dispatching.</p>
                       <div className="flex items-center gap-2 mt-2">
                          <span className="w-2 h-2 rounded-full bg-[var(--accent)] animate-ping" />
                          <span className="text-[10px] font-black uppercase tracking-tighter text-[var(--accent)]">Waiting for handshake...</span>
                       </div>
                     </div>
                   </motion.div>
                )}
                {transactions.slice(-5).reverse().map((txn, i) => {
                  const customer = customers.find(c => c.id === txn.customerId);
                  return (
                    <motion.div 
                      key={txn.id} 
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      whileHover={{ x: 10, backgroundColor: 'rgba(var(--accent-rgb), 0.05)' }}
                      className="group flex items-center gap-5 p-4 neu-flat rounded-2xl transition-all cursor-default border border-transparent hover:border-[var(--accent)]/20"
                    >
                      <div className="w-12 h-12 shrink-0 rounded-2xl neu-pressed flex items-center justify-center text-[var(--accent)] group-hover:scale-110 transition-transform">
                        <DollarSign className="w-6 h-6" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex justify-between items-start mb-1">
                          <p className="text-sm font-black uppercase tracking-tight truncate">Payment Received</p>
                          <span className="text-[10px] font-black neu-text-muted uppercase tracking-widest">{new Date(txn.date).toLocaleDateString()}</span>
                        </div>
                        <div className="flex items-center justify-between">
                           <p className="text-xs neu-text-muted font-bold truncate">From: {customer ? customer.name : 'Secured Payer'}</p>
                           <span className="text-sm font-black text-emerald-500 bg-emerald-500/10 px-2 py-0.5 rounded-lg border border-emerald-500/20">₹{txn.amount}</span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
                {transactions.length === 0 && (
                  <div className="text-center py-12 neu-pressed rounded-3xl border border-dashed border-[var(--shadow-dark)]">
                    <p className="text-xs font-black uppercase tracking-widest neu-text-muted opacity-50 italic">Buffer Empty: Waiting for transaction events...</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}
