module.exports = (client) => {
  process.on('unhandledRejection', (reason, promise) => {
    console.error(' ⚠️ [ANTI-CRASH] Unhandled Rejection:');
    console.error(promise, reason);
  });

  process.on('uncaughtException', (err, origin) => {
    console.error(' 🛑 [ANTI-CRASH] Uncaught Exception:');
    console.error(err, origin);
  });

  process.on('uncaughtExceptionMonitor', (err, origin) => {
    console.error(' 🛑 [ANTI-CRASH] Uncaught Exception (Monitor):');
    console.error(err, origin);
  });
};