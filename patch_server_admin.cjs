const fs = require('fs');

const path = 'server.ts';
let code = fs.readFileSync(path, 'utf8');

// Patch /api/whatsapp/test
code = code.replace(
  /app\.post\("\/api\/whatsapp\/test", async \(req, res\) => \{\s*try \{\s*const \{ ownerId, testMobile \} = req\.body;\s*if \(!admin\.apps\.length\) return res\.status\(500\)\.json\(\{ error: "Backend uninitialized" \}\);\s*const db = admin\.firestore\(\);\s*const settingsDoc = await db\.collection\("settings"\)\.doc\(ownerId\)\.get\(\);\s*const settings = settingsDoc\.data\(\);\s*if \(!settings\?\.metaWhatsAppApiKey/m,
  `app.post("/api/whatsapp/test", async (req, res) => {
    try {
      const { ownerId, testMobile, apiKey, phoneId } = req.body;
      let settings = { metaWhatsAppApiKey: apiKey, metaWhatsAppPhoneNumberId: phoneId };
      if (!apiKey && admin.apps.length) {
         const db = admin.firestore();
         const settingsDoc = await db.collection("settings").doc(ownerId).get();
         settings = settingsDoc.data();
      }
      if (!settings?.metaWhatsAppApiKey`
);

// Patch /api/whatsapp/broadcast
code = code.replace(
  /app\.post\("\/api\/whatsapp\/broadcast", async \(req, res\) => \{\s*try \{\s*const \{ ownerId, message \} = req\.body;\s*if \(!ownerId \|\| !message\) return res\.status\(400\)\.json\(\{ error: "Missing ownerId or message" \}\);\s*if \(!admin\.apps\.length\) return res\.status\(500\)\.json\(\{ error: "Backend uninitialized" \}\);\s*const db = admin\.firestore\(\);\s*const settingsDoc = await db\.collection\("settings"\)\.doc\(ownerId\)\.get\(\);\s*if \(!settingsDoc\.exists\) return res\.status\(404\)\.json\(\{ error: "Settings not found" \}\);\s*const settings = settingsDoc\.data\(\);\s*if \(!settings\?\.metaWhatsAppApiKey/m,
  `app.post("/api/whatsapp/broadcast", async (req, res) => {
    try {
      const { ownerId, message, apiKey, phoneId, recipients } = req.body;
      if (!message) return res.status(400).json({ error: "Missing message" });
      
      let settings = { metaWhatsAppApiKey: apiKey, metaWhatsAppPhoneNumberId: phoneId };
      if (!apiKey && admin.apps.length) {
         const db = admin.firestore();
         const settingsDoc = await db.collection("settings").doc(ownerId).get();
         if (settingsDoc.exists) settings = settingsDoc.data();
      }
      if (!settings?.metaWhatsAppApiKey`
);

// We also need to fix the logic below broadcast which fetches customers:
code = code.replace(
  /const customersSnap = await db\.collection\("customers"\)\s*\.where\("ownerId", "==", ownerId\)\s*\.where\("status", "==", "Active"\)\s*\.get\(\);\s*const customers = customersSnap\.docs\.map\(d => d\.data\(\)\);/m,
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

// Patch /api/whatsapp/send
code = code.replace(
  /app\.post\("\/api\/whatsapp\/send", async \(req, res\) => \{\s*try \{\s*const \{ ownerId, to, message \} = req\.body;\s*if \(!ownerId \|\| !to \|\| !message\) return res\.status\(400\)\.json\(\{ error: "Missing required fields" \}\);\s*if \(!admin\.apps\.length\) return res\.status\(500\)\.json\(\{ error: "Backend uninitialized" \}\);\s*const db = admin\.firestore\(\);\s*const settingsDoc = await db\.collection\("settings"\)\.doc\(ownerId\)\.get\(\);\s*const settings = settingsDoc\.data\(\);/m,
  `app.post("/api/whatsapp/send", async (req, res) => {
    try {
      const { ownerId, to, message, apiKey, phoneId } = req.body;
      if (!to || !message) return res.status(400).json({ error: "Missing required fields" });
      
      let settings = { metaWhatsAppApiKey: apiKey, metaWhatsAppPhoneNumberId: phoneId };
      if (!apiKey && admin.apps.length) {
         const db = admin.firestore();
         const settingsDoc = await db.collection("settings").doc(ownerId).get();
         settings = settingsDoc.data();
      }`
);

fs.writeFileSync(path, code);
console.log('Server patched');
