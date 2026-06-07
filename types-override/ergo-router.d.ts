/**
 * Consumer-facing type interfaces for ergo-router.
 *
 * Exports typed interfaces for router configuration, route configuration,
 * and the router instance. These replace the generic `object` types that
 * tsc emits from JSDoc annotations.
 */

import type {
  AcceptsOptions,
  AcceptsResult,
  AuthorizationOptions,
  AuthorizationResult,
  BodyOptions,
  BodyResult,
  CacheControlOptions,
  CompressOptions,
  CookieJar,
  CookieOptions,
  CsrfOptions,
  IdempotencyOptions,
  IdempotencyResult,
  LogEntry,
  LoggerOptions,
  PaginateOptions,
  PaginateResult,
  PreconditionOptions,
  PreferResult,
  RateLimitOptions,
  SecurityHeadersOptions,
  SendOptions,
  TimeoutOptions,
  TracingOptions,
  TracingResult,
  UrlResult,
  ValidateOptions,
} from '@centralping/ergo/types';

import type {IncomingMessage, ServerResponse} from 'node:http';

// ---------------------------------------------------------------------------
// Transport options
// ---------------------------------------------------------------------------

/** Options for transport-level request ID generation. */
export interface TransportRequestIdOptions {
  header?: string;
  trustProxy?: boolean;
  generate?: () => string;
  validate?: (value: string) => boolean;
}

/** Options for transport-level security headers. */
export interface TransportSecurityOptions {
  hsts?: {
    maxAge: number;
    includeSubDomains?: boolean;
    preload?: boolean;
  } | false;
  noSniff?: boolean;
  frameOptions?: string | false;
  referrerPolicy?: string | false;
  csp?: string | false;
  permissionsPolicy?: string | false;
  trustProxy?: boolean;
}

/** Options for transport-level rate limiting. */
export interface TransportRateLimitOptions {
  max?: number;
  windowMs?: number;
  store?: { hit(key: string, windowMs: number): { count: number; resetMs: number } };
  keyGenerator?: (req: IncomingMessage) => string;
}

/** Options for transport-level CORS handling. */
export interface TransportCorsOptions {
  origin?: string | string[] | ((origin: string) => boolean);
  methods?: string[];
  allowedHeaders?: string[];
  exposedHeaders?: string[];
  credentials?: boolean;
  maxAge?: number;
}

/** Transport layer configuration for `createRouter()`. */
export interface TransportOptions {
  requestId?: TransportRequestIdOptions | boolean;
  security?: TransportSecurityOptions | boolean;
  rateLimit?: TransportRateLimitOptions | boolean;
  cors?: TransportCorsOptions | boolean;
}

// ---------------------------------------------------------------------------
// Router options
// ---------------------------------------------------------------------------

/** Options for `createRouter()`. */
export interface RouterOptions {
  transport?: TransportOptions;
  strictPatch?: boolean;
  strictBody?: boolean;
  send?: SendOptions;
  catchHandler?: (req: IncomingMessage, res: ServerResponse, err: Error) => unknown;
  strict?: boolean;
  debug?: boolean;
  timing?: boolean | {header?: string; precision?: number};
  defaults?: RouteConfigDefaults;
}

// ---------------------------------------------------------------------------
// Route config
// ---------------------------------------------------------------------------

/** Default middleware configuration (subset of RouteConfig without route-specific keys). */
export interface RouteConfigDefaults {
  tracing?: TracingOptions | boolean;
  logger?: LoggerOptions | boolean;
  rateLimit?: RateLimitOptions | boolean;
  accepts?: AcceptsOptions | boolean;
  preconditionRequired?: PreconditionOptions | boolean;
  cookie?: CookieOptions | boolean;
  url?: object | boolean;
  paginate?: PaginateOptions | boolean;
  jsonApiQuery?: object | boolean;
  prefer?: object | boolean;
  securityHeaders?: SecurityHeadersOptions | boolean;
  cacheControl?: CacheControlOptions | boolean;
  csrf?: CsrfOptions | boolean;
  authorization?: AuthorizationOptions | boolean;
  body?: BodyOptions | boolean;
  idempotency?: IdempotencyOptions | boolean;
  validate?: ValidateOptions | boolean;
  timeout?: TimeoutOptions | boolean;
  compress?: CompressOptions | boolean;
  use?: Array<((...args: any[]) => unknown) | {fn: (...args: any[]) => unknown; setPath: string}> | false;
}

/**
 * Declarative route configuration object.
 *
 * Each key corresponds to an ergo middleware factory. Set to `false` to
 * explicitly disable, `true` to use default options, or an options object
 * for custom configuration. Resolution order: route config > router defaults > omitted.
 *
 * @typeParam A - Domain accumulator type. Defaults to `Record<string, unknown>`.
 */
export interface RouteConfig<A extends object = Record<string, unknown>> {
  tracing?: TracingOptions | boolean;
  logger?: LoggerOptions | boolean;
  rateLimit?: RateLimitOptions | boolean;
  accepts?: AcceptsOptions | boolean;
  preconditionRequired?: PreconditionOptions | boolean;
  cookie?: CookieOptions | boolean;
  url?: object | boolean;
  paginate?: PaginateOptions | boolean;
  jsonApiQuery?: object | boolean;
  prefer?: object | boolean;
  securityHeaders?: SecurityHeadersOptions | boolean;
  cacheControl?: CacheControlOptions | boolean;
  csrf?: CsrfOptions | boolean;
  authorization?: AuthorizationOptions | boolean;
  body?: BodyOptions | boolean;
  idempotency?: IdempotencyOptions | boolean;
  validate?: ValidateOptions | boolean;
  timeout?: TimeoutOptions | boolean;
  compress?: CompressOptions | boolean;
  use?: Array<((...args: any[]) => unknown) | {fn: (...args: any[]) => unknown; setPath: string}> | false;
  execute: (req: IncomingMessage, res: ServerResponse, domainAcc: A, responseAcc: Record<string, unknown>) => unknown;
  send?: SendOptions;
  noSend?: boolean;
  catchHandler?: (req: IncomingMessage, res: ServerResponse, err: Error) => unknown;
  openapi?: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Accumulator type inference
// ---------------------------------------------------------------------------

/**
 * RouteConfig shape without `execute` — used as the inference source for
 * config-key-based accumulator computation. Separating `execute` from the
 * inference constraint prevents circular type dependencies.
 */
export interface RouteConfigBase {
  tracing?: TracingOptions | boolean;
  logger?: LoggerOptions | boolean;
  rateLimit?: RateLimitOptions | boolean;
  accepts?: AcceptsOptions | boolean;
  preconditionRequired?: PreconditionOptions | boolean;
  cookie?: CookieOptions | boolean;
  url?: object | boolean;
  paginate?: PaginateOptions | boolean;
  jsonApiQuery?: object | boolean;
  prefer?: object | boolean;
  securityHeaders?: SecurityHeadersOptions | boolean;
  cacheControl?: CacheControlOptions | boolean;
  csrf?: CsrfOptions | boolean;
  authorization?: AuthorizationOptions | boolean;
  body?: BodyOptions | boolean;
  idempotency?: IdempotencyOptions | boolean;
  validate?: ValidateOptions | boolean;
  timeout?: TimeoutOptions | boolean;
  compress?: CompressOptions | boolean;
  use?: Array<((...args: any[]) => unknown) | {fn: (...args: any[]) => unknown; setPath: string}> | false;
  send?: SendOptions;
  noSend?: boolean;
  catchHandler?: (req: IncomingMessage, res: ServerResponse, err: Error) => unknown;
  openapi?: Record<string, unknown>;
}

/**
 * Computes the domain accumulator type from enabled middleware config keys.
 * Each conditional branch maps a config key to its runtime accumulator shape.
 * Keys set to `false` are excluded (they disable the middleware at runtime).
 */
export type InferAccumulator<C> =
  {route: {params: Record<string, string>}}
  & (C extends {tracing: false} ? {} : C extends {tracing: infer _} ? {trace: TracingResult} : {})
  & (C extends {logger: false} ? {} : C extends {logger: infer _} ? {log: LogEntry} : {})
  & (C extends {accepts: false} ? {} : C extends {accepts: infer _} ? {accepts: AcceptsResult} : {})
  & (C extends {cookie: false} ? {} : C extends {cookie: infer _} ? {cookies: CookieJar} : {})
  & (C extends {url: false} ? {} : C extends {url: infer _} ? {url: UrlResult} : {})
  & (C extends {paginate: false} ? {} : C extends {paginate: infer _}
      ? {paginate: PaginateResult} & (C extends {url: false} ? {} : {url: UrlResult})
      : {})
  & (C extends {prefer: false} ? {} : C extends {prefer: infer _} ? {prefer: PreferResult} : {})
  & (C extends {authorization: false} ? {} : C extends {authorization: infer _} ? {auth: AuthorizationResult} : {})
  & (C extends {body: false} ? {} : C extends {body: infer _} ? {body: BodyResult} : {})
  & (C extends {idempotency: false} ? {} : C extends {idempotency: infer _} ? {idempotency: IdempotencyResult} : {});

/** Auto-included accumulator keys for GET/DELETE routes (url parsed unless explicitly disabled). */
export type AutoGetAccumulator<C> = C extends {url: false} ? {} : {url: UrlResult};

/** Auto-included accumulator keys for POST/PUT/PATCH routes (body parsed unless explicitly disabled). */
export type AutoPostAccumulator<C> = C extends {body: false} ? {} : {body: BodyResult};

// ---------------------------------------------------------------------------
// Router instance
// ---------------------------------------------------------------------------

/** The router object returned by `createRouter()`. */
export interface Router {
  _dispatcher: unknown;
  _pathIndex: unknown;
  _registry: unknown;
  _middleware: Array<(...args: any[]) => unknown>;
  _subRouters: Array<{prefix: string; router: Router}>;
  _transport: unknown;
  _wrap: (...args: any[]) => unknown;
  _options: RouterOptions;
  _routes: Array<{method: string; path: string; config: RouteConfig | undefined; defaults: RouteConfigDefaults | undefined}>;

  use(...fns: Array<(...args: any[]) => unknown>): Router;
  mount(prefix: string, subRouter: Router): Router;
  handle(): (req: IncomingMessage, res: ServerResponse) => void;
  listen(port: number, ...args: any[]): import('node:http').Server;
  get<A extends object = Record<string, unknown>>(path: string, pipeline: ((...args: any[]) => unknown) | Array<unknown> | RouteConfig<A>, routeOpts?: object): Router;
  post<A extends object = Record<string, unknown>>(path: string, pipeline: ((...args: any[]) => unknown) | Array<unknown> | RouteConfig<A>, routeOpts?: object): Router;
  put<A extends object = Record<string, unknown>>(path: string, pipeline: ((...args: any[]) => unknown) | Array<unknown> | RouteConfig<A>, routeOpts?: object): Router;
  patch<A extends object = Record<string, unknown>>(path: string, pipeline: ((...args: any[]) => unknown) | Array<unknown> | RouteConfig<A>, routeOpts?: object): Router;
  delete<A extends object = Record<string, unknown>>(path: string, pipeline: ((...args: any[]) => unknown) | Array<unknown> | RouteConfig<A>, routeOpts?: object): Router;
}

// ---------------------------------------------------------------------------
// Graceful lifecycle
// ---------------------------------------------------------------------------

/** Options for the `graceful()` lifecycle utility. */
export interface GracefulOptions {
  port?: number;
  hostname?: string;
  log?: {
    info: (...args: any[]) => void;
    warn: (...args: any[]) => void;
    error: (...args: any[]) => void;
  };
  signals?: string[];
  timeout?: number;
  exit?: (code?: number) => void;
  onStartup?: (ctx: {log: GracefulOptions['log']}) => void | Promise<void>;
  onShutdown?: (ctx: {log: GracefulOptions['log']; signal: string}) => void | Promise<void>;
}

/** Return value of `graceful()`. */
export interface GracefulResult {
  server: import('node:http').Server;
  shutdown: (signal: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

/** Namespace object containing all available router presets. */
export interface Presets {
  readonly jsonApi: Readonly<RouterOptions>;
}

// ---------------------------------------------------------------------------
// Route config inference helpers
// ---------------------------------------------------------------------------

/**
 * Type-inference helper for GET/DELETE routes. Infers the domain accumulator
 * type from enabled middleware config keys. Provides auto-included `url` typing
 * for GET/DELETE methods.
 *
 * TypeScript cannot infer generic parameters from an object literal's properties
 * when a sibling callback in the same object uses that generic (circular
 * inference). This helper separates the config (inference source) from the
 * execute callback (contextual typing target) into two parameters.
 *
 * @example
 * router.get('/users/:id', defineGet(
 *   {authorization: true, url: true},
 *   (req, res, acc) => {
 *     acc.auth;           // AuthorizationResult
 *     acc.url.query;      // Record<string, string | string[]>
 *     acc.route.params;   // Record<string, string>
 *   }
 * ));
 */
export declare function defineGet<C extends RouteConfigBase>(
  config: C,
  execute: (req: IncomingMessage, res: ServerResponse, domainAcc: InferAccumulator<C> & AutoGetAccumulator<C>, responseAcc: Record<string, unknown>) => unknown
): RouteConfig<InferAccumulator<C> & AutoGetAccumulator<C>>;

/**
 * Type-inference helper for POST/PUT/PATCH routes. Infers the domain accumulator
 * type from enabled middleware config keys. Provides auto-included `body` typing
 * for POST/PUT/PATCH methods.
 *
 * @example
 * router.post('/users', definePost(
 *   {authorization: true, body: {limit: 2048}},
 *   (req, res, acc) => {
 *     acc.auth;           // AuthorizationResult
 *     acc.body.parsed;    // unknown
 *     acc.route.params;   // Record<string, string>
 *   }
 * ));
 */
export declare function definePost<C extends RouteConfigBase>(
  config: C,
  execute: (req: IncomingMessage, res: ServerResponse, domainAcc: InferAccumulator<C> & AutoPostAccumulator<C>, responseAcc: Record<string, unknown>) => unknown
): RouteConfig<InferAccumulator<C> & AutoPostAccumulator<C>>;

/**
 * General type-inference helper (method-agnostic). Infers the domain accumulator
 * type from enabled middleware config keys. Does not include method-specific
 * auto-includes — add `url: true` or `body: true` explicitly if needed.
 *
 * @example
 * router.get('/items', defineRoute(
 *   {accepts: true, paginate: true},
 *   (req, res, acc) => {
 *     acc.accepts;        // AcceptsResult
 *     acc.paginate;       // PaginateResult
 *     acc.url;            // UrlResult (from paginate's transitive include)
 *   }
 * ));
 */
export declare function defineRoute<C extends RouteConfigBase>(
  config: C,
  execute: (req: IncomingMessage, res: ServerResponse, domainAcc: InferAccumulator<C>, responseAcc: Record<string, unknown>) => unknown
): RouteConfig<InferAccumulator<C>>;
