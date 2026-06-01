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
  'preconditionRequired',
  'prefer',
  'rateLimit',
  'securityHeaders',
  'timeout',
  'url',
  'validate'
]);

/**
 * Route option keys consumed by `extractRouteOpts()` in `router.js`.
 * @type {Set<string>}
 */
export const ROUTE_OPTION_KEYS = new Set(['send', 'noSend', 'catchHandler']);

/**
 * All valid keys for a declarative route config object (pipeline + route options).
 * @type {Set<string>}
 */
export const VALID_ROUTE_CONFIG_KEYS = new Set([...PIPELINE_KEYS, ...ROUTE_OPTION_KEYS]);

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
  'defaults'
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
 * Checks for unknown keys (with "did you mean?" suggestions) and verifies that
 * `execute` is present and is a function.
 *
 * @param {object} config - The route config object
 * @param {string} method - HTTP method (e.g., "GET")
 * @param {string} path - Route path (e.g., "/users/:id")
 * @param {boolean} strict - Whether to throw or warn on unknown keys
 * @returns {void}
 * @throws {Error} When unknown keys are found (strict mode) or execute is missing/invalid
 */
export function validateRouteConfig(config, method, path, strict) {
  const context = `route config for ${method} ${path}`;

  validateKeys(config, VALID_ROUTE_CONFIG_KEYS, context, strict);

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
}

/**
 * Validate `createRouter()` `options.defaults` keys.
 *
 * @param {object} defaults - The defaults object from router options
 * @param {boolean} strict - Whether to throw or warn on unknown keys
 * @returns {void}
 * @throws {Error} When strict=true and unknown keys are found
 */
export function validateDefaults(defaults, strict) {
  validateKeys(defaults, VALID_DEFAULTS_KEYS, 'router defaults', strict);
}

/**
 * Validate top-level `createRouter()` options.
 *
 * @param {object} options - The router options object
 * @param {boolean} strict - Whether to throw or warn on unknown keys
 * @returns {void}
 * @throws {Error} When strict=true and unknown keys are found
 */
export function validateRouterOptions(options, strict) {
  validateKeys(options, VALID_ROUTER_OPTIONS_KEYS, 'router options', strict);
}
