module.exports = {
  files: '/server.ts',
  from: /if \(matchedCustomer\) {\s*\/\/ Save as a complaint/g,
  to: `if (matchedCustomer) {
                   if (msgBody.toLowerCase().includes('complain')) {
                       // Save as a complaint`,
};
