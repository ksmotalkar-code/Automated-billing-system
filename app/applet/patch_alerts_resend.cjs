const fs = require('fs');

let code = fs.readFileSync('src/views/AlertsView.tsx', 'utf8');

code = code.replace(
  /if \(customer\.paymentNotified\) return; \/\/ Skip if already notified\n/g,
  ""
);

code = code.replace(
  /\{\(\!customer\.mobileNumber \|\| customer\.mobileNumber\.replace\(\/\\D\/g, ''\)\.length < 10\) \? null : \(\!isPaid \|\| \!customer\.paymentNotified\) && \(\n\s*<button/,
  "{(!customer.mobileNumber || customer.mobileNumber.replace(/\\D/g, '').length < 10) ? null : (\n                            <button"
);

code = code.replace(
  /\{notifyingId === customer\.id \? 'Sending\.\.\.' : 'Notify'\}/g,
  "{notifyingId === customer.id ? 'Sending...' : (isPaid && customer.paymentNotified ? 'Resend' : 'Notify')}"
);

fs.writeFileSync('src/views/AlertsView.tsx', code);
console.log('patched AlertsView.tsx');
