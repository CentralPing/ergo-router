/**
 * @fileoverview OpenAPI 3.1 specification generator for ergo-router.
 *
 * Produces an OpenAPI 3.1 document from a router's registered route metadata.
 * Routes declare validation schemas (JSON Schema 2020-12), authorization
 * strategies, content types, and optional `openapi` annotation objects. This
 * module transforms that metadata into a standards-compliant OpenAPI spec.
 *
 * Pure function — no transport dependencies. Designed for build-time or
 * startup-time invocation, not per-request use.
 *
 * @module lib/openapi
 * @since 0.2.0
 */
import resolve from './resolve-config.js';

const OPENAPI_VERSION = '3.1.0';

const PARAM_PATTERN = /:(\w+)(?:\([^)]*\))?/g;
const WILDCARD_PATTERN = /\*/g;

const BODY_METHODS = new Set(['POST', 'PUT', 'PATCH']);

/**
 * Convert a find-my-way path pattern to OpenAPI path format.
 * Named params: `:id` → `{id}`. Regex-constrained: `:id(^\d+)` → `{id}`.
 * Multi-param segments: `:lat-:lng` → `{lat}-{lng}`. Wildcards: `*` → `{wildcard}`.
 *
 * @param {string} fmwPath - find-my-way path pattern
 * @returns {string} - OpenAPI-formatted path
 */
function convertPath(fmwPath) {
  return fmwPath.replace(PARAM_PATTERN, '{$1}').replace(WILDCARD_PATTERN, '{wildcard}');
}

/**
 * Extract path parameter names from a find-my-way path pattern.
 * Handles simple (`:id`), regex-constrained (`:id(^\d+)`), and multi-param
 * segments (`:lat-:lng`) correctly.
 *
 * @param {string} fmwPath - find-my-way path pattern
 * @returns {string[]} - Array of parameter names
 */
function extractPathParams(fmwPath) {
  const params = [];
  let match;
  const re = /:(\w+)(?:\([^)]*\))?/g;
  while ((match = re.exec(fmwPath)) !== null) {
    params.push(match[1]);
  }
  if (fmwPath.includes('*')) {
    params.push('wildcard');
  }
  return params;
}

/**
 * Build an OpenAPI parameter object for a path parameter.
 *
 * @param {string} name - Parameter name
 * @param {object} [schema] - JSON Schema for the parameter from `validate.params.properties`
 * @returns {object} - OpenAPI parameter object
 */
function buildPathParam(name, schema) {
  return {name, in: 'path', required: true, schema: schema ?? {type: 'string'}};
}

/**
 * Build OpenAPI parameter objects from a query validation schema.
 *
 * @param {object} querySchema - JSON Schema object for query params (from `validate.query`)
 * @returns {object[]} - Array of OpenAPI parameter objects
 */
function buildQueryParams(querySchema) {
  if (!querySchema?.properties) return [];

  const requiredSet = new Set(querySchema.required ?? []);

  return Object.entries(querySchema.properties).map(([name, schema]) => {
    const param = {name, in: 'query', schema};
    if (requiredSet.has(name)) {
      param.required = true;
    }
    return param;
  });
}

/**
 * Build an OpenAPI requestBody object from a body validation schema.
 * Advertises all accepted content types in the requestBody.content map.
 *
 * @param {object} bodySchema - JSON Schema for the request body (from `validate.body`)
 * @param {string[]} [contentTypes] - Accepted content types
 * @returns {object} - OpenAPI requestBody object
 */
function buildRequestBody(bodySchema, contentTypes) {
  const mediaTypes = contentTypes?.length ? contentTypes : ['application/json'];
  const content = Object.create(null);

  for (const mediaType of mediaTypes) {
    content[mediaType] = {schema: bodySchema};
  }

  return {required: true, content};
}

/**
 * Derive OpenAPI security scheme type from an authorization strategy name.
 *
 * @param {string} name - Strategy name (e.g. 'Bearer', 'Basic')
 * @returns {object} - OpenAPI security scheme object
 */
function deriveSecurityScheme(name) {
  const lower = name.toLowerCase();

  if (lower === 'bearer') return {type: 'http', scheme: 'bearer'};
  if (lower === 'basic') return {type: 'http', scheme: 'basic'};
  return {type: 'apiKey', in: 'header', name: 'Authorization'};
}

/**
 * Build an OpenAPI operation object from a single route entry.
 * Derives parameters, requestBody, and security from config, then applies
 * annotation overrides on top (annotations always win over derived values).
 *
 * @param {object} entry - Route metadata entry `{method, path, config, defaults}`
 * @param {object} fallbackDefaults - Router-level defaults (fallback when entry has no defaults)
 * @param {object} securitySchemes - Mutable null-prototype map collecting security schemes
 * @returns {object} - OpenAPI operation object
 */
function buildOperation(entry, fallbackDefaults, securitySchemes) {
  const {method, path, config} = entry;
  const operation = {};

  if (!config) return operation;

  const defaults = entry.defaults ?? fallbackDefaults;
  const annotations = config.openapi ?? {};

  const parameters = [];

  const pathParams = extractPathParams(path);
  const validateOpts = resolve(config.validate, defaults.validate);
  const paramsSchema = validateOpts && validateOpts !== false ? validateOpts.params : undefined;

  for (const name of pathParams) {
    const schema = paramsSchema?.properties?.[name];
    parameters.push(buildPathParam(name, schema));
  }

  if (validateOpts && validateOpts !== false && validateOpts.query) {
    parameters.push(...buildQueryParams(validateOpts.query));
  }

  if (parameters.length > 0) {
    operation.parameters = parameters;
  }

  if (validateOpts && validateOpts !== false && validateOpts.body && BODY_METHODS.has(method)) {
    const acceptsOpts = resolve(config.accepts, defaults.accepts);
    const types = acceptsOpts && acceptsOpts !== false ? acceptsOpts.types : undefined;
    operation.requestBody = buildRequestBody(validateOpts.body, types);
  }

  const authOpts = resolve(config.authorization, defaults.authorization);
  if (authOpts && authOpts !== false && authOpts.strategies) {
    const security = [];
    for (const strategy of authOpts.strategies) {
      const schemeName = strategy.type ?? 'default';
      if (!Object.hasOwn(securitySchemes, schemeName)) {
        securitySchemes[schemeName] = deriveSecurityScheme(schemeName);
      }
      security.push({[schemeName]: []});
    }
    if (security.length > 0) {
      operation.security = security;
    }
  }

  if (!operation.responses) {
    operation.responses = {200: {description: 'Successful response'}};
  }

  Object.assign(operation, annotations);

  return operation;
}

/**
 * Generate an OpenAPI 3.1 specification document from a router's registered routes.
 *
 * Iterates `router._routes` to extract validation schemas, authorization
 * strategies, content types, and manual `openapi` annotations. Resolves
 * each extractable key against per-entry defaults (from the registering router)
 * falling back to `router._options.defaults` for the top-level router.
 *
 * @param router - An ergo-router instance created by `createRouter()`
 * @param [options] - OpenAPI document options
 * @param {string} [options.title='API'] - API title for the `info` object
 * @param {string} [options.version='1.0.0'] - API version for the `info` object
 * @param {string} [options.description] - API description
 * @param {object[]} [options.servers] - Server objects for the `servers` array
 * @param {object} [options.info] - Additional `info` properties merged after title/version/description
 * @returns OpenAPI 3.1 specification document
 */
export default function generateOpenAPI(router, options = {}) {
  const {title = 'API', version = '1.0.0', description, servers, info: extraInfo} = options;

  const fallbackDefaults = router._options?.defaults ?? {};
  const securitySchemes = Object.create(null);
  const paths = Object.create(null);

  for (const entry of router._routes) {
    const oaPath = convertPath(entry.path);
    const methodKey = entry.method.toLowerCase();

    if (!Object.hasOwn(paths, oaPath)) {
      paths[oaPath] = Object.create(null);
    }

    paths[oaPath][methodKey] = buildOperation(entry, fallbackDefaults, securitySchemes);
  }

  const info = {title, version};
  if (description) info.description = description;
  if (extraInfo) Object.assign(info, extraInfo);

  const doc = {openapi: OPENAPI_VERSION, info, paths};

  if (servers) doc.servers = servers;

  if (Object.keys(securitySchemes).length > 0) {
    doc.components = {securitySchemes};
  }

  return doc;
}
