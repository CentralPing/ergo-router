/**
 * @fileoverview Layer 1 boundary tests for lib/transport/rate-limit.
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import createRateLimit, {MemoryStore} from './rate-limit.js';
import {createMockReq, createMockRes} from '../../test/helpers.js';

describe('[Boundary] transport/rate-limit', () => {
  describe('MemoryStore', () => {
    it('returns count=1 on first hit', () => {
      const store = new MemoryStore();
      const {count} = store.hit('key', 60000);
      assert.equal(count, 1);
    });

    it('increments count on successive hits within the window', () => {
      const store = new MemoryStore();
      store.hit('key', 60000);
      store.hit('key', 60000);
      const {count} = store.hit('key', 60000);
      assert.equal(count, 3);
    });

    it('returns resetMs > 0', () => {
      const store = new MemoryStore();
      const {resetMs} = store.hit('key', 60000);
      assert.ok(resetMs > 0);
    });

    it('tracks different keys independently', () => {
      const store = new MemoryStore();
      store.hit('a', 60000);
      store.hit('a', 60000);
      const {count: countB} = store.hit('b', 60000);
      assert.equal(countB, 1);
    });
  });

  describe('applyRateLimit()', () => {
    it('sets X-RateLimit headers on every request', () => {
      const apply = createRateLimit({max: 10, windowMs: 60000});
      const res = createMockRes();
      apply(createMockReq(), res);
      assert.ok(res.getHeader('x-ratelimit-limit'));
      assert.ok(res.getHeader('x-ratelimit-remaining'));
      assert.ok(res.getHeader('x-ratelimit-reset'));
    });

    it('sets X-RateLimit-Limit to configured max', () => {
      const apply = createRateLimit({max: 50, windowMs: 60000});
      const res = createMockRes();
      apply(createMockReq(), res);
      assert.equal(res.getHeader('x-ratelimit-limit'), '50');
    });

    it('returns false when under the limit', () => {
      const apply = createRateLimit({max: 100, windowMs: 60000});
      const result = apply(createMockReq(), createMockRes());
      assert.equal(result, false);
    });

    it('returns true and sets Retry-After when over the limit (RFC 6585 §4)', () => {
      const apply = createRateLimit({max: 2, windowMs: 60000});
      apply(createMockReq(), createMockRes());
      apply(createMockReq(), createMockRes());

      const res = createMockRes();
      // Third request exceeds max=2
      const limited = apply(createMockReq(), res);
      assert.equal(limited, true);
      assert.ok(res.getHeader('retry-after'), 'Retry-After header must be set on 429');
    });

    it('Retry-After value is a positive integer string', () => {
      const apply = createRateLimit({max: 1, windowMs: 60000});
      apply(createMockReq(), createMockRes());

      const res = createMockRes();
      apply(createMockReq(), res);
      const retryAfter = res.getHeader('retry-after');
      assert.ok(retryAfter, 'Retry-After must be present');
      assert.match(String(retryAfter), /^\d+$/, 'Retry-After must be a positive integer string');
      assert.ok(parseInt(retryAfter, 10) > 0);
    });

    it('uses remoteAddress as default key', () => {
      const apply = createRateLimit({max: 1, windowMs: 60000});
      // Two requests from the same IP — second should be rate limited
      apply(createMockReq({socket: {remoteAddress: '1.2.3.4'}}), createMockRes());
      const res = createMockRes();
      const limited = apply(createMockReq({socket: {remoteAddress: '1.2.3.4'}}), res);
      assert.equal(limited, true);
    });

    it('tracks different IPs independently', () => {
      const apply = createRateLimit({max: 1, windowMs: 60000});
      apply(createMockReq({socket: {remoteAddress: '10.0.0.1'}}), createMockRes());
      // Different IP should not be limited
      const res = createMockRes();
      const limited = apply(createMockReq({socket: {remoteAddress: '10.0.0.2'}}), res);
      assert.equal(limited, false);
    });

    it('supports a custom keyGenerator', () => {
      const apply = createRateLimit({
        max: 1,
        windowMs: 60000,
        keyGenerator: req => req.headers['x-api-key'] || 'anon'
      });
      apply(createMockReq({headers: {'x-api-key': 'abc'}}), createMockRes());
      const res = createMockRes();
      const limited = apply(createMockReq({headers: {'x-api-key': 'abc'}}), res);
      assert.equal(limited, true);
    });

    it('decrements X-RateLimit-Remaining correctly', () => {
      const apply = createRateLimit({max: 5, windowMs: 60000});
      const res = createMockRes();
      apply(createMockReq(), res);
      assert.equal(res.getHeader('x-ratelimit-remaining'), '4');
    });

    it('prunes expired timestamps outside the sliding window', async () => {
      // Use a very short window (1ms) so timestamps expire immediately
      const apply = createRateLimit({max: 100, windowMs: 1});
      apply(createMockReq(), createMockRes()); // hit at t=0
      // Wait for the window to expire
      await new Promise(r => setTimeout(r, 5));
      const res = createMockRes();
      apply(createMockReq(), res);
      // After pruning, only the current hit is in the window → remaining = max - 1
      assert.equal(res.getHeader('x-ratelimit-remaining'), '99');
    });
  });
});
