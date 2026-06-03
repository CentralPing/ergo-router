/**
 * @fileoverview Entry point for OpenAPI generation sub-path export.
 *
 * Re-exports `generateOpenAPI` from `lib/openapi.js` for consumer access
 * via `@centralping/ergo-router/openapi`.
 *
 * @module @centralping/ergo-router/openapi
 * @since 0.2.0
 * @requires ./lib/openapi.js
 *
 * @example
 * import generateOpenAPI from '@centralping/ergo-router/openapi';
 * import createRouter from '@centralping/ergo-router';
 *
 * const router = createRouter();
 * router.get('/users/:id', {
 *   validate: {params: {type: 'object', properties: {id: {type: 'string'}}}},
 *   execute: (req, res, acc) => ({response: {body: {id: acc.route.params.id}}})
 * });
 *
 * const spec = generateOpenAPI(router, {title: 'My API', version: '1.0.0'});
 * console.log(JSON.stringify(spec, null, 2));
 */

export {default} from './lib/openapi.js';
