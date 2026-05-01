import { useState, useEffect } from "react";
import { Card, CardHeader, CardContent, CardTitle } from "../components/ui/card";
import { MessageSquare, Save, Settings, Database, Activity, RefreshCw } from "lucide-react";
import { ChatbotSettings, getChatbotSettings, saveChatbotSettings } from "../lib/db";
import { motion } from "motion/react";

export function ChatbotView() {
  const [settings, setSettings] = useState<ChatbotSettings>({
    isActive: false,
    apiKey: "",
    knowledgeBase: ""
  });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");

  useEffect(() => {
    const fetchSettings = async () => {
      const data = await getChatbotSettings();
      if (data) setSettings(data);
      setLoading(false);
    };
    fetchSettings();
  }, []);

  const handleSave = async () => {
    if (!settings.apiKey && settings.isActive) {
      setSaveMessage("Please provide an API key to activate the chatbot.");
      return;
    }
    setSaving(true);
    setSaveMessage("");
    await saveChatbotSettings(settings);
    setSaving(false);
    setSaveMessage("Settings saved successfully.");
    setTimeout(() => setSaveMessage(""), 3000);
  };

  const handleToggle = async () => {
    const newSettings = { ...settings, isActive: !settings.isActive };
    setSettings(newSettings);
    // Instant save on toggle if possible, or wait for manual save
    // We do manual save
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
          <h1 className="text-4xl font-black tracking-tight mb-3">AI Chatbot Setup</h1>
          <p className="text-lg neu-text-muted">
            Configure OpenRouter AI chatbot. It uses free AI models to answer your customer queries on WhatsApp automatically.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 space-y-6">
          <Card className="neu-flat border-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-blue-500" /> API Configuration
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <label className="block text-sm font-bold mb-2">OpenRouter API Key (Free Models)</label>
                <input
                  type="password"
                  value={settings.apiKey}
                  onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                  placeholder="sk-or-v1-..."
                  className="w-full p-4 neu-pressed rounded-xl outline-none"
                />
                <p className="text-xs neu-text-muted mt-2">
                  Get your free OpenRouter API key at <a href="https://openrouter.ai/" target="_blank" rel="noreferrer" className="text-blue-500 hover:text-blue-600 underline">OpenRouter.ai</a>. The chatbot is configured to use free models like google/gemini-2.5-flash-lite-preview-02-05:free or local Llama via free tier.
                </p>
              </div>
            </CardContent>
          </Card>

          <Card className="neu-flat border-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Database className="w-5 h-5 text-indigo-500" /> Knowledge Base
              </CardTitle>
            </CardHeader>
            <CardContent>
              <label className="block text-sm font-bold mb-2">Panchayat Information Details</label>
              <p className="text-xs neu-text-muted mb-4">
                Paste all the rules, bill amounts, and contact details from your rulebook here. The AI will strictly follow these rules to answer questions.
              </p>
              <textarea
                value={settings.knowledgeBase}
                onChange={(e) => setSettings({ ...settings, knowledgeBase: e.target.value })}
                className="w-full h-80 p-4 neu-pressed rounded-xl outline-none font-mono text-sm leading-relaxed"
                placeholder={`=== WATER BILL RATES ===
Residential connection: Rs. 150/month flat rate
Commercial connection: Rs. 400/month
New connection fee: Rs. 1000 one-time

=== RULES ===
Bill due date: 10th of every month
Late fee: Rs. 50 after due date
`}
              />
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
              {saving ? "Saving..." : "Save Chatbot Configuration"}
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
                  <p className="text-xs neu-text-muted mt-1">AI will automatically reply on WhatsApp</p>
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
                    Bot is Active. When enabled, incoming WhatsApp messages will be analyzed. If they aren't standard commands, the AI will answer them using the OpenRouter API & your Knowledge Base.
                  </p>
                </div>
              ) : (
                <div className="p-4 bg-neutral-100 dark:bg-neutral-800 rounded-xl text-center">
                  <MessageSquare className="w-8 h-8 text-neutral-400 mx-auto mb-2" />
                  <p className="text-sm text-neutral-500 font-medium">Chatbot is disabled</p>
                  <p className="text-xs text-neutral-400 mt-1">App functions normally</p>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
