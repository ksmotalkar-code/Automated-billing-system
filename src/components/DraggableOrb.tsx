import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Sparkles, X, Settings, Zap, Database } from 'lucide-react';

export function DraggableOrb({ onSettingsClick, onAdminClick }: { onSettingsClick?: () => void, onAdminClick?: () => void }) {
  const constraintsRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div ref={constraintsRef} className="fixed inset-0 pointer-events-none z-[100] overflow-hidden">
      <motion.div
        drag
        dragConstraints={constraintsRef}
        dragElastic={0.2}
        dragMomentum={true}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
        className="absolute bottom-8 right-8 pointer-events-auto flex flex-col items-end gap-4"
        style={{ touchAction: 'none' }}
      >
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, scale: 0.5, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.5, y: 20 }}
              className="flex flex-col gap-3 mb-2"
            >
              <motion.button 
                whileHover={{ scale: 1.1, x: -5 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => {
                  setIsOpen(false);
                  if (onSettingsClick) onSettingsClick();
                }}
                className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-lg text-slate-700 hover:text-indigo-600 border border-slate-100"
                title="Settings"
              >
                <Settings className="w-5 h-5" />
              </motion.button>
              
              <motion.button 
                whileHover={{ scale: 1.1, x: -5 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => {
                  setIsOpen(false);
                  if (onAdminClick) onAdminClick();
                }}
                className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-lg text-slate-700 hover:text-amber-600 border border-slate-100"
                title="Providers"
              >
                <Database className="w-5 h-5" />
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>

        <button
          onClick={() => setIsOpen(!isOpen)}
          className={`w-14 h-14 rounded-full flex items-center justify-center shadow-[0_8px_30px_rgba(99,102,241,0.5)] cursor-pointer text-white border-2 border-white/20 backdrop-blur-sm transition-colors duration-300 ${
            isOpen ? 'bg-slate-800' : 'bg-gradient-to-tr from-indigo-500 to-purple-500'
          }`}
        >
          {isOpen ? <X className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />}
        </button>
      </motion.div>
    </div>
  );
}
