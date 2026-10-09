import React, { useState, useEffect } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { motion, AnimatePresence } from 'motion/react';
import { RefreshCw, Sparkles, X, ArrowUpCircle, CheckCircle2 } from 'lucide-react';

export function PWAUpdateToast() {
  const [isUpdating, setIsUpdating] = useState(false);
  const [isDismissed, setIsDismissed] = useState(false);
  const [showOfflineNotice, setShowOfflineNotice] = useState(false);
  const [isDismissedPermanently, setIsDismissedPermanently] = useState(() => {
    try {
      return localStorage.getItem('pwa_update_dismissed_permanently') === 'true';
    } catch (e) {
      return false;
    }
  });

  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(swUrl, registration) {
      console.log('[PWA] Service Worker registered at:', swUrl);
      if (registration) {
        // Check for updates when tab gains focus
        const handleVisibilityChange = () => {
          if (document.visibilityState === 'visible' && navigator.onLine) {
            console.log('[PWA] Checking for updates on window focus...');
            registration.update().catch(err => {
              console.warn('[PWA] Focus update check failed:', err);
            });
          }
        };
        document.addEventListener('visibilitychange', handleVisibilityChange);

        // Check for updates in the background periodically (every 60s)
        const pollInterval = setInterval(() => {
          if (navigator.onLine) {
            registration.update().catch(err => {
              console.warn('[PWA] Periodic update check failed:', err);
            });
          }
        }, 60000);

        return () => {
          document.removeEventListener('visibilitychange', handleVisibilityChange);
          clearInterval(pollInterval);
        };
      }
    },
    onRegisterError(error) {
      console.warn('[PWA] Service worker registration error:', error);
    },
  });

  // Handle offline ready notice (subtle auto-dismiss)
  useEffect(() => {
    if (offlineReady) {
      setShowOfflineNotice(true);
      const timer = setTimeout(() => {
        setShowOfflineNotice(false);
        setOfflineReady(false);
      }, 4000);
      return () => clearTimeout(timer);
    }
  }, [offlineReady, setOfflineReady]);

  // Support manual dev / test triggers via custom event
  useEffect(() => {
    const handleTestUpdate = () => {
      setNeedRefresh(true);
      setIsDismissed(false);
      setIsDismissedPermanently(false);
    };
    window.addEventListener('pwa-show-update', handleTestUpdate);
    return () => window.removeEventListener('pwa-show-update', handleTestUpdate);
  }, [setNeedRefresh]);

  const handleUpdate = async () => {
    setIsUpdating(true);
    try {
      localStorage.removeItem('pwa_update_dismissed_permanently');
      console.log('[PWA] User accepted update. Activating waiting service worker and refreshing...');
      let reloaded = false;
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.addEventListener('controllerchange', () => {
          if (!reloaded) {
            reloaded = true;
            window.location.reload();
          }
        });
      }
      await updateServiceWorker(true);
      setTimeout(() => {
        if (!reloaded) {
          reloaded = true;
          window.location.reload();
        }
      }, 1200);
    } catch (err) {
      console.error('[PWA] Update execution error:', err);
      window.location.reload();
    }
  };

  const handleDismiss = () => {
    setIsDismissed(true);
  };

  const handleDismissPermanently = () => {
    setIsDismissedPermanently(true);
    try {
      localStorage.setItem('pwa_update_dismissed_permanently', 'true');
    } catch (e) {
      // Ignore
    }
  };

  const handleReopen = () => {
    setIsDismissed(false);
  };

  if (isDismissedPermanently) {
    return null;
  }

  return (
    <>
      {/* Offline Ready Notice */}
      <AnimatePresence>
        {showOfflineNotice && !needRefresh && (
          <motion.div
            initial={{ opacity: 0, y: 20, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 20, scale: 0.95 }}
            className="fixed bottom-4 left-4 z-[99999] pointer-events-auto"
          >
            <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-emerald-600 text-white shadow-xl shadow-emerald-900/30 text-xs font-bold border border-emerald-400/30">
              <CheckCircle2 className="w-4 h-4 text-emerald-200" />
              <span>PWA Ready: App cached for offline use</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Update Available Toast */}
      <AnimatePresence>
        {needRefresh && !isDismissed && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 30, scale: 0.95 }}
            transition={{ type: 'spring', stiffness: 350, damping: 25 }}
            className="fixed bottom-5 right-5 sm:bottom-6 sm:right-6 z-[999999] pointer-events-auto max-w-sm sm:max-w-md w-[calc(100vw-2.5rem)]"
          >
            <div className="p-4 sm:p-5 rounded-2xl bg-slate-900/95 dark:bg-slate-900/95 text-white shadow-2xl shadow-black/50 border border-slate-700/80 backdrop-blur-xl ring-1 ring-white/10 relative">
              <button
                type="button"
                onClick={handleDismissPermanently}
                className="absolute top-3 right-3 p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors flex-shrink-0"
                title="Dismiss completely"
              >
                <X className="w-4 h-4" />
              </button>

              <div className="flex items-start justify-between gap-3 pr-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-white shadow-lg shadow-emerald-500/30 flex-shrink-0 animate-pulse">
                    <Sparkles className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-extrabold text-sm sm:text-base tracking-tight text-white">
                        Update Available
                      </h4>
                      <span className="px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                        New Version
                      </span>
                    </div>
                    <p className="text-xs text-slate-300 mt-1 leading-relaxed">
                      A newer version of the application has been downloaded. Reload to apply the updates when you are ready.
                    </p>
                  </div>
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={handleDismiss}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold text-slate-300 hover:text-white hover:bg-slate-800 transition-colors"
                >
                  Later
                </button>
                <button
                  type="button"
                  onClick={handleUpdate}
                  disabled={isUpdating}
                  className="px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wider bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-white shadow-lg shadow-emerald-600/30 transition-all flex items-center gap-2 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isUpdating ? 'animate-spin' : ''}`} />
                  {isUpdating ? 'Reloading...' : 'Update Now'}
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Minimized floating pill when user clicked 'Later' */}
      <AnimatePresence>
        {needRefresh && isDismissed && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            className="fixed bottom-5 right-5 z-[999999] pointer-events-auto flex items-center gap-2"
          >
            <div className="flex items-center rounded-full bg-slate-900/95 text-white shadow-xl border border-emerald-500/50 backdrop-blur-md overflow-hidden">
              <button
                type="button"
                onClick={handleReopen}
                className="flex items-center gap-2 px-3.5 py-2 text-xs font-bold hover:bg-slate-800 transition-all group"
                title="Click to view update"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                <ArrowUpCircle className="w-4 h-4 text-emerald-400 group-hover:rotate-45 transition-transform" />
                <span>Update Ready</span>
              </button>
              <button
                type="button"
                onClick={handleDismissPermanently}
                className="p-2 border-l border-emerald-500/30 hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
                title="Close permanently"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
