/**
 * @fileoverview Security headers for ergo-router transport layer.
 *
 * Thin adapter over ergo's `lib/security-headers.js` shared primitive. Maps the
 * transport config shape (`hsts`, `noSniff`, `csp`, etc.) to the shared builder's
 * canonical shape, pre-computes tuples at router creation time, and retains the
 * per-request HSTS HTTPS detection logic (RFC 6797 §7.2).
 *
 * @module lib/transport/security-headers
 * @since 0.1.0
 * @requires @centralping/ergo/lib/security-headers
 * @see {@link https://www.rfc-editor.org/rfc/rfc6797 RFC 6797 - HTTP Strict Transport Security}
 */
import buildSecurityHeaderTuples, {
  DEFAULT_HSTS_MAX_AGE_SECONDS
} from '@centralping/ergo/lib/security-headers';

const TRANSPORT_DEFAULTS = {
  hsts: {maxAge: DEFAULT_HSTS_MAX_AGE_SECONDS, includeSubDomains: true, preload: false},
  noSniff: true,
  frameOptions: 'DENY',
  referrerPolicy: 'no-referrer',
  csp: undefined,
  permissionsPolicy: undefined
};

/**
 * Merge caller config over transport defaults, ignoring omitted keys.
 *
 * Spread (`{...defaults, ...config}`) would replace a default with `undefined`
 * when callers pass optional fields as `{hsts: undefined}` — which then disables
 * HSTS because ergo treats a missing/falsey `strictTransportSecurity` as off.
 *
 * Only known `TRANSPORT_DEFAULTS` keys are copied so special keys such as
 * `__proto__` cannot replace `merged`'s [[Prototype]] (object spread's
 * CopyDataProperties skips `__proto__`; a bare `merged[key] = value` loop does
 * not). Explicit `null` is forwarded so ergo's construction-time TypeError
 * still fail-closes.
 *
 * @param {object} config
 * @returns {object}
 */
export function mergeTransportDefaults(config) {
  const merged = {...TRANSPORT_DEFAULTS};
  for (const key of Object.keys(TRANSPORT_DEFAULTS)) {
    if (Object.hasOwn(config, key) && config[key] !== undefined) {
      merged[key] = config[key];
    }
  }
  return merged;
}

/**
 * Whether the request is treated as HTTPS for HSTS emission (RFC 6797 §7.2).
 *
 * With `trustProxy`, uses the leftmost `X-Forwarded-Proto` hop (client-facing),
 * matching common reverse-proxy multi-value semantics (`https,http`).
 *
 * @param {import('node:http').IncomingMessage} req
 * @param {boolean} trustProxy
 * @returns {boolean}
 */
function isHttpsRequest(req, trustProxy) {
  if (req.socket?.encrypted === true) {
    return true;
  }
  if (trustProxy !== true) {
    return false;
  }
  const raw = req.headers['x-forwarded-proto'];
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (typeof value !== 'string') {
    return false;
  }
  const firstHop = value.split(',', 1)[0].trim().toLowerCase();
  return firstHop === 'https';
}

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
 *   Multi-value headers use the leftmost hop (e.g. `https,http` → https).
 */
export default function createSecurityHeaders(config = {}) {
  const merged = mergeTransportDefaults(config);
  const trustProxy = config.trustProxy === true;

  const allTuples = buildSecurityHeaderTuples({
    strictTransportSecurity: merged.hsts,
    xContentTypeOptions: merged.noSniff,
    xFrameOptions: merged.frameOptions,
    referrerPolicy: merged.referrerPolicy,
    contentSecurityPolicy: merged.csp === undefined ? false : merged.csp,
    permissionsPolicy: merged.permissionsPolicy,
    xXssProtection: false
  });

  const hstsTuple = allTuples.find(([name]) => name === 'Strict-Transport-Security');
  const nonHstsTuples = allTuples.filter(([name]) => name !== 'Strict-Transport-Security');

  return function applySecurityHeaders(req, res) {
    for (const [name, value] of nonHstsTuples) {
      res.setHeader(name, value);
    }

    if (hstsTuple && isHttpsRequest(req, trustProxy)) {
      res.setHeader(hstsTuple[0], hstsTuple[1]);
    }
  };
}
