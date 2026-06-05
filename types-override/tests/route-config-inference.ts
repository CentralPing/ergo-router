/**
 * Type-only validation for RouteConfig generic accumulator and middleware
 * option typing.
 *
 * Compiled by tsconfig.check-types.json (noEmit: true) and never executed
 * at runtime. Validates that the hand-written declarations provide correct
 * type information for declarative route configuration.
 */

import type {
  AcceptsOptions,
  BodyOptions,
  CookieOptions,
  CsrfOptions,
  AuthorizationOptions,
  TimeoutOptions,
  CompressOptions,
  TracingOptions,
  RateLimitOptions,
  SecurityHeadersOptions,
  CacheControlOptions,
  LoggerOptions,
  IdempotencyOptions,
  ValidateOptions,
  PreconditionOptions,
  SendOptions,
} from '@centralping/ergo/types';

import type {
  RouteConfig,
  RouterOptions,
  Router,
  Presets,
  GracefulOptions,
  GracefulResult,
  TransportOptions,
} from '../ergo-router.js';

import type createRouter from '../lib/router.js';
import type buildPipeline from '../lib/pipeline-builder.js';

// ---------------------------------------------------------------------------
// Positive: RouteConfig accepts typed middleware options
// ---------------------------------------------------------------------------

function testTypedMiddlewareOptions() {
  const config: RouteConfig = {
    accepts: {types: ['application/json'], throwIfFail: true},
    body: {limit: 1024, charset: 'utf-8'},
    cookie: {max: 100, loose: false},
    csrf: {secret: 'my-secret', encoding: 'hex'},
    authorization: {strategies: [{type: 'Bearer', authorizer: () => ({userId: '1'})}]},
    timeout: {ms: 30000, statusCode: 408},
    compress: {threshold: 1024, encodings: ['gzip', 'br']},
    tracing: {serviceName: 'my-app', perStage: true},
    rateLimit: {max: 100, windowMs: 60000},
    securityHeaders: {xFrameOptions: 'DENY'},
    cacheControl: {maxAge: 3600, public: true},
    logger: {headerRequestIdName: 'x-request-id'},
    idempotency: {required: true, ttlMs: 86400000},
    validate: {formats: true},
    preconditionRequired: {methods: ['PUT', 'PATCH']},
    execute: (_req, _res, acc) => ({response: {body: acc}}),
  };
  void config;
}

// ---------------------------------------------------------------------------
// Positive: RouteConfig accepts boolean values for middleware keys
// ---------------------------------------------------------------------------

function testBooleanMiddlewareKeys() {
  const config: RouteConfig = {
    accepts: true,
    body: false,
    cookie: true,
    timeout: false,
    execute: () => ({response: {body: 'ok'}}),
  };
  void config;
}

// ---------------------------------------------------------------------------
// Positive: Generic accumulator type parameter
// ---------------------------------------------------------------------------

interface MyAccumulator {
  userId: string;
  role: 'admin' | 'user';
}

function testGenericAccumulator() {
  const config: RouteConfig<MyAccumulator> = {
    authorization: {strategies: [{type: 'Bearer', authorizer: () => ({userId: '1'})}]},
    execute: (_req, _res, acc) => {
      const userId: string = acc.userId;
      const role: 'admin' | 'user' = acc.role;
      return {response: {body: {userId, role}}};
    },
  };
  void config;
}

// ---------------------------------------------------------------------------
// Positive: Default accumulator is Record<string, unknown>
// ---------------------------------------------------------------------------

function testDefaultAccumulator() {
  const config: RouteConfig = {
    execute: (_req, _res, acc) => {
      const value: unknown = acc.anything;
      return {response: {body: value}};
    },
  };
  void config;
}

// ---------------------------------------------------------------------------
// Positive: RouterOptions accepts typed transport config
// ---------------------------------------------------------------------------

function testRouterOptions() {
  const options: RouterOptions = {
    transport: {
      requestId: {trustProxy: true, header: 'x-trace-id'},
      security: {frameOptions: 'SAMEORIGIN', trustProxy: true},
      rateLimit: {max: 1000, windowMs: 60000},
      cors: {origin: '*', credentials: false, maxAge: 86400},
    },
    strictPatch: true,
    strictBody: true,
    strict: true,
    debug: false,
    send: {prettify: false, etag: true},
    defaults: {
      accepts: {types: ['application/json']},
      timeout: {ms: 30000},
    },
  };
  void options;
}

// ---------------------------------------------------------------------------
// Positive: Router instance has typed route methods
// ---------------------------------------------------------------------------

function testRouterInstance(router: Router) {
  router
    .get('/users', {execute: () => ({response: {body: []}})})
    .post('/users', {execute: () => ({response: {body: {id: '1'}}})})
    .put('/users/:id', {execute: () => ({response: {body: {updated: true}}})})
    .patch('/users/:id', {execute: () => ({response: {body: {patched: true}}})})
    .delete('/users/:id', {execute: () => ({response: {body: null}})});

  const handler = router.handle();
  void handler;
}

// ---------------------------------------------------------------------------
// Positive: GracefulOptions and GracefulResult
// ---------------------------------------------------------------------------

function testGracefulTypes() {
  const opts: GracefulOptions = {
    port: 3000,
    hostname: '0.0.0.0',
    timeout: 5000,
    signals: ['SIGINT', 'SIGTERM'],
    onStartup: async ({log}) => { log?.info('starting'); },
    onShutdown: async ({log, signal}) => { log?.info(`shutdown: ${signal}`); },
  };
  void opts;
}

// ---------------------------------------------------------------------------
// Positive: TransportOptions accepts boolean shorthand
// ---------------------------------------------------------------------------

function testTransportBooleans() {
  const transport: TransportOptions = {
    requestId: true,
    security: true,
    rateLimit: false,
    cors: false,
  };
  void transport;
}

// ---------------------------------------------------------------------------
// Positive: buildPipeline accepts typed args
// ---------------------------------------------------------------------------

function testBuildPipeline(fn: typeof buildPipeline) {
  const pipeline: any[] = fn('GET', {
    accepts: {types: ['application/json']},
    execute: () => ({response: {body: 'ok'}}),
  });
  void pipeline;
}

// ---------------------------------------------------------------------------
// Positive: createRouter returns Router
// ---------------------------------------------------------------------------

function testCreateRouter(fn: typeof createRouter) {
  const router: Router = fn({strict: true});
  void router;
}

// ---------------------------------------------------------------------------
// Positive: Route methods accept function handlers and arrays
// ---------------------------------------------------------------------------

function testRouteHandlerTypes(router: Router) {
  router.get('/health', () => undefined);
  router.get('/pipeline', [() => ({value: 'ok'}), () => ({response: {body: 'done'}})]);
}

// ---------------------------------------------------------------------------
// Positive: RouteConfig send options are typed
// ---------------------------------------------------------------------------

function testSendOptions() {
  const config: RouteConfig = {
    send: {prettify: true, etag: true, vary: ['Accept'], prefer: true},
    noSend: false,
    execute: () => ({response: {body: 'ok'}}),
  };
  void config;
}

// ---------------------------------------------------------------------------
// Positive: Presets interface and const export
// ---------------------------------------------------------------------------

function testPresetsType() {
  const p: Presets = {
    jsonApi: {
      transport: {requestId: {}, security: {}},
      defaults: {accepts: {types: ['application/json']}},
    },
  };
  const opts: Readonly<RouterOptions> = p.jsonApi;
  void opts;
}

// ---------------------------------------------------------------------------
// Negative: execute is required in RouteConfig
// ---------------------------------------------------------------------------

function testMissingExecute() {
  // @ts-expect-error — RouteConfig requires execute
  const config: RouteConfig = {
    accepts: true,
  };
  void config;
}

// ---------------------------------------------------------------------------
// Negative: wrong option type is rejected
// ---------------------------------------------------------------------------

function testWrongOptionType() {
  const config: RouteConfig = {
    // @ts-expect-error — AcceptsOptions.types must be string[], not number
    accepts: {types: [123]},
    execute: () => ({}),
  };
  void config;
}

// ---------------------------------------------------------------------------
// Suppress unused-variable warnings
// ---------------------------------------------------------------------------

void testTypedMiddlewareOptions;
void testBooleanMiddlewareKeys;
void testGenericAccumulator;
void testDefaultAccumulator;
void testRouterOptions;
void testRouterInstance;
void testGracefulTypes;
void testTransportBooleans;
void testBuildPipeline;
void testCreateRouter;
void testRouteHandlerTypes;
void testSendOptions;
void testPresetsType;
void testMissingExecute;
void testWrongOptionType;
