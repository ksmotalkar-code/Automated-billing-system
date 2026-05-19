import React, { useState } from 'react';
import { Bot, Plus, Trash2, Activity, Save, RefreshCw } from 'lucide-react';
import { ChatbotSettings, ChatbotCommand, saveChatbotSettings } from '../lib/db';
import { v4 as uuidv4 } from 'uuid';
import { motion, AnimatePresence } from 'motion/react';

interface CommandManagerProps {
  settings: ChatbotSettings;
  onUpdate: (newSettings: ChatbotSettings) => void;
  isCompact?: boolean;
}

class ErrorBoundary extends React.Component<{ children: React.ReactNode, fallback: React.ReactNode }, { hasError: boolean }> {
  constructor(props: any) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return this.props.fallback;
    }
    return this.props.children;
  }
}

export function CommandManagerWrapper({ settings, onUpdate, isCompact, fallbackUI }: CommandManagerProps & { fallbackUI: React.ReactNode }) {
  const [forceLegacy, setForceLegacy] = useState(false);

  if (forceLegacy) {
    return <>{fallbackUI}</>;
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <button 
          onClick={() => setForceLegacy(true)} 
          className="text-[9px] text-rose-500 font-bold uppercase tracking-widest hover:underline px-3 py-1.5 neu-flat rounded-lg"
        >
          Use Legacy / Fallback View
        </button>
      </div>
      <ErrorBoundary fallback={
        <div className="p-4 bg-rose-50 rounded-xl">
          <p className="text-rose-600 text-xs font-bold mb-4">The new interface encountered an error. Showing fallback view.</p>
          {fallbackUI}
        </div>
      }>
        <CommandManager settings={settings} onUpdate={onUpdate} isCompact={isCompact} />
      </ErrorBoundary>
    </div>
  );
}

function CommandManager({ settings, onUpdate, isCompact }: CommandManagerProps) {
  const [commands, setCommands] = useState<ChatbotCommand[]>(settings?.commands || []);
  const [saving, setSaving] = useState(false);

  // Sync prop changes
  React.useEffect(() => {
    if (settings?.commands) {
      setCommands(settings.commands);
    }
  }, [settings?.commands]);

  const commitChanges = async (newCommands: ChatbotCommand[]) => {
    const updatedSettings = { ...settings, commands: newCommands };
    setSaving(true);
    try {
      await saveChatbotSettings(updatedSettings);
      onUpdate(updatedSettings);
    } catch (e) {
      console.error(e);
    } finally {
      setSaving(false);
    }
  };

  const handleAddCommand = () => {
    const newCmd: ChatbotCommand = {
      id: uuidv4(),
      buttonLabel: '⚡ New Action',
      triggerWord: 'trigger',
      response: 'Bot response here...',
      isActive: true
    };
    const newCommands = [newCmd, ...commands];
    setCommands(newCommands);
    commitChanges(newCommands);
  };

  const handleRemoveCommand = (id: string) => {
    const newCommands = commands.filter(c => c.id !== id);
    setCommands(newCommands);
    commitChanges(newCommands);
  };

  const handleUpdateCommand = (id: string, updates: Partial<ChatbotCommand>) => {
    const newCommands = commands.map(c => c.id === id ? { ...c, ...updates } : c);
    setCommands(newCommands);
  };

  const handleBlur = () => {
    // Save on blur
    commitChanges(commands);
  };

  const handleClearAll = () => {
    if (confirm("Are you sure you want to delete all bot commands?")) {
      setCommands([]);
      commitChanges([]);
    }
  };

  const handleAddDefaults = () => {
    const defaults: ChatbotCommand[] = [
      { id: 'sysdlbill', buttonLabel: '📄 Download Bill PDF', triggerWord: 'Download Bill', response: 'Here is your PDF bill.', isActive: true },
      { id: 'sysqrpay', buttonLabel: '💰 QR For Payment', triggerWord: 'Pay Bill', response: 'Scan this UPI QR code to make your payment.', isActive: true },
      { id: 'sysbill', buttonLabel: '📄 See My Bill', triggerWord: 'My Bill', response: 'Your current bill status is computed live.', isActive: true },
      { id: 'sysbalance', buttonLabel: '💳 View Balance', triggerWord: 'Check Balance', response: 'Your total remaining balance is Rs. {{balance}}.', isActive: true },
      { id: 'syscomplaint', buttonLabel: '🛠️ Register Complaint', triggerWord: 'Complaint', response: 'Please describe your complaint in the next message.', isActive: true },
      { id: 'sysreport', buttonLabel: '📊 Deep Detail Report', triggerWord: 'Deep Report', response: 'Let me find your deep detail report.', isActive: true },
      { id: 'syswater', buttonLabel: '💧 Water Quality Status', triggerWord: 'Water Quality', response: 'Our water quality currently meets all regulatory standards. Safe for drinking!', isActive: true },
      { id: 'syssupply', buttonLabel: '🕒 Supply Timings', triggerWord: 'Supply Timings', response: 'Water supply timings are: Morning 6:00 AM - 8:00 AM, Evening 6:00 PM - 8:00 PM.', isActive: true },
      { id: 'syscontact', buttonLabel: '📞 Contact Us', triggerWord: 'Contact', response: 'You can contact the Panchayat office at 1800-123-4567.', isActive: true },
      { id: 'sysnotify', buttonLabel: '🔔 Notify History', triggerWord: 'Notifications', response: 'Your recent notifications are available in the portal dashboard.', isActive: true },
      { id: 'sysusage', buttonLabel: '📝 Usage History', triggerWord: 'Usage', response: 'Your usage history is currently being computed.', isActive: true },
      { id: 'sysmaint', buttonLabel: '⚠️ Maintenance Alerts', triggerWord: 'Maintenance', response: 'No scheduled maintenance for your zone currently.', isActive: true },
      { id: 'syslink', buttonLabel: '🔗 Portal Link', triggerWord: 'Link', response: 'Here is your portal link.', isActive: true },
    ];
    
    // Update existing system commands by ID, add others
    let newCommands = [...commands];
    defaults.forEach(defCmd => {
       const existingIndex = newCommands.findIndex(c => c.id === defCmd.id);
       if (existingIndex !== -1) {
           // Update only if it hasn't been significantly customized? 
           // For simplicity, we update the triggers/labels of system commands to match new defaults
           newCommands[existingIndex] = { ...newCommands[existingIndex], ...defCmd };
       } else {
           newCommands.push(defCmd);
       }
    });

    setCommands(newCommands);
    commitChanges(newCommands);
  };

  return (
    <div className={`space-y-4 ${isCompact ? '' : 'p-4 border border-[var(--accent)]/10 rounded-3xl bg-[var(--accent)]/[0.01]'}`}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
           <Bot className="w-5 h-5 text-[var(--accent)]" />
           <span className="text-[11px] font-black uppercase tracking-[0.2em] text-[var(--accent)]">Robust Command Manager</span>
           {saving && <RefreshCw className="w-3 h-3 text-[var(--accent)] animate-spin ml-2" />}
        </div>
        <div className="flex gap-2 items-center">
          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleAddDefaults}
            className="px-3 py-2 bg-[var(--accent)]/10 text-[var(--accent)] rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-[var(--accent)]/20 transition-colors flex items-center gap-2"
          >
            Bulk Defaults
          </motion.button>
          
          {commands.length > 0 && (
              <motion.button 
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={handleClearAll}
                className="px-3 py-2 bg-rose-500/10 text-rose-500 rounded-xl text-[9px] font-black uppercase tracking-widest hover:bg-rose-500/20 transition-colors flex items-center gap-1"
              >
                Clear All
              </motion.button>
          )}

          <motion.button 
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleAddCommand}
            className="px-4 py-2 bg-[var(--accent)] text-white rounded-xl text-[9px] font-black uppercase tracking-widest shadow-lg shadow-[var(--accent)]/20 flex items-center gap-2"
          >
            <Plus className="w-3 h-3" /> Add Rule
          </motion.button>
        </div>
      </div>

      <div className="space-y-3">
        <AnimatePresence>
          {commands.length === 0 ? (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="py-8 text-center bg-[var(--accent)]/5 rounded-2xl border-2 border-dashed border-[var(--accent)]/20">
              <p className="text-[10px] font-bold text-neutral-400 uppercase tracking-widest">No Commands Added Yet</p>
            </motion.div>
          ) : (
            commands.map((cmd) => (
              <motion.div 
                layout
                key={cmd.id}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className={`p-4 rounded-xl border transition-all ${cmd.isActive ? 'neu-flat border-[var(--accent)]/20 shadow-sm' : 'neu-pressed border-black/5 grayscale opacity-60'}`}
              >
                <div className={`grid gap-4 ${isCompact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-12'}`}>
                  
                  {/* Left area / Top area */}
                  <div className={`space-y-3 ${isCompact ? '' : 'md:col-span-11'} grid ${isCompact ? 'grid-cols-1' : 'grid-cols-1 md:grid-cols-3'} gap-4`}>
                    
                    <div className="flex flex-col gap-1">
                       <label className="text-[8px] font-black uppercase tracking-widest text-[var(--accent)]/60">Button/Label</label>
                       <input 
                         type="text" 
                         value={cmd.buttonLabel}
                         onChange={(e) => handleUpdateCommand(cmd.id, { buttonLabel: e.target.value })}
                         onBlur={handleBlur}
                         className="w-full px-3 py-2 text-xs font-bold neu-pressed rounded-lg outline-none focus:ring-2 focus:ring-[var(--accent)]/30 bg-transparent"
                       />
                    </div>
                    
                    <div className="flex flex-col gap-1">
                       <label className="text-[8px] font-black uppercase tracking-widest text-[var(--accent)]/60">Trigger Word</label>
                       <input 
                         type="text" 
                         value={cmd.triggerWord}
                         onChange={(e) => handleUpdateCommand(cmd.id, { triggerWord: e.target.value })}
                         onBlur={handleBlur}
                         className="w-full px-3 py-2 text-[10px] font-mono font-bold neu-pressed text-neutral-600 rounded-lg outline-none focus:ring-2 focus:ring-[var(--accent)]/30 bg-transparent"
                       />
                    </div>
                    
                    <div className={`flex flex-col gap-1 ${isCompact ? '' : 'md:col-span-3'}`}>
                       <label className="text-[8px] font-black uppercase tracking-widest text-[var(--accent)]/60">Response Payload</label>
                       <textarea 
                         value={cmd.response}
                         onChange={(e) => handleUpdateCommand(cmd.id, { response: e.target.value })}
                         onBlur={handleBlur}
                         rows={2}
                         className="w-full px-3 py-2 text-xs font-medium neu-pressed rounded-lg outline-none focus:ring-2 focus:ring-[var(--accent)]/30 resize-none bg-transparent"
                       />
                    </div>
                  </div>

                  {/* Actions area */}
                  <div className={`flex items-center gap-2 ${isCompact ? 'justify-end border-t pt-3 mt-1' : 'md:col-span-1 flex-col justify-center pl-4'}`}>
                     <button
                        onClick={() => {
                          handleUpdateCommand(cmd.id, { isActive: !cmd.isActive });
                          setTimeout(() => commitChanges(commands.map(c => c.id === cmd.id ? { ...c, isActive: !cmd.isActive } : c)), 0);
                        }}
                        className={`p-2 rounded-lg transition-colors ${cmd.isActive ? 'bg-[var(--accent)]/10 text-[var(--accent)] neu-flat' : 'neu-pressed text-neutral-500'}`}
                     >
                        <Activity className="w-4 h-4" />
                     </button>
                     <button
                        onClick={() => handleRemoveCommand(cmd.id)}
                        className="p-2 neu-pressed text-rose-500 hover:text-rose-600 rounded-lg transition-colors"
                     >
                        <Trash2 className="w-4 h-4" />
                     </button>
                  </div>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
