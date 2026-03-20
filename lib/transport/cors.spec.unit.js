/**
 * @fileoverview Layer 1 boundary tests for lib/transport/cors.
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import createCors from './cors.js';
import {createMockReq, createMockRes} from '../../test/helpers.js';

describe('[Boundary] transport/cors', () => {
  describe('preflight()', () => {
    it('returns false for non-OPTIONS requests', () => {
      const cors = createCors({origin: '*'});
      const req = createMockReq({method: 'GET', headers: {origin: 'https://example.com'}});
      const res = createMockRes();
      assert.equal(cors.preflight(req, res, new Set(['GET'])), false);
    });

    it('returns false for OPTIONS without Origin header', () => {
      const cors = createCors({origin: '*'});
      const req = createMockReq({
        method: 'OPTIONS',
        headers: {'access-control-request-method': 'GET'}
      });
      const res = createMockRes();
      assert.equal(cors.preflight(req, res, new Set(['GET'])), false);
    });

    it('returns false for OPTIONS without Access-Control-Request-Method', () => {
      const cors = createCors({origin: '*'});
      const req = createMockReq({
        method: 'OPTIONS',
        headers: {origin: 'https://example.com'}
      });
      const res = createMockRes();
      assert.equal(cors.preflight(req, res, new Set(['GET'])), false);
    });

    it('handles preflight with wildcard origin', () => {
      const cors = createCors({origin: '*'});
      const req = createMockReq({
        method: 'OPTIONS',
        headers: {
          origin: 'https://example.com',
          'access-control-request-method': 'GET'
        }
      });
      const res = createMockRes();
      const handled = cors.preflight(req, res, new Set(['GET']));
      assert.equal(handled, true);
      assert.equal(res.statusCode, 204);
      assert.equal(res.getHeader('access-control-allow-origin'), '*');
    });

    it('rejects preflight from a disallowed origin with 403', () => {
      const cors = createCors({origin: 'https://allowed.com'});
      const req = createMockReq({
        method: 'OPTIONS',
        headers: {
          origin: 'https://evil.com',
          'access-control-request-method': 'GET'
        }
      });
      const res = createMockRes();
      const handled = cors.preflight(req, res, new Set(['GET']));
      assert.equal(handled, true);
      assert.equal(res.statusCode, 403);
    });

    it('echoes the request origin when origin is not wildcard', () => {
      const cors = createCors({origin: 'https://allowed.com'});
      const req = createMockReq({
        method: 'OPTIONS',
        headers: {
          origin: 'https://allowed.com',
          'access-control-request-method': 'GET'
        }
      });
      const res = createMockRes();
      cors.preflight(req, res, new Set(['GET']));
      assert.equal(res.getHeader('access-control-allow-origin'), 'https://allowed.com');
    });

    it('adds Vary: Origin for non-wildcard origins', () => {
      const cors = createCors({origin: ['https://a.com', 'https://b.com']});
      const req = createMockReq({
        method: 'OPTIONS',
        headers: {
          origin: 'https://a.com',
          'access-control-request-method': 'GET'
        }
      });
      const res = createMockRes();
      cors.preflight(req, res, new Set(['GET']));
      assert.ok(String(res.getHeader('vary') || '').includes('Origin'));
    });

    it('uses registered methods when allowedMethods is not configured', () => {
      const cors = createCors({origin: '*'});
      const registeredMethods = new Set(['GET', 'POST']);
      const req = createMockReq({
        method: 'OPTIONS',
        headers: {
          origin: 'https://example.com',
          'access-control-request-method': 'POST'
        }
      });
      const res = createMockRes();
      cors.preflight(req, res, registeredMethods);
      const allowMethods = res.getHeader('access-control-allow-methods');
      assert.ok(allowMethods.includes('GET') && allowMethods.includes('POST'));
    });

    it('sets Access-Control-Allow-Credentials when credentials=true', () => {
      const cors = createCors({origin: 'https://trusted.com', credentials: true});
      const req = createMockReq({
        method: 'OPTIONS',
        headers: {
          origin: 'https://trusted.com',
          'access-control-request-method': 'GET'
        }
      });
      const res = createMockRes();
      cors.preflight(req, res, new Set(['GET']));
      assert.equal(res.getHeader('access-control-allow-credentials'), 'true');
    });

    it('sets Access-Control-Max-Age', () => {
      const cors = createCors({origin: '*', maxAge: 3600});
      const req = createMockReq({
        method: 'OPTIONS',
        headers: {
          origin: 'https://example.com',
          'access-control-request-method': 'GET'
        }
      });
      const res = createMockRes();
      cors.preflight(req, res, new Set(['GET']));
      assert.equal(res.getHeader('access-control-max-age'), '3600');
    });

    it('accepts origin from an array of allowed origins', () => {
      const cors = createCors({origin: ['https://a.com', 'https://b.com']});
      const req = createMockReq({
        method: 'OPTIONS',
        headers: {
          origin: 'https://b.com',
          'access-control-request-method': 'GET'
        }
      });
      const res = createMockRes();
      const handled = cors.preflight(req, res, new Set(['GET']));
      assert.equal(handled, true);
      assert.equal(res.statusCode, 204);
    });

    it('accepts origin via function predicate', () => {
      const cors = createCors({origin: origin => origin.endsWith('.trusted.com')});
      const req = createMockReq({
        method: 'OPTIONS',
        headers: {
          origin: 'https://app.trusted.com',
          'access-control-request-method': 'GET'
        }
      });
      const res = createMockRes();
      const handled = cors.preflight(req, res, new Set(['GET']));
      assert.equal(handled, true);
      assert.equal(res.statusCode, 204);
    });
  });

  describe('headers()', () => {
    it('sets Access-Control-Allow-Origin for cross-origin requests', () => {
      const cors = createCors({origin: '*'});
      const req = createMockReq({headers: {origin: 'https://example.com'}});
      const res = createMockRes();
      cors.headers(req, res);
      assert.equal(res.getHeader('access-control-allow-origin'), '*');
    });

    it('does nothing for same-origin requests (no Origin header)', () => {
      const cors = createCors({origin: '*'});
      const req = createMockReq();
      const res = createMockRes();
      cors.headers(req, res);
      assert.equal(res.getHeader('access-control-allow-origin'), undefined);
    });

    it('does nothing for disallowed origins', () => {
      const cors = createCors({origin: 'https://allowed.com'});
      const req = createMockReq({headers: {origin: 'https://evil.com'}});
      const res = createMockRes();
      cors.headers(req, res);
      assert.equal(res.getHeader('access-control-allow-origin'), undefined);
    });

    it('echoes origin for non-wildcard policy', () => {
      const cors = createCors({origin: 'https://allowed.com'});
      const req = createMockReq({headers: {origin: 'https://allowed.com'}});
      const res = createMockRes();
      cors.headers(req, res);
      assert.equal(res.getHeader('access-control-allow-origin'), 'https://allowed.com');
    });

    it('sets Access-Control-Allow-Credentials for credentialed requests', () => {
      const cors = createCors({origin: '*', credentials: true});
      const req = createMockReq({headers: {origin: 'https://example.com'}});
      const res = createMockRes();
      cors.headers(req, res);
      assert.equal(res.getHeader('access-control-allow-credentials'), 'true');
    });

    it('sets Access-Control-Expose-Headers when configured', () => {
      const cors = createCors({origin: '*', exposedHeaders: ['X-Custom-Header']});
      const req = createMockReq({headers: {origin: 'https://example.com'}});
      const res = createMockRes();
      cors.headers(req, res);
      assert.equal(res.getHeader('access-control-expose-headers'), 'X-Custom-Header');
    });

    it('adds Vary: Origin for non-wildcard policy', () => {
      const cors = createCors({origin: 'https://allowed.com'});
      const req = createMockReq({headers: {origin: 'https://allowed.com'}});
      const res = createMockRes();
      cors.headers(req, res);
      assert.ok(String(res.getHeader('vary') || '').includes('Origin'));
    });
  });
});
