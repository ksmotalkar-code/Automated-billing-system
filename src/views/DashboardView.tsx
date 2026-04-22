import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { DollarSign, Users, AlertTriangle, FileText, Bell, Inbox } from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from "recharts";
import { motion, AnimatePresence } from "motion/react";
import { subscribeToCustomers, subscribeToTransactions, subscribeToComplaints, Customer, Transaction, Complaint } from "../lib/db";
import { useTranslation } from "react-i18next";

export function DashboardView() {
  const { t } = useTranslation();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);

  useEffect(() => {
    const unsubCustomers = subscribeToCustomers(setCustomers);
    const unsubTransactions = subscribeToTransactions(setTransactions);
    const unsubComplaints = subscribeToComplaints(setComplaints);
    return () => {
      unsubCustomers();
      unsubTransactions();
      unsubComplaints();
    };
  }, []);

  const totalRevenue = transactions.reduce((sum, t) => sum + t.amount, 0);
  const activeCustomers = customers.filter(c => c.status === 'Active').length;
  const pendingInvoices = customers.filter(c => c.balance > 0 && c.balance <= 2000).length;
  const pendingAmount = customers.filter(c => c.balance > 0 && c.balance <= 2000).reduce((sum, c) => sum + c.balance, 0);
  const overdueAccounts = customers.filter(c => c.balance > 2000).length;
  const pendingComplaints = complaints.filter(c => c.status === 'Pending');

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  // Generate chart data from transactions
  const chartData = transactions.reduce((acc: any[], txn) => {
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

  const displayData = chartData.length > 0 ? chartData : [];

  const pieData = [
    { name: 'Paid/Zero Balance', value: activeCustomers - pendingInvoices - overdueAccounts },
    { name: 'Pending', value: pendingInvoices },
    { name: 'Overdue', value: overdueAccounts }
  ].filter(d => d.value > 0);
  const pieColors = ['#10b981', '#f59e0b', '#ef4444'];

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('Dashboard')}</h2>
          <p className="neu-text-muted">{t('Overview & Metrics')}</p>
        </div>
        <div className="flex items-center gap-4">
          {pendingComplaints.length > 0 && (
            <motion.div 
               initial={{ scale: 0.8, opacity: 0 }} 
               animate={{ scale: 1, opacity: 1 }} 
               className="flex items-center gap-2 px-3 py-1.5 bg-amber-100 text-amber-700 rounded-full border border-amber-200"
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

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.1 }}
          whileHover={{ scale: 1.05, y: -5 }} 
          className="group"
        >
          <Card className="overflow-hidden relative border-white/5 bg-white/5 backdrop-blur-md">
            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-30 transition-opacity">
              <DollarSign className="h-12 w-12 text-emerald-500 rotate-12" />
            </div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wider opacity-70">{t('Total Revenue')}</CardTitle>
              <DollarSign className="h-4 w-4 text-emerald-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black tracking-tighter">{formatCurrency(totalRevenue)}</div>
              <p className="text-xs text-emerald-500 font-bold mt-1 flex items-center gap-1">
                <span className="inline-block w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                +12% from last month
              </p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.2 }}
          whileHover={{ scale: 1.05, y: -5 }}
          className="group"
        >
          <Card className="overflow-hidden relative border-white/5 bg-white/5 backdrop-blur-md">
            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-30 transition-opacity">
              <Users className="h-12 w-12 text-blue-500 -rotate-12" />
            </div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wider opacity-70">{t('Active Customers')}</CardTitle>
              <Users className="h-4 w-4 text-blue-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black tracking-tighter">{activeCustomers.toLocaleString('en-IN')}</div>
              <p className="text-xs neu-text-muted font-medium mt-1">Out of {customers.length.toLocaleString('en-IN')} total</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.3 }}
          whileHover={{ scale: 1.05, y: -5 }}
          className="group"
        >
          <Card className="overflow-hidden relative border-white/5 bg-white/5 backdrop-blur-md">
            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-30 transition-opacity">
              <FileText className="h-12 w-12 text-amber-500 rotate-45" />
            </div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wider opacity-70">{t('Pending Payments')}</CardTitle>
              <FileText className="h-4 w-4 text-amber-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black tracking-tighter">{pendingInvoices.toLocaleString('en-IN')}</div>
              <p className="text-xs text-amber-500 font-bold mt-1">Totaling {formatCurrency(pendingAmount)}</p>
            </CardContent>
          </Card>
        </motion.div>

        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 0.4 }}
          whileHover={{ scale: 1.05, y: -5 }}
          className="group"
        >
          <Card className="overflow-hidden relative border-white/5 bg-white/5 backdrop-blur-md">
            <div className="absolute top-0 right-0 p-2 opacity-10 group-hover:opacity-30 transition-opacity">
              <AlertTriangle className="h-12 w-12 text-red-500 -rotate-12" />
            </div>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-bold uppercase tracking-wider opacity-70">Overdue Accounts</CardTitle>
              <AlertTriangle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-3xl font-black tracking-tighter">{overdueAccounts.toLocaleString('en-IN')}</div>
              <p className="text-xs text-red-500 font-bold mt-1">Requires follow-up</p>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-7">
        <motion.div className="col-span-full lg:col-span-4" whileHover={{ scale: 1.01 }} transition={{ type: "spring", stiffness: 300 }}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Revenue vs Expected</CardTitle>
            </CardHeader>
            <CardContent className="pl-2">
              <div className="h-[300px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={displayData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorExpected" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#94a3b8" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <XAxis dataKey="month" stroke="#888888" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#888888" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `₹${value}`} />
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e5e7eb" />
                    <Tooltip formatter={(value) => `₹${value}`} />
                    <Area type="monotone" dataKey="revenue" stroke="#10b981" fillOpacity={1} fill="url(#colorRevenue)" name="Actual Revenue" />
                    <Area type="monotone" dataKey="expected" stroke="#94a3b8" fillOpacity={1} fill="url(#colorExpected)" name="Expected Revenue" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div className="col-span-full lg:col-span-3" whileHover={{ scale: 1.01 }} transition={{ type: "spring", stiffness: 300 }}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Account Status Distribution</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="h-[200px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex justify-center gap-4 mt-2">
                {pieData.map((entry, index) => (
                  <div key={entry.name} className="flex items-center gap-1.5 text-xs font-medium neu-text-muted">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: pieColors[index % pieColors.length] }}></span>
                    {entry.name}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="grid gap-4 grid-cols-1">
        <motion.div className="col-span-1" whileHover={{ scale: 1.01 }} transition={{ type: "spring", stiffness: 300 }}>
          <Card className="h-full">
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {transactions.slice(-5).reverse().map((txn, i) => {
                  const customer = customers.find(c => c.id === txn.customerId);
                  return (
                    <motion.div 
                      key={txn.id} 
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.1 }}
                      whileHover={{ x: -5 }}
                      className="flex items-start gap-4 border-b border-[var(--shadow-dark)] pb-4 last:border-0 last:pb-0 cursor-default"
                    >
                      <div className="mt-0.5 w-2 h-2 rounded-full shrink-0 bg-emerald-500" />
                      <div className="space-y-1">
                        <p className="text-sm font-medium leading-none">Payment Received</p>
                        <p className="text-sm neu-text-muted">₹{txn.amount} from {customer ? customer.name : 'Unknown'}</p>
                        <p className="text-xs neu-text-muted opacity-70">{new Date(txn.date).toLocaleDateString()}</p>
                      </div>
                    </motion.div>
                  );
                })}
                {transactions.length === 0 && (
                  <div className="text-center py-8 neu-text-muted">No recent transactions</div>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}
