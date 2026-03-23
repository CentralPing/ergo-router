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
 * ergo is a required peer dependency of ergo-router.
 *
 * @module lib/auto-wrap
 * @version 0.2.0
 * @since 0.1.0
 * @requires ergo
 */
import {compose, send as createSend, createResponseAcc} from 'ergo';
import {accumulator} from 'ergo/utils/compose';
import attachInstance from 'ergo/lib/attach-instance';
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
    const noSend = routeOpts.noSend === true;

    const steps = [...appMiddleware, ...pipeline];
    const mainPipeline = compose(...steps);
    const send = noSend ? undefined : createSend(sendOpts);

    if (catchFn) {
      return async (req, res, params) => {
        const domainAcc = accumulator({route: {params}});
        const responseAcc = createResponseAcc();

        try {
          await mainPipeline(req, res, responseAcc, domainAcc);
        } catch (err) {
          normalizeCaughtError(err, res);
          return await catchFn(req, res, err);
        }

        if (send) send(req, res, responseAcc, domainAcc);
      };
    }

    return async (req, res, params) => {
      const domainAcc = accumulator({route: {params}});
      const responseAcc = createResponseAcc();

      try {
        await mainPipeline(req, res, responseAcc, domainAcc);
      } catch (err) {
        if (responseAcc.statusCode === undefined) {
          responseAcc.statusCode = 500;
        }

        attachInstance(responseAcc, res);

        if (res.listenerCount('error') > 0) {
          res.emit('error', err);
        }
      }

      if (send) send(req, res, responseAcc, domainAcc);
    };
  };
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
