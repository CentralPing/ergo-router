/**
 * @fileoverview Graceful server lifecycle utility for production HTTP servers.
 *
 * Manages the full lifecycle of an `http.Server`: startup prerequisites,
 * listening, signal handling, and graceful shutdown with drain timeout.
 *
 * Standalone function — works with any `http.Server` handler, not coupled
 * to the router.
 *
 * @module lib/lifecycle
 * @version 0.1.0
 * @since 0.1.0
 * @requires node:http
 *
 * @example
 * import createRouter, {graceful} from 'ergo-router';
 *
 * const router = createRouter({...});
 * const {server, shutdown} = await graceful(router.handle(), {
 *   port: 3000,
 *   onStartup: async ({log}) => {
 *     await connectToDatabase();
 *     log.info('Database connected');
 *   },
 *   onShutdown: async ({log}) => {
 *     await disconnectDatabase();
 *     log.info('Database disconnected');
 *   }
 * });
 */
import {createServer} from 'node:http';

/**
 * Creates and manages a graceful HTTP server lifecycle.
 *
 * @param {function} handler - HTTP request handler `(req, res) => void`
 * @param {object} [options] - Lifecycle configuration
 * @param {number} [options.port=3000] - Port to listen on
 * @param {string} [options.hostname='0.0.0.0'] - Hostname to bind to
 * @param {object} [options.log=console] - Logger with `.info()`, `.warn()`, `.error()` methods
 * @param {string[]} [options.signals=['SIGINT', 'SIGTERM']] - OS signals that trigger shutdown
 * @param {number} [options.timeout=5000] - Maximum time (ms) to wait for connections to drain
 * @param {function} [options.exit=process.exit] - Exit function (override for testing)
 * @param {function} [options.onStartup] - Async hook called before `server.listen()`.
 *   Receives `{log}`. Rejection prevents the server from starting.
 * @param {function} [options.onShutdown] - Async hook called after `server.close()`.
 *   Receives `{log, signal}`. Errors are caught and logged; shutdown continues.
 * @returns {Promise<{server: import('node:http').Server, shutdown: function}>} - The server
 *   instance and a programmatic shutdown function
 */
export default async function graceful(handler, options = {}) {
  const {
    port = 3000,
    hostname = '0.0.0.0',
    log = console,
    signals = ['SIGINT', 'SIGTERM'],
    timeout = 5000,
    exit = process.exit,
    onStartup,
    onShutdown
  } = options;

  const server = createServer(handler);
  let shuttingDown = false;

  if (onStartup) {
    await onStartup({log});
  }

  await new Promise((resolve, reject) => {
    server.listen(port, hostname, resolve);
    server.once('error', reject);
  });

  log.info(`Server listening on ${hostname}:${port}`);

  const shutdown = async signal => {
    if (shuttingDown) return;
    shuttingDown = true;

    log.warn(`Received ${signal}, shutting down...`);

    server.close();
    log.info('Server stopped accepting new connections');

    if (onShutdown) {
      try {
        await onShutdown({log, signal});
      } catch (err) {
        log.error(`onShutdown error: ${err?.message ?? err}`);
      }
    }

    const timer = setTimeout(() => {
      log.error('Graceful shutdown timed out, forcing exit.');
      server.closeAllConnections();
      exit(1);
    }, timeout);
    timer.unref();

    server.once('close', () => {
      clearTimeout(timer);
      log.info('Shutdown complete');
    });
  };

  for (const signal of signals) {
    process.once(signal, () => shutdown(signal));
  }

  return {server, shutdown};
}
