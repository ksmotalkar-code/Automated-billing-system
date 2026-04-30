import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Upload, FileSpreadsheet, FileText, CheckCircle2, AlertCircle, Loader2 } from "lucide-react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { saveUploadedData, importCustomersFromText } from "../lib/db";
import { db, auth } from '../firebase';
import { disableNetwork, writeBatch, doc } from 'firebase/firestore';
import { v4 as uuidv4 } from 'uuid';

export function DataUploadView() {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null);
  const [rawText, setRawText] = useState("");
  const [csvDelimiter, setCsvDelimiter] = useState(",");

  const [parsingLoading, setParsingLoading] = useState(false);
  const [isStagingModalOpen, setIsStagingModalOpen] = useState(false);
  const [stagingCustomers, setStagingCustomers] = useState<any[]>([]);
  const [stagingPage, setStagingPage] = useState(1);
  const stagingLimit = 50;

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setStatus({ type: 'info', message: 'Parsing file...' });
    setParsingLoading(true);

    try {
      if (selectedFile.name.endsWith('.json')) {
        const text = await selectedFile.text();
        const jsonData = JSON.parse(text);
        const dataArray = Array.isArray(jsonData) ? jsonData : [jsonData];
        setParsedData(dataArray);
        setStatus({ type: 'success', message: `Successfully parsed ${dataArray.length} items from JSON.` });
        setParsingLoading(false);
      } else if (selectedFile.name.endsWith('.csv')) {
        Papa.parse(selectedFile, {
          header: true,
          delimiter: csvDelimiter,
          skipEmptyLines: true,
          complete: (results) => {
            if (results.errors.length > 0) {
               setStatus({ type: 'error', message: `CSV Parsing generated ${results.errors.length} warnings/errors. Please review data.` });
            } else {
               setStatus({ type: 'success', message: `Successfully parsed ${results.data.length} rows.` });
            }
            setParsedData(results.data as any[]);
            setParsingLoading(false);
          },
          error: (error: any) => {
            setStatus({ type: 'error', message: 'Error parsing CSV file.' });
            setParsingLoading(false);
          }
        });
        return; // Don't call finally block
      } else if (selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls')) {
        const data = await selectedFile.arrayBuffer();
        const workbook = XLSX.read(data);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        setParsedData(jsonData);
        setStatus({ type: 'success', message: `Successfully parsed ${jsonData.length} rows.` });
        setParsingLoading(false);
      } else if (selectedFile.name.endsWith('.pdf')) {
        setStatus({ type: 'error', message: 'PDF parsing is only supported via backend at this time. Please upload Excel or CSV files.' });
        setParsingLoading(false);
      } else {
        setStatus({ type: 'error', message: 'Unsupported file format. Please upload JSON, CSV, Excel or PDF.' });
        setParsingLoading(false);
      }
    } catch (error) {
      console.error(error);
      setStatus({ type: 'error', message: 'Error parsing file.' });
      setParsingLoading(false);
    }
  };

  const openStagingFromParsedData = () => {
    const records = parsedData.map(row => {
      let name = String(row['Name'] || row['name'] || row['Customer Name'] || row['customer'] || row.raw || "").trim();
      let mobile = String(row['Mobile'] || row['mobile'] || row['Phone'] || row['Mobile Number'] || row['phone'] || "0000000000").trim();
      let balanceStr = String(row['Balance'] || row['balance'] || row['Amount'] || row['amount'] || "0").replace(/[^0-9.-]+/g,"");
      let balance = parseFloat(balanceStr) || 0;
      let status = String(row['Status'] || row['status'] || "Active").trim();
      
      return {
        id: `CUST-${uuidv4().substring(0, 8).toUpperCase()}`,
        name: name,
        mobileNumber: mobile,
        balance: balance,
        status: status === 'Inactive' ? 'Inactive' : 'Active',
        ownerId: auth.currentUser?.uid,
        createdAt: new Date().toISOString()
      };
    }).filter(c => c.name && c.name !== "undefined");

    if (records.length === 0) {
       setStatus({ type: 'error', message: 'No valid customers could be extracted' });
       return;
    }
    setStagingCustomers(records);
    setStagingPage(1);
    setIsStagingModalOpen(true);
  };

  const openStagingFromText = () => {
    if (!rawText.trim()) return;
    const lines = rawText.split('\n').filter(l => l.trim().length > 0);
    const records = [];
    
    // Simple parsing logic derived from db's importCustomersFromText
    let currentCustomer: any = null;
    
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        const isMobLine = /^mob(?:ile)?[:\s]*/i.test(line) || /^\+?\d[\d\s\-\+]{8,}\d/.test(line);
        const isCloseOnly = line.toLowerCase() === 'close';

        if (!isMobLine && !isCloseOnly) {
            if (currentCustomer && currentCustomer.name) {
                records.push(currentCustomer);
            }
            
            const nameMatch = line.match(/^(?:\d+[\.\)]\s*)?(.+)/);
            let namePart = nameMatch ? nameMatch[1].trim() : line;
            
            const rawLineForClose = namePart.toLowerCase();
            let isClosed = rawLineForClose.includes('close');

            let mobileNumber = "";
            
            const sameLineMob = namePart.match(/(?:mob(?:ile)?[:\s]*|)(\+?\d[\d\s\-\+]{8,}\d)/i);
            
            if (sameLineMob) {
                const digits = sameLineMob[1].replace(/\D/g, '');
                if (digits.length >= 10) {
                    mobileNumber = digits.substring(digits.length - 10);
                    namePart = namePart.replace(sameLineMob[0], '');
                }
            }
            
            namePart = namePart.replace(/mob(?:ile)?[:\s]*/gi, '');
            namePart = namePart.replace(/\s+s\/o\s+/gi, ' S/O ');
            namePart = namePart.replace(/close/gi, '');
            namePart = namePart.replace(/\d/g, '').trim();
            namePart = namePart.replace(/[-_:,]+$/, '').trim();

            if (namePart.length > 0 || !currentCustomer) {
                currentCustomer = { name: namePart, mobileNumber: mobileNumber, balance: 0, _rawClose: isClosed };
            }
        } else {
            if (!currentCustomer) {
                currentCustomer = { name: "Unknown", mobileNumber: "", balance: 0, _rawClose: false };
            }
            const rawLineForClose = line.toLowerCase();
            if (rawLineForClose.includes('close')) {
                currentCustomer._rawClose = true;
            }

            const nextLineMob = line.match(/(?:mob(?:ile)?[:\s]*|)(\+?\d[\d\s\-\+]{8,}\d)/i);
            const digits = nextLineMob ? nextLineMob[1].replace(/\D/g, '') : '';

            if (digits.length >= 10 && !currentCustomer.mobileNumber) {
                currentCustomer.mobileNumber = digits.substring(digits.length - 10);
            }
        }
    }
    if (currentCustomer && currentCustomer.name) records.push(currentCustomer);

    if (records.length === 0) {
      // Fallback
      records.push(...lines.map(line => {
        const isClosed = line.toLowerCase().includes('close');
        let namePart = line.replace(/close/gi, '').replace(/\d/g, '').trim();
        return { name: namePart, mobileNumber: "", balance: 0, _rawClose: isClosed };
      }));
    }

    const finalRecords = records.map(r => {
      const isMissingMobile = !r.mobileNumber || r.mobileNumber.replace(/\D/g, '').length < 10;
      return {
        id: `CUST-${uuidv4().substring(0, 8).toUpperCase()}`,
        name: r.name,
        mobileNumber: r.mobileNumber || "",
        balance: 0,
        status: (isMissingMobile || r._rawClose) ? "Suspended" : "Active" as any,
        ownerId: auth.currentUser?.uid,
        createdAt: new Date().toISOString()
      };
    });

    setStagingCustomers(finalRecords);
    setStagingPage(1);
    setIsStagingModalOpen(true);
  };

  const confirmBulkUpload = async () => {
    setIsUploading(true);
    try {
      const batchLimit = 400; // Safer batch limit for free-tier quotas
      for (let i = 0; i < stagingCustomers.length; i += batchLimit) {
        const chunk = stagingCustomers.slice(i, i + batchLimit);
        const batch = writeBatch(db);
        for (const customer of chunk) {
          const docRef = doc(db, 'customers', customer.id);
          batch.set(docRef, customer);
        }
        await batch.commit();
      }
      setStatus({ type: 'success', message: `Successfully imported ${stagingCustomers.length} customers.` });
      setIsStagingModalOpen(false);
      setStagingCustomers([]);
      setRawText("");
    } catch (err) {
      console.error(err);
      if (err instanceof Error && (err.message.includes('Quota') || err.message.includes('quota'))) {
        setStatus({ type: 'error', message: 'Quota limit exceeded. Bulk upload paused to protect your database. Wait for 24 hours or upgrade to a paid plan.' });
      } else {
        setStatus({ type: 'error', message: 'Failed to save the records. Please check console for details.' });
      }
      
      // Still log to internal tracker
      const { OperationType, handleFirestoreError } = await import('../lib/db');
      try {
        handleFirestoreError(err, OperationType.WRITE, 'customers_bulk_import');
      } catch (innerErr) {
        // Just let it fail if it can't even log
      }
    } finally {
      setIsUploading(false);
    }
  };

  const handleSaveData = async (applyToCustomers: boolean) => {
    if (!file || parsedData.length === 0) return;
    setIsUploading(true);
    setStatus({ type: 'info', message: 'Saving raw data...' });

    try {
      await saveUploadedData(file.name, parsedData);

      if (applyToCustomers && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.json') || file.name.endsWith('.csv') || file.name.endsWith('.pdf'))) {
        setIsUploading(false);
        openStagingFromParsedData();
      } else {
        setStatus({ type: 'success', message: 'Data saved successfully for future use.' });
        setIsUploading(false);
      }
    } catch (error) {
      console.error(error);
      setStatus({ type: 'error', message: 'Error saving data.' });
      setIsUploading(false);
    }
  };

  const handleRawTextImport = async () => {
    openStagingFromText();
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="space-y-6"
    >
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">{t('Data Upload')}</h2>
          <p className="neu-text-muted">{t('Upload Excel/PDF')} or paste raw text to build your database</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>{t('File Upload')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="flex items-center justify-center w-full">
              <label className={`flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-3xl ${parsingLoading ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:bg-black/10'} bg-black/5 border-black/10 transition-colors relative`}>
                {parsingLoading && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/5 rounded-3xl z-10 backdrop-blur-[1px]">
                    <Loader2 className="w-8 h-8 animate-spin text-slate-600" />
                  </div>
                )}
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="w-12 h-12 mb-4 text-slate-500" />
                  <p className="mb-2 text-sm text-slate-500 font-bold">
                    <span className="font-semibold">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-slate-500">JSON, CSV, XLSX, XLS, or PDF</p>
                </div>
                <input type="file" className="hidden" accept=".json, .csv, .xlsx, .xls, .pdf" onChange={handleFileUpload} disabled={parsingLoading} />
              </label>
              <div className="mt-2 text-xs text-slate-500">
                <label className="flex items-center gap-2">
                  <span>CSV Delimiter:</span>
                  <input 
                    className="border rounded px-2 py-1 bg-black/5 outline-none" 
                    value={csvDelimiter} 
                    onChange={(e) => setCsvDelimiter(e.target.value)}
                    maxLength={1}
                    placeholder=","
                  />
                </label>
              </div>
            </div>

            {file && parsedData.length > 0 && (
              <div className="space-y-4 pt-4 border-t border-[var(--shadow-dark)]">
                <div className="flex items-center gap-3">
                  {file.name.endsWith('.pdf') ? <FileText className="w-8 h-8 text-rose-500" /> : <FileSpreadsheet className="w-8 h-8 text-emerald-500" />}
                  <div>
                    <p className="font-bold">{file.name}</p>
                    <p className="text-xs neu-text-muted">{(file.size / 1024).toFixed(2)} KB</p>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 pt-4">
                  <button 
                    onClick={() => handleSaveData(true)}
                    disabled={isUploading}
                    className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold shadow-lg shadow-emerald-500/30 hover:bg-emerald-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                    {isUploading ? "Applying..." : "Review and Add to Database"}
                  </button>
                  <button 
                    onClick={() => handleSaveData(false)}
                    disabled={isUploading}
                    className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                    {isUploading ? "Saving..." : "Save for Future Use Only"}
                  </button>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Bulk Text Import</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm neu-text-muted">
              Paste your numbered customer list here. The system will automatically extract names and mobile numbers.
            </p>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              placeholder="Name s/o Father Name&#10;Mob: 9876543210&#10;&#10;Another Name s/o Someone..."
              className="w-full h-64 p-4 neu-pressed rounded-2xl bg-transparent outline-none resize-none font-mono text-sm"
            />
            <button 
              onClick={handleRawTextImport}
              disabled={isUploading || !rawText.trim()}
              className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/30 hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isUploading ? <Loader2 className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5" />}
              {isUploading ? "Importing..." : "Review and Add to Database"}
            </button>
          </CardContent>
        </Card>
      </div>

      {status && (
        <div className={`p-4 rounded-xl flex items-center gap-3 ${
          status.type === 'success' ? 'bg-emerald-100 text-emerald-800' :
          status.type === 'error' ? 'bg-rose-100 text-rose-800' :
          'bg-blue-100 text-blue-800'
        }`}>
          {status.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <span className="font-medium text-sm">{status.message}</span>
        </div>
      )}

      {isStagingModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="neu-bg p-6 rounded-2xl w-full max-w-4xl shadow-2xl border border-white/20 max-h-[90vh] flex flex-col"
          >
            <h3 className="text-xl font-bold mb-4 flex items-center gap-2">
               Review Extracted Data ({stagingCustomers.length} records)
            </h3>
            <p className="text-xs neu-text-muted mb-4">Edit the parsed details below directly if needed before confirming.</p>
            <div className="flex-1 overflow-auto rounded-xl border border-black/5">
              <table className="w-full text-sm text-left">
                <thead>
                   <tr className="text-xs text-slate-500 uppercase bg-black/5">
                      <th className="p-3">Name</th>
                      <th className="p-3 w-[150px]">Mobile</th>
                      <th className="p-3 w-[100px]">Balance</th>
                      <th className="p-3 w-[100px]">Status</th>
                   </tr>
                </thead>
                <tbody>
                  {stagingCustomers.slice((stagingPage-1)*stagingLimit, stagingPage*stagingLimit).map((c, i) => {
                    const globalIndex = (stagingPage-1)*stagingLimit + i;
                    const updateField = (field: string, value: string) => {
                      const newArr = [...stagingCustomers];
                      newArr[globalIndex] = { ...newArr[globalIndex], [field]: field === 'balance' ? parseFloat(value) || 0 : value };
                      setStagingCustomers(newArr);
                    };
                    return (
                      <tr key={i} className="border-b border-black/5 hover:bg-black/5 transition-colors">
                        <td className="p-2">
                          <input 
                            value={c.name} 
                            onChange={e => updateField('name', e.target.value)} 
                            className="w-full bg-white/5 outline-none px-2 py-1.5 rounded-lg border border-transparent focus:border-indigo-500 transition"
                          />
                        </td>
                        <td className="p-2">
                          <input 
                            value={c.mobileNumber} 
                            onChange={e => updateField('mobileNumber', e.target.value)} 
                            className="w-full bg-white/5 outline-none px-2 py-1.5 rounded-lg border border-transparent focus:border-indigo-500 transition font-mono text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <input 
                            type="number"
                            value={c.balance} 
                            onChange={e => updateField('balance', e.target.value)} 
                            className="w-full bg-white/5 outline-none px-2 py-1.5 rounded-lg border border-transparent focus:border-indigo-500 transition font-mono text-xs"
                          />
                        </td>
                        <td className="p-2">
                          <select 
                            value={c.status} 
                            onChange={e => updateField('status', e.target.value)} 
                            className="w-full bg-white/5 outline-none px-2 py-1.5 rounded-lg border border-transparent focus:border-indigo-500 transition text-xs"
                          >
                            <option value="Active">Active</option>
                            <option value="Inactive">Inactive</option>
                          </select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="flex flex-col sm:flex-row justify-between items-center mt-6 pt-4 border-t border-black/10 gap-4">
               <div className="flex gap-2 items-center">
                  <button onClick={() => setStagingPage(p=>Math.max(1, p-1))} className="neu-flat px-3 py-1.5 rounded-lg text-sm font-bold">Prev</button>
                  <span className="text-sm font-medium px-2">Page {stagingPage} of {Math.ceil(stagingCustomers.length/stagingLimit) || 1}</span>
                  <button onClick={() => setStagingPage(p=>Math.min(Math.ceil(stagingCustomers.length/stagingLimit), p+1))} className="neu-flat px-3 py-1.5 rounded-lg text-sm font-bold">Next</button>
               </div>
               <div className="flex gap-4 w-full sm:w-auto">
                  <button onClick={() => setIsStagingModalOpen(false)} disabled={isUploading} className="flex-1 sm:flex-none px-6 py-2 neu-flat rounded-xl font-medium">Cancel</button>
                  <button onClick={confirmBulkUpload} disabled={isUploading} className="flex-1 sm:flex-none px-6 py-2 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 flex justify-center items-center gap-2">
                     {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
                     Confirm Upload
                  </button>
               </div>
            </div>
          </motion.div>
        </div>
      )}
    </motion.div>
  );
}
