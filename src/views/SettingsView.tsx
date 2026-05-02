import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Settings, Bell, Shield, User, Globe, Palette, Database, HelpCircle, DollarSign, FileText, Save, AlertCircle, CreditCard, Plus, ArrowUp, ArrowDown } from "lucide-react";
import { motion } from "motion/react";
import { subscribeToSettings, saveSettings, AppSettings, resetDatabase, WhatsAppProvider, getProviders, addProvider, deleteProvider, ChatbotCommand } from "../lib/db";
import { useTranslation } from "react-i18next";
import { Trash2, LogOut, MessageCircle, Loader2 } from "lucide-react";
import { auth, logout } from "../firebase";
import { ConfirmModal } from "../components/ConfirmModal";
import { v4 as uuidv4 } from "uuid";

export function SettingsView() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'billing' | 'whatsapp' | 'security' | 'gateway' | 'broadcast'>('billing');
  const [settings, setSettings] = useState<AppSettings>({
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
  const [providers, setProviders] = useState<WhatsAppProvider[]>([]);
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
    const unsubSettings = subscribeToSettings((s) => {
      if (s) {
        setSettings(s);
        import("../services/whatsappService").then(({ whatsappService }) => {
          whatsappService.updateConfig(s.metaWhatsAppApiKey || null, s.metaWhatsAppPhoneNumberId || null, s.cunnektApiKey || null);
        });
      }
    });

    const loadProviders = async () => {
      try {
        const provs = await getProviders();
        setProviders(provs);
      } catch(e) {
        console.error("Failed to load providers", e);
      }
    };
    loadProviders();

    return () => {
      unsubSettings();
    };
  }, []);

  const handleTestWhatsApp = async () => {
    if (!testMobile) {
      showAlert("Missing Phone Number", "Please enter a mobile number to send the test message to.");
      return;
    }
    setIsTestLoading(true);
    try {
      const resp = await fetch('/api/whatsapp/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          ownerId: auth.currentUser?.uid, 
          testMobile, 
          apiKey: settings.metaWhatsAppApiKey, 
          phoneId: settings.metaWhatsAppPhoneNumberId,
          cunnektApiKey: settings.cunnektApiKey,
          cunnektBaseUrl: settings.cunnektBaseUrl,
          method: settings.preferredNotificationMethod
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

  const handleSave = async () => {
    setIsSaving(true);
    let updatedSettings = { ...settings };

    // WhatsApp Configuration Validation (Meta)
    if (updatedSettings.preferredNotificationMethod === 'api') {
      const apiKey = updatedSettings.metaWhatsAppApiKey?.trim() || '';
      const phoneId = updatedSettings.metaWhatsAppPhoneNumberId?.trim() || '';
      
      const isMissingKeys = !apiKey || !phoneId;
      const isInvalidTokenStructure = apiKey.length > 0 && apiKey.length < 50; 
      const isInvalidPhoneId = phoneId.length > 0 && !/^\d+$/.test(phoneId);

      if (isMissingKeys || isInvalidTokenStructure || isInvalidPhoneId) {
        setIsSaving(false);
        let errorReason = "Your Meta WhatsApp API Key or Phone Number ID is missing or invalid.";
        if (isInvalidTokenStructure) errorReason = "Meta Bearer tokens are typically long strings starting with 'EAA...'.";
        if (isInvalidPhoneId) errorReason = "Your Phone Number ID must contain ONLY numbers.";

        showAlert(
          "Meta Configuration Incomplete",
          `${errorReason} ` +
          "To ensure the app continues to function perfectly, the notification method has been safely fallen back to the failproof 'Public Portal Link (Manual)'."
        );
        updatedSettings.preferredNotificationMethod = 'manual_link';
      }
    }

    // WhatsApp Configuration Validation (Cunnekt)
    if (updatedSettings.preferredNotificationMethod === 'cunnekt') {
      const apiKey = updatedSettings.cunnektApiKey?.trim() || '';
      const baseUrl = updatedSettings.cunnektBaseUrl?.trim() || '';
      
      if (!apiKey || !baseUrl) {
        setIsSaving(false);
        showAlert(
          "Cunnekt Configuration Incomplete",
          "Your Cunnekt API Key or Base URL is missing. " +
          "To ensure functionality, the notification method has been safely fallen back to 'Public Portal Link (Manual)'."
        );
        updatedSettings.preferredNotificationMethod = 'manual_link';
      }
    }

    try {
      await saveSettings(updatedSettings);

      showAlert("Settings Saved", "Your configuration has been updated successfully.");
    } catch (error) {
      console.error("Error saving settings:", error);
      showAlert("Error", "Failed to save settings. Please try again.");
    } finally {
      setIsSaving(false);
    }
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
    
    if (!settings.metaWhatsAppApiKey && !settings.cunnektApiKey) {
      setConfirmConfig({
        isOpen: true,
        title: "API Not Configured",
        message: "You haven't configured any WhatsApp API (Meta or Cunnekt). Would you like to send messages manually via the WhatsApp App instead?",
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
      message: `Are you sure you want to send this message to ALL active customers using ${settings.preferredNotificationMethod === 'cunnekt' ? 'Cunnekt' : 'Meta API'}?`,
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

          const resp = await fetch('/api/whatsapp/broadcast', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
               ownerId: auth.currentUser?.uid, 
               message: broadcastMessage, 
               apiKey: settings.metaWhatsAppApiKey, 
               phoneId: settings.metaWhatsAppPhoneNumberId,
               cunnektApiKey: settings.cunnektApiKey,
               cunnektBaseUrl: settings.cunnektBaseUrl,
               mediaBase64,
               mediaName
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
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('Settings')}</h2>
          <p className="neu-text-muted">System Preferences & Configuration</p>
        </div>
        <motion.button 
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={handleSave}
          disabled={isSaving}
          className="flex items-center gap-2 px-6 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/30 disabled:opacity-70"
        >
          {isSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {isSaving ? "Saving..." : "Save All Changes"}
        </motion.button>
      </div>

      <div className="flex border-b border-[var(--shadow-dark)] mb-6 overflow-x-auto custom-scrollbar">
        <button
          onClick={() => setActiveTab('billing')}
          className={`px-6 py-3 font-bold text-sm transition-colors whitespace-nowrap ${
            activeTab === 'billing' 
              ? 'text-blue-600 border-b-2 border-blue-600' 
              : 'neu-text-muted hover:text-blue-600'
          }`}
        >
          <div className="flex items-center gap-2">
            <DollarSign className="w-4 h-4" /> Billing Cycles & Rules
          </div>
        </button>
        <button
          onClick={() => setActiveTab('whatsapp')}
          className={`px-6 py-3 font-bold text-sm transition-colors whitespace-nowrap ${
            activeTab === 'whatsapp' 
              ? 'text-emerald-600 border-b-2 border-emerald-600' 
              : 'neu-text-muted hover:text-emerald-600'
          }`}
        >
          <div className="flex items-center gap-2">
            <MessageCircle className="w-4 h-4" /> WhatsApp API
          </div>
        </button>
        <button
          onClick={() => setActiveTab('gateway')}
          className={`px-6 py-3 font-bold text-sm transition-colors whitespace-nowrap ${
            activeTab === 'gateway' 
              ? 'text-indigo-600 border-b-2 border-indigo-600' 
              : 'neu-text-muted hover:text-indigo-600'
          }`}
        >
          <div className="flex items-center gap-2">
            <CreditCard className="w-4 h-4" /> Payment Gateway
          </div>
        </button>
        <button
          onClick={() => setActiveTab('broadcast')}
          className={`px-6 py-3 font-bold text-sm transition-colors whitespace-nowrap ${
            activeTab === 'broadcast' 
              ? 'text-purple-600 border-b-2 border-purple-600' 
              : 'neu-text-muted hover:text-purple-600'
          }`}
        >
          <div className="flex items-center gap-2">
            <Globe className="w-4 h-4" /> Bulk Broadcast
          </div>
        </button>
        <button
          onClick={() => setActiveTab('security')}
          className={`px-6 py-3 font-bold text-sm transition-colors whitespace-nowrap ${
            activeTab === 'security' 
              ? 'text-rose-600 border-b-2 border-rose-600' 
              : 'neu-text-muted hover:text-rose-600'
          }`}
        >
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4" /> Security & Danger Zone
          </div>
        </button>
      </div>

      {activeTab === 'broadcast' && (
        <motion.div initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} className="space-y-6">
          <Card className="border-2 border-purple-500/20">
            <CardHeader className="flex flex-row items-center gap-3 pb-4 border-b border-[var(--shadow-dark)]">
              <div className="p-2 neu-pressed rounded-xl text-purple-600">
                <Globe className="w-6 h-6" />
              </div>
              <div>
                <CardTitle className="text-lg">Bulk WhatsApp Broadcast</CardTitle>
                <p className="text-sm neu-text-muted">Send a personalized or general announcement to all active customers at once.</p>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              <div className="p-4 bg-purple-50 rounded-xl border border-purple-200">
                 <p className="text-xs text-purple-800 font-bold mb-1">Requirements:</p>
                 <ul className="text-xs text-purple-700 list-disc ml-4 space-y-1">
                   <li>If using Meta API: It must be configured and messages outside the 24h window require an approved template.</li>
                   <li>Ensure you follow WhatsApp’s Anti-Spam policies to avoid number suspension.</li>
                 </ul>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-bold uppercase tracking-wider neu-text-muted ml-1">
                  Announcement Message
                </label>
                <textarea
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  rows={6}
                  className="w-full px-4 py-3 neu-pressed rounded-xl bg-transparent outline-none text-sm font-medium resize-none"
                  placeholder="Type your message here... (e.g. Due to maintenance, water supply will be restricted tomorrow for 2 hours.)"
                />
              </div>

              <div className="flex items-center gap-2">
                <label className="flex items-center gap-2 px-3 py-2 cursor-pointer bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 transition-colors text-sm font-bold">
                  <span className="font-bold">Attach File</span>
                  <input type="file" className="hidden" onChange={(e) => setBroadcastAttachment(e.target.files?.[0] || null)} />
                </label>
                <span className="text-xs text-gray-500">
                  {broadcastAttachment ? broadcastAttachment.name : "Supported via API Mode"}
                </span>
                {broadcastAttachment && (
                    <button onClick={() => setBroadcastAttachment(null)} className="text-red-500 hover:text-red-700 text-xs">Remove</button>
                )}
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={handleBroadcast}
                disabled={isBroadcasting || !settings.metaWhatsAppApiKey || !settings?.automation?.bulkProcessing}
                className="w-full py-4 bg-purple-600 text-white rounded-2xl font-bold shadow-lg shadow-purple-500/30 flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {isBroadcasting ? <Loader2 className="w-5 h-5 animate-spin" /> : <MessageCircle className="w-5 h-5" />}
                {isBroadcasting ? "Broadcasting..." : "Send to All Active Customers"}
              </motion.button>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {activeTab === 'whatsapp' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-2 border-emerald-500/20 mb-6">
            <CardHeader className="flex flex-row items-center gap-3 pb-4 border-b border-[var(--shadow-dark)]">
              <div className="p-2 neu-pressed rounded-xl text-emerald-600">
                <MessageCircle className="w-6 h-6" />
              </div>
              <div>
                <CardTitle className="text-lg">Automated WhatsApp Messaging</CardTitle>
                <p className="text-sm neu-text-muted">Setup WhatsApp via Meta Developer portal or Cunnekt to seamlessly send automated bills to customers.</p>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="md:col-span-2 p-4 bg-emerald-50 rounded-xl border border-emerald-200 mb-2">
                  <p className="text-sm font-bold text-emerald-800">Choose Provider:</p>
                  <div className="flex flex-wrap gap-4 mt-2">
                    <button 
                      onClick={() => setSettings({...settings, preferredNotificationMethod: 'api'})}
                      className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${settings.preferredNotificationMethod === 'api' ? 'bg-emerald-600 text-white shadow-md' : 'bg-white text-emerald-600'}`}
                    >
                      Meta Official API
                    </button>
                    {providers.map(provider => (
                      <button 
                        key={provider.id}
                        onClick={() => {
                           setSettings({
                               ...settings, 
                               preferredNotificationMethod: provider.id,
                               cunnektBaseUrl: provider.baseUrl
                           });
                        }}
                        className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${settings.preferredNotificationMethod === provider.id ? 'bg-emerald-600 text-white shadow-md' : 'bg-white text-emerald-600'}`}
                      >
                        {provider.name}
                      </button>
                    ))}
                  </div>
                </div>

                {settings.preferredNotificationMethod === 'api' ? (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-bold uppercase tracking-wider neu-text-muted ml-1">Meta Access Token</label>
                      <input
                        type="password"
                        value={settings.metaWhatsAppApiKey || ''}
                        onChange={(e) => setSettings({ ...settings, metaWhatsAppApiKey: e.target.value })}
                        className="w-full px-4 py-3 neu-pressed rounded-xl bg-transparent outline-none text-sm font-medium"
                        placeholder="••••••••••••••"
                      />
                      <p className="text-xs neu-text-muted ml-1 mt-1">From Meta App Dashboard &gt; WhatsApp &gt; API Setup.</p>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold uppercase tracking-wider neu-text-muted ml-1">
                        Phone Number ID
                      </label>
                      <input
                        type="text"
                        value={settings.metaWhatsAppPhoneNumberId || ''}
                        onChange={(e) => setSettings({ ...settings, metaWhatsAppPhoneNumberId: e.target.value })}
                        className="w-full px-4 py-3 neu-pressed rounded-xl bg-transparent outline-none text-sm font-medium"
                        placeholder="101xxxxxxxxxxxx"
                      />
                      <p className="text-xs neu-text-muted ml-1 mt-1">Found in your Meta App Dashboard &gt; WhatsApp &gt; API Setup &gt; Phone number ID.</p>
                    </div>
                  </>
                ) : settings.preferredNotificationMethod ? (
                  <>
                    <div className="space-y-2">
                      <label className="text-sm font-bold uppercase tracking-wider neu-text-muted ml-1">Provide API Key</label>
                      <input
                        type="password"
                        value={settings.cunnektApiKey || ''}
                        onChange={(e) => setSettings({ ...settings, cunnektApiKey: e.target.value })}
                        className="w-full px-4 py-3 neu-pressed rounded-xl bg-transparent outline-none text-sm font-medium"
                        placeholder="••••••••••••••"
                      />
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-bold uppercase tracking-wider neu-text-muted ml-1">
                        Provider Base URL
                      </label>
                      <input
                        type="text"
                        value={settings.cunnektBaseUrl || ''}
                        onChange={(e) => setSettings({ ...settings, cunnektBaseUrl: e.target.value })}
                        disabled
                        className="w-full px-4 py-3 neu-pressed rounded-xl bg-transparent outline-none text-sm font-medium opacity-70"
                        placeholder="Configured by Provider"
                      />
                    </div>
                  </>
                ) : null}
                
                <div className="space-y-4 md:col-span-2 pt-6 mt-2 border-t border-[var(--shadow-dark)]">
                  <h4 className="font-bold text-md text-emerald-600">Test Your API Connection</h4>
                  <div className="flex flex-col sm:flex-row gap-3">
                    <input
                      type="text"
                      value={testMobile}
                      onChange={(e) => setTestMobile(e.target.value)}
                      className="flex-1 px-4 py-3 neu-pressed rounded-xl bg-transparent outline-none text-sm font-medium"
                      placeholder="Your mobile number (with country code, e.g. 919000000000)"
                    />
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={handleTestWhatsApp}
                      disabled={isTestLoading || (!settings.metaWhatsAppApiKey && !settings.cunnektApiKey)}
                      className="px-6 py-3 bg-emerald-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-emerald-500/30 disabled:opacity-50 whitespace-nowrap"
                    >
                      {isTestLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send Test Message"}
                    </motion.button>
                  </div>
                  <p className="text-xs neu-text-muted italic">
                    Click this after saving your API credentials to confirm everything is working correctly. 
                    <br/><br/>
                    <strong className="text-amber-600">Important (Meta API):</strong> If using Meta's Cloud API, you MUST send a message ("hi") from your personal WhatsApp to your Business number first! Free-form messages are silently rejected by Meta if the recipient hasn't initiated a conversation in the last 24 hours.
                  </p>
                </div>
                
                <div className="space-y-4 md:col-span-2 pt-4 mt-2 border-t border-[var(--shadow-dark)]">
                  <h4 className="font-bold text-md text-emerald-600">Receive Customer Messages (Webhook)</h4>
                  <p className="text-sm neu-text-muted">Allow customers to send messages to your WhatsApp. Complaints will be logged automatically if they include the word "complaint".</p>
                  
                  <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 mb-4">
                    <div className="flex items-start gap-3">
                      <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-sm font-bold text-amber-800">Critical Requirement: Firebase Admin SDK</p>
                        <p className="text-xs text-amber-700 mt-1">
                          If you deployed this app on Render (or another hosting platform), incoming webhooks <strong>will fail</strong> unless you set the <code>FIREBASE_SERVICE_ACCOUNT</code> environment variable on your server! Go to the "App Manual" tab for instructions on generating this key.
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <label className="text-sm font-bold uppercase tracking-wider neu-text-muted ml-1">
                      Webhook Verify Token
                    </label>
                    <input
                      type="password"
                      value={settings.metaWhatsAppVerifyToken || ''}
                      onChange={(e) => setSettings({ ...settings, metaWhatsAppVerifyToken: e.target.value })}
                      className="w-full px-4 py-3 neu-pressed rounded-xl bg-transparent outline-none text-sm font-medium"
                      placeholder="••••••••••••"
                    />
                    <p className="text-xs neu-text-muted ml-1 mt-1">Create a custom strong token here, and paste the exact same token into the Meta App Dashboard &gt; WhatsApp &gt; Configuration &gt; Edit Webhook.</p>
                  </div>
                  
                  <div className="p-4 bg-emerald-50 rounded-xl space-y-2">
                    <label className="text-sm font-bold text-emerald-800">Your Webhook URL (Paste into Meta Dashboard):</label>
                    <code className="block p-2 bg-emerald-100 rounded text-xs select-all break-all text-emerald-900 border border-emerald-200">
                      {window.location.origin}/api/whatsapp-webhook/{auth.currentUser?.uid}
                    </code>
                  </div>
                </div>

                <div className="space-y-4 md:col-span-2 pt-4 mt-2 border-t border-[var(--shadow-dark)]">
                  <h4 className="font-bold text-md text-emerald-600">Report Automation</h4>
                  <label className="flex items-center justify-between p-4 neu-pressed rounded-xl cursor-pointer hover:bg-black/5 transition-colors">
                    <div className="flex flex-col">
                      <span className="font-bold text-sm">Auto-Share Reports via WhatsApp</span>
                      <span className="text-xs neu-text-muted">Broadcast new reports immediately upon creation to all Active customers</span>
                    </div>
                    <div className="relative inline-block w-12 h-6 rounded-full transition-colors duration-300" style={{ backgroundColor: settings.automation?.autoShareReports ? 'var(--accent)' : 'var(--shadow-dark)' }}>
                      <input 
                        type="checkbox" 
                        className="sr-only" 
                        checked={settings.automation?.autoShareReports || false} 
                        onChange={(e) => setSettings({ ...settings, automation: { ...settings.automation, autoShareReports: e.target.checked } as any })} 
                      />
                      <motion.div animate={{ x: settings.automation?.autoShareReports ? 24 : 2 }} className="absolute left-0 top-1 w-4 h-4 bg-white rounded-full shadow-sm" />
                    </div>
                  </label>
                </div>
                
                <div className="space-y-4 md:col-span-2 pt-4 mt-2 border-t border-[var(--shadow-dark)]">
                  <h4 className="font-bold text-md text-emerald-600">WhatsApp Chatbot Commands</h4>
                  <p className="text-sm neu-text-muted">Set up custom auto-replies when customers text specific commands to your WhatsApp number.</p>
                  
                  <div className="space-y-3">
                    {(settings.chatbotCommands || []).map((cmd, index) => (
                      <div key={cmd.id} className="p-4 bg-white/50 border border-[var(--shadow-dark)] rounded-xl flex items-start gap-4">
                        <div className="flex-1 space-y-2">
                           <input
                             type="text"
                             value={cmd.triggerWord}
                             onChange={(e) => {
                               const newCmds = [...(settings.chatbotCommands || [])];
                               newCmds[index].triggerWord = e.target.value.toLowerCase();
                               setSettings({ ...settings, chatbotCommands: newCmds });
                             }}
                             placeholder="Trigger word (e.g., 'help', 'balance')"
                             className="w-full px-3 py-2 neu-pressed rounded-lg bg-transparent outline-none text-sm font-bold"
                           />
                           <textarea
                             value={cmd.response}
                             onChange={(e) => {
                               const newCmds = [...(settings.chatbotCommands || [])];
                               newCmds[index].response = e.target.value;
                               setSettings({ ...settings, chatbotCommands: newCmds });
                             }}
                             placeholder="Bot response message..."
                             className="w-full px-3 py-2 neu-pressed rounded-lg bg-transparent outline-none text-sm min-h-[60px]"
                           />
                        </div>
                        <div className="flex flex-col gap-2 items-center mt-1">
                          <label className="relative inline-block w-10 h-5 rounded-full transition-colors duration-300 cursor-pointer" style={{ backgroundColor: cmd.isActive ? 'var(--accent)' : 'var(--shadow-dark)' }}>
                             <input type="checkbox" className="sr-only" checked={cmd.isActive} onChange={(e) => {
                               const newCmds = [...(settings.chatbotCommands || [])];
                               newCmds[index].isActive = e.target.checked;
                               setSettings({ ...settings, chatbotCommands: newCmds });
                             }} />
                             <motion.div animate={{ x: cmd.isActive ? 20 : 2 }} className="absolute left-0 top-1 w-3 h-3 bg-white rounded-full shadow-sm" />
                          </label>
                          <button onClick={() => {
                             const newCmds = (settings.chatbotCommands || []).filter(c => c.id !== cmd.id);
                             setSettings({ ...settings, chatbotCommands: newCmds });
                          }} className="p-2 text-red-500 hover:bg-red-50 rounded-lg">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    ))}
                    <button
                      onClick={() => {
                         const newCmd = { id: uuidv4(), buttonLabel: '', triggerWord: '', response: '', isActive: true };
                         setSettings({ ...settings, chatbotCommands: [...(settings.chatbotCommands || []), newCmd] });
                      }}
                      className="w-full py-3 border-2 border-dashed border-[var(--shadow-dark)] text-[var(--text-muted)] hover:text-emerald-500 hover:border-emerald-500 rounded-xl flex items-center justify-center gap-2 font-bold transition-all text-sm"
                    >
                      <Plus className="w-4 h-4" /> Add Chatbot Command
                    </button>
                  </div>
                </div>

                <div className="space-y-4 md:col-span-2 pt-4 mt-2 border-t border-[var(--shadow-dark)]">
                  <label className="text-sm font-bold uppercase tracking-wider neu-text-muted ml-1">
                    Notification Delivery Method
                  </label>
                  <select
                    value={settings.preferredNotificationMethod || 'api'}
                    onChange={(e) => {
                       const selected = e.target.value;
                       const providerMatch = providers.find(p => p.id === selected);
                       setSettings({ 
                         ...settings, 
                         preferredNotificationMethod: selected,
                         cunnektBaseUrl: providerMatch ? providerMatch.baseUrl : settings.cunnektBaseUrl
                       });
                    }}
                    className="w-full px-4 py-3 neu-pressed rounded-xl bg-transparent outline-none text-sm font-bold text-emerald-600"
                  >
                    <option value="api">Meta Automated API (Official)</option>
                    {providers.map(provider => (
                      <option key={provider.id} value={provider.id}>{provider.name} ({provider.baseUrl})</option>
                    ))}
                    <option value="manual_link">Public Portal Link (Manual)</option>
                  </select>
                  <p className="text-xs neu-text-muted ml-1 mt-2">
                    If set to <strong className="text-blue-500">Public Portal Link</strong>, customers will receive a clickable link instead of attachments, opening their invoice and QR securely on their phone without requiring your API to be approved by Meta.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {activeTab === 'billing' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-2 border-blue-500/20 mb-6">
            <CardHeader className="flex flex-row items-center gap-3 pb-4 border-b border-[var(--shadow-dark)]">
              <div className="p-2 neu-pressed rounded-xl text-blue-600">
                <Database className="w-6 h-6" />
              </div>
              <div>
                <CardTitle className="text-lg">Automation Engines</CardTitle>
                <p className="text-sm neu-text-muted">Control 24/7 background system tasks</p>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 mb-6 flex flex-col gap-3">
                  <p className="text-sm font-bold text-amber-800 flex items-center gap-2">
                    <AlertCircle className="w-4 h-4" /> Manual Automation Override
                  </p>
                  <p className="text-xs text-amber-700">
                    This will bypass the current date check and immediately run the billing logic, add balances, and send notifications to all active customers. 
                    <strong> Use with caution as customers will receive notifications.</strong>
                  </p>
                  <motion.button
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                    onClick={handleTriggerAutomation}
                    disabled={isTriggerLoading}
                    className="w-full py-3 bg-amber-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-amber-500/30 disabled:opacity-70 flex items-center justify-center gap-2"
                  >
                    {isTriggerLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : "Run Billing Automation Now"}
                  </motion.button>
               </div>

              <div className="grid gap-4">
                {[
                  { key: 'billingLifecycle', label: 'Automated Billing Lifecycle' },
                  { key: 'ruleBased', label: 'Rule-based Automation' },
                  { key: 'lateFee', label: 'Auto Late Fee & Waiver' },
                  { key: 'scheduledBilling', label: 'Scheduled Billing Cycles' },
                  { key: 'bulkProcessing', label: 'Bulk Processing Engine' },
                  { key: 'smartNotifications', label: 'Smart Notification Timing' },
                  { key: 'autoShareReports', label: 'Automate Report Sharing' },
                  { key: 'autoCreateComplaints', label: 'Auto Create Complaints via WhatsApp Response' },
                  { key: 'enforceIstTimeWindow', label: 'Enforce 9AM-10AM IST Time Window' }
                ].map(item => (
                  <label key={item.key} className="flex items-center justify-between p-4 neu-pressed rounded-xl cursor-pointer">
                    <span className="text-sm font-bold">{item.label}</span>
                    <input
                      type="checkbox"
                      checked={settings.automation?.[item.key as keyof typeof settings.automation] ?? true}
                      onChange={(e) => setSettings({ ...settings, automation: { ...settings.automation, [item.key]: e.target.checked } as any })}
                      className="w-6 h-6 rounded border-[var(--shadow-dark)] text-blue-600 focus:ring-blue-500 bg-transparent"
                    />
                  </label>
                ))}
              </div>
            </CardContent>
          </Card>
          
          <Card className="border-2 border-blue-500/20 mb-6">
        <CardHeader className="flex flex-row items-center gap-3 pb-4 border-b border-[var(--shadow-dark)]">
          <div className="p-2 neu-pressed rounded-xl text-emerald-600">
            <DollarSign className="w-6 h-6" />
          </div>
          <div>
            <CardTitle className="text-lg">Billing Cycles & Rules</CardTitle>
            <p className="text-sm neu-text-muted">Configure how and when customers are billed</p>
          </div>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="grid gap-6 md:grid-cols-2">
            <div className="space-y-2">
              <label className="text-sm font-bold uppercase tracking-wider neu-text-muted ml-1">
                Bill Amount (INR)
              </label>
              <input
                type="number"
                value={settings.billingAmount}
                onChange={(e) => setSettings({ ...settings, billingAmount: Number(e.target.value) })}
                className="w-full px-4 py-3 neu-pressed rounded-xl bg-transparent outline-none text-lg font-bold"
              />
              <p className="text-xs neu-text-muted ml-1">Amount charged per billing cycle.</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold uppercase tracking-wider neu-text-muted ml-1">
                Billing Cycle (Months)
              </label>
              <input
                type="number"
                value={settings.billingCycleMonths}
                onChange={(e) => setSettings({ ...settings, billingCycleMonths: Number(e.target.value) })}
                className="w-full px-4 py-3 neu-pressed rounded-xl bg-transparent outline-none text-lg font-bold"
              />
              <p className="text-xs neu-text-muted ml-1">Generate a new bill every X months.</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold uppercase tracking-wider neu-text-muted ml-1">
                Penalty Amount (INR)
              </label>
              <input
                type="number"
                value={settings.penaltyAmount}
                onChange={(e) => setSettings({ ...settings, penaltyAmount: Number(e.target.value) })}
                className="w-full px-4 py-3 neu-pressed rounded-xl bg-transparent outline-none text-lg font-bold text-rose-600"
              />
              <p className="text-xs neu-text-muted ml-1">Flat penalty added for late payment.</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold uppercase tracking-wider neu-text-muted ml-1">
                Penalty Grace Period (Days)
              </label>
              <input
                type="number"
                value={settings.penaltyDays}
                onChange={(e) => setSettings({ ...settings, penaltyDays: Number(e.target.value) })}
                className="w-full px-4 py-3 neu-pressed rounded-xl bg-transparent outline-none text-lg font-bold"
              />
              <p className="text-xs neu-text-muted ml-1">Days after billing before penalty applies.</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold uppercase tracking-wider neu-text-muted ml-1">
                Default Billing Date (Day of Month)
              </label>
              <input
                type="number"
                min="1"
                max="28"
                value={settings.defaultBillingDate || '1'}
                onChange={(e) => setSettings({ ...settings, defaultBillingDate: e.target.value })}
                className="w-full px-4 py-3 neu-pressed rounded-xl bg-transparent outline-none text-lg font-bold"
              />
              <p className="text-xs neu-text-muted ml-1">The default day of the month when bills are generated.</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold uppercase tracking-wider neu-text-muted ml-1 text-emerald-600">
                Next Billing Date Override (Exact Date)
              </label>
              <input
                type="date"
                value={settings.nextBillingDate || ''}
                onChange={(e) => setSettings({ ...settings, nextBillingDate: e.target.value })}
                className="w-full px-4 py-3 neu-pressed rounded-xl bg-transparent outline-none text-lg font-bold text-emerald-700 border border-emerald-500/20"
              />
              <p className="text-xs neu-text-muted ml-1">Override default rules to specify the EXACT next billing date.</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold uppercase tracking-wider neu-text-muted ml-1 font-bold text-rose-600">
                Escalation Days
              </label>
              <input
                type="number"
                value={settings.escalationDays || 60}
                onChange={(e) => setSettings({ ...settings, escalationDays: Number(e.target.value) })}
                className="w-full px-4 py-3 neu-pressed rounded-xl bg-transparent outline-none text-lg font-bold text-rose-600 border border-rose-500/20"
              />
              <p className="text-xs neu-text-muted ml-1">Days overdue before issuing Final Overdue Notice.</p>
            </div>

            <div className="space-y-2 col-span-full pt-4 border-t border-[var(--shadow-dark)]">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={settings.autoSuspend || false}
                  onChange={(e) => setSettings({ ...settings, autoSuspend: e.target.checked })}
                  className="w-5 h-5 rounded border-[var(--shadow-dark)] text-rose-600 focus:ring-rose-500 bg-transparent"
                />
                <div>
                  <span className="text-sm font-bold uppercase tracking-wider neu-text-muted text-rose-600">Auto-Suspend Escalated Accounts</span>
                  <p className="text-xs neu-text-muted block mt-1">If enabled, accounts that pass the Escalation Days will automatically be marked as "Suspended".</p>
                </div>
              </label>
            </div>
          </div>
        </CardContent>
      </Card>
        </motion.div>
      )}

      {activeTab === 'gateway' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-2 border-indigo-500/20 mb-6">
            <CardHeader className="flex flex-row items-center gap-3 pb-4 border-b border-[var(--shadow-dark)]">
              <div className="p-2 neu-pressed rounded-xl text-indigo-600">
                <CreditCard className="w-6 h-6" />
              </div>
              <div>
                <CardTitle className="text-lg">Enterprise Payment Gateway</CardTitle>
                <p className="text-sm neu-text-muted">Connect your Bank API (Razorpay, Stripe, Cashfree) to automatically clear balances via Webhooks.</p>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-bold uppercase tracking-wider neu-text-muted ml-1">
                    Gateway API Key / ID
                  </label>
                  <input
                    type="password"
                    value={settings.paymentGatewayKey || ''}
                    onChange={(e) => setSettings({ ...settings, paymentGatewayKey: e.target.value })}
                    className="w-full px-4 py-3 neu-pressed rounded-xl bg-transparent outline-none text-sm font-medium"
                    placeholder="rzp_live_xxxxxxxxxx"
                  />
                  <p className="text-xs neu-text-muted ml-1 mt-1">Your public identifier for generating dynamic universal links.</p>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold uppercase tracking-wider neu-text-muted ml-1">
                    Webhook Secret
                  </label>
                  <input
                    type="password"
                    value={settings.paymentGatewaySecret || ''}
                    onChange={(e) => setSettings({ ...settings, paymentGatewaySecret: e.target.value })}
                    className="w-full px-4 py-3 neu-pressed rounded-xl bg-transparent outline-none text-sm font-medium"
                    placeholder="••••••••••••••"
                  />
                  <p className="text-xs neu-text-muted ml-1 mt-1">Used to securely verify payment completions anonymously triggered by the bank.</p>
                </div>
              </div>

              <div className="mt-6 p-4 border border-indigo-500/20 rounded-xl bg-indigo-500/5">
                <h4 className="font-bold text-sm text-indigo-600 mb-2">How to use Webhooks</h4>
                <p className="text-xs neu-text-muted mb-2">When implementing a dynamic QR Code, instruct your provider to send a `POST` request to:</p>
                <code className="text-xs font-mono bg-black/10 px-2 py-1 rounded block mb-2 break-all text-blue-600 font-bold">
                  {window.location.origin}/api/payment-webhook/{auth.currentUser?.uid || 'user_id'}
                </code>
                <p className="text-xs neu-text-muted">If this section is left blank, the system natively falls back to Manual Portal Receipt Approval.</p>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {activeTab === 'security' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
          <motion.div 
            whileHover={{ scale: 1.005 }}
            className="p-6 neu-pressed rounded-3xl flex flex-col items-start gap-4 border border-rose-500/20"
          >
            <div className="flex items-center gap-4">
              <div className="p-3 neu-flat rounded-2xl text-rose-600">
                <Trash2 className="w-8 h-8" />
              </div>
              <div>
                <p className="text-lg font-bold text-rose-600">Danger Zone</p>
                <p className="text-sm neu-text-muted">Irreversible actions that affect your entire account data.</p>
              </div>
            </div>
            <div className="w-full mt-4 p-4 rounded-xl bg-slate-100 text-xs text-slate-600 font-mono flex flex-col gap-1 border border-slate-200">
              <p>Owner ID: <span className="font-bold">{auth.currentUser?.uid}</span></p>
              <p>App URL: <span className="font-bold">{window.location.origin}</span></p>
            </div>
            <div className="flex flex-col sm:flex-row flex-wrap gap-3 mt-4 w-full">
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleResetDatabase}
                disabled={isResetting}
                className="px-6 py-3 bg-rose-100 text-rose-600 rounded-xl text-sm font-bold shadow-lg shadow-rose-500/10 disabled:opacity-70 flex items-center justify-center gap-2 w-full sm:w-auto transition-colors"
              >
                {isResetting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                {isResetting ? "Resetting..." : "Reset All Workspace Data"}
              </motion.button>
              <p className="text-xs neu-text-muted flex-1 min-w-[200px] mt-2 sm:mt-0">
                Warning: Resetting will permanently delete ALL customers, settings, and transactions across the system. Ensure you have backups.
              </p>
            </div>
          </motion.div>
          
          <div className="grid gap-6 md:grid-cols-2">
            {settingsGroups.filter(g => g.title === "Security & Privacy").map((group, i) => (
              <Card className="h-full" key={group.title}>
                <CardHeader className="flex flex-row items-center gap-3 pb-2">
                  <div className={`p-2 neu-pressed rounded-xl ${group.color}`}>
                    <group.icon className="w-5 h-5" />
                  </div>
                  <CardTitle className="text-base">{group.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-1">
                    {group.items.map(item => (
                      <motion.button
                        key={item}
                        whileHover={{ x: 5, backgroundColor: "rgba(0,0,0,0.02)" }}
                        className="w-full text-left p-2 rounded-lg text-sm font-medium transition-colors flex items-center justify-between group"
                      >
                        <span className="opacity-50 line-through">{item} (Pending API)</span>
                      </motion.button>
                    ))}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </motion.div>
      )}

      {isAdmin && (
        <motion.div id="providers-admin" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-2 border-amber-500/20 mb-6 mt-8">
            <CardHeader className="flex flex-row items-center gap-3 pb-4 border-b border-[var(--shadow-dark)]">
              <div className="p-2 neu-pressed rounded-xl text-amber-600">
                <Database className="w-6 h-6" />
              </div>
              <div>
                <CardTitle className="text-lg">Global Providers Administration</CardTitle>
                <p className="text-sm neu-text-muted">Admin-only feature to add custom WhatsApp providers dynamically.</p>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
               <div className="flex flex-col gap-4">
                  {providers.map(provider => (
                     <div key={provider.id} className="p-4 neu-flat rounded-xl flex items-center justify-between">
                        <div>
                           <p className="font-bold">{provider.name}</p>
                           <p className="text-xs neu-text-muted" style={{ wordBreak: 'break-all' }}>{provider.baseUrl}</p>
                        </div>
                        <button 
                           onClick={async () => {
                             if(window.confirm("Delete provider?")) {
                               try {
                                  await deleteProvider(provider.id);
                                  setProviders(providers.filter(p => p.id !== provider.id));
                               } catch(e) { console.error(e); }
                             }
                           }}
                           className="p-2 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-100"
                        >
                           <Trash2 className="w-4 h-4"/>
                        </button>
                     </div>
                  ))}
               </div>

               <div className="mt-6 p-4 rounded-xl border border-[var(--shadow-dark)] bg-[var(--bg-color)]">
                 <p className="font-bold mb-4 text-sm uppercase tracking-wider neu-text-muted">Add New Provider</p>
                 <div className="grid gap-4 md:grid-cols-2">
                    <input 
                       type="text" 
                       placeholder="Provider ID (e.g. wati, twilio, messagebird)" 
                       value={newProvider.id || ''} 
                       onChange={e => setNewProvider({ ...newProvider, id: e.target.value })}
                       className="px-4 py-3 neu-pressed rounded-xl bg-transparent outline-none text-sm font-medium w-full"
                    />
                    <input 
                       type="text" 
                       placeholder="Provider Name (e.g. WATI API)" 
                       value={newProvider.name || ''} 
                       onChange={e => setNewProvider({ ...newProvider, name: e.target.value })}
                       className="px-4 py-3 neu-pressed rounded-xl bg-transparent outline-none text-sm font-medium w-full"
                    />
                    <input 
                       type="text" 
                       placeholder="Base URL (e.g. https://api.twilio.com/v1)" 
                       value={newProvider.baseUrl || ''} 
                       onChange={e => setNewProvider({ ...newProvider, baseUrl: e.target.value })}
                       className="px-4 py-3 neu-pressed rounded-xl bg-transparent outline-none text-sm font-medium w-full md:col-span-2"
                    />
                    <button
                       onClick={async () => {
                         if (!newProvider.id || !newProvider.name || !newProvider.baseUrl) {
                           showAlert("Validation Error", "All fields are required.");
                           return;
                         }
                         try {
                           await addProvider(newProvider as WhatsAppProvider);
                           setProviders([...providers, newProvider as WhatsAppProvider]);
                           setNewProvider({ id: '', name: '', baseUrl: '', requiresApiKey: true, requiresPhoneId: false, isActive: true });
                           showAlert("Success", "Provider added successfully.");
                         } catch (e: any) {
                           showAlert("Error", e.message);
                         }
                       }}
                       className="px-6 py-3 bg-amber-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-amber-500/30 w-full md:col-span-2"
                    >
                       Add Provider
                    </button>
                 </div>
               </div>
            </CardContent>
          </Card>
        </motion.div>
      )}

      {/* Global Status Footer */}
      <motion.div 
        whileHover={{ scale: 1.005 }}
        className="p-6 neu-pressed rounded-3xl flex flex-col md:flex-row items-center justify-between gap-4 mt-8"
      >
        <div className="flex items-center gap-4">
          <div className="p-3 neu-flat rounded-2xl text-emerald-600">
            <Globe className="w-8 h-8" />
          </div>
          <div>
            <p className="text-lg font-bold">Global System Status</p>
            <p className="text-sm neu-text-muted">All systems operational • Version 2.4.0-stable</p>
          </div>
        </div>
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 px-4 py-2 neu-pressed rounded-xl text-xs font-bold text-blue-600">
              Last Bill Check: {settings.lastBillingDate ? new Date(settings.lastBillingDate).toLocaleDateString() : 'Never'}
            </div>
            <div className="flex items-center gap-2 px-4 py-2 neu-pressed rounded-xl text-xs font-bold text-rose-600">
              Last Penalty Check: {settings.lastPenaltyDate ? new Date(settings.lastPenaltyDate).toLocaleDateString() : 'Never'}
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
    </motion.div>
  );
}
