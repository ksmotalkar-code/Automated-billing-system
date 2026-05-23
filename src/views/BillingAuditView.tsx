import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { ClipboardList, AlertCircle, FileText, Settings, Key, ShieldAlert } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useData } from "../contexts/DataContext";
import { subscribeToBillingAuditLogs, BillingAuditLog } from "../lib/db";
import { useTranslation } from "react-i18next";

export function BillingAuditView() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<BillingAuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = subscribeToBillingAuditLogs((fetchedLogs) => {
      setLogs(fetchedLogs);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  const getLogIcon = (type: BillingAuditLog['type']) => {
    switch (type) {
      case 'bill_generation':
        return <FileText className="w-5 h-5 text-blue-500" />;
      case 'penalty_application':
        return <AlertCircle className="w-5 h-5 text-rose-500" />;
      case 'auto_suspend':
        return <ShieldAlert className="w-5 h-5 text-orange-500" />;
      default:
        return <ClipboardList className="w-5 h-5 text-gray-500" />;
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="space-y-6 max-w-5xl mx-auto"
    >
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight flex items-center gap-3">
            <ClipboardList className="w-8 h-8 neu-accent" />
            Audit Trail
          </h1>
          <p className="neu-text-muted mt-1">A chronological log of all generated bills and penalty applications.</p>
        </div>
      </div>

      <Card className="neu-flat border-none shadow-none">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Settings className="w-5 h-5" /> Activity Logs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex justify-center p-8">
              <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center p-8 neu-text-muted bg-black/5 rounded-xl">
              <ClipboardList className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No audit logs available yet.</p>
            </div>
          ) : (
            <div className="space-y-4">
              <AnimatePresence>
                {logs.map((log) => (
                  <motion.div
                    key={log.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex flex-col sm:flex-row items-center justify-between p-4 neu-flat rounded-2xl group hover:shadow-lg transition-shadow"
                  >
                    <div className="flex items-center gap-4 w-full">
                      <div className="p-3 bg-white/5 rounded-xl shadow-inner shrink-0">
                        {getLogIcon(log.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <h4 className="font-bold text-lg truncate flex items-center gap-2">
                          {log.description}
                          {log.executedBy === 'system' ? (
                            <span className="text-[10px] uppercase bg-purple-500/10 text-purple-600 px-2 py-0.5 rounded-full border border-purple-500/20 font-black tracking-wider flex items-center gap-1">
                              <Key className="w-3 h-3" /> System
                            </span>
                          ) : (
                            <span className="text-[10px] uppercase bg-blue-500/10 text-blue-600 px-2 py-0.5 rounded-full border border-blue-500/20 font-black tracking-wider flex items-center gap-1">
                              Admin
                            </span>
                          )}
                        </h4>
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm neu-text-muted mt-1">
                          <span>{new Date(log.timestamp).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                          <span>&bull;</span>
                          <span>Affected: {log.affectedCustomersCount}</span>
                          <span>&bull;</span>
                          <span className={log.type === 'penalty_application' ? 'text-rose-500 font-semibold' : 'text-blue-500 font-semibold'}>
                            Amount: {formatCurrency(log.totalAmount)}
                          </span>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
