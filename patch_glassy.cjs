const fs = require('fs');

const glowClasses = ' hover:shadow-[0_0_25px_rgba(16,185,129,0.7)] hover:ring-2 hover:ring-emerald-400/50 hover:brightness-110 transition-all duration-300';

const files = [
  'src/views/AlertsView.tsx',
  'src/views/BillingView.tsx',
  'src/views/CustomersView.tsx',
  'src/views/SettingsView.tsx',
  'src/views/ReportsView.tsx'
];

files.forEach(file => {
  if (!fs.existsSync(file)) return;
  let code = fs.readFileSync(file, 'utf8');

  // Replace classNames for bulk buttons
  code = code.replace(/className="([^"]*(?:Notify All|Send Monthly WhatsApp Bill|Send Broadcast|Send to All Active|Share via WhatsApp|Send via WhatsApp)[^"]*)"/g, (match, p1) => {
    // This regex won't match the whole tag well if children text isn't in className
    return match;
  });

  // A safer approach for JSX: find the `className="...` strings inside specific buttons
  // AlertsView Notify All Unpaid
  code = code.replace(/shadow-rose-500\/30 hover:scale-105 transition-all flex items-center justify-center gap-2/g, "$&" + glowClasses);
  // AlertsView Notify All Paid
  code = code.replace(/shadow-blue-500\/30 hover:scale-105 transition-all flex items-center justify-center gap-2/g, "$&" + glowClasses);
  // BillingView Send Monthly
  code = code.replace(/shadow-emerald-500\/30 hover:shadow-emerald-500\/50 transition-all flex justify-center items-center gap-2/g, "$&" + glowClasses);
  // CustomersView Send Broadcast
  code = code.replace(/shadow-blue-500\/30 hover:shadow-blue-500\/50/g, "$&" + glowClasses);
  // SettingsView Broadcast
  code = code.replace(/shadow-emerald-500\/30 hover:shadow-emerald-500\/50/g, "$&" + glowClasses);

  fs.writeFileSync(file, code);
  console.log('Patched glassy glow for', file);
});
