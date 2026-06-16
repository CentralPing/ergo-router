/**
 * @fileoverview Route table formatter for ergo-router.
 *
 * Produces a human-readable summary of registered routes, enabled middleware,
 * and transport configuration. Designed for startup-time invocation via the
 * `router.routeTable()` method.
 *
 * Pure function — no transport dependencies, no side effects.
 *
 * @module lib/route-table
 * @since 0.6.0
 */
import resolve from './resolve-config.js';
import {PIPELINE_KEYS} from './validate-config.js';

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);
const URL_METHODS = new Set(['GET', 'DELETE']);

const EXCLUDED_KEYS = new Set(['execute', 'use']);

/**
 * Pipeline stage order matching `buildPipeline()` execution order.
 * Used to display middleware names in a consistent, predictable sequence.
 * @type {string[]}
 */
const STAGE_ORDER = [
  'tracing',
  'logger',
  'rateLimit',
  'accepts',
  'preconditionRequired',
  'cookie',
  'url',
  'paginate',
  'jsonApiQuery',
  'prefer',
  'securityHeaders',
  'cacheControl',
  'csrf',
  'authorization',
  'body',
  'idempotency',
  'validate',
  'timeout',
  'compress'
];

/**
 * Transport concern keys in display order.
 * @type {string[]}
 */
const TRANSPORT_KEYS = ['requestId', 'security', 'rateLimit', 'cors'];

/**
 * Format a route table string from a router's registered metadata.
 *
 * @param {object} router - An ergo-router instance created by `createRouter()`
 * @returns {string} - Multi-line formatted route table
 */
export default function formatRouteTable(router) {
  const sections = [];

  sections.push(formatRoutesSection(router));

  const transportSection = formatTransportSection(router);
  if (transportSection) {
    sections.push(transportSection);
  }

  return sections.join('\n\n');
}

/**
 * Format the routes section of the route table.
 *
 * @param {object} router - Router instance
 * @returns {string} - Formatted routes section
 */
function formatRoutesSection(router) {
  const routes = router._routes;
  const defaults = router._options?.defaults ?? {};

  if (routes.length === 0) {
    return 'Routes: (none)';
  }

  const maxMethodLen = Math.max(...routes.map(r => r.method.length));
  const lines = routes.map(entry => formatRouteEntry(entry, defaults, maxMethodLen));

  return `Routes:\n${lines.join('\n')}`;
}

/**
 * Format a single route entry.
 *
 * @param {object} entry - Route metadata entry `{method, path, config, defaults}`
 * @param {object} fallbackDefaults - Router-level defaults
 * @param {number} maxMethodLen - Maximum method string length for alignment
 * @returns {string} - Formatted route line
 */
function formatRouteEntry(entry, fallbackDefaults, maxMethodLen) {
  const {method, path, config} = entry;
  const paddedMethod = method.padEnd(maxMethodLen);

  if (!config) {
    return `  ${paddedMethod} ${path}  (custom)`;
  }

  const defaults = entry.defaults ?? fallbackDefaults;
  const middleware = resolveMiddleware(method, config, defaults);

  if (middleware.length === 0) {
    return `  ${paddedMethod} ${path}`;
  }

  return `  ${paddedMethod} ${path}  [${middleware.join(', ')}]`;
}

/**
 * Resolve which middleware keys are enabled for a route, in pipeline stage order.
 *
 * @param {string} method - HTTP method
 * @param {object} config - Route config object
 * @param {object} defaults - Router-level defaults
 * @returns {string[]} - Array of enabled middleware key names in stage order
 */
function resolveMiddleware(method, config, defaults) {
  const enabled = [];

  for (const key of STAGE_ORDER) {
    if (!PIPELINE_KEYS.has(key) || EXCLUDED_KEYS.has(key)) continue;

    const routeValue = config[key];
    const defaultValue = defaults[key];

    if (key === 'url') {
      const urlOpts = resolve(routeValue, defaultValue);
      const paginateOpts = resolve(config.paginate, defaults.paginate);
      const paginateActive = paginateOpts !== false && paginateOpts !== undefined;
      const shouldParseUrl = (URL_METHODS.has(method) || paginateActive) && urlOpts !== false;

      if (shouldParseUrl || (urlOpts !== false && urlOpts !== undefined)) {
        enabled.push('url');
      }
    } else if (key === 'body') {
      const bodyOpts = resolve(routeValue, defaultValue);
      const shouldParseBody = BODY_METHODS.has(method) && bodyOpts !== false;

      if (shouldParseBody || (bodyOpts !== false && bodyOpts !== undefined)) {
        enabled.push('body');
      }
    } else {
      const resolved = resolve(routeValue, defaultValue);
      if (resolved !== false && resolved !== undefined) {
        enabled.push(key);
      }
    }
  }

  return enabled;
}

/**
 * Format the transport section of the route table.
 *
 * @param {object} router - Router instance
 * @returns {string|undefined} - Formatted transport section, or undefined if no transport
 */
function formatTransportSection(router) {
  const transport = router._options?.transport;

  if (!transport) {
    return undefined;
  }

  const lines = [];

  for (const key of TRANSPORT_KEYS) {
    const value = transport[key];

    if (value === undefined || value === false) {
      lines.push(`  ${key}: disabled`);
    } else {
      const detail = formatTransportDetail(key, value);
      lines.push(`  ${key}: enabled${detail}`);
    }
  }

  return `Transport:\n${lines.join('\n')}`;
}

/**
 * Format transport concern detail string.
 *
 * @param {string} key - Transport key name
 * @param {object|boolean} value - Transport config value
 * @returns {string} - Detail suffix (empty string if no details)
 */
function formatTransportDetail(key, value) {
  if (value === true || (typeof value === 'object' && Object.keys(value).length === 0)) {
    return '';
  }

  if (typeof value !== 'object') {
    return '';
  }

  const details = [];

  if (key === 'cors' && value.origin) {
    const origin = Array.isArray(value.origin) ? value.origin.join(', ') : String(value.origin);
    details.push(`origin: ${origin}`);
  }

  if (key === 'rateLimit') {
    if (value.max !== undefined) details.push(`max: ${value.max}`);
    if (value.windowMs !== undefined) details.push(`windowMs: ${value.windowMs}`);
  }

  if (details.length === 0) {
    return '';
  }

  return ` (${details.join(', ')})`;
}
