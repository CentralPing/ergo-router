/**
 * @fileoverview Declarative pipeline builder for ergo-router (v2).
 *
 * Assembles the Fast Fail four-stage pipeline from a merged route configuration
 * (router defaults + per-route overrides). Each configuration key maps to an ergo
 * middleware factory. Keys set to `false` are excluded; keys absent from both the
 * route config and router defaults are omitted.
 *
 * Each domain-producing middleware factory is composed as a `{fn, setPath}` config
 * object. Response-only middleware (rate limiting, headers, validation gates) are
 * plain functions. CSRF is wrapped with a method-dispatching adapter (issue for safe
 * methods, verify for unsafe).
 *
 * All stages use sequential composition. Within each stage, middleware is ordered
 * by Fail Fast priority:
 *
 * 1. **Negotiation** — logger (always first), then sequential Fail Fast order:
 *    circuit breaker (rateLimit) → rejection checks (accepts, precondition) →
 *    parsing (cookie, url/jsonApiQuery, prefer) → response decoration
 *    (securityHeaders, cacheControl). Precondition enforcement is auto-included
 *    for PUT/PATCH; URL parsing is auto-included for GET/DELETE.
 * 2. **Authorization** — csrf (method-dispatching adapter) → authorization (async rejection)
 * 3. **Validation** — body (auto-included for POST/PUT/PATCH), then validate
 * 4. **Execution** — timeout, compress, user's execute function
 *
 * Resolution strategy per key: route config > router defaults > omitted.
 *
 * @module lib/pipeline-builder
 * @since 0.1.0
 * @requires @centralping/ergo
 */
import {
  logger as createLogger,
  accepts as createAccepts,
  authorization as createAuth,
  cacheControl as createCacheControl,
  cookie as createCookie,
  paginate as createPaginate,
  prefer as createPrefer,
  precondition as createPrecondition,
  rateLimit as createRateLimit,
  tracing as createTracing,
  url as createUrl,
  body as createBody,
  csrf as createCsrf,
  jsonApiQuery as createJsonApiQuery,
  securityHeaders as createSecurityHeaders,
  idempotency as createIdempotency,
  validate as createValidate,
  timeout as createTimeout,
  compress as createCompress
} from '@centralping/ergo';

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);
const URL_METHODS = new Set(['GET', 'DELETE']);
const PRECONDITION_METHODS = new Set(['PUT', 'PATCH']);
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * Declarative route configuration object.
 *
 * Each key corresponds to an ergo middleware factory. Set to `false` to explicitly
 * disable, `true` to use default options, or an options object for custom
 * configuration. Resolution order: route config > router defaults > omitted.
 *
 * @typedef {object} RouteConfig
 * @property {object|boolean} [tracing] - OpenTelemetry tracing options, `true` for defaults, or `false` to disable
 * @property {object|boolean} [logger] - Logger options, `true` for defaults, or `false` to disable
 * @property {object|boolean} [rateLimit] - Rate limiting options, `true` for defaults, or `false`
 * @property {object|boolean} [accepts] - Content negotiation options, `true` for defaults, or `false`
 * @property {object|boolean} [preconditionRequired] - Precondition enforcement options, `true` for PUT/PATCH defaults, or `false`
 * @property {object|boolean} [cookie] - Cookie parsing options, `true` for defaults, or `false`
 * @property {object|boolean} [url] - URL parsing options, `true` for defaults, or `false` (auto-included for GET/DELETE)
 * @property {object|boolean} [paginate] - Pagination middleware options, `true` for defaults, or `false`. Auto-includes URL parsing when active.
 * @property {object|boolean} [jsonApiQuery] - JSON:API query parsing options, `true` for defaults, or `false`
 * @property {object|boolean} [prefer] - Prefer header parsing options, `true` for defaults, or `false`
 * @property {object|boolean} [securityHeaders] - Security headers options, `true` for defaults, or `false`
 * @property {object|boolean} [cacheControl] - Cache-Control options, `true` for defaults, or `false`
 * @property {object|boolean} [csrf] - CSRF options, `true` for defaults, or `false`
 * @property {object|boolean} [authorization] - Authorization options, `true` for defaults, or `false`
 * @property {object|boolean} [body] - Body parsing options, `true` for defaults, or `false` (auto-included for POST/PUT/PATCH)
 * @property {object|boolean} [idempotency] - Idempotency-Key options, `true` for defaults, or `false`
 * @property {object|boolean} [validate] - Validation schemas `{body, query, params}`, `true` for defaults, or `false`
 * @property {object|boolean} [timeout] - Timeout options, `true` for defaults, or `false`
 * @property {object|boolean} [compress] - Compression options, `true` for defaults, or `false`
 * @property {Array<function|{fn: function, setPath: string}>|false} [use] - Custom middleware config objects or bare functions inserted after validation and before execution. Defaults and route arrays are concatenated; `false` disables all.
 * @property {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, domainAcc: object, responseAcc: object) => *} execute - Route handler function
 * @property {object} [send] - Per-route send() options
 * @property {boolean} [noSend] - Opt out of implicit send()
 * @property {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse, err: Error, domainAcc: object) => *} [catchHandler] - Per-route error handler. Receives the domain accumulator as the 4th argument (may be partially populated if the error occurred mid-pipeline).
 * @property {object} [openapi] - OpenAPI annotation object for documentation generation. Pass-through only — not consumed by the pipeline builder. Supports `summary`, `description`, `tags`, `responses`, `operationId`, and `externalDocs`.
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
 * Creates a method-dispatching CSRF middleware adapter.
 *
 * `createCsrf()` returns `{issue, verify}` — two separate middleware functions.
 * This adapter calls `issue` for safe methods (GET, HEAD, OPTIONS) and `verify`
 * for unsafe methods (POST, PUT, PATCH, DELETE).
 *
 * @param {object} csrfOpts - Options forwarded to `createCsrf()`
 */
function createCsrfAdapter(csrfOpts) {
  const {issue, verify} = createCsrf(csrfOpts);

  return function csrfAdapterMiddleware(req, res, domainAcc, responseAcc) {
    if (SAFE_METHODS.has(req.method)) {
      return issue(req, res, domainAcc, responseAcc);
    }

    return verify(req, res, domainAcc, responseAcc);
  };
}

/**
 * Build a Fast Fail pipeline array from a declarative route configuration.
 *
 * @param {string} method - HTTP method (e.g. 'GET', 'POST')
 * @param {RouteConfig} routeConfig - Per-route configuration (see {@link RouteConfig})
 * @param {object} [defaults={}] - Router-level defaults for each key
 * @returns {any[]} - Composed pipeline array suitable for auto-wrap
 */
export default function buildPipeline(method, routeConfig, defaults = {}) {
  const pipeline = [];

  // --- Stage 1: Negotiation ---
  const tracingOpts = resolve(routeConfig.tracing, defaults.tracing);
  if (tracingOpts !== false && tracingOpts !== undefined) {
    pipeline.push({fn: createTracing(tracingOpts), setPath: 'trace'});
  }

  const loggerOpts = resolve(routeConfig.logger, defaults.logger);
  if (loggerOpts !== false && loggerOpts !== undefined) {
    pipeline.push({fn: createLogger(loggerOpts), setPath: 'log'});
  }

  // Fail Fast order: circuit breaker → rejection → parsing → response decoration
  const negotiation = [];

  const rateLimitOpts = resolve(routeConfig.rateLimit, defaults.rateLimit);
  if (rateLimitOpts !== false && rateLimitOpts !== undefined) {
    negotiation.push(createRateLimit(rateLimitOpts));
  }

  const acceptsOpts = resolve(routeConfig.accepts, defaults.accepts);
  if (acceptsOpts !== false && acceptsOpts !== undefined) {
    negotiation.push({fn: createAccepts(acceptsOpts), setPath: 'accepts'});
  }

  const precondOpts = resolve(routeConfig.preconditionRequired, defaults.preconditionRequired);
  if (precondOpts !== false && precondOpts !== undefined) {
    const shouldEnforce = precondOpts.methods
      ? new Set(precondOpts.methods).has(method)
      : PRECONDITION_METHODS.has(method);
    if (shouldEnforce) {
      negotiation.push(createPrecondition(precondOpts === true ? {} : precondOpts));
    }
  }

  const cookieOpts = resolve(routeConfig.cookie, defaults.cookie);
  if (cookieOpts !== false && cookieOpts !== undefined) {
    negotiation.push({fn: createCookie(cookieOpts), setPath: 'cookies'});
  }

  const paginateOpts = resolve(routeConfig.paginate, defaults.paginate);
  const paginateActive = paginateOpts !== false && paginateOpts !== undefined;

  const urlOpts = resolve(routeConfig.url, defaults.url);
  const shouldParseUrl = (URL_METHODS.has(method) || paginateActive) && urlOpts !== false;
  if (shouldParseUrl) {
    negotiation.push({fn: createUrl(urlOpts ?? {}), setPath: 'url'});
  } else if (urlOpts !== false && urlOpts !== undefined) {
    negotiation.push({fn: createUrl(urlOpts), setPath: 'url'});
  }

  if (paginateActive) {
    negotiation.push({fn: createPaginate(paginateOpts), setPath: 'paginate'});
  }

  const jsonApiOpts = resolve(routeConfig.jsonApiQuery, defaults.jsonApiQuery);
  if (jsonApiOpts !== false && jsonApiOpts !== undefined) {
    negotiation.push(createJsonApiQuery(jsonApiOpts));
  }

  const preferOpts = resolve(routeConfig.prefer, defaults.prefer);
  if (preferOpts !== false && preferOpts !== undefined) {
    negotiation.push({fn: createPrefer(preferOpts), setPath: 'prefer'});
  }

  const securityOpts = resolve(routeConfig.securityHeaders, defaults.securityHeaders);
  if (securityOpts !== false && securityOpts !== undefined) {
    negotiation.push(createSecurityHeaders(securityOpts));
  }

  const cacheOpts = resolve(routeConfig.cacheControl, defaults.cacheControl);
  if (cacheOpts !== false && cacheOpts !== undefined) {
    negotiation.push(createCacheControl(cacheOpts));
  }

  pipeline.push(...negotiation);

  // --- Stage 2: Authorization ---
  const authSteps = [];

  const csrfOpts = resolve(routeConfig.csrf, defaults.csrf);
  if (csrfOpts !== false && csrfOpts !== undefined) {
    authSteps.push({fn: createCsrfAdapter(csrfOpts), setPath: 'csrf'});
  }

  const authOpts = resolve(routeConfig.authorization, defaults.authorization);
  if (authOpts !== false && authOpts !== undefined) {
    authSteps.push({fn: createAuth(authOpts), setPath: 'auth'});
  }

  pipeline.push(...authSteps);

  // --- Stage 3: Validation ---
  const bodyOpts = resolve(routeConfig.body, defaults.body);
  const shouldParseBody = BODY_METHODS.has(method) && bodyOpts !== false;

  if (shouldParseBody) {
    pipeline.push({fn: createBody(bodyOpts ?? {}), setPath: 'body'});
  }

  const idempotencyOpts = resolve(routeConfig.idempotency, defaults.idempotency);
  if (idempotencyOpts !== false && idempotencyOpts !== undefined) {
    pipeline.push({fn: createIdempotency(idempotencyOpts), setPath: 'idempotency'});
  }

  const validateOpts = resolve(routeConfig.validate, defaults.validate);
  if (validateOpts !== false && validateOpts !== undefined) {
    pipeline.push(createValidate(validateOpts));
  }

  // --- Custom: use entries (defaults then route, concatenated) ---
  if (routeConfig.use !== false) {
    const defaultsUse = Array.isArray(defaults.use) ? defaults.use : [];
    const routeUse = Array.isArray(routeConfig.use) ? routeConfig.use : [];
    pipeline.push(...defaultsUse, ...routeUse);
  }

  // --- Stage 4: Execution ---
  const timeoutOpts = resolve(routeConfig.timeout, defaults.timeout);
  if (timeoutOpts !== false && timeoutOpts !== undefined) {
    pipeline.push(createTimeout(timeoutOpts));
  }

  const compressOpts = resolve(routeConfig.compress, defaults.compress);
  if (compressOpts !== false && compressOpts !== undefined) {
    pipeline.push(createCompress(compressOpts));
  }

  if (typeof routeConfig.execute === 'function') {
    pipeline.push(routeConfig.execute);
  }

  return pipeline;
}
