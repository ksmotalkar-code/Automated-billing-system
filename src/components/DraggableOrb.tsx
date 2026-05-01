import { useRef, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { MessageCircle, X, Settings, Database, Send, Loader2, Key } from 'lucide-react';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

export function DraggableOrb({ onSettingsClick, onAdminClick }: { onSettingsClick?: () => void, onAdminClick?: () => void }) {
  const constraintsRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'assistant', content: 'Hi! I am your AI assistant. How can I help you today?' }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [apiKey, setApiKey] = useState(localStorage.getItem('GROQ_API_KEY') || '');
  const [showConfig, setShowConfig] = useState(!localStorage.getItem('GROQ_API_KEY'));

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (messagesEndRef.current && isOpen) {
      messagesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, isOpen]);

  const saveApiKey = () => {
    localStorage.setItem('GROQ_API_KEY', apiKey);
    setShowConfig(false);
  };

  const handleSend = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || !apiKey) return;
    
    const newMsg: Message = { id: Date.now().toString(), role: 'user', content: input.trim() };
    setMessages(prev => [...prev, newMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: "llama-3.3-70b-versatile",
          messages: [...messages, newMsg].map(m => ({ role: m.role, content: m.content })),
          temperature: 0.7
        })
      });

      if (!response.ok) throw new Error("API Request Failed / Invalid Key");

      const data = await response.json();
      const replyText = data.choices[0]?.message?.content || "No response received.";
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: replyText }]);
    } catch (error: any) {
       console.error(error);
       setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: `Error: ${error.message}` }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div ref={constraintsRef} className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
      <motion.div
        drag={!isOpen} // Only drag when closed so chatting is stable
        dragConstraints={constraintsRef}
        dragElastic={0.2}
        dragMomentum={true}
        className="absolute bottom-8 right-8 pointer-events-auto flex flex-col items-end gap-4"
        style={{ touchAction: 'none' }}
      >
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5, y: 20, transformOrigin: 'bottom right' }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.5, y: 20 }}
              className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-slate-200 dark:border-slate-800"
              style={{ width: '360px', height: '500px', maxWidth: 'calc(100vw - 32px)' }}
            >
              <div className="bg-[#128C7E] px-4 py-3 flex items-center justify-between text-white shadow-md z-10">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-white/20 flex items-center justify-center">
                    <MessageCircle className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h3 className="font-bold text-sm">WhatsApp AI</h3>
                    <p className="text-xs text-white/80 shrink-0">Online</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <button onClick={() => setShowConfig(!showConfig)} className="p-2 hover:bg-white/20 rounded-full transition-colors" title="AI Config">
                    <Key className="w-4 h-4" />
                  </button>
                  <button onClick={() => { setIsOpen(false); if(onAdminClick) onAdminClick(); }} className="p-2 hover:bg-white/20 rounded-full transition-colors" title="Providers">
                    <Database className="w-4 h-4" />
                  </button>
                  <button onClick={() => { setIsOpen(false); if(onSettingsClick) onSettingsClick(); }} className="p-2 hover:bg-white/20 rounded-full transition-colors" title="Settings">
                    <Settings className="w-4 h-4" />
                  </button>
                  <button onClick={() => setIsOpen(false)} className="p-2 hover:bg-red-500/80 hover:text-white rounded-full transition-colors ml-1" title="Close">
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {showConfig ? (
                <div className="flex-1 p-6 flex flex-col gap-4 bg-slate-50 dark:bg-slate-800">
                  <h4 className="font-bold text-slate-800 dark:text-white">Groq Configuration</h4>
                  <p className="text-sm border-l-2 pl-3 border-amber-500 text-slate-600 dark:text-slate-300 bg-amber-50 dark:bg-slate-900 py-2">
                    Enter your Groq API Key to enable the AI assistant.
                  </p>
                  <input 
                    type="password" 
                    value={apiKey} 
                    onChange={e => setApiKey(e.target.value)}
                    placeholder="gsk_xxxxxxxxxxxxxxxxxxxxxx"
                    className="px-4 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl outline-none focus:border-[#128C7E] w-full"
                  />
                  <button 
                    onClick={saveApiKey}
                    className="mt-auto px-4 py-3 bg-[#128C7E] text-white font-bold rounded-xl hover:bg-[#075E54] transition-colors"
                  >
                    Save & Start Chatting
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex-1 p-4 overflow-y-auto flex flex-col gap-3 bg-[url('https://transparenttextures.com/patterns/cubes.png')] bg-slate-50/50 dark:bg-slate-900 relative">
                    {messages.map(msg => (
                      <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                        <div className={`px-4 py-2 rounded-2xl max-w-[85%] shadow-sm text-sm ${msg.role === 'user' ? 'bg-[#dcf8c6] text-slate-900 rounded-tr-none' : 'bg-white text-slate-800 rounded-tl-none border border-slate-100'}`}>
                          {msg.content}
                        </div>
                      </div>
                    ))}
                    {isLoading && (
                      <div className="flex justify-start">
                        <div className="px-4 py-2 rounded-2xl bg-white text-slate-800 rounded-tl-none shadow-sm flex items-center gap-2">
                          <Loader2 className="w-4 h-4 animate-spin text-[#128C7E]" />
                          <span className="text-xs text-slate-500">Typing...</span>
                        </div>
                      </div>
                    )}
                    <div ref={messagesEndRef} />
                  </div>
                  
                  <form onSubmit={handleSend} className="p-3 bg-slate-100 dark:bg-slate-800 flex items-center gap-2">
                    <input
                      type="text"
                      value={input}
                      onChange={e => setInput(e.target.value)}
                      placeholder="Type a message..."
                      className="flex-1 px-4 py-3 rounded-full outline-none border-none shadow-sm text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                    <button 
                      type="submit" 
                      disabled={!input.trim() || isLoading}
                      className="w-12 h-12 bg-[#128C7E] rounded-full flex items-center justify-center text-white disabled:opacity-50 disabled:cursor-not-allowed hover:bg-[#075E54] transition-colors shadow-sm"
                    >
                      <Send className="w-5 h-5 ml-1" />
                    </button>
                  </form>
                </>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {!isOpen && (
          <motion.button
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.9 }}
            onClick={() => setIsOpen(true)}
            className="w-16 h-16 rounded-full flex items-center justify-center shadow-[0_4px_14px_rgba(37,211,102,0.4)] cursor-pointer text-white bg-[#25D366] hover:shadow-[0_0_25px_rgba(37,211,102,0.8)] transition-all duration-300"
          >
            <MessageCircle className="w-8 h-8" />
          </motion.button>
        )}
      </motion.div>
    </div>
  );
}
