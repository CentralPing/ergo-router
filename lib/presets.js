/**
 * @fileoverview Pre-built router configuration presets for common use cases.
 *
 * Each preset is a deeply frozen {@link RouterOptions} object that consumers
 * spread into `createRouter()`. Presets are immutable — every nested object is
 * individually frozen to prevent accidental mutation of the canonical shape.
 *
 * @module lib/presets
 * @since 0.3.0
 *
 * @example
 * import createRouter, {presets} from '@centralping/ergo-router';
 *
 * const router = createRouter({
 *   ...presets.jsonApi,
 *   transport: {cors: {origin: 'https://myapp.com'}},
 *   defaults: {...presets.jsonApi.defaults, timeout: {ms: 30000}},
 * });
 */

/**
 * Namespace object containing all available router presets.
 */
export const presets = Object.freeze({
  /**
   * JSON API preset — enables transport-level request ID and security headers,
   * and restricts route-level content negotiation to `application/json`.
   *
   * Excludes deployment-specific concerns: auth, CORS origin, rate limiting.
   */
  jsonApi: Object.freeze({
    transport: Object.freeze({
      requestId: Object.freeze({}),
      security: Object.freeze({})
    }),
    defaults: Object.freeze({
      accepts: Object.freeze({
        types: Object.freeze(['application/json'])
      })
    })
  })
});
