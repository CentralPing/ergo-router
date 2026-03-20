/**
 * @fileoverview Layer 2 module tests for lib/transport/index.
 * Tests the orchestration of transport concerns: order, short-circuit, and passthrough.
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import buildTransport from './index.js';
import {createMockReq, createMockRes} from '../../test/helpers.js';

describe('[Module] transport/index', () => {
  describe('run() basics', () => {
    it('returns {stop: false, requestId} for a plain request with no config', () => {
      const transport = buildTransport({});
      const req = createMockReq();
      const res = createMockRes();
      const result = transport.run(req, res);
      assert.equal(result.stop, false);
    });

    it('sets a request ID header by default (requestId enabled by default)', () => {
      const transport = buildTransport({});
      const req = createMockReq();
      const res = createMockRes();
      transport.run(req, res);
      assert.ok(res.getHeader('x-request-id'), 'x-request-id should be set by default');
    });

    it('returns requestId from run()', () => {
      const transport = buildTransport({});
      const req = createMockReq();
      const res = createMockRes();
      const {requestId} = transport.run(req, res);
      assert.equal(requestId, res.getHeader('x-request-id'));
    });

    it('can disable requestId', () => {
      const transport = buildTransport({requestId: false});
      const res = createMockRes();
      const {requestId} = transport.run(createMockReq(), res);
      assert.equal(requestId, undefined);
      assert.equal(res.getHeader('x-request-id'), undefined);
    });
  });

  describe('security headers', () => {
    it('applies security headers to every response by default', () => {
      const transport = buildTransport({});
      const res = createMockRes();
      transport.run(createMockReq(), res);
      assert.equal(res.getHeader('x-content-type-options'), 'nosniff');
    });

    it('can disable security headers entirely', () => {
      const transport = buildTransport({security: false});
      const res = createMockRes();
      transport.run(createMockReq(), res);
      assert.equal(res.getHeader('x-content-type-options'), undefined);
    });
  });

  describe('rate limiting short-circuit', () => {
    it('returns stop=true and ends the response with RFC 9457 body when rate limited', () => {
      const transport = buildTransport({rateLimit: {max: 1, windowMs: 60000}});
      // First request passes
      transport.run(createMockReq(), createMockRes());
      // Second request exceeds max=1
      const res = createMockRes();
      const {stop} = transport.run(createMockReq(), res);
      assert.equal(stop, true);
      assert.equal(res.statusCode, 429);
      assert.ok(res.writableEnded);
      assert.equal(res.getHeader('content-type'), 'application/problem+json; charset=utf-8');
      const body = JSON.parse(res._body);
      assert.equal(body.status, 429);
      assert.equal(body.title, 'Too Many Requests');
    });

    it('does not apply rate limiting when not configured', () => {
      const transport = buildTransport({});
      const res = createMockRes();
      const {stop} = transport.run(createMockReq(), res);
      assert.equal(stop, false);
      assert.equal(res.statusCode, 200);
    });
  });

  describe('CORS preflight short-circuit', () => {
    it('returns stop=true for CORS preflight', () => {
      const transport = buildTransport({cors: {origin: '*'}});
      const req = createMockReq({
        method: 'OPTIONS',
        headers: {
          origin: 'https://example.com',
          'access-control-request-method': 'GET'
        }
      });
      const res = createMockRes();
      const {stop} = transport.run(req, res, new Set(['GET']));
      assert.equal(stop, true);
      assert.equal(res.statusCode, 204);
    });

    it('sets CORS headers on non-preflight cross-origin requests', () => {
      const transport = buildTransport({cors: {origin: '*'}});
      const req = createMockReq({headers: {origin: 'https://example.com'}});
      const res = createMockRes();
      transport.run(req, res, new Set(['GET']));
      assert.equal(res.getHeader('access-control-allow-origin'), '*');
    });
  });
});
