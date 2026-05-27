import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { ClipboardList, AlertCircle, FileText, Settings, Key, ShieldAlert, Trash2, MessageCircle, X, Paperclip, Send } from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useRef } from "react";
import { sendWhatsAppNotification } from "../lib/automation";
import { useData } from "../contexts/DataContext";
import { subscribeToBillingAuditLogs, BillingAuditLog, deleteAuditLog, clearAllAuditLogs } from "../lib/db";
import { useTranslation } from "react-i18next";
import { ConfirmModal } from "../components/ConfirmModal";

export function BillingAuditView() {
  const { t } = useTranslation();
  const [logs, setLogs] = useState<BillingAuditLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const { customers, settings } = useData();
  const [logToDelete, setLogToDelete] = useState<string | null>(null);
  const [messageModalLog, setMessageModalLog] = useState<BillingAuditLog | null>(null);
  const [notifyMessage, setNotifyMessage] = useState("");
  const [selectedMethod, setSelectedMethod] = useState("api");
  const [attachmentLink, setAttachmentLink] = useState("");
  const [isSendingNotify, setIsSendingNotify] = useState(false);
  const [alertConfig, setAlertConfig] = useState<{ isOpen: boolean; title: string; message: string }>({ isOpen: false, title: "", message: "" });

  const showAlert = (title: string, message: string) => setAlertConfig({ isOpen: true, title, message });

  useEffect(() => {
    const unsubscribe = subscribeToBillingAuditLogs((fetchedLogs) => {
      setLogs(fetchedLogs);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleClearAll = async () => {
    setIsDeleting(true);
    await clearAllAuditLogs();
    setIsDeleting(false);
    setShowClearConfirm(false);
  };

  const handleDeleteLog = async () => {
    if (logToDelete) {
      await deleteAuditLog(logToDelete);
      setLogToDelete(null);
    }
  };

  const openMessageModal = (log: BillingAuditLog) => {
    setMessageModalLog(log);
    setNotifyMessage(`Regarding log: ${log.description}`);
    setSelectedMethod(settings?.metaWhatsAppApiKey ? "api" : "web");
    setAttachmentLink("");
    setIsSendingNotify(false);
  };

  const handleSendMessage = async () => {
    if (!messageModalLog || !messageModalLog.customerId) return;
    
    const customer = customers.find(c => c.id === messageModalLog.customerId);
    if (!customer) {
      showAlert("Error", "Associated customer not found in active records.");
      return;
    }

    setIsSendingNotify(true);
    try {
      const tempSettings = { ...settings!, preferredNotificationMethod: selectedMethod };
      
      let finalMessage = notifyMessage;
      if (attachmentLink.trim()) {
        finalMessage += `\n\nDocument Link: ${attachmentLink.trim()}`;
      }
      
      const result = await sendWhatsAppNotification(
        customer, 
        finalMessage, 
        tempSettings, 
        undefined, 
        undefined, 
        selectedMethod !== "api",
        true, 
        'custom'
      );
      
      if (result.success) {
        showAlert("Success", `Message sent to ${customer.name}${result.fellBackToManual ? ' (opened in WhatsApp App)' : ''}.`);
        setMessageModalLog(null);
      } else {
        showAlert("Failed", result.error || "Failed to send message.");
      }
    } catch (e: any) {
      showAlert("Error", e.message || "Unknown error occurred.");
    } finally {
      setIsSendingNotify(false);
    }
  };

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
      case 'inquiry':
        return <ClipboardList className="w-5 h-5 text-emerald-500" />;
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
          <p className="neu-text-muted mt-1">A chronological log of all generated bills, penalty applications, and specific inquiries.</p>
        </div>
        {logs.length > 0 && (
          <button
            onClick={() => setShowClearConfirm(true)}
            disabled={isDeleting}
            className="flex items-center gap-2 px-4 py-2 bg-rose-500 text-white rounded-xl font-semibold shadow-md active:scale-95 transition-all text-sm disabled:opacity-50"
          >
            <Trash2 className="w-4 h-4" />
            {isDeleting ? "Clearing..." : "Clear All"}
          </button>
        )}
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
                    className="flex flex-col sm:flex-row items-center justify-between p-4 neu-flat rounded-2xl group hover:shadow-lg transition-shadow gap-4"
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
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm neu-text-muted mt-1 w-full max-w-full">
                          <span>{new Date(log.timestamp).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
                          {log.type !== 'inquiry' && <span>&bull;</span>}
                          {log.type !== 'inquiry' && <span>Affected: {log.affectedCustomersCount}</span>}
                          {log.type !== 'inquiry' && <span>&bull;</span>}
                          {log.type !== 'inquiry' && (
                            <span className={log.type === 'penalty_application' ? 'text-rose-500 font-semibold' : 'text-blue-500 font-semibold'}>
                              Amount: {formatCurrency(log.totalAmount)}
                            </span>
                          )}
                          {log.type === 'inquiry' && log.customerName && (
                            <>
                              <span>&bull;</span>
                              <span className="font-semibold text-emerald-600">From: {log.customerName}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="flex sm:opacity-0 sm:group-hover:opacity-100 transition-opacity gap-2">
                      {log.customerId && (
                        <button
                          onClick={() => openMessageModal(log)}
                          className="p-2 text-emerald-500 hover:bg-emerald-50 rounded-xl transition-colors"
                          title="Send WhatsApp Message"
                        >
                          <MessageCircle className="w-5 h-5" />
                        </button>
                      )}
                      <button
                        onClick={() => setLogToDelete(log.id!)}
                        className="p-2 text-rose-500 hover:bg-rose-50 rounded-xl transition-colors"
                        title="Delete log"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          )}
        </CardContent>
      </Card>
      
      <ConfirmModal
        isOpen={showClearConfirm}
        onClose={() => setShowClearConfirm(false)}
        onConfirm={handleClearAll}
        title="Clear Audit Trail"
        message="Are you sure you want to delete all audit logs? This action cannot be undone."
        confirmText="Clear All"
        cancelText="Cancel"
        isDestructive={true}
      />
      
      <ConfirmModal
        isOpen={!!logToDelete}
        onClose={() => setLogToDelete(null)}
        onConfirm={handleDeleteLog}
        title="Delete Log"
        message="Are you sure you want to delete this specific audit log entry? This cannot be undone."
        confirmText="Delete"
        cancelText="Cancel"
        isDestructive={true}
      />

      {!!messageModalLog && (
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
                <p className="text-xs neu-text-muted">Sending to {messageModalLog.customerName || 'Customer'}</p>
              </div>
              <button 
                onClick={() => setMessageModalLog(null)}
                className="p-2 hover:bg-black/10 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-bold uppercase tracking-wider neu-text-muted mb-2">
                  Your Message
                </label>
                <textarea
                  value={notifyMessage}
                  onChange={e => setNotifyMessage(e.target.value)}
                  disabled={isSendingNotify}
                  placeholder="Type your message here..."
                  className="w-full h-32 px-4 py-3 neu-pressed rounded-xl bg-transparent outline-none text-sm font-medium resize-none focus:ring-2 focus:ring-emerald-500/50 mb-2 disabled:opacity-50"
                />
              </div>

              <div>
                <label className="block text-sm font-bold uppercase tracking-wider neu-text-muted mb-2">
                  Attachment Link (Optional)
                </label>
                <textarea
                  value={attachmentLink}
                  onChange={e => setAttachmentLink(e.target.value)}
                  disabled={isSendingNotify}
                  placeholder="Paste a Google Drive or document link here..."
                  className="w-full h-16 px-4 py-3 neu-pressed rounded-xl bg-transparent outline-none text-sm font-medium resize-none focus:ring-2 focus:ring-blue-500/50 mb-2 disabled:opacity-50"
                />
              </div>

              <div className="pt-2">
                <label className="block text-sm font-bold uppercase tracking-wider neu-text-muted mb-2">
                  WhatsApp Method
                </label>
                <select
                  value={selectedMethod}
                  onChange={(e) => setSelectedMethod(e.target.value)}
                  disabled={isSendingNotify}
                  className="w-full px-4 py-3 neu-pressed rounded-xl bg-transparent outline-none focus:ring-2 focus:ring-blue-500/50 appearance-none disabled:opacity-50"
                >
                  <option value="api">API: Automated WhatsApp Cloud</option>
                  <option value="web">Manual: WhatsApp App / Web</option>
                </select>
              </div>

              <button
                onClick={handleSendMessage}
                disabled={!notifyMessage.trim() || isSendingNotify}
                className="w-full flex items-center justify-center gap-2 mt-4 px-6 py-3 bg-emerald-500 text-white rounded-xl font-bold shadow-[0_4px_14px_0_rgba(16,185,129,0.39)] hover:shadow-[0_6px_20px_rgba(16,185,129,0.23)] hover:bg-emerald-600 transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100 disabled:hover:shadow-none"
              >
                {isSendingNotify ? <span className="animate-pulse">Sending...</span> : <><Send className="w-5 h-5" /> Send WhatsApp</>}
              </button>
            </div>
          </motion.div>
        </div>
      )}

      <ConfirmModal
        isOpen={alertConfig.isOpen}
        onClose={() => setAlertConfig(prev => ({ ...prev, isOpen: false }))}
        onConfirm={() => setAlertConfig(prev => ({ ...prev, isOpen: false }))}
        title={alertConfig.title}
        message={alertConfig.message}
        confirmText="OK"
        showCancel={false}
      />
    </motion.div>
  );
}
