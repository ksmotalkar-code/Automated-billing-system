import { motion, AnimatePresence } from "motion/react";
import { AlertTriangle, X } from "lucide-react";

interface ConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  showCancel?: boolean;
}

export function ConfirmModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirm",
  cancelText = "Cancel",
  isDestructive = false,
  showCancel = true
}: ConfirmModalProps) {
  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="w-full max-w-md bg-[var(--bg-color)] rounded-3xl shadow-2xl border border-[var(--shadow-light)] overflow-hidden"
          >
            <div className="flex items-center justify-between p-6 border-b border-[var(--shadow-dark)]">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-xl ${isDestructive ? 'bg-rose-100 text-rose-600' : 'bg-blue-100 text-blue-600'}`}>
                  <AlertTriangle className="w-5 h-5" />
                </div>
                <h3 className="text-lg font-bold">{title}</h3>
              </div>
              <button 
                onClick={onClose}
                className="p-1 rounded-full hover:bg-black/10 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            
            <div className="p-6">
              <p className="neu-text leading-relaxed">
                {message}
              </p>
            </div>

            <div className="p-6 bg-black/5 flex justify-end gap-3">
              {showCancel && (
                <button 
                  onClick={onClose}
                  className="px-6 py-2 neu-flat rounded-xl font-bold text-sm"
                >
                  {cancelText}
                </button>
              )}
              <button 
                onClick={() => {
                  onConfirm();
                  onClose();
                }}
                className={`px-6 py-2 rounded-xl font-bold text-sm text-white shadow-lg transition-all ${
                  isDestructive 
                    ? 'bg-rose-600 shadow-rose-500/30 hover:bg-rose-700' 
                    : 'bg-blue-600 shadow-blue-500/30 hover:bg-blue-700'
                }`}
              >
                {confirmText}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
