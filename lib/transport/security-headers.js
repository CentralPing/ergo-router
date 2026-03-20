/**
 * @fileoverview Security headers for ergo-router transport layer.
 *
 * Thin adapter over ergo's `lib/security-headers.js` shared primitive. Maps the
 * transport config shape (`hsts`, `noSniff`, `csp`, etc.) to the shared builder's
 * canonical shape, pre-computes tuples at router creation time, and retains the
 * per-request HSTS HTTPS detection logic (RFC 6797 §7.2).
 *
 * @module lib/transport/security-headers
 * @version 0.1.0
 * @since 0.1.0
 * @requires ergo/lib/security-headers
 * @see {@link https://www.rfc-editor.org/rfc/rfc6797 RFC 6797 - HTTP Strict Transport Security}
 */
import buildSecurityHeaderTuples from 'ergo/lib/security-headers';

const TRANSPORT_DEFAULTS = {
  hsts: {maxAge: 31536000, includeSubDomains: true, preload: false},
  noSniff: true,
  frameOptions: 'DENY',
  referrerPolicy: 'strict-origin-when-cross-origin',
  csp: undefined,
  permissionsPolicy: undefined
};

/**
 * Pre-compute static security header tuples at router creation time.
 *
 * @param {object} [config] - Each key can be set to false to disable
 * @param {object|false} [config.hsts] - HSTS options, or false to disable
 * @param {boolean} [config.noSniff=true]
 * @param {string|false} [config.frameOptions='DENY']
 * @param {string|false} [config.referrerPolicy]
 * @param {string|false} [config.csp] - Content-Security-Policy value
 * @param {string|false} [config.permissionsPolicy]
 * @param {boolean} [config.trustProxy=false] - Trust X-Forwarded-Proto for HTTPS detection.
 *   WARNING: Only enable when the application runs behind a trusted reverse proxy that
 *   sets or overrides the X-Forwarded-Proto header. Without a trusted proxy, any client
 *   can spoof this header and cause HSTS to be sent over cleartext HTTP.
 * @returns {function} (req, res) => void
 */
export default function createSecurityHeaders(config = {}) {
  const merged = {...TRANSPORT_DEFAULTS, ...config};
  const trustProxy = config.trustProxy === true;

  const allTuples = buildSecurityHeaderTuples({
    strictTransportSecurity: merged.hsts,
    xContentTypeOptions: merged.noSniff,
    xFrameOptions: merged.frameOptions,
    referrerPolicy: merged.referrerPolicy,
    contentSecurityPolicy: merged.csp ?? false,
    permissionsPolicy: merged.permissionsPolicy,
    xXssProtection: false
  });

  const hstsTuple = allTuples.find(([name]) => name === 'Strict-Transport-Security');
  const nonHstsTuples = allTuples.filter(([name]) => name !== 'Strict-Transport-Security');

  return function applySecurityHeaders(req, res) {
    for (const [name, value] of nonHstsTuples) {
      res.setHeader(name, value);
    }

    if (hstsTuple) {
      const isHttps =
        req.socket?.encrypted === true ||
        (trustProxy && req.headers['x-forwarded-proto'] === 'https');
      if (isHttps) {
        res.setHeader(hstsTuple[0], hstsTuple[1]);
      }
    }
  };
}
