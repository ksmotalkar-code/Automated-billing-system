/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from "react";
import { Sidebar } from "./components/Sidebar";
import { DashboardView } from "./views/DashboardView";
import { CustomersView } from "./views/CustomersView";
import { AlertsView } from "./views/AlertsView";
import { BillingView } from "./views/BillingView";
import { PaymentsView } from "./views/PaymentsView";
import { SettingsView } from "./views/SettingsView";
import { DataUploadView } from "./views/DataUploadView";
import { ComplaintsView } from "./views/ComplaintsView";
import { ReportsView } from "./views/ReportsView";
import { AnimatePresence, motion } from "motion/react";
import { Menu, X } from "lucide-react";
import { resetAllBalances } from "./lib/db";
import { auth, loginWithGoogle, logout } from './firebase';
import { onAuthStateChanged, User, signInWithEmailAndPassword, createUserWithEmailAndPassword } from 'firebase/auth';
import { useTranslation } from 'react-i18next';
import { subscribeToCustomers, subscribeToSettings, cleanupOldData, Customer, AppSettings } from "./lib/db";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { runAutomationCycle } from "./lib/automation";

import { PortalView } from "./views/PortalView";

export default function App() {
  const [activeLayer, setActiveLayer] = useState("dashboard");
  const [theme, setTheme] = useState("midnight");
  const [uiStyle, setUiStyle] = useState("glassmorphism"); // "neumorphism" or "glassmorphism"
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [isAuthReady, setIsAuthReady] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [isRegistering, setIsRegistering] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [portalMode, setPortalMode] = useState(false);

  useEffect(() => {
    // Check if URL has ?portal=
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('portal')) {
      setPortalMode(true);
    }
  }, []);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (isRegistering && password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    try {
      if (isRegistering) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err: any) {
      let message = err.message;
      if (err.code === 'auth/email-already-in-use') message = "This email is already registered.";
      if (err.code === 'auth/weak-password') message = "Password should be at least 6 characters.";
      if (err.code === 'auth/invalid-credential') message = "Invalid email or password.";
      if (err.code === 'auth/user-not-found') message = "No account found with this email.";
      if (err.code === 'auth/wrong-password') message = "Incorrect password.";
      setError(message);
    }
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setIsAuthReady(true);
    });
    return () => unsubscribe();
  }, []);

  // Automation & Data Sync
  useEffect(() => {
    if (user) {
      const unsubCustomers = subscribeToCustomers(setCustomers);
      const unsubSettings = subscribeToSettings(setSettings);
      cleanupOldData(); // Run cleanup on login
      return () => {
        unsubCustomers();
        unsubSettings();
      };
    }
  }, [user]);

  // Run automation cycle when data is ready
  useEffect(() => {
    // Moved to backend server (server.ts) via /api/cron/daily
    // if (user && customers.length > 0 && settings) {
    //   runAutomationCycle(customers, settings);
    // }
  }, [user, customers.length, settings]);

  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    document.documentElement.setAttribute("data-ui", uiStyle);
  }, [theme, uiStyle]);

  // Auto-collapse sidebar on smaller screens
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth < 1024) {
        setIsExpanded(false);
      } else {
        setIsExpanded(true);
      }
    };
    
    window.addEventListener('resize', handleResize);
    handleResize();
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const renderView = () => {
    switch (activeLayer) {
      case "dashboard": return <DashboardView key="dashboard" />;
      case "customers": return <CustomersView key="customers" />;
      case "alerts": return <AlertsView key="alerts" />;
      case "billing": return <BillingView key="billing" />;
      case "payments": return <PaymentsView key="payments" />;
      case "complaints": return <ComplaintsView key="complaints" />;
      case "reports": return <ReportsView key="reports" />;
      case "upload": return <DataUploadView key="upload" />;
      case "settings": return <SettingsView key="settings" />;
      default: 
        return (
          <motion.div 
            key="construction"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center justify-center h-[70vh] w-full"
          >
            <div className="p-8 neu-pressed rounded-3xl max-w-md w-full text-center space-y-6 flex flex-col items-center">
              <div className="w-20 h-20 rounded-2xl neu-flat flex items-center justify-center text-blue-600">
                <Menu className="w-10 h-10" />
              </div>
              <div>
                <h2 className="text-2xl font-bold tracking-tight mb-2">View Under Construction</h2>
                <p className="text-sm neu-text-muted">This layer is currently being integrated into the dashboard infrastructure. Please check back later.</p>
              </div>
            </div>
          </motion.div>
        );
    }
  };

  if (portalMode) {
    return <PortalView />;
  }

  if (!isAuthReady) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center neu-bg neu-text space-y-6">
        <motion.div 
          animate={{ rotate: 360 }}
          transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
          className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-[inset_4px_4px_8px_rgba(0,0,0,0.1),inset_-4px_-4px_8px_rgba(255,255,255,0.7)]"
        >
          <div className="w-8 h-8 rounded-full border-4 border-blue-500 border-t-transparent animate-spin"></div>
        </motion.div>
        <p className="text-sm font-bold tracking-widest text-blue-500 uppercase">Synchronizing Engine...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center neu-bg neu-text p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="p-8 neu-pressed rounded-3xl max-w-md w-full text-center space-y-6"
        >
          <div className="w-20 h-20 mx-auto rounded-2xl flex items-center justify-center text-white font-bold text-4xl static-glow transition-all duration-300" style={{ background: 'var(--accent)' }}>
            TS
          </div>
          <div>
            <h1 className="text-3xl font-black bg-gradient-to-br from-blue-600 to-indigo-600 bg-clip-text text-transparent">Trismart ABS</h1>
            <p className="neu-text-muted mt-2 font-bold uppercase tracking-widest text-xs">Automated Billing System</p>
            <p className="text-xs text-blue-600 font-medium mt-4 px-4 py-2 bg-blue-50 rounded-lg inline-block">
              Registration is open! Create your own private workspace.
            </p>
          </div>
          
          <form onSubmit={handleAuth} className="space-y-4">
            {error && (
              <div className="space-y-2">
                <p className="text-rose-500 text-sm">{error}</p>
                <button 
                  type="button"
                  onClick={() => window.open(window.location.href, '_blank')}
                  className="text-xs text-blue-600 underline hover:text-blue-800"
                >
                  Try opening in a new tab
                </button>
              </div>
            )}
            <input 
              type="email" 
              placeholder="Email or ID" 
              value={email} 
              onChange={(e) => setEmail(e.target.value)}
              className="w-full p-4 neu-pressed rounded-xl border-none outline-none"
              required
            />
            <input 
              type="password" 
              placeholder="Password" 
              value={password} 
              onChange={(e) => setPassword(e.target.value)}
              className="w-full p-4 neu-pressed rounded-xl border-none outline-none"
              required
            />
            {isRegistering && (
              <input 
                type="password" 
                placeholder="Confirm Password" 
                value={confirmPassword} 
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full p-4 neu-pressed rounded-xl border-none outline-none"
                required
              />
            )}
            <button 
              type="submit"
              className="w-full py-4 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition-colors"
            >
              {isRegistering ? 'Register' : 'Sign In'}
            </button>
            <button 
              type="button"
              onClick={() => setIsRegistering(!isRegistering)}
              className="w-full text-sm neu-text-muted hover:text-blue-600"
            >
              {isRegistering ? 'Already have an account? Sign In' : 'Need an account? Register'}
            </button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-[var(--shadow-dark)]"></div>
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-[var(--bg-color)] px-2 neu-text-muted">Or continue with</span>
            </div>
          </div>

          <button 
            onClick={async () => {
              setError(null);
              try {
                await loginWithGoogle();
              } catch (err: any) {
                setError(err.message);
              }
            }}
            className="w-full py-4 neu-flat rounded-xl font-bold hover:bg-black/5 transition-colors"
          >
            Sign in with Google
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className={`flex h-screen neu-bg font-sans neu-text overflow-hidden transition-colors duration-300 relative ${uiStyle === 'glassmorphism' ? 'bg-gradient-to-br from-[var(--bg-color)] to-slate-900/10' : ''}`}>
      {/* Background Motion Graphics */}
      <div className={`absolute inset-0 overflow-hidden pointer-events-none z-0 ${uiStyle === 'glassmorphism' ? 'opacity-70' : 'opacity-30'}`}>
        <motion.div 
          animate={{ 
            scale: [1, 1.2, 1],
            rotate: [0, 90, 0],
            x: [0, 100, 0],
            y: [0, 50, 0]
          }}
          transition={{ duration: 20, repeat: Infinity, ease: "linear" }}
          className={`absolute -top-24 -left-24 w-96 h-96 rounded-full blur-3xl ${uiStyle === 'glassmorphism' ? 'bg-[var(--accent)]/40' : 'bg-blue-500/20'}`}
        />
        <motion.div 
          animate={{ 
            scale: [1, 1.3, 1],
            rotate: [0, -90, 0],
            x: [0, -100, 0],
            y: [0, -50, 0]
          }}
          transition={{ duration: 25, repeat: Infinity, ease: "linear" }}
          className={`absolute -bottom-24 -right-24 w-96 h-96 rounded-full blur-3xl ${uiStyle === 'glassmorphism' ? 'bg-indigo-500/40' : 'bg-indigo-500/20'}`}
        />
        <motion.div 
          animate={{ 
            opacity: [0.1, 0.4, 0.1],
            scale: [0.8, 1.1, 0.8]
          }}
          transition={{ duration: 15, repeat: Infinity, ease: "easeInOut" }}
          className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] rounded-full blur-[120px] ${uiStyle === 'glassmorphism' ? 'bg-purple-500/30' : 'bg-purple-500/10'}`}
        />
      </div>

      <div className={`${isSidebarOpen ? 'fixed inset-0 z-50' : 'hidden'} md:flex md:relative md:z-10`}>
        {isSidebarOpen && (
          <div className="absolute inset-0 bg-black/50 md:hidden" onClick={() => setIsSidebarOpen(false)} />
        )}
        <div className="relative z-10 h-full">
          <Sidebar 
            activeLayer={activeLayer} 
            setActiveLayer={(id) => { setActiveLayer(id); setIsSidebarOpen(false); }} 
            theme={theme} 
            setTheme={setTheme} 
            uiStyle={uiStyle}
            setUiStyle={setUiStyle}
            isExpanded={isExpanded}
            setIsExpanded={setIsExpanded}
          />
        </div>
      </div>
      <main className="flex-1 overflow-y-auto p-4 md:p-8 relative w-full">
        <div className="flex justify-between items-center mb-4">
          <button 
            className="md:hidden p-2 neu-flat rounded-xl"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
          >
            {isSidebarOpen ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
          </button>
          <div className="hidden md:flex items-center gap-4 ml-auto">
            <span className="text-sm font-medium">Admin</span>
            <button 
              onClick={logout}
              className="px-4 py-2 neu-flat rounded-xl text-sm font-bold text-rose-500 hover:bg-rose-500/10 transition-colors"
            >
              Logout
            </button>
          </div>
        </div>
        <div className="max-w-7xl mx-auto h-full">
          <ErrorBoundary>
            <AnimatePresence mode="wait">
              <motion.div
                key={activeLayer}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -20 }}
                transition={{ duration: 0.3, ease: "easeInOut" }}
                className="h-full"
              >
                {renderView()}
              </motion.div>
            </AnimatePresence>
          </ErrorBoundary>
        </div>
      </main>
    </div>
  );
}




