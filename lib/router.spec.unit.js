/**
 * @fileoverview Layer 2 module tests for lib/router.
 * Tests dispatch logic using real router instances with mock req/res objects.
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import createRouter from './router.js';
import {createMockReq, createMockRes} from '../test/helpers.js';

/**
 * Dispatch a request through a router's handle() function.
 */
function dispatch(router, reqOverrides = {}) {
  const req = createMockReq(reqOverrides);
  const res = createMockRes();
  router.handle()(req, res);
  return {req, res};
}

describe('[Module] router dispatch', () => {
  describe('basic routing', () => {
    it('dispatches GET to a registered handler', () => {
      const router = createRouter();
      let called = false;
      router.get('/hello', (req, res) => {
        called = true;
        res.end('ok');
      });
      const {res} = dispatch(router, {method: 'GET', url: '/hello'});
      assert.ok(called);
      assert.equal(res._body, 'ok');
    });

    it('returns 404 with RFC 9457 body for an unknown path', () => {
      const router = createRouter();
      const {res} = dispatch(router, {method: 'GET', url: '/not-found'});
      assert.equal(res.statusCode, 404);
      const body = JSON.parse(res._body);
      assert.equal(body.status, 404);
      assert.equal(body.title, 'Not Found');
      assert.ok(body.type);
    });

    it('returns 405 with RFC 9457 body when path is known but method is not registered', () => {
      const router = createRouter();
      router.get('/resource', (req, res) => res.end('ok'));
      const {res} = dispatch(router, {method: 'DELETE', url: '/resource'});
      assert.equal(res.statusCode, 405);
      const body = JSON.parse(res._body);
      assert.equal(body.status, 405);
      assert.equal(body.title, 'Method Not Allowed');
      assert.ok(body.type);
    });

    it('sets Allow header on 405 responses', () => {
      const router = createRouter();
      router.get('/resource', (req, res) => res.end());
      const {res} = dispatch(router, {method: 'POST', url: '/resource'});
      const allow = res.getHeader('allow');
      assert.ok(allow.includes('GET'));
    });

    it('strips query string before matching', () => {
      const router = createRouter();
      router.get('/items', (req, res) => res.end('matched'));
      const {res} = dispatch(router, {method: 'GET', url: '/items?foo=bar'});
      assert.equal(res._body, 'matched');
    });

    it('passes route params as third argument to raw function handlers', () => {
      const router = createRouter();
      let capturedParams;
      router.get('/users/:id', (req, res, params) => {
        capturedParams = params;
        res.end('ok');
      });
      dispatch(router, {method: 'GET', url: '/users/42'});
      assert.equal(capturedParams.id, '42');
    });

    it('registers routes for all HTTP methods (get/post/put/patch/delete)', () => {
      const router = createRouter();
      const results = {};
      router.get('/r', (req, res) => {
        results.get = true;
        res.end();
      });
      router.post('/r', (req, res) => {
        results.post = true;
        res.end();
      });
      router.put('/r', (req, res) => {
        results.put = true;
        res.end();
      });
      router.patch('/r', (req, res) => {
        results.patch = true;
        res.end();
      });
      router.delete('/r', (req, res) => {
        results.delete = true;
        res.end();
      });

      dispatch(router, {method: 'GET', url: '/r'});
      dispatch(router, {method: 'POST', url: '/r', headers: {'content-type': 'application/json'}});
      dispatch(router, {method: 'PUT', url: '/r', headers: {'content-type': 'application/json'}});
      dispatch(router, {method: 'PATCH', url: '/r', headers: {'content-type': 'application/json'}});
      dispatch(router, {method: 'DELETE', url: '/r'});

      assert.ok(results.get && results.post && results.put && results.patch && results.delete);
    });
  });

  describe('declarative route config', () => {
    it('accepts an object config and produces a working handler', async () => {
      const router = createRouter({transport: {requestId: false, security: false}});
      router.get('/data', {
        execute: () => ({response: {body: {ok: true}}})
      });
      const {res} = dispatch(router, {method: 'GET', url: '/data'});
      // Declarative routes produce async handlers — verify no immediate error
      assert.notEqual(res.statusCode, 500);
    });

    it('array pipeline still works as escape hatch', () => {
      const router = createRouter();
      router.get('/raw', [() => ({response: {body: {ok: true}}})]);
      dispatch(router, {method: 'GET', url: '/raw'});
      assert.ok(true, 'array pipeline dispatches without sync error');
    });

    it('raw function handlers still receive (req, res, params)', () => {
      const router = createRouter();
      let receivedParams;
      router.get('/users/:id', (req, res, params) => {
        receivedParams = params;
        res.end('ok');
      });
      dispatch(router, {method: 'GET', url: '/users/7'});
      assert.equal(receivedParams.id, '7');
    });
  });

  describe('POST/DELETE default status codes', () => {
    it('sets default statusCode=201 for POST routes', () => {
      const router = createRouter();
      router.post('/items', (req, res) => {
        res.end('created');
      });
      const {res} = dispatch(router, {
        method: 'POST',
        url: '/items',
        headers: {'content-type': 'application/json'}
      });
      assert.equal(res.statusCode, 201);
    });

    it('sets default statusCode=204 for DELETE routes', () => {
      const router = createRouter();
      router.delete('/items/:id', (req, res) => {
        res.end();
      });
      const {res} = dispatch(router, {method: 'DELETE', url: '/items/1'});
      assert.equal(res.statusCode, 204);
    });
  });

  describe('HEAD method (RFC 7230 §3.3)', () => {
    it('uses GET handler for HEAD requests', () => {
      const router = createRouter();
      let handlerCalled = false;
      router.get('/data', (req, res) => {
        handlerCalled = true;
        res.end('body content');
      });
      dispatch(router, {method: 'HEAD', url: '/data'});
      assert.ok(handlerCalled, 'GET handler should be invoked for HEAD');
    });

    it('suppresses body in HEAD responses (write returns without sending bytes)', () => {
      const router = createRouter();
      router.get('/data', (req, res) => {
        res.write('chunk1');
        res.end('chunk2');
      });
      const req = createMockReq({method: 'HEAD', url: '/data'});
      const res = createMockRes();

      // Track actual write calls to the original res
      const origWrite = res.write.bind(res);
      const writeCalls = [];
      res.write = chunk => {
        writeCalls.push(chunk);
        return origWrite(chunk);
      };

      router.handle()(req, res);
      // suppressBody replaces res.write so origWrite is never called with body
      assert.equal(writeCalls.length, 0, 'write should be suppressed for HEAD');
    });

    it('returns 404 for HEAD on non-existent path', () => {
      const router = createRouter();
      const {res} = dispatch(router, {method: 'HEAD', url: '/missing'});
      assert.equal(res.statusCode, 404);
    });
  });

  describe('OPTIONS automatic response', () => {
    it('returns 204 with Allow header for known paths', () => {
      const router = createRouter();
      router.get('/things', (req, res) => res.end());
      router.post('/things', (req, res) => res.end());
      const {res} = dispatch(router, {method: 'OPTIONS', url: '/things'});
      assert.equal(res.statusCode, 204);
      const allow = res.getHeader('allow');
      assert.ok(allow.includes('GET'));
      assert.ok(allow.includes('POST'));
      assert.ok(allow.includes('OPTIONS'));
    });
  });

  describe('PATCH Content-Type enforcement (strictPatch=true)', () => {
    it('returns 415 with RFC 9457 body for PATCH without a valid Content-Type', () => {
      const router = createRouter({strictPatch: true});
      router.patch('/items/:id', (req, res) => res.end());
      const {res} = dispatch(router, {
        method: 'PATCH',
        url: '/items/1',
        headers: {'content-type': 'text/plain'}
      });
      assert.equal(res.statusCode, 415);
      const body = JSON.parse(res._body);
      assert.equal(body.status, 415);
      assert.equal(body.title, 'Unsupported Media Type');
    });

    it('sets Accept-Patch header on 415 response', () => {
      const router = createRouter({strictPatch: true});
      router.patch('/items/:id', (req, res) => res.end());
      const {res} = dispatch(router, {
        method: 'PATCH',
        url: '/items/1',
        headers: {'content-type': 'text/html'}
      });
      assert.ok(res.getHeader('accept-patch'));
    });

    it('allows PATCH with application/json', () => {
      const router = createRouter({strictPatch: true});
      let called = false;
      router.patch('/items/:id', (req, res) => {
        called = true;
        res.end();
      });
      dispatch(router, {
        method: 'PATCH',
        url: '/items/1',
        headers: {'content-type': 'application/json'}
      });
      assert.ok(called);
    });

    it('allows PATCH with application/merge-patch+json', () => {
      const router = createRouter({strictPatch: true});
      let called = false;
      router.patch('/items/:id', (req, res) => {
        called = true;
        res.end();
      });
      dispatch(router, {
        method: 'PATCH',
        url: '/items/1',
        headers: {'content-type': 'application/merge-patch+json'}
      });
      assert.ok(called);
    });

    it('can disable PATCH enforcement with strictPatch=false', () => {
      const router = createRouter({strictPatch: false});
      let called = false;
      router.patch('/items/:id', (req, res) => {
        called = true;
        res.end();
      });
      dispatch(router, {
        method: 'PATCH',
        url: '/items/1',
        headers: {'content-type': 'text/plain'}
      });
      assert.ok(called);
    });
  });

  describe('POST/PUT Content-Type enforcement (strictBody=true)', () => {
    it('returns 415 for POST without Content-Type header', () => {
      const router = createRouter({strictBody: true});
      router.post('/items', (req, res) => res.end());
      const {res} = dispatch(router, {method: 'POST', url: '/items'});
      assert.equal(res.statusCode, 415);
      const body = JSON.parse(res._body);
      assert.equal(body.status, 415);
    });

    it('returns 415 for PUT without Content-Type header', () => {
      const router = createRouter({strictBody: true});
      router.put('/items/:id', (req, res) => res.end());
      const {res} = dispatch(router, {method: 'PUT', url: '/items/1'});
      assert.equal(res.statusCode, 415);
      const body = JSON.parse(res._body);
      assert.equal(body.status, 415);
    });

    it('allows POST with a Content-Type header', () => {
      const router = createRouter({strictBody: true});
      let called = false;
      router.post('/items', (req, res) => {
        called = true;
        res.end();
      });
      dispatch(router, {
        method: 'POST',
        url: '/items',
        headers: {'content-type': 'application/json'}
      });
      assert.ok(called);
    });

    it('allows PUT with a Content-Type header', () => {
      const router = createRouter({strictBody: true});
      let called = false;
      router.put('/items/:id', (req, res) => {
        called = true;
        res.end();
      });
      dispatch(router, {
        method: 'PUT',
        url: '/items/1',
        headers: {'content-type': 'application/json'}
      });
      assert.ok(called);
    });

    it('does not enforce Content-Type on GET or DELETE', () => {
      const router = createRouter({strictBody: true});
      let getCalled = false;
      let deleteCalled = false;
      router.get('/items', (req, res) => {
        getCalled = true;
        res.end();
      });
      router.delete('/items/:id', (req, res) => {
        deleteCalled = true;
        res.end();
      });
      dispatch(router, {method: 'GET', url: '/items'});
      dispatch(router, {method: 'DELETE', url: '/items/1'});
      assert.ok(getCalled);
      assert.ok(deleteCalled);
    });

    it('can disable POST/PUT enforcement with strictBody=false', () => {
      const router = createRouter({strictBody: false});
      let called = false;
      router.post('/items', (req, res) => {
        called = true;
        res.end();
      });
      dispatch(router, {method: 'POST', url: '/items'});
      assert.ok(called);
    });

    it('strictBody defaults to true', () => {
      const router = createRouter();
      router.post('/items', (req, res) => res.end());
      const {res} = dispatch(router, {method: 'POST', url: '/items'});
      assert.equal(res.statusCode, 415);
    });
  });

  describe('use() middleware', () => {
    it('stores middleware functions in appMiddleware (prepended to array pipelines)', () => {
      // use() stores middleware for later composition with array pipelines via auto-wrap.
      // Plain function routes bypass auto-wrap, so appMiddleware is not prepended there.
      const router = createRouter();
      const mw = () => {};
      router.use(mw);
      assert.ok(router._middleware.includes(mw));
    });

    it('accepts multiple use() calls', () => {
      const router = createRouter();
      const a = () => {};
      const b = () => {};
      router.use(a, b);
      assert.equal(router._middleware.length, 2);
    });
  });

  describe('mount() sub-router', () => {
    it('routes to a sub-router with prefix', () => {
      const parent = createRouter();
      const child = createRouter();
      let called = false;
      child.get('/health', (req, res) => {
        called = true;
        res.end('ok');
      });
      parent.mount('/api', child);
      dispatch(parent, {method: 'GET', url: '/api/health'});
      assert.ok(called);
    });

    it('returns 404 for sub-router path without prefix', () => {
      const parent = createRouter();
      const child = createRouter();
      child.get('/health', (req, res) => res.end('ok'));
      parent.mount('/api', child);
      const {res} = dispatch(parent, {method: 'GET', url: '/health'});
      assert.equal(res.statusCode, 404);
    });
  });

  describe('router.listen()', () => {
    it('creates an HTTP server and starts listening, returns the server', done => {
      const router = createRouter();
      router.get('/ping', (req, res) => {
        res.statusCode = 200;
        res.end('pong');
      });
      const server = router.listen(0, '127.0.0.1', () => {
        const {port} = server.address();
        assert.ok(port > 0, 'should bind to an ephemeral port');
        server.closeAllConnections();
        server.close(done);
      });
    });
  });

  describe('router.handle() chainability', () => {
    it('route registrations return the router (chainable)', () => {
      const router = createRouter();
      const result = router.get('/a', (req, res) => res.end());
      assert.equal(result, router);
    });

    it('use() returns the router (chainable)', () => {
      const router = createRouter();
      const result = router.use((req, res, next) => {
        if (next) next();
      });
      assert.equal(result, router);
    });

    it('mount() returns the router (chainable)', () => {
      const parent = createRouter();
      const child = createRouter();
      const result = parent.mount('/v1', child);
      assert.equal(result, parent);
    });
  });
});
