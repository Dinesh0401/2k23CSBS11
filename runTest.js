const { logEvent } = require('./logClient');
(async () => {
  try {
    const res = await logEvent('backend', 'info', 'service', 'Test log from runTest.js');
    console.log('Log created:', res);
  } catch (err) {
    console.error('Error creating log:', err.message || err);
    if (err.status) console.error('Response status:', err.status, 'body:', err.body);
    process.exit(1);
  }
})();
