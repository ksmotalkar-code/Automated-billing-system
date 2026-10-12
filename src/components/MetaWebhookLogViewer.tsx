import React, { useState, useEffect } from 'react';
import { 
  Radio, 
  Terminal, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  Copy, 
  Check, 
  RefreshCw, 
  Play, 
  Trash2, 
  Filter, 
  Search, 
  ChevronDown, 
  ChevronUp, 
  ExternalLink, 
  ShieldCheck, 
  Code,
  ArrowDownLeft,
  Activity,
  Send
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { authFetch } from '../lib/api';
import { useTenant } from '../contexts/TenantContext';

export interface RawWebhookLog {
  id: string;
  ownerId: string;
  receivedAt: string;
  clientIp: string;
  userAgent?: string;
  signaturePresent: boolean;
  signatureVerified: boolean;
  rawBody: any;
  summary: string;
  eventType: 'message' | 'status' | 'error' | 'verification' | 'other';
  messagesCount: number;
  statusesCount: number;
  errorsCount: number;
  simulated?: boolean;
}

interface Props {
  className?: string;
  isCompact?: boolean;
}

export const MetaWebhookLogViewer: React.FC<Props> = ({ 
  className = '',
  isCompact = false 
}) => {
  const { currentOwnerId } = useTenant();
  const [logs, setLogs] = useState<RawWebhookLog[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [filterType, setFilterType] = useState<'all' | 'message' | 'status' | 'error'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [simulating, setSimulating] = useState(false);
  const [simResult, setSimResult] = useState<string | null>(null);

  const fetchRawLogs = async () => {
    setIsLoading(true);
    try {
      const url = currentOwnerId 
        ? `/api/whatsapp-webhook/raw-logs?ownerId=${encodeURIComponent(currentOwnerId)}`
        : '/api/whatsapp-webhook/raw-logs';
      const res = await authFetch(url);
      let json: any = {};
      try {
        json = await res.json();
      } catch (e) {
        json = { ok: false, logs: [] };
      }
      if (json.ok && Array.isArray(json.logs)) {
        setLogs(json.logs);
      }
    } catch (err) {
      console.warn('Failed to fetch raw webhook logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchRawLogs();
  }, [currentOwnerId]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchRawLogs();
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, currentOwnerId]);

  const handleClearLogs = async () => {
    if (!window.confirm('Clear all raw webhook receipt logs?')) return;
    try {
      await authFetch('/api/whatsapp-webhook/clear-raw-logs', { method: 'POST' });
      setLogs([]);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSimulateWebhook = async () => {
    setSimulating(true);
    setSimResult(null);
    try {
      const res = await authFetch('/api/whatsapp-webhook/simulate-ping', {
        method: 'POST',
        body: JSON.stringify({
          ownerId: currentOwnerId || 'system',
          messageText: 'BILL',
          fromMobile: '919876543210',
          senderName: 'Test Resident'
        })
      });
      const data = await res.json();
      if (data.ok) {
        setSimResult('Simulated Meta webhook POST received and processed successfully!');
        fetchRawLogs();
      } else {
        setSimResult(`Simulation failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      setSimResult(`Simulation request error: ${err.message}`);
    } finally {
      setSimulating(false);
    }
  };

  const copyLogJson = (log: RawWebhookLog) => {
    navigator.clipboard.writeText(JSON.stringify(log.rawBody, null, 2));
    setCopiedId(log.id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredLogs = logs.filter(log => {
    if (filterType !== 'all' && log.eventType !== filterType) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const rawStr = JSON.stringify(log.rawBody).toLowerCase();
      const summaryStr = (log.summary || '').toLowerCase();
      const ipStr = (log.clientIp || '').toLowerCase();
      return rawStr.includes(q) || summaryStr.includes(q) || ipStr.includes(q);
    }
    return true;
  });

  return (
    <div className={`rounded-3xl border border-slate-800 bg-slate-950 text-slate-100 shadow-2xl overflow-hidden font-sans ${className}`}>
      {/* Header bar */}
      <div className="p-4 sm:p-5 bg-slate-900/90 border-b border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <Radio className="w-5 h-5 animate-pulse text-emerald-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="font-extrabold text-sm sm:text-base text-white tracking-tight flex items-center gap-2">
                <span>Meta Incoming Webhook Raw Log Inspector</span>
              </h3>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-black uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                {logs.length} Receipts
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Inspect unparsed JSON payloads sent by Meta servers to verify delivery
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border ${
              autoRefresh 
                ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30' 
                : 'bg-slate-800 text-slate-400 border-slate-700'
            }`}
          >
            {autoRefresh ? 'Live Auto-Polling ON' : 'Auto-Polling OFF'}
          </button>

          <button
            type="button"
            onClick={fetchRawLogs}
            disabled={isLoading}
            className="p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 transition-all border border-slate-700"
            title="Refresh Logs Now"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
          </button>

          <button
            type="button"
            onClick={handleSimulateWebhook}
            disabled={simulating}
            className="px-3 py-1.5 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-1.5 transition-all shadow-md shadow-purple-900/30 disabled:opacity-50"
            title="Simulate an incoming Meta webhook payload to test pipeline"
          >
            <Play className={`w-3.5 h-3.5 ${simulating ? 'animate-spin' : ''}`} />
            <span>Simulate Ping</span>
          </button>

          <button
            type="button"
            onClick={handleClearLogs}
            className="p-2 rounded-xl bg-slate-800 hover:bg-rose-900/40 text-slate-400 hover:text-rose-300 transition-all border border-slate-700"
            title="Clear Raw Logs"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      {simResult && (
        <div className="mx-4 mt-4 p-3 rounded-xl bg-purple-500/10 border border-purple-500/20 text-purple-300 text-xs font-medium flex items-center justify-between">
          <span>{simResult}</span>
          <button onClick={() => setSimResult(null)} className="text-purple-400 hover:text-white font-bold text-xs ml-2">✕</button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="p-4 bg-slate-950/80 border-b border-slate-800/80 flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          {(['all', 'message', 'status', 'error'] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => setFilterType(type)}
              className={`px-3 py-1 rounded-lg text-xs font-extrabold uppercase tracking-wider transition-all ${
                filterType === type 
                  ? 'bg-emerald-600 text-white shadow-md' 
                  : 'bg-slate-900 text-slate-400 hover:text-white hover:bg-slate-800'
              }`}
            >
              {type === 'all' ? 'All Webhooks' : type === 'message' ? 'Inbound Msgs' : type === 'status' ? 'Delivery Status' : 'Errors'}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-64">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search phone, message, JSON..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 text-xs text-white placeholder-slate-500 outline-none focus:border-emerald-500 transition-colors"
          />
        </div>
      </div>

      {/* Logs Feed List */}
      <div className="p-4 space-y-3 max-h-[500px] overflow-y-auto">
        {filteredLogs.length === 0 ? (
          <div className="p-8 text-center bg-slate-900/40 rounded-2xl border border-dashed border-slate-800 space-y-3">
            <Activity className="w-8 h-8 text-slate-600 mx-auto" />
            <div className="space-y-1">
              <h4 className="text-sm font-bold text-slate-300">No Raw Webhooks Captured Yet</h4>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                When WhatsApp users send messages or Meta issues delivery receipts, raw POST requests received at your webhook endpoint will appear here live in real-time.
              </p>
            </div>
            <button
              type="button"
              onClick={handleSimulateWebhook}
              disabled={simulating}
              className="px-4 py-2 rounded-xl bg-purple-600/30 hover:bg-purple-600/50 text-purple-200 border border-purple-500/40 text-xs font-bold inline-flex items-center gap-2 transition-all"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send Simulated Webhook Ping Now</span>
            </button>
          </div>
        ) : (
          filteredLogs.map((log) => {
            const isExpanded = expandedLogId === log.id;
            return (
              <div 
                key={log.id} 
                className="rounded-2xl bg-slate-900/80 border border-slate-800/80 hover:border-slate-700 transition-all overflow-hidden"
              >
                {/* Collapsed Row Header */}
                <div 
                  onClick={() => setExpandedLogId(isExpanded ? null : log.id)}
                  className="p-3.5 flex items-center justify-between gap-3 cursor-pointer select-none hover:bg-slate-800/40 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider flex-shrink-0 ${
                      log.eventType === 'message' 
                        ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30' 
                        : log.eventType === 'status' 
                          ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                          : 'bg-rose-500/20 text-rose-300 border border-rose-500/30'
                    }`}>
                      {log.simulated ? 'SIMULATED' : log.eventType}
                    </span>

                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-200 truncate flex items-center gap-2">
                        <span>{log.summary || 'Meta Webhook Entry'}</span>
                        {log.messagesCount > 0 && (
                          <span className="text-[10px] text-blue-400 font-mono">
                            ({log.messagesCount} msg)
                          </span>
                        )}
                        {log.statusesCount > 0 && (
                          <span className="text-[10px] text-emerald-400 font-mono">
                            ({log.statusesCount} status)
                          </span>
                        )}
                      </div>
                      <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5">
                        <span>IP: {log.clientIp || 'Meta Cloud'}</span>
                        <span>•</span>
                        <span>{new Date(log.receivedAt).toLocaleTimeString()}</span>
                        {log.signaturePresent && (
                          <>
                            <span>•</span>
                            <span className="text-emerald-400 flex items-center gap-0.5">
                              <ShieldCheck className="w-3 h-3" /> HMAC Signature
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        copyLogJson(log);
                      }}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] font-bold transition-colors flex items-center gap-1 border border-slate-700"
                    >
                      {copiedId === log.id ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedId === log.id ? 'Copied' : 'Copy JSON'}</span>
                    </button>

                    <div className="p-1 text-slate-400">
                      {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                    </div>
                  </div>
                </div>

                {/* Expanded Raw JSON View */}
                <AnimatePresence>
                  {isExpanded && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="border-t border-slate-800 bg-slate-950 p-4 space-y-3"
                    >
                      <div className="flex items-center justify-between text-xs text-slate-400">
                        <span className="font-bold flex items-center gap-1.5 text-slate-300">
                          <Code className="w-3.5 h-3.5 text-emerald-400" />
                          <span>Raw Unparsed Meta JSON Request Body</span>
                        </span>
                        <span className="text-[10px] font-mono text-slate-500">ID: {log.id}</span>
                      </div>

                      <pre className="p-3.5 rounded-xl bg-slate-900 border border-slate-800 text-[11px] font-mono text-emerald-300 overflow-x-auto leading-relaxed max-h-72 select-all">
                        {JSON.stringify(log.rawBody, null, 2)}
                      </pre>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
