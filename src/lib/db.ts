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
    console.warn('Firestore Quota Notice.', errInfo);
    throw new Error('resource-exhausted: Your database quota or rate limit has been reached. Please wait a moment or check project limits.');
  }

  if (errorMessage.includes('client is offline')) {
    console.warn(`\n[WARNING] Firestore Connection Failed (Client is Offline). Request to ${path || 'unknown path'} failed. Ensure your connection is stable and Firestore is provisioned.\n`, errInfo);
    return; // Do NOT throw, so we can fall back to null/default and not break the UI
  }

  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export const isQuotaExceeded = () => {
  return false;
};

export interface Customer {
  id: string; // The sequential digital ID (e.g. "1", "2")
  docId?: string; // Firestore document ID (tenant-isolated)
  name: string;
  mobileNumber: string;
  status: 'Active' | 'Suspended' | 'Faulty' | 'Advance Paid';
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

export const saveBillingAuditLog = async (log: Omit<BillingAuditLog, 'id'>, explicitOwnerId?: string) => {
  const uid = explicitOwnerId || log.ownerId || auth.currentUser?.uid;
  if (!uid) return;
  const q = collection(db, 'billing_audit');
  await addDoc(q, { ...log, ownerId: uid });
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
  ownerId?: string;
}

export const getProviders = async (explicitOwnerId?: string): Promise<WhatsAppProvider[]> => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) return [];
  try {
    const q = query(collection(db, 'providers'), where('ownerId', '==', uid));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WhatsAppProvider));
  } catch (error: any) {
    handleFirestoreError(error, OperationType.GET, 'providers');
    return [];
  }
};

export const addProvider = async (provider: WhatsAppProvider, explicitOwnerId?: string) => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
  checkQuotaBeforeWrite("Add Provider");
  const { id, ...providerData } = provider;
  const docId = id.startsWith(`${uid}_`) ? id : `${uid}_${id}`;
  try {
    await setDoc(doc(db, 'providers', docId), { ...providerData, id, ownerId: uid });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'providers');
  }
};

export const deleteProvider = async (id: string, explicitOwnerId?: string) => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
  checkQuotaBeforeWrite("Delete Provider");
  const docId = id.startsWith(`${uid}_`) ? id : `${uid}_${id}`;
  try {
    await deleteDoc(doc(db, 'providers', docId));
    if (docId !== id) {
      try { await deleteDoc(doc(db, 'providers', id)); } catch(e) {}
    }
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
  organizationName?: string;
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

export const cleanupOldData = async (explicitOwnerId?: string) => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) return;
  
  const lastCleanup = localStorage.getItem(`last_cleanup_${uid}`);
  const today = new Date().toDateString();
  if (lastCleanup === today) return; // Already cleaned up today
  
  localStorage.setItem(`last_cleanup_${uid}`, today);

  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);
  
  const now = new Date().toISOString();
  
  const qData = query(
    collection(db, 'uploadedData'), 
    where('ownerId', '==', uid),
    where('uploadedAt', '<', sixMonthsAgo.toISOString())
  );

  const qComplaints = query(
    collection(db, 'complaints'),
    where('ownerId', '==', uid),
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
  existingCustomerList?: Customer[],
  explicitOwnerId?: string
): Promise<Customer> => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
  checkQuotaBeforeWrite("Add Customer");
  
  // Clean & normalize mobile number (handle numbers, strings, or formatting)
  const rawMobile = customer.mobileNumber ? String(customer.mobileNumber).replace(/\D/g, '') : '';
  const cleanMobile = rawMobile.length >= 10 ? rawMobile.slice(-10) : rawMobile;

  // Check for duplicates within tenant ONLY IF valid 10-digit mobile is provided (not empty / not all zeroes)
  let isDuplicateMobile = false;
  if (cleanMobile && cleanMobile.length === 10 && cleanMobile !== '0000000000') {
    try {
      const q = query(
          collection(db, 'customers'), 
          where('ownerId', '==', uid),
          where('mobileNumber', '==', cleanMobile)
      );
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        isDuplicateMobile = true;
      }
    } catch (e) {
      console.warn("Non-fatal duplicate mobile check warning:", e);
    }
  }

  // Derive next sequential digital ID if not provided
  let assignedId = (customer.id ? String(customer.id).trim() : "");
  if (!assignedId) {
    if (existingCustomerList && existingCustomerList.length > 0) {
      assignedId = getNextSequentialCustomerId(existingCustomerList);
    } else {
      const allCustQ = query(collection(db, 'customers'), where('ownerId', '==', uid));
      const allCustSnap = await getDocs(allCustQ);
      const existingList = allCustSnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
      assignedId = getNextSequentialCustomerId(existingList);
    }
  } else {
    // Check uniqueness ONLY within this tenant's workspace
    const existingQ = query(
      collection(db, 'customers'),
      where('ownerId', '==', uid),
      where('id', '==', assignedId)
    );
    const existingSnap = await getDocs(existingQ);
    if (!existingSnap.empty) {
      throw new Error(`Customer ID "${assignedId}" is already assigned to another customer in your workspace.`);
    }
  }

  const docId = `${uid}_${assignedId}`;
  const finalStatus: 'Active' | 'Suspended' | 'Faulty' | 'Advance Paid' = isDuplicateMobile 
    ? 'Faulty' 
    : (['Active', 'Suspended', 'Faulty', 'Advance Paid'].includes(customer.status as any) ? customer.status as any : 'Active');

  const newCustomer: Customer = {
    ...customer,
    id: assignedId,
    name: String(customer.name || "Customer").trim().slice(0, 100),
    mobileNumber: cleanMobile,
    status: finalStatus,
    balance: Number(customer.balance) || 0,
    docId,
    ownerId: uid,
    createdAt: new Date().toISOString()
  };

  try {
    await setDoc(doc(db, 'customers', docId), newCustomer);
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
export const resequenceAllCustomers = async (explicitOwnerId?: string): Promise<{ total: number; updated: number }> => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
  checkQuotaBeforeWrite("Resequence Customers");

  const custQuery = query(collection(db, 'customers'), where('ownerId', '==', uid));
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

      const targetDocId = `${uid}_${newSequentialId}`;

      if (item.docId !== targetDocId || item.data.id !== newSequentialId) {
        updatedCount++;
        const oldDocRef = doc(db, 'customers', item.docId);
        const newDocRef = doc(db, 'customers', targetDocId);

        const updatedCustomer: Customer = {
          ...item.data,
          id: newSequentialId,
          docId: targetDocId,
          ownerId: uid
        };

        // Write new sequential document
        batch.set(newDocRef, updatedCustomer);

        // Delete old document if the ID is different
        if (item.docId !== targetDocId) {
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
  oldId?: string,
  explicitOwnerId?: string
) => {
  const uid = explicitOwnerId || updatedCustomer.ownerId || auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
  if (isQuotaExceeded()) throw new Error("Quota Exceeded: Cannot update customer.");
  
  const oldCustomerSeq = (oldId && oldId.trim() !== "") ? oldId.trim() : updatedCustomer.id;
  const targetId = (updatedCustomer.id || "").trim();

  if (!targetId) {
    throw new Error("Customer ID cannot be empty.");
  }

  // If ID has changed, verify the target ID is not already used in this workspace
  if (oldCustomerSeq !== targetId) {
    const targetQ = query(
      collection(db, 'customers'),
      where('ownerId', '==', uid),
      where('id', '==', targetId)
    );
    const targetSnap = await getDocs(targetQ);
    if (!targetSnap.empty) {
      throw new Error(`Customer ID "${targetId}" is already assigned to another customer in your workspace.`);
    }
  }

  const currentDocId = updatedCustomer.docId || `${uid}_${oldCustomerSeq}`;
  const targetDocId = `${uid}_${targetId}`;

  let isDuplicate = false;
  let snapshotDocs: any[] = [];

  const rawMobile = updatedCustomer.mobileNumber ? String(updatedCustomer.mobileNumber).replace(/\D/g, '') : '';
  const cleanMobile = rawMobile.length >= 10 ? rawMobile.slice(-10) : rawMobile;
  updatedCustomer.mobileNumber = cleanMobile;

  if (!skipDuplicateCheck && cleanMobile && cleanMobile.length === 10 && cleanMobile !== '0000000000') {
    try {
      const q = query(
          collection(db, 'customers'), 
          where('ownerId', '==', uid),
          where('mobileNumber', '==', cleanMobile)
      );
      const snapshot = await getDocs(q);
      snapshotDocs = snapshot.docs;
      
      snapshot.forEach(docSnap => {
          const dData = docSnap.data();
          if (docSnap.id !== currentDocId && docSnap.id !== targetDocId && dData.id !== targetId) {
              isDuplicate = true;
          }
      });
      
      if (isDuplicate) {
          updatedCustomer.status = 'Faulty';
      }
    } catch (e) {
      console.warn("Non-fatal duplicate mobile check warning in updateCustomer:", e);
    }
  }

  try {
    if (oldCustomerSeq !== targetId) {
      // Migrate document from currentDocId to targetDocId atomically
      const batch = writeBatch(db);
      const newRef = doc(db, 'customers', targetDocId);
      const oldRef = doc(db, 'customers', currentDocId);

      const newCustomerData: Customer = {
        ...updatedCustomer,
        id: targetId,
        docId: targetDocId,
        ownerId: uid,
      };

      batch.set(newRef, newCustomerData);
      batch.delete(oldRef);

      // Also clean up legacy un-prefixed doc if it existed
      if (currentDocId !== oldCustomerSeq) {
        try {
          batch.delete(doc(db, 'customers', oldCustomerSeq));
        } catch (e) { /* ignore */ }
      }

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
            ownerId: uid
          });
          batch.delete(portalOldRef);
        }
      } catch (portalErr) {
        console.warn("Could not migrate public portal for customer ID change:", portalErr);
      }

      // Update complaints linked to this customer
      try {
        const compQ = query(collection(db, 'complaints'), where('ownerId', '==', uid), where('customerId', '==', oldCustomerSeq));
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
          if (docSnap.id !== currentDocId && docSnap.id !== targetDocId) {
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
            const newChatDoc = doc(collection(db, 'customers', targetDocId, 'chat_history'), cDoc.id);
            chatBatch.set(newChatDoc, cDoc.data());
            chatBatch.delete(cDoc.ref);
          });
          await chatBatch.commit();
        }
      } catch (chatErr) {
        console.warn("Could not migrate chat history for customer ID change:", chatErr);
      }
    } else {
      await setDoc(doc(db, 'customers', currentDocId), { 
        ...updatedCustomer,
        id: targetId,
        docId: currentDocId,
        ownerId: uid,
        balance: typeof updatedCustomer.balance === 'number' ? updatedCustomer.balance : (Number(updatedCustomer.balance) || 0),
        status: updatedCustomer.status || 'Active',
      }, { merge: true });
      
      // If duplicate, update other docs to Faulty
      if (isDuplicate && snapshotDocs.length > 0) {
          const batch = writeBatch(db);
          snapshotDocs.forEach(docSnap => {
              if (docSnap.id !== currentDocId) {
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

export const deleteCustomer = async (id: string, docId?: string, explicitOwnerId?: string) => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
  checkQuotaBeforeWrite("Delete Customer");
  try {
    const batch = writeBatch(db);
    const targetDocId = docId || `${uid}_${id}`;
    batch.delete(doc(db, 'customers', targetDocId));
    
    // Also clean up legacy doc if it had the raw id
    if (!docId) {
      try { batch.delete(doc(db, 'customers', id)); } catch (e) { /* ignore */ }
    }
    
    // Find and delete associated transactions strictly within tenant
    const q = query(
      collection(db, 'transactions'), 
      where('customerId', '==', id),
      where('ownerId', '==', uid)
    );
    const snapshot = await getDocs(q);
    snapshot.docs.forEach(doc => batch.delete(doc.ref));
    
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `customers/${id}`);
  }
};

export const deleteCustomersBatch = async (
  items: (string | { id: string; docId?: string })[],
  explicitOwnerId?: string
) => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
  try {
    const normalized = items.map(item => typeof item === 'string' ? { id: item, docId: `${uid}_${item}` } : { id: item.id, docId: item.docId || `${uid}_${item.id}` });
    for (let i = 0; i < normalized.length; i += 200) {
      const batch = writeBatch(db);
      const chunk = normalized.slice(i, i + 200);
      chunk.forEach(item => {
        batch.delete(doc(db, 'customers', item.docId));
        try { batch.delete(doc(db, 'customers', item.id)); } catch (e) { /* ignore */ }
      });
      await batch.commit();
      if (i + 200 < normalized.length) await new Promise(r => setTimeout(r, 500));
    }

    // Delete associated transactions for these customers strictly within tenant
    for (const item of normalized) {
      const q = query(
        collection(db, 'transactions'), 
        where('customerId', '==', item.id),
        where('ownerId', '==', uid)
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

export const updateCustomersBatchStatus = async (
  items: (string | { id: string; docId?: string })[], 
  status: 'Active' | 'Suspended' | 'Faulty' | 'Advance Paid',
  explicitOwnerId?: string
) => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
  try {
    const normalized = items.map(item => typeof item === 'string' ? { id: item, docId: `${uid}_${item}` } : { id: item.id, docId: item.docId || `${uid}_${item.id}` });
    for (let i = 0; i < normalized.length; i += 200) {
      const batch = writeBatch(db);
      const chunk = normalized.slice(i, i + 200);
      chunk.forEach(item => {
        const ref = doc(db, 'customers', item.docId);
        batch.update(ref, { status, updatedAt: new Date().toISOString() });
      });
      await batch.commit();
      if (i + 200 < normalized.length) await new Promise(r => setTimeout(r, 500));
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, 'customers_batch_status');
  }
};

export const deleteAllCustomers = async (explicitOwnerId?: string) => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
  try {
    // Delete all customers for this user
    const qCust = query(collection(db, 'customers'), where('ownerId', '==', uid));
    const snapCust = await getDocs(qCust);
    await deleteInBatches(snapCust);

    // Delete all transactions for this user
    const qTxn = query(collection(db, 'transactions'), where('ownerId', '==', uid));
    const snapTxn = await getDocs(qTxn);
    await deleteInBatches(snapTxn);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, 'all_customers');
  }
};

export const addTransaction = async (
  transaction: Omit<Transaction, 'id' | 'date' | 'ownerId'>,
  explicitOwnerId?: string
): Promise<Transaction> => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
  checkQuotaBeforeWrite("Add Transaction");
  const newTransaction: Transaction = {
    ...transaction,
    id: `TXN-${uuidv4().substring(0, 8).toUpperCase()}`,
    date: new Date().toISOString(),
    ownerId: uid,
  };
  try {
    await setDoc(doc(db, 'transactions', newTransaction.id), newTransaction);
    return newTransaction;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'transactions');
    throw error;
  }
};

export const saveSettings = async (settings: AppSettings, explicitOwnerId?: string) => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
  if (isQuotaExceeded()) throw new Error("Quota Exceeded: Writes temporarily disabled.");
  try {
    const payload: any = { ...settings, ownerId: uid };
    // If billTemplateImage is empty or null, guarantee it is stored as null rather than leftover data
    if (!payload.billTemplateImage) {
      payload.billTemplateImage = null;
    }

    // Defensive Preservation: If incoming settings has empty or missing WhatsApp credentials/templates,
    // preserve whatever non-empty values currently exist in Firestore to prevent accidental wipes.
    try {
      const existingSnap = await getDoc(doc(db, 'settings', uid));
      if (existingSnap.exists()) {
        const existing = existingSnap.data() as AppSettings;
        if (!payload.metaWhatsAppApiKey && existing.metaWhatsAppApiKey) {
          payload.metaWhatsAppApiKey = existing.metaWhatsAppApiKey;
        }
        if (!payload.metaWhatsAppPhoneNumberId && existing.metaWhatsAppPhoneNumberId) {
          payload.metaWhatsAppPhoneNumberId = existing.metaWhatsAppPhoneNumberId;
        }
        if (!payload.metaWhatsAppVerifyToken && existing.metaWhatsAppVerifyToken) {
          payload.metaWhatsAppVerifyToken = existing.metaWhatsAppVerifyToken;
        }
        if (!payload.preferredNotificationMethod && existing.preferredNotificationMethod) {
          payload.preferredNotificationMethod = existing.preferredNotificationMethod;
        }
        if (!payload.metaTemplateBilling && existing.metaTemplateBilling) {
          payload.metaTemplateBilling = existing.metaTemplateBilling;
        }
        if (!payload.metaTemplateReceipt && existing.metaTemplateReceipt) {
          payload.metaTemplateReceipt = existing.metaTemplateReceipt;
        }
        if (!payload.metaTemplateBroadcast && existing.metaTemplateBroadcast) {
          payload.metaTemplateBroadcast = existing.metaTemplateBroadcast;
        }
        if (!payload.metaTemplateWelcome && existing.metaTemplateWelcome) {
          payload.metaTemplateWelcome = existing.metaTemplateWelcome;
        }
        if (!payload.metaTemplateOverdue && existing.metaTemplateOverdue) {
          payload.metaTemplateOverdue = existing.metaTemplateOverdue;
        }
        if (!payload.metaTemplateSuspension && existing.metaTemplateSuspension) {
          payload.metaTemplateSuspension = existing.metaTemplateSuspension;
        }
        if (!payload.metaTemplateCustom && existing.metaTemplateCustom) {
          payload.metaTemplateCustom = existing.metaTemplateCustom;
        }
        if ((!payload.metaCustomTemplates || payload.metaCustomTemplates.length === 0) && existing.metaCustomTemplates && existing.metaCustomTemplates.length > 0) {
          payload.metaCustomTemplates = existing.metaCustomTemplates;
        }
        if (!payload.appLogoImage && existing.appLogoImage) {
          payload.appLogoImage = existing.appLogoImage;
        }
        if (!payload.upiQrCodeImage && existing.upiQrCodeImage) {
          payload.upiQrCodeImage = existing.upiQrCodeImage;
        }
      }
    } catch (checkErr) {
      console.warn("Could not check existing settings document for preservation:", checkErr);
    }

    await setDoc(doc(db, 'settings', uid), payload, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `settings/${uid}`);
  }
};

export const deleteBillTemplateImage = async (explicitOwnerId?: string) => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
  try {
    await updateDoc(doc(db, 'settings', uid), {
      billTemplateImage: deleteField()
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `settings/${uid}`);
  }
};

export const saveUploadedData = async (fileName: string, data: any[], explicitOwnerId?: string) => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
  const id = `UPLOAD-${uuidv4().substring(0, 8).toUpperCase()}`;
  const upload: UploadedData = {
    id,
    fileName,
    data: JSON.stringify(data),
    uploadedAt: new Date().toISOString(),
    ownerId: uid,
  };
  try {
    await setDoc(doc(db, 'uploadedData', id), upload);
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'uploadedData');
  }
};

export const resetAllBalances = async (customers: Customer[], explicitOwnerId?: string) => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) return;
  checkQuotaBeforeWrite("Reset Balances");
  const batchLimit = 200;
  for (let i = 0; i < customers.length; i += batchLimit) {
    const chunk = customers.slice(i, i + batchLimit);
    const batch = writeBatch(db);
    for (const c of chunk) {
      const targetDocId = c.docId || `${uid}_${c.id}`;
      batch.update(doc(db, 'customers', targetDocId), { balance: 0 });
    }
    await batch.commit();
    if (i + batchLimit < customers.length) {
      await new Promise(r => setTimeout(r, 500));
    }
  }
};

export const resetDatabase = async (explicitOwnerId?: string) => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
  console.log("Starting master database reset for user:", uid);
  try {
    // 1. Delete all customers and transactions
    console.log("Deleting customers and transactions...");
    await deleteAllCustomers(uid);

    // 2. Delete uploaded data
    console.log("Deleting uploaded data history...");
    const qUpload = query(collection(db, 'uploadedData'), where('ownerId', '==', uid));
    const snapUpload = await getDocs(qUpload);
    if (!snapUpload.empty) {
      await deleteInBatches(snapUpload);
    }

    // 3. Delete settings
    console.log("Deleting user settings...");
    await deleteDoc(doc(db, 'settings', uid));
    
    console.log("Master reset completed successfully.");
  } catch (error) {
    console.error("Error in resetDatabase:", error);
    throw error; // Re-throw to be caught by the UI
  }
};

export const importCustomersFromText = async (text: string, explicitOwnerId?: string) => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
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
  const allCustQ = query(collection(db, 'customers'), where('ownerId', '==', uid));
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
      const docId = `${uid}_${id}`;
      const docRef = doc(db, 'customers', docId);
      batch.set(docRef, {
        ...custData,
        id,
        docId,
        ownerId: uid,
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

// Zero-Trust Tenant Helper for Subscriptions
function parseSubArgs<T>(
  arg1: string | ((data: T) => void),
  arg2?: ((data: T) => void) | string
): { ownerId: string | null; callback: (data: T) => void } {
  const explicitOwnerId = typeof arg1 === 'string' ? arg1 : (typeof arg2 === 'string' ? arg2 : null);
  const callback = typeof arg1 === 'function' ? arg1 : (typeof arg2 === 'function' ? arg2 : (() => {}));
  const ownerId = explicitOwnerId || auth.currentUser?.uid || null;
  return { ownerId, callback };
}

export function subscribeToBillingAuditLogs(
  arg1: string | ((logs: BillingAuditLog[]) => void),
  arg2?: ((logs: BillingAuditLog[]) => void) | string
) {
  const { ownerId, callback } = parseSubArgs<BillingAuditLog[]>(arg1, arg2);
  if (!ownerId) return () => {};
  const q = query(
    collection(db, 'billing_audit'),
    where('ownerId', '==', ownerId)
  );
  return onSnapshot(q, (snapshot) => {
    const logsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BillingAuditLog));
    logsData.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    callback(logsData);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'billing_audit');
    callback([]);
  });
}

export const deleteAuditLog = async (logId: string) => {
  try {
    await deleteDoc(doc(db, 'billing_audit', logId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `billing_audit/${logId}`);
  }
};

export const clearAllAuditLogs = async (explicitOwnerId?: string) => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
  try {
    const q = query(collection(db, 'billing_audit'), where('ownerId', '==', uid));
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

export function subscribeToCustomers(
  arg1: string | ((customers: Customer[]) => void),
  arg2?: ((customers: Customer[]) => void) | string
) {
  const { ownerId, callback } = parseSubArgs<Customer[]>(arg1, arg2);
  if (!ownerId) return () => {};
  
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

  const q = query(
    collection(db, 'customers'), 
    where('ownerId', '==', ownerId)
  );

  return onSnapshot(q, (snapshot) => {
    callback(processDocs(snapshot));
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'customers');
    callback([]);
  });
}

export function subscribeToTransactions(
  arg1: string | ((transactions: Transaction[]) => void),
  arg2?: ((transactions: Transaction[]) => void) | string
) {
  const { ownerId, callback } = parseSubArgs<Transaction[]>(arg1, arg2);
  if (!ownerId) return () => {};
  const q = query(
    collection(db, 'transactions'), 
    where('ownerId', '==', ownerId),
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
}

export function subscribeToSettings(
  arg1: string | ((settings: AppSettings | null) => void),
  arg2?: ((settings: AppSettings | null) => void) | string
) {
  const { ownerId, callback } = parseSubArgs<AppSettings | null>(arg1, arg2);
  if (!ownerId) return () => {};
  return onSnapshot(doc(db, 'settings', ownerId), (docSnap) => {
    if (docSnap.exists()) {
      const data = docSnap.data() as AppSettings;
      
      // Inject missing default custom templates config for predefined ones (so user doesn't have to manually create them instantly)
      if (!data.metaCustomTemplates || data.metaCustomTemplates.length === 0) {
        data.metaCustomTemplates = [
          { id: 'def_welcome', templateName: data.metaTemplateWelcome || 'welcome', parameters: 'customer_name, button_param' },
          { id: 'def_billing', templateName: data.metaTemplateBilling || 'payment_due_reminder', parameters: 'customer_name, billing_amount, new_balance, date, button_param' },
          { id: 'def_receipt', templateName: data.metaTemplateReceipt || 'invoice_bill', parameters: 'customer_name, payment_amount, button_param' },
          { id: 'def_overdue', templateName: data.metaTemplateOverdue || 'payment_overdue_1', parameters: 'customer_name, overdue_amount, date, button_param' },
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
        organizationName: auth.currentUser?.email === 'ksmotalkar@gmail.com' ? 'Gram Panchayat GP. Jhanda Khurd' : 'Billing Workspace',
        automation: {
          billingLifecycle: true,
          ruleBased: true,
          lateFee: true,
          scheduledBilling: true,
          bulkProcessing: true,
          smartNotifications: true
        },
        ownerId: ownerId
      });
    }
  }, (error) => {
    handleFirestoreError(error, OperationType.GET, `settings/${ownerId}`);
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
      organizationName: auth.currentUser?.email === 'ksmotalkar@gmail.com' ? 'Gram Panchayat GP. Jhanda Khurd' : 'Billing Workspace',
      automation: {
        billingLifecycle: true,
        ruleBased: true,
        lateFee: true,
        scheduledBilling: true,
        bulkProcessing: true,
        smartNotifications: true
      },
      ownerId: ownerId
    });
  });
}

export function subscribeToUploadedData(
  arg1: string | ((data: UploadedData[]) => void),
  arg2?: ((data: UploadedData[]) => void) | string
) {
  const { ownerId, callback } = parseSubArgs<UploadedData[]>(arg1, arg2);
  if (!ownerId) return () => {};
  const q = query(collection(db, 'uploadedData'), where('ownerId', '==', ownerId));
  return onSnapshot(q, (snapshot) => {
    const data = snapshot.docs.map(doc => doc.data() as UploadedData);
    callback(data);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'uploadedData');
  });
}

export function subscribeToPendingReceipts(
  arg1: string | ((receipts: any[]) => void),
  arg2?: ((receipts: any[]) => void) | string
) {
  const { ownerId, callback } = parseSubArgs<any[]>(arg1, arg2);
  if (!ownerId) return () => {};
  const q = query(
    collection(db, 'payment_receipts'), 
    where('ownerId', '==', ownerId),
    where('status', '==', 'Pending')
  );
  return onSnapshot(q, (snapshot) => {
    const items = snapshot.docs.map(doc => doc.data());
    callback(items);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'payment_receipts');
    callback([]);
  });
}

export function subscribeToComplaints(
  arg1: string | ((complaints: Complaint[]) => void),
  arg2?: ((complaints: Complaint[]) => void) | string
) {
  const { ownerId, callback } = parseSubArgs<Complaint[]>(arg1, arg2);
  if (!ownerId) return () => {};
  const q = query(
    collection(db, 'complaints'), 
    where('ownerId', '==', ownerId),
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
}

export const addReport = async (
  report: Omit<Report, 'id' | 'ownerId' | 'createdAt'>,
  explicitOwnerId?: string
): Promise<Report> => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
  const newReport: Report = {
    ...report,
    id: `REP-${uuidv4().substring(0, 8).toUpperCase()}`,
    createdAt: new Date().toISOString(),
    ownerId: uid,
  };
  try {
    await setDoc(doc(db, 'reports', newReport.id), newReport);
    return newReport;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, 'reports');
    throw error;
  }
};

export const addReportFolder = async (name: string, explicitOwnerId?: string): Promise<ReportFolder> => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
  const newFolder: ReportFolder = {
    id: `FLD-${uuidv4().substring(0, 8).toUpperCase()}`,
    name,
    ownerId: uid,
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

export const deleteReportFolder = async (id: string, explicitOwnerId?: string): Promise<void> => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
  try {
    await deleteDoc(doc(db, 'reportFolders', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `reportFolders/${id}`);
    throw error;
  }
};

export function subscribeToReportFolders(
  arg1: string | ((folders: ReportFolder[]) => void),
  arg2?: ((folders: ReportFolder[]) => void) | string
) {
  const { ownerId, callback } = parseSubArgs<ReportFolder[]>(arg1, arg2);
  if (!ownerId) return () => {};
  const q = query(
    collection(db, 'reportFolders'), 
    where('ownerId', '==', ownerId)
  );
  return onSnapshot(q, (snapshot) => {
    const folders = snapshot.docs.map(doc => doc.data() as ReportFolder);
    callback(folders);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'reportFolders');
    callback([]);
  });
}

export function subscribeToReports(
  arg1: string | ((reports: Report[]) => void),
  arg2?: ((reports: Report[]) => void) | string
) {
  const { ownerId, callback } = parseSubArgs<Report[]>(arg1, arg2);
  if (!ownerId) return () => {};
  const q = query(
    collection(db, 'reports'), 
    where('ownerId', '==', ownerId)
  );
  return onSnapshot(q, (snapshot) => {
    const reports = snapshot.docs.map(doc => doc.data() as Report);
    callback(reports);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'reports');
    callback([]);
  });
}

export const updateReceiptStatus = async (id: string, status: 'Approved' | 'Rejected', explicitOwnerId?: string) => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) return;
  try {
    await updateDoc(doc(db, 'payment_receipts', id), { status });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `payment_receipts/${id}`);
  }
};

export const resolveComplaint = async (id: string, notify: boolean = false, explicitOwnerId?: string) => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) return;
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
            ownerId: uid,
            customerId: data.customerId
          })
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `complaints/${id}`);
  }
};

export const updateComplaint = async (id: string, updates: Partial<Complaint>, explicitOwnerId?: string) => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) return;
  try {
    await updateDoc(doc(db, 'complaints', id), updates);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `complaints/${id}`);
  }
};

export const deleteReport = async (id: string, explicitOwnerId?: string) => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
  try {
    await deleteDoc(doc(db, 'reports', id));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `reports/${id}`);
  }
};

export const deleteComplaint = async (complaintId: string, explicitOwnerId?: string) => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
  try {
    const complaintRef = doc(db, 'complaints', complaintId);
    await deleteDoc(complaintRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `complaints/${complaintId}`);
  }
};

export const archiveComplaint = async (complaintId: string, explicitOwnerId?: string) => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
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

export const getChatbotSettings = async (explicitOwnerId?: string): Promise<ChatbotSettings | null> => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) return null;
  try {
    const docSnap = await getDoc(doc(db, 'chatbotSettings', uid));
    if (docSnap.exists()) {
      return docSnap.data() as ChatbotSettings;
    }
    return null;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `chatbotSettings/${uid}`);
    return null;
  }
};

export const saveChatbotSettings = async (settings: ChatbotSettings, explicitOwnerId?: string) => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
  try {
    const docRef = doc(db, 'chatbotSettings', uid);
    await setDoc(docRef, { ...settings, ownerId: uid }, { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `chatbotSettings/${uid}`);
  }
};

export function subscribeToWhatsappMessages(
  arg1: string | ((msgs: WhatsappMessage[]) => void),
  arg2?: ((msgs: WhatsappMessage[]) => void) | string
) {
  const { ownerId, callback } = parseSubArgs<WhatsappMessage[]>(arg1, arg2);
  if (!ownerId) return () => {};
  const q = query(
    collection(db, 'whatsapp_messages'), 
    where('ownerId', '==', ownerId),
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
}

export const addWhatsappMessageRecord = async (
  msg: Omit<WhatsappMessage, 'id' | 'ownerId'>,
  explicitOwnerId?: string
) => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) return;
  try {
    const docRef = doc(collection(db, 'whatsapp_messages'));
    const fullMsg: WhatsappMessage = {
      ...msg,
      id: docRef.id,
      ownerId: uid,
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

export const logAutomationError = async (
  errorInfo: Omit<AutomationError, 'id' | 'timestamp' | 'resolved' | 'ownerId'>,
  explicitOwnerId?: string
) => {
  // Use simple logs method to prevent DB writes
  const msg = `[AutomationError] Type: ${errorInfo.type}, Customer: ${errorInfo.customerName} (${errorInfo.customerId}) - ${errorInfo.errorMessage}`;
  console.error(msg);
};

export function subscribeToAutomationErrors(
  arg1: string | ((errors: AutomationError[]) => void),
  arg2?: ((errors: AutomationError[]) => void) | string
) {
  const { ownerId, callback } = parseSubArgs<AutomationError[]>(arg1, arg2);
  if (!ownerId) return () => {};

  const q = query(
    collection(db, 'automation_errors'),
    where('ownerId', '==', ownerId)
  );

  return onSnapshot(q, (snapshot) => {
    const errorsList = snapshot.docs.map(d => d.data() as AutomationError);
    errorsList.sort((a,b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    callback(errorsList);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'automation_errors');
    callback([]);
  });
}

export const resolveAutomationError = async (id: string, notify: boolean = false, explicitOwnerId?: string) => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) return;
  try {
    await updateDoc(doc(db, 'automation_errors', id), { resolved: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'automation_errors');
  }
};
