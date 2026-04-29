const fs = require('fs');

const path = 'server.ts';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
  /if \(matchedCustomer\) \{\s*\/\/ Save as a complaint([\s\S]*?)console\.log\(`Logged complaint for \$\{matchedCustomer\.name\}`\);/,
  `if (matchedCustomer) {
                   if (msgBody.toLowerCase().includes('complain')) {
                       // Save as a complaint$1console.log(\`Logged complaint for \${matchedCustomer.name}\`);
                   }`
);

fs.writeFileSync(path, code);
console.log('Patched');
