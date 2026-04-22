import { useState, useEffect, useRef } from 'react';
import { getPortalData, PublicPortalData, submitPaymentReceipt, submitPublicComplaint } from '../lib/portal';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { motion, AnimatePresence } from 'motion/react';
import { Droplet, CheckCircle2, Download, Receipt, Upload, Loader2, Camera, ShieldCheck, Megaphone, Send } from 'lucide-react';
import { useTranslation } from 'react-i18next';
// We generate PDF on the fly based on portal data to allow download
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { getDoc, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { Report } from '../lib/db';

export function PortalView() {
  const [portalData, setPortalData] = useState<PublicPortalData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [reportData, setReportData] = useState<Report | null>(null);
  
  const [complaintText, setComplaintText] = useState("");
  const [complaintSubmitting, setComplaintSubmitting] = useState(false);
  const [complaintSuccess, setComplaintSuccess] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();

  useEffect(() => {
    const fetchPortal = async () => {
      const urlParams = new URLSearchParams(window.location.search);
      const portalId = urlParams.get('portal');
      const reportId = urlParams.get('reportId');

      if (reportId) {
         try {
           const rDoc = await getDoc(doc(db, 'reports', reportId));
           if (rDoc.exists()) {
             setReportData(rDoc.data() as Report);
             setLoading(false);
             return;
           }
         } catch(e) {
           console.error(e);
         }
      }

      if (!portalId || portalId === 'true') {
        if (!reportId) setError('Invalid portal link.');
        setLoading(false);
        return;
      }


      // Check if they already uploaded in this session
      if (localStorage.getItem(`receipt_submitted_${portalId}`)) {
         setUploadSuccess(true);
      }

      const data = await getPortalData(portalId);
      if (data) {
        setPortalData(data);
      } else {
        setError('Invoice not found or link has expired.');
      }
      setLoading(false);
    };
    
    fetchPortal();
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !portalData) return;

    setIsSubmitting(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = async () => {
        const canvas = document.createElement('canvas');
        const MAX_WIDTH = 800;
        const MAX_HEIGHT = 800;
        let width = img.width;
        let height = img.height;

        if (width > height) {
          if (width > MAX_WIDTH) {
            height *= MAX_WIDTH / width;
            width = MAX_WIDTH;
          }
        } else {
          if (height > MAX_HEIGHT) {
            width *= MAX_HEIGHT / height;
            height = MAX_HEIGHT;
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx?.drawImage(img, 0, 0, width, height);

        const compressedBase64 = canvas.toDataURL('image/jpeg', 0.6);
        
        try {
          await submitPaymentReceipt(portalData, compressedBase64);
          setUploadSuccess(true);
          localStorage.setItem(`receipt_submitted_${portalData.portalId}`, 'true');
        } catch (err) {
          console.error("Upload error", err);
          alert("Failed to submit receipt. Please try again.");
        } finally {
          setIsSubmitting(false);
        }
      };
      img.src = event.target?.result as string;
    };
    reader.readAsDataURL(file);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(amount);
  };

  const handleSubmitComplaint = async () => {
    if (!portalData || !complaintText.trim()) return;
    setComplaintSubmitting(true);
    try {
       await submitPublicComplaint(portalData, complaintText.trim());
       setComplaintSuccess(true);
       setComplaintText("");
    } catch (e) {
       console.error("Failed to submit feedback", e);
    } finally {
       setComplaintSubmitting(false);
    }
  };

  const handleDownloadPDF = () => {
    if (!portalData) return;
    
    const doc = new jsPDF();
    
    // Header
    doc.setFontSize(22);
    doc.setTextColor(40, 40, 40);
    doc.text('SMART BILLING INVOICE', 105, 20, { align: 'center' });
    
    doc.setFontSize(10);
    doc.text(`Invoice Date: ${new Date(portalData.createdAt).toLocaleDateString('en-IN')}`, 105, 30, { align: 'center' });
    
    // Company Info
    doc.setFontSize(12);
    doc.text('Punjab Water Management Authority', 20, 45);
    doc.setFontSize(10);
    doc.text('Sector 17, Chandigarh, Punjab', 20, 50);
    doc.text('Email: support@punjabwater.gov.in', 20, 55);
    
    // Customer Info
    doc.setFontSize(12);
    doc.text('BILL TO:', 140, 45);
    doc.setFontSize(10);
    doc.text(portalData.customerName, 140, 50);
    doc.text(`ID: ${portalData.customerId}`, 140, 55);
    doc.text(`Mobile: ${portalData.mobileNumber}`, 140, 60);
    
    // Table
    autoTable(doc, {
      startY: 75,
      head: [['Description', 'Amount (INR)']],
      body: [
         ['Water Usage Charges', portalData.balance > 0 ? portalData.billingAmount.toFixed(2) : "0.00"],
         ['Late Payment Penalty', (portalData.balance > portalData.billingAmount) ? portalData.penaltyAmount.toFixed(2) : "0.00"]
      ],
      theme: 'striped',
      headStyles: { fillColor: [37, 99, 235] },
    });
    
    const finalY = (doc as any).lastAutoTable.finalY + 20;
    
    doc.setFontSize(14);
    doc.setTextColor(37, 99, 235);
    doc.text(`TOTAL DUE: INR ${portalData.balance.toFixed(2)}`, 140, finalY + 10);
    
    doc.save(`Invoice_${portalData.customerId}.pdf`);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <Droplet className="w-12 h-12 text-blue-500 animate-bounce mb-4" />
        <h2 className="text-xl font-bold text-slate-800">Loading your invoice securely...</h2>
      </div>
    );
  }

  if (reportData) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-slate-50 font-sans">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-white p-8 rounded-3xl shadow-xl max-w-2xl w-full border border-gray-100 relative overflow-hidden"
        >
           <div className="absolute top-0 left-0 w-full h-2 bg-blue-600" />
           <div className="flex items-center gap-3 mb-6">
             <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center shrink-0">
                <Megaphone className="w-6 h-6" />
             </div>
             <div>
                <span className="text-xs font-bold uppercase tracking-wider text-blue-600">Official Notice</span>
                <h1 className="text-2xl font-black text-gray-900 leading-tight">{reportData.title}</h1>
             </div>
           </div>
           
           <div className="prose prose-sm sm:prose-base text-gray-700 max-w-none">
             {reportData.content.split('\n').map((line, i) => (
               <p key={i} className="mb-4">{line}</p>
             ))}
           </div>
           
           <div className="mt-8 pt-6 border-t border-gray-100 flex justify-between items-center text-sm text-gray-500">
             <span>Published on {new Date(reportData.createdAt).toLocaleDateString()}</span>
             <span className="flex items-center gap-1 font-medium"><ShieldCheck className="w-4 h-4 text-emerald-500"/> Verified</span>
           </div>
        </motion.div>
      </div>
    );
  }

  if (error || !portalData) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <Card className="w-full max-w-md shadow-xl">
          <CardContent className="pt-6 flex flex-col items-center text-center">
            <div className="w-16 h-16 bg-rose-100 text-rose-500 rounded-full flex items-center justify-center mb-4">
              <Receipt className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 mb-2">Access Denied</h2>
            <p className="text-slate-500 mb-6">{error || 'Unable to load details.'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isPaid = portalData.balance <= 0;
  
  // Calculate due date based on setup
  const dueDate = new Date(portalData.createdAt);
  dueDate.setDate(dueDate.getDate() + portalData.penaltyDays);
  const formattedDueDate = dueDate.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

  return (
    <div className="min-h-screen bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <motion.div 
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="max-w-2xl mx-auto space-y-6"
      >
        <div className="flex items-center justify-center gap-3 mb-8">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center shadow-lg shadow-blue-500/30">
            <Droplet className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Smart Water Billing</h1>
        </div>

        <Card className="border-0 shadow-xl overflow-hidden rounded-2xl">
          {/* Status Header */}
          <div className={`p-6 sm:p-8 text-center border-b ${isPaid ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
            <h2 className={`text-sm font-bold uppercase tracking-wider mb-2 ${isPaid ? 'text-emerald-600' : 'text-rose-600'}`}>
              Current Balance
            </h2>
            <p className={`text-5xl font-black mb-2 ${isPaid ? 'text-emerald-700' : 'text-rose-700'}`}>
              {formatCurrency(portalData.balance)}
            </p>
            {isPaid ? (
              <div className="flex items-center justify-center gap-2 text-emerald-600 font-medium">
                <CheckCircle2 className="w-5 h-5" /> Account is settled. Thank you!
              </div>
            ) : (
              <p className="text-rose-600 font-medium">
                Payment due by {formattedDueDate}
              </p>
            )}
          </div>

          <div className="p-6 sm:p-8 bg-white">
            <div className="flex flex-col sm:flex-row justify-between gap-6 mb-8 pb-8 border-b border-slate-100">
              <div>
                <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">Customer Details</p>
                <h3 className="text-lg font-bold text-slate-900">{portalData.customerName}</h3>
                <p className="text-slate-600">ID: {portalData.customerId}</p>
                <p className="text-slate-600">+91 {portalData.mobileNumber}</p>
              </div>
              <div className="sm:text-right">
                <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1">Invoice Date</p>
                <p className="text-md font-medium text-slate-900">{new Date(portalData.createdAt).toLocaleDateString('en-IN')}</p>
              </div>
            </div>

            {!isPaid && (
              <div className="space-y-6">
                <div className="bg-slate-50 p-6 rounded-xl border border-slate-100">
                  <h4 className="font-bold text-slate-900 mb-4 pb-4 border-b border-slate-200">Payment Breakdown</h4>
                  <div className="space-y-3 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Standard Water Charge</span>
                      <span className="font-medium">{formatCurrency(portalData.balance >= portalData.billingAmount ? portalData.billingAmount : portalData.balance)}</span>
                    </div>
                    {portalData.balance > portalData.billingAmount && (
                      <div className="flex justify-between">
                        <span className="text-rose-600">Late Penalty Fee</span>
                        <span className="font-medium text-rose-600">{formatCurrency(portalData.balance - portalData.billingAmount)}</span>
                      </div>
                    )}
                    <div className="flex justify-between pt-3 border-t border-slate-200 font-bold text-lg">
                      <span className="text-slate-900">Total Payable</span>
                      <span className="text-slate-900">{formatCurrency(portalData.balance)}</span>
                    </div>
                  </div>
                </div>

                <div className="bg-blue-50 p-6 rounded-xl border border-blue-100 flex flex-col items-center text-center">
                  <h4 className="font-bold text-blue-900 mb-2">Scan to Pay via UPI</h4>
                  <p className="text-sm text-blue-800/80 mb-6 max-w-xs">Use any UPI app like Google Pay, PhonePe, or Paytm to scan this code.</p>
                  
                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-blue-100 mb-4 inline-block">
                    {portalData.upiQrCodeImage ? (
                      <img 
                        src={portalData.upiQrCodeImage} 
                        alt="UPI QR Code" 
                        className="w-48 h-48 sm:w-64 sm:h-64 object-contain"
                      />
                    ) : (
                      <div className="w-48 h-48 bg-slate-50 border-2 border-dashed border-slate-300 rounded-xl flex items-center justify-center">
                        <p className="text-sm font-medium text-slate-400">QR Code Unavailable</p>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-blue-600/70 font-semibold uppercase tracking-wider mb-6">Secure Payment Gateway</p>
                  
                  {uploadSuccess ? (
                    <div className="w-full bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col items-center">
                      <CheckCircle2 className="w-8 h-8 text-emerald-500 mb-2" />
                      <h5 className="font-bold text-emerald-800">Screenshot Uploaded!</h5>
                      <p className="text-sm text-emerald-600 text-center mt-1">We've received your payment proof. It will be verified shortly.</p>
                    </div>
                  ) : (
                    <div className="w-full bg-white border border-blue-100 rounded-xl p-4 flex flex-col items-center">
                      <h5 className="font-bold text-slate-800 mb-2">Already Paid?</h5>
                      <p className="text-sm text-slate-500 mb-4">Upload a screenshot of your successful transaction to clear your bill.</p>
                      <button 
                        onClick={() => fileInputRef.current?.click()}
                        disabled={isSubmitting}
                        className="w-full sm:w-auto px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-bold transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                      >
                        {isSubmitting ? (
                          <><Loader2 className="w-5 h-5 animate-spin" /> Uploading...</>
                        ) : (
                          <><Upload className="w-5 h-5" /> Upload Screenshot</>
                        )}
                      </button>
                      <input 
                        type="file" 
                        accept="image/*" 
                        ref={fileInputRef}
                        onChange={handleFileUpload}
                        className="hidden" 
                      />
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="mt-8 flex justify-center">
              <button 
                onClick={handleDownloadPDF}
                className="flex items-center gap-2 px-6 py-3 bg-slate-900 text-white rounded-xl font-bold shadow-lg hover:bg-slate-800 transition-colors"
              >
                <Download className="w-5 h-5" /> Download PDF Receipt
              </button>
            </div>

          </div>
        </Card>

        {/* Complaint / Feedback Section */}
        <Card className="border-0 shadow-xl overflow-hidden rounded-2xl p-6 sm:p-8 bg-white mt-6">
          <h3 className="font-bold text-slate-800 mb-2 flex items-center gap-2">
             <Megaphone className="w-5 h-5 text-amber-500" /> Have a complaint or feedback?
          </h3>
          <p className="text-sm text-slate-500 mb-4">Let us know if you are facing any issues or need to file a complaint about your service.</p>
          
          {complaintSuccess ? (
             <div className="w-full bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center justify-center gap-3">
               <CheckCircle2 className="w-6 h-6 text-emerald-500" />
               <p className="font-medium text-emerald-800">Your message has been sent to administration.</p>
             </div>
          ) : (
            <div className="flex flex-col gap-3">
              <textarea 
                value={complaintText}
                onChange={(e) => setComplaintText(e.target.value)}
                placeholder="Describe your issue here..."
                className="w-full h-24 p-4 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-slate-50 text-sm resize-none"
              ></textarea>
              <button 
                onClick={handleSubmitComplaint}
                disabled={!complaintText.trim() || complaintSubmitting}
                className="self-end flex items-center gap-2 px-6 py-3 bg-amber-500 hover:bg-amber-600 text-white rounded-xl font-bold transition-all disabled:opacity-50"
              >
                {complaintSubmitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                Submit
              </button>
            </div>
          )}
        </Card>
      </motion.div>
      
      <p className="text-center text-slate-400 text-sm mt-8 font-medium">
        Secured by Smart Water Billing
      </p>
    </div>
  );
}
