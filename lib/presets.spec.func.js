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
