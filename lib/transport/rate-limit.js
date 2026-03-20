/**
 * @fileoverview Transport-level rate limiting for ergo-router.
 *
 * Thin adapter over ergo's `lib/rate-limit.js` shared primitives. Applies rate
 * limit headers to every response and returns `true` when the client is over
 * the limit (caller should short-circuit with 429).
 *
 * @module lib/transport/rate-limit
 * @version 0.1.0
 * @since 0.1.0
 * @requires ergo/lib/rate-limit
 * @see {@link https://www.rfc-editor.org/rfc/rfc6585#section-4 RFC 6585 Section 4 - 429 Too Many Requests}
 */
import {MemoryStore, checkRateLimit, defaultKeyGenerator} from 'ergo/lib/rate-limit';

/**
 * Create a rate limiting middleware function.
 *
 * @param {object} [config]
 * @param {number} [config.max=100] - Max requests per window
 * @param {number} [config.windowMs=60000] - Window size in ms (default: 1 min)
 * @param {object} [config.store] - Pluggable store (must implement hit(key, windowMs))
 * @param {function} [config.keyGenerator] - `(req) => string` (default: remoteAddress)
 * @returns {function} - `(req, res) => boolean` — returns true if rate limited (caller should stop)
 */
export default function createRateLimit(config = {}) {
  const {
    max = 100,
    windowMs = 60000,
    store = new MemoryStore(),
    keyGenerator = defaultKeyGenerator
  } = config;

  return function applyRateLimit(req, res) {
    const result = checkRateLimit(store, keyGenerator(req), max, windowMs);

    res.setHeader('X-RateLimit-Limit', String(max));
    res.setHeader('X-RateLimit-Remaining', String(result.remaining));
    res.setHeader('X-RateLimit-Reset', String(result.reset));

    if (result.limited) {
      res.setHeader('Retry-After', String(result.retryAfter));
      return true;
    }

    return false;
  };
}

export {MemoryStore};
