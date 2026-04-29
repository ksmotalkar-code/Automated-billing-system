const fs = require('fs');

const path = 'src/views/SettingsView.tsx';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
  /body: JSON\.stringify\(\{ ownerId: auth\.currentUser\?\.uid, testMobile \}\)/g,
  `body: JSON.stringify({ ownerId: auth.currentUser?.uid, testMobile, apiKey: settings.metaWhatsAppApiKey, phoneId: settings.metaWhatsAppPhoneNumberId })`
);

code = code.replace(
  /body: JSON\.stringify\(\{ ownerId: auth\.currentUser\?\.uid, message: broadcastMessage \}\)/g,
  `body: JSON.stringify({ ownerId: auth.currentUser?.uid, message: broadcastMessage, apiKey: settings.metaWhatsAppApiKey, phoneId: settings.metaWhatsAppPhoneNumberId })`
);

fs.writeFileSync(path, code);
console.log('Settings view patched');
