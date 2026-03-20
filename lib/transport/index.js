/**
 * @fileoverview Transport layer factory for ergo-router.
 *
 * Composes all configured transport-level concerns into a single `run()` function that
 * executes before any route matching. Concerns are executed in a fixed priority order:
 * 1. Request ID (inject traceability ID)
 * 2. Security headers (set on every response)
 * 3. Rate limiting (may short-circuit with 429)
 * 4. CORS (may short-circuit on pre-flight)
 *
 * Returns `{stop, requestId}` where `stop = true` means the response has already been
 * sent and no further processing should occur. The `requestId` return value is available
 * for custom dispatch logic but is not stored on `req`; downstream code reads the
 * request ID from the response header via `res.getHeader()`.
 *
 * @module lib/transport
 * @version 0.1.0
 * @since 0.1.0
 * @requires ./request-id.js
 * @requires ./security-headers.js
 * @requires ./rate-limit.js
 * @requires ./cors.js
 * @requires ../error-response.js
 */
import createRequestId from './request-id.js';
import createSecurityHeaders from './security-headers.js';
import createRateLimit from './rate-limit.js';
import createCors from './cors.js';
import endWithProblem from '../error-response.js';

/**
 * Build the transport layer from router options.
 * Returns an object with a single `run(req, res, pathRegistry)` method
 * that executes all enabled transport concerns and returns early-exit info.
 *
 * @param {object} [transportConfig]
 * @param {object|false} [transportConfig.requestId] - Request ID config
 * @param {object|false} [transportConfig.security] - Security headers config
 * @param {object|false} [transportConfig.rateLimit] - Rate limiting config
 * @param {object|false} [transportConfig.cors] - CORS config
 * @returns {object} {run: function}
 */
export default function buildTransport(transportConfig = {}) {
  const applyRequestId =
    transportConfig.requestId !== false
      ? createRequestId(transportConfig.requestId ?? {})
      : undefined;

  const applySecurity =
    transportConfig.security !== false
      ? createSecurityHeaders(transportConfig.security ?? {})
      : undefined;

  const applyRateLimit = transportConfig.rateLimit
    ? createRateLimit(transportConfig.rateLimit)
    : undefined;

  const corsHandler = transportConfig.cors ? createCors(transportConfig.cors) : undefined;

  return {
    /**
     * Run the transport layer on a request.
     *
     * @param {object} req - HTTP request
     * @param {object} res - HTTP response
     * @param {Set<string>} [allowedMethods] - Registered methods for this path
     * @returns {{stop: boolean, requestId: string|undefined}}
     *   stop=true means the response has been sent (preflight, rate limited)
     */
    run(req, res, allowedMethods) {
      let requestId;

      // 1. Request ID -- always first for traceability
      if (applyRequestId) {
        requestId = applyRequestId(req, res);
      }

      // 2. Security headers -- on every response
      if (applySecurity) {
        applySecurity(req, res);
      }

      // 3. Rate limiting -- before any application logic
      if (applyRateLimit) {
        const limited = applyRateLimit(req, res);
        if (limited) {
          endWithProblem(res, 429);
          return {stop: true, requestId};
        }
      }

      // 4. CORS -- preflight short-circuit
      if (corsHandler) {
        if (corsHandler.preflight(req, res, allowedMethods)) {
          return {stop: true, requestId};
        }
        corsHandler.headers(req, res);
      }

      return {stop: false, requestId};
    }
  };
}
