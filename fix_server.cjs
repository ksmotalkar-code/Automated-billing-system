const fs = require('fs');
let code = fs.readFileSync('server.ts', 'utf8');

// Fix TS errors in server.ts
code = code.replace(/settings = settingsDoc\.data\(\);/g, 'settings = settingsDoc.data() as any;');
code = code.replace(/if \(settingsDoc\.exists\) settings = settingsDoc\.data\(\);/g, 'if (settingsDoc.exists) settings = settingsDoc.data() as any;');

// Fix DB issue in broadcast
code = code.replace(
  /const customersSnap = await db\.collection\('customers'\)\s*\.where\('ownerId', '==', ownerId\)\s*\.where\('status', '==', 'Active'\)\s*\.get\(\);\s*const customers = customersSnap\.docs\.map\(d => d\.data\(\)\);/m,
  `let customers = recipients || [];
      if (!recipients && admin.apps.length) {
         const db = admin.firestore();
         const customersSnap = await db.collection("customers")
           .where("ownerId", "==", ownerId)
           .where("status", "==", "Active")
           .get();
         customers = customersSnap.docs.map(d => d.data());
      }`
);

fs.writeFileSync('server.ts', code);
console.log('Fixed server.ts');
