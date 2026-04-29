const fs = require('fs');
const path = 'src/lib/automation.ts';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
  /const fullMsg = blob \? message : `\$\\{message\\}\\n\\nView details here: \$\\{portalUrl\\}`;/g,
  `const fullMsg = \`\${message}\\n\\nView details here: \${portalUrl}\`;`
);

fs.writeFileSync(path, code);
console.log('automation portal patched');
