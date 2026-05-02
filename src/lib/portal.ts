import { collection, doc, setDoc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Customer, AppSettings } from './db';
import { v4 as uuidv4 } from 'uuid';

export interface PublicPortalData {
  portalId: string;
  ownerId: string;
  customerId: string;
  customerName: string;
  mobileNumber: string;
  balance: number;
  billingAmount: number;
  penaltyAmount: number;
  penaltyDays: number;
  upiQrCodeImage: string | null;
  createdAt: number;
}

export interface PaymentReceipt {
  id: string;
  portalId: string;
  customerId: string;
  ownerId: string;
  customerName: string;
  base64Image: string;
  submittedAt: string;
  status: 'Pending' | 'Approved' | 'Rejected';
  amount: number;
}

export const createPortalLink = async (customer: Customer, settings: AppSettings): Promise<string> => {
  if (!auth.currentUser) throw new Error("Must be logged in to create portal link");
  
  // Generate a random unguessable ID for the portal
  const portalId = Array.from(crypto.getRandomValues(new Uint8Array(24)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

  const portalData: PublicPortalData = {
    portalId,
    ownerId: auth.currentUser.uid,
    customerId: customer.id,
    customerName: customer.name || "Customer",
    mobileNumber: customer.mobileNumber || "",
    balance: customer.balance || 0,
    billingAmount: settings.billingAmount || 0,
    penaltyAmount: settings.penaltyAmount || 0,
    penaltyDays: settings.penaltyDays || 0,
    upiQrCodeImage: settings.upiQrCodeImage || null,
    createdAt: Date.now()
  };

  await setDoc(doc(db, 'public_portals', portalId), portalData);
  
  // Return the absolute link to the portal
  return `${window.location.origin}/?portal=${portalId}`;
};

export const getPortalData = async (portalId: string): Promise<PublicPortalData | null> => {
  const docSnap = await getDoc(doc(db, 'public_portals', portalId));
  if (docSnap.exists()) {
    return docSnap.data() as PublicPortalData;
  }
  return null;
};

export const submitPaymentReceipt = async (portalData: PublicPortalData, base64Image: string) => {
  const id = uuidv4();
  await setDoc(doc(db, 'payment_receipts', id), {
    id,
    portalId: portalData.portalId,
    customerId: portalData.customerId,
    ownerId: portalData.ownerId,
    customerName: portalData.customerName,
    base64Image,
    submittedAt: new Date().toISOString(),
    status: 'Pending',
    amount: portalData.balance
  });
};

export const submitPublicComplaint = async (portalData: PublicPortalData, message: string) => {
  const id = `COMP-${uuidv4().substring(0, 8).toUpperCase()}`;
  await setDoc(doc(db, 'complaints', id), {
    id,
    customerId: portalData.customerId,
    customerName: portalData.customerName,
    message,
    status: 'Pending',
    createdAt: new Date().toISOString(),
    ownerId: portalData.ownerId
  });
};
