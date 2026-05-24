import { useState, useEffect, useRef } from 'react';
import { getPortalData, PublicPortalData } from '../lib/portal';
import { motion } from 'motion/react';
import { Droplet, Send, Loader2, Upload, FileText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db } from '../firebase';
import { Report } from '../lib/db';

export function PortalView() {
  const [portalData, setPortalData] = useState<PublicPortalData | null>(null);
  const [latestReport, setLatestReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [chatHistory, setChatHistory] = useState<{ role: string, content: string, attachments?: any[] }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [commands, setCommands] = useState<any[]>([]);
  const [isComplaintMode, setIsComplaintMode] = useState(false);
  const [complaintData, setComplaintData] = useState({ title: '', details: '' });
  const chatBodyRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    
    if (!file.type.startsWith('image/')) {
       addBotMessage("Please upload a valid image screenshot of your online payment.");
       return;
    }
    
    if (file.size > 5 * 1024 * 1024) {
       addBotMessage("Image too large. Maximum size is 5MB.");
       return;
    }
    
    setChatLoading(true);
    const reader = new FileReader();
    reader.onloadend = async () => {
      try {
        const img = new Image();
        img.onload = async () => {
          const canvas = document.createElement("canvas");
          const MAX_WIDTH = 1000;
          const MAX_HEIGHT = 1000;
          let width = img.width;
          let height = img.height;
          
          if (width > height) {
            if (width > MAX_WIDTH) {
              height *= MAX_WIDTH / width;
              width = MAX_WIDTH;
            }
          } else {
            if (height > MAX_HEIGHT) {
              width *= MAX_HEIGHT / height;
              height = MAX_HEIGHT;
            }
          }
          
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0, width, height);
          
          const base64Image = canvas.toDataURL("image/jpeg", 0.6);
          
          // Show user they uploaded an image
          setChatHistory(prev => [...prev, { role: 'user', content: '[Payment Screenshot Uploaded]', attachments: [{ type: 'image', data: base64Image }] }]);
          
          // Submit receipt
          const { submitPaymentReceipt } = await import('../lib/portal');
          await submitPaymentReceipt(portalData!, base64Image);
          
          addBotMessage("Thank you! Your payment screenshot has been uploaded and sent to the waterworks department for verification.");
          setChatLoading(false);
        };
        img.onerror = () => {
          addBotMessage("Failed to process image.");
          setChatLoading(false);
        };
        img.src = reader.result as string;
      } catch (err) {
        addBotMessage("Failed to upload screenshot. Please try again.");
        setChatLoading(false);
      }
    };
    reader.readAsDataURL(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  let portalId = new URLSearchParams(window.location.search).get('portal');
  if (portalId === 'true') {
    portalId = new URLSearchParams(window.location.search).get('customerId');
  }

  useEffect(() => {
    const fetchPortal = async () => {
      if (!portalId) {
        setError("Invalid or missing Portal Link.");
        setLoading(false);
        return;
      }
      try {
        const data = await getPortalData(portalId);
        if (!data) {
          setError("Portal Link not found or expired.");
        } else {
          setPortalData(data);
          
          // Fetch latest report for this owner
          try {
            const q = query(
              collection(db, 'reports'),
              where('ownerId', '==', data.ownerId),
              orderBy('createdAt', 'desc'),
              limit(1)
            );
            const reportSnap = await getDocs(q);
            if (!reportSnap.empty) {
              setLatestReport(reportSnap.docs[0].data() as Report);
            }
          } catch (reportErr) {
            console.error("Failed to fetch reports:", reportErr);
          }

          const res = await fetch(`/api/portal-chat/init/${portalId}`);
          if (res.ok) {
            const initData = await res.json();
            if (initData.commands) {
               setCommands(initData.commands);
            }
            if (initData.history && initData.history.length > 0) {
               setChatHistory(initData.history);
            } else {
               addBotMessage(`नमस्ते! 🙏 I'm your Panchayat Waterworks AI assistant for ${data.customerName}.\n\nWhat can I help you with today?`, true);
            }
          } else {
            addBotMessage(`नमस्ते! 🙏 I'm your Panchayat Waterworks AI assistant for ${data.customerName}.\n\nWhat can I help you with today?`, true);
          }
        }
      } catch (err: any) {
        setError("Failed to load portal. " + (err.message || err));
      }
      setLoading(false);
    };
    fetchPortal();
  }, [portalId]);

  const addBotMessage = (text: string, isInitial = false, attachments?: any[]) => {
    setChatHistory(prev => [...prev, { role: 'assistant', content: text, attachments }]);
    setTimeout(() => {
      if (chatBodyRef.current) {
        chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
      }
    }, 60);
  };

  const handleDeepDetailReport = () => {
    if (latestReport && ((latestReport.files && latestReport.files.length > 0) || latestReport.assetLink)) {
      if (latestReport.assetLink) {
         window.open(latestReport.assetLink, '_blank');
      } else if (latestReport.files && latestReport.files.length > 0) {
        const file = latestReport.files[0];
        // Open file in new tab
        const win = window.open();
        if (win) {
          win.document.write(`<iframe src="${file.data}" frameborder="0" style="border:0; top:0px; left:0px; bottom:0px; right:0px; width:100%; height:100%;" allowfullscreen></iframe>`);
          win.document.title = file.name;
        }
      }
    } else {
      // Humble personalized message
      const humbleMsg = `नमस्ते ${portalData?.customerName}, I understand you're looking for your Deep Detail Report. 🙏\n\nCurrently, our team is still refining the latest specific insights for your connection to ensure complete accuracy. We really value your patience while we get this ready for you! \n\nWe'll make sure it's available here as soon as it's finalized. Is there anything else I can help you with in the meantime?`;
      addBotMessage(humbleMsg);
    }
  };

  const handleSendMessage = async (customText?: string) => {
    const text = (customText || chatInput).trim();
    if (!text || !portalData) return;

    if (text.toLowerCase() === 'complaint' || text.toLowerCase() === 'शिकायत') {
       setIsComplaintMode(true);
       setChatInput("");
       addBotMessage("Please provide your complaint details. You can type the complaint title and a detailed description below.");
       return;
    }

    if (!customText) setChatInput("");
    
    const newHistory = [...chatHistory, { role: 'user', content: text }];
    setChatHistory(newHistory);
    
    setTimeout(() => {
      if (chatBodyRef.current) {
        chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
      }
    }, 60);

    setChatLoading(true);

    try {
      const response = await fetch(`/api/portal-chat/${portalId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text,
          customerId: portalData.customerId,
          ownerId: portalData.ownerId
        })
      });
      const data = await response.json();
      if (data.error) {
        addBotMessage(`❌ Output Error: ${data.error}`);
      } else {
        addBotMessage(data.reply, false, data.attachments);
      }
    } catch (err: any) {
      addBotMessage(`❌ Connection failed. Please try again.`);
    }
    setChatLoading(false);
  };

  const handleSubmitComplaint = async () => {
    if (!complaintData.title || !complaintData.details || !portalData) return;
    
    setChatLoading(true);
    try {
      const { submitPublicComplaint } = await import('../lib/portal');
      await submitPublicComplaint(portalData, complaintData.title, complaintData.details);
      
      setChatHistory(prev => [...prev, { role: 'user', content: `[Complaint Submitted]\nTitle: ${complaintData.title}\nDescription: ${complaintData.details}` }]);
      addBotMessage(`Thank you ${portalData.customerName}. Your complaint has been registered. We will look into it soon!`);
      
      setIsComplaintMode(false);
      setComplaintData({ title: '', details: '' });
    } catch (err) {
      addBotMessage("Failed to register complaint. Please try again.");
    } finally {
      setChatLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#f8f6f0] flex flex-col items-center justify-center space-y-6">
        <Loader2 className="w-10 h-10 animate-spin text-[#1a56db]" />
        <p className="text-sm font-bold text-[#1a56db]">Loading Portal...</p>
      </div>
    );
  }

  if (error || !portalData) {
    return (
      <div className="min-h-screen bg-[#f8f6f0] flex flex-col items-center justify-center p-4 text-center">
        <p className="p-4 bg-white shadow-xl rounded-2xl text-red-600 font-medium">⚠️ {error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f8f6f0] text-[#1a1a2e] font-sans flex flex-col selection:bg-blue-200">
      {/* Top Bar */}
      <div className="bg-[#0a1628] px-8 h-14 flex flex-shrink-0 items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-[#0d9488] rounded-lg flex items-center justify-center">
            <Droplet className="w-4 h-4 text-white" />
          </div>
          <div>
            <h1 className="text-[15px] font-semibold text-white tracking-wide">Panchayat Waterworks</h1>
            <p className="text-[11px] text-white/50 mt-0.5">Public Citizen Portal</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 bg-[#14b8a6]/10 border border-[#14b8a6]/30 rounded-full px-3 py-1 text-[12px] text-[#14b8a6] font-medium">
            <div className="w-1.5 h-1.5 bg-[#14b8a6] rounded-full animate-pulse" />
            AI Online
          </div>
        </div>
      </div>

      <div className="flex-1 max-w-6xl w-full mx-auto flex flex-col md:flex-row h-[calc(100vh-56px)]">
        {/* Sidebar */}
        <div className="hidden md:flex flex-col w-[280px] bg-white border-r border-black/5 p-6 gap-5 overflow-y-auto">
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-[1px] text-[#64748b] mb-2.5">Office Info</h3>
            <div className="bg-[#f8f6f0] border border-[#ede9df] rounded-xl p-3.5">
              <h4 className="text-[13px] font-bold mb-2 flex items-center gap-2">🏛️ Gram Panchayat</h4>
              <p className="text-[#64748b] text-xs flex gap-2 mb-1"><span>📍</span> Waterworks Department</p>
              <p className="text-[#64748b] text-xs flex gap-2 mb-1"><span>🕘</span> Mon–Sat, 9am–5pm</p>
              <p className="text-[#64748b] text-xs flex gap-2"><span>🌐</span> Portal available 24×7</p>
            </div>
          </div>
          <hr className="border-black/5" />
          <div>
            <h3 className="text-[11px] font-semibold uppercase tracking-[1px] text-[#64748b] mb-2.5">Quick Actions</h3>
            <button 
              onClick={handleDeepDetailReport}
              className="w-full mb-3 flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-[13px] bg-blue-600 text-white hover:bg-blue-700 shadow-md shadow-blue-500/20 transition-all font-bold text-left"
            >
               <FileText className="w-4 h-4" /> Deep Detail Report
            </button>
            {commands.map((cmd, idx) => (
              <button key={idx} onClick={() => handleSendMessage(cmd.buttonLabel)} className="w-full mb-1.5 flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] bg-transparent border border-black/5 hover:bg-[#f0f7ff] hover:text-[#1a56db] hover:border-blue-300 transition-colors text-left">
                 <span>🔘</span> {cmd.buttonLabel}
              </button>
            ))}
            {commands.length === 0 && (
              <p className="text-xs text-neutral-400">No quick buttons defined.</p>
            )}
          </div>
        </div>

        {/* Chat Area */}
        <div className="flex-1 flex flex-col relative overflow-hidden bg-white">
          <div className="flex-shrink-0 relative overflow-hidden bg-gradient-to-br from-[#0a1628] via-[#112040] to-[#0f3460] px-7 py-5">
            <div className="absolute -right-10 -top-10 w-48 h-48 bg-[#0d9488]/10 rounded-full blur-2xl" />
            <h2 className="text-xl text-white font-medium mb-1">नमस्ते {portalData?.customerName}! How can we help you?</h2>
            <p className="text-[12.5px] text-white/55">AI-powered assistant connected to your Panchayat database</p>
          </div>

          <div ref={chatBodyRef} className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-4 scroll-smooth">
            {chatHistory.map((msg, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex items-end gap-2.5 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}
              >
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-full bg-[#0d9488] flex-shrink-0 flex items-center justify-center mb-0.5 text-white text-sm">🚰</div>
                )}
                <div className="max-w-[85%] md:max-w-[70%]">
                  <div className={`p-3.5 rounded-2xl text-[14px] leading-relaxed break-words whitespace-pre-line shadow-sm border ${
                    msg.role === 'user'
                      ? 'bg-[#1a56db] text-white border-[#1d4ed8] rounded-br-[4px]'
                      : 'bg-[#f0f7ff] text-[#1a1a2e] border-blue-100 rounded-bl-[4px]'
                  }`}>
                    {msg.content}
                    
                    {/* Render Attachments */}
                    {msg.attachments?.map((att, attIdx) => (
                      <div key={attIdx} className="mt-2">
                        {att.type === 'image' && (
                          <img src={att.data} alt="Attachment" className="max-w-full rounded-lg border border-white/20" />
                        )}
                        {att.type === 'file' && (
                          <a href={att.data} download={att.name || "download"} className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/20 hover:bg-white/30 rounded text-sm underline">
                            📄 Download {att.name || "File"}
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                  {msg.role === 'assistant' && i === chatHistory.length - 1 && !chatLoading && (
                    <div className="mt-1.5 inline-flex items-center gap-1 bg-[#0d9488]/10 border border-[#0d9488]/20 px-2.5 py-0.5 rounded-full text-[10.5px] text-[#0d9488] font-medium">
                      ✓ Automated Reply
                    </div>
                  )}
                </div>
              </motion.div>
            ))}
            {chatLoading && (
              <div className="flex items-end gap-2.5">
                <div className="w-8 h-8 rounded-full bg-[#0d9488] flex-shrink-0 flex items-center justify-center mb-0.5 mt-auto">🚰</div>
                <div className="p-3.5 bg-[#f0f7ff] border border-blue-100 rounded-2xl rounded-bl-[4px] flex items-center gap-1 shadow-sm h-12">
                   <div className="w-1.5 h-1.5 rounded-full bg-[#3b82f6] animate-bounce" style={{ animationDelay: '0ms' }} />
                   <div className="w-1.5 h-1.5 rounded-full bg-[#3b82f6] animate-bounce" style={{ animationDelay: '150ms' }} />
                   <div className="w-1.5 h-1.5 rounded-full bg-[#3b82f6] animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            )}
          </div>

          <div className="flex-shrink-0 bg-white border-t border-black/5 flex flex-col">
            {/* Mobile Quick Actions */}
            <div className="md:hidden w-full overflow-x-auto flex gap-2 px-3 py-2.5 border-b border-black/5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
               <button 
                onClick={handleDeepDetailReport}
                className="inline-flex shrink-0 items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] bg-blue-600 text-white shadow-sm font-medium active:scale-95 transition-transform"
              >
                 <FileText className="w-3.5 h-3.5" /> Deep Detail Report
              </button>
              {commands.map((cmd, idx) => (
                <button key={idx} onClick={() => handleSendMessage(cmd.buttonLabel)} className="inline-flex shrink-0 items-center gap-1.5 px-3.5 py-1.5 rounded-full text-[12px] bg-[#f0f7ff] border border-blue-100 text-[#1a56db] font-medium transition-transform active:scale-95 active:bg-blue-100">
                   {cmd.buttonLabel}
                </button>
              ))}
            </div>

          <div className="p-3 md:p-5">
            {isComplaintMode ? (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="bg-white border-2 border-blue-100 p-4 rounded-2xl shadow-lg mb-2 space-y-3"
              >
                <div className="flex justify-between items-center mb-1">
                  <h4 className="text-sm font-bold text-blue-600">Register New Complaint</h4>
                  <button onClick={() => setIsComplaintMode(false)} className="text-xs text-neutral-400 hover:text-rose-500">Cancel</button>
                </div>
                <input 
                  type="text"
                  placeholder="Complaint Title (e.g., Billing Error)"
                  value={complaintData.title}
                  onChange={e => setComplaintData({...complaintData, title: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400"
                />
                <textarea 
                  placeholder="Describe your complaint in detail..."
                  value={complaintData.details}
                  onChange={e => setComplaintData({...complaintData, details: e.target.value})}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-sm outline-none focus:border-blue-400 min-h-[80px]"
                />
                <button 
                  onClick={handleSubmitComplaint}
                  disabled={!complaintData.title || !complaintData.details || chatLoading}
                  className="w-full py-2.5 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 disabled:bg-blue-300 transition-colors"
                >
                  {chatLoading ? "Registering..." : "Submit Complaint"}
                </button>
              </motion.div>
            ) : (
              <div className="flex items-end gap-2 bg-[#f8f6f0] border-2 border-black/[0.06] focus-within:border-blue-400 p-1.5 rounded-2xl transition-all relative">
                <textarea
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  className="flex-1 bg-transparent border-none outline-none resize-none p-2.5 text-[14px] min-h-[44px] max-h-[120px] rounded-xl"
                  placeholder="Ask anything about water bills... or type 'complaint'"
                  rows={1}
                />
                <input
                  type="file"
                  accept="image/*"
                  ref={fileInputRef}
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-[44px] h-[44px] shrink-0 bg-[#e2e8f0] text-[#64748b] rounded-xl flex items-center justify-center hover:bg-[#cbd5e1] hover:text-[#0f172a] transition mb-0.5"
                  title="Upload Payment Screenshot"
                >
                  <Upload className="w-5 h-5" />
                </button>
                <button 
                  onClick={() => handleSendMessage()}
                  disabled={!chatInput.trim() || chatLoading}
                  className="w-[44px] h-[44px] shrink-0 bg-[#1a56db] disabled:bg-blue-300 text-white rounded-xl flex items-center justify-center hover:bg-blue-700 transition transform hover:scale-105 disabled:hover:scale-100 disabled:cursor-not-allowed mb-0.5 mr-0.5"
                >
                  <Send className="w-5 h-5 -ml-0.5" />
                </button>
              </div>
            )}
            <p className="text-center text-[10.5px] text-[#64748b] mt-3 hidden md:block">
              🔒 Answers are generated automatically based on your Panchayat's configured rules.
            </p>
          </div>
          </div>

        </div>
      </div>
    </div>
  );
}
