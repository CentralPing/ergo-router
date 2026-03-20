/**
 * @fileoverview Contract tests for lib/lifecycle graceful server utility.
 * Verifies HTTP-level behavior with real requests.
 */
import {describe, it, afterEach} from 'node:test';
import assert from 'node:assert/strict';
import {fetch} from 'undici';
import graceful from './lifecycle.js';

function createLog() {
  const entries = [];
  return {
    entries,
    info: msg => entries.push({level: 'info', msg}),
    warn: msg => entries.push({level: 'warn', msg}),
    error: msg => entries.push({level: 'error', msg})
  };
}

describe('[Contract] lib/lifecycle', () => {
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

  it('serves HTTP requests on the configured port', async () => {
    const log = createLog();
    const handler = (req, res) => {
      res.writeHead(200, {'content-type': 'application/json'});
      res.end(JSON.stringify({ok: true}));
    };

    const {server} = await graceful(handler, {
      port: 0,
      log,
      signals: [],
      exit: () => {}
    });
    servers.push(server);

    const addr = server.address();
    const res = await fetch(`http://127.0.0.1:${addr.port}/`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, {ok: true});
  });

  it('stops accepting new requests after shutdown', async () => {
    const log = createLog();
    const handler = (req, res) => {
      res.writeHead(200);
      res.end('ok');
    };

    const {server, shutdown} = await graceful(handler, {
      port: 0,
      log,
      signals: [],
      exit: () => {}
    });
    servers.push(server);

    const addr = server.address();
    const url = `http://127.0.0.1:${addr.port}/`;

    const res1 = await fetch(url);
    assert.equal(res1.status, 200, 'should serve before shutdown');

    await shutdown('SIGTERM');
    await new Promise(resolve => setTimeout(resolve, 50));

    await assert.rejects(() => fetch(url), 'should reject connections after shutdown');
  });

  it('runs onStartup before serving and onShutdown during teardown', async () => {
    const log = createLog();
    const order = [];

    const handler = (req, res) => {
      order.push('request');
      res.writeHead(200);
      res.end('ok');
    };

    const {server, shutdown} = await graceful(handler, {
      port: 0,
      log,
      signals: [],
      exit: () => {},
      onStartup: async () => {
        order.push('startup');
      },
      onShutdown: async () => {
        order.push('shutdown');
      }
    });
    servers.push(server);

    const addr = server.address();
    await fetch(`http://127.0.0.1:${addr.port}/`);
    await shutdown('SIGINT');
    await new Promise(resolve => setTimeout(resolve, 50));

    assert.deepEqual(order, ['startup', 'request', 'shutdown']);
  });

  it('returns {server, shutdown} where shutdown is callable without signals', async () => {
    const log = createLog();
    const {server, shutdown} = await graceful((req, res) => res.end('ok'), {
      port: 0,
      log,
      signals: [],
      exit: () => {}
    });
    servers.push(server);

    await shutdown('programmatic');
    await new Promise(resolve => setTimeout(resolve, 50));
    assert.ok(
      log.entries.some(e => e.msg.includes('programmatic')),
      'should log the programmatic signal'
    );
    assert.ok(log.entries.some(e => e.msg.includes('Shutdown complete')));
  });
});
