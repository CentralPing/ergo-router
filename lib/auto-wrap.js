/**
 * @fileoverview Route pipeline auto-wrapper for ergo-router (v2 two-accumulator model).
 *
 * Wraps route pipeline arrays with `compose(...steps)` and handles error
 * normalization. Seeds the initial domain accumulator with `acc.route.params`
 * from the route match so pipeline middleware can access route parameters.
 *
 * In v2, send() is NOT part of the pipeline — it is called once after the
 * pipeline completes (both success and error paths). Middleware declares
 * outcomes via `{value, response}` returns; send() formats the response.
 *
 * @centralping/ergo is a required peer dependency of @centralping/ergo-router.
 *
 * @module lib/auto-wrap
 * @since 0.1.0
 * @requires @centralping/ergo
 */
import {compose, send as createSend, createResponseAcc} from '@centralping/ergo';
import {accumulator} from '@centralping/ergo/utils/compose';
import attachInstance from '@centralping/ergo/lib/attach-instance';
import buildResponseInfo from '@centralping/ergo/lib/response-info';
import {DEFAULT_REDACTED_HEADERS} from '@centralping/ergo/lib/redact-headers';
import {statusFromHttp} from '@centralping/ergo/lib/tracing';
import {ATTR_HTTP_RESPONSE_STATUS_CODE} from '@centralping/ergo/lib/otel-attributes';
import applyResponseTiming, {resolveTimingConfig} from '@centralping/ergo/lib/response-time';
import endWithProblem from './error-response.js';

/**
 * Auto-wrap builds the final executable handler for a route pipeline.
 *
 * Array pipelines are wrapped with compose. The initial domain accumulator
 * is seeded with `{route: {params}}` from the route match.
 *
 * Function pipelines are passed through unchanged.
 *
 * @param {object} routerOptions - Router-level options
 * @param {object} [routerOptions.send] - Default send() options
 * @param {function} [routerOptions.catchHandler] - Default catch handler `(req, res, err, domainAcc)` for all route pipelines
 * @param {boolean} [routerOptions.debug=false] - Enable pipeline debug tracing. When true,
 *   `responseAcc._trace` is initialized before the pipeline runs.
 * @param {function} [routerOptions.onResponse] - Router-level post-send observation hook.
 *   Fires on every route after send(). Route-level hooks fire first.
 * @param {Set<string>} [routerOptions.redactHeaders] - Header names to replace with
 *   `'[REDACTED]'` in `responseInfo.headers` passed to `onResponse` hooks. Defaults to
 *   `DEFAULT_REDACTED_HEADERS` (authorization, proxy-authorization, cookie, set-cookie).
 *   Pass an empty Set to disable redaction.
 * @param {boolean|object} [routerOptions.timing=false] - Inject an `X-Response-Time` header
 *   measuring pipeline execution time. Pass `true` for defaults, or
 *   `{header?: string, precision?: number}` for custom configuration. Zero overhead when disabled.
 * @param {function[]} appMiddleware - Router use() middleware prepended to every pipeline
 */
export default function createAutoWrap(routerOptions = {}, appMiddleware = []) {
  const {
    onResponse: routerOnResponse,
    redactHeaders: routerRedactHeaders,
    timing = false
  } = routerOptions;
  const defaultRedactSet = routerRedactHeaders ?? new Set(DEFAULT_REDACTED_HEADERS);
  const timingConfig = resolveTimingConfig(timing);

  /**
   * Wrap a route pipeline into an executable (req, res, params) handler.
   *
   * @param {function|function[]} pipeline - Route handler or pipeline array
   * @param {object} [routeOpts] - Per-route options
   * @param {boolean} [routeOpts.noSend=false] - Opt out of implicit send()
   * @param {function} [routeOpts.catchHandler] - Per-route error handler `(req, res, err, domainAcc)`
   * @param {function} [routeOpts.onResponse] - Per-route post-send observation hook. Fires before the router-level hook.
   * @param {Set<string>} [routeOpts.redactHeaders] - Per-route override for header redaction in `onResponse` snapshots
   * @param {object} [routeOpts.send] - Per-route send() options
   */
  return function wrap(pipeline, routeOpts = {}) {
    if (typeof pipeline === 'function') {
      return pipeline;
    }

    if (!Array.isArray(pipeline)) {
      return (req, res) => {
        endWithProblem(res, 500);
      };
    }

    const sendOpts = {...(routerOptions.send ?? {}), ...(routeOpts.send ?? {})};
    const catchFn = routeOpts.catchHandler ?? routerOptions.catchHandler;
    const routeOnResponse = routeOpts.onResponse;
    const redactSet = routeOpts.redactHeaders ?? defaultRedactSet;
    const noSend = routeOpts.noSend === true;
    const debug = routerOptions.debug === true;

    const steps = [...appMiddleware, ...pipeline];
    const mainPipeline = compose(...steps);
    const send = noSend ? undefined : createSend(sendOpts);

    if (catchFn) {
      return async (req, res, params) => {
        const startTime = performance.now();
        const domainAcc = accumulator({route: {params}});
        const responseAcc = createResponseAcc();
        if (debug) responseAcc._trace = {steps: [], breakAt: undefined};
        if (timingConfig) {
          applyResponseTiming(res, timingConfig.header, timingConfig.precision);
        }

        try {
          await mainPipeline(req, res, responseAcc, domainAcc);
        } catch (err) {
          const span = domainAcc.trace?.span;
          if (span) {
            span.recordException(err);
            const code = err.statusCode ?? 500;
            span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, code);
            span.setStatus(statusFromHttp(code));
            span.end();
          }

          normalizeCaughtError(err, res);
          attachInstance(err, res);
          return await catchFn(req, res, err, domainAcc);
        }

        attachInstance(responseAcc, res);

        trySend(send, req, res, responseAcc, domainAcc);

        if (routeOnResponse || routerOnResponse) {
          const responseInfo = {
            ...buildResponseInfo(req, res, startTime, redactSet),
            source: 'pipeline'
          };
          if (routeOnResponse) {
            try {
              await routeOnResponse(req, res, responseInfo, domainAcc);
            } catch {
              /* swallow */
            }
          }
          if (routerOnResponse) {
            try {
              await routerOnResponse(req, res, responseInfo, domainAcc);
            } catch {
              /* swallow */
            }
          }
        }

        const span = domainAcc.trace?.span;
        if (span) {
          const code = responseAcc.statusCode ?? res.statusCode;
          span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, code);
          span.setStatus(statusFromHttp(code));
          span.end();
        }
      };
    }

    return async (req, res, params) => {
      const startTime = performance.now();
      const domainAcc = accumulator({route: {params}});
      const responseAcc = createResponseAcc();
      if (debug) responseAcc._trace = {steps: [], breakAt: undefined};
      if (timingConfig) {
        applyResponseTiming(res, timingConfig.header, timingConfig.precision);
      }

      try {
        await mainPipeline(req, res, responseAcc, domainAcc);
      } catch (err) {
        if (responseAcc.statusCode === undefined) {
          responseAcc.statusCode = 500;
        }

        if (res.listenerCount('error') > 0) {
          res.emit('error', err);
        }

        const span = domainAcc.trace?.span;
        if (span) {
          span.recordException(err);
        }
      }

      attachInstance(responseAcc, res);

      trySend(send, req, res, responseAcc, domainAcc);

      if (routeOnResponse || routerOnResponse) {
        const responseInfo = {
          ...buildResponseInfo(req, res, startTime, redactSet),
          source: 'pipeline'
        };
        if (routeOnResponse) {
          try {
            await routeOnResponse(req, res, responseInfo, domainAcc);
          } catch {
            /* swallow */
          }
        }
        if (routerOnResponse) {
          try {
            await routerOnResponse(req, res, responseInfo, domainAcc);
          } catch {
            /* swallow */
          }
        }
      }

      const span = domainAcc.trace?.span;
      if (span) {
        const code = responseAcc.statusCode ?? res.statusCode;
        span.setAttribute(ATTR_HTTP_RESPONSE_STATUS_CODE, code);
        span.setStatus(statusFromHttp(code));
        span.end();
      }
    };
  };
}

/**
 * Attempt to call send() with an error boundary. If send() throws
 * (e.g. JSON.stringify on a circular reference, res.setHeader after
 * headers sent), the boundary emits to error listeners, records the
 * exception on the OTEL span, and ends the response with 500 if not
 * already ended. Matches the established pattern in ergo's handler.js.
 *
 * @param {function|undefined} send - The send function, or undefined if noSend
 * @param {import('node:http').IncomingMessage} req - HTTP request
 * @param {import('node:http').ServerResponse} res - HTTP response
 * @param {object} responseAcc - Response accumulator
 * @param {object} domainAcc - Domain accumulator
 */
function trySend(send, req, res, responseAcc, domainAcc) {
  if (!send) return;
  try {
    send(req, res, responseAcc, domainAcc);
  } catch (err) {
    if (res.listenerCount('error') > 0) {
      res.emit('error', err);
    }

    const span = domainAcc.trace?.span;
    if (span) {
      span.recordException(err);
    }

    if (!res.writableEnded) {
      responseAcc.statusCode = 500;
      res.statusCode = 500;
      res.end();
    }
  }
}

/**
 * Normalize a caught error for custom catchHandler compatibility.
 * Ensures statusCode/status exist and emits to error listeners.
 *
 * @param {Error} err - The caught error
 * @param {import('node:http').ServerResponse} res - HTTP response
 */
function normalizeCaughtError(err, res) {
  err.statusCode ??= 500;
  err.status ??= err.statusCode;
  if (res.listenerCount('error') > 0) {
    res.emit('error', err);
  }
}
