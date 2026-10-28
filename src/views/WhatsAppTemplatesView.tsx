import React, { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  CheckCircle2, 
  AlertCircle, 
  Trash2, 
  Edit2, 
  Copy, 
  Sparkles, 
  Send, 
  RefreshCw, 
  Layers, 
  ShieldCheck, 
  Smartphone, 
  FileText, 
  Check, 
  Star, 
  ArrowRight, 
  X,
  CreditCard,
  BellRing,
  AlertTriangle,
  UserCheck,
  Megaphone,
  Radio,
  Sliders,
  Code2,
  BookOpen,
  ExternalLink,
  Info
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  WhatsAppTemplate, 
  TemplateParameterMapping, 
  SYSTEM_TEMPLATE_VARIABLES, 
  DEFAULT_WHATSAPP_TEMPLATES, 
  subscribeToWhatsAppTemplates, 
  saveWhatsAppTemplate, 
  deleteWhatsAppTemplate, 
  seedDefaultWhatsAppTemplates,
  saveSettings
} from '../lib/db';
import { useData } from '../contexts/DataContext';
import { useTenant } from '../contexts/TenantContext';
import { authFetch } from '../lib/api';
import { ConfirmModal } from '../components/ConfirmModal';

const CATEGORY_META = {
  billing: {
    label: 'Billing & Invoices',
    icon: FileText,
    color: 'text-blue-500 bg-blue-500/10 border-blue-500/30',
    description: 'Dispatched during automated or manual billing cycles with itemized PDF.'
  },
  receipt: {
    label: 'Payment Receipts',
    icon: CreditCard,
    color: 'text-emerald-500 bg-emerald-500/10 border-emerald-500/30',
    description: 'Acknowledges cash or UPI payments with official stamped receipts.'
  },
  overdue: {
    label: 'Due & Overdue Reminders',
    icon: BellRing,
    color: 'text-amber-500 bg-amber-500/10 border-amber-500/30',
    description: 'Sent during grace periods with late fee surcharge breakdown.'
  },
  welcome: {
    label: 'New Connections',
    icon: UserCheck,
    color: 'text-purple-500 bg-purple-500/10 border-purple-500/30',
    description: 'Onboarding message sent when a new consumer is added to the system.'
  },
  broadcast: {
    label: 'Public Notices',
    icon: Megaphone,
    color: 'text-cyan-500 bg-cyan-500/10 border-cyan-500/30',
    description: 'Mass alerts for pipeline repairs, maintenance, and water quality updates.'
  },
  suspension: {
    label: 'Disconnection Notices',
    icon: AlertTriangle,
    color: 'text-rose-500 bg-rose-500/10 border-rose-500/30',
    description: 'Final statutory warning before water supply disconnection.'
  },
  complaint: {
    label: 'Complaint Resolution',
    icon: CheckCircle2,
    color: 'text-teal-500 bg-teal-500/10 border-teal-500/30',
    description: 'Official notification dispatched when a citizen grievance or complaint is resolved.'
  },
  custom: {
    label: 'Custom Templates',
    icon: Sliders,
    color: 'text-indigo-500 bg-indigo-500/10 border-indigo-500/30',
    description: 'User-defined template for specialized Gram Panchayat workflows.'
  }
};

export function WhatsAppTemplatesView() {
  const { currentOwnerId } = useTenant();
  const { settings } = useData();

  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isSyncingMeta, setIsSyncingMeta] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Editor Modal State
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Partial<WhatsAppTemplate> | null>(null);

  // Test Send Modal State
  const [isTestModalOpen, setIsTestModalOpen] = useState(false);
  const [testTargetTemplate, setTestTargetTemplate] = useState<WhatsAppTemplate | null>(null);
  const [testPhoneNumber, setTestPhoneNumber] = useState('');
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testFeedback, setTestFeedback] = useState<{ success?: boolean; message?: string } | null>(null);

  // Confirm Delete Modal State
  const [deleteId, setDeleteId] = useState<string | null>(null);

  // Meta Setup Guide State
  const [showMetaGuide, setShowMetaGuide] = useState(false);
  const [activeGuideTab, setActiveGuideTab] = useState<'billing' | 'receipt' | 'overdue' | 'welcome' | 'broadcast' | 'suspension'>('billing');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = (text: string, key: string) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch (e) {
      console.warn("Clipboard write failed:", e);
    }
  };

  // Subscribe to real-time templates from Firestore
  useEffect(() => {
    setIsLoading(true);
    const unsubscribe = subscribeToWhatsAppTemplates(currentOwnerId || undefined, (loaded) => {
      setTemplates(loaded);
      setIsLoading(false);
    });
    return () => unsubscribe();
  }, [currentOwnerId]);

  const showBanner = (msg: string, isError = false) => {
    if (isError) {
      setErrorMessage(msg);
      setTimeout(() => setErrorMessage(null), 5000);
    } else {
      setSuccessMessage(msg);
      setTimeout(() => setSuccessMessage(null), 4000);
    }
  };

  const handleOpenEditor = (templateToEdit?: WhatsAppTemplate) => {
    if (templateToEdit) {
      setEditingTemplate({ ...templateToEdit });
    } else {
      // Create new template default
      setEditingTemplate({
        id: '',
        templateName: '',
        category: 'billing',
        language: 'en_US',
        headerType: 'DOCUMENT',
        headerText: 'Water Department Notice',
        bodyText: 'Dear {{1}}, your water bill for Rs. {{2}} has been generated. Total balance: Rs. {{3}} by {{4}}.',
        parameters: 'customer_name, billing_amount, new_balance, date, button_param',
        parameterMappings: [
          { index: 1, placeholder: '{{1}}', key: 'customer_name', label: 'Citizen Name' },
          { index: 2, placeholder: '{{2}}', key: 'billing_amount', label: 'Current Bill Amount' },
          { index: 3, placeholder: '{{3}}', key: 'new_balance', label: 'Total Payable Balance' },
          { index: 4, placeholder: '{{4}}', key: 'date', label: 'Bill Date' },
          { index: 5, placeholder: '{{5}}', key: 'button_param', label: 'Dynamic Button Suffix' }
        ],
        supportsButton: true,
        buttonParamKey: 'button_param',
        buttonText: 'View & Pay Invoice',
        isActive: true,
        isDefault: false
      });
    }
    setIsEditorOpen(true);
  };

  const handleApplyPreset = (categoryKey: string) => {
    const preset = DEFAULT_WHATSAPP_TEMPLATES.find(t => t.category === categoryKey);
    if (preset && editingTemplate) {
      setEditingTemplate({
        ...editingTemplate,
        templateName: preset.templateName,
        category: preset.category,
        language: preset.language || 'en_US',
        headerType: preset.headerType,
        headerText: preset.headerText,
        bodyText: preset.bodyText,
        parameters: preset.parameters,
        parameterMappings: preset.parameterMappings,
        supportsButton: preset.supportsButton,
        buttonParamKey: preset.buttonParamKey,
        buttonText: preset.buttonText,
        description: preset.description
      });
      showBanner(`Applied official ${CATEGORY_META[preset.category as keyof typeof CATEGORY_META]?.label || categoryKey} preset parameters.`);
    }
  };

  const handleSaveTemplate = async () => {
    if (!editingTemplate) return;
    
    // Sanitize template name (Meta requirements: lowercase letters, numbers, underscores)
    const sanitizedName = (editingTemplate.templateName || '')
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_]/g, '_')
      .replace(/^_+|_+$/g, '');

    if (!sanitizedName) {
      showBanner("Please provide a valid Meta Template Name (lowercase letters and underscores only).", true);
      return;
    }

    if (!editingTemplate.bodyText || editingTemplate.bodyText.trim() === '') {
      showBanner("Template message body text cannot be empty.", true);
      return;
    }

    setIsSaving(true);
    try {
      // Re-derive parameter string from parameterMappings
      const mappings = editingTemplate.parameterMappings || [];
      const derivedParams = mappings.map(m => m.key).join(', ');

      const templateToSave: WhatsAppTemplate = {
        id: editingTemplate.id || `tpl_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        templateName: sanitizedName,
        category: editingTemplate.category || 'billing',
        language: editingTemplate.language || 'en_US',
        headerType: editingTemplate.headerType || 'NONE',
        headerText: editingTemplate.headerText || '',
        bodyText: editingTemplate.bodyText,
        parameters: derivedParams || editingTemplate.parameters || '',
        parameterMappings: mappings,
        supportsButton: !!editingTemplate.supportsButton,
        buttonParamKey: editingTemplate.buttonParamKey || 'button_param',
        buttonText: editingTemplate.buttonText || 'Open Portal',
        isActive: editingTemplate.isActive ?? true,
        isDefault: !!editingTemplate.isDefault,
        description: editingTemplate.description || '',
        updatedAt: new Date().toISOString()
      };

      await saveWhatsAppTemplate(templateToSave, currentOwnerId || undefined);
      showBanner(`Template "${sanitizedName}" successfully saved to Firestore & synced to automation engine.`);
      setIsEditorOpen(false);
      setEditingTemplate(null);
    } catch (err: any) {
      console.error("Error saving template:", err);
      showBanner(err.message || "Failed to save template to Firestore.", true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!deleteId) return;
    try {
      await deleteWhatsAppTemplate(deleteId, currentOwnerId || undefined);
      showBanner("Template deleted from Firestore.");
      setDeleteId(null);
    } catch (err: any) {
      showBanner(err.message || "Failed to delete template.", true);
    }
  };

  const handleToggleActive = async (template: WhatsAppTemplate) => {
    try {
      await saveWhatsAppTemplate({
        ...template,
        isActive: !template.isActive,
        updatedAt: new Date().toISOString()
      }, currentOwnerId || undefined);
      showBanner(`Template "${template.templateName}" is now ${!template.isActive ? 'Active' : 'Inactive'}.`);
    } catch (err: any) {
      showBanner(err.message || "Failed to toggle template status.", true);
    }
  };

  const handleSetDefault = async (template: WhatsAppTemplate) => {
    try {
      // Unmark any other template in this category as default
      const batchPromises = templates
        .filter(t => t.category === template.category && t.id !== template.id && t.isDefault)
        .map(t => saveWhatsAppTemplate({ ...t, isDefault: false }, currentOwnerId || undefined));
      
      await Promise.all(batchPromises);
      await saveWhatsAppTemplate({ ...template, isDefault: true, isActive: true }, currentOwnerId || undefined);
      showBanner(`"${template.templateName}" is now the primary template for ${CATEGORY_META[template.category]?.label || template.category}.`);
    } catch (err: any) {
      showBanner(err.message || "Failed to set default template.", true);
    }
  };

  const handleSetAsBroadcast = async (template: WhatsAppTemplate) => {
    try {
      // 1. Unmark any other broadcast template as default
      const batchPromises = templates
        .filter(t => t.category === 'broadcast' && t.id !== template.id && t.isDefault)
        .map(t => saveWhatsAppTemplate({ ...t, isDefault: false }, currentOwnerId || undefined));
      await Promise.all(batchPromises);

      // 2. Mark this template as broadcast default and active
      const updatedTemplate: WhatsAppTemplate = {
        ...template,
        category: 'broadcast',
        isDefault: true,
        isActive: true,
      };
      await saveWhatsAppTemplate(updatedTemplate, currentOwnerId || undefined);

      // 3. Update settings.metaTemplateBroadcast
      if (settings) {
        await saveSettings({
          ...settings,
          metaTemplateBroadcast: template.templateName
        }, currentOwnerId || undefined);
      }

      showBanner(`"${template.templateName}" is now the active template for automated and manual broadcasts!`);
    } catch (err: any) {
      showBanner(err.message || "Failed to set template for broadcasts.", true);
    }
  };

  const handleSyncPresets = async () => {
    setIsSaving(true);
    try {
      await seedDefaultWhatsAppTemplates(currentOwnerId || undefined);
      showBanner("All official water department templates and parameter mappings seeded successfully into Firestore.");
    } catch (err: any) {
      showBanner(err.message || "Failed to seed default templates.", true);
    } finally {
      setIsSaving(false);
    }
  };

  const handleFetchFromMeta = async () => {
    setIsSyncingMeta(true);
    try {
      const res = await authFetch('/api/wa/sync-templates', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ownerId: currentOwnerId || undefined })
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to fetch templates from Meta API');
      }
      showBanner(`Successfully synced ${data.count} approved message templates from Meta Business API!`);
    } catch (err: any) {
      showBanner(err.message || 'Failed to sync templates from Meta API. Check your API Key and Phone ID in Settings.', true);
    } finally {
      setIsSyncingMeta(false);
    }
  };

  // Add / remove parameter mapping in editor
  const handleAddParameter = () => {
    if (!editingTemplate) return;
    const currentMappings = editingTemplate.parameterMappings || [];
    const nextIndex = currentMappings.length + 1;
    const newMapping: TemplateParameterMapping = {
      index: nextIndex,
      placeholder: `{{${nextIndex}}}`,
      key: 'customer_name',
      label: 'Citizen Name'
    };
    const updated = [...currentMappings, newMapping];
    setEditingTemplate({
      ...editingTemplate,
      parameterMappings: updated,
      parameters: updated.map(m => m.key).join(', ')
    });
  };

  const handleRemoveParameter = (indexToRemove: number) => {
    if (!editingTemplate) return;
    const currentMappings = editingTemplate.parameterMappings || [];
    const filtered = currentMappings.filter((_, idx) => idx !== indexToRemove);
    const reindexed = filtered.map((m, idx) => ({
      ...m,
      index: idx + 1,
      placeholder: `{{${idx + 1}}}`
    }));
    setEditingTemplate({
      ...editingTemplate,
      parameterMappings: reindexed,
      parameters: reindexed.map(m => m.key).join(', ')
    });
  };

  const handleUpdateParameterMapping = (index: number, key: string) => {
    if (!editingTemplate) return;
    const currentMappings = [...(editingTemplate.parameterMappings || [])];
    const foundVar = SYSTEM_TEMPLATE_VARIABLES.find(v => v.key === key);
    if (currentMappings[index]) {
      currentMappings[index] = {
        ...currentMappings[index],
        key,
        label: foundVar?.label || key
      };
      setEditingTemplate({
        ...editingTemplate,
        parameterMappings: currentMappings,
        parameters: currentMappings.map(m => m.key).join(', ')
      });
    }
  };

  // Send Test Message
  const handleExecuteTest = async () => {
    if (!testTargetTemplate || !testPhoneNumber.trim()) {
      setTestFeedback({ success: false, message: "Please enter a valid recipient phone number." });
      return;
    }
    setIsSendingTest(true);
    setTestFeedback(null);
    try {
      const cleanMobile = testPhoneNumber.replace(/\D/g, '');
      const sampleCustomer = {
        id: 'DEMO-001',
        name: 'Malook Singh',
        mobileNumber: cleanMobile,
        balance: 400
      };

      // Substitute parameters
      const mappedParams = (testTargetTemplate.parameterMappings || []).map(m => {
        if (m.key === 'customer_name') return sampleCustomer.name;
        if (m.key === 'customer_id') return sampleCustomer.id;
        if (m.key === 'billing_amount') return String(settings?.billingAmount || 200);
        if (m.key === 'new_balance') return String(sampleCustomer.balance);
        if (m.key === 'payment_amount') return String(settings?.billingAmount || 200);
        if (m.key === 'date') return new Date().toLocaleDateString('en-GB');
        if (m.key === 'due_date') return new Date(Date.now() + 10 * 86400000).toLocaleDateString('en-GB');
        if (m.key === 'panchayat_name') return settings?.organizationName || 'Gram Panchayat';
        if (m.key === 'button_param') return { isButtonParam: true, value: sampleCustomer.id, index: "0" };
        return m.key;
      });

      const response = await authFetch('/api/wa/send', {
        method: 'POST',
        body: JSON.stringify({
          to: cleanMobile,
          message: testTargetTemplate.bodyText,
          templateCategory: testTargetTemplate.category,
          customTemplateName: testTargetTemplate.templateName,
          templateParams: mappedParams,
          ownerId: currentOwnerId || 'system'
        })
      });

      let data: any = {};
      try {
        const text = await response.text();
        data = text ? JSON.parse(text) : {};
      } catch (e) {
        data = { error: `Server returned non-JSON response (HTTP ${response.status})` };
      }
      if (response.ok && data.success) {
        setTestFeedback({
          success: true,
          message: `Message dispatched successfully via Meta API! ID: ${data.messageId || 'Sent'}`
        });
      } else {
        setTestFeedback({
          success: false,
          message: data.error || "Meta WhatsApp Business API rejected the dispatch."
        });
      }
    } catch (err: any) {
      setTestFeedback({ success: false, message: err.message || "Failed to execute test dispatch." });
    } finally {
      setIsSendingTest(false);
    }
  };

  // Helper to render live preview text with simulated variables
  const renderPreviewText = (template: Partial<WhatsAppTemplate>) => {
    let text = template.bodyText || '';
    const mappings = template.parameterMappings || [];
    
    // Replace placeholders with friendly highlighted values
    mappings.forEach(m => {
      const foundVar = SYSTEM_TEMPLATE_VARIABLES.find(v => v.key === m.key);
      const sampleVal = foundVar?.sample || `[${m.label}]`;
      const regex = new RegExp(`\\{\\{${m.index}\\}\\}`, 'g');
      text = text.replace(regex, `«${sampleVal}»`);
    });
    return text;
  };

  // Filter templates
  const filteredTemplates = templates.filter(t => {
    const matchesCategory = selectedCategory === 'all' || t.category === selectedCategory;
    const matchesSearch = !searchQuery.trim() || 
      t.templateName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.bodyText.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (t.parameters && t.parameters.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesCategory && matchesSearch;
  });

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Top Banner / Toast */}
      <AnimatePresence>
        {successMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -10 }}
            className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-between shadow-lg"
          >
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 flex-shrink-0 text-emerald-400" />
              <span className="text-sm font-medium">{successMessage}</span>
            </div>
            <button onClick={() => setSuccessMessage(null)} className="p-1 hover:bg-emerald-500/20 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
        {errorMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }} 
            animate={{ opacity: 1, y: 0 }} 
            exit={{ opacity: 0, y: -10 }}
            className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-400 flex items-center justify-between shadow-lg"
          >
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 flex-shrink-0 text-rose-400" />
              <span className="text-sm font-medium">{errorMessage}</span>
            </div>
            <button onClick={() => setErrorMessage(null)} className="p-1 hover:bg-rose-500/20 rounded-lg">
              <X className="w-4 h-4" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Section */}
      <div className="p-6 md:p-8 rounded-3xl neu-flat flex flex-col md:flex-row md:items-center justify-between gap-6 relative overflow-hidden">
        <div className="space-y-2 z-10">
          <div className="flex items-center gap-2">
            <span className="px-3 py-1 text-xs font-semibold uppercase tracking-wider rounded-full bg-blue-500/10 border border-blue-500/20 text-blue-400 flex items-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5" />
              Enterprise Automation Core
            </span>
            <span className="px-3 py-1 text-xs font-semibold uppercase tracking-wider rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 flex items-center gap-1.5">
              <Radio className="w-3.5 h-3.5 animate-pulse" />
              Firestore Real-Time Sync
            </span>
          </div>
          <h1 className="text-2xl md:text-3xl font-black tracking-tight text-white flex items-center gap-3">
            <Code2 className="w-8 h-8 text-blue-400" />
            WhatsApp Message Templates
          </h1>
          <p className="text-sm neu-text-muted max-w-2xl leading-relaxed">
            Define, customize, and store official WhatsApp message templates and parameter mappings in Firestore. The server and client billing engines dynamically substitute consumer metrics, amounts, and digital portal links prior to dispatch.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 z-10">
          <button
            onClick={() => setShowMetaGuide(!showMetaGuide)}
            className={`px-4 py-2.5 rounded-2xl neu-flat hover:neu-pressed text-xs font-semibold flex items-center gap-2 transition-all ${
              showMetaGuide ? 'neu-pressed text-blue-400 border border-blue-500/40 bg-blue-500/10' : 'text-slate-300 hover:text-white'
            }`}
            title="View exact Meta WhatsApp Manager template requirements and parameters"
          >
            <BookOpen className="w-4 h-4 text-blue-400" />
            Meta Submission Guide {showMetaGuide ? '▲' : '▼'}
          </button>
          <button
            onClick={handleSyncPresets}
            disabled={isSaving}
            className="px-4 py-2.5 rounded-2xl neu-flat hover:neu-pressed text-xs font-medium flex items-center gap-2 transition-all text-slate-300 hover:text-white disabled:opacity-50"
            title="Populate recommended Gram Panchayat templates into Firestore"
          >
            <Sparkles className="w-4 h-4 text-amber-400" />
            Sync Official Presets
          </button>
          <button
            onClick={handleFetchFromMeta}
            disabled={isSyncingMeta}
            className="px-4 py-2.5 rounded-2xl neu-flat hover:neu-pressed text-xs font-medium flex items-center gap-2 transition-all text-emerald-400 hover:text-emerald-300 disabled:opacity-50 border border-emerald-500/20"
            title="Fetch and sync available WhatsApp Message Templates directly from Meta Business API"
          >
            <RefreshCw className={`w-4 h-4 text-emerald-400 ${isSyncingMeta ? 'animate-spin' : ''}`} />
            {isSyncingMeta ? 'Syncing Meta...' : 'Fetch & Sync from Meta'}
          </button>
          <button
            onClick={() => handleOpenEditor()}
            className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-blue-500/20 transition-all active:scale-95"
          >
            <Plus className="w-4 h-4" />
            New Template
          </button>
        </div>
      </div>

      {/* Meta WhatsApp Manager Submission Guide Accordion */}
      <AnimatePresence>
        {showMetaGuide && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-6 md:p-8 rounded-3xl neu-flat border border-blue-500/30 bg-slate-900/90 space-y-6 shadow-2xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-white/10">
                <div className="space-y-1">
                  <span className="px-2.5 py-0.5 rounded-full bg-blue-500/10 border border-blue-500/30 text-[11px] font-semibold text-blue-400 uppercase tracking-wider flex items-center gap-1.5 w-fit">
                    <BookOpen className="w-3.5 h-3.5" />
                    Meta Official Compliance & Value Mapping
                  </span>
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    Which Templates to Add in Meta & Where
                  </h3>
                  <p className="text-xs neu-text-muted leading-relaxed">
                    To send WhatsApp notifications without rejection, create the following templates in your official 
                    <strong className="text-blue-300"> Meta WhatsApp Manager</strong>. Our app automatically injects the matching values into each variable placeholder!
                  </p>
                </div>
                <a
                  href="https://business.facebook.com/wa/manage/message-templates"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-4 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-2 transition-all shadow-md shadow-blue-500/20 whitespace-nowrap self-start md:self-auto"
                >
                  <ExternalLink className="w-4 h-4" />
                  Open Meta WhatsApp Manager
                </a>
              </div>

              {/* Where to create step-by-step banner */}
              <div className="p-4 rounded-2xl bg-blue-950/30 border border-blue-500/20 text-xs text-blue-200 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                <div className="flex items-start gap-3">
                  <Info className="w-5 h-5 text-blue-400 flex-shrink-0 mt-0.5" />
                  <div>
                    <span className="font-bold text-white">Where to register in Meta:</span>
                    <p className="mt-0.5 text-blue-200/90">
                      Go to <code className="px-1.5 py-0.5 rounded bg-blue-900/50 text-white font-mono">business.facebook.com</code> → <strong>WhatsApp Manager</strong> → Left menu: <strong>Account Tools</strong> → <strong>Message Templates</strong> → Click <strong>Create Template</strong>.
                    </p>
                  </div>
                </div>
                <div className="text-[11px] text-blue-300 font-mono bg-blue-900/30 px-3 py-1.5 rounded-xl border border-blue-500/20 whitespace-nowrap">
                  Category: UTILITY | Language: English (en)
                </div>
              </div>

              {/* Template Category Selector Tabs */}
              <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
                {[
                  { key: 'billing', label: '1. Billing & Invoice', icon: FileText },
                  { key: 'receipt', label: '2. Payment Receipt', icon: CreditCard },
                  { key: 'overdue', label: '3. Overdue Reminder', icon: BellRing },
                  { key: 'welcome', label: '4. New Connection', icon: UserCheck },
                  { key: 'broadcast', label: '5. Public Notice', icon: Megaphone },
                  { key: 'suspension', label: '6. Disconnection Notice', icon: AlertTriangle }
                ].map((item) => (
                  <button
                    key={item.key}
                    onClick={() => setActiveGuideTab(item.key as any)}
                    className={`px-4 py-2 rounded-2xl text-xs font-semibold flex items-center gap-2 transition-all whitespace-nowrap ${
                      activeGuideTab === item.key
                        ? 'neu-pressed text-blue-400 border border-blue-500/30 bg-blue-500/10'
                        : 'neu-flat hover:neu-pressed text-slate-400 hover:text-white'
                    }`}
                  >
                    <item.icon className="w-3.5 h-3.5" />
                    {item.label}
                  </button>
                ))}
              </div>

              {/* Template Specification Details for Active Tab */}
              {activeGuideTab === 'billing' && (
                <div className="p-5 rounded-2xl neu-pressed bg-slate-950/50 border border-white/5 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4 border-b border-white/5">
                    <div>
                      <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block">Template Name in Meta</span>
                      <div className="flex items-center gap-2 mt-1">
                        <code className="text-sm font-mono text-emerald-400 font-bold">billing</code>
                        <button 
                          onClick={() => handleCopy('billing', 'billing_name')}
                          className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white"
                          title="Copy name"
                        >
                          {copiedKey === 'billing_name' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <span className="text-[10px] text-slate-500">Or &apos;water_bill_v1&apos; (save matching name in app)</span>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block">Category & Language</span>
                      <div className="text-sm font-semibold text-white mt-1">Utility • English (en_US)</div>
                      <span className="text-[10px] text-slate-500">Fastest Meta approval rate</span>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block">Header Media</span>
                      <div className="text-sm font-semibold text-blue-400 mt-1">Document (PDF Invoice)</div>
                      <span className="text-[10px] text-slate-500">Upload sample PDF Invoice in Meta</span>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Exact Body Text to Paste in Meta:</span>
                      <button
                        onClick={() => handleCopy('Dear {{1}}, your water bill for {{2}} amounting to Rs. {{3}} has been generated. Total balance payable: Rs. {{4}} by {{5}}. Pay securely online or at Panchayat office.', 'billing_body')}
                        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium"
                      >
                        {copiedKey === 'billing_body' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedKey === 'billing_body' ? 'Copied Body Text!' : 'Copy Body Text'}
                      </button>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-900 border border-white/10 font-mono text-xs text-slate-200 whitespace-pre-wrap leading-relaxed select-all">
                      Dear {'{{1}}'}, your water bill for {'{{2}}'} amounting to Rs. {'{{3}}'} has been generated. Total balance payable: Rs. {'{{4}}'} by {'{{5}}'}. Pay securely online or at Panchayat office.
                    </div>
                  </div>

                  {/* Parameter Value Mapping Table */}
                  <div>
                    <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-2">How Our App Populates Meta Parameters:</span>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-white/5">
                        <span className="font-mono text-blue-400 font-bold block">{'{{1}}'}</span>
                        <span className="text-white font-medium block">Citizen Name</span>
                        <span className="text-[10px] text-slate-400">e.g. Malook Singh</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-white/5">
                        <span className="font-mono text-blue-400 font-bold block">{'{{2}}'}</span>
                        <span className="text-white font-medium block">Billing Date / Month</span>
                        <span className="text-[10px] text-slate-400">e.g. October 2026</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-white/5">
                        <span className="font-mono text-blue-400 font-bold block">{'{{3}}'}</span>
                        <span className="text-white font-medium block">Bill Amount</span>
                        <span className="text-[10px] text-slate-400">e.g. 200</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-white/5">
                        <span className="font-mono text-blue-400 font-bold block">{'{{4}}'}</span>
                        <span className="text-white font-medium block">Total Balance</span>
                        <span className="text-[10px] text-slate-400">e.g. 400</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-white/5">
                        <span className="font-mono text-blue-400 font-bold block">{'{{5}}'}</span>
                        <span className="text-white font-medium block">Due Date</span>
                        <span className="text-[10px] text-slate-400">e.g. 25/10/2026</span>
                      </div>
                    </div>
                  </div>

                  {/* Optional Button */}
                  <div className="p-3 rounded-xl bg-blue-900/20 border border-blue-500/20 flex flex-col md:flex-row items-start md:items-center justify-between gap-3 text-xs">
                    <div>
                      <strong className="text-white">Optional Action Button in Meta:</strong>
                      <span className="text-slate-300 ml-1.5">Select <strong>Call to Action</strong> → <strong>Visit Website</strong> → Dynamic URL: <code className="text-blue-300 font-mono">https://your-domain/portal/{'{{1}}'}</code></span>
                    </div>
                    <span className="text-[11px] text-emerald-400 font-semibold bg-emerald-950/40 px-2.5 py-1 rounded-lg border border-emerald-500/30">Auto-routes to Citizen Invoice Portal</span>
                  </div>
                </div>
              )}

              {activeGuideTab === 'receipt' && (
                <div className="p-5 rounded-2xl neu-pressed bg-slate-950/50 border border-white/5 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4 border-b border-white/5">
                    <div>
                      <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block">Template Name in Meta</span>
                      <div className="flex items-center gap-2 mt-1">
                        <code className="text-sm font-mono text-emerald-400 font-bold">receipt</code>
                        <button 
                          onClick={() => handleCopy('receipt', 'receipt_name')}
                          className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white"
                        >
                          {copiedKey === 'receipt_name' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                      <span className="text-[10px] text-slate-500">Or &apos;water_receipt_v1&apos;</span>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block">Category & Language</span>
                      <div className="text-sm font-semibold text-white mt-1">Utility • English (en_US)</div>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block">Header Media</span>
                      <div className="text-sm font-semibold text-blue-400 mt-1">Document (PDF Receipt)</div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Exact Body Text to Paste in Meta:</span>
                      <button
                        onClick={() => handleCopy('Dear {{1}}, we have received your water bill payment of Rs. {{2}}. Your remaining balance is Rs. {{3}}. Attached is your official digital payment receipt. Thank you!', 'receipt_body')}
                        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium"
                      >
                        {copiedKey === 'receipt_body' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedKey === 'receipt_body' ? 'Copied Body Text!' : 'Copy Body Text'}
                      </button>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-900 border border-white/10 font-mono text-xs text-slate-200 whitespace-pre-wrap leading-relaxed select-all">
                      Dear {'{{1}}'}, we have received your water bill payment of Rs. {'{{2}}'}. Your remaining balance is Rs. {'{{3}}'}. Attached is your official digital payment receipt. Thank you!
                    </div>
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-2">How Our App Populates Meta Parameters:</span>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-white/5">
                        <span className="font-mono text-blue-400 font-bold block">{'{{1}}'}</span>
                        <span className="text-white font-medium block">Citizen Name</span>
                        <span className="text-[10px] text-slate-400">e.g. Gurpreet Singh</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-white/5">
                        <span className="font-mono text-blue-400 font-bold block">{'{{2}}'}</span>
                        <span className="text-white font-medium block">Payment Amount Paid</span>
                        <span className="text-[10px] text-slate-400">e.g. 200</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-white/5">
                        <span className="font-mono text-blue-400 font-bold block">{'{{3}}'}</span>
                        <span className="text-white font-medium block">Updated Remaining Balance</span>
                        <span className="text-[10px] text-slate-400">e.g. 0</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeGuideTab === 'overdue' && (
                <div className="p-5 rounded-2xl neu-pressed bg-slate-950/50 border border-white/5 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4 border-b border-white/5">
                    <div>
                      <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block">Template Name in Meta</span>
                      <div className="flex items-center gap-2 mt-1">
                        <code className="text-sm font-mono text-emerald-400 font-bold">overdue</code>
                        <button onClick={() => handleCopy('overdue', 'overdue_name')} className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white">
                          {copiedKey === 'overdue_name' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block">Category & Language</span>
                      <div className="text-sm font-semibold text-white mt-1">Utility • English (en_US)</div>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block">Header Media</span>
                      <div className="text-sm font-semibold text-amber-400 mt-1">None or Text Header</div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Exact Body Text to Paste in Meta:</span>
                      <button
                        onClick={() => handleCopy('Dear {{1}}, reminder that your water bill of Rs. {{2}} is overdue. Late fee of Rs. {{3}} has been applied. Total payable: Rs. {{4}}. Please pay immediately to prevent service interruption.', 'overdue_body')}
                        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium"
                      >
                        {copiedKey === 'overdue_body' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedKey === 'overdue_body' ? 'Copied Body Text!' : 'Copy Body Text'}
                      </button>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-900 border border-white/10 font-mono text-xs text-slate-200 whitespace-pre-wrap leading-relaxed select-all">
                      Dear {'{{1}}'}, reminder that your water bill of Rs. {'{{2}}'} is overdue. Late fee of Rs. {'{{3}}'} has been applied. Total payable: Rs. {'{{4}}'}. Please pay immediately to prevent service interruption.
                    </div>
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-2">How Our App Populates Meta Parameters:</span>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-white/5">
                        <span className="font-mono text-blue-400 font-bold block">{'{{1}}'}</span>
                        <span className="text-white font-medium block">Citizen Name</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-white/5">
                        <span className="font-mono text-blue-400 font-bold block">{'{{2}}'}</span>
                        <span className="text-white font-medium block">Original Bill Balance</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-white/5">
                        <span className="font-mono text-blue-400 font-bold block">{'{{3}}'}</span>
                        <span className="text-white font-medium block">Late Fee Surcharge</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-white/5">
                        <span className="font-mono text-blue-400 font-bold block">{'{{4}}'}</span>
                        <span className="text-white font-medium block">Total Overdue Payable</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeGuideTab === 'welcome' && (
                <div className="p-5 rounded-2xl neu-pressed bg-slate-950/50 border border-white/5 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4 border-b border-white/5">
                    <div>
                      <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block">Template Name in Meta</span>
                      <div className="flex items-center gap-2 mt-1">
                        <code className="text-sm font-mono text-emerald-400 font-bold">welcome</code>
                        <button onClick={() => handleCopy('welcome', 'welcome_name')} className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white">
                          {copiedKey === 'welcome_name' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block">Category & Language</span>
                      <div className="text-sm font-semibold text-white mt-1">Utility • English (en_US)</div>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block">Header Media</span>
                      <div className="text-sm font-semibold text-purple-400 mt-1">None</div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Exact Body Text to Paste in Meta:</span>
                      <button
                        onClick={() => handleCopy('Namaste {{1}}! Welcome to the Gram Panchayat Smart Water Supply system. Your consumer account {{2}} has been successfully registered. You will receive billing statements and receipts here.', 'welcome_body')}
                        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium"
                      >
                        {copiedKey === 'welcome_body' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedKey === 'welcome_body' ? 'Copied Body Text!' : 'Copy Body Text'}
                      </button>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-900 border border-white/10 font-mono text-xs text-slate-200 whitespace-pre-wrap leading-relaxed select-all">
                      Namaste {'{{1}}'}! Welcome to the Gram Panchayat Smart Water Supply system. Your consumer account {'{{2}}'} has been successfully registered. You will receive billing statements and receipts here.
                    </div>
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-2">How Our App Populates Meta Parameters:</span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-white/5">
                        <span className="font-mono text-blue-400 font-bold block">{'{{1}}'}</span>
                        <span className="text-white font-medium block">Citizen Name</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-white/5">
                        <span className="font-mono text-blue-400 font-bold block">{'{{2}}'}</span>
                        <span className="text-white font-medium block">Consumer Account ID (e.g. CUST-012)</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeGuideTab === 'broadcast' && (
                <div className="p-5 rounded-2xl neu-pressed bg-slate-950/50 border border-white/5 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4 border-b border-white/5">
                    <div>
                      <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block">Template Name in Meta</span>
                      <div className="flex items-center gap-2 mt-1">
                        <code className="text-sm font-mono text-emerald-400 font-bold">broadcast</code>
                        <button onClick={() => handleCopy('broadcast', 'broadcast_name')} className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white">
                          {copiedKey === 'broadcast_name' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block">Category & Language</span>
                      <div className="text-sm font-semibold text-white mt-1">Utility / Marketing • English (en_US)</div>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block">Header Media</span>
                      <div className="text-sm font-semibold text-cyan-400 mt-1">None or Text</div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Exact Body Text to Paste in Meta:</span>
                      <button
                        onClick={() => handleCopy('Dear {{1}}, important notice from Gram Panchayat Water Department: {{2}}. For emergency assistance, please contact the Panchayat Office.', 'broadcast_body')}
                        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium"
                      >
                        {copiedKey === 'broadcast_body' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedKey === 'broadcast_body' ? 'Copied Body Text!' : 'Copy Body Text'}
                      </button>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-900 border border-white/10 font-mono text-xs text-slate-200 whitespace-pre-wrap leading-relaxed select-all">
                      Dear {'{{1}}'}, important notice from Gram Panchayat Water Department: {'{{2}}'}. For emergency assistance, please contact the Panchayat Office.
                    </div>
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-2">How Our App Populates Meta Parameters:</span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-white/5">
                        <span className="font-mono text-blue-400 font-bold block">{'{{1}}'}</span>
                        <span className="text-white font-medium block">Citizen Name</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-white/5">
                        <span className="font-mono text-blue-400 font-bold block">{'{{2}}'}</span>
                        <span className="text-white font-medium block">Announcement Text / Message Content</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {activeGuideTab === 'suspension' && (
                <div className="p-5 rounded-2xl neu-pressed bg-slate-950/50 border border-white/5 space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pb-4 border-b border-white/5">
                    <div>
                      <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block">Template Name in Meta</span>
                      <div className="flex items-center gap-2 mt-1">
                        <code className="text-sm font-mono text-rose-400 font-bold">suspension</code>
                        <button onClick={() => handleCopy('suspension', 'suspension_name')} className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white">
                          {copiedKey === 'suspension_name' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block">Category & Language</span>
                      <div className="text-sm font-semibold text-white mt-1">Utility • English (en_US)</div>
                    </div>
                    <div>
                      <span className="text-[11px] text-slate-400 uppercase tracking-wider font-semibold block">Header Media</span>
                      <div className="text-sm font-semibold text-rose-400 mt-1">None or Warning Text</div>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Exact Body Text to Paste in Meta:</span>
                      <button
                        onClick={() => handleCopy('FINAL NOTICE: Dear {{1}}, your water connection for Account ID {{2}} has an outstanding overdue balance of Rs. {{3}}. Water supply will be disconnected if not paid within 48 hours.', 'suspension_body')}
                        className="text-xs text-blue-400 hover:text-blue-300 flex items-center gap-1 font-medium"
                      >
                        {copiedKey === 'suspension_body' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                        {copiedKey === 'suspension_body' ? 'Copied Body Text!' : 'Copy Body Text'}
                      </button>
                    </div>
                    <div className="p-3.5 rounded-xl bg-slate-900 border border-white/10 font-mono text-xs text-slate-200 whitespace-pre-wrap leading-relaxed select-all">
                      FINAL NOTICE: Dear {'{{1}}'}, your water connection for Account ID {'{{2}}'} has an outstanding overdue balance of Rs. {'{{3}}'}. Water supply will be disconnected if not paid within 48 hours.
                    </div>
                  </div>

                  <div>
                    <span className="text-xs font-semibold text-slate-300 uppercase tracking-wider block mb-2">How Our App Populates Meta Parameters:</span>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-white/5">
                        <span className="font-mono text-blue-400 font-bold block">{'{{1}}'}</span>
                        <span className="text-white font-medium block">Citizen Name</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-white/5">
                        <span className="font-mono text-blue-400 font-bold block">{'{{2}}'}</span>
                        <span className="text-white font-medium block">Consumer ID</span>
                      </div>
                      <div className="p-2.5 rounded-xl bg-slate-900 border border-white/5">
                        <span className="font-mono text-blue-400 font-bold block">{'{{3}}'}</span>
                        <span className="text-white font-medium block">Overdue Balance Amount</span>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Bottom Quick-Sync Callout */}
              <div className="pt-3 border-t border-white/10 flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-400">
                <span className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  Once approved in Meta, click <strong>Sync Official Presets</strong> above to instantly enable all 6 templates in this app!
                </span>
                <button
                  onClick={() => setShowMetaGuide(false)}
                  className="px-3 py-1.5 rounded-xl neu-flat hover:neu-pressed text-slate-300 hover:text-white"
                >
                  Collapse Guide
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Quick Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="p-5 rounded-2xl neu-flat space-y-1">
          <span className="text-xs neu-text-muted uppercase tracking-wider font-semibold">Total Templates</span>
          <div className="text-2xl font-black text-white flex items-center gap-2">
            <Layers className="w-5 h-5 text-blue-400" />
            {templates.length}
          </div>
          <p className="text-[11px] text-slate-400">Stored in Firestore collection</p>
        </div>

        <div className="p-5 rounded-2xl neu-flat space-y-1">
          <span className="text-xs neu-text-muted uppercase tracking-wider font-semibold">Active In Engine</span>
          <div className="text-2xl font-black text-emerald-400 flex items-center gap-2">
            <CheckCircle2 className="w-5 h-5 text-emerald-400" />
            {templates.filter(t => t.isActive).length}
          </div>
          <p className="text-[11px] text-slate-400">Ready for automated dispatch</p>
        </div>

        <div className="p-5 rounded-2xl neu-flat space-y-1">
          <span className="text-xs neu-text-muted uppercase tracking-wider font-semibold">Categories Covered</span>
          <div className="text-2xl font-black text-indigo-400 flex items-center gap-2">
            <Sliders className="w-5 h-5 text-indigo-400" />
            {new Set(templates.map(t => t.category)).size} / 7
          </div>
          <p className="text-[11px] text-slate-400">Billing, Receipts, Alerts, etc.</p>
        </div>

        <div className="p-5 rounded-2xl neu-flat space-y-1">
          <span className="text-xs neu-text-muted uppercase tracking-wider font-semibold">Meta API Config</span>
          <div className="text-sm font-bold text-white flex items-center gap-2">
            {settings?.metaWhatsAppPhoneNumberId ? (
              <span className="text-emerald-400 flex items-center gap-1.5">
                <Check className="w-4 h-4" /> Phone ID Connected
              </span>
            ) : (
              <span className="text-amber-400 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4" /> Setup in Settings
              </span>
            )}
          </div>
          <p className="text-[11px] text-slate-400">
            {settings?.metaWhatsAppPhoneNumberId ? `ID: ${settings.metaWhatsAppPhoneNumberId}` : 'Credentials needed for live delivery'}
          </p>
        </div>
      </div>


      {/* Filter Tabs & Search Bar */}
      <div className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          {/* Category Tabs */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0 scrollbar-none">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-4 py-2 rounded-2xl text-xs font-semibold transition-all whitespace-nowrap ${
                selectedCategory === 'all'
                  ? 'neu-pressed text-blue-400 border border-blue-500/30'
                  : 'neu-flat hover:neu-pressed text-slate-400 hover:text-white'
              }`}
            >
              All Categories ({templates.length})
            </button>
            {Object.entries(CATEGORY_META).map(([catKey, meta]) => {
              const count = templates.filter(t => t.category === catKey).length;
              const Icon = meta.icon;
              return (
                <button
                  key={catKey}
                  onClick={() => setSelectedCategory(catKey)}
                  className={`px-4 py-2 rounded-2xl text-xs font-semibold flex items-center gap-2 transition-all whitespace-nowrap ${
                    selectedCategory === catKey
                      ? 'neu-pressed text-blue-400 border border-blue-500/30'
                      : 'neu-flat hover:neu-pressed text-slate-400 hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {meta.label} ({count})
                </button>
              );
            })}
          </div>

          {/* Search Box */}
          <div className="relative min-w-[240px]">
            <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="Search templates or variables..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-2xl neu-pressed bg-transparent text-xs text-white placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500/50"
            />
          </div>
        </div>
      </div>

      {/* Templates List / Grid */}
      {isLoading ? (
        <div className="p-16 rounded-3xl neu-flat flex flex-col items-center justify-center space-y-4">
          <RefreshCw className="w-8 h-8 text-blue-400 animate-spin" />
          <p className="text-sm neu-text-muted">Loading WhatsApp templates from Firestore...</p>
        </div>
      ) : filteredTemplates.length === 0 ? (
        <div className="p-16 rounded-3xl neu-flat text-center space-y-4 flex flex-col items-center">
          <div className="w-16 h-16 rounded-3xl neu-pressed flex items-center justify-center text-slate-400">
            <Sliders className="w-8 h-8" />
          </div>
          <h3 className="text-lg font-bold text-white">No Templates Found</h3>
          <p className="text-xs neu-text-muted max-w-md">
            {searchQuery 
              ? `No templates match "${searchQuery}". Try clearing your search.`
              : 'You have not configured any templates for this category yet. Click below to populate official presets.'}
          </p>
          <div className="flex items-center gap-3 pt-2">
            <button
              onClick={handleSyncPresets}
              className="px-5 py-2.5 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-blue-500/20"
            >
              <Sparkles className="w-4 h-4" />
              Populate Default Templates
            </button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredTemplates.map((template, index) => {
            const catMeta = CATEGORY_META[template.category] || CATEGORY_META.custom;
            const CatIcon = catMeta.icon;
            const paramList = (template.parameters || '').split(',').map(s => s.trim()).filter(Boolean);

            return (
              <motion.div
                key={`${template.id || template.templateName}-${index}`}
                layout
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className={`p-6 rounded-3xl neu-flat flex flex-col justify-between space-y-5 transition-all border ${
                  template.isDefault 
                    ? 'border-blue-500/40 shadow-blue-500/5' 
                    : 'border-white/5 hover:border-white/10'
                }`}
              >
                <div className="space-y-4">
                  {/* Top Badges */}
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`px-2.5 py-1 text-[11px] font-semibold rounded-xl border flex items-center gap-1.5 ${catMeta.color}`}>
                        <CatIcon className="w-3.5 h-3.5" />
                        {catMeta.label}
                      </span>
                      {template.isDefault && (
                        <span className="px-2.5 py-1 text-[11px] font-semibold rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-400 flex items-center gap-1">
                          <Star className="w-3 h-3 fill-amber-400" />
                          Default Active
                        </span>
                      )}
                      <span className="px-2 py-0.5 text-[10px] font-mono rounded-lg bg-slate-800 text-slate-300 border border-white/5">
                        {template.language || 'en_US'}
                      </span>
                    </div>

                    {/* Active Switch */}
                    <button
                      onClick={() => handleToggleActive(template)}
                      className={`text-xs font-semibold px-2.5 py-1 rounded-xl transition-all flex items-center gap-1.5 ${
                        template.isActive 
                          ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                          : 'bg-slate-800 text-slate-500 border border-white/5'
                      }`}
                      title={template.isActive ? "Active in automation" : "Inactive / Skipped"}
                    >
                      <span className={`w-1.5 h-1.5 rounded-full ${template.isActive ? 'bg-emerald-400 animate-pulse' : 'bg-slate-600'}`} />
                      {template.isActive ? 'Active' : 'Disabled'}
                    </button>
                  </div>

                  {/* Template Title & Code */}
                  <div>
                    <h3 className="text-base font-bold text-white tracking-tight flex items-center gap-2 font-mono">
                      {template.templateName}
                    </h3>
                    {template.description && (
                      <p className="text-xs neu-text-muted mt-1 line-clamp-2">
                        {template.description}
                      </p>
                    )}
                  </div>

                  {/* Simulated WhatsApp Bubble Preview */}
                  <div className="p-3.5 rounded-2xl bg-emerald-950/20 border border-emerald-500/20 space-y-2">
                    <div className="flex items-center justify-between text-[11px] text-emerald-400/80 font-medium pb-1 border-b border-emerald-500/10">
                      <span className="flex items-center gap-1.5">
                        <Smartphone className="w-3.5 h-3.5" />
                        WhatsApp Mockup
                      </span>
                      <span className="text-[10px] opacity-70">
                        {template.headerType === 'DOCUMENT' ? '📎 PDF Attachment' : template.headerType === 'TEXT' ? '🔤 Text Header' : '💬 Standard'}
                      </span>
                    </div>

                    {template.headerText && (
                      <p className="text-xs font-bold text-white">
                        {template.headerText}
                      </p>
                    )}

                    <p className="text-xs text-emerald-100/90 leading-relaxed font-sans whitespace-pre-wrap">
                      {renderPreviewText(template)}
                    </p>

                    {template.supportsButton && (
                      <div className="pt-1.5 border-t border-emerald-500/10">
                        <div className="py-1 px-3 rounded-xl bg-emerald-500/20 text-emerald-300 text-[11px] font-semibold text-center flex items-center justify-center gap-1.5">
                          {template.buttonText || 'Open Portal'}
                          <ArrowRight className="w-3 h-3" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Parameter Mappings Pills */}
                  <div className="space-y-1.5">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      <Code2 className="w-3 h-3 text-blue-400" />
                      Dynamic Parameters ({paramList.length})
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {paramList.map((paramKey, idx) => {
                        const foundVar = SYSTEM_TEMPLATE_VARIABLES.find(v => v.key.toLowerCase() === paramKey.toLowerCase());
                        return (
                          <span
                            key={idx}
                            className="px-2 py-0.5 rounded-lg bg-blue-500/10 border border-blue-500/20 text-[11px] text-blue-300 font-mono"
                            title={foundVar?.description || paramKey}
                          >
                            <span className="opacity-60">{'{{' + (idx + 1) + '}}'}</span> {paramKey}
                          </span>
                        );
                      })}
                      {paramList.length === 0 && (
                        <span className="text-[11px] text-slate-500 italic">No variables required (Static template)</span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="pt-4 border-t border-white/5 flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {template.category === 'broadcast' && template.isDefault ? (
                      <span className="px-2.5 py-1 rounded-xl bg-purple-500/20 text-purple-300 text-[11px] font-semibold flex items-center gap-1 border border-purple-500/30" title="Active Default Broadcast Template">
                        <Megaphone className="w-3 h-3 text-purple-400" />
                        Active Broadcast
                      </span>
                    ) : (
                      <button
                        onClick={() => handleSetAsBroadcast(template)}
                        className="px-2.5 py-1 rounded-xl neu-flat hover:neu-pressed text-purple-400 hover:text-purple-300 transition-all text-[11px] font-medium flex items-center gap-1 border border-purple-500/20"
                        title="Set this template as the active template for automated and manual broadcasts"
                      >
                        <Megaphone className="w-3 h-3" />
                        Use for Broadcast
                      </button>
                    )}
                    {!template.isDefault && template.category !== 'broadcast' && (
                      <button
                        onClick={() => handleSetDefault(template)}
                        className="p-2 rounded-xl neu-flat hover:neu-pressed text-amber-400/80 hover:text-amber-300 transition-all text-xs flex items-center gap-1"
                        title="Set as Default template for this category"
                      >
                        <Star className="w-4 h-4" />
                      </button>
                    )}
                    <button
                      onClick={() => {
                        setTestTargetTemplate(template);
                        setTestPhoneNumber('');
                        setTestFeedback(null);
                        setIsTestModalOpen(true);
                      }}
                      className="px-3 py-1.5 rounded-xl neu-flat hover:neu-pressed text-slate-300 hover:text-white transition-all text-xs flex items-center gap-1.5"
                      title="Send test message to your phone"
                    >
                      <Send className="w-3.5 h-3.5 text-blue-400" />
                      Test
                    </button>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => handleOpenEditor(template)}
                      className="p-2 rounded-xl neu-flat hover:neu-pressed text-slate-300 hover:text-white transition-all"
                      title="Edit template & parameter mapping"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => setDeleteId(template.id)}
                      className="p-2 rounded-xl neu-flat hover:neu-pressed text-rose-400/70 hover:text-rose-400 transition-all"
                      title="Delete template"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>
      )}

      {/* Template Editor Modal */}
      <AnimatePresence>
        {isEditorOpen && editingTemplate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="my-8 w-full max-w-4xl p-6 md:p-8 rounded-3xl neu-flat bg-slate-900 border border-white/10 shadow-2xl space-y-6 max-h-[90vh] overflow-y-auto scrollbar-thin"
            >
              {/* Modal Header */}
              <div className="flex items-start justify-between pb-4 border-b border-white/10">
                <div>
                  <h2 className="text-xl font-bold text-white flex items-center gap-2">
                    <Edit2 className="w-5 h-5 text-blue-400" />
                    {editingTemplate.id ? 'Edit WhatsApp Template' : 'Create WhatsApp Template'}
                  </h2>
                  <p className="text-xs neu-text-muted mt-1">
                    Configure the template name registered in Meta WhatsApp Manager and map variables to system data.
                  </p>
                </div>
                <button
                  onClick={() => setIsEditorOpen(false)}
                  className="p-2 rounded-xl neu-flat hover:neu-pressed text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Quick Presets Loader */}
              <div className="p-4 rounded-2xl neu-pressed bg-slate-950/40 border border-white/5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    Load Ready-To-Use Official Preset
                  </span>
                  <span className="text-[11px] text-slate-500">Auto-fills body & parameter bindings</span>
                </div>
                <div className="flex flex-wrap gap-2 pt-1">
                  {Object.entries(CATEGORY_META).map(([catKey, meta]) => (
                    <button
                      key={catKey}
                      type="button"
                      onClick={() => handleApplyPreset(catKey)}
                      className="px-3 py-1.5 rounded-xl neu-flat hover:neu-pressed text-xs text-slate-300 hover:text-white transition-all flex items-center gap-1.5"
                    >
                      <meta.icon className="w-3 h-3 text-blue-400" />
                      {meta.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Form Layout: 2 Columns */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Left Column: Form Controls */}
                <div className="space-y-4">
                  {/* Template Meta Identifier */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                      Meta Template Name <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. water_bill_invoice_2026"
                      value={editingTemplate.templateName || ''}
                      onChange={(e) => setEditingTemplate({ ...editingTemplate, templateName: e.target.value })}
                      className="w-full px-4 py-2.5 rounded-2xl neu-pressed bg-transparent text-sm text-white font-mono placeholder-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                    />
                    <p className="text-[11px] text-slate-500 mt-1">
                      Must match the approved template identifier in your Meta WhatsApp Business Manager (lowercase letters and underscores).
                    </p>
                  </div>

                  {/* Category & Language */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                        Category
                      </label>
                      <select
                        value={editingTemplate.category || 'billing'}
                        onChange={(e) => setEditingTemplate({ ...editingTemplate, category: e.target.value as any })}
                        className="w-full px-3 py-2.5 rounded-2xl neu-pressed bg-slate-900 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        {Object.entries(CATEGORY_META).map(([catKey, meta]) => (
                          <option key={catKey} value={catKey}>
                            {meta.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                        Language Code
                      </label>
                      <select
                        value={editingTemplate.language || 'en_US'}
                        onChange={(e) => setEditingTemplate({ ...editingTemplate, language: e.target.value })}
                        className="w-full px-3 py-2.5 rounded-2xl neu-pressed bg-slate-900 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="en_US">English (US) [en_US]</option>
                        <option value="en">English [en]</option>
                        <option value="hi">Hindi (हिन्दी) [hi]</option>
                        <option value="pa">Punjabi (ਪੰਜਾਬੀ) [pa]</option>
                      </select>
                    </div>
                  </div>

                  {/* Header Type */}
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                        Header Format
                      </label>
                      <select
                        value={editingTemplate.headerType || 'NONE'}
                        onChange={(e) => setEditingTemplate({ ...editingTemplate, headerType: e.target.value as any })}
                        className="w-full px-3 py-2.5 rounded-2xl neu-pressed bg-slate-900 text-xs text-white focus:outline-none focus:ring-1 focus:ring-blue-500"
                      >
                        <option value="NONE">None (No Header)</option>
                        <option value="DOCUMENT">Document (Official PDF Bill/Receipt)</option>
                        <option value="TEXT">Text Header</option>
                        <option value="IMAGE">Image Header</option>
                      </select>
                    </div>

                    {editingTemplate.headerType === 'TEXT' && (
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                          Header Text
                        </label>
                        <input
                          type="text"
                          placeholder="e.g. Water Bill Notice"
                          value={editingTemplate.headerText || ''}
                          onChange={(e) => setEditingTemplate({ ...editingTemplate, headerText: e.target.value })}
                          className="w-full px-3 py-2 rounded-2xl neu-pressed bg-transparent text-xs text-white focus:outline-none"
                        />
                      </div>
                    )}
                  </div>

                  {/* Body Text */}
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                        Template Body Text <span className="text-rose-400">*</span>
                      </label>
                      <span className="text-[11px] text-blue-400 font-mono">
                        Use {'{{1}}'}, {'{{2}}'} for variables
                      </span>
                    </div>
                    <textarea
                      rows={5}
                      placeholder="Dear {{1}}, your water bill for Rs. {{2}} has been generated. Total balance is Rs. {{3}} payable by {{4}}."
                      value={editingTemplate.bodyText || ''}
                      onChange={(e) => setEditingTemplate({ ...editingTemplate, bodyText: e.target.value })}
                      className="w-full p-4 rounded-2xl neu-pressed bg-transparent text-xs text-white leading-relaxed focus:outline-none focus:ring-1 focus:ring-blue-500 font-sans"
                    />
                  </div>

                  {/* Dynamic Action Button */}
                  <div className="p-4 rounded-2xl neu-pressed space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-300 flex items-center gap-2">
                        <Smartphone className="w-4 h-4 text-blue-400" />
                        Dynamic URL / Citizen Portal Button
                      </label>
                      <input
                        type="checkbox"
                        checked={editingTemplate.supportsButton ?? true}
                        onChange={(e) => setEditingTemplate({ ...editingTemplate, supportsButton: e.target.checked })}
                        className="rounded accent-blue-500 w-4 h-4 cursor-pointer"
                      />
                    </div>

                    {editingTemplate.supportsButton && (
                      <div className="grid grid-cols-2 gap-3 pt-2">
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Button Text</label>
                          <input
                            type="text"
                            value={editingTemplate.buttonText || ''}
                            onChange={(e) => setEditingTemplate({ ...editingTemplate, buttonText: e.target.value })}
                            placeholder="View & Pay Invoice"
                            className="w-full px-3 py-1.5 rounded-xl neu-flat bg-transparent text-xs text-white focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">Dynamic URL Parameter</label>
                          <select
                            value={editingTemplate.buttonParamKey || 'button_param'}
                            onChange={(e) => setEditingTemplate({ ...editingTemplate, buttonParamKey: e.target.value })}
                            className="w-full px-3 py-1.5 rounded-xl neu-flat bg-slate-900 text-xs text-white focus:outline-none"
                          >
                            <option value="button_param">button_param (Account Suffix)</option>
                            <option value="customer_id">customer_id (Consumer Account ID)</option>
                            <option value="portal_link">portal_link (Full Portal Link)</option>
                          </select>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column: Interactive Parameter Mapping & Live Phone Mockup */}
                <div className="space-y-6 flex flex-col justify-between">
                  {/* Variable Mappings Section */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Sliders className="w-3.5 h-3.5 text-blue-400" />
                        Parameter Mapping (Engine Bindings)
                      </label>
                      <button
                        type="button"
                        onClick={handleAddParameter}
                        className="px-2.5 py-1 rounded-xl neu-flat hover:neu-pressed text-[11px] text-blue-400 font-semibold flex items-center gap-1"
                      >
                        <Plus className="w-3 h-3" />
                        Add Variable
                      </button>
                    </div>

                    <div className="space-y-2 max-h-56 overflow-y-auto pr-1 scrollbar-thin">
                      {(editingTemplate.parameterMappings || []).map((mapping, idx) => (
                        <div key={idx} className="p-2.5 rounded-xl neu-pressed flex items-center gap-2">
                          <span className="w-12 text-center py-1 rounded-lg bg-blue-500/20 text-blue-300 font-mono text-xs font-bold">
                            {`{{${idx + 1}}}`}
                          </span>
                          <span className="text-slate-500 text-xs">→</span>
                          <select
                            value={mapping.key}
                            onChange={(e) => handleUpdateParameterMapping(idx, e.target.value)}
                            className="flex-1 px-3 py-1.5 rounded-xl neu-flat bg-slate-900 text-xs text-white focus:outline-none"
                          >
                            {SYSTEM_TEMPLATE_VARIABLES.map(v => (
                              <option key={v.key} value={v.key}>
                                {v.label} ({v.key})
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => handleRemoveParameter(idx)}
                            className="p-1.5 text-slate-500 hover:text-rose-400 transition-colors"
                            title="Remove parameter"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                      {(editingTemplate.parameterMappings || []).length === 0 && (
                        <div className="p-4 rounded-xl neu-pressed text-center text-xs text-slate-500">
                          No variables configured. Click "+ Add Variable" or load a preset above.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Live Smartphone WhatsApp Preview */}
                  <div className="p-5 rounded-3xl neu-pressed bg-slate-950/80 border border-emerald-500/20 space-y-3">
                    <div className="flex items-center justify-between text-xs font-semibold text-emerald-400">
                      <span className="flex items-center gap-1.5">
                        <Smartphone className="w-4 h-4" />
                        Live Smartphone Simulation
                      </span>
                      <span className="text-[10px] text-slate-400 uppercase tracking-wider">Substituted View</span>
                    </div>

                    <div className="p-4 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 space-y-2.5 shadow-inner">
                      {editingTemplate.headerType === 'DOCUMENT' && (
                        <div className="p-2.5 rounded-xl bg-slate-900/80 border border-white/10 flex items-center gap-2.5 text-xs text-slate-300">
                          <FileText className="w-5 h-5 text-rose-400" />
                          <div className="flex-1 overflow-hidden">
                            <p className="font-semibold truncate">Water_Invoice_Malook_Singh.pdf</p>
                            <p className="text-[10px] text-slate-500">142 KB • PDF Document</p>
                          </div>
                        </div>
                      )}

                      {editingTemplate.headerType === 'TEXT' && editingTemplate.headerText && (
                        <p className="text-sm font-bold text-white">
                          {editingTemplate.headerText}
                        </p>
                      )}

                      <p className="text-xs text-emerald-100 font-sans leading-relaxed whitespace-pre-wrap">
                        {renderPreviewText(editingTemplate)}
                      </p>

                      <div className="text-right text-[10px] text-emerald-400/60 flex items-center justify-end gap-1">
                        <span>10:45 AM</span>
                        <Check className="w-3 h-3 text-emerald-400" />
                      </div>

                      {editingTemplate.supportsButton && (
                        <div className="pt-2 border-t border-emerald-500/20">
                          <div className="py-2 px-4 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 text-xs font-semibold text-center flex items-center justify-center gap-2 transition-all">
                            {editingTemplate.buttonText || 'View & Pay Invoice'}
                            <ArrowRight className="w-3.5 h-3.5" />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              {/* Modal Actions */}
              <div className="pt-4 border-t border-white/10 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="px-5 py-2.5 rounded-2xl neu-flat hover:neu-pressed text-xs font-semibold text-slate-400 hover:text-white"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleSaveTemplate}
                  disabled={isSaving}
                  className="px-6 py-2.5 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-xs font-semibold flex items-center gap-2 shadow-lg shadow-blue-500/20 disabled:opacity-50"
                >
                  {isSaving ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      Saving to Firestore...
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" />
                      Save & Sync Template
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Test Send Modal */}
      <AnimatePresence>
        {isTestModalOpen && testTargetTemplate && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="w-full max-w-md p-6 rounded-3xl neu-flat bg-slate-900 border border-white/10 shadow-2xl space-y-5"
            >
              <div className="flex items-start justify-between pb-3 border-b border-white/10">
                <div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    <Send className="w-4 h-4 text-blue-400" />
                    Test Dispatch: {testTargetTemplate.templateName}
                  </h3>
                  <p className="text-xs neu-text-muted mt-0.5">
                    Send real WhatsApp message to verify Meta API acceptance.
                  </p>
                </div>
                <button onClick={() => setIsTestModalOpen(false)} className="text-slate-400 hover:text-white">
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                    Recipient Mobile Number (10 or 12 digits)
                  </label>
                  <input
                    type="tel"
                    placeholder="e.g. 919876543210 or 9876543210"
                    value={testPhoneNumber}
                    onChange={(e) => setTestPhoneNumber(e.target.value)}
                    className="w-full px-4 py-2.5 rounded-2xl neu-pressed bg-transparent text-sm text-white focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Include country code (e.g. 91 for India).
                  </p>
                </div>

                {testFeedback && (
                  <div className={`p-3 rounded-2xl text-xs font-medium ${
                    testFeedback.success 
                      ? 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-400' 
                      : 'bg-rose-500/10 border border-rose-500/30 text-rose-400'
                  }`}>
                    {testFeedback.message}
                  </div>
                )}
              </div>

              <div className="pt-2 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsTestModalOpen(false)}
                  className="px-4 py-2 rounded-2xl neu-flat hover:neu-pressed text-xs font-semibold text-slate-400"
                >
                  Close
                </button>
                <button
                  type="button"
                  onClick={handleExecuteTest}
                  disabled={isSendingTest || !testPhoneNumber.trim()}
                  className="px-5 py-2 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold flex items-center gap-2 disabled:opacity-50"
                >
                  {isSendingTest ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      Dispatch Test
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={!!deleteId}
        onClose={() => setDeleteId(null)}
        onConfirm={handleDeleteTemplate}
        title="Delete WhatsApp Template?"
        message="Are you sure you want to delete this template from Firestore? If active, the billing automation will fall back to default template presets."
        confirmText="Delete Template"
        cancelText="Cancel"
      />
    </div>
  );
}
