const fs = require('fs');

const path = 'src/views/SettingsView.tsx';
let code = fs.readFileSync(path, 'utf8');

// Simplification replacements
code = code.replace(
  /<CardTitle className="text-lg">WhatsApp API Configuration<\/CardTitle>\s*<p className="text-sm neu-text-muted">Enter your Meta WhatsApp Business API credentials for automated background sending\.<\/p>/g,
  '<CardTitle className="text-lg">Automated WhatsApp Messaging</CardTitle>\\n                <p className="text-sm neu-text-muted">Setup WhatsApp via Meta Developer portal to seamlessly send automated bills to customers.</p>'
);

code = code.replace(
  /<label className="text-sm font-bold uppercase tracking-wider neu-text-muted ml-1">\s*WhatsApp API Key \(Bearer Token\)\s*<\/label>/g,
  '<label className="text-sm font-bold uppercase tracking-wider neu-text-muted ml-1">Meta Access Token</label>'
);

code = code.replace(
  /<p className="text-xs neu-text-muted ml-1 mt-1">Found in your Meta App Dashboard &gt; WhatsApp &gt; API Setup &gt; Temporary or Permanent access token\.<\/p>/g,
  '<p className="text-xs neu-text-muted ml-1 mt-1">From Meta App Dashboard &gt; WhatsApp &gt; API Setup.</p>'
);

code = code.replace(
  /<h4 className="font-bold text-md text-emerald-600">Chatbot & Webhook Setup<\/h4>\s*<p className="text-sm neu-text-muted">Configure this to allow customers to send messages to your WhatsApp number\. The system will automatically log them as Complaints\.<\/p>/g,
  '<h4 className="font-bold text-md text-emerald-600">Receive Customer Messages (Webhook)</h4>\\n                  <p className="text-sm neu-text-muted">Allow customers to send messages to your WhatsApp. Complaints will be logged automatically if they include the word "complain".</p>'
);

fs.writeFileSync(path, code);
console.log('SettingsView patched');
