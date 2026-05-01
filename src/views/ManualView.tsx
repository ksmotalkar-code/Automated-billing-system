import { motion } from "motion/react";
import { BookOpen, Key, BellRing, Settings, Users, MessageCircle, Info, ArrowRight, ExternalLink, Link as LinkIcon, AlertTriangle, Shield } from "lucide-react";

export function ManualView() {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="p-6 md:p-10 max-w-5xl mx-auto space-y-8 h-full overflow-y-auto pb-20"
    >
      <header className="mb-4">
        <h1 className="text-4xl font-black tracking-tight mb-3">App Manual & Documentation</h1>
        <p className="text-lg neu-text-muted">A comprehensive guide on how to configure and use the automated billing system.</p>
      </header>
      
      <div className="grid gap-6">
        
        {/* WhatsApp API Integration Details */}
        <section className="neu-bg p-8 rounded-3xl border border-[var(--shadow-dark)] shadow-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-2 h-full bg-emerald-500" />
          <div className="flex items-center gap-4 mb-6">
             <div className="p-3 bg-emerald-100 text-emerald-700 rounded-xl">
               <MessageCircle className="w-6 h-6" />
             </div>
             <h2 className="text-2xl font-bold">1. WhatsApp API Integration Guide</h2>
          </div>
          <div className="space-y-6 text-sm leading-relaxed neu-text">
            <p className="font-medium text-lg text-emerald-800">Connect your app to Meta's Official WhatsApp Business API</p>
            
            <div className="space-y-8 mt-6">
              {/* Step 1 */}
              <div className="flex flex-col md:flex-row gap-6 items-start">
                <div className="bg-emerald-100 text-emerald-800 w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shrink-0">1</div>
                <div className="space-y-3 flex-1">
                  <h3 className="text-lg font-bold">Create a Meta Developer App</h3>
                  <p>Go to the <a href="https://developers.facebook.com/" target="_blank" rel="noreferrer" className="text-blue-600 hover:underline inline-flex items-center gap-1">Meta for Developers Portal <ExternalLink className="w-3 h-3" /></a> and log in.</p>
                  <ul className="list-disc pl-5 space-y-1 text-slate-600">
                    <li>Click <strong>My Apps</strong> and then <strong>Create App</strong>.</li>
                    <li>Select <strong>Other</strong> &rarr; <strong>Business</strong> as the app type.</li>
                    <li>Fill in your App Name and contact email, then create it.</li>
                  </ul>
                  <div className="bg-slate-100 border border-slate-200 p-4 rounded-xl mt-2 text-center text-slate-500 italic">
                    (Your App Dashboard will load)
                  </div>
                </div>
              </div>

              {/* Step 2 */}
              <div className="flex flex-col md:flex-row gap-6 items-start">
                <div className="bg-emerald-100 text-emerald-800 w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shrink-0">2</div>
                <div className="space-y-3 flex-1">
                  <h3 className="text-lg font-bold">Add WhatsApp Product</h3>
                  <p>In your App Dashboard, scroll down to add products.</p>
                  <ul className="list-disc pl-5 space-y-1 text-slate-600">
                    <li>Find <strong>WhatsApp</strong> and click <strong>Set Up</strong>.</li>
                    <li>Select your Meta Business Account (or create a new one).</li>
                    <li>Navigate to <strong>WhatsApp &rarr; API Setup</strong> in the left sidebar.</li>
                  </ul>
                </div>
              </div>

              {/* Step 3 */}
              <div className="flex flex-col md:flex-row gap-6 items-start">
                <div className="bg-emerald-100 text-emerald-800 w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shrink-0">3</div>
                <div className="space-y-3 flex-1">
                  <h3 className="text-lg font-bold">Copy API Credentials</h3>
                  <p>In the <strong>API Setup</strong> page, you will see your temporary configuration.</p>
                  <ul className="list-disc pl-5 space-y-1 text-slate-600">
                    <li>Copy the <strong>Temporary access token</strong>.</li>
                    <li>Copy the <strong>Phone number ID</strong>.</li>
                  </ul>
                  <p className="text-xs text-red-600 mt-2 font-bold bg-red-50 p-3 rounded-lg border border-red-100">
                    <AlertTriangle className="inline w-4 h-4 mr-1" />
                    Note: Temporary tokens expire in 24 hours. For production, you must create a System User and generate a Permanent Token in your Business Settings.
                  </p>
                </div>
              </div>

              {/* Step 4 */}
              <div className="flex flex-col md:flex-row gap-6 items-start">
                <div className="bg-emerald-100 text-emerald-800 w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shrink-0">4</div>
                <div className="space-y-3 flex-1">
                  <h3 className="text-lg font-bold">Configure App Settings</h3>
                  <p>Open this app's <strong>Settings</strong> page.</p>
                  <ul className="list-disc pl-5 space-y-1 text-slate-600">
                    <li>Paste the Data you copied into the <strong>Meta WhatsApp API Key (Access Token)</strong> and <strong>Phone Number ID</strong> inputs.</li>
                    <li>Click <strong>Save Settings</strong>.</li>
                    <li>Under the Notification Delivery Method, make sure <strong>Meta Automated API (Official)</strong> is selected.</li>
                  </ul>
                </div>
              </div>

              {/* Step 5 */}
              <div className="flex flex-col md:flex-row gap-6 items-start">
                <div className="bg-emerald-100 text-emerald-800 w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg shrink-0">5</div>
                <div className="space-y-3 flex-1">
                  <h3 className="text-lg font-bold">Configure Webhooks & Firebase Admin (Important for Render/Custom Hosts)</h3>
                  <p>To receive messages from customers (like complaints or payment receipts), Meta requires a webhook.</p>
                  <ul className="list-disc pl-5 space-y-1 text-slate-600">
                    <li>Create a custom password in Settings &rarr; <strong>Webhook Verify Token</strong>.</li>
                    <li>Copy your <strong>Webhook URL</strong> from the App Settings page.</li>
                    <li>In the Meta Dashboard, go to WhatsApp &rarr; Configuration &rarr; <strong>Edit Webhook</strong>, and paste the URL and Verify Token.</li>
                  </ul>
                  <p className="text-xs text-amber-600 mt-3 font-bold bg-amber-50 p-3 rounded-lg border border-amber-200">
                    <AlertTriangle className="inline w-4 h-4 mr-1" />
                    <strong>CRITICAL FOR HOSTED ENVIRONMENTS (LIKE RENDER):</strong> <br/>
                    The backend server cannot verify the webhook or save messages to Firebase unless you configure the <code className="bg-amber-100 px-1 rounded mx-1 text-[11px]">FIREBASE_SERVICE_ACCOUNT</code> environment variable. 
                    <br/><br/>
                    Go to your Firebase Console &rarr; Project Settings &rarr; Service Accounts &rarr; <strong>Generate New Private Key</strong>. 
                    Copy the entire downloaded JSON file content, and set it as an Environment Variable named <code className="bg-amber-100 px-1 rounded text-[11px]">FIREBASE_SERVICE_ACCOUNT</code> in your Render dashboard, then redeploy!
                  </p>

                  <div className="p-4 bg-blue-50 rounded-xl border border-blue-200 mt-4">
                     <h4 className="text-sm font-bold text-blue-800 flex items-center gap-2">
                        <Shield className="w-4 h-4" /> 
                        Alternative: Use a "Service Bot" User
                     </h4>
                     <p className="text-xs text-blue-700 mt-2">
                        If you can't generate a Private Key JSON, do this instead:
                     </p>
                     <ul className="list-decimal pl-5 mt-2 space-y-1 text-xs text-blue-700">
                        <li>Open your app and <strong>Sign Up</strong> with email: <code className="font-bold">bot@smartbilling.app</code></li>
                        <li>Verify the email (if enabled) or just keep the password safe.</li>
                        <li>In your hosting dashboard (Render), set these 2 variables:
                           <br/><code className="bg-blue-100 px-1 rounded">BACKEND_BOT_EMAIL</code> = <code className="font-bold text-black">bot@smartbilling.app</code>
                           <br/><code className="bg-blue-100 px-1 rounded">BACKEND_BOT_PASSWORD</code> = <code className="font-bold text-black">(your-password)</code>
                        </li>
                        <li>Redeploy. The server will now "Log In" as this user to process messages!</li>
                     </ul>
                  </div>
                </div>
              </div>

            </div>

            <p className="p-4 bg-emerald-50 text-emerald-900 border border-emerald-200 rounded-xl italic mt-6 font-bold flex items-start gap-3">
              <Info className="w-5 h-5 mt-0.5 shrink-0" />
              <span>You are now ready to send invoices! Customers will receive standard PDF files automatically via the official API.</span>
            </p>
          </div>
        </section>

        {/* Alternate Sharing Methods */}
        <section className="neu-bg p-8 rounded-3xl border border-[var(--shadow-dark)] shadow-lg relative overflow-hidden">
          <div className="absolute top-0 left-0 w-2 h-full bg-blue-500" />
          <div className="flex items-center gap-4 mb-4">
             <div className="p-3 bg-blue-100 text-blue-700 rounded-xl">
               <LinkIcon className="w-6 h-6" />
             </div>
             <h2 className="text-2xl font-bold">2. Sharing Public Portal Links Instead</h2>
          </div>
          <div className="space-y-3 text-sm leading-relaxed neu-text">
            <p className="text-slate-600">
              If you lack a developer account or WhatsApp API access, you can still easily share bills utilizing Public Web Portal Links.
            </p>
            <ul className="list-disc pl-5 space-y-2 font-medium">
              <li>In <strong className="text-slate-800">Customers View</strong>, check the Actions column. You will see a <LinkIcon className="inline w-3.5 h-3.5 text-blue-500"/> <strong>Link</strong> button.</li>
              <li>Click it to automatically create a unique, fully secure Web-Portal invoice for that customer.</li>
              <li>You can copy and securely share this link manually or let the Meta API send it on your behalf.</li>
              <li>When customers visit the link, they see their invoice details, QR code, and can notify you of payments without any attachments required!</li>
            </ul>
          </div>
        </section>

        {/* Customer Management */}
        <section className="neu-bg p-8 rounded-3xl border border-[var(--shadow-dark)] shadow-lg relative overflow-hidden">
          <div className="absolute top-0 left-0 w-2 h-full bg-indigo-500" />
          <div className="flex items-center gap-4 mb-4">
             <div className="p-3 bg-indigo-100 text-indigo-700 rounded-xl">
               <Users className="w-6 h-6" />
             </div>
             <h2 className="text-2xl font-bold">3. Managing Customers</h2>
          </div>
          <div className="space-y-3 text-sm leading-relaxed neu-text">
            <p>
              In the <strong>Customers</strong> view, you can:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Add customers manually using the "Add Customer" button.</li>
              <li>Bulk Upload customers via Excel or CSV.</li>
              <li>Isolate non-paying customers easily.</li>
            </ul>
          </div>
        </section>

      </div>
    </motion.div>
  );
}
