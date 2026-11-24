import http from 'node:http';

export async function startRuntime({ app, port, host = '0.0.0.0',
  processTarget = process, logger = console, closeResources = async () => {} }) {
  const server = http.createServer(app);
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  await new Promise((resolve, reject) => {
    function onError(error) { reject(error); }
    server.once('error', onError);
    server.listen(port, host, () => {
      server.off('error', onError);
      resolve();
    });
  });
  logger.info(`SiBS OMS API listening on port ${server.address().port}.`);
  let shutdownPromise;
  const onTerm = () => requestShutdown('SIGTERM');
  const onInt = () => requestShutdown('SIGINT');
  function requestShutdown(signal) {
    void shutdown(signal).catch(() => {
      logger.error('OMS shutdown failed.');
      processTarget.exitCode = 1;
    });
  }
  function shutdown(signal = 'shutdown') {
    if (shutdownPromise) return shutdownPromise;
    processTarget.off('SIGTERM', onTerm);
    processTarget.off('SIGINT', onInt);
    shutdownPromise = (async () => {
      logger.info(`Stopping SiBS OMS API (${signal}).`);
      const deadline = setTimeout(() => server.closeAllConnections(), 10000);
      deadline.unref();
      try {
        await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
      } finally {
        clearTimeout(deadline);
        await closeResources();
      }
    })();
    return shutdownPromise;
  }
  processTarget.once('SIGTERM', onTerm);
  processTarget.once('SIGINT', onInt);
  return { server, shutdown };
}
