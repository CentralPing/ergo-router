/**
 * @fileoverview Layer 1 boundary tests for lib/transport/security-headers.
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {DEFAULT_HSTS_MAX_AGE_SECONDS} from '@centralping/ergo/lib/security-headers';
import createSecurityHeaders from './security-headers.js';
import {createMockReq, createMockRes} from '../../test/helpers.js';

describe('[Boundary] transport/security-headers', () => {
  describe('default headers', () => {
    it('sets X-Content-Type-Options: nosniff', () => {
      const apply = createSecurityHeaders();
      const res = createMockRes();
      apply(createMockReq(), res);
      assert.equal(res.getHeader('x-content-type-options'), 'nosniff');
    });

    it('sets X-Frame-Options: DENY', () => {
      const apply = createSecurityHeaders();
      const res = createMockRes();
      apply(createMockReq(), res);
      assert.equal(res.getHeader('x-frame-options'), 'DENY');
    });

    it('sets Referrer-Policy', () => {
      const apply = createSecurityHeaders();
      const res = createMockRes();
      apply(createMockReq(), res);
      assert.equal(res.getHeader('referrer-policy'), 'no-referrer');
    });

    it('does not set Cache-Control (handled at pipeline level)', () => {
      const apply = createSecurityHeaders();
      const res = createMockRes();
      apply(createMockReq(), res);
      assert.equal(res.getHeader('cache-control'), undefined);
    });
  });

  describe('HSTS (RFC 6797 §7.2)', () => {
    it('does NOT set HSTS on plain HTTP requests', () => {
      const apply = createSecurityHeaders();
      const req = createMockReq({socket: {encrypted: false}});
      const res = createMockRes();
      apply(req, res);
      assert.equal(res.getHeader('strict-transport-security'), undefined);
    });

    it('sets HSTS on HTTPS requests (socket.encrypted)', () => {
      const apply = createSecurityHeaders();
      const req = createMockReq({socket: {encrypted: true}});
      const res = createMockRes();
      apply(req, res);
      const hsts = res.getHeader('strict-transport-security');
      assert.ok(hsts, 'HSTS header should be present on HTTPS');
      assert.ok(hsts.includes('max-age='));
    });

    it('sets HSTS when trustProxy=true and X-Forwarded-Proto: https', () => {
      const apply = createSecurityHeaders({trustProxy: true});
      const req = createMockReq({
        socket: {encrypted: false},
        headers: {'x-forwarded-proto': 'https'}
      });
      const res = createMockRes();
      apply(req, res);
      assert.ok(res.getHeader('strict-transport-security'));
    });

    it('sets HSTS when trustProxy=true and leftmost X-Forwarded-Proto hop is https', () => {
      const apply = createSecurityHeaders({trustProxy: true});
      const req = createMockReq({
        socket: {encrypted: false},
        headers: {'x-forwarded-proto': 'https, http'}
      });
      const res = createMockRes();
      apply(req, res);
      assert.ok(res.getHeader('strict-transport-security'));
    });

    it('sets HSTS when trustProxy=true and X-Forwarded-Proto is a https array entry', () => {
      const apply = createSecurityHeaders({trustProxy: true});
      const req = createMockReq({
        socket: {encrypted: false},
        headers: {'x-forwarded-proto': ['https', 'http']}
      });
      const res = createMockRes();
      apply(req, res);
      assert.ok(res.getHeader('strict-transport-security'));
    });

    it('does NOT set HSTS when trustProxy=true and X-Forwarded-Proto is non-string', () => {
      const apply = createSecurityHeaders({trustProxy: true});
      const req = createMockReq({
        socket: {encrypted: false},
        headers: {'x-forwarded-proto': 1}
      });
      const res = createMockRes();
      apply(req, res);
      assert.equal(res.getHeader('strict-transport-security'), undefined);
    });

    it('does NOT set HSTS when trustProxy=true but leftmost X-Forwarded-Proto hop is http', () => {
      const apply = createSecurityHeaders({trustProxy: true});
      const req = createMockReq({
        socket: {encrypted: false},
        headers: {'x-forwarded-proto': 'http, https'}
      });
      const res = createMockRes();
      apply(req, res);
      assert.equal(res.getHeader('strict-transport-security'), undefined);
    });

    it('does NOT set HSTS when trustProxy=true but X-Forwarded-Proto is http', () => {
      const apply = createSecurityHeaders({trustProxy: true});
      const req = createMockReq({
        socket: {encrypted: false},
        headers: {'x-forwarded-proto': 'http'}
      });
      const res = createMockRes();
      apply(req, res);
      assert.equal(res.getHeader('strict-transport-security'), undefined);
    });

    it('retains default HSTS when config passes hsts: undefined', () => {
      const apply = createSecurityHeaders({hsts: undefined});
      const req = createMockReq({socket: {encrypted: true}});
      const res = createMockRes();
      apply(req, res);
      assert.ok(
        res
          .getHeader('strict-transport-security')
          .startsWith(`max-age=${DEFAULT_HSTS_MAX_AGE_SECONDS}`)
      );
    });

    it('includes includeSubDomains by default', () => {
      const apply = createSecurityHeaders();
      const req = createMockReq({socket: {encrypted: true}});
      const res = createMockRes();
      apply(req, res);
      assert.ok(res.getHeader('strict-transport-security').includes('includeSubDomains'));
    });

    it('uses DEFAULT_HSTS_MAX_AGE_SECONDS for default max-age', () => {
      const apply = createSecurityHeaders();
      const req = createMockReq({socket: {encrypted: true}});
      const res = createMockRes();
      apply(req, res);
      assert.ok(
        res
          .getHeader('strict-transport-security')
          .startsWith(`max-age=${DEFAULT_HSTS_MAX_AGE_SECONDS}`)
      );
    });

    it('omits includeSubDomains when set to false', () => {
      const apply = createSecurityHeaders({
        hsts: {maxAge: DEFAULT_HSTS_MAX_AGE_SECONDS, includeSubDomains: false}
      });
      const req = createMockReq({socket: {encrypted: true}});
      const res = createMockRes();
      apply(req, res);
      const hsts = res.getHeader('strict-transport-security');
      assert.ok(hsts, 'HSTS should be set');
      assert.ok(!hsts.includes('includeSubDomains'), 'should omit includeSubDomains when false');
    });

    it('includes preload when configured', () => {
      const apply = createSecurityHeaders({hsts: {maxAge: 63072000, preload: true}});
      const req = createMockReq({socket: {encrypted: true}});
      const res = createMockRes();
      apply(req, res);
      assert.ok(res.getHeader('strict-transport-security').includes('preload'));
    });

    it('can disable HSTS entirely', () => {
      const apply = createSecurityHeaders({hsts: false});
      const req = createMockReq({socket: {encrypted: true}});
      const res = createMockRes();
      apply(req, res);
      assert.equal(res.getHeader('strict-transport-security'), undefined);
    });
  });

  describe('individual header disabling', () => {
    it('can set a custom frameOptions value (SAMEORIGIN)', () => {
      const apply = createSecurityHeaders({frameOptions: 'SAMEORIGIN'});
      const res = createMockRes();
      apply(createMockReq(), res);
      assert.equal(res.getHeader('x-frame-options'), 'SAMEORIGIN');
    });

    it('ignores unknown cacheControl config (no longer handled here)', () => {
      const apply = createSecurityHeaders({cacheControl: 'no-cache'});
      const res = createMockRes();
      apply(createMockReq(), res);
      assert.equal(res.getHeader('cache-control'), undefined);
    });

    it('can set a custom referrerPolicy value', () => {
      const apply = createSecurityHeaders({referrerPolicy: 'no-referrer'});
      const res = createMockRes();
      apply(createMockReq(), res);
      assert.equal(res.getHeader('referrer-policy'), 'no-referrer');
    });

    it('can disable noSniff', () => {
      const apply = createSecurityHeaders({noSniff: false});
      const res = createMockRes();
      apply(createMockReq(), res);
      assert.equal(res.getHeader('x-content-type-options'), undefined);
    });

    it('can disable frameOptions', () => {
      const apply = createSecurityHeaders({frameOptions: false});
      const res = createMockRes();
      apply(createMockReq(), res);
      assert.equal(res.getHeader('x-frame-options'), undefined);
    });

    it('cacheControl: false is a no-op (Cache-Control no longer managed here)', () => {
      const apply = createSecurityHeaders({cacheControl: false});
      const res = createMockRes();
      apply(createMockReq(), res);
      assert.equal(res.getHeader('cache-control'), undefined);
    });
  });

  describe('optional headers', () => {
    it('sets Content-Security-Policy when csp is provided', () => {
      const apply = createSecurityHeaders({csp: "default-src 'self'"});
      const res = createMockRes();
      apply(createMockReq(), res);
      assert.equal(res.getHeader('content-security-policy'), "default-src 'self'");
    });

    it('sets Permissions-Policy when provided', () => {
      const apply = createSecurityHeaders({permissionsPolicy: 'geolocation=()'});
      const res = createMockRes();
      apply(createMockReq(), res);
      assert.equal(res.getHeader('permissions-policy'), 'geolocation=()');
    });

    it('does not set CSP when not configured', () => {
      const apply = createSecurityHeaders();
      const res = createMockRes();
      apply(createMockReq(), res);
      assert.equal(res.getHeader('content-security-policy'), undefined);
    });
  });
});
