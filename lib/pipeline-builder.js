/**
 * @fileoverview Declarative pipeline builder for ergo-router.
 *
 * Assembles the Fast Fail four-stage pipeline from a merged route configuration
 * (router defaults + per-route overrides). Each configuration key maps to an ergo
 * middleware factory. Keys set to `false` are excluded; keys absent from both the
 * route config and router defaults are omitted.
 *
 * All stages use sequential composition. Within each stage, middleware is ordered
 * by Fail Fast priority:
 *
 * 1. **Negotiation** — logger (always first), then sequential Fail Fast order:
 *    circuit breaker (rateLimit) → rejection checks (accepts, precondition) →
 *    parsing (cookie, url/jsonApiQuery, prefer) → response decoration
 *    (securityHeaders, cacheControl). Precondition enforcement is auto-included
 *    for PUT/PATCH; URL parsing is auto-included for GET/DELETE.
 * 2. **Authorization** — csrf (sync rejection) → auth (async rejection)
 * 3. **Validation** — body (auto-included for POST/PUT/PATCH), then validate
 * 4. **Execution** — timeout, compress, user's execute function
 *
 * Resolution strategy per key: route config > router defaults > omitted.
 *
 * @module lib/pipeline-builder
 * @version 0.1.0
 * @since 0.1.0
 * @requires ergo
 */
import {
  logger as createLogger,
  accepts as createAccepts,
  authorization as createAuth,
  cacheControl as createCacheControl,
  cookie as createCookie,
  prefer as createPrefer,
  precondition as createPrecondition,
  rateLimit as createRateLimit,
  url as createUrl,
  body as createBody,
  csrf as createCsrf,
  jsonApiQuery as createJsonApiQuery,
  securityHeaders as createSecurityHeaders,
  validate as createValidate,
  timeout as createTimeout,
  compress as createCompress
} from 'ergo';

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);
const URL_METHODS = new Set(['GET', 'DELETE']);
const PRECONDITION_METHODS = new Set(['PUT', 'PATCH']);

/**
 * Resolve a config key: route-level overrides router-level.
 * `false` explicitly disables. `true` uses empty options `{}`.
 * `undefined` means absent (not configured at this level).
 *
 * @param {*} routeValue - Per-route config value
 * @param {*} defaultValue - Router-level default value
 * @returns {object|false|undefined} - Resolved options object, `false` to disable, or `undefined` if absent
 */
function resolve(routeValue, defaultValue) {
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

/**
 * Build a Fast Fail pipeline array from a declarative route configuration.
 *
 * @param {string} method - HTTP method (e.g. 'GET', 'POST')
 * @param {object} routeConfig - Per-route configuration
 * @param {object|false} [routeConfig.logger] - Logger options or `false` to disable
 * @param {object|boolean|false} [routeConfig.securityHeaders] - Security headers options, `true` for defaults, or `false`
 * @param {object|boolean|false} [routeConfig.cacheControl] - Cache-Control options, `true` for defaults, or `false`
 * @param {object|false} [routeConfig.accepts] - Content negotiation options or `false`
 * @param {object|boolean|false} [routeConfig.cookie] - Cookie parsing options, `true` for defaults, or `false`
 * @param {object|boolean|false} [routeConfig.url] - URL parsing options, `true` for defaults, or `false` (auto-included for GET/DELETE)
 * @param {object|boolean|false} [routeConfig.jsonApiQuery] - JSON:API query parsing options, or `false`
 * @param {object|boolean|false} [routeConfig.preconditionRequired] - Precondition enforcement options, `true` for PUT/PATCH defaults, or `false`
 * @param {object|boolean|false} [routeConfig.rateLimit] - Rate limiting options, `true` for defaults, or `false`
 * @param {object|boolean|false} [routeConfig.prefer] - Prefer header parsing options, `true` for defaults, or `false`
 * @param {object|false} [routeConfig.auth] - Authorization options or `false`
 * @param {object|false} [routeConfig.csrf] - CSRF options or `false`
 * @param {object|false} [routeConfig.body] - Body parsing options or `false` (auto-included for POST/PUT/PATCH)
 * @param {object|false} [routeConfig.validate] - Validation schemas `{body, query, params}` or `false`
 * @param {object|false} [routeConfig.timeout] - Timeout options or `false`
 * @param {object|false} [routeConfig.compress] - Compression options or `false`
 * @param {function} routeConfig.execute - Route handler `(req, res, acc) => result`
 * @param {object} [defaults={}] - Router-level defaults for each key
 * @returns {Array} - Composed pipeline array suitable for auto-wrap
 */
export default function buildPipeline(method, routeConfig, defaults = {}) {
  const pipeline = [];

  // --- Stage 1: Negotiation ---
  const loggerOpts = resolve(routeConfig.logger, defaults.logger);
  if (loggerOpts !== false && loggerOpts !== undefined) {
    pipeline.push([createLogger(loggerOpts), [], 'log']);
  }

  // Fail Fast order: circuit breaker → rejection → parsing → response decoration
  const negotiation = [];

  const rateLimitOpts = resolve(routeConfig.rateLimit, defaults.rateLimit);
  if (rateLimitOpts !== false && rateLimitOpts !== undefined) {
    negotiation.push([createRateLimit(rateLimitOpts), [], 'rateLimit']);
  }

  const acceptsOpts = resolve(routeConfig.accepts, defaults.accepts);
  if (acceptsOpts !== false && acceptsOpts !== undefined) {
    negotiation.push([createAccepts(acceptsOpts), [], 'accepts']);
  }

  const precondOpts = resolve(routeConfig.preconditionRequired, defaults.preconditionRequired);
  if (precondOpts !== false && precondOpts !== undefined) {
    const shouldEnforce = precondOpts.methods
      ? new Set(precondOpts.methods).has(method)
      : PRECONDITION_METHODS.has(method);
    if (shouldEnforce) {
      negotiation.push([
        createPrecondition(precondOpts === true ? {} : precondOpts),
        [],
        'precondition'
      ]);
    }
  }

  const cookieOpts = resolve(routeConfig.cookie, defaults.cookie);
  if (cookieOpts !== false && cookieOpts !== undefined) {
    negotiation.push([createCookie(cookieOpts), [], 'cookies']);
  }

  const urlOpts = resolve(routeConfig.url, defaults.url);
  const shouldParseUrl = URL_METHODS.has(method) && urlOpts !== false;
  if (shouldParseUrl) {
    negotiation.push([createUrl(urlOpts ?? {}), [], 'url']);
  } else if (urlOpts !== false && urlOpts !== undefined) {
    negotiation.push([createUrl(urlOpts), [], 'url']);
  }

  const jsonApiOpts = resolve(routeConfig.jsonApiQuery, defaults.jsonApiQuery);
  if (jsonApiOpts !== false && jsonApiOpts !== undefined) {
    negotiation.push([createJsonApiQuery(jsonApiOpts), [], 'jsonApiQuery']);
  }

  const preferOpts = resolve(routeConfig.prefer, defaults.prefer);
  if (preferOpts !== false && preferOpts !== undefined) {
    negotiation.push([createPrefer(preferOpts), [], 'prefer']);
  }

  const securityOpts = resolve(routeConfig.securityHeaders, defaults.securityHeaders);
  if (securityOpts !== false && securityOpts !== undefined) {
    negotiation.push([createSecurityHeaders(securityOpts), [], 'security']);
  }

  const cacheOpts = resolve(routeConfig.cacheControl, defaults.cacheControl);
  if (cacheOpts !== false && cacheOpts !== undefined) {
    negotiation.push([createCacheControl(cacheOpts), [], 'cache']);
  }

  pipeline.push(...negotiation);

  // --- Stage 2: Authorization ---
  const authSteps = [];

  const csrfOpts = resolve(routeConfig.csrf, defaults.csrf);
  if (csrfOpts !== false && csrfOpts !== undefined) {
    authSteps.push([createCsrf(csrfOpts), [], 'csrf']);
  }

  const authOpts = resolve(routeConfig.auth, defaults.auth);
  if (authOpts !== false && authOpts !== undefined) {
    authSteps.push([createAuth(authOpts), [], 'auth']);
  }

  pipeline.push(...authSteps);

  // --- Stage 3: Validation ---
  const bodyOpts = resolve(routeConfig.body, defaults.body);
  const shouldParseBody = BODY_METHODS.has(method) && bodyOpts !== false;

  if (shouldParseBody) {
    pipeline.push([createBody(bodyOpts ?? {}), [], 'body']);
  }

  const validateOpts = resolve(routeConfig.validate, defaults.validate);
  if (validateOpts !== false && validateOpts !== undefined) {
    const deps = [];
    if (shouldParseBody) {
      deps.push('body');
    }
    deps.push('url');
    pipeline.push([createValidate(validateOpts), deps, 'validation']);
  }

  // --- Stage 4: Execution ---
  const timeoutOpts = resolve(routeConfig.timeout, defaults.timeout);
  if (timeoutOpts !== false && timeoutOpts !== undefined) {
    pipeline.push(createTimeout(timeoutOpts));
  }

  const compressOpts = resolve(routeConfig.compress, defaults.compress);
  if (compressOpts !== false && compressOpts !== undefined) {
    pipeline.push([createCompress(compressOpts), [], 'compress']);
  }

  if (typeof routeConfig.execute === 'function') {
    pipeline.push(routeConfig.execute);
  }

  return pipeline;
}
