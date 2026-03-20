/**
 * @fileoverview Layer 2/3 tests for lib/auto-wrap with ergo array pipelines.
 * Exercises the array pipeline composition path (ergo present) including
 * noSend, custom catchHandler, custom formatError, and error normalization.
 */
import {describe, it, before, after} from 'node:test';
import assert from 'node:assert/strict';
import createRouter from './router.js';
import createAutoWrap from './auto-wrap.js';
import {setupServer, fetch, createMockReq, createMockRes} from '../test/helpers.js';

// ---------------------------------------------------------------------------
// Layer 1: createAutoWrap unit tests
// ---------------------------------------------------------------------------
describe('[Boundary] auto-wrap', () => {
  it('returns the function unchanged when pipeline is already a function', () => {
    const wrap = createAutoWrap();
    const fn = () => {};
    assert.equal(wrap(fn), fn);
  });

  it('returns a function for array pipeline', () => {
    const wrap = createAutoWrap();
    const result = wrap([() => ({statusCode: 200})]);
    assert.equal(typeof result, 'function');
  });

  it('returns a 500-handler for non-array/non-function pipeline', () => {
    const wrap = createAutoWrap();
    const result = wrap(42);
    const res = createMockRes();
    const req = createMockReq();
    result(req, res);
    assert.equal(res.statusCode, 500);
  });
});

// ---------------------------------------------------------------------------
// Layer 3: Full HTTP integration for array pipelines
// ---------------------------------------------------------------------------
describe('[Contract] auto-wrap – array pipeline with ergo', () => {
  let baseUrl, close;

  before(async () => {
    const router = createRouter({transport: {requestId: false, security: false}});

    // Array pipeline: auto-wrapped with compose + handler + send
    router.get('/data', [() => ({statusCode: 200, body: {message: 'from array pipeline'}})]);

    router.post('/created', [() => ({body: {id: 1}})]);

    router.get('/error', [
      () => {
        const err = new Error('intentional error');
        err.statusCode = 422;
        throw err;
      }
    ]);

    ({baseUrl, close} = await setupServer(router.handle()));
  });

  after(() => close());

  it('executes an array pipeline and returns JSON response', async () => {
    const res = await fetch(`${baseUrl}/data`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.message, 'from array pipeline');
  });

  it('POST route with array pipeline uses default 201 status', async () => {
    const res = await fetch(`${baseUrl}/created`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: '{}'
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.id, 1);
  });

  it('errors thrown in array pipeline are caught and formatted as RFC 9457', async () => {
    const res = await fetch(`${baseUrl}/error`);
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.status, 422);
    assert.equal(body.title, 'Unprocessable Entity');
    assert.ok(body.detail);
    assert.ok(body.type);
  });
});

describe('[Contract] auto-wrap – noSend option', () => {
  let baseUrl, close;

  before(async () => {
    const router = createRouter({transport: {requestId: false, security: false}});

    router.get(
      '/raw',
      [
        (req, res) => {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'text/plain');
          res.end('manual response');
        }
      ],
      {noSend: true}
    );

    ({baseUrl, close} = await setupServer(router.handle()));
  });

  after(() => close());

  it('noSend=true skips implicit send() and handler writes response directly', async () => {
    const res = await fetch(`${baseUrl}/raw`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'manual response');
  });
});

describe('[Contract] auto-wrap – custom catchHandler', () => {
  let baseUrl, close;

  before(async () => {
    const router = createRouter({
      transport: {requestId: false, security: false},
      catchHandler: (req, res, err) => {
        res.statusCode = err.statusCode || 500;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({custom: true, message: err.message}));
      }
    });

    router.get('/fail', [
      () => {
        const err = new Error('custom catch');
        err.statusCode = 409;
        throw err;
      }
    ]);

    ({baseUrl, close} = await setupServer(router.handle()));
  });

  after(() => close());

  it('custom catchHandler receives the thrown error', async () => {
    const res = await fetch(`${baseUrl}/fail`);
    assert.equal(res.status, 409);
    const body = await res.json();
    assert.equal(body.custom, true);
    assert.equal(body.message, 'custom catch');
  });
});

describe('[Contract] auto-wrap – error response includes requestId from response header', () => {
  let baseUrl, close;

  before(async () => {
    const router = createRouter({
      transport: {requestId: {}, security: false}
    });

    router.get('/fail', [
      () => {
        const err = new Error('should include requestId');
        err.statusCode = 422;
        throw err;
      }
    ]);

    ({baseUrl, close} = await setupServer(router.handle()));
  });

  after(() => close());

  it('error response body includes instance (urn:uuid) from transport requestId', async () => {
    const res = await fetch(`${baseUrl}/fail`);
    assert.equal(res.status, 422);
    const body = await res.json();
    const requestId = res.headers.get('x-request-id');
    assert.ok(body.instance, 'error body should include instance');
    assert.equal(body.instance, `urn:uuid:${requestId}`);
    assert.equal(body.status, 422);
    assert.ok(body.type);
    assert.ok(body.title);
  });
});

describe('[Contract] auto-wrap – custom formatError', () => {
  let baseUrl, close;

  before(async () => {
    const router = createRouter({
      transport: {requestId: false, security: false},
      formatError: err => ({
        statusCode: err.statusCode || 500,
        body: {formatted: true, code: err.statusCode || 500}
      })
    });

    router.get('/fail', [
      () => {
        const err = new Error('formatted');
        err.statusCode = 418;
        throw err;
      }
    ]);

    ({baseUrl, close} = await setupServer(router.handle()));
  });

  after(() => close());

  it('custom formatError shapes the error response body', async () => {
    const res = await fetch(`${baseUrl}/fail`);
    assert.equal(res.status, 418);
    const body = await res.json();
    assert.equal(body.formatted, true);
    assert.equal(body.code, 418);
  });
});

describe('[Contract] auto-wrap – route params via accumulator', () => {
  let baseUrl, close;

  before(async () => {
    const router = createRouter({transport: {requestId: false, security: false}});

    router.get('/users/:id', [
      (req, res, acc) => ({statusCode: 200, body: {id: acc.route.params.id}})
    ]);

    ({baseUrl, close} = await setupServer(router.handle()));
  });

  after(() => close());

  it('route params are available at acc.route.params in array pipelines', async () => {
    const res = await fetch(`${baseUrl}/users/42`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.id, '42');
  });
});

describe('[Contract] auto-wrap – error message redaction', () => {
  let baseUrl, close;

  before(async () => {
    const router = createRouter({transport: {requestId: false, security: false}});

    router.get('/unexpected', [
      () => {
        throw new Error('database connection failed at /internal/db.js:42');
      }
    ]);

    router.get('/known', [
      () => {
        const err = new Error('bad input format');
        err.statusCode = 400;
        throw err;
      }
    ]);

    ({baseUrl, close} = await setupServer(router.handle()));
  });

  after(() => close());

  it('unexpected errors (no statusCode) use generic 500 message, not raw err.message', async () => {
    const res = await fetch(`${baseUrl}/unexpected`);
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.ok(!body.detail?.includes('database connection'));
    assert.ok(!body.detail?.includes('/internal/db.js'));
  });

  it('errors with explicit statusCode preserve their message', async () => {
    const res = await fetch(`${baseUrl}/known`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.detail, 'bad input format');
  });
});

describe('[Contract] auto-wrap – toJSON 5xx redaction', () => {
  let baseUrl, close;

  before(async () => {
    const router = createRouter({transport: {requestId: false, security: false}});

    router.get('/toJSON-500', [
      () => {
        const err = new Error('internal detail from dependency');
        err.statusCode = 500;
        err.toJSON = () => ({
          status: 500,
          title: 'Internal Server Error',
          detail: 'internal detail from dependency'
        });
        throw err;
      }
    ]);

    router.get('/toJSON-400', [
      () => {
        const err = new Error('bad request detail');
        err.statusCode = 400;
        err.toJSON = () => ({
          status: 400,
          title: 'Bad Request',
          detail: 'bad request detail'
        });
        throw err;
      }
    ]);

    ({baseUrl, close} = await setupServer(router.handle()));
  });

  after(() => close());

  it('redacts detail for 500 errors with toJSON', async () => {
    const res = await fetch(`${baseUrl}/toJSON-500`);
    assert.equal(res.status, 500);
    const body = await res.json();
    assert.ok(!body.detail?.includes('internal detail from dependency'));
  });

  it('preserves detail for 4xx errors with toJSON', async () => {
    const res = await fetch(`${baseUrl}/toJSON-400`);
    assert.equal(res.status, 400);
    const body = await res.json();
    assert.equal(body.detail, 'bad request detail');
  });
});

describe('[Contract] auto-wrap – appMiddleware via use()', () => {
  let baseUrl, close;

  before(async () => {
    const router = createRouter({transport: {requestId: false, security: false}});

    // use() middleware that adds a property to accumulator
    router.use(() => ({middlewareRan: true}));

    router.get('/check', [
      (req, res, acc) => {
        return {statusCode: 200, body: {middlewareRan: acc.middlewareRan ?? false}};
      }
    ]);

    ({baseUrl, close} = await setupServer(router.handle()));
  });

  after(() => close());

  it('use() middleware runs before route pipeline steps', async () => {
    const res = await fetch(`${baseUrl}/check`);
    const body = await res.json();
    assert.equal(body.middlewareRan, true);
  });
});
