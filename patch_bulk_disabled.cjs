const fs = require('fs');

const classToAdd = " hover:shadow-[0_0_25px_rgba(16,185,129,0.7)] hover:ring-2 hover:ring-emerald-400/50 hover:brightness-110 transition-all duration-300";

const files = [
  'src/views/AlertsView.tsx',
  'src/views/BillingView.tsx',
  'src/views/CustomersView.tsx',
  'src/views/SettingsView.tsx'
];

files.forEach(file => {
  if (!fs.existsSync(file)) return;
  let code = fs.readFileSync(file, 'utf8');

  // Disable button if !settings?.automation?.bulkProcessing
  // To keep it simple, we replace `disabled={isSendingBulk}` with `disabled={isSendingBulk || !settings?.automation?.bulkProcessing}`
  // But maybe settings are nested or named differently. Let's find disabled prop.

  if(file.includes('AlertsView.tsx')) {
    code = code.replace(/disabled=\{isSendingBulk\}/g, "disabled={isSendingBulk || !settings?.automation?.bulkProcessing}");
  }
  
  if(file.includes('BillingView.tsx')) {
    code = code.replace(/disabled=\{isSendingBulk\}/g, "disabled={isSendingBulk || !settings?.automation?.bulkProcessing}");
  }

  if(file.includes('CustomersView.tsx')) {
    // There are multiple notifications but let's check for bulk specifically or just all isSendingNotify
    // On CustomersView it has "Send Broadcast". Let's look exactly at the broadcast section.
    // It has `onClick={handleSendBroadcast}`  `disabled={isSendingNotify}`
    code = code.replace(/onClick=\{handleSendBroadcast\}\s*disabled=\{isSendingNotify\}/, "onClick={handleSendBroadcast}\n                          disabled={isSendingNotify || !settings?.automation?.bulkProcessing}");
  }

  if(file.includes('SettingsView.tsx')) {
    // "Send to All Active Customers"
    code = code.replace(/onClick=\{handleBroadcast\}\s*disabled=\{isBroadcasting \|\| !settings\.metaWhatsAppApiKey\}/, "onClick={handleBroadcast}\n                disabled={isBroadcasting || !settings.metaWhatsAppApiKey || !settings?.automation?.bulkProcessing}");
  }

  fs.writeFileSync(file, code);
  console.log('Patched bulkProcessing block for', file);
});
