const fs = require('fs');
let code = fs.readFileSync('src/views/SettingsView.tsx', 'utf8');

code = code.replace(
  /\{ key: 'autoShareReports', label: 'Automate Report Sharing' \}/,
  "{ key: 'autoShareReports', label: 'Automate Report Sharing' },\n                  { key: 'autoCreateComplaints', label: 'Auto Create Complaints via WhatsApp Response' }"
);

fs.writeFileSync('src/views/SettingsView.tsx', code);
console.log('patched SettingsView.tsx');
