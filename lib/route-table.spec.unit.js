/**
 * @fileoverview Boundary tests for lib/route-table.
 *
 * Black-box tests for the route table formatter. Covers declarative routes,
 * non-declarative routes, defaults resolution, method-conditional auto-includes,
 * transport configurations, sub-router mounted routes, empty state, and method
 * alignment.
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import createRouter from './router.js';
import formatRouteTable from './route-table.js';

const noop = () => ({response: {body: {ok: true}}});

describe('[Boundary] route-table', () => {
  describe('formatRouteTable()', () => {
    it('formats a declarative route with multiple middleware keys', () => {
      const router = createRouter();
      router.get('/users/:id', {
        accepts: {types: ['application/json']},
        authorization: true,
        timeout: {ms: 5000},
        execute: noop
      });

      const table = formatRouteTable(router);

      assert.match(table, /Routes:/);
      assert.match(table, /GET\s+\/users\/:id/);
      assert.match(table, /accepts/);
      assert.match(table, /authorization/);
      assert.match(table, /timeout/);
      assert.match(table, /url/);
    });

    it('shows (custom) for non-declarative routes (raw function)', () => {
      const router = createRouter();
      router.get('/health', (req, res) => {
        res.statusCode = 200;
        res.end('ok');
      });

      const table = formatRouteTable(router);

      assert.match(table, /GET\s+\/health\s+\(custom\)/);
    });

    it('resolves defaults-only middleware into output', () => {
      const router = createRouter({
        defaults: {logger: true, accepts: {types: ['application/json']}}
      });
      router.get('/items', {execute: noop});

      const table = formatRouteTable(router);

      assert.match(table, /logger/);
      assert.match(table, /accepts/);
      assert.match(table, /url/);
    });

    it('shows auto-included url for GET and body for POST', () => {
      const router = createRouter();
      router.get('/items', {execute: noop});
      router.post('/items', {execute: noop});

      const table = formatRouteTable(router);
      const lines = table.split('\n');

      const getLine = lines.find(l => l.includes('GET'));
      const postLine = lines.find(l => l.includes('POST'));

      assert.match(getLine, /url/);
      assert.match(postLine, /body/);
    });

    it('formats transport with all four concerns enabled', () => {
      const router = createRouter({
        transport: {
          requestId: {},
          security: {},
          rateLimit: {max: 100, windowMs: 60000},
          cors: {origin: ['https://a.com', 'https://b.com']}
        }
      });
      router.get('/test', {execute: noop});

      const table = formatRouteTable(router);

      assert.match(table, /Transport:/);
      assert.match(table, /requestId: enabled/);
      assert.match(table, /security: enabled/);
      assert.match(table, /rateLimit: enabled \(max: 100, windowMs: 60000\)/);
      assert.match(table, /cors: enabled \(origin: https:\/\/a\.com, https:\/\/b\.com\)/);
    });

    it('formats transport with partial config (requestId + security only)', () => {
      const router = createRouter({
        transport: {requestId: {}, security: {}}
      });
      router.get('/test', {execute: noop});

      const table = formatRouteTable(router);

      assert.match(table, /requestId: enabled/);
      assert.match(table, /security: enabled/);
      assert.match(table, /rateLimit: disabled/);
      assert.match(table, /cors: disabled/);
    });

    it('omits transport section when no transport configured', () => {
      const router = createRouter();
      router.get('/test', {execute: noop});

      const table = formatRouteTable(router);

      assert.doesNotMatch(table, /Transport:/);
    });

    it('shows sub-router mounted routes with prefixed paths', () => {
      const child = createRouter();
      child.get('/items', {accepts: true, execute: noop});
      child.post('/items', {execute: noop});

      const parent = createRouter();
      parent.mount('/api/v1', child);

      const table = formatRouteTable(parent);

      assert.match(table, /GET\s+\/api\/v1\/items/);
      assert.match(table, /POST\s+\/api\/v1\/items/);
    });

    it('returns meaningful output for empty router', () => {
      const router = createRouter();

      const table = formatRouteTable(router);

      assert.match(table, /Routes: \(none\)/);
    });

    it('right-pads methods for alignment with multiple routes', () => {
      const router = createRouter();
      router.get('/a', {execute: noop});
      router.post('/b', {execute: noop});
      router.delete('/c', {execute: noop});

      const table = formatRouteTable(router);
      const lines = table.split('\n').filter(l => l.startsWith('  '));

      const getLine = lines.find(l => l.includes('/a'));
      const postLine = lines.find(l => l.includes('/b'));
      const deleteLine = lines.find(l => l.includes('/c'));

      const getMethodEnd = getLine.indexOf('/a');
      const postMethodEnd = postLine.indexOf('/b');
      const deleteMethodEnd = deleteLine.indexOf('/c');

      assert.equal(getMethodEnd, postMethodEnd);
      assert.equal(postMethodEnd, deleteMethodEnd);
    });

    it('is accessible via router.routeTable() method', () => {
      const router = createRouter({
        transport: {requestId: {}, security: {}}
      });
      router.get('/users', {accepts: true, execute: noop});

      const table = router.routeTable();

      assert.equal(typeof table, 'string');
      assert.match(table, /Routes:/);
      assert.match(table, /GET\s+\/users/);
      assert.match(table, /Transport:/);
    });

    it('excludes middleware explicitly disabled with false', () => {
      const router = createRouter({
        defaults: {logger: true, accepts: {types: ['application/json']}}
      });
      router.get('/items', {accepts: false, execute: noop});

      const table = formatRouteTable(router);
      const line = table.split('\n').find(l => l.includes('/items'));

      assert.match(line, /logger/);
      assert.doesNotMatch(line, /accepts/);
    });

    it('shows enabled without details for transport keys with non-display config', () => {
      const router = createRouter({
        transport: {requestId: {header: 'X-Custom-Id'}, security: {noSniff: true}}
      });
      router.get('/test', {execute: noop});

      const table = formatRouteTable(router);

      assert.match(table, /requestId: enabled$/m);
      assert.match(table, /security: enabled$/m);
    });

    it('handles transport keys set to true', () => {
      const router = createRouter({
        transport: {requestId: true, security: true}
      });
      router.get('/test', {execute: noop});

      const table = formatRouteTable(router);

      assert.match(table, /requestId: enabled$/m);
      assert.match(table, /security: enabled$/m);
    });

    it('shows route without middleware list when all keys are disabled', () => {
      const router = createRouter();
      router.post('/webhook', {body: false, execute: noop});

      const table = formatRouteTable(router);
      const line = table.split('\n').find(l => l.includes('/webhook'));

      assert.doesNotMatch(line, /\[/);
      assert.doesNotMatch(line, /\(custom\)/);
    });

    it('handles non-object transport values defensively', () => {
      const mockRouter = {
        _routes: [{method: 'GET', path: '/test', config: {execute: noop}, defaults: undefined}],
        _options: {transport: {requestId: 42, security: 'yes', rateLimit: false, cors: undefined}}
      };

      const table = formatRouteTable(mockRouter);

      assert.match(table, /requestId: enabled$/m);
      assert.match(table, /security: enabled$/m);
      assert.match(table, /rateLimit: disabled/);
      assert.match(table, /cors: disabled/);
    });
  });
});
