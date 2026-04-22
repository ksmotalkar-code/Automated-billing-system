import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Report, subscribeToReports, addReport, Customer, subscribeToCustomers, subscribeToSettings, AppSettings } from "../lib/db";
import { shareReportToCustomers } from "../lib/automation";
import { motion } from "motion/react";
import { FileText, Plus, Share2, Loader2, Link as LinkIcon, AlertCircle } from "lucide-react";
import { auth } from "../firebase";

export function ReportsView() {
  const [reports, setReports] = useState<Report[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");

  useEffect(() => {
    const unsubR = subscribeToReports(setReports);
    const unsubC = subscribeToCustomers(setCustomers);
    const unsubS = subscribeToSettings(setSettings);
    return () => {
      unsubR();
      unsubC();
      unsubS();
    };
  }, []);

  const handleCreateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newContent.trim()) return;
    try {
      const report = await addReport({
        title: newTitle.trim(),
        content: newContent.trim(),
      });
      setIsAddModalOpen(false);
      setNewTitle("");
      setNewContent("");

      // Autoshare if enabled
      if (settings?.automation?.autoShareReports) {
         handleShare(report);
      }
    } catch (err) {
      console.error(err);
      alert("Failed to create report.");
    }
  };

  const handleShare = async (report: Report) => {
    if (!settings || customers.length === 0) {
      alert("System not ready or no customers found.");
      return;
    }
    
    setIsSharing(true);
    try {
      // Find active customers
      const activeCustomers = customers.filter(c => c.status === 'Active');
      if (activeCustomers.length === 0) {
        alert("No active customers to share with.");
        setIsSharing(false);
        return;
      }
      
      const payload = {
        title: report.title,
        content: report.content,
        id: report.id
      };
      
      await shareReportToCustomers(payload, activeCustomers, settings);
      alert("Report shared successfully via WhatsApp!");
    } catch (err) {
      console.error(err);
      alert("Error sharing report automatically. Make sure Meta API is configured.");
    } finally {
      setIsSharing(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
           <h2 className="text-2xl font-bold tracking-tight">Reports</h2>
           <p className="neu-text-muted">Broadcast official updates & notices to customers</p>
        </div>
        <button 
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition"
        >
          <Plus className="w-4 h-4" /> Add Report
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {reports.length === 0 ? (
           <div className="col-span-full py-20 text-center neu-text-muted">
             No reports created. Create one to broadcast.
           </div>
        ) : (
          reports.map(report => (
            <motion.div
              key={report.id}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="neu-bg neu-text neu-flat p-6 rounded-3xl flex flex-col justify-between"
            >
               <div>
                  <h3 className="font-bold text-lg mb-2">{report.title}</h3>
                  <p className="text-sm neu-text-muted line-clamp-3 mb-4">{report.content}</p>
                  <p className="text-xs opacity-50 mb-4">{new Date(report.createdAt).toLocaleString()}</p>
               </div>
               
               <div className="pt-4 border-t border-[var(--shadow-dark)]">
                 <button
                   onClick={() => handleShare(report)}
                   disabled={isSharing}
                   className="w-full flex justify-center items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 rounded-xl font-bold hover:bg-emerald-200 transition disabled:opacity-50"
                 >
                   {isSharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                   {isSharing ? "Sharing..." : "Notify All"}
                 </button>
               </div>
            </motion.div>
          ))
        )}
      </div>

      {isAddModalOpen && (
        <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
           <motion.div 
             initial={{ opacity: 0, scale: 0.9 }}
             animate={{ opacity: 1, scale: 1 }}
             className="neu-bg p-6 rounded-3xl w-full max-w-lg"
           >
             <h3 className="text-xl font-bold mb-4">Create & Broadcast Report</h3>
             
             {settings?.automation?.autoShareReports && (
               <div className="flex items-start gap-2 p-3 bg-blue-50 text-blue-700 rounded-xl mb-4 text-sm">
                 <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                 <p><strong>Auto-Share is ON:</strong> Creating this report will instantly broadcast it to all active customers via WhatsApp.</p>
               </div>
             )}

             <form onSubmit={handleCreateReport} className="space-y-4">
               <div>
                 <label className="block text-sm font-bold opacity-70 mb-2">Report Title</label>
                 <input 
                   type="text"
                   value={newTitle}
                   onChange={e => setNewTitle(e.target.value)}
                   className="w-full p-3 neu-pressed rounded-xl bg-transparent outline-none"
                   placeholder="e.g. Schedule Maintenance"
                   required
                 />
               </div>
               <div>
                 <label className="block text-sm font-bold opacity-70 mb-2">Content</label>
                 <textarea 
                   value={newContent}
                   onChange={e => setNewContent(e.target.value)}
                   className="w-full p-3 neu-pressed rounded-xl bg-transparent outline-none min-h-[150px]"
                   placeholder="Details of the report..."
                   required
                 />
               </div>
               <div className="flex gap-3 justify-end pt-4">
                 <button 
                   type="button" 
                   onClick={() => setIsAddModalOpen(false)}
                   className="px-6 py-2 neu-flat rounded-xl font-medium"
                 >
                   Cancel
                 </button>
                 <button 
                   type="submit"
                   className="px-6 py-2 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30"
                 >
                   Create Report
                 </button>
               </div>
             </form>
           </motion.div>
        </div>
      )}
    </div>
  );
}
