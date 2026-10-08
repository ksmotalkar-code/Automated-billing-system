import React, { useState, useEffect } from "react";
import { 
  Bot, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  RefreshCw, 
  Copy, 
  Check, 
  ExternalLink, 
  Send, 
  Power, 
  Radio, 
  Sparkles,
  ChevronDown,
  ChevronUp,
  MessageSquare
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useTenant } from "../contexts/TenantContext";

export interface DiagnosticsData {
  ok: boolean;
  ownerId?: string;
  webhookUrl?: string;
  verifyToken?: string;
  botActive?: boolean;
  activeRules?: number;
  hasMetaApiKey?: boolean;
  hasPhoneId?: boolean;
  isDataUseCheckup?: boolean;
  dataUseCheckupGuide?: string | null;
  metaApi?: {
    reachable: boolean;
    verifiedName?: string;
    displayPhone?: string;
    qualityRating?: string;
    details?: string;
    isDataUseCheckup?: boolean;
  };
  metaDetails?: string;
  recentLogs?: any[];
  timestamp?: string;
  error?: string;
}

export function ChatbotDiagnosticWidget({ className = "" }: { className?: string }) {
  const { currentOwnerId } = useTenant();
  const [data, setData] = useState<DiagnosticsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);

  // Quick Test State
  const [testMobile, setTestMobile] = useState("");
  const [isSendingTest, setIsSendingTest] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  // Bot Toggle State
  const [isTogglingBot, setIsTogglingBot] = useState(false);

  // Live Logs
  const [recentLogs, setRecentLogs] = useState<any[]>([]);

  const fetchDiagnostics = async () => {
    setIsLoading(true);
    try {
      const url = currentOwnerId 
        ? `/api/chatbot/diagnostics?ownerId=${encodeURIComponent(currentOwnerId)}` 
        : "/api/chatbot/diagnostics";
      const res = await fetch(url);
      const json = await res.json();
      setData(json);
      if (Array.isArray(json.recentLogs)) {
        setRecentLogs(json.recentLogs.slice(0, 5));
      }
    } catch (err: any) {
      setData({
        ok: false,
        error: err.message || "Failed to reach diagnostics endpoint"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const fetchLogs = async () => {
    try {
      const url = currentOwnerId 
        ? `/api/chatbot/live-logs?ownerId=${encodeURIComponent(currentOwnerId)}` 
        : "/api/chatbot/live-logs";
      const res = await fetch(url);
      const json = await res.json();
      if (json.ok && Array.isArray(json.logs)) {
        setRecentLogs(json.logs.slice(0, 5));
      }
    } catch (e) {
      // quiet fallback
    }
  };

  useEffect(() => {
    fetchDiagnostics();
    fetchLogs();
  }, [currentOwnerId]);

  const copyToClipboard = (text: string, field: string) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleToggleBot = async () => {
    setIsTogglingBot(true);
    try {
      const newTarget = !data?.botActive;
      const res = await fetch("/api/chatbot/toggle-active", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerId: currentOwnerId || undefined,
          active: newTarget
        })
      });
      const json = await res.json();
      if (json.ok) {
        setData(prev => prev ? { ...prev, botActive: json.botActive } : prev);
      }
    } catch (err) {
      console.warn("Failed to toggle bot active state", err);
    } finally {
      setIsTogglingBot(false);
    }
  };

  const handleSendQuickTest = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanMobile = testMobile.replace(/\D/g, "");
    if (!cleanMobile) return;

    setIsSendingTest(true);
    setTestResult(null);

    try {
      const res = await fetch("/api/chatbot/send-live-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mobile: cleanMobile,
          message: "Namaste! This is a test message from your Gram Panchayat Smart Water Billing system. Everything is connected and working!",
          ownerId: currentOwnerId || undefined
        })
      });
      const json = await res.json();
      if (json.ok || json.success) {
        setTestResult({
          ok: true,
          message: `✅ Message sent successfully to ${cleanMobile}!`
        });
        fetchLogs();
      } else {
        setTestResult({
          ok: false,
          message: `❌ ${json.error || json.message || "Meta API rejected message dispatch"}`
        });
      }
    } catch (err: any) {
      setTestResult({
        ok: false,
        message: `❌ Network error: ${err.message || "Failed to reach server"}`
      });
    } finally {
      setIsSendingTest(false);
    }
  };

  const isMetaDisrupted = Boolean(
    data?.isDataUseCheckup || 
    data?.metaDetails?.toLowerCase().includes("data use checkup") ||
    data?.metaApi?.details?.toLowerCase().includes("data use checkup")
  );

  const isConnected = Boolean(
    data?.ok && 
    data?.hasMetaApiKey && 
    data?.hasPhoneId && 
    data?.metaApi?.reachable && 
    !isMetaDisrupted
  );

  const isBotRunning = Boolean(data?.botActive);

  return (
    <div className={`rounded-3xl border border-white/10 bg-slate-900/90 shadow-2xl backdrop-blur-xl overflow-hidden transition-all text-white ${className}`}>
      {/* Top Header */}
      <div className="p-4 sm:p-5 flex items-center justify-between border-b border-white/10 bg-gradient-to-r from-slate-900 via-slate-800/80 to-slate-900">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shadow-lg ${
            isMetaDisrupted 
              ? "bg-amber-500/20 text-amber-400 border border-amber-500/30" 
              : isConnected && isBotRunning 
                ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30" 
                : "bg-blue-500/20 text-blue-400 border border-blue-500/30"
          }`}>
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-sm sm:text-base text-white tracking-tight">
                WhatsApp Chatbot Live Status
              </h3>
              <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                isMetaDisrupted
                  ? "bg-amber-500/20 text-amber-300 border border-amber-500/40"
                  : isConnected && isBotRunning
                    ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40"
                    : "bg-rose-500/20 text-rose-300 border border-rose-500/40"
              }`}>
                {isMetaDisrupted 
                  ? "Action Required on Meta" 
                  : isConnected && isBotRunning 
                    ? "100% Operational" 
                    : !isConnected 
                      ? "API Attention Needed" 
                      : "Bot Paused"}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Live automated responses & customer billing helpline
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => { fetchDiagnostics(); fetchLogs(); }}
            disabled={isLoading}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all disabled:opacity-50 border border-white/5"
            title="Refresh Status"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin text-emerald-400" : ""}`} />
          </button>
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all border border-white/5"
            title={isExpanded ? "Collapse" : "Expand"}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <div className="p-4 sm:p-6 space-y-5">
            {/* 1. Critical Alert: Meta Data Use Checkup */}
            {isMetaDisrupted && (
              <motion.div
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                className="p-4 sm:p-5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-200 space-y-3"
              >
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <h4 className="font-bold text-sm text-amber-300">
                      Meta Action Required: Complete "Data Use Checkup"
                    </h4>
                    <p className="text-xs text-amber-200/90 leading-relaxed">
                      Your Access Token is valid in Meta Debugger, but Meta has temporarily paused live message sending for your App. To restore it immediately (takes 1 minute):
                    </p>
                    <ol className="text-xs text-amber-200/90 list-decimal list-inside space-y-1 pt-1 font-medium">
                      <li>Log into the <span className="font-bold text-white">Meta Developer Dashboard</span>.</li>
                      <li>Click on your App and look at the top alert banner: <span className="font-bold text-white">"Complete Data Use Checkup"</span>.</li>
                      <li>Click the banner, certify compliance, and click <span className="font-bold text-white">Submit</span>. Live WhatsApp messages will resume instantly!</li>
                    </ol>
                  </div>
                </div>

                <div className="flex items-center justify-end pt-1">
                  <a
                    href="https://developers.facebook.com/apps/"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-black text-xs uppercase tracking-wider hover:bg-amber-400 transition-colors shadow-lg shadow-amber-500/20"
                  >
                    <span>Open Meta Developer Dashboard</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                </div>
              </motion.div>
            )}

            {/* 2. Three Simple Core Status Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
              {/* Card A: Meta Cloud API */}
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Meta Cloud API
                  </span>
                  {isConnected ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <XCircle className="w-4 h-4 text-rose-400" />
                  )}
                </div>
                <div className="font-bold text-sm text-white">
                  {isConnected ? "Connected & Active" : isMetaDisrupted ? "Checkup Required" : "Offline / Unreachable"}
                </div>
                <p className="text-xs text-slate-400 truncate" title={data?.metaDetails || ""}>
                  {data?.metaApi?.verifiedName || data?.metaApi?.displayPhone || data?.metaDetails || "Checking API..."}
                </p>
              </div>

              {/* Card B: Chatbot Engine Toggle */}
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Chatbot Engine
                  </span>
                  <button
                    type="button"
                    onClick={handleToggleBot}
                    disabled={isTogglingBot}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider transition-all shadow-sm ${
                      isBotRunning
                        ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 hover:bg-rose-500/20 hover:text-rose-300 hover:border-rose-500/30"
                        : "bg-slate-800 text-slate-400 border border-white/10 hover:bg-emerald-500/20 hover:text-emerald-300"
                    }`}
                  >
                    <Power className={`w-3 h-3 ${isTogglingBot ? "animate-spin" : ""}`} />
                    <span>{isBotRunning ? "Active (ON)" : "Turn ON"}</span>
                  </button>
                </div>
                <div className="font-bold text-sm text-white">
                  {isBotRunning ? "Automated Replies Enabled" : "Bot is Currently Paused"}
                </div>
                <p className="text-xs text-slate-400">
                  {data?.activeRules ? `${data.activeRules} Menu Commands Ready` : "All Services Available"}
                </p>
              </div>

              {/* Card C: Webhook Integration */}
              <div className="p-4 rounded-2xl bg-slate-950/60 border border-white/5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    Meta Webhook
                  </span>
                  <Radio className="w-4 h-4 text-emerald-400 animate-pulse" />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => copyToClipboard(data?.webhookUrl || "", "url")}
                    className="flex-1 py-1 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors flex items-center justify-center gap-1.5 border border-white/5"
                  >
                    {copiedField === "url" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedField === "url" ? "Copied URL!" : "Copy Webhook URL"}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => copyToClipboard(data?.verifyToken || "", "token")}
                    className="py-1 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold transition-colors flex items-center justify-center gap-1.5 border border-white/5"
                  >
                    {copiedField === "token" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    <span>{copiedField === "token" ? "Copied!" : "Token"}</span>
                  </button>
                </div>
                <p className="text-xs text-slate-400 font-mono truncate">
                  Token: {data?.verifyToken || "Not Set"}
                </p>
              </div>
            </div>

            {/* 3. Simple 1-Click WhatsApp Quick Test */}
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-950/40 border border-white/5 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="font-bold text-sm text-slate-200 flex items-center gap-2">
                  <Send className="w-4 h-4 text-emerald-400" />
                  <span>Send Quick Test WhatsApp Message</span>
                </h4>
                <span className="text-xs text-slate-500">Instant Real Network Test</span>
              </div>

              <form onSubmit={handleSendQuickTest} className="flex flex-col sm:flex-row gap-2.5">
                <input
                  type="tel"
                  placeholder="Enter 10-digit Mobile Number (e.g. 9876543210)"
                  value={testMobile}
                  onChange={(e) => setTestMobile(e.target.value)}
                  className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 border border-white/10 text-white placeholder-slate-500 text-sm font-medium outline-none focus:border-emerald-500 transition-colors"
                  required
                />
                <button
                  type="submit"
                  disabled={isSendingTest || !testMobile.trim()}
                  className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider flex items-center justify-center gap-2 transition-all shadow-lg shadow-emerald-900/30 disabled:opacity-50"
                >
                  <Send className={`w-3.5 h-3.5 ${isSendingTest ? "animate-spin" : ""}`} />
                  <span>{isSendingTest ? "Sending..." : "Send Test WhatsApp"}</span>
                </button>
              </form>

              {testResult && (
                <div className={`p-3 rounded-xl text-xs font-bold leading-relaxed border ${
                  testResult.ok 
                    ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-300" 
                    : "bg-rose-500/10 border-rose-500/20 text-rose-300"
                }`}>
                  {testResult.message}
                </div>
              )}
            </div>

            {/* 4. Recent WhatsApp Events Feed */}
            {recentLogs.length > 0 && (
              <div className="space-y-2 pt-1 border-t border-white/5">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-blue-400" />
                    <span>Recent Incoming & Outgoing Messages</span>
                  </span>
                  <span className="text-[10px] text-slate-500">Live webhook stream</span>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                  {recentLogs.map((log: any, idx: number) => (
                    <div
                      key={log.id || idx}
                      className="p-2.5 rounded-xl bg-slate-950/60 border border-white/5 flex items-center justify-between text-xs gap-3"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider ${
                          log.direction === "inbound" || log.role === "user"
                            ? "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                            : "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                        }`}>
                          {log.direction || log.role || "event"}
                        </span>
                        <span className="font-semibold text-slate-300 truncate">
                          {log.mobile || log.senderName || log.phone || "Resident"}:
                        </span>
                        <span className="text-slate-400 truncate">
                          {log.messageBody || log.content || log.message || "Message"}
                        </span>
                      </div>
                      <span className="text-[10px] text-slate-500 flex-shrink-0">
                        {log.createdAtIso ? new Date(log.createdAtIso).toLocaleTimeString() : "Just now"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
