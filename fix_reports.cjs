const fs = require('fs');
let code = fs.readFileSync('src/views/ReportsView.tsx', 'utf8');

code = code.replace(/showCancel: false/g, '');
code = code.replace(/isDestructive: false,/g, 'isDestructive: false');

fs.writeFileSync('src/views/ReportsView.tsx', code);
console.log('Fixed ReportsView.tsx');
