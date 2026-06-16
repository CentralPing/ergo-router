/**
 * @fileoverview Shared config resolution utility for ergo-router.
 *
 * Resolves a config key against router-level defaults using the standard
 * precedence: route config > router defaults > omitted. Used by
 * `pipeline-builder.js`, `openapi.js`, and `route-table.js`.
 *
 * @module lib/resolve-config
 * @since 0.6.0
 */

/**
 * Resolve a config key: route-level overrides router-level.
 * `false` explicitly disables. `true` uses empty options `{}`.
 * `undefined` means absent (not configured at this level).
 *
 * @param {*} routeValue - Per-route config value
 * @param {*} defaultValue - Router-level default value
 * @returns {object|false|undefined} - Resolved options object, `false` to disable, or `undefined` if absent
 */
export default function resolve(routeValue, defaultValue) {
  const value = routeValue !== undefined ? routeValue : defaultValue;

  if (value === undefined) {
    return undefined;
  }
  if (value === false) {
    return false;
  }
  if (value === true) {
    return {};
  }
  return value;
}
