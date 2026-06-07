/**
 * @fileoverview Entry point for ergo-router.
 *
 * Re-exports the router factory from `lib/router.js` and the graceful
 * lifecycle utility from `lib/lifecycle.js`.
 *
 * @module @centralping/ergo-router
 * @since 0.1.0
 * @requires ./lib/router.js
 * @requires ./lib/lifecycle.js
 * @requires ./lib/presets.js
 *
 * @example
 * import http from 'node:http';
 * import createRouter from '@centralping/ergo-router';
 *
 * const router = createRouter({
 *   transport: {requestId: {}, security: {}, cors: {origin: '*'}},
 *   defaults: {accepts: {types: ['application/json']}, timeout: {ms: 30000}}
 * });
 *
 * // Declarative config
 * router.get('/users/:id', {
 *   authorization: {strategies: [bearerStrategy]},
 *   execute: (req, res, domainAcc) => ({response: {body: {id: domainAcc.route.params.id}}})
 * });
 *
 * // Raw function handler (params as third argument)
 * router.get('/health', (req, res, domainAcc) => {
 *   res.statusCode = 200;
 *   res.end('ok');
 * });
 *
 * const server = http.createServer(router.handle());
 * server.listen(3000);
 */

export {default} from './lib/router.js';
export {default as graceful} from './lib/lifecycle.js';
export {presets} from './lib/presets.js';
export {defineGet, definePost, defineRoute} from './lib/define-route.js';
