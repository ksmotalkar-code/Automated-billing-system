const fs = require('fs');
const path = require('path');

const viewsDir = path.join(__dirname, 'src', 'views');

const replacements = [
  { from: /border-b /g, to: 'border-b border-[var(--shadow-dark)] ' },
  { from: /border-b"/g, to: 'border-b border-[var(--shadow-dark)]"' },
];

fs.readdirSync(viewsDir).forEach(file => {
  if (file.endsWith('.tsx')) {
    const filePath = path.join(viewsDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    replacements.forEach(r => {
      content = content.replace(r.from, r.to);
    });
    
    fs.writeFileSync(filePath, content);
    console.log(`Updated ${file}`);
  }
});
