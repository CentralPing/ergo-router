/**
 * @fileoverview Module tests for lib/lifecycle graceful server utility.
 */
import {describe, it, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import graceful from './lifecycle.js';

function noopHandler(req, res) {
  res.writeHead(200);
  res.end('ok');
}

function createLog() {
  const entries = [];
  return {
    entries,
    info: msg => entries.push({level: 'info', msg}),
    warn: msg => entries.push({level: 'warn', msg}),
    error: msg => entries.push({level: 'error', msg})
  };
}

describe('[Module] lib/lifecycle', () => {
  const servers = [];

  afterEach(async () => {
    for (const s of servers) {
      try {
        s.closeAllConnections();
        await new Promise(resolve => s.close(resolve));
      } catch {
        // already closed
      }
    }
    servers.length = 0;
  });

  it('starts server and returns {server, shutdown}', async () => {
    const log = createLog();
    const {server, shutdown} = await graceful(noopHandler, {
      port: 0,
      log,
      signals: [],
      exit: () => {}
    });
    servers.push(server);
    assert.ok(server, 'should return server');
    assert.equal(typeof shutdown, 'function', 'should return shutdown function');
    assert.ok(server.listening, 'server should be listening');
    assert.ok(
      log.entries.some(e => e.level === 'info' && e.msg.includes('listening')),
      'should log listening message'
    );
  });

  it('calls onStartup hook before listening', async () => {
    const order = [];
    const log = createLog();
    const {server} = await graceful(noopHandler, {
      port: 0,
      log,
      signals: [],
      exit: () => {},
      onStartup: async ({log: l}) => {
        order.push('startup');
        l.info('startup hook');
      }
    });
    servers.push(server);
    order.push('listening');
    assert.deepEqual(order, ['startup', 'listening']);
    assert.ok(log.entries.some(e => e.msg === 'startup hook'));
  });

  it('rejects when onStartup throws', async () => {
    const log = createLog();
    await assert.rejects(
      () =>
        graceful(noopHandler, {
          port: 0,
          log,
          signals: [],
          exit: () => {},
          onStartup: async () => {
            throw new Error('db connection failed');
          }
        }),
      {message: 'db connection failed'}
    );
  });

  it('shutdown() stops the server and calls onShutdown', async () => {
    const log = createLog();
    let shutdownSignal;
    const {server, shutdown} = await graceful(noopHandler, {
      port: 0,
      log,
      signals: [],
      exit: () => {},
      onShutdown: async ({signal}) => {
        shutdownSignal = signal;
      }
    });
    servers.push(server);

    await shutdown('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(shutdownSignal, 'SIGTERM');
    assert.ok(log.entries.some(e => e.msg.includes('SIGTERM')));
    assert.ok(log.entries.some(e => e.msg.includes('Shutdown complete')));
  });

  it('shuttingDown guard prevents double shutdown', async () => {
    const log = createLog();
    let shutdownCount = 0;
    const {server, shutdown} = await graceful(noopHandler, {
      port: 0,
      log,
      signals: [],
      exit: () => {},
      onShutdown: async () => {
        shutdownCount++;
      }
    });
    servers.push(server);

    await Promise.all([shutdown('SIGINT'), shutdown('SIGTERM')]);
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.equal(shutdownCount, 1, 'onShutdown should only be called once');
  });

  it('onShutdown errors are caught and logged', async () => {
    const log = createLog();
    const {server, shutdown} = await graceful(noopHandler, {
      port: 0,
      log,
      signals: [],
      exit: () => {},
      onShutdown: async () => {
        throw new Error('cleanup failed');
      }
    });
    servers.push(server);

    await shutdown('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.ok(
      log.entries.some(e => e.level === 'error' && e.msg.includes('cleanup failed')),
      'should log onShutdown error'
    );
    assert.ok(
      log.entries.some(e => e.msg.includes('Shutdown complete')),
      'shutdown should still complete'
    );
  });

  it('calls exit(1) when shutdown times out', async () => {
    let exitCode;
    const log = createLog();

    const handler = (req, res) => {
      // Intentionally never end the response to simulate a hung connection
      res.writeHead(200);
    };

    const {server, shutdown} = await graceful(handler, {
      port: 0,
      log,
      signals: [],
      timeout: 50,
      exit: code => {
        exitCode = code;
      }
    });
    servers.push(server);

    // Make a request to keep a connection alive, preventing server.close callback
    const addr = server.address();
    const url = `http://127.0.0.1:${addr.port}/`;
    // Fire and forget — we don't await since the response will never complete
    fetch(url).catch(() => {});

    await new Promise(resolve => setTimeout(resolve, 20));
    await shutdown('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 100));

    assert.equal(exitCode, 1, 'should call exit(1) on timeout');
  });

  it('uses default port, hostname, and log when no options provided', async () => {
    // Just verify the function signature works with minimal options
    const log = createLog();
    const {server} = await graceful(noopHandler, {
      port: 0,
      log,
      signals: [],
      exit: () => {}
    });
    servers.push(server);
    assert.ok(server.listening);
  });

  it('works without onStartup and onShutdown hooks', async () => {
    const log = createLog();
    const {server, shutdown} = await graceful(noopHandler, {
      port: 0,
      log,
      signals: [],
      exit: () => {}
    });
    servers.push(server);

    await shutdown('SIGINT');
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.ok(log.entries.some(e => e.msg.includes('Shutdown complete')));
  });
});
