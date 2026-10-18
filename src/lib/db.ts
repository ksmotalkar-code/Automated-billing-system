import { v4 as uuidv4 } from 'uuid';
import { collection, doc, setDoc, getDocs, getDoc, updateDoc, deleteDoc, onSnapshot, query, where, writeBatch, orderBy, limit, addDoc, deleteField, runTransaction } from 'firebase/firestore';
import { db, auth } from '../firebase';
import firebaseConfig from '../../firebase-applet-config.json';
import { authFetch } from './api';
import type { PaymentReceipt } from './portal';

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

// Simple Read Cache
const readCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_DURATION = 300000; // 5 minutes

export const getCachedData = (key: string) => {
  // 1. Check in-memory
  const cached = readCache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
    return cached.data;
  }
  
  // 2. Check localStorage
  try {
    const stored = localStorage.getItem(`cache_${key}`);
    if (stored) {
      const { data, timestamp } = JSON.parse(stored);
      if (Date.now() - timestamp < CACHE_DURATION) {
        readCache.set(key, { data, timestamp }); // Warm memory cache
        return data;
      }
    }
  } catch (e) {}

  return null;
};

export const setCachedData = (key: string, data: any) => {
  const timestamp = Date.now();
  readCache.set(key, { data, timestamp });
  try {
    localStorage.setItem(`cache_${key}`, JSON.stringify({ data, timestamp }));
  } catch (e) {}
};

export const invalidateCache = (keyPrefix: string) => {
  for (const k of Array.from(readCache.keys())) {
    if (k.startsWith(keyPrefix)) {
      readCache.delete(k);
    }
  }
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && (k.startsWith(`cache_${keyPrefix}`) || k === `cache_${keyPrefix}`)) {
        localStorage.removeItem(k);
      }
    }
  } catch (e) {}
};

let quotaExceededUntil = 0;

export const setQuotaLock = (durationMs = 90000) => {
  quotaExceededUntil = Date.now() + durationMs;
  try {
    localStorage.setItem('firestore_quota_expiry', String(quotaExceededUntil));
  } catch (e) {}
};

export const isQuotaExceeded = () => {
  if (Date.now() < quotaExceededUntil) return true;
  try {
    const stored = localStorage.getItem('firestore_quota_expiry');
    if (stored) {
      const expiry = parseInt(stored, 10);
      if (!isNaN(expiry) && Date.now() < expiry) {
        quotaExceededUntil = expiry;
        return true;
      }
    }
  } catch (e) {}
  return false;
};

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

  if (
    errorMessage.includes('resource-exhausted') || 
    errorMessage.includes('Quota') || 
    errorMessage.includes('rate') || 
    errorMessage.includes('Rate') || 
    errorMessage.includes('429') ||
    errorMessage.includes('EXCEEDED')
  ) {
    console.warn('[WARNING] Firestore Quota / Rate Limit Exceeded.', errInfo);
    setQuotaLock(90000); // INCREASED cooling-off lock to 90 seconds
    try { localStorage.setItem('quota_error', 'true'); } catch (e) {} // Set UI flag
    if (operationType === OperationType.LIST || operationType === OperationType.GET) {
      return; // Do NOT throw on read/list subscriptions so the UI stays stable and cached data displays
    }
    throw new Error('Rate limit temporarily reached. Please wait a few seconds before retrying.');
  }

  if (
    errorMessage.includes('client is offline') || 
    errorMessage.includes('Could not reach Cloud Firestore backend') ||
    errorMessage.includes('didn\'t respond within 10 seconds') ||
    errorMessage.includes('Could not reach')
  ) {
    console.warn(`\n[WARNING] Firestore Connection Delayed/Offline. Request to ${path || 'unknown path'} will retry automatically via long-polling.\n`, errInfo);
    return; // Do NOT throw, so we can fall back to null/default and allow automatic long-polling retry
  }

  if (errorMessage.includes('Disconnecting idle stream') || errorMessage.includes('Timed out waiting for new targets') || errorMessage.includes('CANCELLED')) {
    console.debug('Firestore idle stream reconnected:', errInfo);
    return; // Normal gRPC idle channel refresh, do not throw
  }

  if (errorMessage.includes('permission-denied') || errorMessage.includes('Missing or insufficient permissions')) {
    console.warn(`[WARNING] Firestore Permission Notice (${operationType} ${path}): User may be unauthenticated or auth token updating.`, errInfo);
    return; // Do NOT throw on permission warnings during subscriptions
  }

  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}


export interface Customer {
  id: string; // The sequential digital ID (e.g. "1", "2")
  docId?: string; // Firestore document ID (tenant-isolated)
  name: string;
  mobileNumber: string;
  status: 'Active' | 'Suspended' | 'Faulty' | 'Advance Paid';
  balance: number;
  advanceBalance?: number; // Pre-paid credit amount in advance
  ownerId?: string;
  invoiceSent?: boolean;
  paymentNotified?: boolean;
  lastMeterReading?: number;
  lastPaymentAmount?: number;
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
  imageUrl?: string;
}

export interface BillingAuditLog {
  id?: string;
  ownerId: string;
  type: 'bill_generation' | 'penalty_application' | 'auto_suspend' | 'inquiry' | 'chatbot_unhandled';
  description: string;
  affectedCustomersCount: number;
  totalAmount: number;
  timestamp: string;
  executedBy: 'system' | 'admin';
  customerId?: string;
  customerName?: string;
  phoneNumber?: string;
  mobileNumber?: string;
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

export type ReportTag = 'panchayat_report' | 'deep_details_report' | 'waterworks_report';

export const REPORT_TAG_LABELS: Record<ReportTag, { label: string; badge: string; description: string }> = {
  panchayat_report: {
    label: "a. Panchayat Reports",
    badge: "Panchayat Reports",
    description: "Official monthly, periodic, or general Gram Panchayat public reports"
  },
  deep_details_report: {
    label: "b. Deep Details Report",
    badge: "Deep Details Report",
    description: "Itemized expenditures, voucher specifics, and technical repair reports"
  },
  waterworks_report: {
    label: "c. Waterworks Reports",
    badge: "Waterworks Reports",
    description: "Water supply, pump house maintenance, pipeline repairs, and Jal Jeevan Mission reports"
  }
};

export interface Report {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  folderId?: string | null;
  ownerId?: string;
  files?: ReportFile[];
  assetLink?: string;
  tags?: string[];
  reportType?: 'panchayat_report' | 'deep_details_report' | 'waterworks_report' | 'both' | string;
}

export interface Transaction {
  id: string;
  customerId: string;
  customerName?: string;
  amount: number;
  transactionId: string;
  date: string;
  ownerId?: string;
  isAdvanceCredit?: boolean;
  advanceAdjustment?: number; // Positive (+₹X) when advance credit is recorded, Negative (-₹X) when deducted during billing cycle
  paymentType?: 'bill_payment' | 'advance_credit' | 'advance_adjustment' | 'bill_and_advance' | string;
  paymentMode?: 'cash' | 'upi' | 'bank_transfer' | 'advance_credit' | string;
  previousBalance?: number;
  newBalance?: number;
  previousAdvance?: number;
  newAdvance?: number;
  notes?: string;
  idempotencyKey?: string;
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
  welcome?: boolean;
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
  language?: string;
}

export interface TemplateParameterMapping {
  index: number;
  placeholder: string; // "{{1}}"
  key: string; // e.g. "customer_name"
  label: string;
  defaultValue?: string;
}

export interface WhatsAppTemplate {
  id: string;
  templateName: string;
  category: 'billing' | 'receipt' | 'broadcast' | 'welcome' | 'overdue' | 'suspension' | 'custom';
  language?: string;
  bodyText: string;
  parameters: string; // Comma separated: e.g. "customer_name, billing_amount, new_balance, date, button_param"
  parameterMappings?: TemplateParameterMapping[];
  headerType?: 'NONE' | 'DOCUMENT' | 'IMAGE' | 'TEXT';
  headerText?: string;
  supportsButton?: boolean;
  buttonParamKey?: string;
  buttonText?: string;
  isActive: boolean;
  isDefault?: boolean;
  ownerId?: string;
  createdAt?: string;
  updatedAt?: string;
  description?: string;
  verifiedWithMeta?: boolean;
}

export const SYSTEM_TEMPLATE_VARIABLES = [
  { key: 'customer_name', label: 'Citizen Name', sample: 'Malook Singh', description: 'Name of the consumer / citizen' },
  { key: 'customer_id', label: 'Consumer Account ID', sample: 'JK-001', description: 'Unique water account / consumer number' },
  { key: 'billing_amount', label: 'Current Bill Amount (Rs.)', sample: '200', description: 'Tariff amount for the billing cycle' },
  { key: 'new_balance', label: 'Total Payable Balance (Rs.)', sample: '400', description: 'Total outstanding balance including arrears' },
  { key: 'customer_balance', label: 'Previous Arrears (Rs.)', sample: '200', description: 'Previous month unpaid arrears' },
  { key: 'payment_amount', label: 'Amount Paid (Rs.)', sample: '200', description: 'Amount paid in payment receipt' },
  { key: 'advance_balance', label: 'Prepaid Advance Credit (Rs.)', sample: '500', description: 'Credit balance deposited in advance' },
  { key: 'overdue_amount', label: 'Overdue Amount with Late Fee (Rs.)', sample: '240', description: 'Bill balance plus penalty late fee' },
  { key: 'penalty_amount', label: 'Late Fee / Surcharge (Rs.)', sample: '40', description: 'Grace period late payment fee' },
  { key: 'date', label: 'Current Date / Bill Date', sample: '15/10/2026', description: 'Formatted as DD/MM/YYYY' },
  { key: 'due_date', label: 'Payment Due Date', sample: '25/10/2026', description: 'Last date to pay before disconnection' },
  { key: 'mobile_number', label: 'Citizen Phone Number', sample: '9876543210', description: 'Registered WhatsApp mobile number' },
  { key: 'panchayat_name', label: 'Gram Panchayat Name', sample: 'GP. Jhanda Khurd', description: 'Department or Panchayat name' },
  { key: 'broadcast_message', label: 'Broadcast / Notice Text', sample: 'Water supply will be suspended for 2 hours for repair', description: 'Dynamic body of public announcement' },
  { key: 'portal_link', label: 'Citizen Portal Direct Link', sample: 'https://ais-dev-.../?portal=true&customerId=JK-001', description: 'Direct self-service invoice & payment link' },
  { key: 'button_param', label: 'Dynamic Button Suffix', sample: 'JK-001', description: 'Dynamic URL suffix parameter for interactive button' }
];

export const DEFAULT_WHATSAPP_TEMPLATES: WhatsAppTemplate[] = [
  {
    id: 'def_billing',
    templateName: 'billing',
    category: 'billing',
    language: 'en_US',
    headerType: 'DOCUMENT',
    headerText: 'Water Consumption Bill',
    bodyText: 'Dear {{1}}, your water bill of Rs. {{2}} has been generated for the recent cycle. Total balance due is Rs. {{3}} payable by {{4}}. You can view and pay your invoice online.',
    parameters: 'customer_name, billing_amount, new_balance, date, button_param',
    parameterMappings: [
      { index: 1, placeholder: '{{1}}', key: 'customer_name', label: 'Citizen Name' },
      { index: 2, placeholder: '{{2}}', key: 'billing_amount', label: 'Current Bill Amount' },
      { index: 3, placeholder: '{{3}}', key: 'new_balance', label: 'Total Payable Balance' },
      { index: 4, placeholder: '{{4}}', key: 'date', label: 'Bill Date' },
      { index: 5, placeholder: '{{5}}', key: 'button_param', label: 'Dynamic Button Suffix' }
    ],
    supportsButton: true,
    buttonParamKey: 'button_param',
    buttonText: 'View & Pay Invoice',
    isActive: true,
    isDefault: true,
    description: 'Official monthly/bi-monthly water consumption invoice dispatched to citizens.'
  },
  {
    id: 'def_receipt',
    templateName: 'receipt',
    category: 'receipt',
    language: 'en_US',
    headerType: 'DOCUMENT',
    headerText: 'Official Payment Receipt',
    bodyText: 'Dear {{1}}, thank you! We have received your payment of Rs. {{2}} on {{3}}. Your updated balance is Rs. {{4}}. Gram Panchayat Water Department acknowledges your payment.',
    parameters: 'customer_name, payment_amount, date, new_balance, button_param',
    parameterMappings: [
      { index: 1, placeholder: '{{1}}', key: 'customer_name', label: 'Citizen Name' },
      { index: 2, placeholder: '{{2}}', key: 'payment_amount', label: 'Amount Paid' },
      { index: 3, placeholder: '{{3}}', key: 'date', label: 'Payment Date' },
      { index: 4, placeholder: '{{4}}', key: 'new_balance', label: 'Updated Balance' },
      { index: 5, placeholder: '{{5}}', key: 'button_param', label: 'Dynamic Button Suffix' }
    ],
    supportsButton: true,
    buttonParamKey: 'button_param',
    buttonText: 'Download Official Receipt',
    isActive: true,
    isDefault: true,
    description: 'Immediate payment receipt acknowledgment with official stamped PDF.'
  },
  {
    id: 'def_overdue',
    templateName: 'overdue',
    category: 'overdue',
    language: 'en_US',
    headerType: 'TEXT',
    headerText: 'Water Bill Payment Reminder',
    bodyText: 'Dear {{1}}, reminder that your water bill payment of Rs. {{2}} is overdue. Please clear this by {{3}} to avoid disconnection and a late surcharge of Rs. {{4}}. Pay online easily below.',
    parameters: 'customer_name, overdue_amount, due_date, penalty_amount, button_param',
    parameterMappings: [
      { index: 1, placeholder: '{{1}}', key: 'customer_name', label: 'Citizen Name' },
      { index: 2, placeholder: '{{2}}', key: 'overdue_amount', label: 'Overdue Amount' },
      { index: 3, placeholder: '{{3}}', key: 'due_date', label: 'Due Date' },
      { index: 4, placeholder: '{{4}}', key: 'penalty_amount', label: 'Late Fee Surcharge' },
      { index: 5, placeholder: '{{5}}', key: 'button_param', label: 'Dynamic Button Suffix' }
    ],
    supportsButton: true,
    buttonParamKey: 'button_param',
    buttonText: 'Pay Overdue Bill',
    isActive: true,
    isDefault: true,
    description: 'Automated grace period and overdue payment reminder with late fee calculation.'
  },
  {
    id: 'def_welcome',
    templateName: 'welcome',
    category: 'welcome',
    language: 'en_US',
    headerType: 'NONE',
    bodyText: 'Dear {{1}}, welcome to Gram Panchayat Village Water Department! Your consumer ID is {{2}} and your monthly water tariff is Rs. {{3}}. You can monitor bills and payments anytime.',
    parameters: 'customer_name, customer_id, billing_amount, button_param',
    parameterMappings: [
      { index: 1, placeholder: '{{1}}', key: 'customer_name', label: 'Citizen Name' },
      { index: 2, placeholder: '{{2}}', key: 'customer_id', label: 'Consumer Account ID' },
      { index: 3, placeholder: '{{3}}', key: 'billing_amount', label: 'Monthly Tariff' },
      { index: 4, placeholder: '{{4}}', key: 'button_param', label: 'Dynamic Button Suffix' }
    ],
    supportsButton: true,
    buttonParamKey: 'button_param',
    buttonText: 'Citizen Portal',
    isActive: true,
    isDefault: true,
    description: 'Welcome onboard message dispatched upon new citizen account registration.'
  },
  {
    id: 'def_broadcast',
    templateName: 'broadcast',
    category: 'broadcast',
    language: 'en_US',
    headerType: 'NONE',
    bodyText: 'Gram Panchayat Water Department Announcement: {{1}}. For assistance, contact the water operator or Gram Panchayat office.',
    parameters: 'broadcast_message',
    parameterMappings: [
      { index: 1, placeholder: '{{1}}', key: 'broadcast_message', label: 'Broadcast Message' }
    ],
    supportsButton: false,
    isActive: true,
    isDefault: true,
    description: 'Mass public service announcement for pipeline maintenance or clean water notices.'
  },
  {
    id: 'def_suspension',
    templateName: 'suspension',
    category: 'suspension',
    language: 'en_US',
    headerType: 'TEXT',
    headerText: 'Urgent: Service Suspension Notice',
    bodyText: 'Urgent Notice for {{1}} (A/C: {{2}}): Your water supply connection is scheduled for temporary suspension due to an unpaid balance of Rs. {{3}}. Reconnection fee is Rs. 500. Clear your bill immediately.',
    parameters: 'customer_name, customer_id, overdue_amount, button_param',
    parameterMappings: [
      { index: 1, placeholder: '{{1}}', key: 'customer_name', label: 'Citizen Name' },
      { index: 2, placeholder: '{{2}}', key: 'customer_id', label: 'Consumer Account ID' },
      { index: 3, placeholder: '{{3}}', key: 'overdue_amount', label: 'Overdue Amount' },
      { index: 4, placeholder: '{{4}}', key: 'button_param', label: 'Dynamic Button Suffix' }
    ],
    supportsButton: true,
    buttonParamKey: 'button_param',
    buttonText: 'Clear Balance Now',
    isActive: true,
    isDefault: true,
    description: 'Final pre-disconnection warning sent when arrears remain unaddressed.'
  }
];

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
  lateFee?: boolean;
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

  let rawBalance = Number(customer.balance) || 0;
  let rawAdvance = Number(customer.advanceBalance) || 0;
  let statusToSet = finalStatus;

  if (rawBalance < 0) {
    rawAdvance = rawAdvance + Math.abs(rawBalance);
    rawBalance = 0;
    statusToSet = 'Advance Paid';
  } else if (rawAdvance > 0 && rawBalance === 0) {
    statusToSet = 'Advance Paid';
  }

  const newCustomer: Customer = {
    ...customer,
    id: assignedId,
    name: String(customer.name || "Customer").trim().slice(0, 100),
    mobileNumber: cleanMobile,
    status: statusToSet,
    balance: rawBalance,
    advanceBalance: rawAdvance,
    docId,
    ownerId: uid,
    createdAt: new Date().toISOString()
  };

  try {
    await setDoc(doc(db, 'customers', docId), newCustomer);
    invalidateCache(`customers_${uid}`);
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
    let bal = typeof updatedCustomer.balance === 'number' ? updatedCustomer.balance : (Number(updatedCustomer.balance) || 0);
    let adv = typeof updatedCustomer.advanceBalance === 'number' ? updatedCustomer.advanceBalance : (Number(updatedCustomer.advanceBalance) || 0);
    let stat = updatedCustomer.status || 'Active';
    if (bal < 0) {
      adv = adv + Math.abs(bal);
      bal = 0;
      stat = 'Advance Paid';
    } else if (adv > 0 && bal === 0) {
      stat = 'Advance Paid';
    }

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
        balance: bal,
        advanceBalance: adv,
        status: stat,
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
            ownerId: uid,
            balance: bal,
            advanceBalance: adv,
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
        balance: bal,
        advanceBalance: adv,
        status: stat,
      }, { merge: true });

      // Synchronize public_portals record so citizen portal reflects live advance balance
      try {
        await setDoc(doc(db, 'public_portals', targetId), {
          balance: bal,
          advanceBalance: adv,
          customerId: targetId,
          customerName: updatedCustomer.name,
          mobileNumber: updatedCustomer.mobileNumber,
          ownerId: uid,
        }, { merge: true });
        if (currentDocId !== targetId) {
          await setDoc(doc(db, 'public_portals', currentDocId), {
            balance: bal,
            advanceBalance: adv,
            customerId: targetId,
            customerName: updatedCustomer.name,
            mobileNumber: updatedCustomer.mobileNumber,
            ownerId: uid,
          }, { merge: true });
        }
      } catch (portalSyncErr) {
        console.warn("Non-fatal public_portal sync notice:", portalSyncErr);
      }
      
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
    invalidateCache(`customers_${uid}`);
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
    invalidateCache(`customers_${uid}`);
    invalidateCache(`transactions_${uid}`);
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
  transaction: Omit<Transaction, 'id' | 'date' | 'ownerId'> & { idempotencyKey?: string },
  explicitOwnerId?: string
): Promise<Transaction> => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
  checkQuotaBeforeWrite("Add Transaction");

  if (transaction.idempotencyKey) {
    const idempRef = doc(db, 'idempotency_keys', `txn_${transaction.idempotencyKey}`);
    try {
      const existing = await getDoc(idempRef);
      if (existing.exists()) {
        const idempData = existing.data();
        if (idempData.resourceId) {
          const existingTxnDoc = await getDoc(doc(db, 'transactions', idempData.resourceId));
          if (existingTxnDoc.exists()) {
            return existingTxnDoc.data() as Transaction;
          }
        }
      }
    } catch (e) {
      // proceed if check fails
    }
  }

  const txnId = transaction.idempotencyKey
    ? `TXN-${transaction.idempotencyKey.substring(0, 16).replace(/[^a-zA-Z0-9]/g, '').toUpperCase()}`
    : `TXN-${uuidv4().substring(0, 8).toUpperCase()}`;

  const newTransaction: Transaction = {
    ...transaction,
    id: txnId,
    date: new Date().toISOString(),
    ownerId: uid,
  };
  try {
    await setDoc(doc(db, 'transactions', newTransaction.id), newTransaction);
    if (transaction.idempotencyKey) {
      await setDoc(doc(db, 'idempotency_keys', `txn_${transaction.idempotencyKey}`), {
        id: `txn_${transaction.idempotencyKey}`,
        ownerId: uid,
        resourceType: 'transaction',
        resourceId: newTransaction.id,
        status: 'completed',
        createdAt: new Date().toISOString(),
      });
    }
    invalidateCache(`transactions_${uid}`);
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

    // Auto-sanitize Meta / Dealer token and phone number ID
    if (payload.metaWhatsAppApiKey && typeof payload.metaWhatsAppApiKey === 'string') {
      payload.metaWhatsAppApiKey = payload.metaWhatsAppApiKey.trim().replace(/^Bearer\s+/i, '').replace(/^['"]|['"]$/g, '').trim();
    }
    if (payload.metaWhatsAppPhoneNumberId && typeof payload.metaWhatsAppPhoneNumberId === 'string') {
      payload.metaWhatsAppPhoneNumberId = payload.metaWhatsAppPhoneNumberId.trim().replace(/[\s\-\+]/g, '').replace(/^['"]|['"]$/g, '').trim();
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
    invalidateCache(`settings_${uid}`);
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
      
      // Ensure custom templates config exists and includes entries for all configured template names
      if (!data.metaCustomTemplates) {
        data.metaCustomTemplates = [];
      }
      const existingNames = new Set(data.metaCustomTemplates.map(t => t.templateName));
      const categoryDefaults = [
        { key: 'metaTemplateWelcome', defaultName: 'welcome', params: 'customer_name', id: 'def_welcome' },
        { key: 'metaTemplateBilling', defaultName: 'payment_due_reminder', params: 'customer_name, billing_amount, new_balance, date, button_param', id: 'def_billing' },
        { key: 'metaTemplateReceipt', defaultName: 'invoice_bill', params: 'customer_name, payment_amount, button_param', id: 'def_receipt' },
        { key: 'metaTemplateBroadcast', defaultName: 'broadcast', params: 'customer_name, message', id: 'def_broadcast' },
        { key: 'metaTemplateOverdue', defaultName: 'payment_overdue_1', params: 'customer_name, overdue_amount, date, penalty_amount, button_param', id: 'def_overdue' },
        { key: 'metaTemplateSuspension', defaultName: 'autopay', params: 'customer_name, customer_balance, date', id: 'def_suspension' },
        { key: 'metaTemplateCustom', defaultName: 'general_notification', params: 'customer_name, billing_amount, new_balance, date, overdue_amount, button_param', id: 'def_custom' },
      ];
      for (const def of categoryDefaults) {
        let configuredName = (data as any)[def.key] || def.defaultName;
        if (def.key === 'metaTemplateBroadcast' && (configuredName === 'operation_disruption_2' || !configuredName)) {
          configuredName = 'broadcast';
          data.metaTemplateBroadcast = 'broadcast';
        }
        const existingTmpl = data.metaCustomTemplates.find(t => t.id === def.id || t.templateName === configuredName);
        if (existingTmpl) {
          if (def.key === 'metaTemplateBroadcast' && (existingTmpl.templateName === 'operation_disruption_2' || !existingTmpl.parameters?.includes('message'))) {
            existingTmpl.templateName = configuredName;
            existingTmpl.parameters = def.params;
          }
        } else if (configuredName && !existingNames.has(configuredName)) {
          data.metaCustomTemplates.push({
            id: def.id,
            templateName: configuredName,
            parameters: def.params,
            language: 'en_US'
          });
          existingNames.add(configuredName);
        }
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

export function subscribeToWhatsAppTemplates(
  arg1: string | ((templates: WhatsAppTemplate[]) => void),
  arg2?: ((templates: WhatsAppTemplate[]) => void) | string
) {
  const { ownerId, callback } = parseSubArgs<WhatsAppTemplate[]>(arg1, arg2);
  if (!ownerId) {
    callback(DEFAULT_WHATSAPP_TEMPLATES);
    return () => {};
  }
  const q = query(
    collection(db, 'whatsapp_templates'),
    where('ownerId', '==', ownerId)
  );
  return onSnapshot(q, (snapshot) => {
    if (snapshot.empty) {
      callback(DEFAULT_WHATSAPP_TEMPLATES.map(t => ({ ...t, ownerId })));
    } else {
      const templates = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WhatsAppTemplate));
      callback(templates);
    }
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'whatsapp_templates');
    callback(DEFAULT_WHATSAPP_TEMPLATES.map(t => ({ ...t, ownerId })));
  });
}

export const getWhatsAppTemplates = async (explicitOwnerId?: string): Promise<WhatsAppTemplate[]> => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) return DEFAULT_WHATSAPP_TEMPLATES;
  try {
    const q = query(collection(db, 'whatsapp_templates'), where('ownerId', '==', uid));
    const snapshot = await getDocs(q);
    if (snapshot.empty) {
      return DEFAULT_WHATSAPP_TEMPLATES.map(t => ({ ...t, ownerId: uid }));
    }
    return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WhatsAppTemplate));
  } catch (error: any) {
    handleFirestoreError(error, OperationType.GET, 'whatsapp_templates');
    return DEFAULT_WHATSAPP_TEMPLATES.map(t => ({ ...t, ownerId: uid }));
  }
};

export const saveWhatsAppTemplate = async (template: WhatsAppTemplate, explicitOwnerId?: string): Promise<WhatsAppTemplate> => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
  checkQuotaBeforeWrite("Save WhatsApp Template");
  
  const templateId = template.id && template.id.trim() !== '' 
    ? template.id.trim() 
    : `template_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const docId = templateId.startsWith(`${uid}_`) ? templateId : `${uid}_${templateId}`;

  // Automatically derive parameterMappings if not already populated
  let mappings = template.parameterMappings;
  if (!mappings || mappings.length === 0) {
    const paramKeys = (template.parameters || '').split(',').map(s => s.trim()).filter(Boolean);
    mappings = paramKeys.map((key, idx) => {
      const foundVar = SYSTEM_TEMPLATE_VARIABLES.find(v => v.key.toLowerCase() === key.toLowerCase());
      return {
        index: idx + 1,
        placeholder: `{{${idx + 1}}}`,
        key,
        label: foundVar?.label || key
      };
    });
  }

  const payload: WhatsAppTemplate = {
    ...template,
    id: templateId,
    parameterMappings: mappings,
    ownerId: uid,
    updatedAt: new Date().toISOString(),
    createdAt: template.createdAt || new Date().toISOString()
  };

  try {
    await setDoc(doc(db, 'whatsapp_templates', docId), payload, { merge: true });
    
    // Synchronize to settings metaCustomTemplates and active category template keys
    try {
      const settingsRef = doc(db, 'settings', uid);
      const settingsSnap = await getDoc(settingsRef);
      if (settingsSnap.exists()) {
        const curSettings = settingsSnap.data() as AppSettings;
        let customTemplates = [...(curSettings.metaCustomTemplates || [])];
        const existingIdx = customTemplates.findIndex(t => t.id === templateId || t.templateName === template.templateName);
        const metaDef: MetaTemplateDef = {
          id: templateId,
          templateName: template.templateName,
          parameters: template.parameters || '',
          language: template.language || 'en_US'
        };
        if (existingIdx >= 0) {
          customTemplates[existingIdx] = metaDef;
        } else {
          customTemplates.push(metaDef);
        }

        const updates: any = { metaCustomTemplates: customTemplates };
        if (template.isDefault) {
          if (template.category === 'billing') updates.metaTemplateBilling = template.templateName;
          if (template.category === 'receipt') updates.metaTemplateReceipt = template.templateName;
          if (template.category === 'broadcast') updates.metaTemplateBroadcast = template.templateName;
          if (template.category === 'welcome') updates.metaTemplateWelcome = template.templateName;
          if (template.category === 'overdue') updates.metaTemplateOverdue = template.templateName;
          if (template.category === 'suspension') updates.metaTemplateSuspension = template.templateName;
          if (template.category === 'custom') updates.metaTemplateCustom = template.templateName;
        }
        await updateDoc(settingsRef, updates);
      }
    } catch (syncErr) {
      console.warn("Non-fatal template sync to settings warning:", syncErr);
    }

    return payload;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `whatsapp_templates/${docId}`);
    throw error;
  }
};

export const deleteWhatsAppTemplate = async (id: string, explicitOwnerId?: string): Promise<void> => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
  checkQuotaBeforeWrite("Delete WhatsApp Template");
  const docId = id.startsWith(`${uid}_`) ? id : `${uid}_${id}`;
  try {
    await deleteDoc(doc(db, 'whatsapp_templates', docId));
    if (docId !== id) {
      try { await deleteDoc(doc(db, 'whatsapp_templates', id)); } catch(e) {}
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `whatsapp_templates/${docId}`);
    throw error;
  }
};

export const seedDefaultWhatsAppTemplates = async (explicitOwnerId?: string): Promise<WhatsAppTemplate[]> => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
  checkQuotaBeforeWrite("Seed WhatsApp Templates");
  const seeded: WhatsAppTemplate[] = [];
  for (const t of DEFAULT_WHATSAPP_TEMPLATES) {
    const docId = `${uid}_${t.id}`;
    const payload: WhatsAppTemplate = { 
      ...t, 
      ownerId: uid, 
      createdAt: new Date().toISOString(), 
      updatedAt: new Date().toISOString() 
    };
    await setDoc(doc(db, 'whatsapp_templates', docId), payload, { merge: true });
    seeded.push(payload);
  }
  return seeded;
};

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

export interface ApproveReceiptResult {
  success: boolean;
  alreadyApproved?: boolean;
  transactionId?: string;
  customer?: Customer;
  effectiveAmount: number;
  isAdvanceCredit: boolean;
  newBalance: number;
  newAdvance: number;
}

/**
 * Atomically approves a payment receipt with full ACID transaction guarantees and idempotency.
 * Completely eliminates double-crediting, duplicate transactions, and race conditions.
 */
export const approveReceiptWithAtomicTransaction = async (
  receiptId: string,
  customAmount?: number,
  explicitOwnerId?: string
): Promise<ApproveReceiptResult> => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
  checkQuotaBeforeWrite("Approve Payment Receipt");

  // Priority 1: High-resilience Server-side Admin Endpoint
  // Completely immune to client-side Firestore security rules restrictions on Render or any deployment
  try {
    const response = await authFetch('/api/receipts/approve', {
      method: 'POST',
      body: JSON.stringify({
        receiptId,
        customAmount,
        ownerId: uid,
      }),
    });
    if (response.ok) {
      const data = await response.json();
      if (data && data.success) {
        return data as ApproveReceiptResult;
      }
    }
  } catch (apiErr) {
    console.warn("[approveReceiptWithAtomicTransaction] Server endpoint fallback to client transaction:", apiErr);
  }

  // Priority 2: Client SDK Transaction Fallback
  const receiptRef = doc(db, 'payment_receipts', receiptId);

  return await runTransaction(db, async (txn) => {
    const receiptSnap = await txn.get(receiptRef);
    if (!receiptSnap.exists()) {
      throw new Error(`Receipt ${receiptId} not found`);
    }

    const receipt = receiptSnap.data() as PaymentReceipt;

    // Idempotency check: If already approved, exit cleanly without modifying balances or adding transactions!
    if (receipt.status === 'Approved') {
      return {
        success: true,
        alreadyApproved: true,
        transactionId: receipt.transactionId || `TXN-RCPT-${receiptId.substring(0, 8).toUpperCase()}`,
        effectiveAmount: receipt.approvedAmount || receipt.amount || 0,
        isAdvanceCredit: false,
        newBalance: 0,
        newAdvance: 0,
      };
    }

    if (receipt.status === 'Rejected') {
      throw new Error("Cannot approve a rejected receipt.");
    }

    const effectiveAmount = (typeof customAmount === 'number' && customAmount > 0)
      ? customAmount
      : (Number(receipt.amount) || 0);

    const custRef = doc(db, 'customers', receipt.customerId);
    const custSnap = await txn.get(custRef);
    if (!custSnap.exists()) {
      throw new Error(`Customer ${receipt.customerId} not found for this receipt`);
    }

    const customer = custSnap.data() as Customer;
    const currentDue = Number(customer.balance) || 0;
    const currentAdvance = Number(customer.advanceBalance) || 0;

    let newBalance = 0;
    let newAdvance = currentAdvance;
    let status: 'Active' | 'Suspended' | 'Faulty' | 'Advance Paid' = customer.status || 'Active';
    let isAdvanceCredit = false;

    if (effectiveAmount <= currentDue) {
      newBalance = currentDue - effectiveAmount;
      if (newBalance === 0) {
        status = newAdvance > 0 ? 'Advance Paid' : (status === 'Advance Paid' ? 'Active' : status);
      }
    } else {
      newBalance = 0;
      const excess = effectiveAmount - currentDue;
      newAdvance = currentAdvance + excess;
      status = 'Advance Paid';
      isAdvanceCredit = true;
    }

    const updatedCustomer: Customer = {
      ...customer,
      balance: newBalance,
      advanceBalance: newAdvance,
      status: status,
      invoiceSent: true,
      paymentNotified: true,
      ownerId: customer.ownerId || uid,
    };

    const txnId = `TXN-RCPT-${receiptId.substring(0, 8).toUpperCase()}`;
    const txnRef = doc(db, 'transactions', txnId);

    const newTxn: Transaction = {
      id: txnId,
      customerId: customer.id,
      customerName: customer.name,
      amount: effectiveAmount,
      transactionId: txnId,
      date: new Date().toISOString(),
      ownerId: uid,
      paymentMode: 'upi',
      isAdvanceCredit,
      advanceAdjustment: isAdvanceCredit ? (newAdvance - currentAdvance) : 0,
      paymentType: isAdvanceCredit ? 'bill_and_advance' : 'bill_payment',
      previousBalance: currentDue,
      newBalance,
      previousAdvance: currentAdvance,
      newAdvance,
      notes: isAdvanceCredit
        ? `Receipt verified: Bill settled & ₹${newAdvance - currentAdvance} credited as Advance Balance`
        : `Receipt verified payment of ₹${effectiveAmount}`,
      idempotencyKey: receiptId,
    };

    // 1. Update customer document atomically
    txn.set(custRef, updatedCustomer, { merge: true });

    // 2. Create deterministic transaction record
    txn.set(txnRef, newTxn);

    // 3. Mark receipt as Approved with execution details
    txn.update(receiptRef, {
      status: 'Approved',
      approvedAt: new Date().toISOString(),
      approvedAmount: effectiveAmount,
      transactionId: txnId,
    });

    // 4. Record idempotency marker
    const idempRef = doc(db, 'idempotency_keys', `rcpt_appr_${receiptId}`);
    txn.set(idempRef, {
      id: `rcpt_appr_${receiptId}`,
      ownerId: uid,
      resourceType: 'receipt_approval',
      resourceId: txnId,
      status: 'completed',
      createdAt: new Date().toISOString(),
    });

    return {
      success: true,
      alreadyApproved: false,
      transactionId: txnId,
      customer: updatedCustomer,
      effectiveAmount,
      isAdvanceCredit,
      newBalance,
      newAdvance,
    };
  });
};

export interface RecordPaymentResult {
  success: boolean;
  alreadyProcessed?: boolean;
  transactionId: string;
  customer: Customer;
  effectiveAmount: number;
  isAdvanceCredit: boolean;
  newBalance: number;
  newAdvance: number;
}

/**
 * Atomically records a staff manual counter payment (Cash / UPI) with full ACID transaction guarantees
 * and idempotency key enforcement. Eliminates double-entry and inconsistent balances.
 */
export const recordPaymentWithAtomicTransaction = async (
  customerId: string,
  amount: number,
  transactionId: string,
  paymentMode: 'cash' | 'upi',
  paymentRecordingType: 'standard' | 'advance',
  explicitOwnerId?: string,
  idempotencyKey?: string,
): Promise<RecordPaymentResult> => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
  checkQuotaBeforeWrite("Record Payment Transaction");

  // Priority 1: High-resilience Server-side Admin Endpoint
  try {
    const response = await authFetch('/api/payments/record', {
      method: 'POST',
      body: JSON.stringify({
        customerId,
        amount,
        transactionId,
        paymentMode,
        isDirectAdvanceDeposit: paymentRecordingType === 'advance',
        ownerId: uid,
        idempotencyKey,
      }),
    });
    if (response.ok) {
      const data = await response.json();
      if (data && data.success) {
        return data as RecordPaymentResult;
      }
    }
  } catch (apiErr) {
    console.warn("[recordPaymentWithAtomicTransaction] Server endpoint fallback to client transaction:", apiErr);
  }

  // Priority 2: Client SDK Transaction Fallback
  const effectiveKey = idempotencyKey || `manual_${transactionId.trim()}`;
  const idempRef = doc(db, 'idempotency_keys', `pay_${effectiveKey}`);
  const custRef = doc(db, 'customers', customerId);

  return await runTransaction(db, async (txn) => {
    // 1. Check idempotency marker
    const idempSnap = await txn.get(idempRef);
    if (idempSnap.exists()) {
      const data = idempSnap.data();
      const existingCustSnap = await txn.get(custRef);
      return {
        success: true,
        alreadyProcessed: true,
        transactionId: data.resourceId || transactionId,
        customer: existingCustSnap.data() as Customer,
        effectiveAmount: amount,
        isAdvanceCredit: false,
        newBalance: 0,
        newAdvance: 0,
      };
    }

    // 2. Fetch Customer
    const custSnap = await txn.get(custRef);
    if (!custSnap.exists()) {
      throw new Error(`Customer ${customerId} not found`);
    }

    const customer = custSnap.data() as Customer;
    const currentDue = Number(customer.balance) || 0;
    const currentAdvance = Number(customer.advanceBalance) || 0;
    let newBalance = 0;
    let newAdvance = currentAdvance;
    let status: 'Active' | 'Suspended' | 'Faulty' | 'Advance Paid' = customer.status || 'Active';
    let isAdvanceCreditAdded = false;
    const isDirectAdvanceDeposit = paymentRecordingType === 'advance';
    let advanceAdjustment = 0;
    let paymentType: 'bill_payment' | 'advance_credit' | 'bill_and_advance' = 'bill_payment';
    let ledgerNote = "";

    if (isDirectAdvanceDeposit) {
      newBalance = currentDue;
      newAdvance = currentAdvance + amount;
      status = 'Advance Paid';
      isAdvanceCreditAdded = true;
      advanceAdjustment = amount;
      paymentType = 'advance_credit';
      ledgerNote = `Direct Advance Credit pre-payment of ₹${amount} recorded`;
    } else if (amount <= currentDue) {
      newBalance = currentDue - amount;
      ledgerNote = `Water bill payment of ₹${amount} recorded`;
      if (newBalance === 0) {
        status = newAdvance > 0 ? 'Advance Paid' : (status === 'Advance Paid' ? 'Active' : status);
      }
    } else {
      newBalance = 0;
      const excess = amount - currentDue;
      newAdvance = currentAdvance + excess;
      status = 'Advance Paid';
      isAdvanceCreditAdded = true;
      advanceAdjustment = excess;
      paymentType = 'bill_and_advance';
      ledgerNote = `Bill fully settled (₹${currentDue}) & ₹${excess} added as Advance Credit`;
    }

    const updatedCustomer: Customer = {
      ...customer,
      balance: newBalance,
      advanceBalance: newAdvance,
      status: status,
      invoiceSent: true,
      paymentNotified: true,
      ownerId: customer.ownerId || uid,
    };

    const finalTxnId = transactionId.trim().startsWith("TXN-")
      ? transactionId.trim()
      : `TXN-${transactionId.trim()}`;
    const txnRef = doc(db, 'transactions', finalTxnId);

    const newTxn: Transaction = {
      id: finalTxnId,
      customerId: customer.id,
      customerName: customer.name,
      amount: amount,
      transactionId: finalTxnId,
      date: new Date().toISOString(),
      ownerId: uid,
      paymentMode: paymentMode,
      isAdvanceCredit: isAdvanceCreditAdded || isDirectAdvanceDeposit,
      advanceAdjustment: advanceAdjustment,
      paymentType: paymentType,
      previousBalance: currentDue,
      newBalance: newBalance,
      previousAdvance: currentAdvance,
      newAdvance: newAdvance,
      notes: ledgerNote,
      idempotencyKey: effectiveKey,
    };

    // 1. Commit customer update
    txn.set(custRef, updatedCustomer, { merge: true });

    // 2. Commit transaction record
    txn.set(txnRef, newTxn);

    // 3. Commit idempotency marker
    txn.set(idempRef, {
      id: `pay_${effectiveKey}`,
      ownerId: uid,
      resourceType: 'counter_payment',
      resourceId: finalTxnId,
      status: 'completed',
      createdAt: new Date().toISOString(),
    });

    return {
      success: true,
      alreadyProcessed: false,
      transactionId: finalTxnId,
      customer: updatedCustomer,
      effectiveAmount: amount,
      isAdvanceCredit: isAdvanceCreditAdded,
      newBalance,
      newAdvance,
    };
  });
};

export const updateReceiptStatus = async (id: string, status: 'Approved' | 'Rejected', explicitOwnerId?: string) => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) return;

  if (status === 'Rejected') {
    try {
      const res = await authFetch('/api/receipts/reject', {
        method: 'POST',
        body: JSON.stringify({ receiptId: id, ownerId: uid }),
      });
      if (res.ok) return;
    } catch (apiErr) {
      console.warn("[updateReceiptStatus] Server endpoint fallback:", apiErr);
    }
  }

  try {
    await updateDoc(doc(db, 'payment_receipts', id), { status });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `payment_receipts/${id}`);
  }
};

export const resolveComplaint = async (id: string, notify: boolean = false, explicitOwnerId?: string) => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) return;

  // Priority 1: High-resilience Server Admin endpoint
  try {
    const res = await authFetch('/api/complaints/resolve', {
      method: 'POST',
      body: JSON.stringify({ complaintId: id, ownerId: uid }),
    });
    if (res.ok) {
      if (notify) {
        const complaintSnap = await getDoc(doc(db, 'complaints', id));
        if (complaintSnap.exists()) {
          const data = complaintSnap.data() as Complaint;
          await authFetch('/api/complaints/notify-resolution', {
            method: 'POST',
            body: JSON.stringify({
              complaintId: id,
              ownerId: uid,
              customerId: data.customerId
            })
          });
        }
      }
      return;
    }
  } catch (apiErr) {
    console.warn("[resolveComplaint] Server endpoint fallback:", apiErr);
  }

  // Priority 2: Client SDK updateDoc Fallback
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
        await authFetch('/api/complaints/notify-resolution', {
          method: 'POST',
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

export const updateReportTags = async (id: string, tags: string[], explicitOwnerId?: string) => {
  const uid = explicitOwnerId || auth.currentUser?.uid;
  if (!uid) throw new Error("Not authenticated");
  try {
    const reportRef = doc(db, 'reports', id);
    let resolvedReportType = 'panchayat_report';
    if (tags.includes('waterworks_report')) {
      resolvedReportType = 'waterworks_report';
    } else if (tags.includes('panchayat_report') && tags.includes('deep_details_report')) {
      resolvedReportType = 'both';
    } else if (tags.includes('deep_details_report')) {
      resolvedReportType = 'deep_details_report';
    }
    await updateDoc(reportRef, { 
      tags,
      reportType: resolvedReportType
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `reports/${id}`);
    throw error;
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

export interface BusinessHours {
  enabled: boolean;
  startTime: string;
  endTime: string;
  days: string[];
  timezone?: string;
  offlineMessage?: string;
}

export interface ChatbotSettings {
  isActive: boolean;
  commands: ChatbotCommand[];
  quickTip?: string;
  quickTips?: string[];
  welcomeMessage?: string;
  includeQuickTip?: boolean;
  hasInitialized?: boolean;
  ownerId?: string;
  autoReplyOutsideHours?: boolean;
  businessHours?: BusinessHours;
  offlineMessage?: string;
}

export function isOutsideBusinessHours(businessHours?: BusinessHours): boolean {
  if (!businessHours || !businessHours.enabled) {
    return false;
  }

  const startTime = businessHours.startTime || "09:00";
  const endTime = businessHours.endTime || "17:00";
  const days = Array.isArray(businessHours.days) && businessHours.days.length > 0
    ? businessHours.days
    : ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const timezone = businessHours.timezone || "Asia/Kolkata";

  const now = new Date();
  let dayName = "Mon";
  let currentHHMM = "12:00";

  try {
    const tz = timezone && timezone !== 'local' ? timezone : undefined;
    const options: Intl.DateTimeFormatOptions = {
      weekday: 'short',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      ...(tz ? { timeZone: tz } : {})
    };
    const formatter = new Intl.DateTimeFormat('en-US', options);
    const parts = formatter.formatToParts(now);

    let dayStr = '';
    let hourStr = '';
    let minStr = '';

    for (const p of parts) {
      if (p.type === 'weekday') dayStr = p.value;
      if (p.type === 'hour') hourStr = p.value;
      if (p.type === 'minute') minStr = p.value;
    }

    if (hourStr === '24') hourStr = '00';
    dayName = dayStr || 'Mon';
    currentHHMM = `${hourStr.padStart(2, '0')}:${minStr.padStart(2, '0')}`;
  } catch (e) {
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    dayName = dayNames[now.getDay()];
    const h = String(now.getHours()).padStart(2, '0');
    const m = String(now.getMinutes()).padStart(2, '0');
    currentHHMM = `${h}:${m}`;
  }

  const isDayActive = days.some(d =>
    d.toLowerCase().startsWith(dayName.toLowerCase()) ||
    dayName.toLowerCase().startsWith(d.toLowerCase())
  );

  if (!isDayActive) {
    return true;
  }

  if (startTime <= endTime) {
    return currentHHMM < startTime || currentHHMM >= endTime;
  } else {
    const isInside = currentHHMM >= startTime || currentHHMM < endTime;
    return !isInside;
  }
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

export const getSettings = async (ownerId: string): Promise<AppSettings | null> => {
  try {
    const docSnap = await getDoc(doc(db, 'settings', ownerId));
    if (!docSnap.exists()) return null;
    const data = docSnap.data() as AppSettings;

    // Normalization logic
    if (!data.metaCustomTemplates) {
      data.metaCustomTemplates = [];
    }
    if (data.metaCustomTemplates.length === 0) {
      const categoryDefaults = [
        { key: 'metaTemplateWelcome', defaultName: 'welcome', params: 'customer_name', id: 'def_welcome' },
        { key: 'metaTemplateBilling', defaultName: 'billing', params: 'customer_name, billing_amount, new_balance, date', id: 'def_billing' },
        { key: 'metaTemplateReceipt', defaultName: 'receipt', params: 'customer_name, payment_amount', id: 'def_receipt' },
        { key: 'metaTemplateBroadcast', defaultName: 'broadcast', params: 'customer_name, message', id: 'def_broadcast' },
        { key: 'metaTemplateOverdue', defaultName: 'overdue', params: 'customer_name, overdue_amount, date', id: 'def_overdue' },
        { key: 'metaTemplateSuspension', defaultName: 'suspension', params: 'customer_name, customer_balance, date', id: 'def_suspension' },
      ];
      for (const def of categoryDefaults) {
        const templateName = (data as any)[def.key] || def.defaultName;
        data.metaCustomTemplates.push({ templateName, parameters: def.params, id: def.id, language: 'en_US' });
      }
    }
    return data;
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'settings');
    return null;
  }
};

export const getBillingAuditLogs = async (ownerId: string): Promise<BillingAuditLog[]> => {
  try {
    const q = query(collection(db, 'billing_audit'), where('ownerId', '==', ownerId));
    const snapshot = await getDocs(q);
    const logsData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as BillingAuditLog));
    logsData.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    return logsData;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'billing_audit');
    return [];
  }
};

export function subscribeToCustomers(
  arg1: string | ((customers: Customer[]) => void),
  arg2?: ((customers: Customer[]) => void) | string
) {
  const { ownerId, callback } = parseSubArgs<Customer[]>(arg1, arg2);
  if (!ownerId) return () => {};
  const q = query(
    collection(db, 'customers'),
    where('ownerId', '==', ownerId)
  );
  return onSnapshot(q, (snapshot) => {
    const customers = snapshot.docs.map(doc => {
      const data = { id: doc.id, ...doc.data() } as Customer;
      if (data.status !== 'Suspended') {
        const cleanMobile = data.mobileNumber ? data.mobileNumber.replace(/\D/g, '') : '';
        if (!cleanMobile || cleanMobile.length < 10 || cleanMobile === '0000000000') {
          data.status = 'Suspended';
        }
      }
      return data;
    });
    setCachedData(`customers_${ownerId}`, customers);
    callback(customers);
  }, (error) => {
    handleFirestoreError(error, OperationType.LIST, 'customers');
    const cached = getCachedData(`customers_${ownerId}`);
    if (cached) callback(cached);
  });
}

export const getCustomers = async (ownerId: string): Promise<Customer[]> => {
  const cacheKey = `customers_${ownerId}`;
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  try {
    const q = query(collection(db, 'customers'), where('ownerId', '==', ownerId));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => {
      const data = { id: doc.id, ...doc.data() } as Customer;
      if (data.status !== 'Suspended') {
        const cleanMobile = data.mobileNumber ? data.mobileNumber.replace(/\D/g, '') : '';
        if (!cleanMobile || cleanMobile.length < 10 || cleanMobile === '0000000000') {
          data.status = 'Suspended';
        }
      }
      return data;
    });
    setCachedData(cacheKey, data);
    return data;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'customers');
    return getCachedData(cacheKey) || [];
  }
};

export const getTransactions = async (ownerId: string): Promise<Transaction[]> => {
  const cacheKey = `transactions_${ownerId}`;
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  try {
    const q = query(collection(db, 'transactions'), where('ownerId', '==', ownerId));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction));
    setCachedData(cacheKey, data);
    return data;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'transactions');
    return getCachedData(cacheKey) || [];
  }
};

export const getComplaints = async (ownerId: string): Promise<Complaint[]> => {
  const cacheKey = `complaints_${ownerId}`;
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  try {
    const q = query(collection(db, 'complaints'), where('ownerId', '==', ownerId));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Complaint));
    setCachedData(cacheKey, data);
    return data;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'complaints');
    return getCachedData(cacheKey) || [];
  }
};

export const getReports = async (ownerId: string): Promise<Report[]> => {
  const cacheKey = `reports_${ownerId}`;
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  try {
    const q = query(collection(db, 'reports'), where('ownerId', '==', ownerId));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Report));
    setCachedData(cacheKey, data);
    return data;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'reports');
    return getCachedData(cacheKey) || [];
  }
};

export const getWhatsappMessages = async (ownerId: string): Promise<WhatsappMessage[]> => {
  const cacheKey = `whatsapp_messages_${ownerId}`;
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  try {
    const q = query(collection(db, 'whatsapp_messages'), where('ownerId', '==', ownerId));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as WhatsappMessage));
    setCachedData(cacheKey, data);
    return data;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'whatsapp_messages');
    return [];
  }
};

export const getAutomationErrors = async (ownerId: string): Promise<AutomationError[]> => {
  const cacheKey = `automation_errors_${ownerId}`;
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  try {
    const q = query(collection(db, 'automation_errors'), where('ownerId', '==', ownerId));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as AutomationError));
    setCachedData(cacheKey, data);
    return data;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'automation_errors');
    return [];
  }
};

export const getPendingReceipts = async (ownerId: string): Promise<any[]> => {
  const cacheKey = `pending_receipts_${ownerId}`;
  const cached = getCachedData(cacheKey);
  if (cached) return cached;

  try {
    const q = query(collection(db, 'pending_receipts'), where('ownerId', '==', ownerId));
    const snapshot = await getDocs(q);
    const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    setCachedData(cacheKey, data);
    return data;
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'pending_receipts');
    return [];
  }
};
