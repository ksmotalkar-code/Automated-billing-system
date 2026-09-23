import { v4 as uuidv4 } from 'uuid';
import { collection, doc, setDoc, getDocs, getDoc, updateDoc, deleteDoc, onSnapshot, query, where, writeBatch, orderBy, limit, addDoc, deleteField } from 'firebase/firestore';
import { db, auth } from '../firebase';
import firebaseConfig from '../../firebase-applet-config.json';

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
    console.warn('Firestore Quota Exceeded.', errInfo);
    // Lock background tasks for 12 hours locally when quota hits
    localStorage.setItem('firestore_quota_expiry', (Date.now() + 12 * 60 * 60 * 1000).toString());
    throw new Error('resource-exhausted: Your database quota has been exceeded. Please review usage or billing.');
  }

  if (errorMessage.includes('client is offline')) {
    console.warn(`\n[WARNING] Firestore Connection Failed (Client is Offline). Request to ${path || 'unknown path'} failed. Ensure your connection is stable and Firestore is provisioned.\n`, errInfo);
    return; // Do NOT throw, so we can fall back to null/default and not break the UI
  }

  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const isQuotaExceeded = () => {
  const expiry = localStorage.getItem('firestore_quota_expiry');
  const enableLock = localStorage.getItem('enableFreeTierLock') !== 'false';
  if (enableLock && expiry && Date.now() < parseInt(expiry)) {
    return true; // Limit exceeded and lock is enabled
  }
  return false;
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
  billStatus?: string;
  description?: string;
  mobileNumber?: string;
}

export interface BillingAuditLog {
  id?: string;
  ownerId: string;
  type: 'bill_generation' | 'penalty_application' | 'auto_suspend' | 'inquiry';
  description: string;
  affectedCustomersCount: number;
  totalAmount: number;
  timestamp: string;
  executedBy: 'system' | 'admin';
  customerId?: string;
  customerName?: string;
}

export const saveBillingAuditLog = async (log: Omit<BillingAuditLog, 'id'>) => {
  const q = collection(db, 'billing_audit');
  await addDoc(q, log);
};

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
  assetLink?: string;
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
  id: string; // The ID of the provider, e.g., 'meta', 'wati', etc.
  name: string; // The name of the provider, e.g., 'Meta Official API', 'WATI API'
  baseUrl: string; // The base URL for the API
  requiresApiKey: boolean; // Does the provider require an API key?
  requiresPhoneId: boolean; // Does the provider require a Phone ID?
  isActive: boolean; // Is the provider active?
}

export const getProviders = async (): Promise<WhatsAppProvider[]> => {
  if (!auth.currentUser) return [];
  try {
    const providersCol = collection(db, 'providers');
    const snapshot = await getDocs(providersCol);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WhatsAppProvider));
  } catch (error: any) {
    handleFirestoreError(error, OperationType.GET, 'providers');
    return [];
  }
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
  mediaUrl?: string;
  mediaName?: string;
}

export interface CustomAutomationParam {
  id: string;
  key: string;
  value: string;
  type: string;
}

export interface MetaTemplateDef {
  id: string;
  templateName: string;
  parameters: string; // comma separated: e.g. "customer_name, balance, date"
}

export interface AppSettings {
  appLogoImage?: string | null;
  upiQrCodeImage: string | null;
  billingAmount: number;
  billingCycleMonths: number;
  penaltyAmount: number;
  penaltyDays: number;
  escalationDays?: number;
  autoSuspend?: boolean;
  defaultBillingDate?: string;
  cronSchedule?: string; // e.g. "0 0 * * *"
  customAutomationParams?: CustomAutomationParam[];
  nextBillingDate?: string;
  lastBillingDate?: string;
  lastPenaltyDate?: string;
  lastNotificationDate?: string;
  ownerId?: string;
  metaWhatsAppApiKey?: string;
  metaWhatsAppPhoneNumberId?: string;
  metaWhatsAppVerifyToken?: string;
  metaTemplateBilling?: string;
  metaTemplateReceipt?: string;
  metaTemplateBroadcast?: string;
  metaTemplateWelcome?: string;
  metaTemplateOverdue?: string;
  metaTemplateSuspension?: string;
  metaTemplateCustom?: string;
  metaCustomTemplates?: MetaTemplateDef[];
  watiAccessToken?: string;
  watiApiEndpoint?: string;
  preferredNotificationMethod?: string;
  enableWhatsappWeb?: boolean;
  enableAutosave?: boolean;
  enableFreeTierLock?: boolean;
  paymentGatewayKey?: string;
  paymentGatewaySecret?: string;
  publicPortalBaseUrl?: string; // e.g. https://my-app.onrender.com
  automation?: AutomationSettings;
  chatbotCommands?: ChatbotCommand[];
  appTheme?: string;
  appUiStyle?: string;
  billTemplateImage?: string | null;
  preferredLanguage?: 'en' | 'hi' | 'pa';
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
  const user = auth.currentUser;
  if (!user) return;
  
  const lastCleanup = localStorage.getItem(`last_cleanup_${user.uid}`);
  const today = new Date().toDateString();
  if (lastCleanup === today) return; // Already cleaned up today
  
  localStorage.setItem(`last_cleanup_${user.uid}`, today);

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  
  const now = new Date().toISOString();
  
  const qData = query(
    collection(db, 'uploadedData'), 
    where('ownerId', '==', user.uid),
    where('uploadedAt', '<', sixMonthsAgo.toISOString())
  );

  const qComplaints = query(
    collection(db, 'complaints'),
    where('ownerId', '==', user.uid),
    where('expiresAt', '<', now)
  );
  
  try {
    const dataSnap = await getDocs(qData);
    const confSnap = await getDocs(qComplaints);

    if (dataSnap.size > 0 || confSnap.size > 0) {
      const docsToDelete = [...dataSnap.docs, ...confSnap.docs];
      // Use deleteInBatches helper
      const batchLimit = 200;
      for (let i = 0; i < docsToDelete.length; i += batchLimit) {
        const batch = writeBatch(db);
        const chunk = docsToDelete.slice(i, i + batchLimit);
        chunk.forEach(doc => batch.delete(doc.ref));
        await batch.commit();
        if (i + batchLimit < docsToDelete.length) {
          await new Promise(r => setTimeout(r, 500));
        }
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

// Utility to get the next sequential digital customer ID (1, 2, 3...)
export function getNextSequentialCustomerId(existingCustomers: { id?: string }[]): string {
  let maxId = 0;
  for (const c of existingCustomers) {
    if (!c.id) continue;
    // Extract digital portion from ID (e.g. "1", "25", or legacy "CUST-42")
    const cleanDigits = c.id.replace(/\D/g, "");
    if (cleanDigits) {
      const num = parseInt(cleanDigits, 10);
      if (!isNaN(num) && num > maxId) {
        maxId = num;
      }
    }
  }
  return (maxId + 1).toString();
}

export const addCustomer = async (
  customer: Omit<Customer, 'id' | 'ownerId'> & { id?: string },
  existingCustomerList?: Customer[]
): Promise<Customer> => {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  checkQuotaBeforeWrite("Add Customer");
  
  // Check for duplicates
  const q = query(
      collection(db, 'customers'), 
      where('ownerId', '==', user.uid),
      where('mobileNumber', '==', customer.mobileNumber)
  );
  const snapshot = await getDocs(q);
  
  if (!snapshot.empty) {
    customer.status = 'Faulty';
  }

  // Derive next sequential digital ID if not provided
  let assignedId = customer.id?.trim();
  if (!assignedId) {
    if (existingCustomerList && existingCustomerList.length > 0) {
      assignedId = getNextSequentialCustomerId(existingCustomerList);
    } else {
      const allCustQ = query(collection(db, 'customers'), where('ownerId', '==', user.uid));
      const allCustSnap = await getDocs(allCustQ);
      const existingList = allCustSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      assignedId = getNextSequentialCustomerId(existingList);
    }
  } else {
    const existingSnap = await getDoc(doc(db, 'customers', assignedId));
    if (existingSnap.exists()) {
      throw new Error(`Customer ID "${assignedId}" is already assigned to another customer.`);
    }
  }

  const newCustomer: Customer = {
    ...customer,
    id: assignedId,
    ownerId: user.uid,
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

/**
 * Re-sequences all existing customers to a clean digital sequence (1, 2, 3... N).
 * Migrates documents with zero data loss.
 */
export const resequenceAllCustomers = async (): Promise<{ total: number; updated: number }> => {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  checkQuotaBeforeWrite("Resequence Customers");

  const custQuery = query(collection(db, 'customers'), where('ownerId', '==', user.uid));
  const snap = await getDocs(custQuery);
  if (snap.empty) return { total: 0, updated: 0 };

  const rawDocs = snap.docs.map(d => ({ docId: d.id, data: d.data() as Customer }));

  // Deterministically sort customers:
  // 1. By existing numeric ID if present
  // 2. Or by createdAt
  // 3. Or by name
  rawDocs.sort((a, b) => {
    const numA = parseInt((a.data.id || a.docId).replace(/\D/g, ""), 10);
    const numB = parseInt((b.data.id || b.docId).replace(/\D/g, ""), 10);
    if (!isNaN(numA) && !isNaN(numB) && numA > 0 && numB > 0) {
      return numA - numB;
    }
    if (a.data.createdAt && b.data.createdAt) {
      return a.data.createdAt.localeCompare(b.data.createdAt);
    }
    return (a.data.name || "").localeCompare(b.data.name || "");
  });

  let updatedCount = 0;
  const batchLimit = 150;

  for (let i = 0; i < rawDocs.length; i += batchLimit) {
    const chunk = rawDocs.slice(i, i + batchLimit);
    const batch = writeBatch(db);

    for (let j = 0; j < chunk.length; j++) {
      const item = chunk[j];
      const targetSeqIndex = i + j + 1; // 1, 2, 3...
      const newSequentialId = targetSeqIndex.toString();

      if (item.docId !== newSequentialId || item.data.id !== newSequentialId) {
        updatedCount++;
        const oldDocRef = doc(db, 'customers', item.docId);
        const newDocRef = doc(db, 'customers', newSequentialId);

        const updatedCustomer: Customer = {
          ...item.data,
          id: newSequentialId,
          ownerId: user.uid
        };

        // Write new sequential document
        batch.set(newDocRef, updatedCustomer);

        // Delete old document if the ID is different
        if (item.docId !== newSequentialId) {
          batch.delete(oldDocRef);
        }
      }
    }

    await batch.commit();
    if (i + batchLimit < rawDocs.length) {
      await new Promise(r => setTimeout(r, 400));
    }
  }

  return { total: rawDocs.length, updated: updatedCount };
};

export const updateCustomer = async (
  updatedCustomer: Customer, 
  skipDuplicateCheck = false,
  oldId?: string
) => {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  if (isQuotaExceeded()) throw new Error("Quota Exceeded: Cannot update customer.");
  
  const currentDocId = (oldId && oldId.trim() !== "") ? oldId.trim() : updatedCustomer.id;
  const targetId = (updatedCustomer.id || "").trim();

  if (!targetId) {
    throw new Error("Customer ID cannot be empty.");
  }

  // If ID has changed, verify the target ID is not already used
  if (currentDocId !== targetId) {
    const targetDocSnap = await getDoc(doc(db, 'customers', targetId));
    if (targetDocSnap.exists()) {
      throw new Error(`Customer ID "${targetId}" is already assigned to another customer.`);
    }
  }

  let isDuplicate = false;
  let snapshotDocs: any[] = [];

  if (!skipDuplicateCheck) {
    // Check for duplicates (if mobile number changed)
    const q = query(
        collection(db, 'customers'), 
        where('ownerId', '==', user.uid),
        where('mobileNumber', '==', updatedCustomer.mobileNumber)
    );
    const snapshot = await getDocs(q);
    snapshotDocs = snapshot.docs;
    
    snapshot.forEach(docSnap => {
        if (docSnap.id !== currentDocId && docSnap.id !== targetId) {
            isDuplicate = true;
        }
    });
    
    if (isDuplicate) {
        updatedCustomer.status = 'Faulty';
    }
  }

  try {
    if (currentDocId !== targetId) {
      // Migrate document from currentDocId to targetId atomically
      const batch = writeBatch(db);
      const newRef = doc(db, 'customers', targetId);
      const oldRef = doc(db, 'customers', currentDocId);

      const newCustomerData: Customer = {
        ...updatedCustomer,
        id: targetId,
        ownerId: user.uid,
      };

      batch.set(newRef, newCustomerData);
      batch.delete(oldRef);

      // Migrate public_portals record if it exists
      try {
        const portalOldRef = doc(db, 'public_portals', currentDocId);
        const portalOldSnap = await getDoc(portalOldRef);
        if (portalOldSnap.exists()) {
          const pData = portalOldSnap.data();
          batch.set(doc(db, 'public_portals', targetId), {
            ...pData,
            portalId: targetId,
            customerId: targetId,
          });
          batch.delete(portalOldRef);
        }
      } catch (portalErr) {
        console.warn("Could not migrate public portal for customer ID change:", portalErr);
      }

      // Update complaints linked to this customer
      try {
        const compQ = query(collection(db, 'complaints'), where('ownerId', '==', user.uid), where('customerId', '==', currentDocId));
        const compSnap = await getDocs(compQ);
        compSnap.forEach(d => {
          batch.update(d.ref, { customerId: targetId });
        });
      } catch (compErr) {
        console.warn("Could not migrate complaints for customer ID change:", compErr);
      }

      // If duplicate, update other docs to Faulty
      if (isDuplicate && snapshotDocs.length > 0) {
        snapshotDocs.forEach(docSnap => {
          if (docSnap.id !== currentDocId && docSnap.id !== targetId) {
            batch.update(docSnap.ref, { status: 'Faulty' });
          }
        });
      }

      await batch.commit();

      // Migrate chat_history subcollection if present
      try {
        const chatSnap = await getDocs(collection(db, 'customers', currentDocId, 'chat_history'));
        if (!chatSnap.empty) {
          const chatBatch = writeBatch(db);
          chatSnap.forEach(cDoc => {
            const newChatDoc = doc(collection(db, 'customers', targetId, 'chat_history'), cDoc.id);
            chatBatch.set(newChatDoc, cDoc.data());
            chatBatch.delete(cDoc.ref);
          });
          await chatBatch.commit();
        }
      } catch (chatErr) {
        console.warn("Could not migrate chat history for customer ID change:", chatErr);
      }
    } else {
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
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `customers/${updatedCustomer.id}`);
    throw error;
  }
};

const deleteInBatches = async (querySnapshot: any) => {
  const batchLimit = 200;
  const docs = querySnapshot.docs;
  for (let i = 0; i < docs.length; i += batchLimit) {
    const batch = writeBatch(db);
    const chunk = docs.slice(i, i + batchLimit);
    chunk.forEach((doc: any) => batch.delete(doc.ref));
    await batch.commit();
    if (i + batchLimit < docs.length) await new Promise(r => setTimeout(r, 500));
  }
};

export const deleteCustomer = async (id: string) => {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  checkQuotaBeforeWrite("Delete Customer");
  try {
    const batch = writeBatch(db);
    // Delete customer doc
    batch.delete(doc(db, 'customers', id));
    
    // Find and delete associated transactions
    const q = query(
      collection(db, 'transactions'), 
      where('customerId', '==', id),
      where('ownerId', '==', user.uid)
    );
    const snapshot = await getDocs(q);
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `customers/${id}`);
  }
};

export const deleteCustomersBatch = async (ids: string[]) => {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  try {
    // Delete customers in chunks of 200
    for (let i = 0; i < ids.length; i += 200) {
      const batch = writeBatch(db);
      const chunk = ids.slice(i, i + 200);
      chunk.forEach(id => batch.delete(doc(db, 'customers', id)));
      await batch.commit();
      if (i + 200 < ids.length) await new Promise(r => setTimeout(r, 500));
    }

    // Delete associated transactions for these customers
    for (const id of ids) {
      const q = query(
        collection(db, 'transactions'), 
        where('customerId', '==', id),
        where('ownerId', '==', user.uid)
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

export const updateCustomersBatchStatus = async (ids: string[], status: 'Active' | 'Suspended') => {
  if (!auth.currentUser) throw new Error("Not authenticated");
  try {
    for (let i = 0; i < ids.length; i += 200) {
      const batch = writeBatch(db);
      const chunk = ids.slice(i, i + 200);
      chunk.forEach(id => {
        const ref = doc(db, 'customers', id);
        batch.update(ref, { status, updatedAt: new Date().toISOString() });
      });
      await batch.commit();
      if (i + 200 < ids.length) await new Promise(r => setTimeout(r, 500));
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'customers_batch_status');
  }
};

export const deleteAllCustomers = async () => {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  try {
    // Delete all customers for this user
    const qCust = query(collection(db, 'customers'), where('ownerId', '==', user.uid));
    const snapCust = await getDocs(qCust);
    await deleteInBatches(snapCust);

    // Delete all transactions for this user
    const qTxn = query(collection(db, 'transactions'), where('ownerId', '==', user.uid));
    const snapTxn = await getDocs(qTxn);
    await deleteInBatches(snapTxn);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'all_customers');
  }
};

export const addTransaction = async (transaction: Omit<Transaction, 'id' | 'date' | 'ownerId'>): Promise<Transaction> => {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  checkQuotaBeforeWrite("Add Transaction");
  const newTransaction: Transaction = {
    ...transaction,
    id: `TXN-${uuidv4().substring(0, 8).toUpperCase()}`,
    date: new Date().toISOString(),
    ownerId: user.uid,
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
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  if (isQuotaExceeded()) throw new Error("Quota Exceeded: Writes temporarily disabled.");
  try {
    const payload: any = { ...settings, ownerId: user.uid };
    // If billTemplateImage is empty or null, guarantee it is stored as null rather than leftover data
    if (!payload.billTemplateImage) {
      payload.billTemplateImage = null;
    }
    await setDoc(doc(db, 'settings', user.uid), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `settings/${user.uid}`);
  }
};

export const deleteBillTemplateImage = async () => {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  try {
    await updateDoc(doc(db, 'settings', user.uid), {
      billTemplateImage: deleteField()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `settings/${user.uid}`);
  }
};

export const saveUploadedData = async (fileName: string, data: any[]) => {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const id = `UPLOAD-${uuidv4().substring(0, 8).toUpperCase()}`;
  const upload: UploadedData = {
    id,
    fileName,
    data: JSON.stringify(data),
    uploadedAt: new Date().toISOString(),
    ownerId: user.uid,
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
  const batchLimit = 200;
  for (let i = 0; i < customers.length; i += batchLimit) {
    const chunk = customers.slice(i, i + batchLimit);
    const batch = writeBatch(db);
    for (const c of chunk) {
      batch.update(doc(db, 'customers', c.id), { balance: 0 });
    }
    await batch.commit();
    if (i + batchLimit < customers.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
};

export const resetDatabase = async () => {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  console.log("Starting master database reset for user:", user.uid);
  try {
    // 1. Delete all customers and transactions
    console.log("Deleting customers and transactions...");
    await deleteAllCustomers();

    // 2. Delete uploaded data
    console.log("Deleting uploaded data history...");
    const qUpload = query(collection(db, 'uploadedData'), where('ownerId', '==', user.uid));
    const snapUpload = await getDocs(qUpload);
    if (!snapUpload.empty) {
      await deleteInBatches(snapUpload);
    }

    // 3. Delete settings
    console.log("Deleting user settings...");
    await deleteDoc(doc(db, 'settings', user.uid));
    
    console.log("Master reset completed successfully.");
  } catch (error) {
    console.error("Error in resetDatabase:", error);
    throw error; // Re-throw to be caught by the UI
  }
};

export const importCustomersFromText = async (text: string) => {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
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

  // Query highest existing sequential ID
  const allCustQ = query(collection(db, 'customers'), where('ownerId', '==', user.uid));
  const allCustSnap = await getDocs(allCustQ);
  let nextSeq = 0;
  for (const docSnap of allCustSnap.docs) {
    const rawDigits = (docSnap.id || "").replace(/\D/g, "");
    if (rawDigits) {
      const n = parseInt(rawDigits, 10);
      if (!isNaN(n) && n > nextSeq) nextSeq = n;
    }
  }

  // Add in batches of 200 with sequential digital IDs
  const batchLimit = 200;
  for (let i = 0; i < customers.length; i += batchLimit) {
    const batch = writeBatch(db);
    const chunk = customers.slice(i, i + batchLimit);
    for (const custData of chunk) {
      nextSeq += 1;
      const id = nextSeq.toString();
      const docRef = doc(db, 'customers', id);
      batch.set(docRef, {
        ...custData,
        id,
        ownerId: user.uid,
        createdAt: new Date().toISOString()
      });
    }
    await batch.commit();
    if (i + batchLimit < customers.length) {
      await new Promise(resolve => setTimeout(resolve, 500));
    }
  }
  return customers.length;
};

export const subscribeToBillingAuditLogs = (callback: (logs: BillingAuditLog[]) => void) => {
  const user = auth.currentUser;
  if (!user) return () => {};
  const q = query(
    collection(db, 'billing_audit'),
    where('ownerId', '==', user.uid)
  );
  return onSnapshot(q, (snapshot) => {
    const logsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BillingAuditLog));
    logsData.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    callback(logsData);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'billing_audit');
    callback([]);
  });
};

export const deleteAuditLog = async (logId: string) => {
  try {
    await deleteDoc(doc(db, 'billing_audit', logId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `billing_audit/${logId}`);
  }
};

export const clearAllAuditLogs = async () => {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  try {
    const q = query(collection(db, 'billing_audit'), where('ownerId', '==', user.uid));
    const querySnapshot = await getDocs(q);
    const batchList = writeBatch(db);
    querySnapshot.docs.forEach((docSnap) => {
      batchList.delete(docSnap.ref);
    });
    await batchList.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'billing_audit');
  }
};

export const subscribeToCustomers = (callback: (customers: Customer[]) => void) => {
  const user = auth.currentUser;
  if (!user) return () => {};
  
  const processDocs = (snapshot: any) => {
    return snapshot.docs.map((doc: any) => {
      const data = doc.data() as Customer;
      if (data.status !== 'Suspended') {
        const cleanMobile = data.mobileNumber ? data.mobileNumber.replace(/\D/g, '') : '';
        if (!cleanMobile || cleanMobile.length < 10 || cleanMobile === '0000000000') {
          data.status = 'Suspended';
        }
      }
      return data;
    });
  };

  const primaryOwnerId = '8n38K7tvJ3OHchV76zhbx6cjRa13';
  const targetOwnerId = (user.email === 'ksmotalkar@gmail.com' && user.uid !== primaryOwnerId) ? primaryOwnerId : user.uid;

  const q = query(
    collection(db, 'customers'), 
    where('ownerId', '==', targetOwnerId)
  );

  return onSnapshot(q, (snapshot) => {
    if (snapshot.empty && targetOwnerId !== primaryOwnerId) {
      // Secondary fallback if current user has no customers yet
      getDocs(query(collection(db, 'customers'), where('ownerId', '==', primaryOwnerId)))
        .then(fallbackSnap => {
          if (!fallbackSnap.empty) {
            callback(processDocs(fallbackSnap));
          } else {
            callback([]);
          }
        })
        .catch(() => callback([]));
      return;
    }
    callback(processDocs(snapshot));
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'customers');
    callback([]);
  });
};

export const subscribeToTransactions = (callback: (transactions: Transaction[]) => void) => {
  const user = auth.currentUser;
  if (!user) return () => {};
  const q = query(
    collection(db, 'transactions'), 
    where('ownerId', '==', user.uid),
    orderBy('date', 'desc'),
    limit(500)
  );
  return onSnapshot(q, (snapshot) => {
    const transactions = snapshot.docs.map(doc => doc.data() as Transaction);
    callback(transactions);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'transactions');
    callback([]);
  });
};

export const subscribeToSettings = (callback: (settings: AppSettings | null) => void) => {
  const user = auth.currentUser;
  if (!user) return () => {};
  return onSnapshot(doc(db, 'settings', user.uid), (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data() as AppSettings;
      
      // Inject missing default custom templates config for predefined ones (so user doesn't have to manually create them instantly)
      if (!data.metaCustomTemplates || data.metaCustomTemplates.length === 0) {
        data.metaCustomTemplates = [
          { id: 'def_welcome', templateName: data.metaTemplateWelcome || 'welcome_customer_v1', parameters: 'customer_name, button_param' },
          { id: 'def_billing', templateName: data.metaTemplateBilling || 'bill_reminder_v1', parameters: 'customer_name, billing_amount, new_balance, date, button_param' },
          { id: 'def_receipt', templateName: data.metaTemplateReceipt || 'payment_ack_v3', parameters: 'customer_name, payment_amount, button_param' },
          { id: 'def_overdue', templateName: data.metaTemplateOverdue || 'penalty_alert_v1', parameters: 'customer_name, overdue_amount, date, button_param' },
        ];
      }
      
      // Ensure billTemplateImage is explicitly null if undefined or empty
      if (!data.billTemplateImage) {
        data.billTemplateImage = null;
      }
      
      callback(data);
    } else {
      callback({
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
        automation: {
          billingLifecycle: true,
          ruleBased: true,
          lateFee: true,
          scheduledBilling: true,
          bulkProcessing: true,
          smartNotifications: true
        },
        ownerId: user.uid
      });
    }
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, `settings/${user.uid}`);
    // VIP Launch Shield: Provide robust default settings on any connection delay or error
    callback({
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
      automation: {
        billingLifecycle: true,
        ruleBased: true,
        lateFee: true,
        scheduledBilling: true,
        bulkProcessing: true,
        smartNotifications: true
      },
      ownerId: user.uid
    });
  });
};

export const subscribeToUploadedData = (callback: (data: UploadedData[]) => void) => {
  const user = auth.currentUser;
  if (!user) return () => {};
  const q = query(collection(db, 'uploadedData'), where('ownerId', '==', user.uid));
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(doc => doc.data() as UploadedData);
    callback(data);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'uploadedData');
  });
};

export const subscribeToPendingReceipts = (callback: (receipts: any[]) => void) => {
  const user = auth.currentUser;
  if (!user) return () => {};
  const q = query(
    collection(db, 'payment_receipts'), 
    where('ownerId', '==', user.uid),
    where('status', '==', 'Pending')
  );
  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map(doc => doc.data());
    callback(items);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'payment_receipts');
    callback([]);
  });
};

export const subscribeToComplaints = (callback: (complaints: Complaint[]) => void) => {
  const user = auth.currentUser;
  if (!user) return () => {};
  const q = query(
    collection(db, 'complaints'), 
    where('ownerId', '==', user.uid),
    orderBy('createdAt', 'desc'),
    limit(200)
  );
  return onSnapshot(q, (snapshot) => {
    const complaints = snapshot.docs.map(doc => doc.data() as Complaint);
    callback(complaints);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'complaints');
    callback([]);
  });
};

export const addReport = async (report: Omit<Report, 'id' | 'ownerId' | 'createdAt'>): Promise<Report> => {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const newReport: Report = {
    ...report,
    id: `REP-${uuidv4().substring(0, 8).toUpperCase()}`,
    createdAt: new Date().toISOString(),
    ownerId: user.uid,
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
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const newFolder: ReportFolder = {
    id: `FLD-${uuidv4().substring(0, 8).toUpperCase()}`,
    name,
    ownerId: user.uid,
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
  const user = auth.currentUser;
  if (!user) return () => {};
  const q = query(
    collection(db, 'reportFolders'), 
    where('ownerId', '==', user.uid)
  );
  return onSnapshot(q, (snapshot) => {
    const folders = snapshot.docs.map(doc => doc.data() as ReportFolder);
    callback(folders);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'reportFolders');
    callback([]);
  });
};

export const subscribeToReports = (callback: (reports: Report[]) => void) => {
  const user = auth.currentUser;
  if (!user) return () => {};
  const q = query(
    collection(db, 'reports'), 
    where('ownerId', '==', user.uid)
  );
  return onSnapshot(q, (snapshot) => {
    const reports = snapshot.docs.map(doc => doc.data() as Report);
    callback(reports);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'reports');
    callback([]);
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

export const resolveComplaint = async (id: string, notify: boolean = false) => {
  const user = auth.currentUser;
  if (!user) return;
  const expiresAt = new Date();
  expiresAt.setMonth(expiresAt.getMonth() + 6);
  try {
    await updateDoc(doc(db, 'complaints', id), { 
      status: 'Resolved',
      expiresAt: expiresAt.toISOString()
    });

    if (notify) {
      const complaintSnap = await getDoc(doc(db, 'complaints', id));
      if (complaintSnap.exists()) {
        const data = complaintSnap.data() as Complaint;
        // Call server to send notification
        await fetch('/api/complaints/notify-resolution', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            complaintId: id,
            ownerId: user.uid,
            customerId: data.customerId
          })
        });
      }
    }
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
  mediaUrl?: string;
  mediaName?: string;
}

export interface ChatbotSettings {
  isActive: boolean;
  commands: ChatbotCommand[];
}

export const getChatbotSettings = async (): Promise<ChatbotSettings | null> => {
  const user = auth.currentUser;
  if (!user) return null;
  const primaryOwnerId = '8n38K7tvJ3OHchV76zhbx6cjRa13';
  try {
    let docSnap = await getDoc(doc(db, 'chatbotSettings', user.uid));
    if (!docSnap.exists() && user.uid !== primaryOwnerId) {
      docSnap = await getDoc(doc(db, 'chatbotSettings', primaryOwnerId));
    }
    if (docSnap.exists()) {
      return docSnap.data() as ChatbotSettings;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `chatbotSettings/${user.uid}`);
    return null;
  }
};

export const saveChatbotSettings = async (settings: ChatbotSettings) => {
  const user = auth.currentUser;
  if (!user) throw new Error("Not authenticated");
  const primaryOwnerId = '8n38K7tvJ3OHchV76zhbx6cjRa13';
  try {
    const docRef = doc(db, 'chatbotSettings', user.uid);
    await setDoc(docRef, settings, { merge: true });
    if (user.uid !== primaryOwnerId) {
      try {
        await setDoc(doc(db, 'chatbotSettings', primaryOwnerId), settings, { merge: true });
      } catch (e) {
        console.warn("Could not sync chatbotSettings to primary owner", e);
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `chatbotSettings/${user.uid}`);
  }
};

export const subscribeToWhatsappMessages = (callback: (msgs: WhatsappMessage[]) => void) => {
  const user = auth.currentUser;
  if (!user) return () => {};
  const q = query(
    collection(db, 'whatsapp_messages'), 
    where('ownerId', '==', user.uid),
    orderBy('timestamp', 'desc'),
    limit(100)
  );
  return onSnapshot(q, (snapshot) => {
    // Sort back to asc for the UI if needed
    const messages = snapshot.docs.map(doc => doc.data() as WhatsappMessage);
    callback(messages.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()));
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'whatsapp_messages');
    callback([]);
  });
};

export const addWhatsappMessageRecord = async (msg: Omit<WhatsappMessage, 'id' | 'ownerId'>) => {
  const user = auth.currentUser;
  if (!user) return;
  try {
    const docRef = doc(collection(db, 'whatsapp_messages'));
    const fullMsg: WhatsappMessage = {
      ...msg,
      id: docRef.id,
      ownerId: user.uid,
    };
    await setDoc(docRef, fullMsg);
    return fullMsg;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'whatsapp_messages');
    throw error;
  }
};

export interface AutomationError {
  id: string;
  customerId: string;
  customerName: string;
  errorMessage: string;
  resolved: boolean;
  timestamp: string;
  type: string;
  ownerId: string;
}

export const logAutomationError = async (errorInfo: Omit<AutomationError, 'id' | 'timestamp' | 'resolved' | 'ownerId'>) => {
  // Use simple logs method to prevent DB writes
  const msg = `[AutomationError] Type: ${errorInfo.type}, Customer: ${errorInfo.customerName} (${errorInfo.customerId}) - ${errorInfo.errorMessage}`;
  console.error(msg);
};

export const subscribeToAutomationErrors = (callback: (errors: AutomationError[]) => void) => {
  const user = auth.currentUser;
  if (!user) return () => {};

  const q = query(
    collection(db, 'automation_errors'),
    where('ownerId', '==', user.uid)
  );

  return onSnapshot(q, (snapshot) => {
    const errorsList = snapshot.docs.map(d => d.data() as AutomationError);
    errorsList.sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    callback(errorsList);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'automation_errors');
    callback([]);
  });
};

export const resolveAutomationError = async (id: string, notify: boolean = false) => {
  try {
    await updateDoc(doc(db, 'automation_errors', id), { resolved: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'automation_errors');
  }
};
