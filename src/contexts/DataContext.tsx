import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { auth } from '../firebase';
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

interface DataContextType {
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
    const unsubAuth = auth.onAuthStateChanged((user) => {
      if (user) {
        // Initializing consolidated subscriptions
        const unsubCustomers = subscribeToCustomers(setCustomers);
        const unsubSettings = subscribeToSettings(setSettings);
        const unsubTransactions = subscribeToTransactions(setTransactions);
        const unsubComplaints = subscribeToComplaints(setComplaints);
        const unsubReports = subscribeToReports(setReports);
        const unsubMessages = subscribeToWhatsappMessages(setMessages);
        const unsubErrors = subscribeToAutomationErrors(setAutomationErrors);
        const unsubReceipts = subscribeToPendingReceipts(setPendingReceipts);

        setIsLoading(false);

        return () => {
          unsubCustomers();
          unsubSettings();
          unsubTransactions();
          unsubComplaints();
          unsubReports();
          unsubMessages();
          unsubErrors();
          unsubReceipts();
        };
      } else {
        // Clear data on logout
        setCustomers([]);
        setSettings(null);
        setTransactions([]);
        setComplaints([]);
        setReports([]);
        setMessages([]);
        setAutomationErrors([]);
        setPendingReceipts([]);
        setIsLoading(false);
      }
    });

    return () => unsubAuth();
  }, []);

  return (
    <DataContext.Provider value={{
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
  if (context === undefined) {
    throw new Error('useData must be used within a DataProvider');
  }
  return context;
};
