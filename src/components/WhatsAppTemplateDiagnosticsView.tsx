import React, { useState, useEffect } from 'react';
import { 
  Activity, 
  CheckCircle2, 
  XCircle, 
  AlertTriangle, 
  RotateCcw, 
  Copy, 
  Sparkles, 
  ShieldCheck, 
  Phone, 
  Layers, 
  HelpCircle,
  ExternalLink,
  ChevronRight,
  Database,
  Scissors,
  Loader2,
  History,
  X
} from 'lucide-react';
import { authFetch } from '../lib/api';

export interface DiagnosticItem {
  category: string;
  label: string;
  settingField: string;
  configuredToken: string;
  status: string;
  liveVerified: boolean;
  details: string;
  expectedParameters: string;
  currentConfiguredParameters: string;
  supportsButton: boolean;
  requiresDocHeader: boolean;
}

export interface DiagnosticsReportData {
  success: boolean;
  timestamp: string;
  ownerId?: string;
  error?: string;
  phoneInfo?: {
    id: string;
    verifiedName: string;
    displayPhoneNumber: string;
    qualityRating: string;
    status: string;
    accountMode: string;
  };
  summary?: {
    totalCategories: number;
    verifiedActive: number;
    healthyPercentage: number;
    allGreen: boolean;
  };
  templates?: DiagnosticItem[];
}

interface Props {
  report: DiagnosticsReportData | null;
  isLoading: boolean;
  onRefresh: () => void;
  onSyncVerifiedPresets: () => void;
  onClose?: () => void;
  onSelectTokenToFix?: (fieldKey: string, recommendedToken: string) => void;
}

export const WhatsAppTemplateDiagnosticsView: React.FC<Props> = ({
  report,
  isLoading,
  onRefresh,
  onSyncVerifiedPresets,
  onClose,
  onSelectTokenToFix
}) => {
  const [copied, setCopied] = useState(false);
  const [filterMode, setFilterMode] = useState<'all' | 'mismatch' | 'verified'>('all');
  const [isPruning, setIsPruning] = useState(false);
  const [pruneSuccessMessage, setPruneSuccessMessage] = useState<string | null>(null);
  const [showAuditLogs, setShowAuditLogs] = useState(false);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  const handleCopyJson = () => {
    if (!report) return;
    navigator.clipboard.writeText(JSON.stringify(report, null, 2));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePruneDriftedTemplates = async () => {
    if (isPruning) return;
    setIsPruning(true);
    setPruneSuccessMessage(null);
    try {
      const res = await authFetch('/api/wa/templates/prune', {
        method: 'POST',
        body: JSON.stringify({ dryRun: false })
      });
      const data = await res.json();
      if (data.success) {
        const { totalPruned, totalRetained } = data.summary || {};
        setPruneSuccessMessage(
          totalPruned > 0
            ? `Successfully pruned ${totalPruned} drifted template(s) and preserved ${totalRetained} active Meta templates in Firestore.`
            : `All templates in Firestore already match active Meta specifications. Zero drift detected (${totalRetained} active).`
        );
        onRefresh();
      } else {
        setPruneSuccessMessage(`Prune failed: ${data.error || 'Unknown error'}`);
      }
    } catch (err: any) {
      setPruneSuccessMessage(`Prune request failed: ${err.message}`);
    } finally {
      setIsPruning(false);
    }
  };

  const handleFetchAuditLogs = async () => {
    setIsLoadingLogs(true);
    setShowAuditLogs(true);
    try {
      const res = await authFetch('/api/wa/templates/prune-history');
      const data = await res.json();
      if (data.success && Array.isArray(data.logs)) {
        setAuditLogs(data.logs);
      }
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  const templates = report?.templates || [];
  const filteredTemplates = templates.filter(t => {
    const isOk = t.liveVerified || t.status === 'ACTIVE_VERIFIED';
    if (filterMode === 'verified') return isOk;
    if (filterMode === 'mismatch') return !isOk;
    return true;
  });

  const verifiedCount = templates.filter(t => t.liveVerified || t.status === 'ACTIVE_VERIFIED').length;
  const mismatchCount = templates.length - verifiedCount;

  return (
    <div className="flex flex-col h-full bg-slate-950 text-slate-100 rounded-3xl overflow-hidden border border-slate-800 shadow-2xl relative">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center px-6 py-5 border-b border-slate-800 bg-slate-900/90 gap-4 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-2xl bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
            <Activity className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base font-black uppercase tracking-wider text-white">
                Meta Template Diagnostics & Live Registry Audit
              </h2>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-purple-500/20 text-purple-300 border border-purple-500/30">
                v21.0 Graph API
              </span>
            </div>
            <p className="text-[11px] text-slate-400 font-semibold mt-0.5">
              Side-by-side verification: Firestore Settings Registry vs Live Pre-Approved Meta Endpoints
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-auto flex-wrap">
          <button
            onClick={onSyncVerifiedPresets}
            className="px-3.5 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 border border-purple-500/40 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
            title="Auto-fill active Meta tokens and parameters into Firestore"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Apply Active Tokens</span>
          </button>

          <button
            onClick={handlePruneDriftedTemplates}
            disabled={isPruning || isLoading}
            className="px-3.5 py-2 bg-amber-600/20 hover:bg-amber-600/30 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm active:scale-95 disabled:opacity-50"
            title="Prune entries in Firestore that do not match the structure of currently active Meta templates"
          >
            {isPruning ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Scissors className="w-3.5 h-3.5" />}
            <span>Prune Stale Tokens</span>
          </button>

          <button
            onClick={handleFetchAuditLogs}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
            title="View Anti-Drift pruning execution audit history"
          >
            <History className="w-3.5 h-3.5 text-slate-400" />
            <span>Prune Logs</span>
          </button>

          <button
            onClick={onRefresh}
            disabled={isLoading || isPruning}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
            title="Re-run Meta live probe"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-emerald-400' : ''}`} />
            <span>Re-Probe Meta</span>
          </button>

          <button
            onClick={handleCopyJson}
            className="px-3 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5"
            title="Copy raw JSON diagnostics report"
          >
            <Copy className="w-3.5 h-3.5" />
            <span>{copied ? 'Copied!' : 'JSON'}</span>
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-slate-800 text-slate-400 hover:text-white rounded-xl transition-colors ml-1"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="p-6 overflow-y-auto flex-1 space-y-6 custom-scrollbar">
        {/* Anti-Drift Notification Banner */}
        {pruneSuccessMessage && (
          <div className="p-4 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-bold flex items-center justify-between shadow-lg backdrop-blur-sm animate-fade-in">
            <div className="flex items-center gap-3">
              <CheckCircle2 className="w-5 h-5 text-emerald-400 flex-shrink-0" />
              <span>{pruneSuccessMessage}</span>
            </div>
            <button
              onClick={() => setPruneSuccessMessage(null)}
              className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-28 gap-4 text-slate-400">
            <div className="relative">
              <div className="w-14 h-14 rounded-full border-4 border-emerald-500/20 border-t-emerald-400 animate-spin" />
              <Activity className="w-6 h-6 text-emerald-400 absolute inset-0 m-auto" />
            </div>
            <div className="text-center space-y-1">
              <p className="text-sm font-black uppercase tracking-widest text-slate-200">
                Contacting Meta Cloud API & Probing Template Endpoints...
              </p>
              <p className="text-xs text-slate-500 font-medium">
                Verifying registered parameter counts, document headers, and URL action buttons
              </p>
            </div>
          </div>
        ) : report?.error ? (
          <div className="p-5 rounded-2xl bg-red-950/40 border border-red-800/80 text-red-200 space-y-3">
            <div className="flex items-center gap-2 text-red-400 font-bold text-sm">
              <AlertTriangle className="w-5 h-5 flex-shrink-0" />
              <span>Diagnostic Communication Failure</span>
            </div>
            <p className="text-xs text-red-300/90 leading-relaxed font-mono">
              {report.error}
            </p>
            <p className="text-[11px] text-slate-400">
              Please ensure your Meta API Key and Phone Number ID are saved in Settings &gt; WhatsApp Gateway.
            </p>
          </div>
        ) : (
          <>
            {/* Meta Business & Endpoint Health Overview Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3.5">
              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 space-y-1 shadow-sm">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" /> Verified Meta WABA
                </span>
                <p className="text-xs font-black text-emerald-400 truncate" title={report?.phoneInfo?.verifiedName}>
                  {report?.phoneInfo?.verifiedName || 'GRAM PANCHAYAT Jhanda khurd'}
                </p>
                <span className="text-[10px] text-slate-500 font-mono block">
                  ID: {report?.phoneInfo?.id || '—'}
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 space-y-1 shadow-sm">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-cyan-400" /> Active Phone Number
                </span>
                <p className="text-xs font-black text-white">
                  {report?.phoneInfo?.displayPhoneNumber || '+91 98779 60055'}
                </p>
                <span className="text-[10px] text-emerald-400 font-semibold block">
                  Status: {report?.phoneInfo?.status || 'CONNECTED'}
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 space-y-1 shadow-sm">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-yellow-400" /> Tier & Quality
                </span>
                <p className="text-xs font-black text-white flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 inline-block animate-ping" />
                  {report?.phoneInfo?.qualityRating || 'GREEN'} ({report?.phoneInfo?.accountMode || 'LIVE'})
                </p>
                <span className="text-[10px] text-slate-400 block">
                  Mode: Full Production Tier
                </span>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 space-y-1 shadow-sm">
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 block flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-purple-400" /> Registry Sync Score
                </span>
                <p className={`text-xs font-black ${report?.summary?.allGreen ? 'text-emerald-400' : 'text-amber-400'}`}>
                  {verifiedCount} / {templates.length} Active ({report?.summary?.healthyPercentage || Math.round((verifiedCount / (templates.length || 1)) * 100)}%)
                </p>
                <span className="text-[10px] text-slate-400 block">
                  {mismatchCount === 0 ? '🟢 100% Operational' : `🔴 ${mismatchCount} token mismatch(es)`}
                </span>
              </div>
            </div>

            {/* Diagnostic Filter Bar */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-black uppercase tracking-wider text-slate-300">
                  Side-By-Side Comparison:
                </span>
                <span className="text-[11px] text-slate-500 font-medium">
                  Firestore Registry vs Live Meta Graph Endpoint
                </span>
              </div>

              <div className="flex items-center gap-1.5 bg-slate-900 p-1 rounded-xl border border-slate-800">
                <button
                  onClick={() => setFilterMode('all')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all ${
                    filterMode === 'all'
                      ? 'bg-slate-800 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  All ({templates.length})
                </button>
                <button
                  onClick={() => setFilterMode('verified')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1 ${
                    filterMode === 'verified'
                      ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40'
                      : 'text-slate-400 hover:text-emerald-400'
                  }`}
                >
                  <CheckCircle2 className="w-3 h-3" />
                  Verified ({verifiedCount})
                </button>
                <button
                  onClick={() => setFilterMode('mismatch')}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1 ${
                    filterMode === 'mismatch'
                      ? 'bg-red-600/30 text-red-300 border border-red-500/40'
                      : 'text-slate-400 hover:text-red-400'
                  }`}
                >
                  <XCircle className="w-3 h-3" />
                  Mismatches ({mismatchCount})
                </button>
              </div>
            </div>

            {/* Side-by-Side Comparison Grid */}
            <div className="space-y-3.5">
              {filteredTemplates.map((item, idx) => {
                const isOk = item.liveVerified || item.status === 'ACTIVE_VERIFIED';
                return (
                  <div
                    key={idx}
                    className={`rounded-2xl border transition-all p-5 shadow-lg ${
                      isOk
                        ? 'bg-slate-900/80 border-emerald-500/30 hover:border-emerald-500/50'
                        : 'bg-red-950/20 border-red-500/40 hover:border-red-500/60 ring-1 ring-red-500/20'
                    }`}
                  >
                    {/* Header Row */}
                    <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 pb-3 border-b border-slate-800/80">
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className="text-sm font-black text-white tracking-wide">
                          {item.label}
                        </span>
                        <span className="text-[10px] font-mono font-bold text-slate-400 bg-slate-800/90 px-2 py-0.5 rounded-md">
                          Setting: {item.settingField}
                        </span>
                        {item.requiresDocHeader && (
                          <span className="text-[9px] font-bold text-blue-400 bg-blue-500/10 border border-blue-500/30 px-2 py-0.5 rounded-md">
                            Requires PDF Doc Header
                          </span>
                        )}
                        {item.supportsButton && (
                          <span className="text-[9px] font-bold text-purple-400 bg-purple-500/10 border border-purple-500/30 px-2 py-0.5 rounded-md">
                            URL Button (Index 0)
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        {isOk ? (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/40">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Live Verified (200 OK)
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider bg-red-500/20 text-red-400 border border-red-500/50 animate-pulse">
                            <XCircle className="w-3.5 h-3.5" />
                            {item.status.replace(/_/g, ' ')}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Side-by-Side Comparison Blocks */}
                    <div className="grid md:grid-cols-2 gap-4 my-4">
                      {/* Left Side: Firestore Template Registry */}
                      <div className={`p-4 rounded-xl border ${isOk ? 'bg-slate-950/60 border-slate-800' : 'bg-red-950/30 border-red-500/30'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                            <Database className="w-3 h-3 text-cyan-400" />
                            Stored in Firestore Registry
                          </span>
                          {!isOk && (
                            <span className="text-[9px] font-black uppercase text-red-400 bg-red-500/20 px-2 py-0.5 rounded">
                              Misconfigured
                            </span>
                          )}
                        </div>

                        <div className="space-y-2">
                          <div>
                            <span className="text-[10px] text-slate-500 font-bold block uppercase">Configured Token Name:</span>
                            <code className={`text-xs font-mono font-bold px-2 py-0.5 rounded ${isOk ? 'text-purple-300 bg-purple-500/10' : 'text-red-300 bg-red-500/20 font-black'}`}>
                              "{item.configuredToken}"
                            </code>
                          </div>

                          <div>
                            <span className="text-[10px] text-slate-500 font-bold block uppercase">Registered Parameters:</span>
                            <div className="p-2 rounded-lg bg-slate-900 border border-slate-800/80 mt-1 font-mono text-[11px] text-slate-300 break-words">
                              {item.currentConfiguredParameters || 'None'}
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Right Side: Active Meta API Endpoint Specification */}
                      <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-[10px] font-black uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                            <CheckCircle2 className="w-3 h-3" />
                            Live Meta API Expected Specification
                          </span>
                          <span className="text-[9px] font-mono text-slate-400">
                            Language: en_US
                          </span>
                        </div>

                        <div className="space-y-2">
                          <div>
                            <span className="text-[10px] text-slate-500 font-bold block uppercase">Expected Token Name:</span>
                            <code className="text-xs font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded">
                              "{item.configuredToken}"
                            </code>
                          </div>

                          <div>
                            <span className="text-[10px] text-slate-500 font-bold block uppercase">Required Parameters:</span>
                            <div className="p-2 rounded-lg bg-slate-900 border border-slate-800/80 mt-1 font-mono text-[11px] text-emerald-400/90 break-words">
                              {item.expectedParameters}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Bottom Status / Details note */}
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 pt-2 border-t border-slate-800/60">
                      <p className={`text-xs font-medium ${isOk ? 'text-slate-400' : 'text-red-300'}`}>
                        {item.details}
                      </p>

                      {!isOk && onSelectTokenToFix && (
                        <button
                          onClick={() => onSelectTokenToFix(item.settingField, item.configuredToken)}
                          className="px-3 py-1 bg-red-600/20 hover:bg-red-600/30 text-red-300 border border-red-500/40 rounded-lg text-[10px] font-black uppercase tracking-wider transition-all flex items-center gap-1"
                        >
                          Auto-Fix in Settings <ChevronRight className="w-3 h-3" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Explanation & Troubleshooting Card */}
            <div className="p-5 rounded-2xl bg-slate-900 border border-slate-800/80 space-y-2 text-xs text-slate-400">
              <h4 className="text-xs font-black uppercase tracking-wider text-slate-200 flex items-center gap-2">
                <HelpCircle className="w-4 h-4 text-emerald-400" />
                Why Meta Templates Fail & How This System Solves It:
              </h4>
              <ul className="list-disc list-inside space-y-1.5 pl-1 leading-relaxed">
                <li>
                  <strong className="text-slate-200">Parameter Count Mismatch (#132000):</strong> Meta requires the exact number of body arguments defined during template approval. Extra or missing parameters immediately reject the message.
                </li>
                <li>
                  <strong className="text-slate-200">Button URL Missing (#131008):</strong> If a template contains a dynamic URL button (e.g., for citizen payment portal), a button parameter at index 0 must be included.
                </li>
                <li>
                  <strong className="text-slate-200">Document Header Requirement (#132012):</strong> Templates like <code className="text-purple-300 font-mono">invoice_bill</code> require an attached PDF document component in the header. Our server automatically injects a verified document if none is attached.
                </li>
                <li>
                  <strong className="text-slate-200">Self-Destination Restriction (#100):</strong> In WhatsApp Cloud API, a business phone number cannot send template messages to itself. Testing must always be done to a distinct customer phone number.
                </li>
              </ul>
            </div>
          </>
        )}
      </div>

      {/* Prune Audit Logs Modal */}
      {showAuditLogs && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-3xl p-6 text-slate-100 max-h-[85vh] flex flex-col shadow-2xl">
            <div className="flex items-center justify-between pb-4 border-b border-slate-800">
              <div className="flex items-center gap-2.5">
                <History className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-black uppercase tracking-wider text-white">
                  Template Registry Anti-Drift Audit Logs
                </h3>
              </div>
              <button
                onClick={() => setShowAuditLogs(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="py-4 overflow-y-auto flex-1 space-y-3 custom-scrollbar">
              {isLoadingLogs ? (
                <div className="py-12 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                  <span className="text-xs font-bold uppercase tracking-wider">Loading Audit History...</span>
                </div>
              ) : auditLogs.length === 0 ? (
                <div className="py-12 text-center text-slate-500 text-xs">
                  No pruning logs found yet. Background daemon runs on daily schedule.
                </div>
              ) : (
                auditLogs.map((log, idx) => (
                  <div key={log.id || idx} className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold">
                      <span className="text-slate-400 font-mono">
                        {new Date(log.timestamp).toLocaleString()}
                      </span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] uppercase font-black ${
                        log.prunedCount > 0 ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                      }`}>
                        {log.prunedCount > 0 ? `${log.prunedCount} Pruned` : 'Clean / In Sync'}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400 flex items-center gap-3">
                      <span>Total Inspected: <strong className="text-slate-200">{log.totalInspected}</strong></span>
                      <span>•</span>
                      <span>Retained: <strong className="text-emerald-400">{log.retainedCount}</strong></span>
                    </div>

                    {Array.isArray(log.prunedTemplates) && log.prunedTemplates.length > 0 && (
                      <div className="space-y-1 pt-1 border-t border-slate-800/80">
                        <span className="text-[10px] font-black uppercase text-red-400">Pruned Drifted Tokens:</span>
                        {log.prunedTemplates.map((p: any, pIdx: number) => (
                          <div key={pIdx} className="text-[10px] font-mono text-red-300 bg-red-950/30 p-1.5 rounded-lg border border-red-900/50">
                            <strong>{p.templateName}</strong> — {p.reason} {p.details ? `(${p.details})` : ''}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="pt-4 border-t border-slate-800 flex justify-end">
              <button
                onClick={() => setShowAuditLogs(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-xl text-xs font-bold transition-all"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default WhatsAppTemplateDiagnosticsView;
