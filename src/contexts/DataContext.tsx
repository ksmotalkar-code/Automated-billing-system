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
  subscribeToPendingReceipts,
  getSettings,
  getCustomers,
  getTransactions,
  getComplaints,
  getReports,
  getWhatsappMessages,
  getAutomationErrors,
  getPendingReceipts
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
  quotaExceeded: boolean;
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
  const [quotaExceeded, setQuotaExceeded] = useState(false);

  useEffect(() => {
    // Check for quota error flag on mount
    const checkQuota = () => {
        if (localStorage.getItem('quota_error') === 'true') {
            setQuotaExceeded(true);
        }
    };
    checkQuota();
    const interval = setInterval(checkQuota, 5000); // Poll for changes
    return () => clearInterval(interval);
  }, []);

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
      setIsLoading(true);

      // Warm initial state from cached/fast read
      getSettings(activeUid).then((freshSettings) => {
        if (freshSettings) setSettings(freshSettings);
      });
      getCustomers(activeUid).then(setCustomers);
      getTransactions(activeUid).then(setTransactions);
      getComplaints(activeUid).then(setComplaints);
      getReports(activeUid).then(setReports);
      getWhatsappMessages(activeUid).then(setMessages);
      getAutomationErrors(activeUid).then(setAutomationErrors);
      getPendingReceipts(activeUid).then(setPendingReceipts);

      // Register live realtime subscriptions so ALL modifications, imports, and updates appear immediately
      unsubs.push(subscribeToSettings(activeUid, (freshSettings) => {
        if (freshSettings) {
          setSettings(freshSettings);
          import('../services/whatsappService').then(({ whatsappService }) => {
            whatsappService.updateConfig(
              freshSettings.metaWhatsAppApiKey || null,
              freshSettings.metaWhatsAppPhoneNumberId || null,
              freshSettings.watiAccessToken || null,
              freshSettings.watiApiEndpoint || null,
              freshSettings.preferredNotificationMethod || null
            );
          });
        }
      }));

      unsubs.push(subscribeToCustomers(activeUid, setCustomers));
      unsubs.push(subscribeToTransactions(activeUid, setTransactions));
      unsubs.push(subscribeToComplaints(activeUid, setComplaints));
      unsubs.push(subscribeToReports(activeUid, setReports));
      unsubs.push(subscribeToWhatsappMessages(activeUid, setMessages));
      unsubs.push(subscribeToAutomationErrors(activeUid, setAutomationErrors));
      unsubs.push(subscribeToPendingReceipts(activeUid, setPendingReceipts));

      // Immediate safety fallback for settings to prevent loading stall
      const settingsFallbackTimer = setTimeout(() => {
        setSettings((prev) => prev || {
          upiQrCodeImage: null,
          billTemplateImage: null,
          billingAmount: 200,
          billingCycleMonths: 2,
          penaltyAmount: 40,
          penaltyDays: 10,
          escalationDays: 60,
          autoSuspend: false,
          defaultBillingDate: '1',
          metaWhatsAppApiKey: '',
          metaWhatsAppPhoneNumberId: '',
          watiAccessToken: '',
          watiApiEndpoint: '',
          organizationName: 'Gram Panchayat GP. Jhanda Khurd',
          automation: {
            billingLifecycle: true,
            ruleBased: true,
            lateFee: true,
            scheduledBilling: true,
            bulkProcessing: true,
            smartNotifications: true
          },
          ownerId: activeUid
        });
        setIsLoading(false);
      }, 300);

      unsubs.push(() => clearTimeout(settingsFallbackTimer));

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
      isLoading,
      quotaExceeded
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
