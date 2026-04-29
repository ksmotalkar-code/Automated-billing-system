import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Report, subscribeToReports, addReport, deleteReport, Customer, subscribeToCustomers, subscribeToSettings, AppSettings, ReportFile } from "../lib/db";
import { shareReportToCustomers } from "../lib/automation";
import { updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { motion } from "motion/react";
import { FileText, Plus, Share2, Loader2, Link as LinkIcon, AlertCircle, Upload, File as FileIcon, Trash2 } from "lucide-react";
import { ConfirmModal } from "../components/ConfirmModal";

export function ReportsView() {
  const [reports, setReports] = useState<Report[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  
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

  const handleDeleteFile = async (reportId: string, fileIndex: number) => {
    setConfirmConfig({
      isOpen: true,
      title: "Delete File",
      message: "Are you sure you want to delete this file?",
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
          showAlert('Notice', "File deleted successfully.");
        } catch (err) {
          console.error(err);
          showAlert('Notice', "Failed to delete file.");
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
      showAlert('Notice', "Failed to create folder.");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, reportId: string) => {
     const file = e.target.files?.[0];
     if (!file) return;
     
     if (file.size > 10 * 1024 * 1024) {
        showAlert('Notice', "File too large. Max 10MB.");
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
         
         const updatedReport = {
            ...report!,
            files: [...existingFiles, { name: file.name, type: file.type, data: base64data }]
         };

         await updateDoc(reportRef, {
            files: updatedReport.files
         });
         
         // Trigger Auto Share if enabled
         if (settings?.automation?.autoShareReports) {
             let recipients = customers;
             if (shareGroup === 'Active') recipients = customers.filter(c => c.status === 'Active');
             else if (shareGroup === 'Overdue') recipients = customers.filter(c => c.balance > 0);
             
             if (recipients.length > 0) {
                await shareReportToCustomers(updatedReport, recipients, settings);
                showAlert('Notice', "File uploaded and shared automatically!");
             } else {
                showAlert('Notice', "File uploaded. No customers matched the selected group for auto-sharing.");
             }
         } else {
             showAlert('Notice', "File uploaded successfully. You can now share it manually.");
         }
       } catch (err) {
         console.error(err);
         showAlert('Notice', "Failed to upload file or process sharing.");
       } finally {
         setIsSharing(null);
       }
     };
     reader.readAsDataURL(file);
  };

  const handleShare = async (report: Report) => {
    if (!settings || customers.length === 0) {
      showAlert('Notice', "System not ready or no customers found.");
      return;
    }
    
    setIsSharing(report.id);
    try {
      let recipients = customers;
      if (shareGroup === 'Active') recipients = customers.filter(c => c.status === 'Active');
      else if (shareGroup === 'Overdue') recipients = customers.filter(c => c.balance > 0);

      if (recipients.length === 0) {
        showAlert('Notice', `No customers found in group: ${shareGroup}`);
        return;
      }
      
      await shareReportToCustomers(report, recipients, settings);
      showAlert('Notice', `Shared successfully to ${recipients.length} customers!`);
    } catch (err) {
      console.error(err);
      showAlert('Notice', "Error sharing folder. Make sure your WhatsApp API or Web integration is configured.");
    } finally {
      setIsSharing(null);
    }
  };

  const generateLink = (report: Report) => {
      const baseUrl = window.location.origin;
      const portalUrl = `${baseUrl}/?portal=true&reportId=${report.id}`;
      navigator.clipboard.writeText(portalUrl);
      showAlert('Notice', "Portal link copied to clipboard");
  };

  const handleDelete = (id: string) => {
      setConfirmConfig({
        isOpen: true,
        title: "Delete Folder",
        message: "Are you sure you want to delete this folder?",
        isDestructive: true,
        onConfirm: async () => {
          await deleteReport(id);
        }
      });
  };

  return (
    <div className="space-y-6 pb-20">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-4">
        <div>
           <h2 className="text-2xl font-bold tracking-tight">Reports & Folders</h2>
           <p className="neu-text-muted">Broadcast notices to customer groups</p>
        </div>
        <button 
          onClick={() => setIsAddModalOpen(true)}
          className="flex items-center justify-center gap-2 px-4 py-3 sm:py-2 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition"
        >
          <Plus className="w-4 h-4" /> Create Folder
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {reports.length === 0 ? (
           <div className="col-span-full py-20 text-center neu-text-muted">
             No folders created.
           </div>
        ) : (
          reports.map(report => (
            <motion.div
              key={report.id}
              className="neu-bg neu-text neu-flat p-6 rounded-3xl flex flex-col justify-between"
            >
               <div>
                  <div className="flex justify-between items-start mb-2">
                     <h3 className="font-bold text-lg">{report.title}</h3>
                     <div className="flex">
                        <button onClick={() => generateLink(report)} className="p-2 hover:bg-black/5 rounded-xl"><LinkIcon className="w-4 h-4 text-blue-500" /></button>
                        <button onClick={() => handleDelete(report.id)} className="p-2 hover:bg-black/5 rounded-xl"><Trash2 className="w-4 h-4 text-rose-500" /></button>
                     </div>
                  </div>
                  
                  <div className="mt-4 mb-4 bg-white/5 p-3 rounded-2xl border border-[var(--shadow-dark)]">
                     <label className="flex justify-center items-center gap-2 w-full px-3 py-2 neu-pressed rounded-xl text-xs font-bold cursor-pointer hover:bg-black/5 transition">
                        {isSharing === report.id ? <Loader2 className="w-3 h-3 animate-spin"/> : <Upload className="w-3 h-3" />} 
                        {isSharing === report.id ? "Uploading & Processing..." : "Upload File"}
                        <input type="file" className="hidden" disabled={isSharing === report.id} onChange={(e) => handleFileUpload(e, report.id)} />
                     </label>
                  </div>
                  
                  {report.files && report.files.length > 0 && (
                     <div className="mt-2 space-y-2 mb-4">
                        <p className="text-xs font-bold text-slate-500 uppercase">Uploaded Files ({report.files.length})</p>
                        {report.files.map((file, idx) => (
                           <div key={idx} className="flex items-center justify-between p-2 rounded-xl border border-[var(--shadow-dark)] bg-black/5">
                              <div className="flex items-center gap-2 overflow-hidden">
                                 <FileIcon className="w-4 h-4 text-emerald-500 shrink-0" />
                                 <span className="text-xs font-medium truncate">{file.name}</span>
                              </div>
                              <button onClick={() => handleDeleteFile(report.id, idx)} className="p-1.5 hover:bg-black/10 rounded-lg shrink-0 text-rose-500">
                                 <Trash2 className="w-3 h-3" />
                              </button>
                           </div>
                        ))}
                     </div>
                  )}
               </div>
               
               <div className="pt-4 border-t border-[var(--shadow-dark)] space-y-3">
                 <select 
                    value={shareGroup} 
                    onChange={e => setShareGroup(e.target.value as any)}
                    className="w-full text-xs p-2 rounded-xl neu-pressed border-none outline-none"
                 >
                    <option value="Active">Active Customers</option>
                    <option value="Overdue">Overdue Customers</option>
                    <option value="All">All Customers</option>
                 </select>
                 
                 <div className="flex gap-2">
                   <button
                     onClick={() => handleShare(report)}
                     disabled={isSharing === report.id || settings?.automation?.autoShareReports}
                     className="w-full flex justify-center items-center gap-2 px-4 py-2 bg-emerald-100 text-emerald-700 rounded-xl font-bold hover:bg-emerald-200 transition disabled:opacity-50"
                   >
                     {isSharing === report.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <Share2 className="w-4 h-4" />}
                     {settings?.automation?.autoShareReports ? "Auto-Share is ON" : "Share via WhatsApp"}
                   </button>
                 </div>
                 
                 {settings?.automation?.autoShareReports && (
                   <p className="text-[10px] text-center text-emerald-600 font-medium">Wait! 'Automate Report Sharing' is ON. Uploading will automatically share the report to the selected group.</p>
                 )}
               </div>
            </motion.div>
          ))
        )}
      </div>
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="neu-bg p-6 lg:p-8 rounded-3xl w-full max-w-lg shadow-2xl border border-white/20"
          >
            <h3 className="text-xl font-bold mb-6">Create New Folder</h3>
            <form onSubmit={handleCreateReport} className="space-y-4">
              <div>
                <label className="block text-sm font-bold text-slate-500 uppercase tracking-wider mb-2 ml-1">Folder Name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  value={newTitle}
                  onChange={e => setNewTitle(e.target.value)}
                  className="w-full px-4 py-3 neu-pressed rounded-xl bg-transparent outline-none focus:ring-2 focus:ring-blue-500/50 text-sm"
                  placeholder="e.g. December Statements"
                />
              </div>
              <div className="pt-4 flex gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="flex-1 py-3 neu-flat rounded-xl font-bold text-sm transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold text-sm shadow-lg hover:shadow-xl hover:bg-blue-700 transition"
                >
                  Create
                </button>
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
