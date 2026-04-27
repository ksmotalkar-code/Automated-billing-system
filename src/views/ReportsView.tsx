import { useState, useEffect, useRef } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Report, subscribeToReports, addReport, deleteReport, Customer, subscribeToCustomers, subscribeToSettings, AppSettings, ReportFile } from "../lib/db";
import { shareReportToCustomers } from "../lib/automation";
import { updateDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { motion } from "motion/react";
import { FileText, Plus, Share2, Loader2, Link as LinkIcon, AlertCircle, Upload, File as FileIcon, Trash2 } from "lucide-react";

export function ReportsView() {
  const [reports, setReports] = useState<Report[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSharing, setIsSharing] = useState<string | null>(null);
  const [shareGroup, setShareGroup] = useState<'All' | 'Active' | 'Overdue'>('Active');
  
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
      alert("Failed to create folder.");
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, reportId: string) => {
     const file = e.target.files?.[0];
     if (!file) return;
     
     if (file.size > 10 * 1024 * 1024) {
        alert("File too large. Max 10MB.");
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
                alert("File uploaded and shared automatically!");
             } else {
                alert("File uploaded. No customers matched the selected group for auto-sharing.");
             }
         } else {
             alert("File uploaded successfully. You can now share it manually.");
         }
       } catch (err) {
         console.error(err);
         alert("Failed to upload file or process sharing.");
       } finally {
         setIsSharing(null);
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
      let recipients = customers;
      if (shareGroup === 'Active') recipients = customers.filter(c => c.status === 'Active');
      else if (shareGroup === 'Overdue') recipients = customers.filter(c => c.balance > 0);

      if (recipients.length === 0) {
        alert(`No customers found in group: ${shareGroup}`);
        return;
      }
      
      await shareReportToCustomers(report, recipients, settings);
      alert(`Shared successfully to ${recipients.length} customers!`);
    } catch (err) {
      console.error(err);
      alert("Error sharing folder. Make sure your WhatsApp API or Web integration is configured.");
    } finally {
      setIsSharing(null);
    }
  };

  const generateLink = (report: Report) => {
      const baseUrl = window.location.origin;
      const portalUrl = `${baseUrl}/?portal=true&reportId=${report.id}`;
      navigator.clipboard.writeText(portalUrl);
      alert("Portal link copied to clipboard");
  };

  const handleDelete = async (id: string) => {
      if (!confirm("Are you sure you want to delete this folder?")) return;
      await deleteReport(id);
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
      {/* Add Modal removed for brevity */}
    </div>
  );
}
