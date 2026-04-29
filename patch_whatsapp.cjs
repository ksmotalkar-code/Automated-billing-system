const fs = require('fs');
const path = 'src/services/whatsappService.ts';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
  /body: JSON\.stringify\(\{\s*ownerId: auth\.currentUser\?\.uid,\s*to: params\.to,\s*message: params\.templateName \? `Template: \$\{params\.templateName\}` : params\.text\s*\}\)/g,
  `body: JSON.stringify({
          ownerId: auth.currentUser?.uid,
          to: params.to,
          message: params.templateName ? \`Template: \${params.templateName}\` : params.text,
          apiKey: this.apiKey,
          phoneId: this.phoneNumberId
        })`
);

fs.writeFileSync(path, code);
console.log('Whatsapp Service patched');
