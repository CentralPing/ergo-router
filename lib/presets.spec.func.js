/**
 * @fileoverview Layer 3 contract tests for presets used with a real HTTP server.
 *
 * Verifies that spreading presets.jsonApi into createRouter() produces the
 * expected transport and content-negotiation behavior at the HTTP level.
 */
import {describe, it, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {setupServer, fetch} from '../test/helpers.js';
import createRouter from './router.js';
import {presets} from './presets.js';

describe('[Contract] presets.jsonApi – HTTP behavior', () => {
  let baseUrl, close;

  before(async () => {
    const router = createRouter({
      ...presets.jsonApi
    });

    router.get('/items', {
      execute: () => ({response: {body: {items: []}}})
    });

    ({baseUrl, close} = await setupServer(router.handle()));
  });

  after(() => close());

  it('returns JSON response for application/json Accept', async () => {
    const res = await fetch(`${baseUrl}/items`, {
      headers: {accept: 'application/json'}
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, {items: []});
  });

  it('returns 406 for non-JSON Accept header', async () => {
    const res = await fetch(`${baseUrl}/items`, {
      headers: {accept: 'text/html'}
    });
    assert.equal(res.status, 406);
  });

  it('includes x-request-id response header', async () => {
    const res = await fetch(`${baseUrl}/items`, {
      headers: {accept: 'application/json'}
    });
    const requestId = res.headers.get('x-request-id');
    assert.ok(requestId, 'x-request-id header should be present');
    assert.ok(requestId.length > 0);
  });

  it('includes security headers', async () => {
    const res = await fetch(`${baseUrl}/items`, {
      headers: {accept: 'application/json'}
    });
    assert.ok(
      res.headers.get('x-content-type-options'),
      'x-content-type-options should be present'
    );
  });

  it('security headers present even on 406 error responses', async () => {
    const res = await fetch(`${baseUrl}/items`, {
      headers: {accept: 'text/html'}
    });
    assert.equal(res.status, 406);
    assert.ok(res.headers.get('x-request-id'), 'x-request-id on error');
    assert.ok(res.headers.get('x-content-type-options'), 'security headers on error');
  });
});

describe('[Contract] presets.jsonApi – override semantics', () => {
  let baseUrl, close;

  before(async () => {
    const router = createRouter({
      ...presets.jsonApi,
      defaults: {...presets.jsonApi.defaults, timeout: {ms: 30000}}
    });

    router.get('/check', {
      execute: () => ({response: {body: {ok: true}}})
    });

    ({baseUrl, close} = await setupServer(router.handle()));
  });

  after(() => close());

  it('preserves accepts from preset when defaults are extended', async () => {
    const res = await fetch(`${baseUrl}/check`, {
      headers: {accept: 'text/html'}
    });
    assert.equal(res.status, 406);
  });

  it('still serves JSON correctly when defaults are extended', async () => {
    const res = await fetch(`${baseUrl}/check`, {
      headers: {accept: 'application/json'}
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, {ok: true});
  });
});

describe('[Contract] presets.sse – HTTP behavior', () => {
  let baseUrl, close;

  before(async () => {
    const router = createRouter({
      ...presets.sse
    });

    router.get('/events', {
      noSend: true,
      execute: (_req, res) => {
        res.writeHead(200, {'content-type': 'text/event-stream'});
        res.end('data: hello\n\n');
      }
    });

    router.get('/sse-check', {
      execute: () => ({response: {body: {ok: true}}})
    });

    ({baseUrl, close} = await setupServer(router.handle()));
  });

  after(() => close());

  it('accepts text/event-stream on noSend route', async () => {
    const res = await fetch(`${baseUrl}/events`, {
      headers: {accept: 'text/event-stream'}
    });
    assert.equal(res.status, 200);
    const body = await res.text();
    assert.equal(body, 'data: hello\n\n');
  });

  it('returns 406 for non-event-stream Accept header', async () => {
    const res = await fetch(`${baseUrl}/sse-check`, {
      headers: {accept: 'text/html'}
    });
    assert.equal(res.status, 406);
  });

  it('includes x-request-id response header', async () => {
    const res = await fetch(`${baseUrl}/sse-check`, {
      headers: {accept: 'text/event-stream'}
    });
    const requestId = res.headers.get('x-request-id');
    assert.ok(requestId, 'x-request-id header should be present');
    assert.ok(requestId.length > 0);
  });

  it('includes security headers', async () => {
    const res = await fetch(`${baseUrl}/sse-check`, {
      headers: {accept: 'text/event-stream'}
    });
    assert.ok(
      res.headers.get('x-content-type-options'),
      'x-content-type-options should be present'
    );
  });

  it('does not apply compression on noSend route', async () => {
    const res = await fetch(`${baseUrl}/events`, {
      headers: {accept: 'text/event-stream', 'accept-encoding': 'gzip, deflate, br'}
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('content-encoding'), null);
  });
});

describe('[Contract] presets.webhooks – HTTP behavior', () => {
  let baseUrl, close;

  before(async () => {
    const router = createRouter({
      ...presets.webhooks
    });

    router.post('/hooks', {
      execute: (_req, _res, acc) => ({
        response: {body: {received: true, idempotencyKey: acc.idempotency?.key}}
      })
    });

    ({baseUrl, close} = await setupServer(router.handle()));
  });

  after(() => close());

  it('accepts application/json with Idempotency-Key', async () => {
    const res = await fetch(`${baseUrl}/hooks`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'idempotency-key': '"test-key-123"'
      },
      body: JSON.stringify({event: 'test'})
    });
    assert.ok([200, 201].includes(res.status), `expected 200 or 201, got ${res.status}`);
    const body = await res.json();
    assert.equal(body.received, true);
  });

  it('returns 406 for non-JSON Accept header', async () => {
    const res = await fetch(`${baseUrl}/hooks`, {
      method: 'POST',
      headers: {
        accept: 'text/html',
        'content-type': 'application/json',
        'idempotency-key': '"test-key-456"'
      },
      body: JSON.stringify({event: 'test'})
    });
    assert.equal(res.status, 406);
  });

  it('includes x-request-id response header', async () => {
    const res = await fetch(`${baseUrl}/hooks`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'idempotency-key': '"test-key-789"'
      },
      body: JSON.stringify({event: 'test'})
    });
    const requestId = res.headers.get('x-request-id');
    assert.ok(requestId, 'x-request-id header should be present');
  });

  it('includes security headers', async () => {
    const res = await fetch(`${baseUrl}/hooks`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json',
        'idempotency-key': '"test-key-abc"'
      },
      body: JSON.stringify({event: 'test'})
    });
    assert.ok(
      res.headers.get('x-content-type-options'),
      'x-content-type-options should be present'
    );
  });

  it('returns 400 when Idempotency-Key header is missing', async () => {
    const res = await fetch(`${baseUrl}/hooks`, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'content-type': 'application/json'
      },
      body: JSON.stringify({event: 'test'})
    });
    assert.equal(res.status, 400);
  });
});

describe('[Contract] presets.public – HTTP behavior', () => {
  let baseUrl, close;

  before(async () => {
    const router = createRouter({
      ...presets.public
    });

    router.get('/data', {
      execute: () => ({response: {body: {items: []}}})
    });

    ({baseUrl, close} = await setupServer(router.handle()));
  });

  after(() => close());

  it('accepts application/json', async () => {
    const res = await fetch(`${baseUrl}/data`, {
      headers: {accept: 'application/json'}
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, {items: []});
  });

  it('returns 406 for non-JSON Accept header', async () => {
    const res = await fetch(`${baseUrl}/data`, {
      headers: {accept: 'text/html'}
    });
    assert.equal(res.status, 406);
  });

  it('includes x-request-id response header', async () => {
    const res = await fetch(`${baseUrl}/data`, {
      headers: {accept: 'application/json'}
    });
    const requestId = res.headers.get('x-request-id');
    assert.ok(requestId, 'x-request-id header should be present');
  });

  it('includes security headers', async () => {
    const res = await fetch(`${baseUrl}/data`, {
      headers: {accept: 'application/json'}
    });
    assert.ok(
      res.headers.get('x-content-type-options'),
      'x-content-type-options should be present'
    );
  });

  it('includes rate limit headers', async () => {
    const res = await fetch(`${baseUrl}/data`, {
      headers: {accept: 'application/json'}
    });
    assert.ok(res.headers.get('x-ratelimit-limit'), 'x-ratelimit-limit should be present');
    assert.ok(res.headers.get('x-ratelimit-remaining'), 'x-ratelimit-remaining should be present');
    assert.ok(res.headers.get('x-ratelimit-reset'), 'x-ratelimit-reset should be present');
  });

  it('includes Cache-Control header', async () => {
    const res = await fetch(`${baseUrl}/data`, {
      headers: {accept: 'application/json'}
    });
    const cacheControl = res.headers.get('cache-control');
    assert.ok(cacheControl, 'cache-control should be present');
    assert.ok(cacheControl.includes('public'), 'cache-control should include public');
    assert.ok(cacheControl.includes('max-age=300'), 'cache-control should include max-age=300');
  });
});
