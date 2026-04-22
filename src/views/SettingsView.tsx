import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Settings, Bell, Shield, User, Globe, Palette, Database, HelpCircle, DollarSign, FileText, Save } from "lucide-react";
import { motion } from "motion/react";
import { subscribeToSettings, saveSettings, AppSettings, resetDatabase } from "../lib/db";
import { useTranslation } from "react-i18next";
import { Trash2, LogOut, MessageCircle } from "lucide-react";
import { auth, logout } from "../firebase";
import { ConfirmModal } from "../components/ConfirmModal";

export function SettingsView() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<'billing' | 'whatsapp' | 'security'>('billing');
  const [settings, setSettings] = useState<AppSettings>({
    upiQrCodeImage: null,
    billingAmount: 200,
    billingCycleMonths: 2,
    penaltyAmount: 40,
    penaltyDays: 10,
    defaultBillingDate: '1',
    metaWhatsAppApiKey: '',
    metaWhatsAppPhoneNumberId: '',
    automation: {
      billingLifecycle: true,
      ruleBased: true,
      lateFee: true,
      scheduledBilling: true,
      bulkProcessing: true,
      smartNotifications: true
    }
  });

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
      if (s) setSettings(s);
    });
    return () => {
      unsubSettings();
    };
  }, []);

  const handleSave = async () => {
    setIsSaving(true);
    try {
      await saveSettings(settings);
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
          <Save className="w-4 h-4" /> {isSaving ? "Saving..." : "Save All Changes"}
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

      {activeTab === 'whatsapp' && (
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}>
          <Card className="border-2 border-emerald-500/20 mb-6">
            <CardHeader className="flex flex-row items-center gap-3 pb-4 border-b border-[var(--shadow-dark)]">
              <div className="p-2 neu-pressed rounded-xl text-emerald-600">
                <MessageCircle className="w-6 h-6" />
              </div>
              <div>
                <CardTitle className="text-lg">WhatsApp API Configuration</CardTitle>
                <p className="text-sm neu-text-muted">Enter your Meta WhatsApp Business API credentials for automated background sending.</p>
              </div>
            </CardHeader>
            <CardContent className="pt-6">
              <div className="grid gap-6 md:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-sm font-bold uppercase tracking-wider neu-text-muted ml-1">
                    WhatsApp API Key (Bearer Token)
                  </label>
                  <input
                    type="password"
                    value={settings.metaWhatsAppApiKey || ''}
                    onChange={(e) => setSettings({ ...settings, metaWhatsAppApiKey: e.target.value })}
                    className="w-full px-4 py-3 neu-pressed rounded-xl bg-transparent outline-none text-sm font-medium"
                    placeholder="••••••••••••••"
                  />
                  <p className="text-xs neu-text-muted ml-1 mt-1">Found in your Meta App Dashboard &gt; WhatsApp &gt; API Setup &gt; Temporary or Permanent access token.</p>
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
                
                <div className="space-y-4 md:col-span-2 pt-4 mt-2 border-t border-[var(--shadow-dark)]">
                  <h4 className="font-bold text-md text-emerald-600">Chatbot & Webhook Setup</h4>
                  <p className="text-sm neu-text-muted">Configure this to allow customers to send messages to your WhatsApp number. The system will automatically log them as Complaints.</p>
                  
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
                
                <div className="space-y-2 md:col-span-2 mt-4 pt-4 border-t border-[var(--shadow-dark)]">
                  <label className="text-sm font-bold uppercase tracking-wider neu-text-muted ml-1">
                    Notification Delivery Method
                  </label>
                  <select
                    value={settings.preferredNotificationMethod || 'api'}
                    onChange={(e) => setSettings({ ...settings, preferredNotificationMethod: e.target.value as 'api' | 'manual_link' })}
                    className="w-full px-4 py-3 neu-pressed rounded-xl bg-transparent outline-none text-sm font-bold text-emerald-600"
                  >
                    <option value="api">Automated Attachments (Requires Meta API setup)</option>
                    <option value="manual_link">Public Portal Link (Works without Meta API via Web)</option>
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
              <div className="grid gap-4">
                {[
                  { key: 'billingLifecycle', label: 'Automated Billing Lifecycle' },
                  { key: 'ruleBased', label: 'Rule-based Automation' },
                  { key: 'lateFee', label: 'Auto Late Fee & Waiver' },
                  { key: 'scheduledBilling', label: 'Scheduled Billing Cycles' },
                  { key: 'bulkProcessing', label: 'Bulk Processing Engine' },
                  { key: 'smartNotifications', label: 'Smart Notification Timing' }
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
                max="31"
                value={settings.defaultBillingDate || '1'}
                onChange={(e) => setSettings({ ...settings, defaultBillingDate: e.target.value })}
                className="w-full px-4 py-3 neu-pressed rounded-xl bg-transparent outline-none text-lg font-bold"
              />
              <p className="text-xs neu-text-muted ml-1">The day of the month when bills are generated.</p>
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
            <div className="flex flex-col sm:flex-row flex-wrap gap-3 mt-4 w-full">
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleResetDatabase}
                disabled={isResetting}
                className="px-6 py-3 bg-rose-100 text-rose-600 rounded-xl text-sm font-bold shadow-lg shadow-rose-500/10 disabled:opacity-70 flex items-center justify-center gap-2 w-full sm:w-auto"
              >
                <Trash2 className="w-4 h-4" />
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
    </motion.div>
  );
}
