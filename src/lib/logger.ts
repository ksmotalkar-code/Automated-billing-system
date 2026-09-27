export interface LogEntry {
  timestamp: number;
  level: 'info' | 'warn' | 'error';
  message: string;
}

const MAX_LOGS = 500;
let logs: LogEntry[] = [];

try {
  const stored = localStorage.getItem('app_logs');
  if (stored) {
    logs = JSON.parse(stored);
  }
} catch (e) {}

const saveLogs = () => {
  try {
    localStorage.setItem('app_logs', JSON.stringify(logs));
  } catch (e) {}
};

const safeStringify = (arg: any): string => {
  if (arg === null || arg === undefined) return String(arg);
  if (typeof arg !== 'object') return String(arg);
  if (arg instanceof Error) return arg.stack || arg.message;
  try {
    return JSON.stringify(arg, (key, value) => {
      if (typeof value === 'object' && value !== null) {
        if (typeof window !== 'undefined' && (value instanceof HTMLElement || value instanceof Window)) {
          return '[DOM Object]';
        }
      }
      return value;
    });
  } catch (e) {
    return String(arg);
  }
};

const addLog = (level: 'info' | 'warn' | 'error', ...args: any[]) => {
  try {
    const message = args.map(a => safeStringify(a)).join(' ');
    logs.push({ timestamp: Date.now(), level, message });
    if (logs.length > MAX_LOGS) {
      logs = logs.slice(logs.length - MAX_LOGS);
    }
    saveLogs();
  } catch (e) {
    // Prevent logger error from breaking console calls
  }
};

const originalLog = console.log;
const originalWarn = console.warn;
const originalError = console.error;

export const initLogger = () => {
  console.log = (...args) => {
    originalLog(...args);
    addLog('info', ...args);
  };
  console.warn = (...args) => {
    originalWarn(...args);
    addLog('warn', ...args);
  };
  console.error = (...args) => {
    originalError(...args);
    addLog('error', ...args);
  };
};

export const getLogs = () => logs;

export const clearLogs = () => {
  logs = [];
  saveLogs();
};

