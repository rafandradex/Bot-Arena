module.exports = client => {
  let stopping = false;

  function stopAfterFatalError(type, error) {
    if (stopping) return;

    stopping = true;

    console.error(`🛑 [FATAL] ${type}`);
    console.error(error);

    // Garante a saída mesmo se a limpeza bloquear.
    const forceExit = setTimeout(() => {
      process.exit(1);
    }, 5000);

    // Para de receber eventos do Discord.
    Promise.resolve()
      .then(() => client.destroy())
      .catch(cleanupError => {
        console.error(
          'Error disconnecting Discord:',
          cleanupError
        );
      })
      .finally(() => {
        clearTimeout(forceExit);
        process.exit(1);
      });
  }

  process.on('uncaughtException', error => {
    stopAfterFatalError(
      'Uncaught exception',
      error
    );
  });

  process.on('unhandledRejection', reason => {
    stopAfterFatalError(
      'Unhandled promise rejection',
      reason
    );
  });
};