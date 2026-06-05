/**
 * @fileoverview Config validation for ergo-router declarative route objects.
 *
 * Validates config keys at registration time — before `buildPipeline()` consumes them —
 * so typos and missing `execute` functions surface immediately instead of silently
 * disabling middleware or producing 500 errors on first request.
 *
 * Key sets are exported for synchronization testing: when a new middleware key is added
 * to `pipeline-builder.js`, the corresponding set here must be updated simultaneously.
 *
 * @module lib/validate-config
 * @since 0.2.0
 */

/**
 * Maximum Levenshtein distance for "did you mean?" suggestions.
 * @type {number}
 */
const MAX_SUGGESTION_DISTANCE = 3;

/**
 * Check whether a value is a plain object (literal `{}` or `Object.create(null)`).
 * Rejects class instances, Map, Date, etc.
 *
 * @param {*} value - Value to check
 * @returns {boolean} - True if the value is a plain object
 */
function isPlainObject(value) {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Return a human-readable type label for error messages.
 *
 * Distinguishes `null` and arrays from generic `'object'` since `typeof` conflates them.
 *
 * @param {*} value - Value to describe
 * @returns {string} - Type label: `'null'`, `'array'`, or the `typeof` result
 */
function displayType(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

/**
 * Check whether a value is a valid middleware option in a declarative route config.
 *
 * Valid middleware values follow the `resolve()` contract in `pipeline-builder.js`:
 * - `boolean` — `true` enables with defaults, `false` explicitly disables
 * - non-null, non-array `object` — custom options forwarded to the middleware factory
 *
 * `undefined` is intentionally excluded: it means "not configured at this level" and
 * is handled by the caller (skip validation when the value is `undefined`).
 *
 * @param {*} value - Value to check
 * @returns {boolean} - True if the value is a valid middleware option
 */
function isValidMiddlewareOption(value) {
  if (typeof value === 'boolean') return true;
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Pipeline keys that have bespoke type checks and are skipped by the generic
 * middleware value validation loop. `openapi` is included for documentation
 * clarity even though it is in `ANNOTATION_KEYS`, not `PIPELINE_KEYS`.
 * @type {Set<string>}
 */
const CUSTOM_VALIDATED_KEYS = new Set(['execute', 'use', 'openapi']);

/**
 * Pipeline middleware keys consumed by `buildPipeline()`.
 * @type {Set<string>}
 */
export const PIPELINE_KEYS = new Set([
  'logger',
  'accepts',
  'authorization',
  'body',
  'cacheControl',
  'compress',
  'cookie',
  'csrf',
  'execute',
  'idempotency',
  'jsonApiQuery',
  'paginate',
  'preconditionRequired',
  'prefer',
  'rateLimit',
  'securityHeaders',
  'timeout',
  'tracing',
  'url',
  'use',
  'validate'
]);

/**
 * Route option keys consumed by `extractRouteOpts()` in `router.js`.
 * @type {Set<string>}
 */
export const ROUTE_OPTION_KEYS = new Set(['send', 'noSend', 'catchHandler']);

/**
 * Annotation keys that pass through to route metadata without being consumed
 * by the pipeline builder. Used for documentation generation (e.g. OpenAPI).
 * @type {Set<string>}
 */
export const ANNOTATION_KEYS = new Set(['openapi']);

/**
 * All valid keys for a declarative route config object (pipeline + route options + annotations).
 * @type {Set<string>}
 */
export const VALID_ROUTE_CONFIG_KEYS = new Set([
  ...PIPELINE_KEYS,
  ...ROUTE_OPTION_KEYS,
  ...ANNOTATION_KEYS
]);

/**
 * Valid keys for `createRouter()` `options.defaults`. Same as pipeline keys minus `execute`
 * (execute only makes sense per-route, not as a default).
 * @type {Set<string>}
 */
export const VALID_DEFAULTS_KEYS = new Set([...PIPELINE_KEYS].filter(k => k !== 'execute'));

/**
 * Valid top-level keys for `createRouter()` options.
 * @type {Set<string>}
 */
export const VALID_ROUTER_OPTIONS_KEYS = new Set([
  'transport',
  'strictPatch',
  'strictBody',
  'strict',
  'send',
  'catchHandler',
  'defaults',
  'debug'
]);

/**
 * Compute the Levenshtein distance between two strings.
 *
 * Uses the Wagner-Fischer dynamic programming algorithm with a single-row
 * optimization (O(min(a,b)) space).
 *
 * @param {string} a - First string
 * @param {string} b - Second string
 * @returns {number} - Edit distance
 */
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const short = a.length <= b.length ? a : b;
  const long = a.length <= b.length ? b : a;
  const shortLen = short.length;
  const longLen = long.length;
  const row = new Array(shortLen + 1);

  for (let i = 0; i <= shortLen; i++) {
    row[i] = i;
  }

  for (let j = 1; j <= longLen; j++) {
    let prev = row[0];
    row[0] = j;

    for (let i = 1; i <= shortLen; i++) {
      const cost = short[i - 1] === long[j - 1] ? 0 : 1;
      const temp = row[i];
      row[i] = Math.min(row[i] + 1, row[i - 1] + 1, prev + cost);
      prev = temp;
    }
  }

  return row[shortLen];
}

/**
 * Find the closest matching key from a set of valid keys.
 *
 * @param {string} unknown - The unknown key to find suggestions for
 * @param {Set<string>} validKeys - Set of valid key names
 * @returns {string|undefined} - The closest match within threshold, or undefined
 */
export function findSuggestion(unknown, validKeys) {
  let best;
  let bestDist = MAX_SUGGESTION_DISTANCE + 1;

  for (const valid of validKeys) {
    const dist = levenshtein(unknown, valid);
    if (dist < bestDist) {
      bestDist = dist;
      best = valid;
    }
  }

  return best;
}

/**
 * Validate an object's keys against a set of valid keys.
 *
 * @param {object} obj - Object whose keys to validate
 * @param {Set<string>} validKeys - Set of valid key names
 * @param {string} context - Description for error messages (e.g., "route config for GET /users")
 * @param {boolean} strict - If true, throw on unknown keys; if false, warn via console.warn
 * @returns {void}
 * @throws {Error} When strict=true and unknown keys are found
 */
export function validateKeys(obj, validKeys, context, strict) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) {
    throw new TypeError(`Expected ${context} to be a plain object.`);
  }

  const keys = Object.keys(obj);
  const unknownKeys = keys.filter(k => !validKeys.has(k));

  if (unknownKeys.length === 0) return;

  for (const key of unknownKeys) {
    const suggestion = findSuggestion(key, validKeys);
    const hint = suggestion ? ` (did you mean "${suggestion}"?)` : '';
    const message = `Unknown config key "${key}" in ${context}${hint}`;

    if (strict) {
      throw new Error(message);
    }

    // eslint-disable-next-line no-console
    console.warn(`[ergo-router] ${message}`);
  }
}

/**
 * Validate a declarative route config object.
 *
 * Checks for unknown keys (with "did you mean?" suggestions), validates value types
 * for all pipeline keys, route option keys, and annotation keys, and verifies that
 * `execute` is present and is a function.
 *
 * @param {object} config - The route config object
 * @param {string} method - HTTP method (e.g., "GET")
 * @param {string} path - Route path (e.g., "/users/:id")
 * @param {boolean} strict - Whether to throw or warn on unknown keys
 * @returns {void}
 * @throws {Error} When unknown keys are found (strict mode), value types are invalid, or execute is missing/invalid
 */
export function validateRouteConfig(config, method, path, strict) {
  const context = `route config for ${method} ${path}`;

  validateKeys(config, VALID_ROUTE_CONFIG_KEYS, context, strict);

  for (const key of Object.keys(config)) {
    if (!PIPELINE_KEYS.has(key) || CUSTOM_VALIDATED_KEYS.has(key)) continue;
    const value = config[key];
    if (value === undefined) continue;
    if (!isValidMiddlewareOption(value)) {
      throw new Error(
        `Invalid "${key}" in ${context}: expected object or boolean, got ${displayType(value)}.`
      );
    }
  }

  if (!Object.hasOwn(config, 'execute')) {
    throw new Error(
      `Missing "execute" function in ${context}. ` +
        'Declarative route configs must include an execute function.'
    );
  }

  if (typeof config.execute !== 'function') {
    throw new Error(
      `Invalid "execute" in ${context}: expected a function, got ${typeof config.execute}.`
    );
  }

  if (Object.hasOwn(config, 'use') && config.use !== false && !Array.isArray(config.use)) {
    throw new Error(
      `Invalid "use" in ${context}: expected an array or false, got ${displayType(config.use)}.`
    );
  }

  if (Object.hasOwn(config, 'openapi') && !isPlainObject(config.openapi)) {
    throw new Error(
      `Invalid "openapi" in ${context}: expected a plain object, got ${displayType(config.openapi)}.`
    );
  }

  if (
    Object.hasOwn(config, 'send') &&
    (typeof config.send !== 'object' || config.send === null || Array.isArray(config.send))
  ) {
    throw new Error(
      `Invalid "send" in ${context}: expected object, got ${displayType(config.send)}.`
    );
  }

  if (Object.hasOwn(config, 'noSend') && typeof config.noSend !== 'boolean') {
    throw new Error(
      `Invalid "noSend" in ${context}: expected boolean, got ${displayType(config.noSend)}.`
    );
  }

  if (Object.hasOwn(config, 'catchHandler') && typeof config.catchHandler !== 'function') {
    throw new Error(
      `Invalid "catchHandler" in ${context}: expected a function, got ${displayType(config.catchHandler)}.`
    );
  }
}

/**
 * Validate `createRouter()` `options.defaults` keys and value types.
 *
 * @param {object} defaults - The defaults object from router options
 * @param {boolean} strict - Whether to throw or warn on unknown keys
 * @returns {void}
 * @throws {Error} When strict=true and unknown keys are found, or value types are invalid
 */
export function validateDefaults(defaults, strict) {
  validateKeys(defaults, VALID_DEFAULTS_KEYS, 'router defaults', strict);

  for (const key of Object.keys(defaults)) {
    if (!VALID_DEFAULTS_KEYS.has(key) || CUSTOM_VALIDATED_KEYS.has(key)) continue;
    const value = defaults[key];
    if (value === undefined) continue;
    if (!isValidMiddlewareOption(value)) {
      throw new Error(
        `Invalid "${key}" in router defaults: expected object or boolean, got ${displayType(value)}.`
      );
    }
  }

  if (Object.hasOwn(defaults, 'use') && defaults.use !== false && !Array.isArray(defaults.use)) {
    throw new Error(
      `Invalid "use" in router defaults: expected an array or false, got ${displayType(defaults.use)}.`
    );
  }
}

/**
 * Validate top-level `createRouter()` options keys and value types.
 *
 * @param {object} options - The router options object
 * @param {boolean} strict - Whether to throw or warn on unknown keys
 * @returns {void}
 * @throws {Error} When strict=true and unknown keys are found, or value types are invalid
 */
export function validateRouterOptions(options, strict) {
  validateKeys(options, VALID_ROUTER_OPTIONS_KEYS, 'router options', strict);

  if (
    Object.hasOwn(options, 'transport') &&
    (typeof options.transport !== 'object' ||
      options.transport === null ||
      Array.isArray(options.transport))
  ) {
    throw new Error(
      `Invalid "transport" in router options: expected object, got ${displayType(options.transport)}.`
    );
  }

  for (const key of ['strictPatch', 'strictBody', 'strict', 'debug']) {
    if (Object.hasOwn(options, key) && typeof options[key] !== 'boolean') {
      throw new Error(
        `Invalid "${key}" in router options: expected boolean, got ${displayType(options[key])}.`
      );
    }
  }

  if (
    Object.hasOwn(options, 'send') &&
    (typeof options.send !== 'object' || options.send === null || Array.isArray(options.send))
  ) {
    throw new Error(
      `Invalid "send" in router options: expected object, got ${displayType(options.send)}.`
    );
  }

  if (Object.hasOwn(options, 'catchHandler') && typeof options.catchHandler !== 'function') {
    throw new Error(
      `Invalid "catchHandler" in router options: expected a function, got ${displayType(options.catchHandler)}.`
    );
  }

  if (
    Object.hasOwn(options, 'defaults') &&
    (typeof options.defaults !== 'object' ||
      options.defaults === null ||
      Array.isArray(options.defaults))
  ) {
    throw new Error(
      `Invalid "defaults" in router options: expected object, got ${displayType(options.defaults)}.`
    );
  }
}
