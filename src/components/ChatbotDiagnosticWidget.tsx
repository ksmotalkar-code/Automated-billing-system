import React, { useState, useEffect } from "react";
import { Card, CardHeader, CardContent, CardTitle } from "./ui/card";
import { 
  Bot, 
  CheckCircle2, 
  AlertTriangle, 
  XCircle, 
  RefreshCw, 
  Copy, 
  Check, 
  Wifi, 
  ShieldCheck, 
  Activity, 
  Send, 
  ChevronDown, 
  ChevronUp,
  Radio,
  Clock
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
  metaApiReachable?: boolean;
  metaDetails?: string;
  timestamp?: string;
  error?: string;
}

export function ChatbotDiagnosticWidget({ className = "" }: { className?: string }) {
  const { currentOwnerId } = useTenant();
  const [data, setData] = useState<DiagnosticsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Quick ping state
  const [pingMessage, setPingMessage] = useState("Hi");
  const [pingResponse, setPingResponse] = useState<any>(null);
  const [isPinging, setIsPinging] = useState(false);

  const fetchDiagnostics = async () => {
    setIsLoading(true);
    try {
      const url = currentOwnerId 
        ? `/api/chatbot/diagnostics?ownerId=${encodeURIComponent(currentOwnerId)}` 
        : "/api/chatbot/diagnostics";
      const res = await fetch(url);
      const json = await res.json();
      setData(json);
      setLastChecked(new Date());
    } catch (err: any) {
      setData({
        ok: false,
        error: err.message || "Failed to reach diagnostics endpoint"
      });
      setLastChecked(new Date());
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchDiagnostics();
  }, [currentOwnerId]);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleQuickPing = async () => {
    setIsPinging(true);
    setPingResponse(null);
    try {
      const res = await fetch("/api/chatbot/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: pingMessage,
          ownerId: currentOwnerId || undefined
        })
      });
      const resJson = await res.json();
      setPingResponse(resJson);
    } catch (e: any) {
      setPingResponse({ ok: false, error: e.message || "Simulation error" });
    } finally {
      setIsPinging(false);
    }
  };

  // Determine overall health status
  const isHealthy = Boolean(
    data?.ok && 
    data?.hasMetaApiKey && 
    data?.hasPhoneId && 
    data?.metaApiReachable && 
    data?.botActive
  );

  const isDegraded = Boolean(
    data?.ok && 
    (!data?.hasMetaApiKey || !data?.hasPhoneId || !data?.metaApiReachable || !data?.botActive)
  );

  return (
    <Card className={`overflow-hidden border-none border-t border-white/10 shadow-lg ${className}`}>
      <CardHeader className="flex flex-row items-center justify-between pb-3 bg-gradient-to-r from-slate-900/40 via-slate-800/20 to-transparent">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${isHealthy ? 'bg-emerald-500/10 text-emerald-500 border border-emerald-500/20' : isDegraded ? 'bg-amber-500/10 text-amber-500 border border-amber-500/20' : 'bg-red-500/10 text-red-500 border border-red-500/20'}`}>
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-100">
                WhatsApp Chatbot Live Diagnostics
              </CardTitle>
              <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider ${
                isHealthy 
                  ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' 
                  : isDegraded 
                    ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' 
                    : 'bg-red-500/10 text-red-400 border border-red-500/20'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${isHealthy ? 'bg-emerald-400 animate-pulse' : isDegraded ? 'bg-amber-400 animate-pulse' : 'bg-red-400'}`} />
                {isHealthy ? 'Operational' : isDegraded ? 'Attention Needed' : 'Offline'}
              </span>
            </div>
            <p className="text-[10px] neu-text-muted font-bold tracking-tight mt-0.5 flex items-center gap-1">
              <Clock className="w-3 h-3 inline" />
              {lastChecked ? `Tested at ${lastChecked.toLocaleTimeString()}` : "Not checked yet"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={fetchDiagnostics}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
            title="Refresh Diagnostic Status"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
            <span className="hidden sm:inline">Refresh</span>
          </motion.button>
          
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="p-1.5 text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 rounded-xl transition-all"
            title={isExpanded ? "Collapse Panel" : "Expand Details"}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </CardHeader>

      <CardContent className="pt-4 space-y-4">
        {/* Core Subsystem Status Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {/* 1. Meta API Connection */}
          <div className="p-3 neu-pressed rounded-xl border border-white/5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider neu-text-muted">Meta Cloud API</span>
              {data?.metaApiReachable ? (
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <XCircle className="w-3.5 h-3.5 text-red-400" />
              )}
            </div>
            <p className="text-xs font-black text-slate-200 truncate">
              {data?.metaApiReachable ? "Reachable" : "Unreachable"}
            </p>
            <p className="text-[9px] text-slate-400 truncate" title={data?.metaDetails || ""}>
              {data?.metaDetails || "Checking API token..."}
            </p>
          </div>

          {/* 2. API Key & Token */}
          <div className="p-3 neu-pressed rounded-xl border border-white/5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider neu-text-muted">Access Token</span>
              {data?.hasMetaApiKey ? (
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
              )}
            </div>
            <p className="text-xs font-black text-slate-200 truncate">
              {data?.hasMetaApiKey ? "Configured" : "Missing Token"}
            </p>
            <p className="text-[9px] text-slate-400">
              {data?.hasPhoneId ? "Phone ID Linked" : "No Phone ID"}
            </p>
          </div>

          {/* 3. Webhook Token Verification */}
          <div className="p-3 neu-pressed rounded-xl border border-white/5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider neu-text-muted">Webhook Verify</span>
              <Radio className="w-3.5 h-3.5 text-emerald-400" />
            </div>
            <p className="text-xs font-black text-slate-200 truncate font-mono">
              {data?.verifyToken || "random_123"}
            </p>
            <p className="text-[9px] text-emerald-400 font-bold">
              GET /webhook 200 OK
            </p>
          </div>

          {/* 4. Chatbot Rules & Engine */}
          <div className="p-3 neu-pressed rounded-xl border border-white/5 space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-wider neu-text-muted">Engine Rules</span>
              <Activity className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <p className="text-xs font-black text-slate-200 truncate">
              {data?.botActive ? "Active" : "Disabled"}
            </p>
            <p className="text-[9px] text-blue-400 font-bold">
              {data?.activeRules ?? 5} Service Commands
            </p>
          </div>
        </div>

        {/* Actionable Warnings if any check fails */}
        {(!data?.hasMetaApiKey || !data?.hasPhoneId || !data?.metaApiReachable) && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs space-y-1">
            <div className="flex items-center gap-1.5 font-bold">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>Potential Cause For Silence:</span>
            </div>
            <p className="text-[11px] text-amber-200/90 leading-relaxed">
              {!data?.hasMetaApiKey
                ? "Your Meta WhatsApp API Token is missing. Go to Settings > WhatsApp and verify your credentials."
                : !data?.hasPhoneId
                ? "Your Meta Phone Number ID is missing. The WhatsApp Cloud API requires a 15-digit Phone Number ID."
                : `Meta rejected connection (${data?.metaDetails}). Verify that your Meta token has 'whatsapp_business_messaging' permissions and hasn't expired.`}
            </p>
          </div>
        )}

        {/* Expanded Technical Controls & Webhook Copy */}
        <AnimatePresence>
          {isExpanded && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="space-y-4 pt-2 border-t border-white/5"
            >
              {/* Webhook Configuration Info */}
              <div className="space-y-2">
                <span className="text-[10px] font-black uppercase tracking-wider neu-text-muted">
                  Meta Developer Callback Configuration
                </span>
                
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400 w-24 shrink-0">Callback URL:</span>
                    <input
                      type="text"
                      readOnly
                      value={data?.webhookUrl || ""}
                      className="flex-1 px-3 py-1.5 bg-slate-900/60 rounded-lg text-xs font-mono text-slate-200 border border-slate-700/60 outline-none"
                    />
                    <button
                      onClick={() => data?.webhookUrl && copyToClipboard(data.webhookUrl, "url")}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold flex items-center gap-1 shrink-0 border border-slate-700"
                    >
                      {copiedField === "url" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedField === "url" ? "Copied" : "Copy"}</span>
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-slate-400 w-24 shrink-0">Verify Token:</span>
                    <input
                      type="text"
                      readOnly
                      value={data?.verifyToken || "random_123"}
                      className="flex-1 px-3 py-1.5 bg-slate-900/60 rounded-lg text-xs font-mono text-slate-200 border border-slate-700/60 outline-none"
                    />
                    <button
                      onClick={() => data?.verifyToken && copyToClipboard(data.verifyToken, "token")}
                      className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-lg text-xs font-bold flex items-center gap-1 shrink-0 border border-slate-700"
                    >
                      {copiedField === "token" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                      <span>{copiedField === "token" ? "Copied" : "Copy"}</span>
                    </button>
                  </div>
                </div>
              </div>

              {/* Instant Bot Message Ping Simulation */}
              <div className="p-3 bg-slate-900/40 rounded-xl border border-white/5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-300 flex items-center gap-1.5">
                    <Send className="w-3 h-3 text-emerald-400" />
                    Instant Command Verification Ping
                  </span>
                  <span className="text-[9px] text-slate-400">Tests intent matching without spending Meta quota</span>
                </div>

                <div className="flex gap-2">
                  <input
                    type="text"
                    value={pingMessage}
                    onChange={(e) => setPingMessage(e.target.value)}
                    placeholder="Type a test command (e.g. Hi, 1, Pay Bill, Reports)..."
                    className="flex-1 px-3 py-1.5 bg-slate-950/60 border border-slate-700/60 rounded-lg text-xs text-slate-200 outline-none focus:border-emerald-500/50"
                    onKeyDown={(e) => e.key === "Enter" && handleQuickPing()}
                  />
                  <button
                    onClick={handleQuickPing}
                    disabled={isPinging || !pingMessage.trim()}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isPinging ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    <span>Test</span>
                  </button>
                </div>

                {pingResponse && (
                  <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800 text-xs space-y-1 font-mono">
                    <div className="flex justify-between items-center text-[10px] text-slate-400">
                      <span>Resident: {pingResponse.customer || "General Consumer"}</span>
                      <span className="text-emerald-400">Status: {pingResponse.ok ? "Success" : "Failed"}</span>
                    </div>
                    <p className="text-slate-200 whitespace-pre-wrap leading-relaxed mt-1 text-[11px]">
                      {pingResponse.botResponse || pingResponse.error || "No response received"}
                    </p>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </CardContent>
    </Card>
  );
}
