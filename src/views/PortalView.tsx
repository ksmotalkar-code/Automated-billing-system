import { useState, useEffect, useRef } from 'react';
import { getPortalData, PublicPortalData } from '../lib/portal';
import { motion } from 'motion/react';
import { Droplet, Send, Loader2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';

export function PortalView() {
  const [portalData, setPortalData] = useState<PublicPortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [chatHistory, setChatHistory] = useState<{ role: string, content: string }[]>([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [commands, setCommands] = useState<any[]>([]);
  const chatBodyRef = useRef<HTMLDivElement>(null);
  
  const { t } = useTranslation();

  const portalId = new URLSearchParams(window.location.search).get('portal');

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
        setError(err.message || "Failed to load portal.");
      }
      setLoading(false);
    };
    fetchPortal();
  }, [portalId]);

  const addBotMessage = (text: string, isInitial = false) => {
    setChatHistory(prev => [...prev, { role: 'assistant', content: text }]);
    setTimeout(() => {
      if (chatBodyRef.current) {
        chatBodyRef.current.scrollTop = chatBodyRef.current.scrollHeight;
      }
    }, 60);
  };

  const handleSendMessage = async (customText?: string) => {
    const text = (customText || chatInput).trim();
    if (!text || !portalData) return;

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
        addBotMessage(data.reply);
      }
    } catch (err: any) {
      addBotMessage(`❌ Connection failed. Please try again.`);
    }
    setChatLoading(false);
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

          <div className="flex-shrink-0 p-4 md:p-5 bg-white border-t border-black/5">
            <div className="flex items-end gap-2 bg-[#f8f6f0] border-2 border-black/[0.06] focus-within:border-blue-400 p-1.5 rounded-2xl transition-all">
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
                placeholder="Ask anything about water bills, connections, complaints..."
                rows={1}
              />
              <button 
                onClick={() => handleSendMessage()}
                disabled={!chatInput.trim() || chatLoading}
                className="w-[44px] h-[44px] shrink-0 bg-[#1a56db] disabled:bg-blue-300 text-white rounded-xl flex items-center justify-center hover:bg-blue-700 transition transform hover:scale-105 disabled:hover:scale-100 disabled:cursor-not-allowed mb-0.5 mr-0.5"
              >
                <Send className="w-5 h-5 -ml-0.5" />
              </button>
            </div>
            <p className="text-center text-[10.5px] text-[#64748b] mt-3 hidden md:block">
              🔒 Answers are generated automatically based on your Panchayat's configured rules.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
