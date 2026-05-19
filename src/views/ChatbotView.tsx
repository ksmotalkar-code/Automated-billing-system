import { useState, useEffect } from "react";
import { Card, CardHeader, CardContent, CardTitle } from "../components/ui/card";
import { MessageSquare, Save, Settings, Activity, RefreshCw, Plus, Trash2, Bot, Info, Sparkles, MessageCircleCode } from "lucide-react";
import { ChatbotSettings, getChatbotSettings, saveChatbotSettings, ChatbotCommand } from "../lib/db";
import { motion, AnimatePresence } from "motion/react";
import { v4 as uuidv4 } from 'uuid';
import { CommandManagerWrapper } from "../components/CommandManager";

export function ChatbotView() {
  const [settings, setSettings] = useState<ChatbotSettings>({
    isActive: false,
    commands: []
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    const fetchSettings = async () => {
      const data = await getChatbotSettings();
      const defaultSystemCommands: ChatbotCommand[] = [
        { id: "sysdlbill", buttonLabel: "📄 Download Bill PDF", triggerWord: "Download Bill", response: "Here is your PDF bill.", isActive: true },
        { id: "sysqrpay", buttonLabel: "💰 QR For Payment", triggerWord: "Pay Bill", response: "Scan this UPI QR code to make your payment.", isActive: true },
        { id: "sysbill", buttonLabel: "📄 See My Bill", triggerWord: "My Bill", response: "Your current bill status is computed live.", isActive: true },
        { id: "sysbalance", buttonLabel: "💳 View Balance", triggerWord: "Check Balance", response: "Your total remaining balance is Rs. {{balance}}.", isActive: true },
        { id: "syscomplaint", buttonLabel: "🛠️ Register Complaint", triggerWord: "Complaint", response: "Please describe your complaint in the next message.", isActive: true },
        { id: "sysreport", buttonLabel: "📊 Deep Detail Report", triggerWord: "Deep Report", response: "Let me find your deep detail report.", isActive: true },
        { id: "syswater", buttonLabel: "💧 Water Quality Status", triggerWord: "Water Quality", response: "Our water quality currently meets all regulatory standards. Safe for drinking!", isActive: true },
        { id: "syssupply", buttonLabel: "🕒 Supply Timings", triggerWord: "Supply Timings", response: "Water supply timings are: Morning 6:00 AM - 8:00 AM, Evening 6:00 PM - 8:00 PM.", isActive: true },
        { id: "syscontact", buttonLabel: "📞 Contact Us", triggerWord: "Contact", response: "You can contact the Panchayat office at 1800-123-4567.", isActive: true },
        { id: "sysnotify", buttonLabel: "🔔 Notify History", triggerWord: "Notifications", response: "Your recent notifications are available in the portal dashboard.", isActive: true },
        { id: "sysusage", buttonLabel: "📝 Usage History", triggerWord: "Usage", response: "Your usage history is currently being computed.", isActive: true },
        { id: "sysmaint", buttonLabel: "⚠️ Maintenance Alerts", triggerWord: "Maintenance", response: "No scheduled maintenance for your zone currently.", isActive: true }
      ];

      let mergedCommands = [];
      if (data && data.commands) {
        mergedCommands = [...data.commands];
      }
      
      for (const sys of defaultSystemCommands) {
        const existingIndex = mergedCommands.findIndex(c => c.id === sys.id);
        if (existingIndex !== -1) {
          // If it's an old system command (technical trigger), update it to the new friendly one
          // We only update it if it's the specific system ID
          mergedCommands[existingIndex] = { ...mergedCommands[existingIndex], triggerWord: sys.triggerWord, buttonLabel: sys.buttonLabel };
        } else {
          mergedCommands.push(sys);
        }
      }

      setSettings({
        isActive: data ? (data.isActive || false) : false,
        commands: mergedCommands
      });
      setLoading(false);
    };
    fetchSettings();
  }, []);

  useEffect(() => {
    if (loading) return;
    
    const timer = setTimeout(() => {
      handleSave();
    }, 1500);
    return () => clearTimeout(timer);
  }, [settings, loading]);

  const handleSave = () => {
    setSaving(true);
    setSaveMessage("");
    saveChatbotSettings(settings).catch(e => console.error("Error saving chatbot to remote:", e));
    setSaving(false);
    setSaveMessage("Deployment Successfull");
    setTimeout(() => setSaveMessage(""), 3000);
  };

  const handleToggle = () => {
    setSettings(prev => ({ ...prev, isActive: !prev.isActive }));
  };

  const handleAddCommand = () => {
    const newCmd: ChatbotCommand = {
      id: uuidv4(),
      buttonLabel: '⚡ Fast Action',
      triggerWord: 'assist',
      response: 'I am here to help. Please specify your request.',
      isActive: true
    };
    setSettings(prev => ({ ...prev, commands: [newCmd, ...prev.commands] }));
  };

  const handleRemoveCommand = (id: string) => {
    setSettings(prev => ({ ...prev, commands: prev.commands.filter(c => c.id !== id) }));
  };

  const handleUpdateCommand = (id: string, updates: Partial<ChatbotCommand>) => {
    setSettings(prev => ({
      ...prev,
      commands: prev.commands.map(c => c.id === id ? { ...c, ...updates } : c)
    }));
  };

  if (loading) {
    return (
      <div className="flex flex-col justify-center items-center h-full gap-4">
        <div className="relative">
          <RefreshCw className="w-12 h-12 animate-spin text-blue-600 opacity-20" />
          <Bot className="w-6 h-6 text-blue-600 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 animate-pulse" />
        </div>
        <p className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-600/60 animate-pulse">Initializing Neural Bridge</p>
      </div>
    );
  }

  return (
    <div className="p-4 space-y-8 max-w-6xl mx-auto pb-24">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6">
        <div>
           <div className="flex items-center gap-3 mb-2">
             <div className="p-2 neu-flat rounded-xl text-blue-600">
               <MessageCircleCode className="w-5 h-5" />
             </div>
             <span className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-600/60">Automation Daemon</span>
           </div>
           <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase mb-2">Chatbot <span className="text-blue-600">Cognition</span></h1>
           <p className="text-xs neu-text-muted font-bold max-w-lg leading-relaxed uppercase tracking-tight opacity-70">
             Define reaction patterns and interactive triggers. These rules govern both the public portal quick-actions and WhatsApp automated responses.
           </p>
        </div>
        
        <div className="flex items-center gap-3">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleSave}
            disabled={saving}
            className="px-8 py-4 neu-flat bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-blue-500/20 flex items-center gap-3 disabled:opacity-40"
          >
            {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Deploying..." : "Sync Rules"}
          </motion.button>
          
          <AnimatePresence>
            {saveMessage && (
              <motion.span 
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0 }}
                className="text-[10px] font-black text-emerald-600 uppercase tracking-widest"
              >
                {saveMessage}
              </motion.span>
            )}
          </AnimatePresence>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Statistics and Status */}
        <div className="lg:col-span-4 space-y-6">
          <Card className="border-none border-t border-white/5 overflow-hidden">
            <CardHeader className="border-b border-[var(--shadow-dark)] pb-4">
               <CardTitle className="text-[11px] font-black uppercase tracking-widest flex items-center gap-2">
                  <Activity className="w-4 h-4 text-emerald-500" /> Operational status
               </CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
               <label className="flex items-center justify-between p-6 neu-pressed rounded-3xl cursor-pointer group transition-all hover:bg-emerald-500/[0.02]">
                  <div className="flex flex-col">
                    <span className="text-[11px] font-black uppercase tracking-widest leading-none">Neural Response</span>
                    <p className="text-[9px] neu-text-muted font-bold mt-1 uppercase tracking-tighter opacity-60">Toggle automated intelligence</p>
                  </div>
                  <div className="relative inline-block w-14 h-7 shrink-0">
                    <input 
                      type="checkbox" 
                      className="sr-only peer" 
                      checked={settings.isActive} 
                      onChange={handleToggle} 
                    />
                    <div className="w-full h-full rounded-full bg-[var(--shadow-dark)] peer-checked:bg-emerald-500 transition-colors duration-300 shadow-inner" />
                    <div className={`absolute top-1 left-1 w-5 h-5 bg-white rounded-full shadow-sm transition-all duration-300 ${settings.isActive ? 'translate-x-7' : 'translate-x-0'}`} />
                  </div>
               </label>

               <div className="p-5 neu-pressed rounded-2xl bg-blue-500/5 space-y-2">
                  <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-blue-600">
                    <Info className="w-4 h-4" /> Variable Mapping
                  </div>
                  <p className="text-[9px] font-bold neu-text-muted uppercase tracking-tighter leading-relaxed">
                    Use handles to inject real-time data:
                  </p>
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {['name', 'balance', 'status', 'dueDate', 'amount'].map(v => (
                      <code key={v} className="px-2 py-1 bg-white/40 rounded text-[9px] font-black text-blue-800/60 lowercase tracking-widest">
                        {"{{"}{v}{"}}"}
                      </code>
                    ))}
                  </div>
               </div>

               <div className="grid grid-cols-2 gap-4">
                  <div className="p-5 neu-pressed rounded-2xl flex flex-col gap-1 items-center justify-center text-center">
                    <span className="text-2xl font-black">{settings.commands.length}</span>
                    <span className="text-[8px] font-black uppercase tracking-widest text-neutral-400">Rules Active</span>
                  </div>
                  <div className="p-5 neu-pressed rounded-2xl flex flex-col gap-1 items-center justify-center text-center">
                    <span className="text-2xl font-black text-emerald-500">∞</span>
                    <span className="text-[8px] font-black uppercase tracking-widest text-neutral-400">Response Cap</span>
                  </div>
               </div>
            </CardContent>
          </Card>

          <Card className="border-none border-t border-white/5 overflow-hidden bg-emerald-500/[0.02]">
             <CardContent className="p-6">
                <div className="flex items-center gap-3 mb-4">
                   <Sparkles className="w-5 h-5 text-emerald-600" />
                   <span className="text-[11px] font-black uppercase tracking-widest text-emerald-600">Intelligent Routing</span>
                </div>
                <p className="text-[10px] font-bold neu-text-muted uppercase tracking-tighter leading-relaxed italic opacity-80">
                  The bot uses strict-pattern matching for portal buttons and fuzzy-string analysis for inbound WhatsApp messages. Ensure trigger words are concise.
                </p>
             </CardContent>
          </Card>
        </div>

        {/* Command Configuration */}
        <div className="lg:col-span-8 space-y-6">
          <div className="flex items-center justify-between px-2">
            <h2 className="text-[12px] font-black uppercase tracking-[0.2em] text-blue-600/80">Command Registry</h2>
            <p className="text-[10px] neu-text-muted font-bold uppercase">Configure your automated bot responses here.</p>
          </div>

          <div className="space-y-6">
             <CommandManagerWrapper 
               settings={settings}
               onUpdate={setSettings}
               isCompact={false}
               fallbackUI={
                <>
                  <div className="flex items-center justify-end px-2 mb-4">
                    <motion.button 
                      whileHover={{ scale: 1.05, y: -2 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={handleAddCommand}
                      className="px-5 py-2.5 neu-flat bg-white rounded-xl text-[10px] font-black uppercase tracking-widest text-blue-600 flex items-center gap-2 border border-blue-500/10"
                    >
                      <Plus className="w-4 h-4" /> New Sequence
                    </motion.button>
                  </div>
                  <AnimatePresence mode="popLayout">
                    {settings.commands.length === 0 ? (
                      <motion.div 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="py-32 neu-pressed rounded-3xl border-4 border-dashed border-black/[0.02] flex flex-col items-center justify-center text-center px-10"
                      >
                         <MessageSquare className="w-12 h-12 text-neutral-200 mb-4" />
                         <p className="text-[11px] font-black uppercase tracking-widest text-neutral-300">No Cogntive Patterns Defined</p>
                         <p className="text-[9px] font-bold text-neutral-400 mt-2 max-w-[240px]">Create your first command to start automating customer interactions.</p>
                      </motion.div>
                    ) : (
                      settings.commands.map((cmd, index) => (
                        <motion.div 
                          layout
                          key={cmd.id}
                          initial={{ opacity: 0, y: 20 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={{ opacity: 0, scale: 0.9 }}
                          transition={{ delay: index * 0.05 }}
                          className={`group p-6 neu-flat rounded-3xl border border-white/5 transition-all mb-4 ${!cmd.isActive ? 'opacity-50 grayscale' : 'hover:shadow-2xl hover:shadow-blue-500/[0.03]'}`}
                        >
                          <div className="flex flex-col md:flex-row gap-6">
                            <div className="flex-1 space-y-5">
                              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                 <div className="space-y-2">
                                    <label className="text-[9px] font-black uppercase tracking-[0.2em] neu-text-muted ml-1">Interface Label</label>
                                    <div className="relative">
                                      <input 
                                        type="text" 
                                        value={cmd.buttonLabel} 
                                        onChange={(e) => handleUpdateCommand(cmd.id, { buttonLabel: e.target.value })}
                                        className="w-full px-5 py-4 neu-pressed rounded-2xl bg-transparent outline-none text-xs font-black uppercase tracking-wider focus:ring-2 focus:ring-blue-500/20 transition-all shadow-inner"
                                        placeholder="e.g. GET BILL"
                                      />
                                      <div className="absolute right-4 top-1/2 -translate-y-1/2 opacity-20">⚡</div>
                                    </div>
                                 </div>
                                 <div className="space-y-2">
                                    <label className="text-[9px] font-black uppercase tracking-[0.2em] neu-text-muted ml-1">Pattern Trigger</label>
                                    <input 
                                      type="text" 
                                      value={cmd.triggerWord} 
                                      onChange={(e) => handleUpdateCommand(cmd.id, { triggerWord: e.target.value })}
                                      className="w-full px-5 py-4 neu-pressed rounded-2xl bg-transparent outline-none text-[10px] font-mono font-bold text-neutral-500 focus:ring-2 focus:ring-blue-500/20 transition-all shadow-inner"
                                      placeholder="regex: /bill/i"
                                    />
                                 </div>
                              </div>

                              <div className="space-y-2">
                                <div className="flex justify-between items-center px-1">
                                   <label className="text-[9px] font-black uppercase tracking-[0.2em] neu-text-muted">Automated Response Logic</label>
                                   <span className="text-[8px] font-bold neu-text-muted opacity-40 uppercase">{cmd.response.length} characters</span>
                                </div>
                                <textarea 
                                  value={cmd.response} 
                                  onChange={(e) => handleUpdateCommand(cmd.id, { response: e.target.value })}
                                  className="w-full h-24 px-5 py-4 neu-pressed rounded-2xl bg-transparent outline-none text-xs font-bold leading-relaxed resize-none focus:ring-2 focus:ring-blue-500/20 transition-all shadow-inner"
                                  placeholder="Determine the bot's reaction..."
                                />
                              </div>
                            </div>

                            <div className="flex flex-row md:flex-col justify-between md:justify-center items-center gap-4 md:w-20 pl-0 md:pl-4 border-l-0 md:border-l border-black/[0.03]">
                               <label className="flex flex-col items-center gap-2 cursor-pointer group/toggle">
                                  <input 
                                    type="checkbox" 
                                    checked={cmd.isActive}
                                    onChange={(e) => handleUpdateCommand(cmd.id, { isActive: e.target.checked })}
                                    className="sr-only"
                                  />
                                  <div className={`w-10 h-10 rounded-2xl flex items-center justify-center transition-all ${cmd.isActive ? 'neu-flat text-emerald-500 bg-emerald-500/5' : 'neu-pressed text-neutral-300'}`}>
                                     <Activity className="w-5 h-5" />
                                  </div>
                                  <span className="text-[8px] font-black uppercase tracking-widest opacity-40 group-hover/toggle:opacity-100 transition-opacity">
                                    {cmd.isActive ? 'Online' : 'Muted'}
                                  </span>
                               </label>

                               <motion.button 
                                 whileHover={{ scale: 1.1, rotate: 5 }}
                                 whileTap={{ scale: 0.9 }}
                                 onClick={() => handleRemoveCommand(cmd.id)}
                                 className="w-10 h-10 neu-pressed rounded-2xl text-rose-500 hover:bg-rose-500/10 flex items-center justify-center transition-colors"
                               >
                                 <Trash2 className="w-5 h-5" />
                               </motion.button>
                            </div>
                          </div>
                        </motion.div>
                      ))
                    )}
                  </AnimatePresence>
                </>
               }
             />
          </div>
        </div>
      </div>
    </div>
  );
}