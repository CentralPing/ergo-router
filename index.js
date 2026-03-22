/**
 * @fileoverview Entry point for ergo-router.
 *
 * Re-exports the router factory from `lib/router.js` and the graceful
 * lifecycle utility from `lib/lifecycle.js`.
 *
 * @module ergo-router
 * @version 0.1.0
 * @since 0.1.0
 * @requires ./lib/router.js
 * @requires ./lib/lifecycle.js
 *
 * @example
 * import createRouter from 'ergo-router';
 *
 * const router = createRouter({
 *   transport: {requestId: {}, security: {}, cors: {origin: '*'}},
 *   defaults: {accepts: {types: ['application/json']}, timeout: {ms: 30000}}
 * });
 *
 * // Declarative config
 * router.get('/users/:id', {
 *   auth: {strategies: [bearerStrategy]},
 *   execute: (req, res, acc) => ({response: {body: {id: acc.route.params.id}}})
 * });
 *
 * // Raw function handler (params as third argument)
 * router.get('/health', (req, res, params) => {
 *   res.statusCode = 200;
 *   res.end('ok');
 * });
 *
 * const server = http.createServer(router.handle());
 * server.listen(3000);
 */

export {default} from './lib/router.js';
export {default as graceful} from './lib/lifecycle.js';
