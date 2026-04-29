const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// First remove the wide skipping
code = code.replace(
  /if \(!settings\.automation \|\| !settings\.automation\.scheduledBilling\) continue;/g,
  "if (!settings.automation) continue;"
);

// Then add the check tightly around the Billing Cycle logic
code = code.replace(
  /\/\/ Handle Billing Cycle\s*if \(today\.getDate\(\) === defaultDate \|\| specificOwnerId\) \{/,
  "// Handle Billing Cycle\n       if (settings.automation.scheduledBilling && (today.getDate() === defaultDate || specificOwnerId)) {"
);

fs.writeFileSync('server.ts', code);
console.log('patched server.ts automation skip');
