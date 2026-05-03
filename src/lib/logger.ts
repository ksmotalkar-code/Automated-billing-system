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

const addLog = (level: 'info' | 'warn' | 'error', ...args: any[]) => {
  const message = args.map(a => 
    typeof a === 'object' ? (a instanceof Error ? a.stack || a.message : JSON.stringify(a)) : String(a)
  ).join(' ');
  logs.push({ timestamp: Date.now(), level, message });
  if (logs.length > MAX_LOGS) {
    logs = logs.slice(logs.length - MAX_LOGS);
  }
  saveLogs();
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
