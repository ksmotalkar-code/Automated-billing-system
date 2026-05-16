import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Settings, Bell, Shield, User, Globe, Palette, Database, HelpCircle, DollarSign, FileText, Save, AlertCircle, CreditCard, Plus, ArrowUp, ArrowDown, FileCode, Copy, Zap, Send, Webhook, ShieldCheck, Cpu } from "lucide-react";
import { motion } from "motion/react";
import { saveSettings, AppSettings, resetDatabase, WhatsAppProvider, getProviders, addProvider, deleteProvider, ChatbotCommand, getChatbotSettings, ChatbotSettings } from "../lib/db";
import { useData } from "../contexts/DataContext";
import { useTranslation } from "react-i18next";
import { Trash2, LogOut, MessageCircle, Loader2, X, Info } from "lucide-react";
import { auth, logout } from "../firebase";
import { ConfirmModal } from "../components/ConfirmModal";
import { v4 as uuidv4 } from "uuid";
import { getLogs, clearLogs, LogEntry } from '../lib/logger';

export function SettingsView() {
  const { t } = useTranslation();
  const { settings: contextSettings } = useData();
  const [activeTab, setActiveTab] = useState<'billing' | 'whatsapp' | 'security' | 'gateway' | 'broadcast'>('billing');
  const [settings, setSettings] = useState<AppSettings>(contextSettings || {
    upiQrCodeImage: null,
    billingAmount: 200,
    billingCycleMonths: 2,
    penaltyAmount: 40,
    penaltyDays: 10,
    defaultBillingDate: '1',
    metaWhatsAppApiKey: '',
    metaWhatsAppPhoneNumberId: '',
    metaWhatsAppVerifyToken: '',
    paymentGatewayKey: '',
    paymentGatewaySecret: '',
    automation: {
      billingLifecycle: true,
      ruleBased: true,
      lateFee: true,
      scheduledBilling: true,
      bulkProcessing: true,
      smartNotifications: true
    }
  });

  const [isTestLoading, setIsTestLoading] = useState(false);
  const [showLogsModal, setShowLogsModal] = useState(false);
  const [logsList, setLogsList] = useState<LogEntry[]>([]);
  const [logsPage, setLogsPage] = useState(1);
  const [providers, setProviders] = useState<WhatsAppProvider[]>([]);
  const [botSettings, setBotSettings] = useState<ChatbotSettings | null>(null);
  const isAdmin = auth.currentUser?.email === 'ksmotalkar@gmail.com';
  const [newProvider, setNewProvider] = useState<Partial<WhatsAppProvider>>({ id: '', name: '', baseUrl: '', requiresApiKey: true, requiresPhoneId: false, isActive: true });

  const [isTriggerLoading, setIsTriggerLoading] = useState(false);
  const [testMobile, setTestMobile] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isCheckingUpdates, setIsCheckingUpdates] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [showResetConfirm, setShowResetConfirm] = useState(false);
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

  useEffect(() => {
    if (contextSettings) {
      if (JSON.stringify(contextSettings) !== JSON.stringify(settings)) {
        setSettings(contextSettings);
      }
      import("../services/whatsappService").then(({ whatsappService }) => {
        whatsappService.updateConfig(
          contextSettings.metaWhatsAppApiKey || null,
          contextSettings.metaWhatsAppPhoneNumberId || null,
          contextSettings.watiAccessToken || null,
          contextSettings.watiApiEndpoint || null,
          contextSettings.preferredNotificationMethod || null
        );
      });
    }
  }, [contextSettings]);

  useEffect(() => {
    if (!contextSettings) return;
    const isDifferent = JSON.stringify(settings) !== JSON.stringify(contextSettings);
    if (!isDifferent) return;
    
    const timer = setTimeout(() => {
      saveSettings(settings).catch(e => console.error("Auto-save failed", e));
    }, 1500);
    return () => clearTimeout(timer);
  }, [settings, contextSettings]);

  useEffect(() => {
    const loadProviders = async () => {
      try {
        const provs = await getProviders();
        setProviders(provs);
        
        const botData = await getChatbotSettings();
        setBotSettings(botData);
      } catch(e) {
        console.error("Failed to load providers or bot settings", e);
      }
    };
    loadProviders();
  }, []);

  const [templateToTest, setTemplateToTest] = useState<string>('hello_world');

  const handleTestWhatsApp = async () => {
    if (!testMobile) {
      showAlert("Missing Phone Number", "Please enter a mobile number to send the test message to.");
      return;
    }
    setIsTestLoading(true);
    try {
      const resp = await fetch('/api/wa/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ownerId: auth.currentUser?.uid, 
          testMobile, 
          apiKey: settings.metaWhatsAppApiKey, 
          phoneId: settings.metaWhatsAppPhoneNumberId,
          watiAccessToken: settings.watiAccessToken,
          watiApiEndpoint: settings.watiApiEndpoint,
          method: settings.preferredNotificationMethod,
          templateToTest
        })
      });
      const data = await resp.json();
      if (resp.ok) {
        showAlert("Test Successful", data.info);
      } else {
        showAlert("Test Failed", data.error || "Check your API credentials.");
      }
    } catch (err) {
      showAlert("Error", "Network error while testing WhatsApp.");
    } finally {
      setIsTestLoading(false);
    }
  };

  const handleTriggerAutomation = () => {
    setConfirmConfig({
      isOpen: true,
      title: "Run Billing Automation Now?",
      message: "CAUTION: This will bypass the current date check and immediately run the billing logic, add balances, and send notifications to all active customers. Only run this if you know what you are doing.",
      showCancel: true,
      onConfirm: async () => {
        setConfirmConfig({ ...confirmConfig, isOpen: false });
        setIsTriggerLoading(true);
        try {
          const resp = await fetch('/api/cron/daily', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ownerId: auth.currentUser?.uid })
          });
          if (resp.ok) {
            showAlert("Automation Triggered", "The daily automation cycle has been manually started for your customers. Balances will be updated and notifications sent based on your rules.");
          } else {
            showAlert("Failed", "Could not trigger automation. Ensure Firebase Admin is configured on the server.");
          }
        } catch (err) {
          showAlert("Error", "Network error while triggering automation.");
        } finally {
          setIsTriggerLoading(false);
        }
      }
    });
  };

  const handleCheckUpdates = () => {
    setIsCheckingUpdates(true);
    // Simulate update check
    setTimeout(() => {
      setIsCheckingUpdates(false);
      window.location.reload();
    }, 3000);
  };

  const performReset = async () => {
    setIsResetting(true);
    try {
      await resetDatabase();
      // Logout after successful reset to fulfill "reload app with no any user in it"
      await logout();
      
      // Use a small delay to ensure Firestore operations are processed before reload
      setTimeout(() => {
        window.location.href = window.location.origin;
      }, 1500);
    } catch (error) {
      console.error("Error resetting database:", error);
      showAlert("Error", "Failed to reset database. Please check your connection and try again.");
    } finally {
      setIsResetting(false);
    }
  };

  const handleResetDatabase = () => {
    setShowResetConfirm(true);
  };

  const settingsGroups = [
    {
      title: "Account & Profile",
      icon: User,
      color: "text-blue-600",
      items: ["Profile Information", "Change Password", "Two-Factor Authentication"]
    },
    {
      title: "Notifications",
      icon: Bell,
      color: "text-amber-600",
      items: ["Email Alerts", "SMS Notifications", "Customer Reminders"]
    },
    {
      title: "Appearance",
      icon: Palette,
      color: "text-purple-600",
      items: ["Theme Selection", "Dashboard Layout", "Chart Colors"]
    },
    {
      title: "Security & Privacy",
      icon: Shield,
      color: "text-red-600",
      items: ["Access Logs", "Privacy Settings", "Encryption Keys"]
    }
  ];

  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [broadcastAttachment, setBroadcastAttachment] = useState<File | null>(null);
  const [manualCustomers, setManualCustomers] = useState<any[]>([]);
  const [manualIndex, setManualIndex] = useState(0);
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);

  const startManualBroadcast = async () => {
    try {
      const { db } = await import('../firebase');
      const { collection, query, where, getDocs } = await import('firebase/firestore');
      const q = query(collection(db, 'customers'), where('ownerId', '==', auth.currentUser?.uid), where('status', '==', 'Active'));
      const snap = await getDocs(q);
      const custs = snap.docs.map(d => d.data());
      if (custs.length === 0) {
        showAlert("No Customers", "No active customers found.");
        return;
      }
      setManualCustomers(custs);
      setManualIndex(0);
      setIsManualModalOpen(true);
    } catch(err) {
      console.error(err);
      showAlert("Error", "Could not load customers for manual broadcast.");
    }
  };

  const skipManualCustomer = () => {
    if (manualIndex < manualCustomers.length - 1) {
      setManualIndex(manualIndex + 1);
    } else {
      setIsManualModalOpen(false);
      showAlert("Completed", "Manual broadcast finished.");
    }
  };

  const sendManualCustomer = () => {
    const cust = manualCustomers[manualIndex];
    if (cust.mobileNumber) {
      const mobile = cust.mobileNumber.replace(/\D/g, '');
      const formattedTo = mobile.startsWith('91') ? mobile : `91${mobile}`;
      const url = `https://wa.me/${formattedTo}?text=${encodeURIComponent(broadcastMessage)}`;
      window.open(url, '_blank');
    }
    
    skipManualCustomer();
  };

  const handleBroadcast = async () => {
    if (!broadcastMessage.trim()) {
      showAlert("Message Empty", "Please enter a message to broadcast.");
      return;
    }
    
    if (!settings.metaWhatsAppApiKey && !settings.watiAccessToken) {
      setConfirmConfig({
        isOpen: true,
        title: "API Not Configured",
        message: "You haven't configured any WhatsApp API (Meta or WATI). Would you like to send messages manually via the WhatsApp App instead?",
        onConfirm: () => {
          setConfirmConfig({ ...confirmConfig, isOpen: false });
          startManualBroadcast();
        },
        showCancel: true
      });
      return;
    }

    setConfirmConfig({
      isOpen: true,
      title: "Confirm Broadcast?",
      message: `Are you sure you want to send this message to ALL active customers using ${settings.preferredNotificationMethod === 'wati' ? 'WATI' : 'Meta API'}?`,
      onConfirm: async () => {
        setIsBroadcasting(true);
        try {
          let mediaBase64: string | undefined = undefined;
          let mediaName: string | undefined = undefined;
          
          if (broadcastAttachment) {
            mediaName = broadcastAttachment.name;
            mediaBase64 = await new Promise((resolve, reject) => {
               const reader = new FileReader();
               reader.onloadend = () => resolve(reader.result as string);
               reader.onerror = reject;
               reader.readAsDataURL(broadcastAttachment);
            });
          }

          const resp = await fetch('/api/wa/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
               ownerId: auth.currentUser?.uid, 
               message: broadcastMessage, 
               apiKey: settings.metaWhatsAppApiKey, 
               phoneId: settings.metaWhatsAppPhoneNumberId,
               watiAccessToken: settings.watiAccessToken,
               watiApiEndpoint: settings.watiApiEndpoint,
               mediaBase64,
               mediaName,
               method: settings.preferredNotificationMethod
            })
          });
          const data = await resp.json();
          if (resp.ok) {
            showAlert("Broadcast Completed", `Sent to ${data.success} customers. Failed for ${data.failed}.`);
            setBroadcastMessage('');
          } else {
            setConfirmConfig({
              isOpen: true,
              title: "API Broadcast Failed",
              message: "The API broadcast failed. Would you like to fallback to manual messaging (opening WhatsApp App for each customer)?",
              onConfirm: () => {
                startManualBroadcast();
              },
              showCancel: true
            });
          }
        } catch (err) {
          showAlert("Error", "Network error during broadcast.");
        } finally {
          setIsBroadcasting(false);
        }
      },
      showCancel: true
    });
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6 pb-10"
    >
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
        <div>
          <h2 className="text-3xl font-black tracking-tight uppercase">{t('Settings')}</h2>
          <p className="neu-text-muted flex items-center gap-2 text-sm font-bold uppercase tracking-[0.2em] mt-1">
             <span className="w-2 h-2 rounded-full bg-[var(--accent)]" />
             System Configuration
          </p>
        </div>
        <div className="flex justify-center items-center gap-2 px-6 py-3 bg-[var(--accent)]/10 text-[var(--accent)] rounded-2xl text-[10px] font-black uppercase tracking-widest border border-[var(--accent)]/20 w-full sm:w-auto mt-4 sm:mt-0">
          <Save className="w-4 h-4" />
          Settings are auto-saved
        </div>
      </div>

      <div className="flex p-1.5 neu-pressed rounded-2xl flex-nowrap overflow-x-auto custom-scrollbar no-scrollbar gap-1">
        {[
          { id: 'billing', icon: DollarSign, label: 'Cycles', color: 'text-blue-600' },
          { id: 'whatsapp', icon: MessageCircle, label: 'WhatsApp', color: 'text-emerald-600' },
          { id: 'gateway', icon: CreditCard, label: 'Payments', color: 'text-indigo-600' },
          { id: 'broadcast', icon: Globe, label: 'Broadcast', color: 'text-purple-600' },
          { id: 'security', icon: Shield, label: 'Security', color: 'text-rose-600' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id as any)}
            className={`flex items-center gap-2 px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap flex-1 justify-center ${
              activeTab === tab.id 
                ? `neu-flat bg-white dark:bg-black/20 ${tab.color} ring-1 ring-white/10` 
                : 'neu-text-muted hover:opacity-100 opacity-60'
            }`}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'broadcast' && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
          <Card className="border-none border-t border-white/5 overflow-hidden">
            <CardHeader className="flex flex-row items-center gap-4 pb-4 border-b border-[var(--shadow-dark)]">
              <div className="p-3 neu-pressed rounded-2xl text-purple-600">
                <Globe className="w-6 h-6" />
              </div>
              <div>
                <CardTitle className="text-sm font-black uppercase tracking-widest">Bulk WhatsApp Broadcast</CardTitle>
                <p className="text-[10px] neu-text-muted font-bold uppercase tracking-tighter opacity-70">Mass Outreach Engine</p>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="p-5 neu-pressed rounded-2xl bg-purple-500/5 border-l-4 border-purple-500">
                 <p className="text-[10px] text-purple-600 font-black uppercase tracking-widest mb-2">Protocol Compliance:</p>
                 <ul className="text-xs text-purple-700/80 font-bold space-y-1.5 list-none">
                   <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-purple-500" /> Templates required for 24h+ gaps (Meta).</li>
                   <li className="flex items-center gap-2"><div className="w-1.5 h-1.5 rounded-full bg-purple-500" /> Anti-spam rate limits apply.</li>
                 </ul>
              </div>
              
              <div className="space-y-3">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] neu-text-muted ml-1">
                  Announcement Message Payload
                </label>
                <textarea
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  rows={6}
                  className="w-full px-5 py-4 neu-pressed rounded-2xl bg-transparent outline-none text-sm font-bold resize-none focus:ring-2 focus:ring-purple-500/30 transition-all placeholder:opacity-40"
                  placeholder="Enter broadcast content... (e.g. Server maintenance scheduled for 14:00 IST)"
                />
              </div>

              <div className="flex items-center justify-between p-4 neu-pressed rounded-2xl">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 px-4 py-2 cursor-pointer neu-flat-sm text-purple-600 rounded-xl hover:opacity-80 transition-all text-[10px] font-black uppercase tracking-widest">
                    <Plus className="w-4 h-4" /> Attach Media
                    <input type="file" className="hidden" onChange={(e) => setBroadcastAttachment(e.target.files?.[0] || null)} />
                  </label>
                  <span className="text-[10px] font-bold neu-text-muted truncate max-w-[200px]">
                    {broadcastAttachment ? broadcastAttachment.name : "Unattached (Standard Text Mode)"}
                  </span>
                </div>
                {broadcastAttachment && (
                    <button onClick={() => setBroadcastAttachment(null)} className="p-2 neu-flat-sm text-red-500 rounded-lg"><X className="w-4 h-4" /></button>
                )}
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleBroadcast}
                disabled={isBroadcasting}
                className="w-full py-5 bg-purple-600 text-white rounded-2xl font-black uppercase tracking-[0.1em] text-xs shadow-xl shadow-purple-500/30 flex items-center justify-center gap-3 disabled:opacity-50 transition-all"
              >
                {isBroadcasting ? <Loader2 className="w-5 h-5 animate-spin" /> : <Globe className="w-5 h-5" />}
                {isBroadcasting ? "Transmitting..." : "Initiate Global Broadcast"}
              </motion.button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {activeTab === 'whatsapp' && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
          <Card className="border-none border-t border-white/5 overflow-hidden">
            <CardHeader className="flex flex-row items-center gap-4 pb-4 border-b border-[var(--shadow-dark)]">
              <div className="p-3 neu-pressed rounded-2xl text-emerald-600">
                <MessageCircle className="w-6 h-6" />
              </div>
              <div>
                <CardTitle className="text-sm font-black uppercase tracking-widest">Automated Messaging Hub</CardTitle>
                <p className="text-[10px] neu-text-muted font-bold uppercase tracking-tighter opacity-70">Official Integration Bridge</p>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-10">
              {/* Provider Selection */}
              <div className="space-y-4">
                <p className="text-[10px] font-black uppercase tracking-[0.2em] neu-text-muted">Primary Bridge Provider</p>
                <div className="p-1.5 neu-pressed rounded-2xl flex gap-1.5 w-fit">
                   {[
                     { id: 'api', label: 'Meta Business API' },
                     { id: 'wati', label: 'WATI Cloud API' },
                     { id: 'manual_link', label: 'Manual Link Mode' }
                   ].map(provider => (
                     <button 
                       key={provider.id}
                       onClick={() => setSettings({...settings, preferredNotificationMethod: provider.id as any})}
                       className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${settings.preferredNotificationMethod === provider.id ? 'neu-flat bg-emerald-600 text-white shadow-lg shadow-emerald-500/20' : 'neu-text-muted opacity-60'}`}
                     >
                       {provider.label}
                     </button>
                   ))}
                </div>
              </div>

              {/* API Configuration */}
              <div className="grid gap-6 md:grid-cols-2">
                {settings.preferredNotificationMethod === 'api' ? (
                  <>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] neu-text-muted ml-1">Meta Access Token (Bearer)</label>
                      <input
                        type="password"
                        value={settings.metaWhatsAppApiKey || ''}
                        onChange={(e) => setSettings({ ...settings, metaWhatsAppApiKey: e.target.value })}
                        className="w-full px-5 py-4 neu-pressed rounded-2xl bg-transparent outline-none text-sm font-bold focus:ring-2 focus:ring-emerald-500/30 transition-all shadow-inner"
                        placeholder="••••••••••••••••••••••••••••"
                      />
                      <p className="text-[9px] neu-text-muted font-bold ml-1 uppercase tracking-tighter opacity-60">Located in Meta App Dashboard under API Setup</p>
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] neu-text-muted ml-1">Phone Number ID</label>
                      <input
                        type="text"
                        value={settings.metaWhatsAppPhoneNumberId || ''}
                        onChange={(e) => setSettings({ ...settings, metaWhatsAppPhoneNumberId: e.target.value })}
                        className="w-full px-5 py-4 neu-pressed rounded-2xl bg-transparent outline-none text-sm font-bold focus:ring-2 focus:ring-emerald-500/30 transition-all shadow-inner"
                        placeholder="101XXXXXXXXXXXX"
                      />
                      <p className="text-[9px] neu-text-muted font-bold ml-1 uppercase tracking-tighter opacity-60">Specific ID for the connected phone number</p>
                    </div>
                  </>
                ) : settings.preferredNotificationMethod === 'wati' ? (
                  <>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] neu-text-muted ml-1">WATI API Key</label>
                      <input
                        type="password"
                        value={settings.watiAccessToken || ''}
                        onChange={(e) => setSettings({ ...settings, watiAccessToken: e.target.value })}
                        className="w-full px-5 py-4 neu-pressed rounded-2xl bg-transparent outline-none text-sm font-bold focus:ring-2 focus:ring-emerald-500/30 transition-all shadow-inner"
                        placeholder="••••••••••••••••"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] neu-text-muted ml-1">Gateway Endpoint</label>
                      <input
                        type="text"
                        value={settings.watiApiEndpoint || ''}
                        onChange={(e) => setSettings({ ...settings, watiApiEndpoint: e.target.value })}
                        className="w-full px-5 py-4 neu-pressed rounded-2xl bg-transparent outline-none text-sm font-bold focus:ring-2 focus:ring-emerald-500/30 transition-all shadow-inner"
                        placeholder="https://live-server.wati.io/api"
                      />
                    </div>
                  </>
                ) : (
                  <div className="col-span-full p-6 neu-pressed rounded-2xl bg-blue-500/5 border-l-4 border-blue-500">
                    <div className="flex items-center gap-2 text-blue-600 font-black text-[10px] uppercase tracking-widest mb-2">
                       <Info className="w-4 h-4" /> Manual Dispatch Mode
                    </div>
                    <p className="text-xs text-blue-800/80 font-bold leading-relaxed">
                      Manual mode bypasses API automation. The system generates secure portal links which you can manually share via WhatsApp Web or your mobile device. Ideal for small-scale testing or unverified Meta apps.
                    </p>
                  </div>
                )}

                {/* Templates (Only for API Modes) */}
                {(settings.preferredNotificationMethod === 'api' || settings.preferredNotificationMethod === 'wati') && (
                  <div className="col-span-full space-y-6 pt-10 border-t border-[var(--shadow-dark)]">
                    <div className="flex items-center gap-3">
                       <FileCode className="w-5 h-5 text-emerald-600" />
                       <div>
                        <h4 className="text-[11px] font-black uppercase tracking-[0.15em] text-emerald-600 leading-none">Template Registry</h4>
                        <p className="text-[9px] font-bold neu-text-muted uppercase tracking-tighter opacity-60 mt-1">Pre-approved Meta Message IDs</p>
                       </div>
                    </div>
                    
                    <div className="grid gap-4 md:grid-cols-3">
                       {[
                         { id: 'metaTemplateBilling', label: 'Cyclic Invoice', placeholder: 'bill_reminder_v1' },
                         { id: 'metaTemplateReceipt', label: 'Success Receipt', placeholder: 'payment_ack_v3' },
                         { id: 'metaTemplateBroadcast', label: 'Bulk Broadcast', placeholder: 'mass_broadcast_generic' }
                       ].map(tmp => (
                         <div key={tmp.id} className="space-y-3">
                            <label className="text-[9px] font-black uppercase tracking-[0.1em] neu-text-muted ml-1">{tmp.label}</label>
                            <input
                              type="text"
                              value={(settings as any)[tmp.id] || ''}
                              onChange={(e) => setSettings({ ...settings, [tmp.id]: e.target.value })}
                              className="w-full px-5 py-4 neu-pressed rounded-2xl bg-transparent outline-none text-xs font-black uppercase tracking-widest focus:ring-2 focus:ring-blue-500/30 transition-all shadow-inner"
                              placeholder={tmp.placeholder}
                            />
                         </div>
                       ))}
                    </div>
                  </div>
                )}

                {/* Connectivity Test */}
                <div className="col-span-full space-y-6 pt-10 border-t border-[var(--shadow-dark)]">
                   <div className="flex items-center gap-3">
                      <Zap className="w-5 h-5 text-emerald-600 font-black" />
                      <div>
                        <h4 className="text-[11px] font-black uppercase tracking-[0.15em] text-emerald-600 leading-none">Connectivity Check</h4>
                        <p className="text-[9px] font-bold neu-text-muted uppercase tracking-tighter opacity-60 mt-1">Blast Real-time Test Packets</p>
                      </div>
                   </div>
                   <div className="flex flex-col sm:flex-row gap-4">
                      <div className="flex-1 space-y-3">
                        <label className="text-[9px] font-black uppercase tracking-widest neu-text-muted ml-1">Recipient Number</label>
                        <input
                          type="text"
                          value={testMobile}
                          onChange={(e) => setTestMobile(e.target.value)}
                          className="w-full px-5 py-4 neu-pressed rounded-2xl bg-transparent outline-none text-xs font-black tracking-widest placeholder:opacity-20 shadow-inner"
                          placeholder="9198XXXXXXXX"
                        />
                      </div>
                      <div className="flex-1 space-y-3">
                        <label className="text-[9px] font-black uppercase tracking-widest neu-text-muted ml-1">Test Payload</label>
                        <select
                          value={templateToTest}
                          onChange={(e) => setTemplateToTest(e.target.value)}
                          className="w-full px-5 py-4 neu-pressed rounded-2xl bg-transparent outline-none text-xs font-black uppercase tracking-widest text-emerald-600 cursor-pointer shadow-inner"
                        >
                          <option value="hello_world">Meta: hello_world</option>
                          {settings.metaTemplateBilling && <option value={settings.metaTemplateBilling}>Billing: {settings.metaTemplateBilling}</option>}
                          {settings.metaTemplateReceipt && <option value={settings.metaTemplateReceipt}>Receipt: {settings.metaTemplateReceipt}</option>}
                          <option value="custom">Custom Entry</option>
                        </select>
                      </div>
                   </div>
                   <motion.button
                     whileHover={{ scale: 1.01 }}
                     whileTap={{ scale: 0.99 }}
                     onClick={handleTestWhatsApp}
                     disabled={isTestLoading || (settings.preferredNotificationMethod === 'manual_link')}
                     className="w-full py-5 neu-flat bg-emerald-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg shadow-emerald-500/20 flex items-center justify-center gap-3 disabled:opacity-40"
                   >
                     {isTestLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-5 h-5" />}
                     {isTestLoading ? "Testing Connection..." : "Fire Connectivity Test"}
                   </motion.button>
                </div>

                {/* Webhook Settings */}
                <div className="col-span-full space-y-6 pt-10 border-t border-[var(--shadow-dark)]">
                   <div className="flex items-center gap-3">
                      <Webhook className="w-5 h-5 text-emerald-600" />
                      <div>
                        <h4 className="text-[11px] font-black uppercase tracking-[0.15em] text-emerald-600 leading-none">Inbound Traffic Routing</h4>
                        <p className="text-[9px] font-bold neu-text-muted uppercase tracking-tighter opacity-60 mt-1">WhatsApp Webhook Listener</p>
                      </div>
                   </div>
                   
                   <p className="text-xs neu-text-muted font-medium leading-relaxed max-w-2xl px-1">
                      Integrate your WhatsApp chatbot by enabling webhooks. This allows for real-time customer replies, message logging, and automated complaint triggering.
                   </p>

                   <div className="grid gap-6 md:grid-cols-2">
                     <div className="space-y-3">
                        <label className="text-[9px] font-black uppercase tracking-wider neu-text-muted ml-1">Meta Verify Token</label>
                        <input
                          type="password"
                          value={settings.metaWhatsAppVerifyToken || ''}
                          onChange={(e) => setSettings({ ...settings, metaWhatsAppVerifyToken: e.target.value })}
                          className="w-full px-5 py-4 neu-pressed rounded-2xl bg-transparent outline-none text-sm font-bold shadow-inner"
                          placeholder="••••••••••••"
                        />
                        <p className="text-[9px] neu-text-muted font-bold ml-1 uppercase tracking-tighter opacity-60">Paste this exactly into Meta App Dashboard &gt; Webhooks</p>
                     </div>
                     <div className="space-y-3">
                        <label className="text-[9px] font-black uppercase tracking-wider neu-text-muted ml-1">Callback URL</label>
                        <div className="group relative">
                          <code className="block w-full px-5 py-4 neu-pressed rounded-2xl bg-transparent text-[11px] font-bold text-emerald-700/80 break-all select-all shadow-inner">
                            {window.location.origin}/api/whatsapp-webhook/{auth.currentUser?.uid}
                          </code>
                          <button className="absolute right-4 top-1/2 -translate-y-1/2 text-emerald-600 opacity-0 group-hover:opacity-100 transition-opacity">
                             <Copy className="w-4 h-4" />
                          </button>
                        </div>
                     </div>
                   </div>

                   <div className="p-5 neu-pressed rounded-2xl bg-red-500/5 border-l-4 border-red-500">
                      <div className="flex items-center gap-2 text-red-600 font-black text-[10px] uppercase tracking-widest mb-2">
                         <ShieldCheck className="w-4 h-4" /> Server Authority Required
                      </div>
                      <p className="text-xs text-red-800/80 font-bold">
                        Incoming webhooks require <code>FIREBASE_SERVICE_ACCOUNT</code> on your server environment. Without this, the system cannot verify inbound token authority.
                      </p>
                   </div>
                </div>

                {/* Automation & Chatbot Status */}
                <div className="col-span-full space-y-6 pt-10 border-t border-[var(--shadow-dark)]">
                   <div className="flex items-center gap-3">
                      <Cpu className="w-5 h-5 text-emerald-600" />
                      <div>
                        <h4 className="text-[11px] font-black uppercase tracking-[0.15em] text-emerald-600 leading-none">Daemon Logic & Chatbot</h4>
                        <p className="text-[9px] font-bold neu-text-muted uppercase tracking-tighter opacity-60 mt-1">Automated Intelligence Status</p>
                      </div>
                   </div>

                   <label className="flex items-center justify-between p-6 neu-pressed rounded-2xl cursor-pointer hover:bg-black/5 transition-all">
                    <div className="flex flex-col pr-8">
                      <span className="text-[11px] font-black uppercase tracking-widest text-emerald-600">Global Auto-Share Reports</span>
                      <p className="text-[10px] neu-text-muted font-bold block mt-1 uppercase tracking-tighter opacity-60">Broadcast generated reports instantly to all active customers via WhatsApp API</p>
                    </div>
                    <div className="relative inline-block w-14 h-7 shrink-0">
                      <input 
                        type="checkbox" 
                        className="sr-only peer" 
                        checked={settings.automation?.autoShareReports || false} 
                        onChange={(e) => setSettings({ ...settings, automation: { ...settings.automation, autoShareReports: e.target.checked } as any })} 
                      />
                      <div className="w-full h-full rounded-full bg-[var(--shadow-dark)] peer-checked:bg-emerald-600 transition-colors duration-300 shadow-inner" />
                      <div className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-300 ${settings.automation?.autoShareReports ? 'translate-x-7' : 'translate-x-0'}`} />
                    </div>
                  </label>

                  <div className="grid gap-4">
                     <p className="text-[10px] font-black uppercase tracking-[0.2em] neu-text-muted ml-1">Loaded Bot Commands</p>
                     <div className="flex flex-wrap gap-2">
                        {botSettings?.commands?.filter(c => c.isActive).map((cmd) => (
                          <div key={cmd.id} className="group px-4 py-3 neu-pressed rounded-xl flex items-center gap-3 hover:bg-emerald-500/5 transition-all">
                             <div className="px-2 py-1 bg-emerald-500/10 text-emerald-600 text-[10px] font-black rounded-lg group-hover:bg-emerald-600 group-hover:text-white transition-colors">
                               /{cmd.triggerWord}
                             </div>
                             <span className="text-[9px] font-bold neu-text-muted uppercase tracking-tighter truncate max-w-[150px]">
                               {cmd.response}
                             </span>
                          </div>
                        ))}
                        {(!botSettings || !botSettings.commands || botSettings.commands.filter(c => c.isActive).length === 0) && (
                          <div className="w-full py-8 neu-pressed rounded-3xl border-2 border-dashed border-black/5 flex items-center justify-center text-[10px] font-bold neu-text-muted uppercase tracking-widest opacity-40">
                             No Passive Chatbot Commands Active
                          </div>
                        )}
                     </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {activeTab === 'billing' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-none border-t border-white/5 overflow-hidden">
            <CardHeader className="flex flex-row items-center gap-4 pb-4 border-b border-[var(--shadow-dark)]">
              <div className="p-3 neu-pressed rounded-2xl text-blue-600">
                <Cpu className="w-6 h-6" />
              </div>
              <div>
                <CardTitle className="text-sm font-black uppercase tracking-widest">Automation Engines</CardTitle>
                <p className="text-[10px] neu-text-muted font-bold uppercase tracking-tighter opacity-70">Daemon Logic Control Center</p>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-8">
              <div className="p-6 neu-pressed rounded-3xl bg-amber-500/5 border-l-4 border-amber-500 group relative overflow-hidden">
                  <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none group-hover:scale-110 transition-transform">
                    <Zap className="w-24 h-24 text-amber-600" />
                  </div>
                  <div className="flex items-center gap-2 text-amber-800 font-black text-[10px] uppercase tracking-[.2em] mb-3">
                    <AlertCircle className="w-4 h-4" /> Forced Synchronization
                  </div>
                  <p className="text-xs text-amber-700/90 font-bold leading-relaxed mb-6 z-10 relative">
                    Bypassing scheduled cron jobs will force immediate execution of billing logic. This triggers global balance updates and notification bursts to all active customers.
                  </p>
                  <motion.button
                    whileHover={{ scale: 1.01 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={handleTriggerAutomation}
                    disabled={isTriggerLoading}
                    className="w-full py-5 neu-flat bg-amber-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-amber-500/30 flex items-center justify-center gap-3 disabled:opacity-40 z-10 relative"
                  >
                    {isTriggerLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-5 h-5" />}
                    {isTriggerLoading ? "Processing Core Logic..." : "Ignite Global Billing Pulse"}
                  </motion.button>
               </div>

              <div className="grid gap-3">
                {[
                  { key: 'billingLifecycle', label: 'Billing Lifecycle', desc: 'End-to-end invoice & overdue management', detailedDesc: 'Automatically generates bills based on meter readings and tracks their lifecycle from pending to paid or overdue.' },
                  { key: 'ruleBased', label: 'Rule Enforcement', desc: 'Strict business logic application', detailedDesc: 'Ensures bills strictly follow predefined rules. If turned off, you can override logic manually without warnings.' },
                  { key: 'lateFee', label: 'Auto Penalties', desc: 'Late fee injection on grace expiry', detailedDesc: 'Automatically applies configured penalty amount when a bill passes its grace period.' },
                  { key: 'scheduledBilling', label: 'Cycle Registry', desc: 'Periodic bill generation synchronizer', detailedDesc: 'Ensures billing tasks run predictably on schedule rather than missing windows.' },
                  { key: 'bulkProcessing', label: 'Queue Manager', desc: 'Mass notification & PDF generation', detailedDesc: 'Safely queues large numbers of PDF generations and messages to prevent rate-limit bans.' },
                  { key: 'smartNotifications', label: 'Smart Dispatch', desc: 'Multi-day intelligent follow-up system', detailedDesc: 'Automatically sends reminders to customers before due date and on expiry, avoiding spamming.' },
                  { key: 'autoShareReports', label: 'Report Broadcast', desc: 'Auto-send reports via WhatsApp', detailedDesc: 'Automatically broadcasts monthly summary reports to your configured notifications team/admin group via WhatsApp.' },
                  { key: 'autoCreateComplaints', label: 'NLP Ticket Ingestion', desc: 'Auto-log tickets from customer replies', detailedDesc: 'Uses AI to analyze WhatsApp replies from customers and auto-creates a complaint ticket if they report an issue.' },
                  { key: 'enforceIstTimeWindow', label: 'IST Time Window', desc: 'Restricts bursts to 9AM-8PM IST', detailedDesc: 'Ensures automated notifications are only sent out between 9 AM and 8 PM IST so customers are not disturbed at odd hours.' }
                ].map(item => (
                  <label key={item.key} className="group relative flex items-center justify-between p-5 neu-pressed rounded-2xl hover:bg-black/5 transition-all cursor-pointer">
                    <div className="flex flex-col gap-1 pr-6 relative">
                      <span className="relative text-[11px] font-black uppercase tracking-widest flex items-center gap-2 group/tooltip">
                         {item.label}
                         <Info className="w-3.5 h-3.5 text-blue-500 opacity-20 group-hover:opacity-100 transition-opacity" />
                         
                         <div className="absolute left-6 bottom-full mb-1 hidden w-64 p-3 bg-slate-800 text-white text-[11px] leading-relaxed normal-case tracking-normal font-medium rounded-xl shadow-xl z-[100] group-hover/tooltip:block pointer-events-none border border-slate-700">
                            {item.detailedDesc}
                            <div className="absolute left-4 top-full -mt-2 w-3 h-3 bg-slate-800 border-b border-r border-slate-700 rotate-45"></div>
                         </div>
                      </span>
                      <p className="text-[9px] neu-text-muted font-bold opacity-60 uppercase tracking-tighter">
                        {item.desc}
                      </p>
                    </div>
                    <div className="relative inline-block w-14 h-7 shrink-0">
                       <input
                        type="checkbox"
                        checked={settings.automation?.[item.key as keyof typeof settings.automation] ?? true}
                        onChange={(e) => setSettings({ ...settings, automation: { ...settings.automation, [item.key]: e.target.checked } as any })}
                        className="sr-only peer"
                      />
                      <div className="w-full h-full rounded-full bg-[var(--shadow-dark)] peer-checked:bg-blue-600 transition-colors duration-300 shadow-inner" />
                      <div className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-300 ${settings.automation?.[item.key as keyof typeof settings.automation] ?? true ? 'translate-x-7' : 'translate-x-0'}`} />
                    </div>
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-none border-t border-white/5 overflow-hidden">
            <CardHeader className="flex flex-row items-center gap-4 pb-4 border-b border-[var(--shadow-dark)]">
              <div className="p-3 neu-pressed rounded-2xl text-emerald-600">
                <DollarSign className="w-6 h-6" />
              </div>
              <div>
                <CardTitle className="text-sm font-black uppercase tracking-widest">Financial Registry</CardTitle>
                <p className="text-[10px] neu-text-muted font-bold uppercase tracking-tighter opacity-70">Accounting Preference Parameters</p>
              </div>
            </CardHeader>
            <CardContent className="pt-8 space-y-10">
              <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] neu-text-muted ml-1">Base Invoice Amount (INR)</label>
                  <input
                    type="number"
                    value={settings.billingAmount}
                    onChange={(e) => setSettings({ ...settings, billingAmount: Number(e.target.value) })}
                    className="w-full px-5 py-4 neu-pressed rounded-2xl bg-transparent outline-none text-base font-black text-emerald-600 focus:ring-2 focus:ring-emerald-500/30 transition-all shadow-inner"
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] neu-text-muted ml-1">Cycle Duration (Months)</label>
                  <input
                    type="number"
                    value={settings.billingCycleMonths}
                    onChange={(e) => setSettings({ ...settings, billingCycleMonths: Number(e.target.value) })}
                    className="w-full px-5 py-4 neu-pressed rounded-2xl bg-transparent outline-none text-base font-black focus:ring-2 focus:ring-blue-500/30 transition-all shadow-inner"
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] neu-text-muted ml-1 text-rose-600">Late Surcharge (INR)</label>
                  <input
                    type="number"
                    value={settings.penaltyAmount}
                    onChange={(e) => setSettings({ ...settings, penaltyAmount: Number(e.target.value) })}
                    className="w-full px-5 py-4 neu-pressed rounded-2xl bg-transparent outline-none text-base font-black text-rose-600 border border-rose-500/10 focus:ring-2 focus:ring-rose-500/30 transition-all shadow-inner"
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] neu-text-muted ml-1">Grace Threshold (Days)</label>
                  <input
                    type="number"
                    value={settings.penaltyDays}
                    onChange={(e) => setSettings({ ...settings, penaltyDays: Number(e.target.value) })}
                    className="w-full px-5 py-4 neu-pressed rounded-2xl bg-transparent outline-none text-base font-black focus:ring-2 focus:ring-amber-500/30 transition-all shadow-inner"
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] neu-text-muted ml-1">Anchor Billing Day (1-28)</label>
                  <input
                    type="number"
                    min="1"
                    max="28"
                    value={settings.defaultBillingDate || '1'}
                    onChange={(e) => setSettings({ ...settings, defaultBillingDate: e.target.value })}
                    className="w-full px-5 py-4 neu-pressed rounded-2xl bg-transparent outline-none text-base font-black focus:ring-2 focus:ring-purple-500/30 transition-all shadow-inner"
                  />
                </div>

                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] neu-text-muted ml-1 text-rose-600">Escalation Limit (Days)</label>
                  <input
                    type="number"
                    value={settings.escalationDays || 60}
                    onChange={(e) => setSettings({ ...settings, escalationDays: Number(e.target.value) })}
                    className="w-full px-5 py-4 neu-pressed rounded-2xl bg-transparent outline-none text-base font-black text-rose-600 border border-rose-500/20 focus:ring-2 focus:ring-rose-500/30 transition-all shadow-inner"
                  />
                </div>
              </div>

              <div className="pt-10 border-t border-[var(--shadow-dark)]">
                <label className="flex items-center justify-between p-6 neu-pressed rounded-3xl cursor-pointer hover:bg-rose-500/5 transition-all">
                  <div className="flex flex-col gap-1">
                    <span className="text-[12px] font-black uppercase tracking-[0.2em] text-rose-600">Protocol: Account Suspension</span>
                    <p className="text-[10px] neu-text-muted font-bold uppercase tracking-tighter opacity-60">Automatically freeze customer access past critical escalation threshold</p>
                  </div>
                  <div className="relative inline-block w-14 h-7 shrink-0">
                    <input
                      type="checkbox"
                      checked={settings.autoSuspend || false}
                      onChange={(e) => setSettings({ ...settings, autoSuspend: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className="w-full h-full rounded-full bg-[var(--shadow-dark)] peer-checked:bg-rose-600 transition-colors duration-300 shadow-inner" />
                    <div className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-300 ${settings.autoSuspend ? 'translate-x-7' : 'translate-x-0'}`} />
                  </div>
                </label>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {activeTab === 'gateway' && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
          <Card className="border-none border-t border-white/5 overflow-hidden">
            <CardHeader className="flex flex-row items-center gap-4 pb-4 border-b border-[var(--shadow-dark)]">
              <div className="p-3 neu-pressed rounded-2xl text-indigo-600">
                <CreditCard className="w-6 h-6" />
              </div>
              <div>
                <CardTitle className="text-sm font-black uppercase tracking-widest">Enterprise Payment Mesh</CardTitle>
                <p className="text-[10px] neu-text-muted font-bold uppercase tracking-tighter opacity-70">Unified Transaction Gateway</p>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-10">
              <div className="p-5 neu-pressed rounded-2xl bg-indigo-500/5 border-l-4 border-indigo-500">
                 <p className="text-[10px] text-indigo-600 font-black uppercase tracking-widest mb-2">Protocol Coverage:</p>
                 <p className="text-xs text-indigo-800/80 font-bold leading-relaxed">
                   Connect Bank APIs (Stripe, Razorpay, Cashfree) to automatically synchronize customer balances via secure Webhook handshakes. 
                 </p>
              </div>

              <div className="grid gap-8 md:grid-cols-2">
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] neu-text-muted ml-1">
                    Gateway Credential ID
                  </label>
                  <input
                    type="password"
                    value={settings.paymentGatewayKey || ''}
                    onChange={(e) => setSettings({ ...settings, paymentGatewayKey: e.target.value })}
                    className="w-full px-5 py-4 neu-pressed rounded-2xl bg-transparent outline-none text-sm font-bold focus:ring-2 focus:ring-indigo-500/30 transition-all shadow-inner"
                    placeholder="rzp_live_xxxxxxxxxx"
                  />
                  <p className="text-[9px] neu-text-muted font-bold ml-1 uppercase tracking-tighter opacity-60">Identity token for generating encrypted payment links</p>
                </div>
                <div className="space-y-3">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] neu-text-muted ml-1">
                    Signature Verification Secret
                  </label>
                  <input
                    type="password"
                    value={settings.paymentGatewaySecret || ''}
                    onChange={(e) => setSettings({ ...settings, paymentGatewaySecret: e.target.value })}
                    className="w-full px-5 py-4 neu-pressed rounded-2xl bg-transparent outline-none text-sm font-bold focus:ring-2 focus:ring-indigo-500/30 transition-all shadow-inner"
                    placeholder="••••••••••••••••"
                  />
                  <p className="text-[9px] neu-text-muted font-bold ml-1 uppercase tracking-tighter opacity-60">Used to validate authenticity of inbound payment success packets</p>
                </div>

                <div className="col-span-full space-y-6 pt-10 border-t border-[var(--shadow-dark)]">
                   <div className="flex items-center gap-3">
                      <Globe className="w-5 h-5 text-indigo-600" />
                      <div>
                        <h4 className="text-[11px] font-black uppercase tracking-[0.15em] text-indigo-600 leading-none">Callback Orchestration</h4>
                        <p className="text-[9px] font-bold neu-text-muted uppercase tracking-tighter opacity-60 mt-1">Inbound Payment Event Listener</p>
                      </div>
                   </div>
                   
                   <div className="space-y-3">
                      <label className="text-[9px] font-black uppercase tracking-wider neu-text-muted ml-1">Universal Webhook Endpoint</label>
                      <div className="group relative">
                        <code className="block w-full px-5 py-4 neu-pressed rounded-2xl bg-transparent text-[11px] font-bold text-indigo-700/80 break-all select-all shadow-inner">
                          {window.location.origin}/api/payment-webhook/{auth.currentUser?.uid || 'user_id'}
                        </code>
                        <button className="absolute right-4 top-1/2 -translate-y-1/2 text-indigo-600 opacity-0 group-hover:opacity-100 transition-opacity">
                           <Copy className="w-4 h-4" />
                        </button>
                      </div>
                      <p className="text-[9px] neu-text-muted font-bold ml-1 uppercase tracking-tighter opacity-60">Instruct your provider to POST transaction events to this URI</p>
                   </div>

                   <div className="p-5 neu-pressed rounded-2xl bg-slate-900 text-slate-300">
                      <div className="flex items-center justify-between mb-4">
                         <div className="flex items-center gap-2">
                           <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                           <span className="text-[10px] font-black uppercase tracking-widest">Automatic Fallback Engine</span>
                         </div>
                         <div className="px-2 py-0.5 bg-white/10 rounded text-[8px] font-bold uppercase">Active</div>
                      </div>
                      <p className="text-[10px] font-medium leading-relaxed opacity-80">
                        If Gateway configuration is incomplete, the system natively clusters all incoming payments into "Manual Approval" queue via the Customer Portals. Zero configuration required for offline cash/UPI collection.
                      </p>
                   </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {activeTab === 'security' && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-8">
          <Card className="border-none border-t border-white/5 overflow-hidden">
            <CardHeader className="flex flex-row items-center gap-4 pb-4 border-b border-[var(--shadow-dark)]">
              <div className="p-3 neu-pressed rounded-2xl text-rose-600">
                <Shield className="w-6 h-6" />
              </div>
              <div>
                <CardTitle className="text-sm font-black uppercase tracking-widest">Fortress & Integrity</CardTitle>
                <p className="text-[10px] neu-text-muted font-bold uppercase tracking-tighter opacity-70">Access Control & Audit Vault</p>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-12">
              <div className="space-y-6">
                <div className="flex items-center gap-3">
                   <AlertCircle className="w-5 h-5 text-rose-600" />
                   <h4 className="text-[11px] font-black uppercase tracking-[0.15em] text-rose-600 leading-none">Danger Zone</h4>
                </div>

                <div className="p-6 neu-pressed rounded-3xl flex flex-col items-start gap-4 bg-rose-500/5 border-l-4 border-rose-500 transition-all group overflow-hidden relative">
                  <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none">
                    <Trash2 className="w-32 h-32" />
                  </div>
                  
                  <div className="flex flex-col gap-1 z-10">
                    <p className="text-sm font-black uppercase tracking-widest text-rose-600">Nuclear Workspace Reset</p>
                    <p className="text-[10px] neu-text-muted font-bold uppercase tracking-tighter opacity-70">Irreversible erasure of all system data assets</p>
                  </div>

                  <div className="w-full mt-2 p-5 rounded-2xl bg-black/5 text-[10px] font-black font-mono flex flex-col gap-2 border border-black/5 uppercase tracking-widest text-slate-500">
                    <div className="flex justify-between items-center bg-black/5 p-2 rounded-lg">
                      <span>Authority Mapping ID</span>
                      <span className="text-rose-600 select-all">{auth.currentUser?.uid?.substring(0, 12)}...</span>
                    </div>
                    <div className="flex justify-between items-center bg-black/5 p-2 rounded-lg">
                      <span>Infrastructure Node</span>
                      <span>{window.location.host}</span>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row flex-wrap gap-4 mt-2 w-full z-10">
                    <motion.button 
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleResetDatabase}
                      disabled={isResetting}
                      className="px-8 py-4 bg-rose-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.2em] shadow-xl shadow-rose-500/30 disabled:opacity-70 flex items-center justify-center gap-3 w-full sm:w-auto transition-all"
                    >
                      {isResetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                      {isResetting ? "PURGING..." : "INITIATE WIPE"}
                    </motion.button>
                  </div>
                  <p className="text-[9px] font-bold neu-text-muted uppercase tracking-widest italic opacity-50 mt-2">
                    Confirmation required. This protocol will wipe all customers, invoices, and audit logs.
                  </p>
                </div>
              </div>

              <div className="space-y-6 pt-10 border-t border-[var(--shadow-dark)]">
                <div className="flex items-center gap-3">
                   <FileCode className="w-5 h-5 text-indigo-600" />
                   <div>
                    <h4 className="text-[11px] font-black uppercase tracking-[0.15em] text-indigo-600 leading-none">Diagnostic Inspection</h4>
                    <p className="text-[9px] font-bold neu-text-muted uppercase tracking-tighter opacity-60 mt-1">System Operation Logs</p>
                   </div>
                </div>

                <div className="grid gap-6 md:grid-cols-2">
                  <div className="p-6 neu-pressed rounded-3xl flex flex-col gap-5 bg-indigo-500/5 group border-2 border-transparent hover:border-indigo-500/20 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 neu-flat rounded-2xl flex items-center justify-center text-indigo-600">
                        <FileCode className="w-6 h-6" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[11px] font-black uppercase tracking-widest text-[#1e1e2d]">Real-time Event Stream</span>
                        <span className="text-[9px] neu-text-muted font-bold uppercase opacity-60">System runtime telemetry heartbeat</span>
                      </div>
                    </div>
                    <motion.button 
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => { setLogsList(getLogs()); setLogsPage(1); setShowLogsModal(true); }}
                      className="w-full py-4 bg-indigo-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[.2em] shadow-lg shadow-indigo-500/30 transition-all flex items-center justify-center gap-2"
                    >
                      EXPLORE APP LOGS
                    </motion.button>
                  </div>

                  <div className="p-6 neu-pressed rounded-3xl flex flex-col gap-5 bg-amber-500/5 group border-l-4 border-amber-500/20 grayscale hover:grayscale-0 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 neu-flat rounded-2xl flex items-center justify-center text-amber-600">
                        <User className="w-6 h-6" />
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[11px] font-black uppercase tracking-widest text-[#1e1e2d]">Identity Provisioning</span>
                        <span className="text-[9px] neu-text-muted font-bold uppercase opacity-60">Multi-Factor Authority Mapping</span>
                      </div>
                    </div>
                    <button className="w-full py-4 text-amber-600/40 rounded-2xl text-[10px] font-black uppercase tracking-widest border-2 border-dashed border-amber-500/10 cursor-not-allowed">
                       MODULAR MFA (PENDING)
                    </button>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {isAdmin && (
        <motion.div id="providers-admin" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="mt-12">
          <Card className="border-none border-t border-white/5 overflow-hidden">
            <CardHeader className="flex flex-row items-center gap-4 pb-4 border-b border-[var(--shadow-dark)]">
              <div className="p-3 neu-pressed rounded-2xl text-amber-600">
                <Database className="w-6 h-6" />
              </div>
              <div>
                <CardTitle className="text-sm font-black uppercase tracking-widest">Infrastructure Panel</CardTitle>
                <p className="text-[10px] neu-text-muted font-bold uppercase tracking-tighter opacity-70">Global Provider Administration</p>
              </div>
            </CardHeader>
            <CardContent className="pt-8 space-y-10">
               <div className="grid gap-4">
                  <p className="text-[10px] font-black uppercase tracking-[.2em] neu-text-muted ml-1">Federated Bridges</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {providers.map(provider => (
                       <div key={provider.id} className="p-5 neu-pressed rounded-2xl flex items-center justify-between group hover:bg-black/5 transition-all">
                          <div className="flex flex-col gap-1">
                             <p className="text-[11px] font-black uppercase tracking-widest">{provider.name}</p>
                             <p className="text-[9px] neu-text-muted font-bold uppercase tracking-tighter truncate max-w-[200px]">{provider.baseUrl}</p>
                          </div>
                          <button 
                             onClick={async () => {
                               if(window.confirm("Nuclear Command: Delete provider?")) {
                                 try {
                                    await deleteProvider(provider.id);
                                    setProviders(providers.filter(p => p.id !== provider.id));
                                 } catch(e) { console.error(e); }
                               }
                             }}
                             className="p-3 neu-flat-sm text-rose-600 rounded-xl hover:bg-rose-500 hover:text-white transition-all opacity-0 group-hover:opacity-100"
                          >
                             <Trash2 className="w-4 h-4"/>
                          </button>
                       </div>
                    ))}
                  </div>
               </div>

               <div className="space-y-6 pt-10 border-t border-[var(--shadow-dark)]">
                 <div className="flex items-center gap-3">
                   <Plus className="w-5 h-5 text-amber-600" />
                   <h4 className="text-[11px] font-black uppercase tracking-[0.15em] text-amber-600">Register New Bridge</h4>
                 </div>
                 
                 <div className="grid gap-6 md:grid-cols-2">
                    <div className="space-y-3">
                      <label className="text-[9px] font-black uppercase tracking-widest neu-text-muted ml-1">Canonical ID</label>
                      <input 
                         type="text" 
                         placeholder="e.g. twilio_prod" 
                         value={newProvider.id || ''} 
                         onChange={e => setNewProvider({ ...newProvider, id: e.target.value })}
                         className="w-full px-5 py-4 neu-pressed rounded-2xl bg-transparent outline-none text-xs font-black uppercase tracking-widest shadow-inner"
                      />
                    </div>
                    <div className="space-y-3">
                      <label className="text-[9px] font-black uppercase tracking-widest neu-text-muted ml-1">Display Label</label>
                      <input 
                         type="text" 
                         placeholder="e.g. Twilio Enterprise" 
                         value={newProvider.name || ''} 
                         onChange={e => setNewProvider({ ...newProvider, name: e.target.value })}
                         className="w-full px-5 py-4 neu-pressed rounded-2xl bg-transparent outline-none text-xs font-black uppercase tracking-widest shadow-inner"
                      />
                    </div>
                    <div className="col-span-full space-y-3">
                      <label className="text-[9px] font-black uppercase tracking-widest neu-text-muted ml-1">Remote Endpoint (Base URL)</label>
                      <input 
                         type="text" 
                         placeholder="https://api.external-provider.com/v1" 
                         value={newProvider.baseUrl || ''} 
                         onChange={e => setNewProvider({ ...newProvider, baseUrl: e.target.value })}
                         className="w-full px-5 py-4 neu-pressed rounded-2xl bg-transparent outline-none text-xs font-bold shadow-inner"
                      />
                    </div>
                    <motion.button
                       whileHover={{ scale: 1.01 }}
                       whileTap={{ scale: 0.99 }}
                       onClick={async () => {
                         if (!newProvider.id || !newProvider.name || !newProvider.baseUrl) {
                           showAlert("Validation Error", "All infrastructure fields are required.");
                           return;
                         }
                         try {
                           await addProvider(newProvider as WhatsAppProvider);
                           setProviders([...providers, newProvider as WhatsAppProvider]);
                           setNewProvider({ id: '', name: '', baseUrl: '', requiresApiKey: true, requiresPhoneId: false, isActive: true });
                           showAlert("Registry Updated", "New provider bridge successfully integrated.");
                         } catch (e: any) {
                           showAlert("Command Failed", e.message);
                         }
                       }}
                       className="col-span-full py-5 bg-amber-600 text-white rounded-2xl text-[10px] font-black uppercase tracking-[0.25em] shadow-xl shadow-amber-500/30 flex items-center justify-center gap-3 transition-all mt-4"
                    >
                       COMMIT PROVIDER TO REGISTRY
                    </motion.button>
                 </div>
               </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Global Status Footer */}
      <motion.div 
        whileHover={{ scale: 1.002 }}
        className="p-8 neu-pressed rounded-[2.5rem] flex flex-col lg:flex-row items-center justify-between gap-8 mt-12 bg-black/[0.02]"
      >
        <div className="flex items-center gap-6">
          <div className="w-16 h-16 neu-flat rounded-[1.5rem] flex items-center justify-center text-emerald-600 shadow-xl shadow-emerald-500/10">
            <Globe className="w-9 h-9" />
          </div>
          <div>
            <p className="text-xl font-black uppercase tracking-widest text-[#1e1e2d]">Global Grid Status</p>
            <div className="flex items-center gap-2 mt-1">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <p className="text-[10px] font-black uppercase tracking-widest neu-text-muted opacity-60">All node systems operational • v2.4.0 (Stable)</p>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-4 justify-center sm:justify-end">
          <div className="flex items-center gap-3 px-6 py-3 neu-pressed rounded-2xl bg-blue-500/[0.03]">
            <div className="p-1.5 bg-blue-500/10 rounded-lg text-blue-600 group">
              <Database className="w-3.5 h-3.5 group-hover:rotate-12 transition-transform" />
            </div>
            <div>
              <p className="text-[8px] font-black uppercase tracking-widest neu-text-muted opacity-50 leading-none mb-1">Last Billing Sweep</p>
              <p className="text-[11px] font-black text-blue-600 leading-none">
                {settings.lastBillingDate ? new Date(settings.lastBillingDate).toLocaleDateString() : 'INITIALIZING'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3 px-6 py-3 neu-pressed rounded-2xl bg-rose-500/[0.03]">
            <div className="p-1.5 bg-rose-500/10 rounded-lg text-rose-600 group">
              <AlertCircle className="w-3.5 h-3.5 group-hover:shake transition-transform" />
            </div>
            <div>
              <p className="text-[8px] font-black uppercase tracking-widest neu-text-muted opacity-50 leading-none mb-1">Debt Protocol Scan</p>
              <p className="text-[11px] font-black text-rose-600 leading-none">
                {settings.lastPenaltyDate ? new Date(settings.lastPenaltyDate).toLocaleDateString() : 'INITIALIZING'}
              </p>
            </div>
          </div>
        </div>
      </motion.div>

      <ConfirmModal
        isOpen={showResetConfirm}
        onClose={() => setShowResetConfirm(false)}
        onConfirm={performReset}
        title="Master Database Reset"
        message="CRITICAL WARNING: This will permanently delete ALL customers, transactions, and settings. You will be logged out and the app will be reset to a brand new state. This action cannot be undone."
        confirmText={isResetting ? "Resetting..." : "Yes, Reset Everything"}
        isDestructive={true}
      />

      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        onClose={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
        onConfirm={confirmConfig.onConfirm}
        title={confirmConfig.title}
        message={confirmConfig.message}
        showCancel={confirmConfig.showCancel}
      />

      {isManualModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="neu-bg p-6 rounded-2xl w-full max-w-sm shadow-2xl border border-[var(--shadow-dark)]"
          >
            <h3 className="text-xl font-bold mb-2">Manual Broadcast</h3>
            <div className="mb-4 text-center">
              <p className="text-sm neu-text-muted mb-4">
                Sending to customer {manualIndex + 1} of {manualCustomers.length}
              </p>
              <p className="font-bold text-lg text-emerald-600 mb-1">
                {manualCustomers[manualIndex]?.name}
              </p>
              <p className="text-xs neu-text-muted">
                {manualCustomers[manualIndex]?.mobileNumber}
              </p>
            </div>
            
            <div className="flex flex-col gap-3 mt-6">
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={sendManualCustomer}
                className="w-full py-3 bg-emerald-600 text-white rounded-xl font-bold shadow-lg shadow-emerald-500/30 flex items-center justify-center gap-2"
              >
                <MessageCircle className="w-5 h-5" /> Open in WhatsApp
              </motion.button>
              
              <button
                onClick={skipManualCustomer}
                className="w-full py-3 neu-flat text-[#1e1e2d] rounded-xl font-bold transition-all text-sm hover:opacity-80"
              >
                Skip Customer
              </button>
              
              <button
                onClick={() => {
                  setIsManualModalOpen(false);
                  showAlert("Aborted", "Manual broadcast cancelled.");
                }}
                className="w-full py-3 text-rose-500 rounded-xl font-bold transition-all text-sm mt-2"
              >
                Cancel Broadcast
              </button>
            </div>
          </motion.div>
        </div>
      )}
      
      {/* Logs Modal */}
      {showLogsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="neu-panel bg-[#f8f9fa] w-full max-w-4xl max-h-[90vh] flex flex-col rounded-3xl overflow-hidden shadow-2xl relative"
          >
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center p-6 border-b border-[#e1e3eb] bg-white text-[#1e1e2d] gap-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <FileCode className="w-5 h-5 text-indigo-500" /> Application Logs
              </h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                     const logsText = logsList.map(l => `[${new Date(l.timestamp).toISOString()}] ${l.level.toUpperCase()}: ${l.message}`).join('\n');
                     navigator.clipboard.writeText(logsText);
                     showAlert('Copied', 'Logs copied to clipboard.');
                  }}
                  className="p-2 bg-indigo-50 text-indigo-600 hover:bg-indigo-100 rounded-full transition-colors"
                  title="Copy Logs"
                >
                  <Copy className="w-5 h-5" />
                </button>
                <button
                  onClick={() => { clearLogs(); setLogsList([]); }}
                  className="p-2 bg-rose-50 text-rose-600 hover:bg-rose-100 rounded-full transition-colors"
                  title="Clear Logs"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
                <button
                  onClick={() => setShowLogsModal(false)}
                  className="p-2 hover:bg-slate-100 text-slate-500 rounded-full transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
            </div>
            
            <div className="flex-1 overflow-y-auto p-4 bg-slate-900 text-slate-300 font-mono text-xs">
              {logsList.length === 0 ? (
                 <div className="text-center p-8 opacity-50">No logs captured yet.</div>
              ) : (
                 <div className="flex flex-col gap-1">
                   {logsList.slice((logsPage - 1) * 50, logsPage * 50).map((log, i) => (
                     <div key={i} className={`py-1 border-b border-slate-800 ${log.level === 'error' ? 'text-rose-400' : log.level === 'warn' ? 'text-amber-400' : 'text-slate-300'}`}>
                       <span className="opacity-50 select-none">[{new Date(log.timestamp).toLocaleTimeString()}]</span> 
                       <span className="font-bold ml-2 w-12 inline-block select-none">{log.level.toUpperCase()}</span>
                       <span className="ml-2 break-all">{log.message}</span>
                     </div>
                   ))}
                 </div>
              )}
            </div>
            
            {logsList.length > 50 && (
              <div className="flex justify-between items-center p-4 border-t border-[#e1e3eb] bg-slate-100/50">
                <button
                  onClick={() => setLogsPage(p => Math.max(1, p - 1))}
                  disabled={logsPage === 1}
                  className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold shadow-sm disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-sm text-slate-500 font-medium tracking-tight">
                  Page {logsPage} of {Math.ceil(logsList.length / 50)}
                </span>
                <button
                  onClick={() => setLogsPage(p => Math.min(Math.ceil(logsList.length / 50), p + 1))}
                  disabled={logsPage === Math.ceil(logsList.length / 50)}
                  className="px-4 py-2 bg-white border border-slate-300 rounded-lg text-sm font-bold shadow-sm disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
