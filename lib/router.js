/**
 * @fileoverview Core router factory for ergo-router.
 *
 * Creates REST-compliant router instances backed by `find-my-way` (the Fastify router engine).
 * Enforces Fast Fail semantics and standard HTTP REST behavior:
 * - Automatic `405 Method Not Allowed` with `Allow` header for known paths
 * - Automatic `OPTIONS` responses listing allowed methods
 * - Automatic HEAD → GET fallback
 * - Strict `PATCH` Content-Type enforcement (configurable)
 * - Transport layer (request ID, security headers, rate limiting, CORS) runs before routing
 * - Pipeline auto-wrapping via `createAutoWrap` for seamless Ergo integration
 *
 * @module lib/router
 * @version 0.1.0
 * @since 0.1.0
 * @requires node:http
 * @requires find-my-way
 * @requires ./method-registry.js
 * @requires ./transport/index.js
 * @requires ./auto-wrap.js
 * @requires ./pipeline-builder.js
 * @requires ./error-response.js
 * @see {@link https://www.rfc-editor.org/rfc/rfc9110 RFC 9110 - HTTP Semantics}
 */
import http from 'node:http';
import FindMyWay from 'find-my-way';
import MethodRegistry from './method-registry.js';
import buildTransport from './transport/index.js';
import createAutoWrap from './auto-wrap.js';
import buildPipeline from './pipeline-builder.js';
import endWithProblem from './error-response.js';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

const DEFAULT_STATUS = {POST: 201, DELETE: 204};

const PATCH_CONTENT_TYPES = new Set([
  'application/json',
  'application/merge-patch+json',
  'application/json-patch+json'
]);

const BODY_METHODS_REQUIRE_CT = new Set(['POST', 'PUT']);

/**
 * Create a new Ergo router instance.
 *
 * @param {object} [options]
 * @param {object} [options.transport] - Transport-layer config (requestId, security, rateLimit, cors)
 * @param {boolean} [options.strictPatch=true] - Enforce Content-Type on PATCH requests
 * @param {boolean} [options.strictBody=true] - Enforce Content-Type on POST/PUT requests
 * @param {object} [options.send] - Default `send()` options applied to all routes
 * @param {function} [options.catchHandler] - Default catch handler for all route pipelines
 * @param {object} [options.defaults] - Default middleware config for declarative routes. Each key
 *   corresponds to a pipeline stage (e.g. `accepts`, `cookie`, `timeout`). Route-level config
 *   overrides these. Set a key to `false` to disable by default.
 * @returns {object} Router instance with route registration and server creation methods
 */
export default function createRouter(options = {}) {
  const dispatcher = FindMyWay({caseSensitive: true});
  const pathIndex = FindMyWay({caseSensitive: true});
  const registry = new MethodRegistry();
  const appMiddleware = [];
  const subRouters = [];
  const transport = options.transport ? buildTransport(options.transport) : undefined;
  const wrapPipeline = createAutoWrap(options, appMiddleware);

  const router = {
    _dispatcher: dispatcher,
    _pathIndex: pathIndex,
    _registry: registry,
    _middleware: appMiddleware,
    _subRouters: subRouters,
    _transport: transport,
    _wrap: wrapPipeline,
    _options: options,

    /**
     * Add application-level middleware that runs before every route pipeline.
     * @param {...function} fns - Middleware functions
     * @returns {object} router (chainable)
     */
    use(...fns) {
      appMiddleware.push(...fns);
      return router;
    },

    /**
     * Mount a sub-router at a prefix path.
     * @param {string} prefix - URL prefix (e.g. '/api/v1')
     * @param {object} subRouter - Another router instance
     * @returns {object} router (chainable)
     */
    mount(prefix, subRouter) {
      subRouters.push({prefix, router: subRouter});
      mountSubRouter(router, prefix, subRouter);
      return router;
    },

    /**
     * Create the Node.js HTTP request handler.
     * @returns {function} (req, res) => void
     */
    handle() {
      return (req, res) => dispatch(router, req, res);
    },

    /**
     * Convenience: create an HTTP server and start listening.
     * @param {number} port
     * @param {...*} args - Additional arguments passed to server.listen()
     * @returns {http.Server}
     */
    listen(port, ...args) {
      const server = http.createServer(router.handle());
      return server.listen(port, ...args);
    }
  };

  for (const method of HTTP_METHODS) {
    /**
     * Register a route for the given method.
     * @param {string} path - URL pattern (e.g. '/users/:id')
     * @param {function|function[]|object} pipeline - Handler function, pipeline array, or
     *   declarative config object with middleware options and an `execute` function
     * @param {object} [routeOpts] - Per-route options (only for function/array pipelines)
     * @returns {object} router (chainable)
     */
    router[method.toLowerCase()] = function routeMethod(path, pipeline, routeOpts) {
      addRoute(router, method, path, pipeline, routeOpts);
      return router;
    };
  }

  return router;
}

// find-my-way requires a function as the store handler argument; since we use
// find() for dispatch (not lookup()), this is stored but never invoked.
function noop() {}

/**
 * Register a single route. Detects declarative config objects (plain objects
 * that are not arrays) and builds the pipeline via the pipeline builder.
 */
function addRoute(router, method, path, pipeline, routeOpts = {}) {
  const {_dispatcher, _pathIndex, _registry, _wrap, _options} = router;

  let resolvedPipeline = pipeline;
  let effectiveOpts = routeOpts;

  if (isConfigObject(pipeline)) {
    resolvedPipeline = buildPipeline(method, pipeline, _options.defaults ?? {});
    effectiveOpts = {...routeOpts, ...extractRouteOpts(pipeline)};
    const preferValue =
      pipeline.prefer !== undefined ? pipeline.prefer : (_options.defaults ?? {}).prefer;
    if (preferValue !== false && preferValue !== undefined) {
      effectiveOpts.send = {...(effectiveOpts.send ?? {}), prefer: true};
    }
  }

  const wrapped = _wrap(resolvedPipeline, effectiveOpts);

  _dispatcher.on(method, path, noop, {pipeline: wrapped, options: effectiveOpts});
  _registry.add(method, path);

  if (_registry.getAllowed(path).size === 1) {
    _pathIndex.on('GET', path, noop, {pattern: path});
  }
}

/**
 * Detect whether a pipeline argument is a declarative config object.
 * @param {*} value
 * @returns {boolean}
 */
function isConfigObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Extract auto-wrap route options from a declarative config object.
 * @param {object} config - Declarative route config
 * @returns {object} - Route options for auto-wrap (send, noSend, catchHandler)
 */
function extractRouteOpts(config) {
  const opts = {};
  if (config.send !== undefined) {
    opts.send = config.send;
  }
  if (config.noSend !== undefined) {
    opts.noSend = config.noSend;
  }
  if (config.catchHandler !== undefined) {
    opts.catchHandler = config.catchHandler;
  }
  return opts;
}

/**
 * Mount a sub-router by copying its routes into the parent with a prefix.
 */
function mountSubRouter(parent, prefix, child) {
  const {_dispatcher, _pathIndex, _registry} = parent;

  for (const [pattern, methods] of child._registry._paths) {
    const fullPath = normalizePath(prefix + pattern);

    for (const method of methods) {
      const childMatch = child._dispatcher.find(method, pattern);
      if (childMatch) {
        _dispatcher.on(method, fullPath, noop, childMatch.store);
      }
      _registry.add(method, fullPath);
    }

    if (_registry.getAllowed(fullPath).size === methods.size) {
      _pathIndex.on('GET', fullPath, noop, {pattern: fullPath});
    }
  }
}

/**
 * Core dispatch logic. Matches the request to a route and executes
 * the pipeline. Transport layer and REST semantics are layered on
 * in separate modules.
 */
function dispatch(router, req, res) {
  const {_dispatcher, _pathIndex, _registry, _transport, _options} = router;
  const {method, url} = req;
  const strictPatch = _options.strictPatch !== false;
  const strictBody = _options.strictBody !== false;

  const qIdx = url.indexOf('?');
  const path = qIdx === -1 ? url : url.slice(0, qIdx);

  // Resolve path metadata (used by transport, REST, and dispatch)
  const pathMatch = _pathIndex.find('GET', path);
  const allowed = pathMatch ? _registry.getAllowed(pathMatch.store.pattern) : undefined;

  // --- Transport layer (runs on every request) ---
  if (_transport) {
    const {stop} = _transport.run(req, res, allowed);
    if (stop) {
      return;
    }
  }

  // --- REST: Automatic OPTIONS ---
  if (method === 'OPTIONS' && allowed) {
    const methods = [...allowed, 'HEAD', 'OPTIONS'];
    res.statusCode = 204;
    res.setHeader('Allow', methods.join(', '));
    res.end();
    return;
  }

  // --- REST: PATCH Content-Type enforcement ---
  if (method === 'PATCH' && strictPatch) {
    const ct = (req.headers['content-type'] ?? '').split(';')[0].trim();
    if (!PATCH_CONTENT_TYPES.has(ct)) {
      res.setHeader('Accept-Patch', [...PATCH_CONTENT_TYPES].join(', '));
      endWithProblem(res, 415);
      return;
    }
  }

  // --- Route matching ---
  let match = _dispatcher.find(method, path);

  // REST: Automatic HEAD -> GET fallback
  if (!match && method === 'HEAD') {
    match = _dispatcher.find('GET', path);
  }

  if (match) {
    // --- REST: POST/PUT Content-Type enforcement (only for matched routes) ---
    if (strictBody && BODY_METHODS_REQUIRE_CT.has(method) && !req.headers['content-type']) {
      endWithProblem(res, 415);
      return;
    }

    const {store, params} = match;

    // Method-aware default status code
    if (DEFAULT_STATUS[method]) {
      res.statusCode = DEFAULT_STATUS[method];
    }

    // RFC 7230 §3.3: HEAD responses must not include a message body.
    // Wrap res so the GET handler runs normally (setting headers, ETag, etc.)
    // but no body bytes are written to the socket.
    if (method === 'HEAD') {
      suppressBody(res);
    }

    return executeRoute(store, req, res, params ?? {});
  }

  // --- 405 vs 404 ---
  if (allowed) {
    const methods = [...allowed, 'HEAD', 'OPTIONS'];
    res.setHeader('Allow', methods.join(', '));
    endWithProblem(res, 405);
    return;
  }

  endWithProblem(res, 404);
}

/**
 * Execute a matched route's pipeline (pre-wrapped by auto-wrap).
 * @param {object} store - Route store from find-my-way
 * @param {object} req
 * @param {object} res
 * @param {object} params - Route params from find-my-way match
 */
function executeRoute(store, req, res, params) {
  const {pipeline} = store;

  if (typeof pipeline === 'function') {
    return pipeline(req, res, params);
  }

  endWithProblem(res, 500);
}

/**
 * Normalize a path: collapse duplicate slashes, ensure leading slash.
 * @param {string} p
 * @returns {string}
 */
function normalizePath(p) {
  return '/' + p.replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
}

/**
 * Wrap a response object so that no body bytes are written to the socket.
 * Headers (including Content-Length set before end()) are preserved.
 * Required for RFC 7230 §3.3 HEAD semantics.
 *
 * @param {object} res - Node.js ServerResponse
 */
function suppressBody(res) {
  const origEnd = res.end.bind(res);
  res.write = () => true;
  res.end = function headEnd(chunk, encoding, callback) {
    return origEnd(null, null, callback);
  };
}
