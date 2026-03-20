/**
 * @fileoverview Transport-level CORS handler for ergo-router.
 *
 * Thin adapter over ergo's `lib/cors.js` shared primitive. Handles:
 * - Pre-flight `OPTIONS` requests (short-circuits with 204 or 403)
 * - Cross-origin response headers for non-preflight requests
 * - Same-origin requests are skipped silently
 *
 * Method validation is not performed at the CORS layer; the router handles 405.
 * The `Access-Control-Allow-Methods` header is populated from registered route
 * methods (or explicit config), not from the CORS validator's method list.
 *
 * @module lib/transport/cors
 * @version 0.1.0
 * @since 0.1.0
 * @requires ergo/lib/cors
 * @see {@link https://fetch.spec.whatwg.org/#http-cors-protocol Fetch Standard - CORS Protocol}
 */
import createCorsValidator from 'ergo/lib/cors';
import appendVary from 'ergo/lib/vary';

/**
 * Create a CORS handler that runs at the transport layer.
 *
 * @param {object} [config]
 * @param {string|string[]|function} [config.origin='*'] - Allowed origin(s)
 * @param {string[]} [config.methods] - Allowed methods (default: use registered route methods)
 * @param {string[]} [config.allowedHeaders=['Content-Type','Authorization']]
 * @param {string[]} [config.exposedHeaders=[]]
 * @param {boolean} [config.credentials=false]
 * @param {number} [config.maxAge=86400] - Preflight cache (seconds)
 * @returns {object} - `{preflight: function, headers: function}`
 */
export default function createCors(config = {}) {
  const {
    origin: origins = '*',
    methods: configuredMethods,
    allowedHeaders: allowHeaders = ['Content-Type', 'Authorization'],
    exposedHeaders: exposeHeaders,
    credentials: allowCredentials = false,
    maxAge = 86400
  } = config;

  // Wrap single-string origins in an array so lib/cors.js includes Vary: Origin.
  // A single string would skip Vary (response is constant for that origin), but
  // the transport layer always adds Vary for non-wildcard policies.
  const normalizedOrigins = typeof origins === 'string' && origins !== '*' ? [origins] : origins;

  const validate = createCorsValidator({
    origins: normalizedOrigins,
    allowCredentials,
    allowHeaders,
    exposeHeaders,
    maxAge
  });

  return {
    /**
     * Handle preflight (OPTIONS) requests. Returns true if the request
     * was a preflight and has been fully handled (short-circuit).
     * @param {object} req - HTTP request
     * @param {object} res - HTTP response
     * @param {Set<string>} [registeredMethods] - Methods registered for this path
     * @returns {boolean} - true if handled as preflight
     */
    preflight(req, res, registeredMethods) {
      const requestOrigin = req.headers['origin'];
      const requestMethod = req.headers['access-control-request-method'];

      if (req.method !== 'OPTIONS' || !requestOrigin || !requestMethod) {
        return false;
      }

      const requestHeaders = req.headers['access-control-request-headers']
        ?.split(',')
        .map(h => h.trim());

      const {allowed, info} = validate({
        origin: requestOrigin,
        method: 'OPTIONS',
        requestMethod,
        requestHeaders
      });

      if (!allowed) {
        res.statusCode = 403;
        res.end();
        return true;
      }

      const methods = configuredMethods
        ? configuredMethods.join(', ')
        : registeredMethods
          ? [...registeredMethods].join(', ')
          : '*';

      applyHeaders(res, info.headers, {'Access-Control-Allow-Methods': methods});
      res.statusCode = 204;
      res.end();
      return true;
    },

    /**
     * Apply CORS headers for non-preflight cross-origin requests.
     * Same-origin requests are skipped.
     * @param {object} req - HTTP request
     * @param {object} res - HTTP response
     */
    headers(req, res) {
      const requestOrigin = req.headers['origin'];
      if (!requestOrigin) return;

      const {allowed, info} = validate({origin: requestOrigin, method: req.method});
      if (!allowed) return;

      applyHeaders(res, info.headers);
    }
  };
}

/**
 * Apply `{h, v}` header entries from `lib/cors.js` to the response.
 * Vary headers are appended (deduplicated); overrides skip the validator's value.
 * @param {object} res - HTTP response
 * @param {Array<{h: string, v: *}>} headers - Header entries from the validator
 * @param {object} [overrides] - Headers to override (key: header name, value: string)
 */
function applyHeaders(res, headers, overrides = {}) {
  for (const {h, v} of headers) {
    if (Object.hasOwn(overrides, h)) continue;
    if (h === 'Vary') {
      appendVary(res, String(v));
    } else {
      res.setHeader(h, Array.isArray(v) ? v.join(', ') : String(v));
    }
  }
  for (const [name, value] of Object.entries(overrides)) {
    res.setHeader(name, value);
  }
}
