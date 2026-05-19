import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Report, addReport, deleteReport, Customer, AppSettings } from "../lib/db";
import { useData } from "../contexts/DataContext";
import { shareReportToCustomers } from "../lib/automation";
import { updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { motion, AnimatePresence } from "motion/react";
import { FileText, Plus, Share2, Loader2, Link as LinkIcon, AlertCircle, Upload, File as FileIcon, Trash2, FolderClosed, MoreHorizontal, Copy, CheckCircle2, CloudUpload } from "lucide-react";
import { ConfirmModal } from "../components/ConfirmModal";

export function ReportsView() {
  const { reports, customers, settings } = useData();
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSharing, setIsSharing] = useState<string | null>(null);
  const [shareGroup, setShareGroup] = useState<'All' | 'Active' | 'Overdue'>('Active');
  
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");

  const [confirmConfig, setConfirmConfig] = useState({
    isOpen: false,
    title: "",
    message: "",
    onConfirm: () => {},
    isDestructive: true,
  });

  const showAlert = (title: string, message: string) => {
    setConfirmConfig({
      isOpen: true,
      title,
      message,
      onConfirm: () => {},
      isDestructive: false
    });
  };

  const handleDeleteFile = async (reportId: string, fileIndex: number) => {
    setConfirmConfig({
      isOpen: true,
      title: "Delete Inode",
      message: "This binary object will be purged from the cluster. Proceed?",
      isDestructive: true,
      onConfirm: async () => {
        try {
          const reportRef = doc(db, 'reports', reportId);
          const report = reports.find(r => r.id === reportId);
          const existingFiles = report?.files || [];
          const newFiles = [...existingFiles];
          newFiles.splice(fileIndex, 1);
          
          await updateDoc(reportRef, {
             files: newFiles
          });
        } catch (err) {
          console.error(err);
          showAlert('Logic Error', "Failed to execute deletion protocol.");
        }
      }
    });
  };

  const handleCreateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      await addReport({
        title: newTitle.trim(),
        content: newContent.trim(),
        files: []
      });
      setIsAddModalOpen(false);
      setNewTitle("");
      setNewContent("");
    } catch (err) {
      console.error(err);
      showAlert('Logic Error', "Cluster rejected folder creation.");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, reportId: string) => {
     const file = e.target.files?.[0];
     if (!file) return;
     
     if (file.size > 10 * 1024 * 1024) {
        showAlert('Protocol Restriction', "File size exceeds 10MB saturation limit.");
        return;
     }

     setIsSharing(reportId);

     const reader = new FileReader();
     reader.onloadend = async () => {
       try {
         const base64data = reader.result as string;
         const reportRef = doc(db, 'reports', reportId);
         const report = reports.find(r => r.id === reportId);
         const existingFiles = report?.files || [];
         
         let fileUrl = base64data;
         try {
             // We dynamically import storage specific things here if not already at top, wait import at top is better
             const { ref, uploadString, getDownloadURL } = await import('firebase/storage');
             const { storage, auth } = await import('../firebase');
             const { v4: uuidv4 } = await import('uuid');
             const storageRef = ref(storage, `reports/${auth.currentUser?.uid || 'anon'}/${uuidv4()}_${file.name}`);
             await uploadString(storageRef, base64data, 'data_url');
             fileUrl = await getDownloadURL(storageRef);
         } catch(e) {
             console.error("Storage upload failed", e);
         }
         
         const updatedReport = {
            ...report!,
            files: [...existingFiles, { name: file.name, type: file.type, data: fileUrl }]
         };

         await updateDoc(reportRef, {
            files: updatedReport.files
         });
         
         if (settings?.automation?.autoShareReports) {
             let recipients = customers;
             if (shareGroup === 'Active') recipients = customers.filter(c => c.status === 'Active');
             else if (shareGroup === 'Overdue') recipients = customers.filter(c => c.balance > 0);
             
             if (recipients.length > 0) {
                await shareReportToCustomers(updatedReport, recipients, settings);
                showAlert('Automation', "Buffer shared based on active daemon rules.");
             }
         }
       } catch (err) {
         console.error(err);
         showAlert('Stream Error', "Failed to transmit or bifurcate data.");
       } finally {
         setIsSharing(null);
       }
     };
     reader.readAsDataURL(file);
  };

  const handleShare = async (report: Report) => {
    if (!settings || customers.length === 0) {
      showAlert('Notice', "Registry empty or daemon uninitialized.");
      return;
    }
    
    setIsSharing(report.id);
    try {
      let recipients = customers;
      if (shareGroup === 'Active') recipients = customers.filter(c => c.status === 'Active');
      else if (shareGroup === 'Overdue') recipients = customers.filter(c => c.balance > 0);

      if (recipients.length === 0) {
        showAlert('Logic Notice', `No target vectors found in group: ${shareGroup}`);
        return;
      }
      
      await shareReportToCustomers(report, recipients, settings);
      showAlert('Success', `Transmitted to ${recipients.length} nodes successfully.`);
    } catch (err) {
      console.error(err);
      showAlert('Network Error', "Broadcast failed. Review WhatsApp API integrity.");
    } finally {
      setIsSharing(null);
    }
  };

  const generateLink = (report: Report) => {
      const baseUrl = window.location.origin;
      const portalUrl = `${baseUrl}/?portal=true&reportId=${report.id}`;
      navigator.clipboard.writeText(portalUrl);
      showAlert('Clipboard', "Public portal index link captured.");
  };

  const handleDelete = (id: string) => {
      setConfirmConfig({
        isOpen: true,
        title: "Delete Sequence",
        message: "This will incinerate the directory and all associated binary links. Proceed?",
        isDestructive: true,
        onConfirm: async () => {
          await deleteReport(id);
        }
      });
  };

  return (
    <div className="p-4 space-y-8 max-w-7xl mx-auto pb-24">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-6 border-b border-[var(--shadow-dark)] pb-8">
        <div>
           <div className="flex items-center gap-3 mb-2">
             <div className="p-2 neu-flat rounded-xl text-blue-600">
               <FolderClosed className="w-5 h-5" />
             </div>
             <span className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-600/60">Digital Assets</span>
           </div>
           <h1 className="text-4xl md:text-5xl font-black tracking-tighter uppercase mb-2">Notice <span className="text-blue-600">Broadcast</span></h1>
           <p className="text-xs neu-text-muted font-bold max-w-lg leading-relaxed uppercase tracking-tight opacity-70">
             Manage and distribute bulk notices, reports, and binary assets to segmented customer cohorts via WhatsApp logic.
           </p>
        </div>
        
        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setIsAddModalOpen(true)}
          className="px-8 py-4 neu-flat bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-lg shadow-blue-500/20 flex items-center gap-3 transition-all"
        >
          <Plus className="w-5 h-5" />
          Initialize Directory
        </motion.button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
        <AnimatePresence mode="popLayout">
          {reports.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="col-span-full py-40 neu-pressed rounded-[40px] flex flex-col items-center justify-center text-center px-10 border-4 border-dashed border-black/[0.02]"
            >
              <FileIcon className="w-16 h-16 text-neutral-200 mb-6" />
              <p className="text-[14px] font-black uppercase tracking-widest text-neutral-300">Archive Index Initialized</p>
              <p className="text-[10px] font-bold text-neutral-400 mt-2 max-w-xs uppercase tracking-tighter">No active folders found in the current cloud cluster.</p>
            </motion.div>
          ) : (
            reports.map((report, rIdx) => (
              <motion.div
                layout
                key={report.id}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ delay: rIdx * 0.05 }}
                className="neu-flat p-8 rounded-[32px] flex flex-col group relative overflow-hidden"
              >
                 <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                    <FileText className="w-24 h-24" />
                 </div>

                 <div className="relative z-10">
                    <div className="flex justify-between items-start mb-6">
                       <div>
                          <h3 className="font-black text-xl tracking-tight uppercase leading-none mb-1">{report.title}</h3>
                          <p className="text-[9px] font-bold neu-text-muted uppercase tracking-[0.15em] opacity-60">
                             {report.files?.length || 0} Assets Allocated
                          </p>
                       </div>
                       <div className="flex gap-2">
                          <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => generateLink(report)} className="p-3 neu-pressed rounded-xl text-blue-600"><LinkIcon className="w-4 h-4" /></motion.button>
                          <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => handleDelete(report.id)} className="p-3 neu-pressed rounded-xl text-rose-500"><Trash2 className="w-4 h-4" /></motion.button>
                       </div>
                    </div>
                    
                    <div className="mb-8">
                       <label className={`flex flex-col items-center justify-center gap-3 w-full p-6 neu-pressed rounded-2xl border-2 border-dashed border-black/[0.05] hover:bg-black/[0.02] transition-all cursor-pointer ${isSharing === report.id ? 'opacity-40 pointer-events-none' : ''}`}>
                          {isSharing === report.id ? <Loader2 className="w-6 h-6 animate-spin text-blue-600"/> : <CloudUpload className="w-6 h-6 text-blue-600/60" />} 
                          <span className="text-[10px] font-black uppercase tracking-widest">
                             {isSharing === report.id ? "Buffer Serializing..." : "Inject New Asset"}
                          </span>
                          <input type="file" className="hidden" onChange={(e) => handleFileUpload(e, report.id)} />
                       </label>
                    </div>
                    
                    {report.files && report.files.length > 0 && (
                       <div className="space-y-3 mb-8">
                          <p className="text-[9px] font-black text-neutral-400 p-1 uppercase tracking-widest">Inode Map</p>
                          <div className="max-h-[160px] overflow-y-auto pr-2 custom-scrollbar space-y-2">
                            {report.files.map((file, idx) => (
                               <div key={idx} className="flex items-center justify-between p-3 rounded-2xl bg-black/[0.03] border border-black/[0.02] group/file">
                                  <div className="flex items-center gap-3 overflow-hidden">
                                     <div className="p-2 neu-flat rounded-lg bg-emerald-500/10 text-emerald-600">
                                        <FileIcon className="w-3 h-3" />
                                     </div>
                                     <span className="text-[10px] font-black truncate max-w-[140px] uppercase tracking-tight">{file.name}</span>
                                  </div>
                                  <button onClick={() => handleDeleteFile(report.id, idx)} className="p-2 text-rose-500/40 hover:text-rose-500 transition-colors">
                                     <Trash2 className="w-3 h-3" />
                                  </button>
                               </div>
                            ))}
                          </div>
                       </div>
                    )}
                 </div>
                 
                 <div className="mt-auto pt-6 border-t border-[var(--shadow-dark)] space-y-5">
                   <div className="space-y-2">
                      <label className="text-[9px] font-black uppercase tracking-widest text-neutral-400 ml-1">Target Cluster</label>
                      <select 
                        value={shareGroup} 
                        onChange={e => setShareGroup(e.target.value as any)}
                        className="w-full text-[10px] font-black uppercase p-4 rounded-2xl neu-pressed border-none outline-none text-emerald-600 shadow-inner"
                      >
                        <option value="Active">Pulse: Active</option>
                        <option value="Overdue">Pulse: Overdue</option>
                        <option value="All">Pulse: Omni</option>
                      </select>
                   </div>
                   
                   <motion.button
                     whileHover={{ scale: 1.02 }}
                     whileTap={{ scale: 0.98 }}
                     onClick={() => handleShare(report)}
                     disabled={isSharing === report.id || settings?.automation?.autoShareReports}
                     className={`w-full py-5 rounded-2xl font-black text-[10px] shadow-lg flex items-center justify-center gap-3 transition-all uppercase tracking-widest ${settings?.automation?.autoShareReports ? 'neu-pressed text-emerald-600 pointer-events-none' : 'neu-flat bg-emerald-600 text-white shadow-emerald-500/20'}`}
                   >
                     {isSharing === report.id ? <Loader2 className="w-4 h-4 animate-spin" /> : (settings?.automation?.autoShareReports ? <CheckCircle2 className="w-4 h-4" /> : <Share2 className="w-4 h-4" />)}
                     {settings?.automation?.autoShareReports ? "Daemon Auto-Sync Active" : "Execute Broadcast"}
                   </motion.button>
                 </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>

      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 10 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 10 }}
            className="neu-flat p-10 rounded-[40px] w-full max-w-lg shadow-2xl border border-white/20"
          >
            <div className="flex items-center gap-4 mb-8">
               <div className="p-3 neu-flat rounded-2xl text-blue-600">
                  <FolderClosed className="w-6 h-6" />
               </div>
               <h3 className="text-2xl font-black uppercase tracking-tighter">New <span className="text-blue-600">Archive</span></h3>
            </div>
            
            <form onSubmit={handleCreateReport} className="space-y-6">
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Directory Metadata</label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  className="w-full px-6 py-5 neu-pressed rounded-3xl bg-transparent outline-none focus:ring-4 focus:ring-blue-500/10 text-xs font-black uppercase tracking-wider"
                  placeholder="ARCHIVE_REFERENCE_ID"
                />
              </div>
              <div className="pt-6 flex gap-4">
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 py-4 neu-pressed rounded-2xl font-black text-[10px] uppercase tracking-widest transition shadow-inner"
                >
                  Discard
                </motion.button>
                <motion.button
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  type="submit"
                  className="flex-1 py-4 bg-blue-600 text-white rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl shadow-blue-500/30 transition-all hover:bg-blue-700"
                >
                  Allocate
                </motion.button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
      
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
    </div>
  );
}