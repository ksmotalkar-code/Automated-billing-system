import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Complaint, subscribeToComplaints, resolveComplaint, archiveComplaint, deleteComplaint, updateComplaint } from "../lib/db";
import { motion } from "motion/react";
import { AlertTriangle, CheckCircle, Clock, MessageCircle, Info, Trash2, Search, Tag, Flag } from "lucide-react";
import { ConfirmModal } from "../components/ConfirmModal";

export function ComplaintsView() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [filter, setFilter] = useState<'All' | 'Pending' | 'Resolved'>('All');
  const [searchQuery, setSearchQuery] = useState("");
  const [confirmConfig, setConfirmConfig] = useState({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
    isDestructive: true,
  });

  useEffect(() => {
    const unsub = subscribeToComplaints(setComplaints);
    return () => unsub();
  }, []);

  const handleDelete = async (c: Complaint) => {
    setConfirmConfig({
      isOpen: true,
      title: "Delete Complaint",
      message: c.status === 'Resolved' ? "Are you sure you want to permanently delete this resolved complaint?" : "Are you sure you want to delete this pending complaint?",
      isDestructive: true,
      onConfirm: async () => {
        try {
          await deleteComplaint(c.id);
        } catch(e) {
          // ignore or handle
        }
      }
    });
  };

  const handleDeleteAllResolved = async () => {
    const resolved = complaints.filter(c => c.status === 'Resolved');
    if (resolved.length === 0) return;
    setConfirmConfig({
      isOpen: true,
      title: "Delete All Resolved",
      message: `Are you sure you want to permanently delete all ${resolved.length} resolved complaints?`,
      isDestructive: true,
      onConfirm: async () => {
        try {
          for (const c of resolved) {
            await deleteComplaint(c.id);
          }
        } catch(e) {
          // ignore or handle
        }
      }
    });
  };

  const filteredComplaints = complaints.filter(c => {
    const searchTerms = searchQuery.toLowerCase().split(' ').filter(term => term.trim() !== '');
    const searchStr = `${c.customerName || ''} ${c.customerId || ''} ${c.message || ''} ${c.id || ''} ${c.category || ''} ${c.priority || ''}`.toLowerCase();
    const matchesSearch = searchTerms.length === 0 || searchTerms.every(term => searchStr.includes(term));
    
    return (filter === 'All' || c.status === filter) && matchesSearch;
  });

  return (
    <Card className="neu-bg neu-text h-full flex flex-col">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <CardTitle className="text-xl font-bold flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            Complaint Management
            <div className="flex gap-2">
              {(['All', 'Pending', 'Resolved'] as const).map(f => (
                <button
                  key={f}
                  onClick={() => setFilter(f)}
                  className={`px-3 py-1 text-xs font-bold rounded-lg transition ${
                    filter === f 
                      ? 'bg-amber-100 text-amber-700' 
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                  }`}
                >
                  {f}
                </button>
              ))}
            </div>
          </div>
        </CardTitle>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 px-3 py-2 neu-pressed rounded-xl w-full sm:w-64">
            <Search className="w-4 h-4 neu-text-muted" />
            <input 
              type="text" 
              placeholder="Search complaints..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="bg-transparent border-none outline-none text-sm w-full neu-text"
            />
          </div>
          <button 
            onClick={handleDeleteAllResolved}
            className="flex items-center gap-2 px-4 py-2 bg-rose-100 text-rose-700 rounded-xl text-xs font-bold hover:bg-rose-200 transition whitespace-nowrap"
          >
            <Trash2 className="w-4 h-4" /> <span className="hidden sm:inline">Delete All Resolved</span>
          </button>
        </div>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto">
        <div className="space-y-4">
          {filteredComplaints.length === 0 ? (
            <div className="text-center py-20 neu-text-muted">No {filter !== 'All' ? filter.toLowerCase() : ''} complaints.</div>
          ) : (
            filteredComplaints.map((c) => (
              <motion.div 
                key={c.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="neu-flat p-4 sm:p-5 rounded-2xl flex flex-col gap-3"
              >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3 sm:gap-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shrink-0">
                      <MessageCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-md text-slate-800">{c.customerName}</h4>
                      <div className="flex flex-wrap items-center gap-1 sm:gap-2 mt-0.5">
                        <span className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider">Via Customer Channel</span>
                        <span className="text-xs text-slate-400">• {new Date(c.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 self-start sm:self-auto pl-12 sm:pl-0">
                    <div className="flex flex-col items-end gap-1.5 mr-2">
                      <select 
                        value={c.category || ''} 
                        onChange={(e) => updateComplaint(c.id, { category: e.target.value })}
                        className="text-[10px] bg-slate-100 border-none rounded-md px-2 py-1 font-bold text-slate-600 focus:ring-1 focus:ring-blue-400 outline-none cursor-pointer"
                      >
                        <option value="">No Category</option>
                        <option value="Billing Issue">Billing Issue</option>
                        <option value="Service Request">Service Request</option>
                        <option value="Technical Problem">Technical Problem</option>
                      </select>
                      <select 
                        value={c.priority || ''} 
                        onChange={(e) => updateComplaint(c.id, { priority: e.target.value as any })}
                        className={`text-[10px] border-none rounded-md px-2 py-1 font-bold focus:ring-1 focus:ring-blue-400 outline-none cursor-pointer ${
                          c.priority === 'High' ? 'bg-rose-100 text-rose-700' :
                          c.priority === 'Medium' ? 'bg-amber-100 text-amber-700' :
                          c.priority === 'Low' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        <option value="">Priority</option>
                        <option value="Low">Low</option>
                        <option value="Medium">Medium</option>
                        <option value="High">High</option>
                      </select>
                    </div>
                    <span className={`px-3 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5 ${c.status === 'Resolved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700 shadow-sm border border-amber-200/50'}`}>
                      {c.status === 'Resolved' ? <CheckCircle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                      {c.status}
                    </span>
                    <button onClick={() => handleDelete(c)} className="p-2 text-rose-500 hover:bg-rose-50 rounded-lg transition">
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                
                <div className="pl-0 sm:pl-12 mt-1 space-y-3">
                  <p className="text-sm text-slate-600 bg-slate-100/50 p-3 rounded-xl border border-slate-200/50 relative">
                    <span className="hidden sm:block absolute -left-1.5 top-3 w-3 h-3 bg-slate-100/50 border-l border-t border-slate-200/50 rotate-[-45deg]"></span>
                    {c.message}
                  </p>
                  
                  {c.status === 'Pending' ? (
                    <div className="flex justify-end pt-1">
                      <button 
                        onClick={async () => {
                          try {
                            await resolveComplaint(c.id);
                          } catch (e: any) {
                            alert("Failed to resolve. " + (e.message?.includes('Quota') ? "Quota exceeded." : ""));
                          }
                        }}
                        className="px-4 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5"
                      >
                         <CheckCircle className="w-4 h-4" /> Mark as Resolved
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-[10px] text-slate-400 font-bold uppercase tracking-wider pl-1">
                      <Info className="w-3 h-3" /> Auto-deletes in 6 months
                    </div>
                  )}
                </div>
              </motion.div>
            ))
          )}
        </div>
      </CardContent>

      <ConfirmModal
        isOpen={confirmConfig.isOpen}
        onClose={() => setConfirmConfig({ ...confirmConfig, isOpen: false })}
        onConfirm={() => {
          confirmConfig.onConfirm();
          setConfirmConfig({ ...confirmConfig, isOpen: false });
        }}
        title={confirmConfig.title}
        message={confirmConfig.message}
        isDestructive={confirmConfig.isDestructive}
      />
    </Card>
  );
}
