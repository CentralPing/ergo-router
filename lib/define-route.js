/**
 * @fileoverview Type-inference helpers for route configuration.
 *
 * These functions are type-level identity operations at runtime — they merge
 * a config object with an execute callback into a standard RouteConfig. Their
 * purpose is to enable TypeScript to infer the domain accumulator type from
 * enabled middleware config keys.
 *
 * TypeScript cannot infer a generic type parameter from an object literal's
 * properties when a sibling callback in the same object uses that parameter
 * (circular inference). Separating config (inference source) from execute
 * (contextual typing target) into two function parameters resolves this.
 *
 * @module @centralping/ergo-router/lib/define-route
 * @since 0.5.0
 */

/**
 * Type-inference helper for GET/DELETE routes.
 *
 * @param {object} config - Middleware configuration (without execute).
 * @param {Function} execute - Route handler receiving the inferred accumulator.
 * @returns {object} RouteConfig object with config and execute merged.
 */
export function defineGet(config, execute) {
  return Object.assign(Object.create(null), config, {execute});
}

/**
 * Type-inference helper for POST/PUT/PATCH routes.
 *
 * @param {object} config - Middleware configuration (without execute).
 * @param {Function} execute - Route handler receiving the inferred accumulator.
 * @returns {object} RouteConfig object with config and execute merged.
 */
export function definePost(config, execute) {
  return Object.assign(Object.create(null), config, {execute});
}

/**
 * General type-inference helper (method-agnostic).
 *
 * @param {object} config - Middleware configuration (without execute).
 * @param {Function} execute - Route handler receiving the inferred accumulator.
 * @returns {object} RouteConfig object with config and execute merged.
 */
export function defineRoute(config, execute) {
  return Object.assign(Object.create(null), config, {execute});
}
