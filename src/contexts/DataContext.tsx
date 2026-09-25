import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useTenant } from './TenantContext';
import { 
  Customer, 
  AppSettings, 
  Transaction, 
  Complaint, 
  Report, 
  WhatsappMessage, 
  AutomationError,
  subscribeToCustomers,
  subscribeToSettings,
  subscribeToTransactions,
  subscribeToComplaints,
  subscribeToReports,
  subscribeToWhatsappMessages,
  subscribeToAutomationErrors,
  subscribeToPendingReceipts
} from '../lib/db';

export interface DataContextType {
  currentOwnerId: string | null;
  tenantId: string | null;
  customers: Customer[];
  settings: AppSettings | null;
  transactions: Transaction[];
  complaints: Complaint[];
  reports: Report[];
  messages: WhatsappMessage[];
  automationErrors: AutomationError[];
  pendingReceipts: any[];
  isLoading: boolean;
}

const DataContext = createContext<DataContextType | undefined>(undefined);

export const DataProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const { currentOwnerId, tenantId, currentUser } = useTenant();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [complaints, setComplaints] = useState<Complaint[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [messages, setMessages] = useState<WhatsappMessage[]>([]);
  const [automationErrors, setAutomationErrors] = useState<AutomationError[]>([]);
  const [pendingReceipts, setPendingReceipts] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    let unsubs: (() => void)[] = [];

    const clearSubscriptions = () => {
      unsubs.forEach(unsub => {
        try { unsub(); } catch (e) { /* ignore */ }
      });
      unsubs = [];
    };

    // Strict Zero-Trust purge: clear all state from memory whenever tenant changes or logs out
    clearSubscriptions();
    setCustomers([]);
    setTransactions([]);
    setComplaints([]);
    setReports([]);
    setMessages([]);
    setAutomationErrors([]);
    setPendingReceipts([]);
    setSettings(null);

    if (currentOwnerId) {
      const activeUid = currentOwnerId;

      // Attach scoped subscriptions with identity verification guards explicitly passing activeUid
      unsubs.push(subscribeToCustomers(activeUid, (custs) => {
        setCustomers(custs);
      }));

      unsubs.push(subscribeToSettings(activeUid, (freshSettings) => {
        if (freshSettings) {
          setSettings(freshSettings);
        }
      }));

      unsubs.push(subscribeToTransactions(activeUid, (txns) => {
        setTransactions(txns);
      }));

      unsubs.push(subscribeToComplaints(activeUid, (comps) => {
        setComplaints(comps);
      }));

      unsubs.push(subscribeToReports(activeUid, (reps) => {
        setReports(reps);
      }));

      unsubs.push(subscribeToWhatsappMessages(activeUid, (msgs) => {
        setMessages(msgs);
      }));

      unsubs.push(subscribeToAutomationErrors(activeUid, (errs) => {
        setAutomationErrors(errs);
      }));

      unsubs.push(subscribeToPendingReceipts(activeUid, (rcpts) => {
        setPendingReceipts(rcpts);
      }));

      setIsLoading(false);
    } else {
      setIsLoading(false);
    }

    return () => {
      clearSubscriptions();
    };
  }, [currentOwnerId]);

  return (
    <DataContext.Provider value={{
      currentOwnerId,
      tenantId,
      customers,
      settings,
      transactions,
      complaints,
      reports,
      messages,
      automationErrors,
      pendingReceipts,
      isLoading
    }}>
      {children}
    </DataContext.Provider>
  );
};

export const useData = () => {
  const context = useContext(DataContext);
  if (!context) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};
