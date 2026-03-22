/**
 * @fileoverview Request ID injection for ergo-router transport layer.
 *
 * Assigns a unique request ID to each incoming request and sets it as a response header.
 * When `trustProxy` is true, an existing request ID from the configured header is reused
 * (e.g. forwarded by a load balancer or API gateway).
 *
 * The request ID is returned from the middleware function and set as a response header.
 * Downstream code reads it via `res.getHeader()` (e.g. ergo's logger, error formatters).
 *
 * @module lib/transport/request-id
 * @version 0.1.0
 * @since 0.1.0
 * @requires node:crypto
 * @see {@link https://http.dev/x-request-id X-Request-Id Convention}
 */

import {randomUUID} from 'node:crypto';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEADER_UNSAFE_RE = /[\r\n\0]/;
const MAX_ID_LENGTH = 128;
const defaultValidate = v => typeof v === 'string' && v.length <= MAX_ID_LENGTH && UUID_RE.test(v);

/**
 * Create a request ID middleware function.
 *
 * @param {object} [config]
 * @param {string} [config.header='x-request-id'] - Header name for request ID
 * @param {boolean} [config.trustProxy=false] - Trust incoming request ID header
 * @param {function} [config.generate] - Custom ID generator (default: crypto.randomUUID)
 * @param {function} [config.validate] - Validates an incoming request ID before trusting it (default: UUID format, max length MAX_ID_LENGTH)
 * @returns {function} (req, res) => string  -- returns the assigned request ID
 */
export default function createRequestId(config = {}) {
  const {
    header = 'x-request-id',
    trustProxy = false,
    generate = randomUUID,
    validate = defaultValidate
  } = config;

  const lowerHeader = header.toLowerCase();

  return function applyRequestId(req, res) {
    let id;

    if (trustProxy) {
      const incoming = req.headers[lowerHeader];
      if (incoming && validate(incoming)) {
        id = incoming;
      }
    }

    if (!id) {
      id = generate();
      if (typeof id !== 'string' || id.length > MAX_ID_LENGTH || HEADER_UNSAFE_RE.test(id)) {
        throw new TypeError(
          `generate() must return a safe string (no CRLF/null, max ${MAX_ID_LENGTH} chars)`
        );
      }
    }

    res.setHeader(header, id);
    return id;
  };
}
