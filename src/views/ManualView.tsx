import { motion } from "motion/react";
import { BookOpen, Key, BellRing, Settings, Users, MessageCircle, Info } from "lucide-react";

export function ManualView() {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="p-6 md:p-10 max-w-5xl mx-auto space-y-8 h-full overflow-y-auto"
    >
      <header className="mb-8">
        <h1 className="text-4xl font-black tracking-tight mb-3">App Manual & Documentation</h1>
        <p className="text-lg neu-text-muted">A comprehensive guide on how to configure and use the automated billing system.</p>
      </header>
      
      <div className="grid gap-6">
        
        {/* API Integration Details */}
        <section className="neu-bg p-8 rounded-3xl border border-[var(--shadow-dark)] shadow-xl relative overflow-hidden">
          <div className="absolute top-0 left-0 w-2 h-full bg-blue-500" />
          <div className="flex items-center gap-4 mb-6">
             <div className="p-3 bg-blue-100 text-blue-700 rounded-xl">
               <Settings className="w-6 h-6" />
             </div>
             <h2 className="text-2xl font-bold">1. Simple API Integration</h2>
          </div>
          <div className="space-y-4 text-sm leading-relaxed neu-text">
            <p className="font-medium text-lg">Send automated invoices via WhatsApp reliably.</p>
            <ul className="list-disc pl-5 space-y-2">
              <li>
                <strong>Step 1: Get Meta Access Token.</strong> Go to the Meta Developer Portal, create a WhatsApp app, and grab the Access Token. Under Settings <code className="bg-black/10 px-1 rounded">&gt;</code> WhatsApp API Configuration, paste this token.
              </li>
              <li>
                <strong>Step 2: Get Phone Number ID.</strong> From the same portal, copy the Phone Number ID and paste it into the settings.
              </li>
              <li>
                <strong>Step 3: Setup Webhook (Optional).</strong> If you want to receive complaints directly when customers text "complain" to your WhatsApp, copy the webhook URL from Settings and paste it into Meta's webhook configuration. Use a secret token to secure it.
              </li>
            </ul>
            <p className="p-4 bg-blue-50 text-blue-900 border border-blue-200 rounded-xl italic">
              <Info className="inline w-5 h-5 mr-2" />
              <strong>Tip:</strong> You can test your connection using the "Send Test Message" button in Settings.
            </p>
          </div>
        </section>

        {/* Customer Management */}
        <section className="neu-bg p-8 rounded-3xl border border-[var(--shadow-dark)] shadow-lg relative overflow-hidden">
          <div className="absolute top-0 left-0 w-2 h-full bg-emerald-500" />
          <div className="flex items-center gap-4 mb-6">
             <div className="p-3 bg-emerald-100 text-emerald-700 rounded-xl">
               <Users className="w-6 h-6" />
             </div>
             <h2 className="text-2xl font-bold">2. Managing Customers</h2>
          </div>
          <div className="space-y-4 text-sm leading-relaxed neu-text">
            <p>
              In the <strong>Customers</strong> view, you can:
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Add customers manually using the "Add Customer" button.</li>
              <li>Bulk Upload customers via Excel or CSV.</li>
              <li>Isolate non-paying customers easily.</li>
            </ul>
            <p>When you update a customer's plan or status, they are automatically organized across the platform.</p>
          </div>
        </section>

        {/* Billing & Automation */}
        <section className="neu-bg p-8 rounded-3xl border border-[var(--shadow-dark)] shadow-lg relative overflow-hidden">
          <div className="absolute top-0 left-0 w-2 h-full bg-purple-500" />
          <div className="flex items-center gap-4 mb-6">
             <div className="p-3 bg-purple-100 text-purple-700 rounded-xl">
               <BellRing className="w-6 h-6" />
             </div>
             <h2 className="text-2xl font-bold">3. Automated Billing & Invoices</h2>
          </div>
          <div className="space-y-4 text-sm leading-relaxed neu-text">
            <p>
              Use the <strong>Invoices & Billing</strong> view to easily dispatch bills simultaneously.
            </p>
            <ul className="list-disc pl-5 space-y-2">
              <li>Click "Send Monthly Bills" to automatically generate and WhatsApp PDF invoices to all active customers.</li>
              <li>Check the payment statuses directly from this view. "Pending" bills turn to "Overdue" automatically if penalties apply.</li>
              <li>If the API is unavailable, the system intelligently defaults to a manual fallback, allowing you to send messages securely via the WhatsApp desktop/web app.</li>
            </ul>
          </div>
        </section>

      </div>
    </motion.div>
  );
}
