import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Report, addReport, deleteReport, updateReportTags, ReportTag, REPORT_TAG_LABELS, Customer, AppSettings } from "../lib/db";
import { useData } from "../contexts/DataContext";
import { useTenant } from "../contexts/TenantContext";
import { shareReportToCustomers } from "../lib/automation";
import { updateDoc, doc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { motion, AnimatePresence } from "motion/react";
import { FileText, Plus, Share2, Loader2, Link as LinkIcon, AlertCircle, Upload, File as FileIcon, Trash2, FolderClosed, MoreHorizontal, Copy, CheckCircle2, CloudUpload, Tag } from "lucide-react";
import { ConfirmModal } from "../components/ConfirmModal";
import { uploadImageToStorage } from "../lib/storage";

export function ReportsView() {
  const { reports, customers, settings } = useData();
  const { currentOwnerId } = useTenant();
  
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isSharing, setIsSharing] = useState<string | null>(null);
  const [shareGroup, setShareGroup] = useState<'All' | 'Active' | 'Overdue' | 'Advance Paid'>('Active');
  const [tagFilter, setTagFilter] = useState<'all' | 'panchayat_report' | 'deep_details_report'>('all');
  
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newAssetLink, setNewAssetLink] = useState("");
  const [newTags, setNewTags] = useState<ReportTag[]>(['panchayat_report']);

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

  const isReportTagged = (report: Report, tag: ReportTag): boolean => {
    if (Array.isArray(report.tags) && report.tags.length > 0) {
      return report.tags.some(t => {
        const tl = String(t).toLowerCase();
        if (tag === 'panchayat_report') return tl === 'panchayat_report' || tl.includes('panchayat');
        if (tag === 'deep_details_report') return tl === 'deep_details_report' || tl.includes('deep');
        return false;
      });
    }
    if (report.reportType) {
      if (report.reportType === 'both') return true;
      if (report.reportType === tag) return true;
    }
    // Fallback for legacy
    if (tag === 'deep_details_report') return Boolean(report.title?.toLowerCase().includes('deep'));
    return !report.title?.toLowerCase().includes('deep');
  };

  const handleToggleTagOnReport = async (report: Report, tagToToggle: ReportTag) => {
    const currentlyHas = isReportTagged(report, tagToToggle);
    const existingTags = Array.isArray(report.tags) && report.tags.length > 0
      ? [...report.tags]
      : [isReportTagged(report, 'panchayat_report') ? 'panchayat_report' : 'deep_details_report'];
    
    let nextTags: string[];
    if (currentlyHas) {
      nextTags = existingTags.filter(t => {
        const tl = String(t).toLowerCase();
        if (tagToToggle === 'panchayat_report') return !tl.includes('panchayat');
        if (tagToToggle === 'deep_details_report') return !tl.includes('deep');
        return true;
      });
      if (nextTags.length === 0) {
        // Keep at least the other tag
        nextTags = [tagToToggle === 'panchayat_report' ? 'deep_details_report' : 'panchayat_report'];
      }
    } else {
      nextTags = [...existingTags, tagToToggle];
    }

    try {
      await updateReportTags(report.id, nextTags, currentOwnerId || undefined);
    } catch (err) {
      console.error(err);
      showAlert('Error', "Failed to update report tags.");
    }
  };

  const toggleNewTag = (tag: ReportTag) => {
    setNewTags(prev => {
      if (prev.includes(tag)) {
        if (prev.length === 1) return prev; // Keep at least one
        return prev.filter(t => t !== tag);
      } else {
        return [...prev, tag];
      }
    });
  };

  const handleCreateReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;
    try {
      const tagsToSave = newTags.length > 0 ? newTags : ['panchayat_report'];
      await addReport({
        title: newTitle.trim(),
        content: newContent.trim(),
        assetLink: newAssetLink.trim(),
        files: [],
        tags: tagsToSave,
        reportType: tagsToSave.includes('panchayat_report') && tagsToSave.includes('deep_details_report')
          ? 'both'
          : tagsToSave.includes('deep_details_report')
          ? 'deep_details_report'
          : 'panchayat_report',
        ...(currentOwnerId ? { ownerId: currentOwnerId } : {})
      }, currentOwnerId || undefined);
      setIsAddModalOpen(false);
      setNewTitle("");
      setNewContent("");
      setNewAssetLink("");
      setNewTags(['panchayat_report']);
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

     try {
       const effectiveUid = currentOwnerId || auth.currentUser?.uid;
       const fileUrl = await uploadImageToStorage(file, 'reports', effectiveUid, `${Date.now()}_${file.name}`);
       const reportRef = doc(db, 'reports', reportId);
       const report = reports.find(r => r.id === reportId);
       const existingFiles = report?.files || [];
       
       const updatedReport = {
          ...report!,
          files: [...existingFiles, { name: file.name, type: file.type, data: fileUrl }]
       };

       await updateDoc(reportRef, {
          files: updatedReport.files
       });
       
       if (settings?.automation?.autoShareReports) {
           let recipients = customers;
           if (shareGroup === 'Active') recipients = customers.filter(c => c.status === 'Active' || c.status === 'Advance Paid');
           else if (shareGroup === 'Overdue') recipients = customers.filter(c => c.balance > 0);
           else if (shareGroup === 'Advance Paid') recipients = customers.filter(c => c.status === 'Advance Paid' || (c.advanceBalance && c.advanceBalance > 0));
           
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

  const handleShare = async (report: Report) => {
    if (!settings || customers.length === 0) {
      showAlert('Notice', "Registry empty or daemon uninitialized.");
      return;
    }
    
    setIsSharing(report.id);
    try {
      let recipients = customers;
      if (shareGroup === 'Active') recipients = customers.filter(c => c.status === 'Active' || c.status === 'Advance Paid');
      else if (shareGroup === 'Overdue') recipients = customers.filter(c => c.balance > 0);
      else if (shareGroup === 'Advance Paid') recipients = customers.filter(c => c.status === 'Advance Paid' || (c.advanceBalance && c.advanceBalance > 0));

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
          await deleteReport(id, currentOwnerId || undefined);
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

      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => setTagFilter('all')}
          className={`px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all ${
            tagFilter === 'all'
              ? 'neu-pressed bg-black/5 text-blue-600 shadow-inner'
              : 'neu-flat text-neutral-500 hover:text-neutral-800'
          }`}
        >
          All Archives ({reports.length})
        </button>
        <button
          onClick={() => setTagFilter('panchayat_report')}
          className={`px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
            tagFilter === 'panchayat_report'
              ? 'neu-pressed bg-blue-500/10 text-blue-600 border border-blue-500/30 shadow-inner'
              : 'neu-flat text-neutral-500 hover:text-blue-600'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          a. Panchayat Reports ({reports.filter(r => isReportTagged(r, 'panchayat_report')).length})
        </button>
        <button
          onClick={() => setTagFilter('deep_details_report')}
          className={`px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all flex items-center gap-2 ${
            tagFilter === 'deep_details_report'
              ? 'neu-pressed bg-purple-500/10 text-purple-600 border border-purple-500/30 shadow-inner'
              : 'neu-flat text-neutral-500 hover:text-purple-600'
          }`}
        >
          <span className="w-2 h-2 rounded-full bg-purple-500" />
          b. Deep Details Report ({reports.filter(r => isReportTagged(r, 'deep_details_report')).length})
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8">
        <AnimatePresence mode="popLayout">
          {reports.filter(r => tagFilter === 'all' ? true : isReportTagged(r, tagFilter)).length === 0 ? (
            <motion.div 
              initial={{ opacity: 0 }} animate={{ opacity: 1 }}
              className="col-span-full py-32 neu-pressed rounded-[40px] flex flex-col items-center justify-center text-center px-10 border-4 border-dashed border-black/[0.02]"
            >
              <FileIcon className="w-16 h-16 text-neutral-200 mb-6" />
              <p className="text-[14px] font-black uppercase tracking-widest text-neutral-300">
                {tagFilter === 'all' ? 'Archive Index Empty' : `No Reports Tagged: ${tagFilter === 'panchayat_report' ? 'Panchayat Reports' : 'Deep Details Report'}`}
              </p>
              <p className="text-[10px] font-bold text-neutral-400 mt-2 max-w-xs uppercase tracking-tighter">
                {tagFilter === 'all' 
                  ? 'No active report archives found in this workspace.' 
                  : 'Tag your reports below or initialize a new directory with this category.'}
              </p>
            </motion.div>
          ) : (
            reports.filter(r => tagFilter === 'all' ? true : isReportTagged(r, tagFilter)).map((report, rIdx) => {
              const hasPanchayatTag = isReportTagged(report, 'panchayat_report');
              const hasDeepTag = isReportTagged(report, 'deep_details_report');

              return (
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
                      <div className="flex justify-between items-start mb-4">
                         <div>
                            <h3 className="font-black text-xl tracking-tight uppercase leading-none mb-1">{report.title}</h3>
                            <p className="text-[9px] font-bold neu-text-muted uppercase tracking-[0.15em] opacity-60">
                               {report.files?.length || 0} Assets {report.assetLink ? ' • 1 Link' : ''}
                            </p>
                         </div>
                         <div className="flex gap-2">
                            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => generateLink(report)} className="p-3 neu-pressed rounded-xl text-blue-600" title="Copy public portal link"><LinkIcon className="w-4 h-4" /></motion.button>
                            <motion.button whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }} onClick={() => handleDelete(report.id)} className="p-3 neu-pressed rounded-xl text-rose-500" title="Delete directory"><Trash2 className="w-4 h-4" /></motion.button>
                         </div>
                      </div>

                      {/* WhatsApp Dispatch Tags Switcher */}
                      <div className="p-3 neu-pressed rounded-2xl bg-black/[0.02] mb-6 space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[8px] font-black uppercase tracking-widest text-neutral-400 flex items-center gap-1">
                            <Tag className="w-3 h-3 text-blue-600" /> WhatsApp Bot Dispatch Tags
                          </span>
                          <span className="text-[7px] font-bold uppercase tracking-wider text-neutral-400 opacity-60">Click to Toggle</span>
                        </div>
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          <button
                            type="button"
                            onClick={() => handleToggleTagOnReport(report, 'panchayat_report')}
                            title="When enabled, this report appears when residents ask for Panchayat Reports on WhatsApp"
                            className={`px-2.5 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                              hasPanchayatTag
                                ? 'bg-blue-600 text-white shadow-sm shadow-blue-500/20'
                                : 'bg-black/5 text-neutral-400 hover:text-neutral-700 opacity-60 hover:opacity-100'
                            }`}
                          >
                            <CheckCircle2 className={`w-3 h-3 ${hasPanchayatTag ? 'text-white' : 'opacity-30'}`} />
                            a. Panchayat Reports
                          </button>
                          <button
                            type="button"
                            onClick={() => handleToggleTagOnReport(report, 'deep_details_report')}
                            title="When enabled, this report appears when residents ask for Deep Details Report on WhatsApp"
                            className={`px-2.5 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-wider flex items-center gap-1.5 transition-all ${
                              hasDeepTag
                                ? 'bg-purple-600 text-white shadow-sm shadow-purple-500/20'
                                : 'bg-black/5 text-neutral-400 hover:text-neutral-700 opacity-60 hover:opacity-100'
                            }`}
                          >
                            <CheckCircle2 className={`w-3 h-3 ${hasDeepTag ? 'text-white' : 'opacity-30'}`} />
                            b. Deep Details Report
                          </button>
                        </div>
                      </div>
                      
                      <div className="mb-6">
                         <label className={`flex flex-col items-center justify-center gap-3 w-full p-6 neu-pressed rounded-2xl border-2 border-dashed border-black/[0.05] hover:bg-black/[0.02] transition-all cursor-pointer ${isSharing === report.id ? 'opacity-40 pointer-events-none' : ''}`}>
                            {isSharing === report.id ? <Loader2 className="w-6 h-6 animate-spin text-blue-600"/> : <CloudUpload className="w-6 h-6 text-blue-600/60" />} 
                            <span className="text-[10px] font-black uppercase tracking-widest">
                               {isSharing === report.id ? "Buffer Serializing..." : "Inject New Asset / PDF"}
                            </span>
                            <input type="file" className="hidden" onChange={(e) => handleFileUpload(e, report.id)} />
                         </label>
                      </div>
                      
                      {report.files && report.files.length > 0 && (
                         <div className="space-y-3 mb-6">
                            <p className="text-[9px] font-black text-neutral-400 p-1 uppercase tracking-widest">Inode Map ({report.files.length} PDFs/Files)</p>
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
                   
                   <div className="mt-auto pt-6 border-t border-[var(--shadow-dark)] space-y-4">
                     <div className="space-y-2">
                        <label className="text-[9px] font-black uppercase tracking-widest text-neutral-400 ml-1">Target Cluster</label>
                        <select 
                          value={shareGroup} 
                          onChange={e => setShareGroup(e.target.value as any)}
                          className="w-full text-[10px] font-black uppercase p-4 rounded-2xl neu-pressed border-none outline-none text-emerald-600 shadow-inner"
                        >
                          <option value="Active">Pulse: Active</option>
                          <option value="Overdue">Pulse: Overdue</option>
                          <option value="Advance Paid">Pulse: Advance Paid</option>
                          <option value="All">Pulse: Omni</option>
                        </select>
                     </div>
                     
                     <motion.button
                       whileHover={{ scale: 1.02 }}
                       whileTap={{ scale: 0.98 }}
                       onClick={() => handleShare(report)}
                       disabled={isSharing === report.id || settings?.automation?.autoShareReports}
                       className={`w-full py-4 rounded-2xl font-black text-[10px] shadow-lg flex items-center justify-center gap-3 transition-all uppercase tracking-widest ${settings?.automation?.autoShareReports ? 'neu-pressed text-emerald-600 pointer-events-none' : 'neu-flat bg-emerald-600 text-white shadow-emerald-500/20'}`}
                     >
                       {isSharing === report.id ? <Loader2 className="w-4 h-4 animate-spin" /> : (settings?.automation?.autoShareReports ? <CheckCircle2 className="w-4 h-4" /> : <Share2 className="w-4 h-4" />)}
                       {settings?.automation?.autoShareReports ? "Daemon Auto-Sync Active" : "Broadcast via WhatsApp"}
                     </motion.button>
                   </div>
                </motion.div>
              );
            })
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
              <div className="space-y-5">
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Directory Metadata</label>
                  <input
                    type="text"
                    required
                    autoFocus
                    value={newTitle}
                    onChange={e => setNewTitle(e.target.value)}
                    className="w-full px-6 py-4 neu-pressed rounded-3xl bg-transparent outline-none focus:ring-4 focus:ring-blue-500/10 text-xs font-black uppercase tracking-wider"
                    placeholder="E.g. January 2026 Water Expenditure"
                  />
                </div>

                {/* Report Tags Selector */}
                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">
                    WhatsApp Chatbot Dispatch Tag
                  </label>
                  <p className="text-[9px] font-bold neu-text-muted ml-1 uppercase tracking-tight">
                    Select which WhatsApp bot queries should deliver this report:
                  </p>
                  <div className="grid grid-cols-1 gap-2.5 pt-1">
                    <button
                      type="button"
                      onClick={() => toggleNewTag('panchayat_report')}
                      className={`p-3.5 rounded-2xl flex items-start gap-3 text-left transition-all ${
                        newTags.includes('panchayat_report')
                          ? 'neu-pressed bg-blue-500/10 border-2 border-blue-500'
                          : 'neu-flat hover:bg-black/5 border border-transparent'
                      }`}
                    >
                      <div className={`mt-0.5 p-1 rounded-lg ${newTags.includes('panchayat_report') ? 'bg-blue-600 text-white' : 'bg-neutral-200 text-transparent'}`}>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="text-[11px] font-black uppercase text-blue-600">a. Panchayat Reports</div>
                        <p className="text-[9px] font-bold neu-text-muted mt-0.5 leading-tight">
                          Dispatched when residents type "Panchayat Reports", "Reports", or option 1
                        </p>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => toggleNewTag('deep_details_report')}
                      className={`p-3.5 rounded-2xl flex items-start gap-3 text-left transition-all ${
                        newTags.includes('deep_details_report')
                          ? 'neu-pressed bg-purple-500/10 border-2 border-purple-500'
                          : 'neu-flat hover:bg-black/5 border border-transparent'
                      }`}
                    >
                      <div className={`mt-0.5 p-1 rounded-lg ${newTags.includes('deep_details_report') ? 'bg-purple-600 text-white' : 'bg-neutral-200 text-transparent'}`}>
                        <CheckCircle2 className="w-3.5 h-3.5" />
                      </div>
                      <div>
                        <div className="text-[11px] font-black uppercase text-purple-600">b. Deep Details Report</div>
                        <p className="text-[9px] font-bold neu-text-muted mt-0.5 leading-tight">
                          Dispatched when residents type "Deep Details Report", itemized vouchers & repairs
                        </p>
                      </div>
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-[10px] font-black text-neutral-400 uppercase tracking-widest ml-1">Drive/Asset Link (Optional)</label>
                  <input
                    type="text"
                    value={newAssetLink}
                    onChange={e => setNewAssetLink(e.target.value)}
                    className="w-full px-6 py-4 neu-pressed rounded-3xl bg-transparent outline-none focus:ring-4 focus:ring-blue-500/10 text-xs font-black uppercase tracking-wider"
                    placeholder="https://drive.google.com/..."
                  />
                </div>
              </div>
              <div className="pt-4 flex gap-4">
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