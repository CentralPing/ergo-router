/**
 * @fileoverview Peer dependency import surface validation.
 *
 * Validates that every symbol ergo-router imports from @centralping/ergo is
 * available at module load time. When run against a published ergo version in
 * CI (peer-compat job), this test catches import surface divergence before it
 * ships — the class of bug that caused #34 and #36.
 *
 * Maintenance: update this file whenever ergo-router adds or removes an import
 * from @centralping/ergo. The CI peer-compat job treats a failure here as a
 * signal that the peer dep floor needs bumping.
 *
 * @module lib/peer-surface.spec.unit
 * @since 0.1.0-beta.3
 */
import {describe, it} from 'node:test';
import {strict as assert} from 'node:assert';

// --- Main entry (@centralping/ergo) ---
// Used by lib/pipeline-builder.js
import {
  logger,
  accepts,
  authorization,
  cacheControl,
  cookie,
  prefer,
  precondition,
  rateLimit,
  url,
  body,
  csrf,
  jsonApiQuery,
  securityHeaders,
  idempotency,
  validate,
  timeout,
  compress
} from '@centralping/ergo';

// Used by lib/auto-wrap.js
import {compose, send, createResponseAcc} from '@centralping/ergo';

// Used by lib/error-response.js
import {httpErrors} from '@centralping/ergo';

// --- Deep path: @centralping/ergo/utils/compose ---
// Used by lib/auto-wrap.js
import {accumulator} from '@centralping/ergo/utils/compose';

// --- Deep path: @centralping/ergo/lib/attach-instance ---
// Used by lib/auto-wrap.js
import attachInstance from '@centralping/ergo/lib/attach-instance';

// --- Deep path: @centralping/ergo/lib/rate-limit ---
// Used by lib/transport/rate-limit.js
import {MemoryStore, checkRateLimit, defaultKeyGenerator} from '@centralping/ergo/lib/rate-limit';

// --- Deep path: @centralping/ergo/lib/security-headers ---
// Used by lib/transport/security-headers.js
import buildSecurityHeaderTuples from '@centralping/ergo/lib/security-headers';

// --- Deep path: @centralping/ergo/lib/cors ---
// Used by lib/transport/cors.js
import createCorsValidator from '@centralping/ergo/lib/cors';

// --- Deep path: @centralping/ergo/lib/vary ---
// Used by lib/transport/cors.js
import appendVary from '@centralping/ergo/lib/vary';

describe('peer surface: @centralping/ergo main entry', () => {
  it('exports pipeline middleware factories', () => {
    assert.equal(typeof logger, 'function');
    assert.equal(typeof accepts, 'function');
    assert.equal(typeof authorization, 'function');
    assert.equal(typeof cacheControl, 'function');
    assert.equal(typeof cookie, 'function');
    assert.equal(typeof prefer, 'function');
    assert.equal(typeof precondition, 'function');
    assert.equal(typeof rateLimit, 'function');
    assert.equal(typeof url, 'function');
    assert.equal(typeof body, 'function');
    assert.equal(typeof csrf, 'function');
    assert.equal(typeof jsonApiQuery, 'function');
    assert.equal(typeof securityHeaders, 'function');
    assert.equal(typeof idempotency, 'function');
    assert.equal(typeof validate, 'function');
    assert.equal(typeof timeout, 'function');
    assert.equal(typeof compress, 'function');
  });

  it('exports compose, send, createResponseAcc, httpErrors', () => {
    assert.equal(typeof compose, 'function');
    assert.equal(typeof send, 'function');
    assert.equal(typeof createResponseAcc, 'function');
    assert.equal(typeof httpErrors, 'function');
  });
});

describe('peer surface: @centralping/ergo/utils/compose', () => {
  it('exports accumulator', () => {
    assert.equal(typeof accumulator, 'function');
  });
});

describe('peer surface: @centralping/ergo/lib/attach-instance', () => {
  it('exports default attachInstance', () => {
    assert.equal(typeof attachInstance, 'function');
  });
});

describe('peer surface: @centralping/ergo/lib/rate-limit', () => {
  it('exports MemoryStore, checkRateLimit, defaultKeyGenerator', () => {
    assert.equal(typeof MemoryStore, 'function');
    assert.equal(typeof checkRateLimit, 'function');
    assert.equal(typeof defaultKeyGenerator, 'function');
  });
});

describe('peer surface: @centralping/ergo/lib/security-headers', () => {
  it('exports default buildSecurityHeaderTuples', () => {
    assert.equal(typeof buildSecurityHeaderTuples, 'function');
  });
});

describe('peer surface: @centralping/ergo/lib/cors', () => {
  it('exports default createCorsValidator', () => {
    assert.equal(typeof createCorsValidator, 'function');
  });
});

describe('peer surface: @centralping/ergo/lib/vary', () => {
  it('exports default appendVary', () => {
    assert.equal(typeof appendVary, 'function');
  });
});
