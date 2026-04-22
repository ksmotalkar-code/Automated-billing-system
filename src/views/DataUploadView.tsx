import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "../components/ui/card";
import { Upload, FileSpreadsheet, FileText, CheckCircle2, AlertCircle } from "lucide-react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import * as XLSX from 'xlsx';
import { PDFParse } from 'pdf-parse';
import { Buffer } from 'buffer';
import { saveUploadedData, addCustomer, importCustomersFromText } from "../lib/db";

export function DataUploadView() {
  const { t } = useTranslation();
  const [file, setFile] = useState<File | null>(null);
  const [parsedData, setParsedData] = useState<any[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [status, setStatus] = useState<{ type: 'success' | 'error' | 'info', message: string } | null>(null);
  const [rawText, setRawText] = useState("");

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (!selectedFile) return;

    setFile(selectedFile);
    setStatus({ type: 'info', message: 'Parsing file...' });

    try {
      if (selectedFile.name.endsWith('.xlsx') || selectedFile.name.endsWith('.xls') || selectedFile.name.endsWith('.csv')) {
        const data = await selectedFile.arrayBuffer();
        const workbook = XLSX.read(data);
        const worksheet = workbook.Sheets[workbook.SheetNames[0]];
        const jsonData = XLSX.utils.sheet_to_json(worksheet);
        setParsedData(jsonData);
        setStatus({ type: 'success', message: `Successfully parsed ${jsonData.length} rows.` });
      } else if (selectedFile.name.endsWith('.pdf')) {
        const data = await selectedFile.arrayBuffer();
        const parser = new PDFParse({ data: Buffer.from(data) });
        const pdfData = await parser.getText();
        
        // Simple heuristic to extract potential customer data from text
        const lines = pdfData.text.split('\n');
        const extractedCustomers = lines
          .filter(line => line.includes('Name') || line.includes('Mobile')) // Heuristic
          .map(line => ({ raw: line }));
          
        setParsedData(extractedCustomers);
        setStatus({ type: 'success', message: `Successfully extracted ${extractedCustomers.length} potential records from PDF.` });
      } else {
        setStatus({ type: 'error', message: 'Unsupported file format. Please upload Excel or PDF.' });
      }
    } catch (error) {
      console.error(error);
      setStatus({ type: 'error', message: 'Error parsing file.' });
    }
  };

  const handleSaveData = async (applyToCustomers: boolean) => {
    if (!file || parsedData.length === 0) return;
    setIsUploading(true);
    setStatus({ type: 'info', message: 'Saving data...' });

    try {
      // Save to uploadedData collection
      await saveUploadedData(file.name, parsedData);

      if (applyToCustomers && (file.name.endsWith('.xlsx') || file.name.endsWith('.xls') || file.name.endsWith('.csv'))) {
        // Try to map to customers
        let addedCount = 0;
        for (const row of parsedData) {
          const name = row['Name'] || row['name'] || row['Customer Name'];
          const mobile = row['Mobile'] || row['mobile'] || row['Phone'] || row['Mobile Number'];
          if (name) {
            await addCustomer({
              name: String(name),
              mobileNumber: mobile ? String(mobile) : "0000000000",
              status: 'Active',
              balance: 0
            });
            addedCount++;
          }
        }
        setStatus({ type: 'success', message: `Data saved and ${addedCount} customers added successfully!` });
      } else {
        setStatus({ type: 'success', message: 'Data saved successfully for future use.' });
      }
    } catch (error) {
      console.error(error);
      setStatus({ type: 'error', message: 'Error saving data.' });
    } finally {
      setIsUploading(false);
    }
  };

  const handleRawTextImport = async () => {
    if (!rawText.trim()) return;
    setIsUploading(true);
    setStatus({ type: 'info', message: 'Importing customers from text...' });
    try {
      const count = await importCustomersFromText(rawText);
      setStatus({ type: 'success', message: `Successfully imported ${count} customers!` });
      setRawText("");
    } catch (error) {
      console.error(error);
      setStatus({ type: 'error', message: 'Error importing customers.' });
    } finally {
      setIsUploading(false);
    }
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
              <label className="flex flex-col items-center justify-center w-full h-64 border-2 border-dashed rounded-3xl cursor-pointer bg-black/5 border-black/10 hover:bg-black/10 transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <Upload className="w-12 h-12 mb-4 text-slate-500" />
                  <p className="mb-2 text-sm text-slate-500 font-bold">
                    <span className="font-semibold">Click to upload</span> or drag and drop
                  </p>
                  <p className="text-xs text-slate-500">XLSX, XLS, CSV, or PDF</p>
                </div>
                <input type="file" className="hidden" accept=".xlsx, .xls, .csv, .pdf" onChange={handleFileUpload} />
              </label>
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
                    className="flex-1 py-3 bg-emerald-600 text-white rounded-xl font-bold shadow-lg shadow-emerald-500/30 hover:bg-emerald-700 transition-colors disabled:opacity-50"
                  >
                    Apply to Customers Database
                  </button>
                  <button 
                    onClick={() => handleSaveData(false)}
                    disabled={isUploading}
                    className="flex-1 py-3 bg-blue-600 text-white rounded-xl font-bold shadow-lg shadow-blue-500/30 hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    Save for Future Use Only
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
              placeholder="1. Name s/o Father Name&#10;Mob: 9876543210&#10;&#10;2. Another Name..."
              className="w-full h-64 p-4 neu-pressed rounded-2xl bg-transparent outline-none resize-none font-mono text-sm"
            />
            <button 
              onClick={handleRawTextImport}
              disabled={isUploading || !rawText.trim()}
              className="w-full py-4 bg-indigo-600 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/30 hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              <CheckCircle2 className="w-5 h-5" />
              Import from Text
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
    </motion.div>
  );
}
