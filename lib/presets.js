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
  }),

  /**
   * Server-Sent Events preset — enables transport-level request ID and security
   * headers, disables compression (prevents buffering of streamed chunks), disables
   * timeout (SSE connections are long-lived), and restricts content negotiation to
   * `text/event-stream`.
   *
   * Routes using this preset should set `noSend: true` per-route so the handler
   * can write the event stream directly.
   *
   * Excludes deployment-specific concerns: auth, CORS origin, rate limiting.
   *
   * @since 0.4.0
   */
  sse: Object.freeze({
    transport: Object.freeze({
      requestId: Object.freeze({}),
      security: Object.freeze({})
    }),
    defaults: Object.freeze({
      compress: false,
      timeout: false,
      accepts: Object.freeze({
        types: Object.freeze(['text/event-stream'])
      })
    })
  }),

  /**
   * Webhook receiver preset — enables transport-level request ID and security
   * headers, restricts content negotiation to `application/json`, and requires
   * the `Idempotency-Key` header for safe at-least-once delivery.
   *
   * Excludes deployment-specific concerns: auth, CORS origin, rate limiting.
   *
   * @since 0.4.0
   */
  webhooks: Object.freeze({
    transport: Object.freeze({
      requestId: Object.freeze({}),
      security: Object.freeze({})
    }),
    defaults: Object.freeze({
      accepts: Object.freeze({
        types: Object.freeze(['application/json'])
      }),
      idempotency: Object.freeze({
        required: true
      })
    })
  }),

  /**
   * Public read-only API preset — enables transport-level request ID, security
   * headers, and rate limiting (built-in defaults: 100 req/60s), restricts content
   * negotiation to `application/json`, and sets `Cache-Control: public, max-age=300`.
   *
   * Excludes deployment-specific concerns: auth, CORS origin.
   *
   * @since 0.4.0
   */
  public: Object.freeze({
    transport: Object.freeze({
      requestId: Object.freeze({}),
      security: Object.freeze({}),
      rateLimit: Object.freeze({})
    }),
    defaults: Object.freeze({
      accepts: Object.freeze({
        types: Object.freeze(['application/json'])
      }),
      cacheControl: Object.freeze({
        public: true,
        maxAge: 300
      })
    })
  })
});
