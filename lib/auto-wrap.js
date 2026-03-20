/**
 * @fileoverview Route pipeline auto-wrapper for ergo-router.
 *
 * Wraps route pipeline arrays with `compose(...steps, send())` and handles
 * error normalization. Seeds the initial accumulator with `acc.route.params`
 * from the route match so pipeline middleware can access route parameters.
 *
 * ergo is a required peer dependency of ergo-router.
 * Both packages are always used together.
 *
 * @module lib/auto-wrap
 * @version 0.1.0
 * @since 0.1.0
 * @requires ergo
 * @requires ./error-response.js
 */
import {compose, send as createSend, httpErrors} from 'ergo';
import endWithProblem from './error-response.js';

/**
 * Create an accumulator-compatible seed object for compose.
 * @param {object} [initial={}] - Properties to seed the accumulator with
 * @returns {object} - Null-prototype object with `isAccumulator: true` and initial properties
 */
function createSeed(initial = {}) {
  const seed = Object.create(null);

  Object.defineProperties(seed, {
    isAccumulator: {value: true},
    size: {
      get() {
        return Object.keys(this).length;
      }
    }
  });

  return Object.assign(seed, initial);
}

/**
 * Auto-wrap builds the final executable handler for a route pipeline.
 *
 * Array pipelines are wrapped with compose and send, with the initial
 * accumulator seeded with `{route: {params}}` from the route match.
 *
 * Function pipelines are passed through unchanged.
 *
 * @param {object} routerOptions - Router-level options
 * @param {object} [routerOptions.send] - Default send() options
 * @param {function} [routerOptions.formatError] - Custom error formatter `(err, req, res) => sendableResult`
 * @param {function} [routerOptions.catchHandler] - Default catch handler for all route pipelines
 * @param {function[]} appMiddleware - Router use() middleware prepended to every pipeline
 * @returns {function} wrap(pipeline, routeOpts) => executableFn
 */
export default function createAutoWrap(routerOptions = {}, appMiddleware = []) {
  /**
   * Wrap a route pipeline into an executable (req, res, params) handler.
   *
   * @param {function|function[]} pipeline - Route handler or pipeline array
   * @param {object} [routeOpts] - Per-route options
   * @param {boolean} [routeOpts.noSend=false] - Opt out of implicit send()
   * @param {function} [routeOpts.catchHandler] - Per-route error handler
   * @param {object} [routeOpts.send] - Per-route send() options
   * @returns {function} (req, res, params) => Promise
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

    const sendOpts = routeOpts.send ?? routerOptions.send ?? {};
    const catchFn = routeOpts.catchHandler ?? routerOptions.catchHandler;

    const steps = [...appMiddleware, ...pipeline];

    if (routeOpts.noSend !== true) {
      steps.push(createSend(sendOpts));
    }

    const mainPipeline = compose(...steps);

    if (catchFn) {
      return async (req, res, params) => {
        const seed = createSeed({route: {params}});
        try {
          return await mainPipeline(req, res, seed);
        } catch (err) {
          err.statusCode ??= 500;
          err.status ??= err.statusCode;
          if (res.listenerCount('error') > 0) {
            res.emit('error', err);
          }
          return await catchFn(req, res, err);
        }
      };
    }

    const errorFormatter = routerOptions.formatError ?? defaultFormatError;
    const errorSend = createSend(sendOpts);

    return async (req, res, params) => {
      const seed = createSeed({route: {params}});
      try {
        return await mainPipeline(req, res, seed);
      } catch (err) {
        err.statusCode ??= 500;
        err.status ??= err.statusCode;
        if (res.listenerCount('error') > 0) {
          res.emit('error', err);
        }
        return errorSend(req, res, errorFormatter(err, req, res));
      }
    };
  };
}

/**
 * Default error formatter: shapes a thrown error into a sendable accumulator result.
 *
 * If the error already has `toJSON` (i.e. created by `httpErrors()`), it is used directly.
 * Otherwise the error is wrapped with `httpErrors()` for consistent RFC 9457 Problem Details.
 *
 * @param {Error} err
 * @param {object} req
 * @param {object} res
 * @returns {{statusCode: number, body: object, headers: Array}}
 */
function defaultFormatError(err, req, res) {
  const requestId = res.getHeader('x-request-id');
  const instanceOpt = requestId ? {instance: `urn:uuid:${requestId}`} : {};

  if (typeof err.toJSON === 'function') {
    if (!err.instance && requestId) {
      err.instance = `urn:uuid:${requestId}`;
    }
    return {statusCode: err.statusCode, body: err, headers: err.headers ?? []};
  }

  const safeMessage = err.statusCode < 500 ? err.message : undefined;
  const wrapped = httpErrors(err.statusCode ?? 500, {message: safeMessage, ...instanceOpt});
  return {statusCode: wrapped.statusCode, body: wrapped, headers: err.headers ?? []};
}
