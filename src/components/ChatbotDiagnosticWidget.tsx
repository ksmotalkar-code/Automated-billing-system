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
  ShieldCheck, 
  Activity, 
  Send, 
  Radio, 
  Clock,
  Play,
  Users,
  Zap,
  FileText,
  CreditCard,
  History,
  Trash2,
  ChevronDown,
  ChevronUp,
  AlertCircle
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { useTenant } from "../contexts/TenantContext";

export interface DiagnosticsData {
  ok: boolean;
  isRealDiagnostics?: boolean;
  ownerId?: string;
  webhookUrl?: string;
  verifyToken?: string;
  botActive?: boolean;
  activeRules?: number;
  activeCommands?: Array<{ trigger: string; label: string }>;
  hasMetaApiKey?: boolean;
  hasPhoneId?: boolean;
  metaApi?: {
    reachable: boolean;
    verifiedName?: string;
    displayPhone?: string;
    qualityRating?: string;
    codeStatus?: string;
    details?: string;
  };
  webhookProbe?: {
    tested: boolean;
    status: number;
    latencyMs: number;
    challengeVerified: boolean;
    error: string | null;
  };
  consumerStats?: {
    total: number;
    active: number;
    advancePaid: number;
    overdue: number;
  };
  recentLogs?: any[];
  timestamp?: string;
  error?: string;
}

export interface RealCustomerOption {
  id: string;
  name: string;
  mobileNumber: string;
  balance: number;
  advanceBalance: number;
  status: string;
  ward?: string;
}

export function ChatbotDiagnosticWidget({ className = "" }: { className?: string }) {
  const { currentOwnerId } = useTenant();
  const [data, setData] = useState<DiagnosticsData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [lastChecked, setLastChecked] = useState<Date | null>(null);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<"engine" | "suite" | "send_test" | "logs">("engine");

  // Real Customer Selection & Diagnostics
  const [customers, setCustomers] = useState<RealCustomerOption[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>("");
  const [casePreset, setCasePreset] = useState<string>("active_with_due");
  const [customMobile, setCustomMobile] = useState("");
  const [testMessage, setTestMessage] = useState("Download My Bill");
  const [diagnosticResult, setDiagnosticResult] = useState<any>(null);
  const [isRunningTest, setIsRunningTest] = useState(false);

  // Automated Test Suite State
  const [suiteResults, setSuiteResults] = useState<any>(null);
  const [isRunningSuite, setIsRunningSuite] = useState(false);

  // Live WhatsApp Dispatch State
  const [liveSendMobile, setLiveSendMobile] = useState("");
  const [liveSendMessage, setLiveSendMessage] = useState("Test message from Gram Panchayat Water Billing Bot. System is operational!");
  const [liveSendResult, setLiveSendResult] = useState<any>(null);
  const [isSendingLive, setIsSendingLive] = useState(false);

  // Live Logs State
  const [liveLogs, setLiveLogs] = useState<any[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // Probe State
  const [isProbing, setIsProbing] = useState(false);
  const [probeResult, setProbeResult] = useState<any>(null);

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

  const fetchRealCustomers = async () => {
    try {
      const url = currentOwnerId 
        ? `/api/chatbot/real-customers?ownerId=${encodeURIComponent(currentOwnerId)}` 
        : "/api/chatbot/real-customers";
      const res = await fetch(url);
      const json = await res.json();
      if (json.ok && Array.isArray(json.customers)) {
        setCustomers(json.customers);
        if (json.customers.length > 0 && !selectedCustomerId) {
          setSelectedCustomerId(json.customers[0].id);
        }
      }
    } catch (e) {
      console.warn("Could not fetch real customers:", e);
    }
  };

  const fetchLiveLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const url = currentOwnerId 
        ? `/api/chatbot/live-logs?ownerId=${encodeURIComponent(currentOwnerId)}` 
        : "/api/chatbot/live-logs";
      const res = await fetch(url);
      const json = await res.json();
      if (json.ok && Array.isArray(json.logs)) {
        setLiveLogs(json.logs);
      }
    } catch (e) {
      console.warn("Could not fetch live logs:", e);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    fetchDiagnostics();
    fetchRealCustomers();
    fetchLiveLogs();
  }, [currentOwnerId]);

  const copyToClipboard = (text: string, field: string) => {
    navigator.clipboard.writeText(text);
    setCopiedField(field);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const handleRunRealCaseDiagnostic = async (overrideMsg?: string) => {
    setIsRunningTest(true);
    setDiagnosticResult(null);
    const msgToSend = overrideMsg || testMessage;
    try {
      const res = await fetch("/api/chatbot/diagnose-message", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msgToSend,
          customerId: selectedCustomerId || undefined,
          casePreset: !selectedCustomerId ? casePreset : undefined,
          mobile: customMobile || undefined,
          ownerId: currentOwnerId || undefined
        })
      });
      const json = await res.json();
      setDiagnosticResult(json);
      // refresh logs in background
      fetchLiveLogs();
    } catch (e: any) {
      setDiagnosticResult({ ok: false, error: e.message || "Diagnostic execution error" });
    } finally {
      setIsRunningTest(false);
    }
  };

  const handleRunSuite = async () => {
    setIsRunningSuite(true);
    setSuiteResults(null);
    try {
      const res = await fetch("/api/chatbot/run-test-suite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerId: currentOwnerId || undefined
        })
      });
      const json = await res.json();
      setSuiteResults(json);
    } catch (e: any) {
      setSuiteResults({ ok: false, error: e.message });
    } finally {
      setIsRunningSuite(false);
    }
  };

  const handleSendLiveTest = async () => {
    if (!liveSendMobile.trim()) return;
    setIsSendingLive(true);
    setLiveSendResult(null);
    try {
      const res = await fetch("/api/chatbot/send-live-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mobile: liveSendMobile,
          message: liveSendMessage,
          ownerId: currentOwnerId || undefined
        })
      });
      const json = await res.json();
      setLiveSendResult(json);
      fetchLiveLogs();
    } catch (e: any) {
      setLiveSendResult({ ok: false, error: e.message });
    } finally {
      setIsSendingLive(false);
    }
  };

  const handleRunProbe = async () => {
    setIsProbing(true);
    setProbeResult(null);
    try {
      const res = await fetch("/api/chatbot/probe-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: currentOwnerId || undefined })
      });
      const json = await res.json();
      setProbeResult(json);
      fetchDiagnostics();
    } catch (e: any) {
      setProbeResult({ ok: false, error: e.message });
    } finally {
      setIsProbing(false);
    }
  };

  const handleClearLogs = async () => {
    try {
      await fetch("/api/chatbot/clear-logs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ownerId: currentOwnerId || undefined })
      });
      setLiveLogs([]);
    } catch (e) {
      console.warn("Failed to clear logs", e);
    }
  };

  const isHealthy = Boolean(
    data?.ok && 
    data?.hasMetaApiKey && 
    data?.hasPhoneId && 
    data?.metaApi?.reachable && 
    data?.botActive
  );

  const isDegraded = Boolean(
    data?.ok && 
    (!data?.hasMetaApiKey || !data?.hasPhoneId || !data?.metaApi?.reachable || !data?.botActive)
  );

  const selectedCustObj = customers.find(c => c.id === selectedCustomerId);

  return (
    <Card className={`overflow-hidden border-none border-t border-white/10 shadow-xl bg-slate-900/60 backdrop-blur-md ${className}`}>
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 bg-gradient-to-r from-slate-900/80 via-slate-800/40 to-slate-900/60 border-b border-white/5 gap-3">
        <div className="flex items-center gap-3">
          <div className={`p-2.5 rounded-xl ${isHealthy ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : isDegraded ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
            <Bot className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <CardTitle className="text-sm font-black uppercase tracking-wider text-slate-100">
                WhatsApp Chatbot Live Diagnostics & Real-Case Bench
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
              {data?.webhookProbe?.challengeVerified && (
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold bg-blue-500/10 text-blue-300 border border-blue-500/20">
                  <Check className="w-2.5 h-2.5" /> Webhook Probe: 200 OK ({data.webhookProbe.latencyMs}ms)
                </span>
              )}
            </div>
            <p className="text-[10px] text-slate-400 font-bold tracking-tight mt-0.5 flex items-center gap-2">
              <span className="flex items-center gap-1"><Clock className="w-3 h-3 inline" /> {lastChecked ? `Tested at ${lastChecked.toLocaleTimeString()}` : "Not checked yet"}</span>
              <span>•</span>
              <span className="text-emerald-400 font-semibold">{data?.consumerStats ? `${data.consumerStats.total} Registered Consumers (${data.consumerStats.advancePaid} Advance Paid)` : "Connecting database..."}</span>
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={() => { fetchDiagnostics(); fetchLiveLogs(); }}
            disabled={isLoading}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
            title="Refresh Diagnostic Status"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Refresh</span>
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

      <AnimatePresence>
        {isExpanded && (
          <CardContent className="pt-4 space-y-5">
            {/* Core Subsystem Status Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* 1. Meta API Connection */}
              <div className="p-3 bg-slate-950/60 rounded-xl border border-white/5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Meta Cloud API</span>
                  {data?.metaApi?.reachable ? (
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <XCircle className="w-3.5 h-3.5 text-red-400" />
                  )}
                </div>
                <p className="text-xs font-black text-slate-200 truncate">
                  {data?.metaApi?.reachable ? "Reachable" : "Unreachable"}
                </p>
                <p className="text-[9px] text-slate-400 truncate" title={data?.metaApi?.details || ""}>
                  {data?.metaApi?.verifiedName || data?.metaApi?.displayPhone || data?.metaApi?.details || "Checking API token..."}
                </p>
                {data?.metaApi?.qualityRating && (
                  <span className="inline-block text-[8px] font-bold uppercase px-1.5 py-0.2 rounded bg-emerald-500/10 text-emerald-300">
                    Quality: {data.metaApi.qualityRating}
                  </span>
                )}
              </div>

              {/* 2. Webhook Callback Probe */}
              <div className="p-3 bg-slate-950/60 rounded-xl border border-white/5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Webhook Probe</span>
                  {data?.webhookProbe?.challengeVerified ? (
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  ) : (
                    <AlertTriangle className="w-3.5 h-3.5 text-amber-400" />
                  )}
                </div>
                <p className="text-xs font-black text-slate-200 truncate">
                  {data?.webhookProbe?.challengeVerified ? "Handshake Verified" : "Probe Pending"}
                </p>
                <button
                  onClick={handleRunProbe}
                  disabled={isProbing}
                  className="text-[9px] text-blue-400 hover:text-blue-300 underline font-bold flex items-center gap-1"
                >
                  {isProbing ? "Probing..." : `Self-Test (${data?.webhookProbe?.latencyMs ?? 0}ms)`}
                </button>
              </div>

              {/* 3. Verification Token & Callback */}
              <div className="p-3 bg-slate-950/60 rounded-xl border border-white/5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Verify Token</span>
                  <Radio className="w-3.5 h-3.5 text-emerald-400" />
                </div>
                <p className="text-xs font-black text-slate-200 truncate font-mono">
                  {data?.verifyToken || "Not Set"}
                </p>
                <p className="text-[9px] text-emerald-400 font-bold">
                  GET /webhook 200 OK
                </p>
              </div>

              {/* 4. Engine & Service Rules */}
              <div className="p-3 bg-slate-950/60 rounded-xl border border-white/5 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Bot Engine Rules</span>
                  <Activity className="w-3.5 h-3.5 text-blue-400" />
                </div>
                <p className="text-xs font-black text-slate-200 truncate">
                  {data?.botActive ? "Active & Routing" : "Disabled"}
                </p>
                <p className="text-[9px] text-blue-400 font-bold">
                  {data?.activeRules ?? 6} Active Service Commands
                </p>
              </div>
            </div>

            {/* Actionable Warnings if configuration is incomplete */}
            {(!data?.hasMetaApiKey || !data?.hasPhoneId || !data?.metaApi?.reachable) && (
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs space-y-1">
                <div className="flex items-center gap-1.5 font-bold">
                  <AlertTriangle className="w-4 h-4 text-amber-400" />
                  <span>Action Needed For Live WhatsApp Messages:</span>
                </div>
                <p className="text-[11px] text-amber-200/90 leading-relaxed">
                  {!data?.hasMetaApiKey
                    ? "Your Meta WhatsApp API Token is missing. Go to Settings > WhatsApp and enter your permanent Access Token."
                    : !data?.hasPhoneId
                    ? "Your Meta Phone Number ID is missing. Please enter your 15-digit Phone Number ID from the Meta Developer Portal."
                    : `Meta API returned: ${data?.metaApi?.details || "Unauthorized"}. Ensure your token has 'whatsapp_business_messaging' permissions.`}
                </p>
              </div>
            )}

            {/* Diagnostic Navigation Tabs */}
            <div className="flex border-b border-white/10 gap-2 text-xs">
              <button
                onClick={() => setActiveTab("engine")}
                className={`pb-2 px-3 font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                  activeTab === "engine" 
                    ? "border-emerald-500 text-emerald-400" 
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <Zap className="w-3.5 h-3.5" />
                <span>Real Case Diagnostics</span>
              </button>
              <button
                onClick={() => setActiveTab("suite")}
                className={`pb-2 px-3 font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                  activeTab === "suite" 
                    ? "border-emerald-500 text-emerald-400" 
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <Play className="w-3.5 h-3.5" />
                <span>Automated Test Suite (6 Cases)</span>
              </button>
              <button
                onClick={() => setActiveTab("send_test")}
                className={`pb-2 px-3 font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                  activeTab === "send_test" 
                    ? "border-emerald-500 text-emerald-400" 
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <Send className="w-3.5 h-3.5" />
                <span>Send Live WhatsApp Message</span>
              </button>
              <button
                onClick={() => { setActiveTab("logs"); fetchLiveLogs(); }}
                className={`pb-2 px-3 font-bold border-b-2 transition-all flex items-center gap-1.5 ${
                  activeTab === "logs" 
                    ? "border-emerald-500 text-emerald-400" 
                    : "border-transparent text-slate-400 hover:text-slate-200"
                }`}
              >
                <History className="w-3.5 h-3.5" />
                <span>Live Event Stream ({liveLogs.length})</span>
              </button>
            </div>

            {/* TAB 1: REAL CASE ENGINE DIAGNOSTICS */}
            {activeTab === "engine" && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {/* Customer / Scenario Selector */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                      <Users className="w-3 h-3 text-emerald-400" />
                      Select Real Database Consumer:
                    </label>
                    <select
                      value={selectedCustomerId}
                      onChange={(e) => {
                        setSelectedCustomerId(e.target.value);
                        setCustomMobile("");
                      }}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-slate-200 outline-none focus:border-emerald-500 font-medium"
                    >
                      <option value="">-- Choose From Real Registered Villagers --</option>
                      {customers.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.id}) - Bal: ₹{c.balance} | Adv: ₹{c.advanceBalance} ({c.status})
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Or Pick Case Preset */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Or Test Real Scenario Preset:
                    </label>
                    <select
                      value={selectedCustomerId ? "" : casePreset}
                      onChange={(e) => {
                        setSelectedCustomerId("");
                        setCasePreset(e.target.value);
                      }}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-slate-200 outline-none focus:border-emerald-500 font-medium"
                    >
                      <option value="active_with_due">Active Resident (Pending Bill Due)</option>
                      <option value="advance_paid">Advance-Paid Resident (Credit Balance)</option>
                      <option value="suspended">Suspended Resident (Overdue Notice)</option>
                      <option value="unregistered">Unregistered Citizen (New Visitor Flow)</option>
                    </select>
                  </div>

                  {/* Optional Custom Mobile */}
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Manual Mobile Number Lookup:
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 9876543210"
                      value={customMobile}
                      onChange={(e) => {
                        setCustomMobile(e.target.value);
                        setSelectedCustomerId("");
                      }}
                      className="w-full px-3 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-slate-200 outline-none focus:border-emerald-500 font-mono"
                    />
                  </div>
                </div>

                {/* Selected Resident Snapshot Pill */}
                {selectedCustObj && (
                  <div className="p-2.5 bg-slate-950/80 rounded-xl border border-emerald-500/20 flex flex-wrap items-center justify-between gap-2 text-xs">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-200">{selectedCustObj.name}</span>
                      <span className="text-[10px] font-mono text-slate-400">({selectedCustObj.id})</span>
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold ${selectedCustObj.advanceBalance > 0 ? 'bg-emerald-500/20 text-emerald-300' : selectedCustObj.balance > 0 ? 'bg-amber-500/20 text-amber-300' : 'bg-blue-500/20 text-blue-300'}`}>
                        {selectedCustObj.advanceBalance > 0 ? `Advance Paid (Credit: ₹${selectedCustObj.advanceBalance})` : `Due: ₹${selectedCustObj.balance}`}
                      </span>
                    </div>
                    <span className="text-[10px] font-mono text-slate-400">Mobile: {selectedCustObj.mobileNumber || "N/A"}</span>
                  </div>
                )}

                {/* Command & Quick Buttons */}
                <div className="space-y-2">
                  <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Incoming Citizen Message To Test:
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={testMessage}
                      onChange={(e) => setTestMessage(e.target.value)}
                      placeholder="Type command (e.g. Download My Bill, Pay Bill, Check Balance, Complaint)..."
                      className="flex-1 px-3.5 py-2 bg-slate-950 border border-slate-700/80 rounded-xl text-xs text-slate-200 outline-none focus:border-emerald-500"
                      onKeyDown={(e) => e.key === "Enter" && handleRunRealCaseDiagnostic()}
                    />
                    <button
                      onClick={() => handleRunRealCaseDiagnostic()}
                      disabled={isRunningTest || !testMessage.trim()}
                      className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-md shadow-emerald-950"
                    >
                      {isRunningTest ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                      <span>Run Real Case</span>
                    </button>
                  </div>

                  {/* Preset Buttons */}
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {[
                      "Download My Bill",
                      "Pay Bill",
                      "Check Balance",
                      "Reports",
                      "Complaint: pipe leakage in ward 2",
                      "Menu",
                      "1",
                      "2"
                    ].map((btn) => (
                      <button
                        key={btn}
                        onClick={() => {
                          setTestMessage(btn);
                          handleRunRealCaseDiagnostic(btn);
                        }}
                        className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold rounded-lg border border-slate-700 transition-colors"
                      >
                        {btn}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Real Diagnostic Execution Result */}
                {diagnosticResult && (
                  <motion.div
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="p-4 bg-slate-950/90 rounded-2xl border border-slate-800 space-y-3 font-mono text-xs"
                  >
                    <div className="flex flex-wrap items-center justify-between pb-2 border-b border-white/5 text-[11px] gap-2">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-400">Target Consumer:</span>
                        <span className="text-emerald-400 font-bold">{diagnosticResult.customer?.name} ({diagnosticResult.customer?.id})</span>
                        <span className="text-[10px] text-slate-400">Status: {diagnosticResult.customer?.status}</span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className="text-blue-400">Rule: {diagnosticResult.intentMatched}</span>
                        <span className="text-slate-400">Latency: {diagnosticResult.latencyMs}ms</span>
                      </div>
                    </div>

                    <div className="space-y-1.5">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block font-sans">
                        Generated WhatsApp Bot Response (Real Database Interpolation):
                      </span>
                      <div className="p-3 bg-slate-900/90 rounded-xl border border-white/5 text-slate-200 whitespace-pre-wrap leading-relaxed text-[11px]">
                        {diagnosticResult.botResponse || diagnosticResult.error}
                      </div>
                    </div>

                    {diagnosticResult.attachments && diagnosticResult.attachments.length > 0 && (
                      <div className="p-2.5 bg-emerald-500/5 rounded-xl border border-emerald-500/20 text-[10px] text-emerald-300 flex items-center gap-2 font-sans font-bold">
                        <FileText className="w-4 h-4 text-emerald-400" />
                        <span>Real Attachment Prepared: {diagnosticResult.attachments.map((a: any) => a.name).join(", ")}</span>
                      </div>
                    )}
                  </motion.div>
                )}
              </div>
            )}

            {/* TAB 2: AUTOMATED REAL CASES TEST SUITE */}
            {activeTab === "suite" && (
              <div className="space-y-4">
                <div className="flex items-center justify-between bg-slate-950/60 p-3 rounded-xl border border-white/5">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-200">
                      Standard Village Scheme Automated Test Suite
                    </h4>
                    <p className="text-[10px] text-slate-400">
                      Executes all 6 canonical real cases (active with due, advance credit, balance inquiry, menu, complaints, unregistered) against live database.
                    </p>
                  </div>
                  <button
                    onClick={handleRunSuite}
                    disabled={isRunningSuite}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isRunningSuite ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Play className="w-3.5 h-3.5" />}
                    <span>Run All 6 Real Cases</span>
                  </button>
                </div>

                {suiteResults && (
                  <div className="space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-300 px-1">
                      <span>Suite Result: {suiteResults.suitePassed ? "✅ ALL TESTS PASSED" : "⚠️ ISSUES DETECTED"}</span>
                      <span className="text-[10px] text-slate-400">Executed at {new Date(suiteResults.executedAt).toLocaleTimeString()}</span>
                    </div>

                    <div className="grid grid-cols-1 gap-2">
                      {suiteResults.results?.map((res: any, idx: number) => (
                        <div key={idx} className="p-3 bg-slate-950/70 rounded-xl border border-white/5 space-y-1 text-xs">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              {res.passed ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
                              <span className="font-bold text-slate-200">{res.name}</span>
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">{res.durationMs}ms</span>
                          </div>
                          <p className="text-[10px] text-slate-400 font-mono">
                            Input: &quot;{res.testedInput}&quot; • Target: {res.testedCustomer} • Rule: {res.intentMatched}
                          </p>
                          <p className="text-[11px] text-slate-300 font-sans italic bg-black/20 p-2 rounded-lg">
                            &quot;{res.botReplySnippet}&quot;
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* TAB 3: SEND LIVE WHATSAPP MESSAGE */}
            {activeTab === "send_test" && (
              <div className="space-y-4">
                <div className="p-4 bg-slate-950/60 rounded-2xl border border-white/5 space-y-3">
                  <div>
                    <h4 className="text-xs font-black uppercase tracking-wider text-slate-200 flex items-center gap-1.5">
                      <Send className="w-3.5 h-3.5 text-emerald-400" />
                      Live WhatsApp Test Dispatch (Direct To Meta Cloud API)
                    </h4>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      Sends a real WhatsApp message to an actual phone number using your configured Meta WhatsApp credentials.
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Recipient Mobile Number (e.g. 919876543210):
                      </label>
                      <input
                        type="text"
                        placeholder="e.g. 919876543210"
                        value={liveSendMobile}
                        onChange={(e) => setLiveSendMobile(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-slate-200 outline-none focus:border-emerald-500 font-mono"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        Custom Test Message:
                      </label>
                      <input
                        type="text"
                        value={liveSendMessage}
                        onChange={(e) => setLiveSendMessage(e.target.value)}
                        className="w-full px-3 py-2 bg-slate-900 border border-slate-700/80 rounded-xl text-xs text-slate-200 outline-none focus:border-emerald-500"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleSendLiveTest}
                    disabled={isSendingLive || !liveSendMobile.trim()}
                    className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center gap-1.5 shadow-md shadow-emerald-950"
                  >
                    {isSendingLive ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                    <span>Dispatch Real WhatsApp Message</span>
                  </button>

                  {liveSendResult && (
                    <motion.div
                      initial={{ opacity: 0, y: 4 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`p-3 rounded-xl border text-xs font-mono space-y-1 ${
                        liveSendResult.ok 
                          ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-300' 
                          : 'bg-red-500/10 border-red-500/20 text-red-300'
                      }`}
                    >
                      <div className="flex justify-between items-center font-bold">
                        <span>{liveSendResult.ok ? "✅ Dispatched Successfully to Meta API" : "❌ Meta API Error"}</span>
                        <span>{liveSendResult.latencyMs ? `${liveSendResult.latencyMs}ms` : ""}</span>
                      </div>
                      <p className="text-[11px] leading-relaxed">
                        {liveSendResult.ok 
                          ? `Meta Message ID: ${liveSendResult.metaMessageId || "OK"}. Sent at ${liveSendResult.sentAt}` 
                          : `Error: ${liveSendResult.error}`}
                      </p>
                    </motion.div>
                  )}
                </div>
              </div>
            )}

            {/* TAB 4: LIVE EVENT LOGS STREAM */}
            {activeTab === "logs" && (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    Live Webhook & Bot Message Audit Stream
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={fetchLiveLogs}
                      disabled={isLoadingLogs}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold rounded-lg transition-colors flex items-center gap-1"
                    >
                      <RefreshCw className={`w-3 h-3 ${isLoadingLogs ? 'animate-spin' : ''}`} />
                      <span>Refresh Stream</span>
                    </button>
                    <button
                      onClick={handleClearLogs}
                      className="px-2.5 py-1 bg-slate-800 hover:bg-red-950 text-slate-400 hover:text-red-300 text-[10px] font-bold rounded-lg transition-colors flex items-center gap-1"
                    >
                      <Trash2 className="w-3 h-3" />
                      <span>Clear</span>
                    </button>
                  </div>
                </div>

                {liveLogs.length === 0 ? (
                  <div className="p-6 bg-slate-950/60 rounded-xl border border-white/5 text-center text-xs text-slate-400">
                    No live WhatsApp events recorded yet. Inbound webhook events from citizens and outbound test dispatches will appear here in real-time.
                  </div>
                ) : (
                  <div className="max-h-72 overflow-y-auto space-y-2 pr-1">
                    {liveLogs.map((log: any) => (
                      <div key={log.id} className="p-3 bg-slate-950/70 rounded-xl border border-white/5 space-y-1 text-xs">
                        <div className="flex items-center justify-between text-[10px]">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-0.5 rounded-full font-bold uppercase ${
                              log.direction === 'inbound' ? 'bg-blue-500/20 text-blue-300' : 'bg-emerald-500/20 text-emerald-300'
                            }`}>
                              {log.direction}
                            </span>
                            <span className="font-bold text-slate-200">{log.senderName || "Citizen"} (+{log.mobile})</span>
                          </div>
                          <span className="text-slate-400 font-mono">{log.createdAtIso ? new Date(log.createdAtIso).toLocaleTimeString() : "Just now"}</span>
                        </div>
                        {log.messageBody && (
                          <p className="text-[11px] text-slate-300 font-mono">
                            <span className="text-slate-400">Message:</span> &quot;{log.messageBody}&quot;
                          </p>
                        )}
                        {log.replyText && (
                          <p className="text-[11px] text-emerald-300/90 font-mono">
                            <span className="text-slate-400">Bot Reply:</span> &quot;{log.replyText.slice(0, 120)}{log.replyText.length > 120 ? '...' : ''}&quot;
                          </p>
                        )}
                        {log.error && (
                          <p className="text-[10px] text-red-400 font-mono">
                            Error: {log.error}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Meta Developer Webhook Reference Box */}
            <div className="pt-2 border-t border-white/5 space-y-2">
              <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                Meta Developer App Callback Parameters
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div className="flex items-center gap-2 p-2 bg-slate-950/60 rounded-xl border border-slate-800 text-xs font-mono text-slate-300">
                  <span className="text-[10px] text-slate-400 w-16 shrink-0">Callback:</span>
                  <span className="truncate flex-1">{data?.webhookUrl || `${window.location.origin}/api/whatsapp-webhook`}</span>
                  <button
                    onClick={() => copyToClipboard(data?.webhookUrl || `${window.location.origin}/api/whatsapp-webhook`, "url")}
                    className="p-1 text-slate-400 hover:text-slate-200"
                  >
                    {copiedField === "url" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
                <div className="flex items-center gap-2 p-2 bg-slate-950/60 rounded-xl border border-slate-800 text-xs font-mono text-slate-300">
                  <span className="text-[10px] text-slate-400 w-20 shrink-0">Verify Token:</span>
                  <span className="truncate flex-1 font-bold text-blue-400">{data?.verifyToken || "Not Set"}</span>
                  <button
                    onClick={() => copyToClipboard(data?.verifyToken || "", "token")}
                    className="p-1 text-slate-400 hover:text-slate-200"
                  >
                    {copiedField === "token" ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                  </button>
                </div>
              </div>
            </div>
          </CardContent>
        )}
      </AnimatePresence>
    </Card>
  );
}
