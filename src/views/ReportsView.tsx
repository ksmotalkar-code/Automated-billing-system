import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Report, subscribeToReports, addReport, Customer, subscribeToCustomers, subscribeToSettings, AppSettings, ReportFile } from "../lib/db";
import { shareReportToCustomers } from "../lib/automation";
import { updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { motion } from "motion/react";
import { FileText, Plus, Share2, Loader2, Link as LinkIcon, AlertCircle, Upload, File as FileIcon } from "lucide-react";
import { auth } from "../firebase";

export function ReportsView() {
  const [reports, setReports] = useState<Report[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSharing, setIsSharing] = useState<string | null>(null);
  
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (!newTitle.trim()) return;
    try {
      const report = await addReport({
        title: newTitle.trim(),
        content: newContent.trim(),
        files: []
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
      alert("Failed to create folder.");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, reportId: string) => {
     const file = e.target.files?.[0];
     if (!file) return;
     
     // 10MB limit for base64 storage limits
     if (file.size > 10 * 1024 * 1024) {
        alert("File too large. Max 10MB.");
        return;
     }

     const reader = new FileReader();
     reader.onloadend = async () => {
       try {
         const base64data = reader.result as string;
         const reportRef = doc(db, 'reports', reportId);
         const report = reports.find(r => r.id === reportId);
         const existingFiles = report?.files || [];
         
         const newFile: ReportFile = {
            name: file.name,
            type: file.type,
            data: base64data
         };
         
         await updateDoc(reportRef, {
            files: [...existingFiles, newFile]
         });
       } catch (err) {
         console.error(err);
         alert("Failed to upload file.");
       }
     };
     reader.readAsDataURL(file);
  };

  const handleShare = async (report: Report) => {
    if (!settings || customers.length === 0) {
      alert("System not ready or no customers found.");
      return;
    }
    
    setIsSharing(report.id);
    try {
      // Find active customers
      const activeCustomers = customers.filter(c => c.status === 'Active');
      if (activeCustomers.length === 0) {
        alert("No active customers to share with.");
        setIsSharing(null);
        return;
      }
      
      await shareReportToCustomers(report, activeCustomers, settings);
      alert("Folder/Notice shared successfully via WhatsApp!");
    } catch (err) {
      console.error(err);
      alert("Error sharing folder. Make sure your WhatsApp API or Web integration is configured.");
    } finally {
      setIsSharing(null);
    }
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex justify-between items-center">
        <div>
           <h2 className="text-2xl font-bold tracking-tight">Reports & Folders</h2>
           <p className="neu-text-muted">Create folders and attach files to broadcast to customers</p>
        </div>
        <button 
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition"
        >
          <Plus className="w-4 h-4" /> Create Folder
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {reports.length === 0 ? (
           <div className="col-span-full py-20 text-center neu-text-muted">
             No folders created. Create one to upload files and broadcast.
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
                  {report.content && <p className="text-sm neu-text-muted line-clamp-2 mb-4">{report.content}</p>}
                  
                  <div className="mt-4 mb-4 bg-white/5 p-3 rounded-2xl border border-[var(--shadow-dark)]">
                     <p className="text-xs font-bold uppercase tracking-wider opacity-60 mb-2">Attached Files</p>
                     
                     <div className="space-y-2 mb-3">
                       {(!report.files || report.files.length === 0) && (
                         <div className="text-xs italic opacity-50">No files uploaded inside this folder</div>
                       )}
                       {report.files && report.files.map((f, i) => (
                         <div key={i} className="flex items-center gap-2 p-2 bg-black/5 dark:bg-white/5 rounded-xl">
                            <FileIcon className="w-4 h-4 text-blue-500 shrink-0" />
                            <span className="text-xs font-medium truncate">{f.name}</span>
                         </div>
                       ))}
                     </div>

                     <label className="flex justify-center items-center gap-2 w-full px-3 py-2 neu-pressed rounded-xl text-xs font-bold cursor-pointer hover:bg-black/5 transition">
                        <Upload className="w-3 h-3" /> Upload File
                        <input type="file" className="hidden" onChange={(e) => handleFileUpload(e, report.id)} />
                     </label>
                  </div>
                  
                  <p className="text-xs opacity-50 mb-4">{new Date(report.createdAt).toLocaleString()}</p>
               </div>
               
               <div className="pt-4 border-t border-[var(--shadow-dark)]">
                 <button
                   onClick={() => handleShare(report)}
                   disabled={isSharing === report.id}
                   className="w-full flex justify-center items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 rounded-xl font-bold hover:bg-emerald-200 transition disabled:opacity-50"
                 >
                   {isSharing === report.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                   {isSharing === report.id ? "Sharing..." : "Share via WhatsApp"}
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
             <h3 className="text-xl font-bold mb-4">Create New Folder</h3>
             
             {settings?.automation?.autoShareReports && (
               <div className="flex items-start gap-2 p-3 bg-blue-50 text-blue-700 rounded-xl mb-4 text-sm">
                 <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                 <p><strong>Auto-Share is ON:</strong> Creating this folder will instantly broadcast it to all active customers via WhatsApp.</p>
               </div>
             )}

             <form onSubmit={handleCreateReport} className="space-y-4">
               <div>
                 <label className="block text-sm font-bold opacity-70 mb-2">Folder Name</label>
                 <input 
                   type="text"
                   value={newTitle}
                   onChange={e => setNewTitle(e.target.value)}
                   className="w-full p-3 neu-pressed rounded-xl bg-transparent outline-none"
                   placeholder="e.g. Schedule Maintenance Notices"
                   required
                 />
               </div>
               <div>
                 <label className="block text-sm font-bold opacity-70 mb-2">Description / Notice Content (Optional)</label>
                 <textarea 
                   value={newContent}
                   onChange={e => setNewContent(e.target.value)}
                   className="w-full p-3 neu-pressed rounded-xl bg-transparent outline-none min-h-[100px]"
                   placeholder="Details about this folder..."
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
                   Create Folder
                 </button>
               </div>
             </form>
           </motion.div>
        </div>
      )}
    </div>
  );
}
