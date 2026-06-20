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
  AcceptsResult,
  AuthorizationResult,
  BodyOptions,
  BodyResult,
  CookieJar,
  CookieOptions,
  CsrfOptions,
  AuthorizationOptions,
  IdempotencyResult,
  LogEntry,
  PaginateResult,
  PreferResult,
  TimeoutOptions,
  CompressOptions,
  TracingOptions,
  TracingResult,
  RateLimitOptions,
  SecurityHeadersOptions,
  CacheControlOptions,
  LoggerOptions,
  IdempotencyOptions,
  UrlResult,
  ValidateOptions,
  PreconditionOptions,
  SendOptions,
} from '@centralping/ergo/types';

import type {
  RouteConfig,
  RouterOptions,
  Router,
  Presets,
  GracefulLog,
  GracefulOptions,
  GracefulResult,
  TransportOptions,
  OpenAPIDocument,
  OpenAPIInfo,
  OpenAPIPathItem,
  OpenAPIOperation,
  OpenAPIComponents,
  OpenAPISecurityScheme,
  GenerateOpenAPIOptions,
} from '../ergo-router.js';

import {defineGet, definePost, defineRoute, definePut, definePatch, defineDelete} from '../ergo-router.js';

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
    onStartup: async ({log}) => { log.info('starting'); },
    onShutdown: async ({log, signal}) => { log.info(`shutdown: ${signal}`); },
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
    sse: {
      transport: {requestId: {}, security: {}},
      defaults: {compress: false, timeout: false, accepts: {types: ['text/event-stream']}},
    },
    webhooks: {
      transport: {requestId: {}, security: {}},
      defaults: {accepts: {types: ['application/json']}, idempotency: {required: true}},
    },
    public: {
      transport: {requestId: {}, security: {}, rateLimit: {}},
      defaults: {accepts: {types: ['application/json']}, cacheControl: {public: true, maxAge: 300}},
    },
  };
  const jsonApiOpts: Readonly<RouterOptions> = p.jsonApi;
  const sseOpts: Readonly<RouterOptions> = p.sse;
  const webhooksOpts: Readonly<RouterOptions> = p.webhooks;
  const publicOpts: Readonly<RouterOptions> = p.public;
  void jsonApiOpts;
  void sseOpts;
  void webhooksOpts;
  void publicOpts;
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
// Positive: Route methods accept RouteConfig with explicit generic
// ---------------------------------------------------------------------------

interface RouteAccumulator {
  route: {params: {id: string}};
  auth: {userId: string};
}

function testRouteMethodExplicitGeneric(router: Router) {
  router.get<RouteAccumulator>('/users/:id', {
    authorization: {strategies: [{type: 'Bearer', authorizer: () => ({userId: '1'})}]},
    execute: (_req, _res, acc) => {
      const id: string = acc.route.params.id;
      const userId: string = acc.auth.userId;
      return {response: {body: {id, userId}}};
    },
  });

  router.post<RouteAccumulator>('/users/:id', {
    execute: (_req, _res, acc) => {
      const id: string = acc.route.params.id;
      return {response: {body: {id}}};
    },
  });
}

// ---------------------------------------------------------------------------
// Positive: Route methods infer generic from typed RouteConfig variable
// ---------------------------------------------------------------------------

function testRouteMethodInferredGeneric(router: Router) {
  const config: RouteConfig<RouteAccumulator> = {
    execute: (_req, _res, acc) => {
      const id: string = acc.route.params.id;
      return {response: {body: {id}}};
    },
  };

  router.get('/users/:id', config);
  router.put('/users/:id', config);
  router.patch('/users/:id', config);
  router.delete('/users/:id', config);
}

// ---------------------------------------------------------------------------
// Positive: Route methods still accept bare RouteConfig (backward compat)
// ---------------------------------------------------------------------------

function testRouteMethodDefaultGeneric(router: Router) {
  const config: RouteConfig = {
    execute: (_req, _res, acc) => {
      const value: unknown = acc.anything;
      return {response: {body: value}};
    },
  };
  router.get('/health', config);
}

// ---------------------------------------------------------------------------
// Negative: Typed route config rejects access to non-existent properties
// ---------------------------------------------------------------------------

function testRouteMethodGenericRejectsInvalid(router: Router) {
  router.get<RouteAccumulator>('/users/:id', {
    execute: (_req, _res, acc) => {
      // @ts-expect-error — RouteAccumulator has no 'nonExistent' property
      const bad: string = acc.nonExistent;
      return {response: {body: bad}};
    },
  });
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
void testRouteMethodExplicitGeneric;
void testRouteMethodInferredGeneric;
void testRouteMethodDefaultGeneric;
void testRouteMethodGenericRejectsInvalid;

// ---------------------------------------------------------------------------
// Positive: Inferred route params are always present (via defineGet)
// ---------------------------------------------------------------------------

function testInferredRouteParams(router: Router) {
  router.get('/users/:id', defineGet(
    {},
    (_req, _res, acc) => {
      const params: Record<string, string> = acc.route.params;
      return {response: {body: params}};
    }
  ));
}

// ---------------------------------------------------------------------------
// Positive: Inferred body type when body middleware is enabled
// ---------------------------------------------------------------------------

function testInferredBody(router: Router) {
  router.post('/users', definePost(
    {body: {limit: 1024}},
    (_req, _res, acc) => {
      const body: BodyResult = acc.body;
      return {response: {body: body.parsed}};
    }
  ));
}

// ---------------------------------------------------------------------------
// Positive: Inferred authorization type
// ---------------------------------------------------------------------------

function testInferredAuth(router: Router) {
  router.get('/protected', defineGet(
    {authorization: {strategies: [{type: 'Bearer', authorizer: () => ({userId: '1'})}]}},
    (_req, _res, acc) => {
      const auth: AuthorizationResult = acc.auth;
      return {response: {body: auth}};
    }
  ));
}

// ---------------------------------------------------------------------------
// Positive: Inferred URL type when url middleware is enabled
// ---------------------------------------------------------------------------

function testInferredUrl(router: Router) {
  router.get('/search', defineGet(
    {url: true},
    (_req, _res, acc) => {
      const url: UrlResult = acc.url;
      return {response: {body: url.query}};
    }
  ));
}

// ---------------------------------------------------------------------------
// Positive: Inferred accepts type
// ---------------------------------------------------------------------------

function testInferredAccepts(router: Router) {
  router.get('/items', defineGet(
    {accepts: {types: ['application/json']}},
    (_req, _res, acc) => {
      const accepts: AcceptsResult = acc.accepts;
      return {response: {body: accepts.type}};
    }
  ));
}

// ---------------------------------------------------------------------------
// Positive: Inferred cookies type
// ---------------------------------------------------------------------------

function testInferredCookies(router: Router) {
  router.get('/session', defineGet(
    {cookie: true},
    (_req, _res, acc) => {
      const cookies: CookieJar = acc.cookies;
      return {response: {body: cookies.size}};
    }
  ));
}

// ---------------------------------------------------------------------------
// Positive: Inferred paginate type (includes transitive url)
// ---------------------------------------------------------------------------

function testInferredPaginate(router: Router) {
  router.get('/items', defineRoute(
    {paginate: true},
    (_req, _res, acc) => {
      const paginate: PaginateResult = acc.paginate;
      const url: UrlResult = acc.url;
      return {response: {body: {paginate, query: url.query}}};
    }
  ));
}

// ---------------------------------------------------------------------------
// Positive: Inferred logger type
// ---------------------------------------------------------------------------

function testInferredLogger(router: Router) {
  router.get('/log', defineGet(
    {logger: true},
    (_req, _res, acc) => {
      const log: LogEntry = acc.log;
      return {response: {body: log.requestId}};
    }
  ));
}

// ---------------------------------------------------------------------------
// Positive: Inferred tracing type
// ---------------------------------------------------------------------------

function testInferredTracing(router: Router) {
  router.get('/traced', defineGet(
    {tracing: {serviceName: 'my-app'}},
    (_req, _res, acc) => {
      const trace: TracingResult = acc.trace;
      return {response: {body: trace.traceId}};
    }
  ));
}

// ---------------------------------------------------------------------------
// Positive: Inferred idempotency type
// ---------------------------------------------------------------------------

function testInferredIdempotency(router: Router) {
  router.post('/actions', definePost(
    {idempotency: {required: true}},
    (_req, _res, acc) => {
      const idempotency: IdempotencyResult = acc.idempotency;
      return {response: {body: idempotency}};
    }
  ));
}

// ---------------------------------------------------------------------------
// Positive: Inferred prefer type
// ---------------------------------------------------------------------------

function testInferredPrefer(router: Router) {
  router.get('/items', defineGet(
    {prefer: true},
    (_req, _res, acc) => {
      const prefer: PreferResult = acc.prefer;
      return {response: {body: prefer}};
    }
  ));
}

// ---------------------------------------------------------------------------
// Positive: Multiple middleware keys produce intersection
// ---------------------------------------------------------------------------

function testInferredMultipleMiddleware(router: Router) {
  router.post('/users', definePost(
    {authorization: {strategies: [{type: 'Bearer', authorizer: () => ({userId: '1'})}]}, body: {limit: 2048}, logger: true},
    (_req, _res, acc) => {
      const auth: AuthorizationResult = acc.auth;
      const body: BodyResult = acc.body;
      const log: LogEntry = acc.log;
      const params: Record<string, string> = acc.route.params;
      return {response: {body: {auth, parsed: body.parsed, requestId: log.requestId, params}}};
    }
  ));
}

// ---------------------------------------------------------------------------
// Positive: Auto-included body on POST via definePost
// ---------------------------------------------------------------------------

function testAutoIncludedBodyPost(router: Router) {
  router.post('/data', definePost(
    {},
    (_req, _res, acc) => {
      const body: BodyResult = acc.body;
      return {response: {body: body.parsed}};
    }
  ));
}

// ---------------------------------------------------------------------------
// Positive: Auto-included url on GET via defineGet
// ---------------------------------------------------------------------------

function testAutoIncludedUrlGet(router: Router) {
  router.get('/search', defineGet(
    {},
    (_req, _res, acc) => {
      const url: UrlResult = acc.url;
      return {response: {body: url.query}};
    }
  ));
}

// ---------------------------------------------------------------------------
// Positive: Auto-included url on DELETE via defineGet
// ---------------------------------------------------------------------------

function testAutoIncludedUrlDelete(router: Router) {
  router.delete('/items/:id', defineGet(
    {},
    (_req, _res, acc) => {
      const url: UrlResult = acc.url;
      return {response: {body: url.pathname}};
    }
  ));
}

// ---------------------------------------------------------------------------
// Positive: Auto-included body on PUT via definePost
// ---------------------------------------------------------------------------

function testAutoIncludedBodyPut(router: Router) {
  router.put('/items/:id', definePost(
    {},
    (_req, _res, acc) => {
      const body: BodyResult = acc.body;
      return {response: {body: body.parsed}};
    }
  ));
}

// ---------------------------------------------------------------------------
// Positive: Auto-included body on PATCH via definePost
// ---------------------------------------------------------------------------

function testAutoIncludedBodyPatch(router: Router) {
  router.patch('/items/:id', definePost(
    {},
    (_req, _res, acc) => {
      const body: BodyResult = acc.body;
      return {response: {body: body.parsed}};
    }
  ));
}

// ---------------------------------------------------------------------------
// Negative: Accessing absent key via defineGet
// ---------------------------------------------------------------------------

function testInferredRejectsAbsentKey(router: Router) {
  router.get('/simple', defineGet(
    {},
    (_req, _res, acc) => {
      // @ts-expect-error — auth not in accumulator without authorization config
      const bad: unknown = acc.auth;
      return {response: {body: bad}};
    }
  ));
}

// ---------------------------------------------------------------------------
// Negative: body not available via defineGet without explicit config
// ---------------------------------------------------------------------------

function testInferredRejectsBodyOnGet(router: Router) {
  router.get('/read-only', defineGet(
    {},
    (_req, _res, acc) => {
      // @ts-expect-error — body not in accumulator for GET routes (defineGet provides url, not body)
      const bad: unknown = acc.body;
      return {response: {body: bad}};
    }
  ));
}

// ---------------------------------------------------------------------------
// Negative: url not available via definePost without explicit config
// ---------------------------------------------------------------------------

function testInferredRejectsUrlOnPost(router: Router) {
  router.post('/create', definePost(
    {},
    (_req, _res, acc) => {
      // @ts-expect-error — url not in accumulator for POST routes (definePost provides body, not url)
      const bad: unknown = acc.url;
      return {response: {body: bad}};
    }
  ));
}

// ---------------------------------------------------------------------------
// Negative: false value suppresses type inference
// ---------------------------------------------------------------------------

function testInferredFalseSuppressesType(router: Router) {
  router.post('/no-body', definePost(
    {body: false},
    (_req, _res, acc) => {
      // @ts-expect-error — body: false disables body parsing, even on POST
      const bad: unknown = acc.body;
      return {response: {body: bad}};
    }
  ));
}

// ---------------------------------------------------------------------------
// Positive: Auto-included body on PUT via definePut
// ---------------------------------------------------------------------------

function testAutoIncludedBodyPutAlias(router: Router) {
  router.put('/items/:id', definePut(
    {},
    (_req, _res, acc) => {
      const body: BodyResult = acc.body;
      return {response: {body: body.parsed}};
    }
  ));
}

// ---------------------------------------------------------------------------
// Positive: Auto-included body on PATCH via definePatch
// ---------------------------------------------------------------------------

function testAutoIncludedBodyPatchAlias(router: Router) {
  router.patch('/items/:id', definePatch(
    {},
    (_req, _res, acc) => {
      const body: BodyResult = acc.body;
      return {response: {body: body.parsed}};
    }
  ));
}

// ---------------------------------------------------------------------------
// Positive: Auto-included url on DELETE via defineDelete
// ---------------------------------------------------------------------------

function testAutoIncludedUrlDeleteAlias(router: Router) {
  router.delete('/items/:id', defineDelete(
    {},
    (_req, _res, acc) => {
      const url: UrlResult = acc.url;
      return {response: {body: url.pathname}};
    }
  ));
}

// ---------------------------------------------------------------------------
// Positive: definePut with explicit config keys
// ---------------------------------------------------------------------------

function testDefinePutWithConfig(router: Router) {
  router.put('/items/:id', definePut(
    {authorization: true, body: {limit: 2048}},
    (_req, _res, acc) => {
      const auth: AuthorizationResult = acc.auth;
      const body: BodyResult = acc.body;
      return {response: {body: {auth, body: body.parsed}}};
    }
  ));
}

// ---------------------------------------------------------------------------
// Positive: definePatch with explicit config keys
// ---------------------------------------------------------------------------

function testDefinePatchWithConfig(router: Router) {
  router.patch('/items/:id', definePatch(
    {authorization: true, body: true},
    (_req, _res, acc) => {
      const auth: AuthorizationResult = acc.auth;
      const body: BodyResult = acc.body;
      return {response: {body: {auth, body: body.parsed}}};
    }
  ));
}

// ---------------------------------------------------------------------------
// Positive: defineDelete with explicit config keys
// ---------------------------------------------------------------------------

function testDefineDeleteWithConfig(router: Router) {
  router.delete('/items/:id', defineDelete(
    {authorization: true, url: true},
    (_req, _res, acc) => {
      const auth: AuthorizationResult = acc.auth;
      const url: UrlResult = acc.url;
      return {response: {body: {auth, url: url.query}}};
    }
  ));
}

// ---------------------------------------------------------------------------
// Negative: url not available via definePut without explicit config
// ---------------------------------------------------------------------------

function testDefinePutRejectsUrl(router: Router) {
  router.put('/items/:id', definePut(
    {},
    (_req, _res, acc) => {
      // @ts-expect-error — url not in accumulator for PUT routes (definePut provides body, not url)
      const bad: unknown = acc.url;
      return {response: {body: bad}};
    }
  ));
}

// ---------------------------------------------------------------------------
// Negative: url not available via definePatch without explicit config
// ---------------------------------------------------------------------------

function testDefinePatchRejectsUrl(router: Router) {
  router.patch('/items/:id', definePatch(
    {},
    (_req, _res, acc) => {
      // @ts-expect-error — url not in accumulator for PATCH routes (definePatch provides body, not url)
      const bad: unknown = acc.url;
      return {response: {body: bad}};
    }
  ));
}

// ---------------------------------------------------------------------------
// Negative: body not available via defineDelete without explicit config
// ---------------------------------------------------------------------------

function testDefineDeleteRejectsBody(router: Router) {
  router.delete('/items/:id', defineDelete(
    {},
    (_req, _res, acc) => {
      // @ts-expect-error — body not in accumulator for DELETE routes (defineDelete provides url, not body)
      const bad: unknown = acc.body;
      return {response: {body: bad}};
    }
  ));
}

// ---------------------------------------------------------------------------
// Backward compat: Explicit generic still works
// ---------------------------------------------------------------------------

interface CustomAcc {
  userId: string;
  role: 'admin' | 'user';
}

function testExplicitGenericStillWorks(router: Router) {
  const config: RouteConfig<CustomAcc> = {
    authorization: {strategies: [{type: 'Bearer', authorizer: () => ({userId: '1'})}]},
    execute: (_req, _res, acc) => {
      const userId: string = acc.userId;
      const role: 'admin' | 'user' = acc.role;
      return {response: {body: {userId, role}}};
    },
  };
  router.get('/custom', config);
}

// ---------------------------------------------------------------------------
// Backward compat: Bare RouteConfig variable still works
// ---------------------------------------------------------------------------

function testBareRouteConfigStillWorks(router: Router) {
  const config: RouteConfig = {
    execute: (_req, _res, acc) => {
      const value: unknown = acc.anything;
      return {response: {body: value}};
    },
  };
  router.get('/bare', config);
}

// ---------------------------------------------------------------------------
// Backward compat: Function handler still works
// ---------------------------------------------------------------------------

function testFunctionHandlerStillWorks(router: Router) {
  router.get('/health', () => undefined);
}

// ---------------------------------------------------------------------------
// Backward compat: Array pipeline still works
// ---------------------------------------------------------------------------

function testArrayPipelineStillWorks(router: Router) {
  router.get('/pipeline', [() => ({value: 'ok'}), () => ({response: {body: 'done'}})]);
}

// ---------------------------------------------------------------------------
// Positive: GracefulLog is non-optional in callback context (#102)
// ---------------------------------------------------------------------------

function testGracefulLogType() {
  const opts: GracefulOptions = {
    onStartup: async ({log}) => {
      const logger: GracefulLog = log;
      logger.info('ready');
      logger.warn('caution');
      logger.error('fail');
    },
  };
  void opts;
}

// ---------------------------------------------------------------------------
// Positive: openapi sub-path export resolves to typed function (#101)
// ---------------------------------------------------------------------------

import type generateOpenAPI from '../lib/openapi.js';

function testOpenAPIImport(fn: typeof generateOpenAPI, router: Router) {
  const spec: OpenAPIDocument = fn(router, {title: 'Test', version: '1.0.0'});
  // @ts-expect-error — router must be Router-typed, plain object is rejected
  fn({}, {title: 'Test', version: '1.0.0'});
  const openapi: string = spec.openapi;
  const info: OpenAPIInfo = spec.info;
  const title: string = info.title;
  const version: string = info.version;
  const paths: Record<string, OpenAPIPathItem> = spec.paths;
  const components: OpenAPIComponents | undefined = spec.components;
  const schemes: Record<string, OpenAPISecurityScheme> | undefined = components?.securitySchemes;
  void openapi;
  void title;
  void version;
  void paths;
  void schemes;
}

function testOpenAPIOptions() {
  const opts: GenerateOpenAPIOptions = {
    title: 'My API',
    version: '2.0.0',
    description: 'A test API',
    servers: [{url: 'https://api.example.com'}],
    info: {contact: {name: 'Support', email: 'support@example.com'}},
  };
  void opts;
}

function testOpenAPIPathItemAccess() {
  const item: OpenAPIPathItem = {
    get: {summary: 'List items', responses: {200: {description: 'OK'}}},
    post: {summary: 'Create item', requestBody: {required: true, content: {'application/json': {schema: {type: 'object'}}}}},
  };
  const getOp: OpenAPIOperation | undefined = item.get;
  const summary: string | undefined = getOp?.summary;
  void summary;
  void item;
}

// ---------------------------------------------------------------------------
// Suppress unused-variable warnings (inference tests)
// ---------------------------------------------------------------------------

void testInferredRouteParams;
void testInferredBody;
void testInferredAuth;
void testInferredUrl;
void testInferredAccepts;
void testInferredCookies;
void testInferredPaginate;
void testInferredLogger;
void testInferredTracing;
void testInferredIdempotency;
void testInferredPrefer;
void testInferredMultipleMiddleware;
void testAutoIncludedBodyPost;
void testAutoIncludedUrlGet;
void testAutoIncludedUrlDelete;
void testAutoIncludedBodyPut;
void testAutoIncludedBodyPatch;
void testInferredRejectsAbsentKey;
void testInferredRejectsBodyOnGet;
void testInferredRejectsUrlOnPost;
void testInferredFalseSuppressesType;
void testAutoIncludedBodyPutAlias;
void testAutoIncludedBodyPatchAlias;
void testAutoIncludedUrlDeleteAlias;
void testDefinePutWithConfig;
void testDefinePatchWithConfig;
void testDefineDeleteWithConfig;
void testDefinePutRejectsUrl;
void testDefinePatchRejectsUrl;
void testDefineDeleteRejectsBody;
void testExplicitGenericStillWorks;
void testBareRouteConfigStillWorks;
void testFunctionHandlerStillWorks;
void testArrayPipelineStillWorks;
void testGracefulLogType;
void testOpenAPIImport;
void testOpenAPIOptions;
void testOpenAPIPathItemAccess;
