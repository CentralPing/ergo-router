/**
 * @fileoverview Shared RFC 9457 error response helper for ergo-router.
 *
 * Provides a single function for all short-circuit error responses (404, 405, 415, 429, 500)
 * that produces consistent RFC 9457 Problem Details bodies. Used by router.js, auto-wrap.js,
 * and transport/index.js so every error path emits the same shape.
 *
 * @module lib/error-response
 * @version 0.1.0
 * @since 0.1.0
 * @requires ergo
 * @see {@link https://www.rfc-editor.org/rfc/rfc9457 RFC 9457 - Problem Details for HTTP APIs}
 */
import {httpErrors} from 'ergo';

/**
 * End the response with an RFC 9457 Problem Details JSON body.
 *
 * Headers already set on `res` (e.g. `Allow`, `Retry-After`, `Accept-Patch`) are preserved
 * since this function only adds `Content-Type` and `Content-Length`.
 *
 * @param {import('node:http').ServerResponse} res - HTTP response object
 * @param {number} statusCode - HTTP status code for the error
 * @param {object} [opts] - Additional options forwarded to `httpErrors()` (e.g. `retryAfter`, `detail`)
 * @returns {void}
 */
export default function endWithProblem(res, statusCode, opts) {
  const err = httpErrors(statusCode, opts);
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/problem+json; charset=utf-8');
  const body = JSON.stringify(err);
  res.setHeader('Content-Length', Buffer.byteLength(body));
  res.end(body);
}
