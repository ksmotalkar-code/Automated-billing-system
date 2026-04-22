import {
  LayoutDashboard,
  Users,
  BellRing,
  FileText,
  CreditCard,
  Settings,
  Palette,
  ChevronLeft,
  ChevronRight,
  UploadCloud,
  Languages,
  AlertTriangle
} from "lucide-react";
import { cn } from "../lib/utils";
import { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { useTranslation } from "react-i18next";
import { usePWAInstall } from "../hooks/usePWAInstall";
import { Download } from "lucide-react";

export const layers = [
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard, description: "Overview & Metrics" },
  { id: "customers", label: "Customers", icon: Users, description: "Manage Accounts" },
  { id: "alerts", label: "Alerts & Notifications", icon: BellRing, description: "Monitor & Remind" },
  { id: "billing", label: "Invoices & Billing", icon: FileText, description: "Billing Cycles" },
  { id: "payments", label: "Payments", icon: CreditCard, description: "Transaction History" },
  { id: "complaints", label: "Complaints", icon: AlertTriangle, description: "Manage Complaints" },
  { id: "reports", label: "Reports", icon: FileText, description: "Manage Broadcasts" },
  { id: "upload", label: "Data Upload", icon: UploadCloud, description: "Upload Excel/PDF" },
];

const themes = [
  { id: 'light', name: 'Light', color: '#e0e5ec' },
  { id: 'dark', name: 'Dark', color: '#2d3748' },
  { id: 'ocean', name: 'Ocean', color: '#d9e2ec' },
  { id: 'forest', name: 'Forest', color: '#e2e8e4' },
  { id: 'sunset', name: 'Sunset', color: '#fde8e8' },
  { id: 'lavender', name: 'Lavender', color: '#e9e4f0' },
  { id: 'sand', name: 'Sand', color: '#f4f1ea' },
  { id: 'mint', name: 'Mint', color: '#e6f2ed' },
  { id: 'rose', name: 'Rose', color: '#fce8f3' },
  { id: 'midnight', name: 'Midnight', color: '#1a202c' },
  { id: 'accessible-high', name: 'High Contrast', color: '#ffffff' },
  { id: 'color-blind', name: 'Color Blind', color: '#004488' },
];

interface SidebarProps {
  activeLayer: string;
  setActiveLayer: (id: string) => void;
  theme: string;
  setTheme: (theme: string) => void;
  uiStyle: string;
  setUiStyle: (uiStyle: string) => void;
  isExpanded: boolean;
  setIsExpanded: (expanded: boolean) => void;
}

export function Sidebar({ activeLayer, setActiveLayer, theme, setTheme, uiStyle, setUiStyle, isExpanded, setIsExpanded }: SidebarProps) {
  const [showThemes, setShowThemes] = useState(false);
  const { t, i18n } = useTranslation();
  const { isInstallable, promptInstall } = usePWAInstall();

  const toggleLanguage = () => {
    const newLang = i18n.language === 'en' ? 'pa' : 'en';
    i18n.changeLanguage(newLang);
  };

  return (
    <motion.div 
      initial={false}
      animate={{ width: isExpanded ? 280 : 80 }}
      className="neu-bg neu-text flex flex-col h-screen shrink-0 overflow-y-auto overflow-x-hidden transition-all duration-300 z-10 backdrop-blur-md bg-opacity-80 border-r border-white/10 relative" 
      style={{ boxShadow: "6px 0 12px var(--shadow-dark)" }}
    >
      <div className="p-4 flex items-center justify-between sticky top-0 neu-bg bg-opacity-90 backdrop-blur-lg z-10 mb-4 border-b border-white/5">
        <motion.div 
          onClick={() => window.location.reload()}
          className="flex items-center gap-3 overflow-hidden cursor-pointer group"
        >
          <motion.div 
            transition={{ type: "spring", stiffness: 400, damping: 10 }}
            className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center text-white font-bold text-xl static-glow transition-all duration-300"
            style={{ background: 'var(--accent)' }}
          >
            TS
          </motion.div>
          <AnimatePresence>
            {isExpanded && (
              <motion.div 
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="whitespace-nowrap"
              >
                <h1 className="neu-text font-black text-lg leading-tight tracking-tighter group-hover:text-[var(--accent)] transition-colors">Trismart ABS</h1>
                <p className="text-[10px] neu-accent uppercase tracking-widest font-black opacity-80">Automated Billing</p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
        <motion.button 
          whileHover={{ scale: 1.2, x: 5 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => setIsExpanded(!isExpanded)}
          className="hidden md:flex p-1.5 neu-flat rounded-lg hover:neu-pressed absolute -right-3 top-6 bg-[var(--bg-color)] border border-[var(--shadow-dark)] z-50 shadow-md"
        >
          {isExpanded ? <ChevronLeft className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
        </motion.button>
      </div>
      
      <div className="flex-1 py-2">
        <div className={cn("px-5 mb-3 text-[10px] font-bold neu-text-muted uppercase tracking-widest transition-all", isExpanded ? "opacity-100" : "opacity-0 h-0 mb-0 overflow-hidden")}>
          Main Console
        </div>
        <nav className="space-y-2 px-3 mb-6">
          {layers.filter(l => l.id === "dashboard").map((layer, idx) => {
            const Icon = layer.icon;
            const isActive = activeLayer === layer.id;
            return (
              <motion.button
                key={layer.id}
                whileHover={{ scale: 1.05, x: isExpanded ? 10 : 0, backgroundColor: "rgba(99, 179, 237, 0.1)" }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setActiveLayer(layer.id)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 text-sm rounded-2xl transition-all text-left font-black uppercase tracking-widest group relative overflow-hidden",
                  isActive 
                    ? "neu-pressed neu-accent border-2 border-indigo-500/30 shadow-inner" 
                    : "neu-flat neu-text hover:neu-accent",
                  !isExpanded && "justify-center"
                )}
                title={!isExpanded ? t(layer.label) : undefined}
              >
                {isActive && (
                  <motion.div 
                    layoutId="active-pill"
                    className="absolute left-0 w-1 h-6 bg-indigo-500 rounded-r-full"
                  />
                )}
                <Icon className={cn("w-5 h-5 shrink-0 transition-transform group-hover:rotate-12", isActive ? "neu-accent" : "neu-accent")} />
                {isExpanded && <span className="truncate">{t(layer.label)}</span>}
                {!isExpanded && (
                  <div className="absolute left-full ml-4 px-3 py-2 bg-black/80 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
                    {t(layer.label)}
                  </div>
                )}
              </motion.button>
            );
          })}
        </nav>

        <div className={cn("px-5 mb-3 text-[10px] font-bold neu-text-muted uppercase tracking-widest transition-all", isExpanded ? "opacity-100" : "opacity-0 h-0 mb-0 overflow-hidden")}>
          Management
        </div>
        <nav className="space-y-2 px-3">
          {layers.filter(l => l.id !== "dashboard").map((layer, idx) => {
            const Icon = layer.icon;
            const isActive = activeLayer === layer.id;
            return (
              <motion.button
                key={layer.id}
                whileHover={{ scale: 1.02, x: isExpanded ? 5 : 0 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => setActiveLayer(layer.id)}
                className={cn(
                  "w-full flex items-center gap-3 p-3 text-sm rounded-xl transition-all text-left font-medium group relative",
                  isActive 
                    ? "neu-pressed neu-accent" 
                    : "neu-flat neu-text-muted hover:neu-text",
                  !isExpanded && "justify-center"
                )}
                title={!isExpanded ? t(layer.label) : undefined}
              >
                <Icon className={cn("w-5 h-5 shrink-0", isActive ? "neu-accent" : "neu-text-muted")} />
                {isExpanded && <span className="truncate hover-underline">{t(layer.label)}</span>}
                {!isExpanded && (
                  <div className="absolute left-full ml-4 px-3 py-2 bg-black/80 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
                    {t(layer.label)}
                  </div>
                )}
              </motion.button>
            );
          })}
        </nav>
      </div>
      
      <div className="p-4 mt-auto">
        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={toggleLanguage}
          className={cn(
            "w-full flex items-center p-3 mb-3 neu-flat rounded-xl text-sm font-medium transition-all active:neu-pressed group relative",
            isExpanded ? "justify-between" : "justify-center"
          )}
        >
          <div className="flex items-center gap-3">
            <Languages className="w-5 h-5 shrink-0 neu-accent" />
            {isExpanded && <span>{t('Language')}</span>}
          </div>
          {isExpanded && <span className="capitalize text-xs neu-text-muted">{i18n.language === 'en' ? 'English' : 'ਪੰਜਾਬੀ'}</span>}
          {!isExpanded && (
            <div className="absolute left-full ml-4 px-3 py-2 bg-black/80 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
              {t('Language')}
            </div>
          )}
        </motion.button>

        {showThemes && isExpanded && (
          <motion.div 
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-4 space-y-4"
          >
            <div className="p-3 neu-pressed rounded-2xl grid grid-cols-4 gap-3">
              {themes.map(t => (
                <motion.button
                  key={t.id}
                  whileHover={{ scale: 1.2 }}
                  whileTap={{ scale: 0.9 }}
                  onClick={() => setTheme(t.id)}
                  className={cn(
                    "w-6 h-6 rounded-full",
                    theme === t.id ? "ring-2 ring-offset-2 ring-[var(--accent)] ring-offset-[var(--bg-color)]" : ""
                  )}
                  style={{ backgroundColor: t.color, boxShadow: "2px 2px 4px rgba(0,0,0,0.2)" }}
                  title={t.name}
                />
              ))}
            </div>

            <div className="p-1 neu-pressed rounded-2xl flex gap-1">
              <button
                onClick={() => setUiStyle("neumorphism")}
                className={cn(
                  "flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all",
                  uiStyle === "neumorphism" ? "neu-flat text-[var(--accent)] shadow-md" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                )}
              >
                Neumorphism
              </button>
              <button
                onClick={() => setUiStyle("glassmorphism")}
                className={cn(
                  "flex-1 py-1.5 px-3 rounded-xl text-xs font-bold transition-all",
                  uiStyle === "glassmorphism" ? "neu-flat text-[var(--accent)] shadow-md" : "text-[var(--text-muted)] hover:text-[var(--text-main)]"
                )}
              >
                Glass Flow
              </button>
            </div>
          </motion.div>
        )}
        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => {
            if (!isExpanded) setIsExpanded(true);
            setShowThemes(!showThemes);
          }}
          className={cn(
            "w-full flex items-center p-3 neu-flat rounded-xl text-sm font-medium transition-all active:neu-pressed group relative",
            isExpanded ? "justify-between" : "justify-center"
          )}
        >
          <div className="flex items-center gap-3">
            <Palette className="w-5 h-5 shrink-0 neu-accent" />
            {isExpanded && <span>Theme</span>}
          </div>
          {isExpanded && <span className="capitalize text-xs neu-text-muted">{theme}</span>}
          {!isExpanded && (
            <div className="absolute left-full ml-4 px-3 py-2 bg-black/80 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
              Theme: {theme}
            </div>
          )}
        </motion.button>

        <motion.button 
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => setActiveLayer("settings")}
          className={cn(
            "w-full flex items-center gap-3 p-3 mt-3 neu-flat rounded-xl text-sm font-medium transition-all active:neu-pressed group relative",
            activeLayer === "settings" ? "neu-pressed neu-accent" : "",
            !isExpanded && "justify-center"
          )}
        >
          <Settings className={cn("w-5 h-5 shrink-0", activeLayer === "settings" ? "neu-accent" : "neu-text-muted")} />
          {isExpanded && <span>{t('Settings')}</span>}
          {!isExpanded && (
            <div className="absolute left-full ml-4 px-3 py-2 bg-black/80 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
              {t('Settings')}
            </div>
          )}
        </motion.button>

        {isInstallable && (
          <motion.button 
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={promptInstall}
            className={cn(
              "w-full flex items-center gap-3 p-3 mt-3 bg-blue-600 text-white rounded-xl text-sm font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition-colors group relative",
              !isExpanded && "justify-center"
            )}
          >
            <Download className="w-5 h-5 shrink-0" />
            {isExpanded && <span>Install Desktop App</span>}
            {!isExpanded && (
              <div className="absolute left-full ml-4 px-3 py-2 bg-black/80 text-white text-xs rounded-lg opacity-0 group-hover:opacity-100 pointer-events-none whitespace-nowrap z-50 transition-opacity">
                Install Desktop App
              </div>
            )}
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}

