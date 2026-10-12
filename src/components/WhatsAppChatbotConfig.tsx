import React, { useState, useEffect, useMemo } from 'react';
import { 
  Lightbulb, 
  Tag, 
  Plus, 
  Trash2, 
  Copy, 
  Check, 
  RotateCcw, 
  Sparkles, 
  Eye, 
  Info, 
  List, 
  AlignLeft, 
  ArrowUp, 
  ArrowDown, 
  Save, 
  RefreshCw, 
  CheckCircle2,
  Code2,
  MessageSquare,
  Clock,
  Moon,
  Sun,
  Calendar,
  Globe,
  HelpCircle,
  MessageSquareCode,
  ShieldCheck
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { ChatbotSettings, saveChatbotSettings, BusinessHours, isOutsideBusinessHours } from '../lib/db';

interface WhatsAppChatbotConfigProps {
  settings: ChatbotSettings;
  onUpdate: (newSettings: ChatbotSettings) => void;
  ownerId?: string;
  isCompact?: boolean;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function WhatsAppChatbotConfig({
  settings,
  onUpdate,
  ownerId,
  isCompact = false
}: WhatsAppChatbotConfigProps) {
  // Input mode for Quick Tips: 'tags' (tag-based cards/chips) or 'multiline' (editable multi-line text)
  const [inputMode, setInputMode] = useState<'tags' | 'multiline'>('tags');
  const [newTipInput, setNewTipInput] = useState('');
  const [copiedPlaceholder, setCopiedPlaceholder] = useState<string | null>(null);
  const [showPreview, setShowPreview] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Normalize tips list from settings
  const tips: string[] = useMemo(() => {
    if (Array.isArray(settings?.quickTips) && settings.quickTips.length > 0) {
      return settings.quickTips.map(t => (t || '').trim()).filter(Boolean);
    }
    if (settings?.quickTip && settings.quickTip.trim()) {
      return [settings.quickTip.trim()];
    }
    return [];
  }, [settings?.quickTips, settings?.quickTip]);

  // Multiline textarea string representation
  const [multilineText, setMultilineText] = useState(tips.join('\n'));

  // Sync multiline state when tips array changes
  useEffect(() => {
    setMultilineText(tips.join('\n'));
  }, [tips]);

  // Normalize Business Hours object
  const currentBusinessHours: BusinessHours = useMemo(() => {
    return {
      enabled: settings?.autoReplyOutsideHours ?? settings?.businessHours?.enabled ?? false,
      startTime: settings?.businessHours?.startTime || '09:00',
      endTime: settings?.businessHours?.endTime || '17:00',
      days: Array.isArray(settings?.businessHours?.days) && settings.businessHours.days.length > 0
        ? settings.businessHours.days
        : ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
      timezone: settings?.businessHours?.timezone || 'Asia/Kolkata',
      offlineMessage: settings?.offlineMessage || settings?.businessHours?.offlineMessage || ''
    };
  }, [settings?.autoReplyOutsideHours, settings?.businessHours, settings?.offlineMessage]);

  // Calculate live outside business hours status right now
  const isCurrentlyOutsideHours = useMemo(() => {
    return isOutsideBusinessHours(currentBusinessHours);
  }, [currentBusinessHours]);

  const commitSettings = async (updated: Partial<ChatbotSettings>) => {
    const newSettings: ChatbotSettings = {
      ...settings,
      ...updated,
      hasInitialized: true
    };
    onUpdate(newSettings);
    setIsSaving(true);
    setSaveSuccess(false);
    try {
      await saveChatbotSettings(newSettings, ownerId);
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
    } catch (err) {
      console.error('Failed to save WhatsApp Chatbot settings:', err);
    } finally {
      setIsSaving(false);
    }
  };

  // Toggle Auto-Reply Outside Hours
  const handleToggleAutoReply = (enabled: boolean) => {
    const updatedBh: BusinessHours = {
      ...currentBusinessHours,
      enabled
    };
    commitSettings({
      autoReplyOutsideHours: enabled,
      businessHours: updatedBh
    });
  };

  // Update specific field in Business Hours
  const updateBusinessHours = (fields: Partial<BusinessHours>) => {
    const updatedBh: BusinessHours = {
      ...currentBusinessHours,
      ...fields
    };
    commitSettings({
      autoReplyOutsideHours: updatedBh.enabled,
      businessHours: updatedBh,
      ...(fields.offlineMessage !== undefined ? { offlineMessage: fields.offlineMessage } : {})
    });
  };

  // Toggle active day in business hours
  const handleToggleDay = (day: string) => {
    const currentDays = currentBusinessHours.days;
    let updatedDays: string[];
    if (currentDays.includes(day)) {
      if (currentDays.length === 1) return; // Keep at least one day
      updatedDays = currentDays.filter(d => d !== day);
    } else {
      updatedDays = [...currentDays, day];
    }
    updateBusinessHours({ days: updatedDays });
  };

  // Preset day selections
  const handleSetDayPreset = (preset: 'weekdays' | 'mon-sat' | 'all') => {
    let updatedDays: string[];
    if (preset === 'weekdays') updatedDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    else if (preset === 'mon-sat') updatedDays = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    else updatedDays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    updateBusinessHours({ days: updatedDays });
  };

  // Load standard Gram Panchayat default offline message
  const handleLoadDefaultOfflineNotice = () => {
    const defaultNotice = `Namaste {name}! 🙏 Our Gram Panchayat office is currently CLOSED.\n\n⏰ Business Operating Hours:\n• Operating Hours: {startTime} to {endTime}\n• Active Days: {days}\n\nYour message has been logged into our system and our official team will review it during office hours. For urgent water supply emergencies, please call the Helpline at 1800-123-4567.`;
    updateBusinessHours({
      enabled: true,
      offlineMessage: defaultNotice
    });
  };

  // Add tip via tag input
  const handleAddTip = () => {
    const trimmed = newTipInput.trim();
    if (!trimmed) return;
    const updatedTips = [...tips, trimmed];
    setNewTipInput('');
    commitSettings({
      quickTips: updatedTips,
      quickTip: updatedTips[0] || ''
    });
  };

  // Remove tip by index
  const handleRemoveTip = (indexToRemove: number) => {
    const updatedTips = tips.filter((_, i) => i !== indexToRemove);
    commitSettings({
      quickTips: updatedTips,
      quickTip: updatedTips[0] || ''
    });
  };

  // Reorder tip
  const handleMoveTip = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= tips.length) return;
    const updatedTips = [...tips];
    const temp = updatedTips[index];
    updatedTips[index] = updatedTips[targetIndex];
    updatedTips[targetIndex] = temp;
    commitSettings({
      quickTips: updatedTips,
      quickTip: updatedTips[0] || ''
    });
  };

  // Update tip text directly
  const handleEditTip = (index: number, newText: string) => {
    const updatedTips = [...tips];
    updatedTips[index] = newText;
    commitSettings({
      quickTips: updatedTips,
      quickTip: updatedTips[0] || ''
    });
  };

  // Handle multiline textarea change & blur
  const handleMultilineChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setMultilineText(e.target.value);
  };

  const handleMultilineBlur = () => {
    const parsed = multilineText
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean);
    commitSettings({
      quickTips: parsed,
      quickTip: parsed[0] || ''
    });
  };

  // Insert placeholder into greeting template
  const insertPlaceholder = (placeholder: string) => {
    const current = settings.welcomeMessage || '';
    const updated = current 
      ? `${current} ${placeholder}`
      : `Hello {name}! 🙏\n\nAvailable Services:\n{commands}\n\n${placeholder}`;
    commitSettings({ welcomeMessage: updated });
  };

  // Insert offline placeholder into offline message template
  const insertOfflinePlaceholder = (placeholder: string) => {
    const current = currentBusinessHours.offlineMessage || '';
    const updated = current 
      ? `${current} ${placeholder}`
      : `Namaste {name}! Our Gram Panchayat office is closed. Operating hours are {startTime} to {endTime} ({days}). ${placeholder}`;
    updateBusinessHours({ offlineMessage: updated });
  };

  // Copy placeholder tag to clipboard
  const handleCopyPlaceholder = (ph: string) => {
    navigator.clipboard.writeText(ph);
    setCopiedPlaceholder(ph);
    setTimeout(() => setCopiedPlaceholder(null), 2000);
  };

  // Generate rendered preview for standard greeting
  const renderedMessagePreview = useMemo(() => {
    const activeCmds = (settings?.commands || []).filter(c => c.isActive);
    const cmdListText = activeCmds
      .map(c => `🔹 *${c.triggerWord}* - ${c.buttonLabel}`)
      .join('\n') || '🔹 *Pay Bill*\n🔹 *Panchayat Reports*\n🔹 *Download My Bill*\n🔹 *Complaints*';

    const formattedQuickTip = tips.length === 1
      ? `💡 *Quick Tip:* ${tips[0]}`
      : tips.length > 1
      ? `💡 *Quick Tips:*\n` + tips.map(t => `• ${t}`).join('\n')
      : '';

    if (settings?.welcomeMessage && settings.welcomeMessage.trim()) {
      let templated = settings.welcomeMessage
        .replace(/\{\{?name\}\}?/gi, 'Ramesh Kumar')
        .replace(/\{\{?(commands|services)\}\}?/gi, cmdListText)
        .replace(/\{\{?(credit|advance)\}\}?/gi, '\n💰 *Your Account Credit:* Rs. 150 in Advance\n')
        .replace(/\{\{?balance\}\}?/gi, '200');

      tips.forEach((tipText, idx) => {
        const itemRegex = new RegExp(`\\{\\{?quick_?tip_?${idx + 1}\\}?\\}?`, 'gi');
        templated = templated.replace(itemRegex, `💡 *Tip:* ${tipText}`);
      });

      if (/\{\{?quick_?tips?\}\}?/i.test(templated)) {
        templated = templated.replace(/\{\{?quick_?tips?\}\}?/gi, formattedQuickTip ? `\n\n${formattedQuickTip}` : '');
      }

      return templated.trim();
    }

    let defaultMsg = `Hello Ramesh Kumar! 🙏 I am your Gram Panchayat Smart Billing Assistant.

Available Services (Reply with any command below):
${cmdListText}`;

    if (settings?.includeQuickTip && formattedQuickTip) {
      defaultMsg += `\n\n${formattedQuickTip}`;
    }
    return defaultMsg;
  }, [settings?.welcomeMessage, settings?.commands, settings?.includeQuickTip, tips]);

  // Generate rendered preview for offline auto-reply message
  const renderedOfflinePreview = useMemo(() => {
    const custName = 'Ramesh Kumar';
    const startTime = currentBusinessHours.startTime || '09:00';
    const endTime = currentBusinessHours.endTime || '17:00';
    const daysList = currentBusinessHours.days.length > 0 ? currentBusinessHours.days.join(', ') : 'Mon-Fri';
    const tz = currentBusinessHours.timezone || 'Asia/Kolkata';

    let template = currentBusinessHours.offlineMessage || '';
    if (!template.trim()) {
      template = `Namaste {name}! 🙏 Our Gram Panchayat office is currently CLOSED.\n\n⏰ Business Operating Hours:\n• Operating Hours: {startTime} to {endTime}\n• Active Days: {days}\n\nYour message has been logged into our system and our official team will review it during office hours. For urgent water supply emergencies, please call the Helpline at 1800-123-4567.`;
    }

    return template
      .replace(/\{\{?name\}\}?/gi, custName)
      .replace(/\{\{?startTime\}\}?/gi, startTime)
      .replace(/\{\{?endTime\}\}?/gi, endTime)
      .replace(/\{\{?days\}\}?/gi, daysList)
      .replace(/\{\{?timezone\}\}?/gi, tz);
  }, [currentBusinessHours]);

  const isQuickTipPlaceholderInTemplate = useMemo(() => {
    if (!settings?.welcomeMessage) return Boolean(settings?.includeQuickTip);
    return /\{\{?quick_?tips?\}\}?/i.test(settings.welcomeMessage) ||
      tips.some((_, idx) => new RegExp(`\\{\\{?quick_?tip_?${idx + 1}\\}?\\}?`, 'i').test(settings.welcomeMessage || ''));
  }, [settings?.welcomeMessage, settings?.includeQuickTip, tips]);

  return (
    <div className={`space-y-6 ${isCompact ? '' : 'neu-flat p-6 rounded-3xl'}`}>
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[var(--shadow-dark)] pb-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 neu-pressed rounded-2xl text-amber-500">
            <Lightbulb className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-black uppercase tracking-wider neu-text flex items-center gap-2">
              WhatsApp Greeting & Off-Hours Auto-Reply
              {isSaving && <RefreshCw className="w-3.5 h-3.5 animate-spin text-blue-600" />}
              {saveSuccess && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />}
            </h3>
            <p className="text-[10px] neu-text-muted font-bold mt-0.5">
              Configure greetings, dynamic quick tips, business hours schedules, and custom offline auto-replies.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            type="button"
            onClick={() => setShowPreview(!showPreview)}
            className="px-3 py-1.5 neu-pressed text-[10px] font-black uppercase tracking-widest text-blue-600 rounded-xl flex items-center gap-1.5 hover:text-blue-700 transition-colors"
          >
            <Eye className="w-3.5 h-3.5" />
            {showPreview ? "Hide Preview" : "Show Preview"}
          </button>
        </div>
      </div>

      {/* Auto-Reply Outside Business Hours Card */}
      <div className="neu-pressed p-5 rounded-2xl space-y-4 border border-indigo-500/20 bg-indigo-500/5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-indigo-500/10 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-600/10 text-indigo-600 dark:text-indigo-400 rounded-xl">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <h4 className="text-xs font-black uppercase tracking-wider text-indigo-900 dark:text-indigo-200 flex items-center gap-2">
                Off-Hours Auto-Reply & Business Schedule
                {currentBusinessHours.enabled && (
                  <span className="text-[8px] font-black uppercase px-2 py-0.5 bg-indigo-600 text-white rounded-full">
                    Active
                  </span>
                )}
              </h4>
              <p className="text-[9px] font-bold neu-text-muted">
                Automatically reply to customer messages sent outside defined working hours with a custom offline notice.
              </p>
            </div>
          </div>

          {/* Master Enable Switch */}
          <label className="relative inline-flex items-center cursor-pointer shrink-0 self-start sm:self-auto">
            <input
              type="checkbox"
              checked={currentBusinessHours.enabled}
              onChange={(e) => handleToggleAutoReply(e.target.checked)}
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-neutral-300 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600" />
            <span className="ml-2 text-[10px] font-black uppercase text-indigo-900 dark:text-indigo-200">
              {currentBusinessHours.enabled ? "Enabled" : "Disabled"}
            </span>
          </label>
        </div>

        {/* When Auto-Reply Enabled: Render Schedule Controls */}
        {currentBusinessHours.enabled && (
          <div className="space-y-4 pt-1">
            {/* Live Real-Time Status Indicator */}
            <div className={`p-3 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-all ${
              isCurrentlyOutsideHours 
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-900 dark:text-amber-200' 
                : 'bg-emerald-500/10 border-emerald-500/30 text-emerald-900 dark:text-emerald-200'
            }`}>
              <div className="flex items-center gap-2">
                {isCurrentlyOutsideHours ? (
                  <Moon className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0" />
                ) : (
                  <Sun className="w-4 h-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                )}
                <div>
                  <span className="text-[10px] font-black uppercase tracking-wider flex items-center gap-1.5">
                    {isCurrentlyOutsideHours ? "🌙 Currently CLOSED (Auto-Reply Active)" : "🟢 Currently OPEN (Standard Bot Active)"}
                  </span>
                  <p className="text-[9px] font-medium opacity-80">
                    {isCurrentlyOutsideHours
                      ? "Messages received right now will automatically receive your custom offline auto-reply notice."
                      : "Messages received right now will be handled normally by your live commands & menu."}
                  </p>
                </div>
              </div>
              <span className="text-[9px] font-mono font-bold bg-white/50 dark:bg-black/30 px-2 py-1 rounded-lg border border-black/10 self-start sm:self-auto">
                Schedule: {currentBusinessHours.startTime} - {currentBusinessHours.endTime} ({currentBusinessHours.days.join(', ')})
              </span>
            </div>

            {/* Operating Hours & Timezone Inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[9px] font-black uppercase tracking-wider text-neutral-500 mb-1">
                  Opening Time (Start)
                </label>
                <input
                  type="time"
                  value={currentBusinessHours.startTime}
                  onChange={(e) => updateBusinessHours({ startTime: e.target.value })}
                  className="w-full px-3 py-2 neu-pressed rounded-xl text-xs font-mono font-bold neu-text bg-transparent outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>

              <div>
                <label className="block text-[9px] font-black uppercase tracking-wider text-neutral-500 mb-1">
                  Closing Time (End)
                </label>
                <input
                  type="time"
                  value={currentBusinessHours.endTime}
                  onChange={(e) => updateBusinessHours({ endTime: e.target.value })}
                  className="w-full px-3 py-2 neu-pressed rounded-xl text-xs font-mono font-bold neu-text bg-transparent outline-none focus:ring-2 focus:ring-indigo-500/30"
                />
              </div>

              <div>
                <label className="block text-[9px] font-black uppercase tracking-wider text-neutral-500 mb-1 flex items-center gap-1">
                  <Globe className="w-3 h-3 text-indigo-500" />
                  Timezone
                </label>
                <select
                  value={currentBusinessHours.timezone || 'Asia/Kolkata'}
                  onChange={(e) => updateBusinessHours({ timezone: e.target.value })}
                  className="w-full px-3 py-2 neu-pressed rounded-xl text-xs font-bold neu-text bg-transparent outline-none focus:ring-2 focus:ring-indigo-500/30"
                >
                  <option value="Asia/Kolkata">Asia/Kolkata (IST - India +5:30)</option>
                  <option value="Asia/Dubai">Asia/Dubai (GST +4:00)</option>
                  <option value="UTC">UTC (Universal Coordinated Time)</option>
                  <option value="America/New_York">America/New_York (EST/EDT)</option>
                  <option value="local">System Local Time</option>
                </select>
              </div>
            </div>

            {/* Operating Days Selector */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[9px] font-black uppercase tracking-wider text-neutral-500 flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-indigo-500" />
                  Operating Working Days
                </label>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleSetDayPreset('weekdays')}
                    className="px-2 py-0.5 neu-flat text-[8px] font-black uppercase tracking-wider text-indigo-600 rounded-lg hover:bg-indigo-500/10"
                  >
                    Mon - Fri
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetDayPreset('mon-sat')}
                    className="px-2 py-0.5 neu-flat text-[8px] font-black uppercase tracking-wider text-indigo-600 rounded-lg hover:bg-indigo-500/10"
                  >
                    Mon - Sat
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetDayPreset('all')}
                    className="px-2 py-0.5 neu-flat text-[8px] font-black uppercase tracking-wider text-indigo-600 rounded-lg hover:bg-indigo-500/10"
                  >
                    All 7 Days
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {WEEKDAYS.map((day) => {
                  const isActive = currentBusinessHours.days.includes(day);
                  return (
                    <button
                      key={day}
                      type="button"
                      onClick={() => handleToggleDay(day)}
                      className={`px-3 py-1.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1 ${
                        isActive
                          ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/30'
                          : 'neu-pressed text-neutral-400 hover:text-neutral-700'
                      }`}
                    >
                      {isActive && <Check className="w-3 h-3 text-white" />}
                      {day}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Custom Offline Message Editor */}
            <div className="space-y-2 pt-2 border-t border-indigo-500/10">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="text-[10px] font-black uppercase tracking-wider text-indigo-900 dark:text-indigo-200 flex items-center gap-1.5">
                  <MessageSquareCode className="w-3.5 h-3.5 text-indigo-600" />
                  Custom Offline Auto-Reply Message
                </label>
                <button
                  type="button"
                  onClick={handleLoadDefaultOfflineNotice}
                  className="px-2.5 py-1 bg-indigo-600/10 hover:bg-indigo-600/20 text-indigo-700 dark:text-indigo-300 text-[9px] font-black uppercase tracking-wider rounded-lg border border-indigo-500/20 transition-all flex items-center gap-1 self-start sm:self-auto"
                >
                  <Sparkles className="w-3 h-3 text-indigo-600" />
                  Load Panchayat Default Offline Notice
                </button>
              </div>

              {/* Offline Placeholders */}
              <div className="flex flex-wrap items-center gap-1">
                <span className="text-[8px] font-black uppercase tracking-wider text-neutral-400 mr-1">
                  Insert Offline Placeholders:
                </span>
                {['{name}', '{startTime}', '{endTime}', '{days}', '{timezone}'].map((ph) => (
                  <button
                    key={ph}
                    type="button"
                    onClick={() => insertOfflinePlaceholder(ph)}
                    className="px-2 py-0.5 neu-flat text-[9px] font-mono font-bold text-indigo-600 bg-indigo-500/10 border border-indigo-500/20 rounded-lg hover:scale-105 active:scale-95 transition-all"
                  >
                    {ph}
                  </button>
                ))}
              </div>

              <textarea
                value={currentBusinessHours.offlineMessage || ''}
                onChange={(e) => updateBusinessHours({ offlineMessage: e.target.value })}
                rows={4}
                placeholder="Namaste {name}! 🙏 Our Gram Panchayat office is currently CLOSED. Our operating hours are {startTime} to {endTime} ({days}). Your message has been received..."
                className="w-full px-3.5 py-2.5 neu-pressed rounded-2xl text-xs font-medium leading-relaxed resize-y neu-text bg-transparent outline-none focus:ring-2 focus:ring-indigo-500/30 font-mono transition-all"
              />
            </div>

            {/* Live Off-Hours WhatsApp Preview */}
            <div className="p-3 bg-indigo-950/10 dark:bg-indigo-950/30 rounded-2xl border border-indigo-500/20 space-y-1.5">
              <span className="text-[9px] font-black uppercase tracking-widest text-indigo-600 flex items-center gap-1">
                <Moon className="w-3.5 h-3.5" />
                Off-Hours Auto-Reply Message Preview
              </span>
              <div className="max-w-md bg-white dark:bg-neutral-900 p-3.5 rounded-2xl shadow-sm border border-indigo-500/10 text-xs font-sans whitespace-pre-wrap neu-text leading-relaxed font-normal">
                {renderedOfflinePreview}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Quick Tips Configuration Card */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <label className="text-[10px] font-black uppercase tracking-widest text-amber-600 flex items-center gap-1.5">
              <Lightbulb className="w-3.5 h-3.5 text-amber-500" />
              Dynamic Quick Tips ({tips.length} Defined)
            </label>
            <p className="text-[9px] font-bold neu-text-muted mt-0.5">
              Customizable placeholders — NOT automatic. Included ONLY if user adds placeholder in message template.
            </p>
          </div>

          {/* Mode Switcher: Tag Chips vs Multi-Line Input */}
          <div className="flex items-center gap-1 p-1 neu-pressed rounded-xl self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setInputMode('tags')}
              className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1 transition-all ${
                inputMode === 'tags'
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'neu-text-muted hover:text-amber-600'
              }`}
            >
              <Tag className="w-3 h-3" />
              Tag Chips
            </button>
            <button
              type="button"
              onClick={() => setInputMode('multiline')}
              className={`px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-wider flex items-center gap-1 transition-all ${
                inputMode === 'multiline'
                  ? 'bg-amber-500 text-white shadow-sm'
                  : 'neu-text-muted hover:text-amber-600'
              }`}
            >
              <AlignLeft className="w-3 h-3" />
              Multi-line Editor
            </button>
          </div>
        </div>

        {/* Mode A: Tag-based input system */}
        {inputMode === 'tags' && (
          <div className="space-y-3">
            {/* Add New Tip Bar */}
            <div className="flex gap-2">
              <input
                type="text"
                value={newTipInput}
                onChange={(e) => setNewTipInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleAddTip();
                  }
                }}
                placeholder="Type a new tip (e.g. Type any command name directly or upload receipt photo)..."
                className="flex-1 px-4 py-2.5 neu-pressed rounded-2xl text-xs font-bold neu-text bg-transparent outline-none focus:ring-2 focus:ring-amber-500/30 transition-all placeholder:text-neutral-400"
              />
              <button
                type="button"
                onClick={handleAddTip}
                disabled={!newTipInput.trim()}
                className="px-4 py-2.5 bg-amber-500 hover:bg-amber-600 active:scale-95 text-white rounded-2xl text-[10px] font-black uppercase tracking-wider disabled:opacity-50 transition-all flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Tip
              </button>
            </div>

            {/* List of Dynamic Tip Tags / Cards */}
            <div className="space-y-2">
              <AnimatePresence>
                {tips.length === 0 ? (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="p-5 neu-pressed rounded-2xl text-center border-2 border-dashed border-amber-500/20"
                  >
                    <p className="text-[10px] font-bold neu-text-muted uppercase tracking-widest">
                      No Quick Tips Defined Yet. Add tips above to create reusable placeholders.
                    </p>
                  </motion.div>
                ) : (
                  tips.map((tip, idx) => {
                    const placeholderTag = `{quick_tip_${idx + 1}}`;
                    return (
                      <motion.div
                        layout
                        key={`tip-${idx}`}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className="p-3 neu-pressed rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-3 group hover:border-amber-500/30 transition-all"
                      >
                        <div className="flex items-center gap-2 flex-1">
                          <span className="text-amber-500 font-bold text-xs select-none">💡</span>
                          <input
                            type="text"
                            value={tip}
                            onChange={(e) => handleEditTip(idx, e.target.value)}
                            className="flex-1 px-2.5 py-1 neu-flat rounded-xl text-xs font-semibold neu-text bg-transparent outline-none focus:ring-2 focus:ring-amber-500/30"
                          />
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => insertPlaceholder(placeholderTag)}
                              title={`Insert ${placeholderTag} into message template`}
                              className="px-2 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-700 dark:text-amber-300 font-mono text-[10px] font-bold rounded-lg border border-amber-500/30 flex items-center gap-1 active:scale-95 transition-all"
                            >
                              <Code2 className="w-3 h-3 text-amber-600" />
                              {placeholderTag}
                            </button>
                            <button
                              type="button"
                              onClick={() => handleCopyPlaceholder(placeholderTag)}
                              title="Copy placeholder to clipboard"
                              className="p-1 neu-flat rounded-lg hover:text-amber-600 transition-colors"
                            >
                              {copiedPlaceholder === placeholderTag ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3 neu-text-muted" />
                              )}
                            </button>
                          </div>

                          <button
                            type="button"
                            onClick={() => handleMoveTip(idx, 'up')}
                            disabled={idx === 0}
                            title="Move up"
                            className="p-1 text-neutral-400 hover:text-neutral-700 disabled:opacity-20 transition-colors"
                          >
                            <ArrowUp className="w-3 h-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleMoveTip(idx, 'down')}
                            disabled={idx === tips.length - 1}
                            title="Move down"
                            className="p-1 text-neutral-400 hover:text-neutral-700 disabled:opacity-20 transition-colors"
                          >
                            <ArrowDown className="w-3 h-3" />
                          </button>

                          <button
                            type="button"
                            onClick={() => handleRemoveTip(idx)}
                            title="Delete this tip"
                            className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-500/10 rounded-lg transition-colors ml-1"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </motion.div>
                    );
                  })
                )}
              </AnimatePresence>
            </div>
          </div>
        )}

        {/* Mode B: Editable Multi-line text input */}
        {inputMode === 'multiline' && (
          <div className="space-y-2">
            <div className="flex justify-between items-center text-[9px] font-bold neu-text-muted">
              <span>Each line is treated as an individual tip placeholder. No manual numbering needed.</span>
              <span>Lines: {tips.length}</span>
            </div>
            <textarea
              value={multilineText}
              onChange={handleMultilineChange}
              onBlur={handleMultilineBlur}
              rows={4}
              placeholder="Enter one tip per line:&#10;Type any command name directly to fetch data&#10;Upload a photo of your receipt to report bill payments&#10;Helpline is available 24/7 for water complaints"
              className="w-full px-4 py-3 neu-pressed rounded-2xl text-xs font-semibold leading-relaxed neu-text bg-transparent outline-none focus:ring-2 focus:ring-amber-500/30 transition-all font-mono resize-y"
            />
            <p className="text-[9px] neu-text-muted font-bold">
              Tip: Changes are automatically saved when you finish typing and leave the editor.
            </p>
          </div>
        )}

        {/* Information Notice: Quick Tip is NOT Automatic */}
        <div className="p-3.5 neu-pressed rounded-2xl bg-amber-500/5 border border-amber-500/20 text-[10px] text-amber-800 dark:text-amber-300 font-medium flex items-start gap-2.5">
          <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <p>
              <strong>Notice:</strong> Quick Tips are <strong>NOT automatically included</strong>. To display tips in your WhatsApp greeting, add the <code className="px-1.5 py-0.5 bg-amber-200/50 dark:bg-amber-900/50 rounded font-mono font-bold">{"{quick_tip}"}</code> placeholder (for all tips) or indexed placeholders like <code className="px-1.5 py-0.5 bg-amber-200/50 dark:bg-amber-900/50 rounded font-mono font-bold">{"{quick_tip_1}"}</code> in the template below.
            </p>
            <div className="flex items-center gap-2 pt-0.5">
              <span className="font-bold">Current Status:</span>
              {isQuickTipPlaceholderInTemplate ? (
                <span className="text-emerald-700 dark:text-emerald-400 font-bold flex items-center gap-1">
                  ✓ Placeholder detected — Tips WILL be rendered in WhatsApp greeting
                </span>
              ) : (
                <span className="text-amber-700 dark:text-amber-400 font-bold flex items-center gap-1">
                  ℹ️ No placeholder detected — Tips will be omitted from greeting
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Greeting Template Configuration */}
      <div className="space-y-3 pt-4 border-t border-[var(--shadow-dark)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <label className="text-[10px] font-black uppercase tracking-widest neu-text flex items-center gap-1.5">
            <MessageSquare className="w-3.5 h-3.5 text-blue-600" />
            WhatsApp Welcome Greeting / Menu Template
          </label>
          <button
            type="button"
            onClick={() => commitSettings({ welcomeMessage: '' })}
            className="text-[9px] text-neutral-400 hover:text-blue-600 font-bold uppercase tracking-wider flex items-center gap-1 transition-colors self-start sm:self-auto"
            title="Revert to clean standard greeting"
          >
            <RotateCcw className="w-3 h-3" />
            Reset to Standard Greeting
          </button>
        </div>

        {/* Placeholder Helper Buttons */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[9px] font-black uppercase tracking-wider text-neutral-400 mr-1">
            Insert Placeholders:
          </span>
          <button
            type="button"
            onClick={() => insertPlaceholder("{quick_tip}")}
            className="px-2.5 py-1 neu-flat rounded-lg text-[10px] font-mono font-bold text-amber-700 bg-amber-500/10 border border-amber-500/30 hover:scale-105 active:scale-95 transition-all flex items-center gap-1"
          >
            <Lightbulb className="w-3 h-3" /> {"{quick_tip}"} (All Tips)
          </button>
          {tips.slice(0, 4).map((_, idx) => (
            <button
              key={`ph-tip-${idx}`}
              type="button"
              onClick={() => insertPlaceholder(`{quick_tip_${idx + 1}}`)}
              className="px-2 py-1 neu-flat rounded-lg text-[10px] font-mono font-bold text-amber-600 bg-amber-500/10 border border-amber-500/20 hover:scale-105 active:scale-95 transition-all"
            >
              {`{quick_tip_${idx + 1}}`}
            </button>
          ))}
          <button
            type="button"
            onClick={() => insertPlaceholder("{name}")}
            className="px-2.5 py-1 neu-flat rounded-lg text-[10px] font-mono font-bold text-blue-600 bg-blue-500/10 border border-blue-500/20 hover:scale-105 active:scale-95 transition-all"
          >
            {"{name}"}
          </button>
          <button
            type="button"
            onClick={() => insertPlaceholder("{commands}")}
            title="Clean bullet-point list of active commands without numbering overflows"
            className="px-2.5 py-1 neu-flat rounded-lg text-[10px] font-mono font-bold text-emerald-600 bg-emerald-500/10 border border-emerald-500/20 hover:scale-105 active:scale-95 transition-all"
          >
            {"{commands}"}
          </button>
          <button
            type="button"
            onClick={() => insertPlaceholder("{credit}")}
            className="px-2.5 py-1 neu-flat rounded-lg text-[10px] font-mono font-bold text-purple-600 bg-purple-500/10 border border-purple-500/20 hover:scale-105 active:scale-95 transition-all"
          >
            {"{credit}"}
          </button>
          <button
            type="button"
            onClick={() => insertPlaceholder("{balance}")}
            className="px-2.5 py-1 neu-flat rounded-lg text-[10px] font-mono font-bold text-rose-600 bg-rose-500/10 border border-rose-500/20 hover:scale-105 active:scale-95 transition-all"
          >
            {"{balance}"}
          </button>
        </div>

        <textarea
          value={settings?.welcomeMessage || ''}
          onChange={(e) => commitSettings({ welcomeMessage: e.target.value })}
          rows={5}
          placeholder={`Leave empty to use clean standard greeting, or customize:\n\nHello {name}! 🙏 I am your Gram Panchayat Smart Billing Assistant.{credit}\n\nAvailable Services:\n{commands}\n\n{quick_tip}`}
          className="w-full px-4 py-3 neu-pressed rounded-2xl text-xs font-medium leading-relaxed resize-y neu-text bg-transparent outline-none focus:ring-2 focus:ring-blue-500/30 transition-all font-mono"
        />
      </div>

      {/* Live WhatsApp Bot Mockup Preview */}
      <AnimatePresence>
        {showPreview && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="pt-4 border-t border-[var(--shadow-dark)] space-y-2"
          >
            <div className="flex items-center justify-between">
              <span className="text-[9px] font-black uppercase tracking-widest text-emerald-600 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5" />
                Live WhatsApp Bot Greeting Preview
              </span>
              <span className="text-[8px] font-bold text-neutral-400 uppercase">
                Standard Working Hours Response
              </span>
            </div>

            <div className="p-4 bg-emerald-950/10 dark:bg-emerald-950/30 rounded-2xl border border-emerald-500/20 space-y-2">
              <div className="max-w-md bg-white dark:bg-neutral-900 p-4 rounded-2xl shadow-sm border border-emerald-500/10 text-xs font-sans whitespace-pre-wrap neu-text leading-relaxed font-normal">
                {renderedMessagePreview}
              </div>

              <div className="text-[9px] neu-text-muted font-bold flex items-center gap-2">
                {isQuickTipPlaceholderInTemplate ? (
                  <span className="text-emerald-700 dark:text-emerald-400 font-bold">
                    ✓ Quick Tip placeholder rendered in greeting message.
                  </span>
                ) : (
                  <span className="text-amber-700 dark:text-amber-400 font-bold">
                    ℹ️ No {"{quick_tip}"} placeholder in template. Quick tip is omitted from message.
                  </span>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
