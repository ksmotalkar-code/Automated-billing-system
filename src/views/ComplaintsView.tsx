import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Complaint, subscribeToComplaints, resolveComplaint } from "../lib/db";
import { motion } from "motion/react";
import { AlertTriangle, CheckCircle, Clock, MessageCircle, Info } from "lucide-react";

export function ComplaintsView() {
  const [complaints, setComplaints] = useState<Complaint[]>([]);

  useEffect(() => {
    const unsub = subscribeToComplaints(setComplaints);
    return () => unsub();
  }, []);

  return (
    <Card className="neu-bg neu-text h-full flex flex-col">
      <CardHeader>
        <CardTitle className="text-xl font-bold flex items-center gap-2">
          <AlertTriangle className="w-5 h-5 text-amber-500" />
          Complaint Management
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-y-auto">
        <div className="space-y-4">
          {complaints.length === 0 ? (
            <div className="text-center py-20 neu-text-muted">No complaints registered.</div>
          ) : (
            complaints.map((c) => (
              <motion.div 
                key={c.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="neu-flat p-5 rounded-2xl flex flex-col gap-3"
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center shrink-0">
                      <MessageCircle className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-md text-slate-800">{c.customerName}</h4>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider">Via Customer Channel</span>
                        <span className="text-xs text-slate-400">• {new Date(c.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-[11px] font-bold flex items-center gap-1.5 ${c.status === 'Resolved' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700 shadow-sm border border-amber-200/50'}`}>
                    {c.status === 'Resolved' ? <CheckCircle className="w-3.5 h-3.5" /> : <Clock className="w-3.5 h-3.5" />}
                    {c.status}
                  </span>
                </div>
                
                <div className="pl-13 mt-1 space-y-3">
                  <p className="text-sm text-slate-600 bg-slate-100/50 p-3 rounded-xl border border-slate-200/50 relative">
                    <span className="absolute -left-1.5 top-3 w-3 h-3 bg-slate-100/50 border-l border-t border-slate-200/50 rotate-[-45deg]"></span>
                    {c.message}
                  </p>
                  
                  {c.status === 'Pending' ? (
                    <div className="flex justify-end pt-1">
                      <button 
                        onClick={() => resolveComplaint(c.id)}
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
    </Card>
  );
}
