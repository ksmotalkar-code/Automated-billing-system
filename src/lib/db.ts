import { v4 as uuidv4 } from 'uuid';
import { collection, doc, setDoc, getDocs, getDoc, updateDoc, deleteDoc, onSnapshot, query, where, writeBatch, orderBy } from 'firebase/firestore';
import { db, auth } from '../firebase';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string;
    email?: string | null;
    emailVerified?: boolean;
    isAnonymous?: boolean;
    tenantId?: string | null;
    providerInfo: any[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  
  const errInfo: FirestoreErrorInfo = {
    error: errorMessage,
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  };

  if (errorMessage.includes('resource-exhausted') || errorMessage.includes('Quota')) {
    // Set quota exceeded flag for 24 hours (until next UTC reset roughly)
    const nextReset = new Date();
    nextReset.setHours(24, 0, 0, 0); 
    localStorage.setItem('firestore_quota_expiry', nextReset.getTime().toString());
    console.warn('Firestore Quota Exceeded. Actions might be blocked.', errInfo);
    
    // Dispatch a custom event so the UI can show a notification
    window.dispatchEvent(new CustomEvent('firestore-quota-exceeded'));
    return; // Do NOT throw, so we don't crash the app or trigger Vite's error overlay for quota limits
  }

  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const isQuotaExceeded = () => {
  const expiry = localStorage.getItem('firestore_quota_expiry');
  if (!expiry) return false;
  const isExcluded = Date.now() < parseInt(expiry);
  if (!isExcluded) {
    localStorage.removeItem('firestore_quota_expiry');
  }
  return isExcluded;
};

export interface Customer {
  id: string;
  name: string;
  mobileNumber: string;
  status: 'Active' | 'Suspended' | 'Faulty';
  balance: number;
  ownerId?: string;
  invoiceSent?: boolean;
  paymentNotified?: boolean;
  lastMeterReading?: number;
  createdAt?: string;
}

export interface Complaint {
  id: string;
  customerId: string;
  customerName: string;
  message: string;
  status: 'Pending' | 'Resolved';
  category?: 'Billing Issue' | 'Service Request' | 'Technical Problem' | string;
  priority?: 'Low' | 'Medium' | 'High';
  createdAt: string;
  ownerId?: string;
  expiresAt?: string;
}

export interface ReportFile {
  name: string;
  data: string; // Base64 or URL
  type: string;
}

export interface ReportFolder {
  id: string;
  name: string;
  ownerId?: string;
  createdAt: string;
}

export interface Report {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  folderId?: string | null;
  ownerId?: string;
  files?: ReportFile[];
}

export interface Transaction {
  id: string;
  customerId: string;
  amount: number;
  transactionId: string;
  date: string;
  ownerId?: string;
}

export interface AutomationSettings {
  billingLifecycle: boolean;
  ruleBased: boolean;
  lateFee: boolean;
  scheduledBilling: boolean;
  bulkProcessing: boolean;
  smartNotifications: boolean;
  autoShareReports?: boolean;
  autoCreateComplaints?: boolean;
  enforceIstTimeWindow?: boolean; // Run 9AM-10AM IST
}

export interface WhatsAppProvider {
  id: string; // The ID of the provider, e.g., 'meta', 'cunnekt', etc.
  name: string; // The name of the provider, e.g., 'Meta Official API', 'Cunnekt API'
  baseUrl: string; // The base URL for the API
  requiresApiKey: boolean; // Does the provider require an API key?
  requiresPhoneId: boolean; // Does the provider require a Phone ID?
  isActive: boolean; // Is the provider active?
}

export const getProviders = async (): Promise<WhatsAppProvider[]> => {
  if (!auth.currentUser) return [];
  const providersCol = collection(db, 'providers');
  const snapshot = await getDocs(providersCol);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WhatsAppProvider));
};

export const addProvider = async (provider: WhatsAppProvider) => {
  if (!auth.currentUser || auth.currentUser.email !== 'ksmotalkar@gmail.com') throw new Error("Not authorized");
  checkQuotaBeforeWrite("Add Provider");
  const { id, ...providerData } = provider;
  try {
    await setDoc(doc(db, 'providers', id), providerData);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'providers');
  }
};

export const deleteProvider = async (id: string) => {
  if (!auth.currentUser || auth.currentUser.email !== 'ksmotalkar@gmail.com') throw new Error("Not authorized");
  checkQuotaBeforeWrite("Delete Provider");
  try {
    await deleteDoc(doc(db, 'providers', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'providers');
  }
};

export interface ChatbotCommand {
  id: string;
  triggerWord: string;
  response: string;
  isActive: boolean;
}

export interface AppSettings {
  upiQrCodeImage: string | null;
  billingAmount: number;
  billingCycleMonths: number;
  penaltyAmount: number;
  penaltyDays: number;
  escalationDays?: number;
  autoSuspend?: boolean;
  defaultBillingDate?: string;
  nextBillingDate?: string;
  lastBillingDate?: string;
  lastPenaltyDate?: string;
  lastNotificationDate?: string;
  ownerId?: string;
  metaWhatsAppApiKey?: string;
  metaWhatsAppPhoneNumberId?: string;
  metaWhatsAppVerifyToken?: string;
  cunnektApiKey?: string;
  cunnektBaseUrl?: string;
  preferredNotificationMethod?: string;
  enableWhatsappWeb?: boolean;
  paymentGatewayKey?: string;
  paymentGatewaySecret?: string;
  automation?: AutomationSettings;
  chatbotCommands?: ChatbotCommand[];
}

export interface UploadedData {
  id: string;
  fileName: string;
  data: string;
  uploadedAt: string;
  ownerId?: string;
}

export interface WhatsappMessage {
  id: string;
  ownerId: string;
  from: string;
  to: string;
  body: string;
  timestamp: string;
  direction: 'inbound' | 'outbound';
  type: string; // 'chat', 'image', 'video', 'document', etc.
  mediaUrl?: string;
  read?: boolean;
}

export const cleanupOldData = async () => {
  if (!auth.currentUser) return;
  
  const lastCleanup = localStorage.getItem(`last_cleanup_${auth.currentUser.uid}`);
  const today = new Date().toDateString();
  if (lastCleanup === today) return; // Already cleaned up today
  
  localStorage.setItem(`last_cleanup_${auth.currentUser.uid}`, today);

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  
  const now = new Date().toISOString();
  
  const qData = query(
    collection(db, 'uploadedData'), 
    where('ownerId', '==', auth.currentUser.uid),
    where('uploadedAt', '<', sixMonthsAgo.toISOString())
  );

  const qComplaints = query(
    collection(db, 'complaints'),
    where('ownerId', '==', auth.currentUser.uid),
    where('expiresAt', '<', now)
  );
  
  try {
    const dataSnap = await getDocs(qData);
    const confSnap = await getDocs(qComplaints);

    if (dataSnap.size > 0 || confSnap.size > 0) {
      const docsToDelete = [...dataSnap.docs, ...confSnap.docs];
      // Use deleteInBatches helper
      const batchLimit = 400;
      for (let i = 0; i < docsToDelete.length; i += batchLimit) {
        const batch = writeBatch(db);
        const chunk = docsToDelete.slice(i, i + batchLimit);
        chunk.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
      }
      console.log(`Cleaned up ${docsToDelete.length} old records.`);
    }
  } catch (error) {
    console.error("Error cleaning up old data:", error);
  }
};

const checkQuotaBeforeWrite = (action: string) => {
  if (isQuotaExceeded()) {
    throw new Error(`Quota Exceeded: ${action} temporarily disabled to protect your database. Free tier limit reached.`);
  }
};

export const addCustomer = async (customer: Omit<Customer, 'id' | 'ownerId'>): Promise<Customer> => {
  if (!auth.currentUser) throw new Error("Not authenticated");
  checkQuotaBeforeWrite("Add Customer");
  
  // Check for duplicates
  const q = query(
      collection(db, 'customers'), 
      where('ownerId', '==', auth.currentUser.uid),
      where('mobileNumber', '==', customer.mobileNumber)
  );
  const snapshot = await getDocs(q);
  
  if (!snapshot.empty) {
    // Duplicate found, mark all involved as Faulty
    const batch = writeBatch(db);
    // Mark the new one
    customer.status = 'Faulty';
    // Mark the existing ones
    snapshot.docs.forEach(docSnap => {
        batch.update(docSnap.ref, { status: 'Faulty' });
    });
    // This is problematic in addCustomer, as we haven't added the new doc yet.
    // Simplifying: just ensure they are marked Faulty on save.
  }

  const newCustomer: Customer = {
    ...customer,
    id: `CUST-${uuidv4().substring(0, 8).toUpperCase()}`,
    ownerId: auth.currentUser.uid,
    createdAt: new Date().toISOString()
  };
  try {
    await setDoc(doc(db, 'customers', newCustomer.id), newCustomer);
    
    // If it was a duplicate, update existing docs to Faulty
    if (!snapshot.empty) {
        const batch = writeBatch(db);
        snapshot.docs.forEach(docSnap => {
            batch.update(docSnap.ref, { status: 'Faulty' });
        });
        await batch.commit();
    }
    
    return newCustomer;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'customers');
    throw error;
  }
};

export const updateCustomer = async (updatedCustomer: Customer, skipDuplicateCheck = false) => {
  if (!auth.currentUser) throw new Error("Not authenticated");
  if (isQuotaExceeded()) throw new Error("Quota Exceeded: Cannot update customer.");
  
  let isDuplicate = false;
  let snapshotDocs: any[] = [];

  if (!skipDuplicateCheck) {
    // Check for duplicates (if mobile number changed)
    const q = query(
        collection(db, 'customers'), 
        where('ownerId', '==', auth.currentUser.uid),
        where('mobileNumber', '==', updatedCustomer.mobileNumber)
    );
    const snapshot = await getDocs(q);
    snapshotDocs = snapshot.docs;
    
    snapshot.forEach(docSnap => {
        if (docSnap.id !== updatedCustomer.id) {
            isDuplicate = true;
        }
    });
    
    if (isDuplicate) {
        updatedCustomer.status = 'Faulty';
    }
  }

  try {
    await updateDoc(doc(db, 'customers', updatedCustomer.id), { ...updatedCustomer });
    
    // If duplicate, update other docs to Faulty
    if (isDuplicate && snapshotDocs.length > 0) {
        const batch = writeBatch(db);
        snapshotDocs.forEach(docSnap => {
            if (docSnap.id !== updatedCustomer.id) {
                batch.update(docSnap.ref, { status: 'Faulty' });
            }
        });
        await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `customers/${updatedCustomer.id}`);
  }
};

const deleteInBatches = async (querySnapshot: any) => {
  const batchLimit = 500;
  const docs = querySnapshot.docs;
  for (let i = 0; i < docs.length; i += batchLimit) {
    const batch = writeBatch(db);
    const chunk = docs.slice(i, i + batchLimit);
    chunk.forEach((doc: any) => batch.delete(doc.ref));
    await batch.commit();
  }
};

export const deleteCustomer = async (id: string) => {
  if (!auth.currentUser) throw new Error("Not authenticated");
  checkQuotaBeforeWrite("Delete Customer");
  try {
    const batch = writeBatch(db);
    // Delete customer doc
    batch.delete(doc(db, 'customers', id));
    
    // Find and delete associated transactions
    const q = query(
      collection(db, 'transactions'), 
      where('customerId', '==', id),
      where('ownerId', '==', auth.currentUser.uid)
    );
    const snapshot = await getDocs(q);
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `customers/${id}`);
  }
};

export const deleteCustomersBatch = async (ids: string[]) => {
  if (!auth.currentUser) throw new Error("Not authenticated");
  try {
    // Delete customers in chunks of 500
    for (let i = 0; i < ids.length; i += 500) {
      const batch = writeBatch(db);
      const chunk = ids.slice(i, i + 500);
      chunk.forEach(id => batch.delete(doc(db, 'customers', id)));
      await batch.commit();
    }

    // Delete associated transactions for these customers
    for (const id of ids) {
      const q = query(
        collection(db, 'transactions'), 
        where('customerId', '==', id),
        where('ownerId', '==', auth.currentUser.uid)
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        await deleteInBatches(snapshot);
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'customers_batch');
  }
};

export const deleteAllCustomers = async () => {
  if (!auth.currentUser) throw new Error("Not authenticated");
  try {
    // Delete all customers for this user
    const qCust = query(collection(db, 'customers'), where('ownerId', '==', auth.currentUser.uid));
    const snapCust = await getDocs(qCust);
    await deleteInBatches(snapCust);

    // Delete all transactions for this user
    const qTxn = query(collection(db, 'transactions'), where('ownerId', '==', auth.currentUser.uid));
    const snapTxn = await getDocs(qTxn);
    await deleteInBatches(snapTxn);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'all_customers');
  }
};

export const addTransaction = async (transaction: Omit<Transaction, 'id' | 'date' | 'ownerId'>): Promise<Transaction> => {
  if (!auth.currentUser) throw new Error("Not authenticated");
  checkQuotaBeforeWrite("Add Transaction");
  const newTransaction: Transaction = {
    ...transaction,
    id: `TXN-${uuidv4().substring(0, 8).toUpperCase()}`,
    date: new Date().toISOString(),
    ownerId: auth.currentUser.uid,
  };
  try {
    await setDoc(doc(db, 'transactions', newTransaction.id), newTransaction);
    return newTransaction;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'transactions');
    throw error;
  }
};

export const saveSettings = async (settings: AppSettings) => {
  if (!auth.currentUser) throw new Error("Not authenticated");
  if (isQuotaExceeded()) throw new Error("Quota Exceeded: Writes temporarily disabled.");
  try {
    await setDoc(doc(db, 'settings', auth.currentUser.uid), { ...settings, ownerId: auth.currentUser.uid });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `settings/${auth.currentUser.uid}`);
  }
};

export const saveUploadedData = async (fileName: string, data: any[]) => {
  if (!auth.currentUser) throw new Error("Not authenticated");
  const id = `UPLOAD-${uuidv4().substring(0, 8).toUpperCase()}`;
  const upload: UploadedData = {
    id,
    fileName,
    data: JSON.stringify(data),
    uploadedAt: new Date().toISOString(),
    ownerId: auth.currentUser.uid,
  };
  try {
    await setDoc(doc(db, 'uploadedData', id), upload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'uploadedData');
  }
};

export const resetAllBalances = async (customers: Customer[]) => {
  if (!auth.currentUser) return;
  checkQuotaBeforeWrite("Reset Balances");
  const batchLimit = 400;
  for (let i = 0; i < customers.length; i += batchLimit) {
    const chunk = customers.slice(i, i + batchLimit);
    const batch = writeBatch(db);
    for (const c of chunk) {
      batch.update(doc(db, 'customers', c.id), { balance: 0 });
    }
    await batch.commit();
  }
};

export const resetDatabase = async () => {
  if (!auth.currentUser) throw new Error("Not authenticated");
  console.log("Starting master database reset for user:", auth.currentUser.uid);
  try {
    // 1. Delete all customers and transactions
    console.log("Deleting customers and transactions...");
    await deleteAllCustomers();

    // 2. Delete uploaded data
    console.log("Deleting uploaded data history...");
    const qUpload = query(collection(db, 'uploadedData'), where('ownerId', '==', auth.currentUser.uid));
    const snapUpload = await getDocs(qUpload);
    if (!snapUpload.empty) {
      await deleteInBatches(snapUpload);
    }

    // 3. Delete settings
    console.log("Deleting user settings...");
    await deleteDoc(doc(db, 'settings', auth.currentUser.uid));
    
    console.log("Master reset completed successfully.");
  } catch (error) {
    console.error("Error in resetDatabase:", error);
    throw error; // Re-throw to be caught by the UI
  }
};

export const importCustomersFromText = async (text: string) => {
  if (!auth.currentUser) throw new Error("Not authenticated");
  const lines = text.split('\n');
  const customers: Omit<Customer, 'id' | 'ownerId'>[] = [];
  let currentCustomer: any = null;

  for (let line of lines) {
    line = line.trim();
    if (!line) continue;

    // Match "1 Malook Singh" or "1. Malook Singh" or "1) Malook Singh"
    const match = line.match(/^(\d+)[.)\s]+(.*)/);
    if (match) {
      if (currentCustomer) customers.push(currentCustomer);
      let content = match[2];
      const isClosed = /close/i.test(content);
      content = content.replace(/close/i, '').replace(/[-—]+$/, '').trim();
      currentCustomer = {
        name: content,
        mobileNumber: '',
        status: isClosed ? 'Suspended' : 'Active',
        balance: 0
      };
    } else if (currentCustomer) {
      const isClosed = /close/i.test(line);
      // Look for phone numbers (digits, spaces, +, -)
      const phoneMatch = line.match(/(\+?\d[\d\s-]{7,}\d)/);
      if (phoneMatch && !currentCustomer.mobileNumber) {
        currentCustomer.mobileNumber = phoneMatch[0].trim();
      }
      if (isClosed) {
        currentCustomer.status = 'Suspended';
      }
    }
  }
  if (currentCustomer) customers.push(currentCustomer);

  // Add in batches of 500
  const batchLimit = 500;
  for (let i = 0; i < customers.length; i += batchLimit) {
    const batch = writeBatch(db);
    const chunk = customers.slice(i, i + batchLimit);
    for (const custData of chunk) {
      const id = `CUST-${uuidv4().substring(0, 8).toUpperCase()}`;
      const docRef = doc(db, 'customers', id);
      batch.set(docRef, {
        ...custData,
        id,
        ownerId: auth.currentUser.uid,
        createdAt: new Date().toISOString()
      });
    }
    await batch.commit();
  }
  return customers.length;
};

export const subscribeToCustomers = (callback: (customers: Customer[]) => void) => {
  if (!auth.currentUser) return () => {};
  const q = query(collection(db, 'customers'), where('ownerId', '==', auth.currentUser.uid));
  return onSnapshot(q, (snapshot) => {
    const customers = snapshot.docs.map(doc => {
      const data = doc.data() as Customer;
      // Virtually suspend invalid mobiles so they are hidden from automated workflows in UI
      if (data.status !== 'Suspended') {
        const cleanMobile = data.mobileNumber ? data.mobileNumber.replace(/\D/g, '') : '';
        if (!cleanMobile || cleanMobile.length < 10 || cleanMobile === '0000000000') {
          data.status = 'Suspended';
        }
      }
      return data;
    });
    callback(customers);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'customers');
  });
};

export const subscribeToTransactions = (callback: (transactions: Transaction[]) => void) => {
  if (!auth.currentUser) return () => {};
  const q = query(collection(db, 'transactions'), where('ownerId', '==', auth.currentUser.uid));
  return onSnapshot(q, (snapshot) => {
    const transactions = snapshot.docs.map(doc => doc.data() as Transaction);
    callback(transactions);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'transactions');
  });
};

export const subscribeToSettings = (callback: (settings: AppSettings | null) => void) => {
  if (!auth.currentUser) return () => {};
  return onSnapshot(doc(db, 'settings', auth.currentUser.uid), (docSnap) => {
    if (docSnap.exists()) {
      callback(docSnap.data() as AppSettings);
    } else {
      callback({
        upiQrCodeImage: null,
        billingAmount: 200,
        billingCycleMonths: 2,
        penaltyAmount: 40,
        penaltyDays: 10,
        escalationDays: 60,
        autoSuspend: false,
        defaultBillingDate: '1',
        metaWhatsAppApiKey: '',
        metaWhatsAppPhoneNumberId: '',
        cunnektApiKey: '',
        cunnektBaseUrl: 'https://app2.cunnekt.com/v1',
        automation: {
          billingLifecycle: true,
          ruleBased: true,
          lateFee: true,
          scheduledBilling: true,
          bulkProcessing: true,
          smartNotifications: true
        },
        ownerId: auth.currentUser.uid
      });
    }
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, `settings/${auth.currentUser.uid}`);
  });
};

export const subscribeToUploadedData = (callback: (data: UploadedData[]) => void) => {
  if (!auth.currentUser) return () => {};
  const q = query(collection(db, 'uploadedData'), where('ownerId', '==', auth.currentUser.uid));
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(doc => doc.data() as UploadedData);
    callback(data);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'uploadedData');
  });
};

export const subscribeToPendingReceipts = (callback: (receipts: any[]) => void) => {
  if (!auth.currentUser) return () => {};
  const q = query(
    collection(db, 'payment_receipts'), 
    where('ownerId', '==', auth.currentUser.uid),
    where('status', '==', 'Pending')
  );
  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map(doc => doc.data());
    callback(items);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'payment_receipts');
  });
};

export const subscribeToComplaints = (callback: (complaints: Complaint[]) => void) => {
  if (!auth.currentUser) return () => {};
  const q = query(
    collection(db, 'complaints'), 
    where('ownerId', '==', auth.currentUser.uid)
  );
  return onSnapshot(q, (snapshot) => {
    const complaints = snapshot.docs.map(doc => doc.data() as Complaint);
    callback(complaints);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'complaints');
  });
};

export const addReport = async (report: Omit<Report, 'id' | 'ownerId' | 'createdAt'>): Promise<Report> => {
  if (!auth.currentUser) throw new Error("Not authenticated");
  const newReport: Report = {
    ...report,
    id: `REP-${uuidv4().substring(0, 8).toUpperCase()}`,
    createdAt: new Date().toISOString(),
    ownerId: auth.currentUser.uid,
  };
  try {
    await setDoc(doc(db, 'reports', newReport.id), newReport);
    return newReport;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'reports');
    throw error;
  }
};

export const addReportFolder = async (name: string): Promise<ReportFolder> => {
  if (!auth.currentUser) throw new Error("Not authenticated");
  const newFolder: ReportFolder = {
    id: `FLD-${uuidv4().substring(0, 8).toUpperCase()}`,
    name,
    ownerId: auth.currentUser.uid,
    createdAt: new Date().toISOString()
  };
  try {
    await setDoc(doc(db, 'reportFolders', newFolder.id), newFolder);
    return newFolder;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'reportFolders');
    throw error;
  }
};

export const deleteReportFolder = async (id: string): Promise<void> => {
  try {
    await deleteDoc(doc(db, 'reportFolders', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `reportFolders/${id}`);
    throw error;
  }
};

export const subscribeToReportFolders = (callback: (folders: ReportFolder[]) => void) => {
  if (!auth.currentUser) return () => {};
  const q = query(
    collection(db, 'reportFolders'), 
    where('ownerId', '==', auth.currentUser.uid)
  );
  return onSnapshot(q, (snapshot) => {
    const folders = snapshot.docs.map(doc => doc.data() as ReportFolder);
    callback(folders);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'reportFolders');
  });
};

export const subscribeToReports = (callback: (reports: Report[]) => void) => {
  if (!auth.currentUser) return () => {};
  const q = query(
    collection(db, 'reports'), 
    where('ownerId', '==', auth.currentUser.uid)
  );
  return onSnapshot(q, (snapshot) => {
    const reports = snapshot.docs.map(doc => doc.data() as Report);
    callback(reports);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'reports');
  });
};

export const updateReceiptStatus = async (id: string, status: 'Approved' | 'Rejected') => {
  if (!auth.currentUser) return;
  try {
    await updateDoc(doc(db, 'payment_receipts', id), { status });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `payment_receipts/${id}`);
  }
};

export const resolveComplaint = async (id: string) => {
  if (!auth.currentUser) return;
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + 6);
  try {
    await updateDoc(doc(db, 'complaints', id), { 
      status: 'Resolved',
      expiresAt: expiresAt.toISOString()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `complaints/${id}`);
  }
};

export const updateComplaint = async (id: string, updates: Partial<Complaint>) => {
  if (!auth.currentUser) return;
  try {
    await updateDoc(doc(db, 'complaints', id), updates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `complaints/${id}`);
  }
};

export const deleteReport = async (id: string) => {
  if (!auth.currentUser) throw new Error("Not authenticated");
  try {
    await deleteDoc(doc(db, 'reports', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `reports/${id}`);
  }
};

export const deleteComplaint = async (complaintId: string) => {
  if (!auth.currentUser) throw new Error("Not authenticated");
  try {
    const complaintRef = doc(db, 'complaints', complaintId);
    await deleteDoc(complaintRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `complaints/${complaintId}`);
  }
};

export const archiveComplaint = async (complaintId: string) => {
  if (!auth.currentUser) throw new Error("Not authenticated");
  try {
    const complaintRef = doc(db, 'complaints', complaintId);
    const complaintSnap = await getDoc(complaintRef);
    
    if (!complaintSnap.exists()) throw new Error("Complaint not found");
    
    const complaintData = complaintSnap.data();
    
    const archiveRef = doc(db, 'complaints_archive', complaintId);
    await setDoc(archiveRef, {
        ...complaintData,
        archivedAt: new Date().toISOString()
    });
    
    await deleteDoc(complaintRef);
    
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `complaints/${complaintId}`);
  }
};

export interface ChatbotCommand {
  id: string;
  buttonLabel: string;
  triggerWord: string;
  response: string;
  isActive: boolean;
}

export interface ChatbotSettings {
  isActive: boolean;
  commands: ChatbotCommand[];
}

export const getChatbotSettings = async (): Promise<ChatbotSettings | null> => {
  if (!auth.currentUser) return null;
  try {
    const docSnap = await getDoc(doc(db, 'chatbotSettings', auth.currentUser.uid));
    if (docSnap.exists()) {
      return docSnap.data() as ChatbotSettings;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `chatbotSettings/${auth.currentUser.uid}`);
    return null;
  }
};

export const saveChatbotSettings = async (settings: ChatbotSettings) => {
  if (!auth.currentUser) throw new Error("Not authenticated");
  try {
    const docRef = doc(db, 'chatbotSettings', auth.currentUser.uid);
    await setDoc(docRef, settings, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `chatbotSettings/${auth.currentUser.uid}`);
  }
};

export const subscribeToWhatsappMessages = (callback: (msgs: WhatsappMessage[]) => void) => {
  if (!auth.currentUser) return () => {};
  const q = query(
    collection(db, 'whatsapp_messages'), 
    where('ownerId', '==', auth.currentUser.uid),
    orderBy('timestamp', 'asc')
  );
  return onSnapshot(q, (snapshot) => {
    callback(snapshot.docs.map(doc => doc.data() as WhatsappMessage));
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'whatsapp_messages');
  });
};

export const addWhatsappMessageRecord = async (msg: Omit<WhatsappMessage, 'id' | 'ownerId'>) => {
  if (!auth.currentUser) return;
  try {
    const docRef = doc(collection(db, 'whatsapp_messages'));
    const fullMsg: WhatsappMessage = {
      ...msg,
      id: docRef.id,
      ownerId: auth.currentUser.uid,
    };
    await setDoc(docRef, fullMsg);
    return fullMsg;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'whatsapp_messages');
    throw error;
  }
};
