import { useState, useEffect } from "react";
import { Card, CardHeader, CardContent, CardTitle } from "../components/ui/card";
import { MessageSquare, Save, Settings, Activity, RefreshCw, Plus, Trash2 } from "lucide-react";
import { ChatbotSettings, getChatbotSettings, saveChatbotSettings, ChatbotCommand } from "../lib/db";
import { motion } from "motion/react";
import { v4 as uuidv4 } from 'uuid';

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
        { id: "sysdlbill", buttonLabel: "📄 Download Bill PDF", triggerWord: "system_dl_bill", response: "Here is your PDF bill.", isActive: true },
        { id: "sysqrpay", buttonLabel: "💰 QR For Payment", triggerWord: "system_qr_pay", response: "Scan this UPI QR code to make your payment.", isActive: true },
        { id: "sysbill", buttonLabel: "📄 See My Bill", triggerWord: "system_bill", response: "Your current bill status is computed live.", isActive: true },
        { id: "sysbalance", buttonLabel: "💳 View Balance", triggerWord: "system_balance", response: "Your total remaining balance is Rs. {{balance}}.", isActive: true },
        { id: "syscomplaint", buttonLabel: "🛠️ Register Complaint", triggerWord: "system_complaint", response: "Please reply with your complaint directly by starting with \"COMPLAINT:\".", isActive: true },
        { id: "sysreport", buttonLabel: "📊 Deep Detail Report", triggerWord: "system_report", response: "Let me find your deep detail report.", isActive: true },
        { id: "syswater", buttonLabel: "💧 Water Quality Status", triggerWord: "system_water_quality", response: "Our water quality currently meets all regulatory standards. Safe for drinking!", isActive: true },
        { id: "syssupply", buttonLabel: "🕒 Supply Timings", triggerWord: "system_supply_time", response: "Water supply timings are: Morning 6:00 AM - 8:00 AM, Evening 6:00 PM - 8:00 PM.", isActive: true },
        { id: "syscontact", buttonLabel: "📞 Contact Us", triggerWord: "system_contact", response: "You can contact the Panchayat office at 1800-123-4567.", isActive: true },
        { id: "sysnotify", buttonLabel: "🔔 Notify History", triggerWord: "system_notify", response: "Your recent notifications are available in the portal dashboard.", isActive: true },
        { id: "sysusage", buttonLabel: "📝 Usage History", triggerWord: "system_usage", response: "Your usage history is currently being computed.", isActive: true },
        { id: "sysmaint", buttonLabel: "⚠️ Maintenance Alerts", triggerWord: "system_maintenance", response: "No scheduled maintenance for your zone currently.", isActive: true }
      ];

      let mergedCommands = [];
      if (data && data.commands) {
        mergedCommands = [...data.commands];
      }
      
      // Inject missing system commands so the user sees all ~12 default UI actions
      for (const sys of defaultSystemCommands) {
         if (!mergedCommands.find(c => c.triggerWord === sys.triggerWord)) {
            mergedCommands.push(sys);
         }
      }

      const isActive = data ? (data.isActive || false) : false;

      setSettings({
        isActive,
        commands: mergedCommands
      });
      setLoading(false);
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    setSaveMessage("");
    await saveChatbotSettings(settings);
    setSaving(false);
    setSaveMessage("Settings saved successfully.");
    setTimeout(() => setSaveMessage(""), 3000);
  };

  const handleToggle = async () => {
    setSettings(prev => ({ ...prev, isActive: !prev.isActive }));
  };

  const handleAddCommand = () => {
    const newCmd: ChatbotCommand = {
      id: uuidv4(),
      buttonLabel: 'New Button',
      triggerWord: 'new',
      response: 'This is the new response.',
      isActive: true
    };
    setSettings(prev => ({ ...prev, commands: [...prev.commands, newCmd] }));
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
      <div className="flex justify-center items-center h-full">
        <RefreshCw className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    );
  }

  return (
    <div className="p-2 space-y-6 max-w-4xl mx-auto">
      <div className="flex justify-between items-end">
        <div>
          <h1 className="text-4xl font-black tracking-tight mb-3">Chatbot Rules Setup</h1>
          <p className="text-lg neu-text-muted">
            Configure your automated chatbot with specific commands and responses. Buttons will be displayed on the public portal for users to click.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card className="neu-flat border-none">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-blue-500" /> Bot Commands
              </CardTitle>
              <button 
                onClick={handleAddCommand}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 text-blue-600 hover:bg-blue-100 rounded-lg text-sm font-bold transition-colors"
              >
                <Plus className="w-4 h-4" /> Add Command
              </button>
            </CardHeader>
            <CardContent className="space-y-4">
              {settings.commands.length === 0 ? (
                <div className="text-center p-6 text-neutral-400">
                  <p>No commands defined yet. Add a command to get started!</p>
                </div>
              ) : (
                settings.commands.map((cmd) => (
                  <div key={cmd.id} className="p-4 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl border border-neutral-100 dark:border-neutral-800 space-y-3">
                    <div className="flex justify-between items-start gap-4">
                      <div className="flex-1 space-y-2">
                        <div>
                          <label className="block text-xs font-bold text-neutral-500 mb-1">Button Label (Shown on Portal)</label>
                          <input 
                            type="text" 
                            value={cmd.buttonLabel} 
                            onChange={(e) => handleUpdateCommand(cmd.id, { buttonLabel: e.target.value })}
                            className="w-full p-2.5 neu-pressed rounded-lg outline-none text-sm font-medium"
                            placeholder="e.g., How to pay bill?"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-bold text-neutral-500 mb-1">Trigger Word (For WhatsApp matching)</label>
                          <input 
                            type="text" 
                            value={cmd.triggerWord} 
                            onChange={(e) => handleUpdateCommand(cmd.id, { triggerWord: e.target.value })}
                            className="w-full p-2.5 neu-pressed rounded-lg outline-none text-sm font-medium"
                            placeholder="e.g., pay, bill, /regex/i"
                          />
                          <p className="text-[10px] text-neutral-400 mt-1">Split multiple with commas. Use /regex/ for regex.</p>
                        </div>
                      </div>
                      
                      <div className="flex items-center gap-2 mt-6">
                         <label className="flex items-center gap-2 text-sm font-bold cursor-pointer">
                            <input 
                              type="checkbox" 
                              checked={cmd.isActive}
                              onChange={(e) => handleUpdateCommand(cmd.id, { isActive: e.target.checked })}
                              className="w-4 h-4 text-blue-600 rounded"
                            />
                            Active
                         </label>
                         <button 
                           onClick={() => handleRemoveCommand(cmd.id)}
                           className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/30 rounded-lg transition-colors ml-2"
                         >
                           <Trash2 className="w-4 h-4" />
                         </button>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-bold text-neutral-500 mb-1">Automated Reply</label>
                      <textarea 
                        value={cmd.response} 
                        onChange={(e) => handleUpdateCommand(cmd.id, { response: e.target.value })}
                        className="w-full h-24 p-2.5 neu-pressed rounded-lg outline-none text-sm resize-none"
                        placeholder="The exact reply you want the bot to send..."
                      />
                      <p className="text-[10px] text-neutral-400 mt-1">Variables supported: {'{{name}}'}, {'{{balance}}'}, {'{{mobileNumber}}'}, {'{{status}}'}, {'{{dueDate}}'}</p>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>

          <div className="flex gap-4 items-center">
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleSave}
              disabled={saving}
              className="flex-1 py-4 bg-blue-600 text-white rounded-xl font-bold tracking-wide shadow-lg hover:bg-blue-700 transition flex items-center justify-center gap-2"
            >
              {saving ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
              {saving ? "Saving..." : "Save Chatbot Rules"}
            </motion.button>
            {saveMessage && <span className="text-sm font-medium text-emerald-600">{saveMessage}</span>}
          </div>
        </div>

        <div className="space-y-6">
          <Card className="neu-flat border-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-emerald-500" /> Chatbot Status
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="flex items-center justify-between p-4 neu-flat rounded-2xl bg-white/40">
                <div>
                  <h3 className="font-bold">Enable Chatbot</h3>
                  <p className="text-xs neu-text-muted mt-1">Bot will act based on your rules</p>
                </div>
                <button
                  onClick={handleToggle}
                  className={`w-14 h-8 rounded-full transition-colors relative flex items-center ${
                    settings.isActive ? "bg-emerald-500" : "bg-neutral-300 dark:bg-neutral-700"
                  }`}
                >
                  <div
                    className={`w-6 h-6 rounded-full bg-white absolute transition-transform ${
                      settings.isActive ? "translate-x-7" : "translate-x-1"
                    }`}
                  />
                </button>
              </div>

              {settings.isActive ? (
                <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border-l-4 border-emerald-500 rounded-r-xl">
                  <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                    Bot is Active. When users click buttons on the portal or send matching trigger words on WhatsApp, they will receive your automated replies. Conversations are securely saved in the database.
                  </p>
                </div>
              ) : (
                <div className="p-4 bg-neutral-100 dark:bg-neutral-800 rounded-xl text-center">
                  <MessageSquare className="w-8 h-8 text-neutral-400 mx-auto mb-2" />
                  <p className="text-sm text-neutral-500 font-medium">Chatbot is disabled</p>
                  <p className="text-xs text-neutral-400 mt-1">No automated replies will be sent</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
