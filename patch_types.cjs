const fs = require('fs');

const path = 'src/lib/db.ts';
let code = fs.readFileSync(path, 'utf8');

code = code.replace(
  /autoShareReports\?: boolean;/,
  "autoShareReports?: boolean;\n  autoCreateComplaints?: boolean;"
);
fs.writeFileSync(path, code);
console.log('patched db.ts');

// Also patch settings in server.ts
let serverCode = fs.readFileSync('server.ts', 'utf8');
if (!serverCode.includes('autoCreateComplaints')) {
    serverCode = serverCode.replace(
    /if \(msgBody\.toLowerCase\(\)\.includes\('complain'\)\) \{/,
    `const settingsDoc = await db.collection("settings").doc(ownerId).get();
                   const settings = settingsDoc.exists ? settingsDoc.data() : null;
                   if (msgBody.toLowerCase().includes('complain') && settings?.automation?.autoCreateComplaints !== false) {`
    );
    fs.writeFileSync('server.ts', serverCode);
    console.log('patched server.ts');
}
