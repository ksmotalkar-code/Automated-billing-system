import { collection, doc, setDoc, getDoc } from 'firebase/firestore';
import { db, auth } from '../firebase';
import { Customer, AppSettings } from './db';
import { v4 as uuidv4 } from 'uuid';
import { uploadImageToStorage } from './storage';

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
  const user = auth.currentUser;
  if (!user) throw new Error("Must be logged in to create portal link");
  
  const portalId = customer.id;

  const portalData: PublicPortalData = {
    portalId,
    ownerId: user.uid,
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
  return `${window.location.origin}/p/${portalId}`;
};

export const getPortalData = async (portalId: string): Promise<PublicPortalData | null> => {
  try {
    const response = await fetch(`/api/portal-data/${portalId}`);
    if (response.ok) {
      return await response.json() as PublicPortalData;
    }
  } catch (err) {
    console.error("Error fetching portal data:", err);
  }
  return null;
};

export const submitPaymentReceipt = async (portalData: PublicPortalData, base64Image: string) => {
  const id = uuidv4();
  
  // Guarantee upload directly to Google Cloud Storage bucket (zero Firestore bloat)
  const imageUrl = await uploadImageToStorage(base64Image, 'receipts', portalData.ownerId, id);

  await setDoc(doc(db, 'payment_receipts', id), {
    id,
    portalId: portalData.portalId,
    customerId: portalData.customerId,
    ownerId: portalData.ownerId,
    customerName: portalData.customerName,
    base64Image: imageUrl,
    submittedAt: new Date().toISOString(),
    status: 'Pending',
    amount: portalData.balance
  });
};

export const submitPublicComplaint = async (portalData: PublicPortalData, message: string, description: string = "") => {
  const id = `COMP-${uuidv4().substring(0, 8).toUpperCase()}`;
  await setDoc(doc(db, 'complaints', id), {
    id,
    customerId: portalData.customerId,
    customerName: portalData.customerName,
    message,
    description,
    billStatus: portalData.balance > 0 ? `Unpaid (₹${portalData.balance})` : "Paid",
    status: 'Pending',
    createdAt: new Date().toISOString(),
    ownerId: portalData.ownerId
  });
};
