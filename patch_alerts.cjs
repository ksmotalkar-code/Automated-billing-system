const fs = require('fs');

const replaceAlerts = (filePath) => {
  if (!fs.existsSync(filePath)) return;
  let code = fs.readFileSync(filePath, 'utf8');

  // Insert showAlert if it has ConfirmModal
  if (code.includes('ConfirmModal') && !code.includes('const showAlert')) {
     const hookMatch = code.match(/const \[confirmConfig, setConfirmConfig\] = useState[\s\S]*?\}\);/);
     if (hookMatch) {
       const showAlertCode = `\n\n  const showAlert = (title: string, message: string) => {
    setConfirmConfig({
      isOpen: true,
      title,
      message,
      onConfirm: () => {},
      isDestructive: false,
      showCancel: false
    });
  };\n`;
       code = code.replace(hookMatch[0], hookMatch[0] + showAlertCode);
     }
  }

  code = code.replace(/alert\(`/g, "showAlert('Notice', `");
  code = code.replace(/alert\("/g, "showAlert('Notice', \"");
  
  fs.writeFileSync(filePath, code);
  console.log('Patched', filePath);
};

replaceAlerts('src/views/AlertsView.tsx');
replaceAlerts('src/views/ReportsView.tsx');
replaceAlerts('src/views/PortalView.tsx');
