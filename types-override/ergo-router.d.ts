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
  ValidateOptions
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
  hsts?:
    | {
        maxAge: number;
        includeSubDomains?: boolean;
        preload?: boolean;
      }
    | false;
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
  store?: {hit(key: string, windowMs: number): {count: number; resetMs: number}};
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
// Response info (shared primitive from @centralping/ergo/lib/response-info)
// ---------------------------------------------------------------------------

/** Snapshot of response information for post-send observation hooks. */
export interface ResponseInfo {
  statusCode: number;
  headers: Record<string, string | string[] | number | undefined>;
  method: string;
  url: string;
  bodySize: number | undefined;
  duration: number;
  source: 'pipeline' | 'transport';
}

/**
 * Callback signature for `onResponse` lifecycle hooks.
 *
 * `domainAcc` is `undefined` for transport-level short-circuit responses
 * (404, 405, 415, 429, OPTIONS, CORS preflight) because no pipeline ran.
 * Use `responseInfo.source` to distinguish between pipeline and transport responses.
 */
export type OnResponseHook = (
  req: IncomingMessage,
  res: ServerResponse,
  responseInfo: ResponseInfo,
  domainAcc: Record<string, unknown> | undefined
) => unknown;

// ---------------------------------------------------------------------------
// Router options
// ---------------------------------------------------------------------------

/** Options for `createRouter()`. */
export interface RouterOptions {
  transport?: TransportOptions;
  strictPatch?: boolean;
  strictBody?: boolean;
  send?: SendOptions;
  catchHandler?: (
    req: IncomingMessage,
    res: ServerResponse,
    err: Error,
    domainAcc?: Record<string, unknown>
  ) => unknown;
  onResponse?: OnResponseHook;
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
  use?:
    | Array<((...args: any[]) => unknown) | {fn: (...args: any[]) => unknown; setPath: string}>
    | false;
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
  use?:
    | Array<((...args: any[]) => unknown) | {fn: (...args: any[]) => unknown; setPath: string}>
    | false;
  execute: (
    req: IncomingMessage,
    res: ServerResponse,
    domainAcc: A,
    responseAcc: Record<string, unknown>
  ) => unknown;
  send?: SendOptions;
  noSend?: boolean;
  catchHandler?: (
    req: IncomingMessage,
    res: ServerResponse,
    err: Error,
    domainAcc?: Record<string, unknown>
  ) => unknown;
  onResponse?: OnResponseHook;
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
  use?:
    | Array<((...args: any[]) => unknown) | {fn: (...args: any[]) => unknown; setPath: string}>
    | false;
  send?: SendOptions;
  noSend?: boolean;
  catchHandler?: (
    req: IncomingMessage,
    res: ServerResponse,
    err: Error,
    domainAcc?: Record<string, unknown>
  ) => unknown;
  onResponse?: OnResponseHook;
  openapi?: Record<string, unknown>;
}

/**
 * Computes the domain accumulator type from enabled middleware config keys.
 * Each conditional branch maps a config key to its runtime accumulator shape.
 * Keys set to `false` are excluded (they disable the middleware at runtime).
 *
 * @typeParam C - The route config shape (inference source).
 * @typeParam B - Parsed body type. Defaults to `unknown`.
 */
export type InferAccumulator<C, B = unknown> = {
  route: {params: Record<string, string>};
} & (C extends {tracing: false} ? {} : C extends {tracing: infer _} ? {trace: TracingResult} : {}) &
  (C extends {logger: false} ? {} : C extends {logger: infer _} ? {log: LogEntry} : {}) &
  (C extends {accepts: false} ? {} : C extends {accepts: infer _} ? {accepts: AcceptsResult} : {}) &
  (C extends {cookie: false} ? {} : C extends {cookie: infer _} ? {cookies: CookieJar} : {}) &
  (C extends {url: false} ? {} : C extends {url: infer _} ? {url: UrlResult} : {}) &
  (C extends {paginate: false}
    ? {}
    : C extends {paginate: infer _}
      ? {paginate: PaginateResult} & (C extends {url: false} ? {} : {url: UrlResult})
      : {}) &
  (C extends {prefer: false} ? {} : C extends {prefer: infer _} ? {prefer: PreferResult} : {}) &
  (C extends {authorization: false}
    ? {}
    : C extends {authorization: infer _}
      ? {auth: AuthorizationResult}
      : {}) &
  (C extends {body: false} ? {} : C extends {body: infer _} ? {body: BodyResult<B>} : {}) &
  (C extends {idempotency: false}
    ? {}
    : C extends {idempotency: infer _}
      ? {idempotency: IdempotencyResult}
      : {});

/** Auto-included accumulator keys for GET/DELETE routes (url parsed unless explicitly disabled). */
export type AutoGetAccumulator<C> = C extends {url: false} ? {} : {url: UrlResult};

/**
 * Auto-included accumulator keys for POST/PUT/PATCH routes (body parsed unless explicitly disabled).
 *
 * @typeParam C - The route config shape.
 * @typeParam B - Parsed body type. Defaults to `unknown`.
 */
export type AutoPostAccumulator<C, B = unknown> = C extends {body: false}
  ? {}
  : {body: BodyResult<B>};

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
  _routes: Array<{
    method: string;
    path: string;
    config: RouteConfig | undefined;
    defaults: RouteConfigDefaults | undefined;
  }>;

  use(...fns: Array<(...args: any[]) => unknown>): Router;
  mount(prefix: string, subRouter: Router): Router;
  handle(): (req: IncomingMessage, res: ServerResponse) => void;
  listen(port: number, ...args: any[]): import('node:http').Server;
  get<A extends object = Record<string, unknown>>(
    path: string,
    pipeline: ((...args: any[]) => unknown) | Array<unknown> | RouteConfig<A>,
    routeOpts?: object
  ): Router;
  post<A extends object = Record<string, unknown>>(
    path: string,
    pipeline: ((...args: any[]) => unknown) | Array<unknown> | RouteConfig<A>,
    routeOpts?: object
  ): Router;
  put<A extends object = Record<string, unknown>>(
    path: string,
    pipeline: ((...args: any[]) => unknown) | Array<unknown> | RouteConfig<A>,
    routeOpts?: object
  ): Router;
  patch<A extends object = Record<string, unknown>>(
    path: string,
    pipeline: ((...args: any[]) => unknown) | Array<unknown> | RouteConfig<A>,
    routeOpts?: object
  ): Router;
  delete<A extends object = Record<string, unknown>>(
    path: string,
    pipeline: ((...args: any[]) => unknown) | Array<unknown> | RouteConfig<A>,
    routeOpts?: object
  ): Router;
  routeTable(): string;
}

// ---------------------------------------------------------------------------
// Graceful lifecycle
// ---------------------------------------------------------------------------

/** Logger shape accepted by `graceful()` and guaranteed in lifecycle callbacks. */
export interface GracefulLog {
  info: (...args: any[]) => void;
  warn: (...args: any[]) => void;
  error: (...args: any[]) => void;
}

/** Options for the `graceful()` lifecycle utility. */
export interface GracefulOptions {
  port?: number;
  hostname?: string;
  log?: GracefulLog;
  signals?: string[];
  timeout?: number;
  exit?: (code?: number) => void;
  onStartup?: (ctx: {log: GracefulLog}) => void | Promise<void>;
  onShutdown?: (ctx: {log: GracefulLog; signal: string}) => void | Promise<void>;
}

/** Return value of `graceful()`. */
export interface GracefulResult {
  server: import('node:http').Server;
  shutdown: (signal: string) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Presets
// ---------------------------------------------------------------------------

/** JSON API preset shape — transport with request ID and security, defaults with accepts and timeout. */
export interface JsonApiPreset {
  readonly transport: Readonly<{requestId: TransportRequestIdOptions; security: TransportSecurityOptions}>;
  readonly defaults: Readonly<{accepts: AcceptsOptions; timeout: TimeoutOptions}>;
}

/** SSE preset shape — transport with request ID and security, defaults with compression/timeout disabled and accepts restricted. */
export interface SsePreset {
  readonly transport: Readonly<{requestId: TransportRequestIdOptions; security: TransportSecurityOptions}>;
  readonly defaults: Readonly<{compress: false; timeout: false; accepts: AcceptsOptions}>;
}

/** Webhooks preset shape — transport with request ID and security, defaults with accepts, idempotency, and timeout. */
export interface WebhooksPreset {
  readonly transport: Readonly<{requestId: TransportRequestIdOptions; security: TransportSecurityOptions}>;
  readonly defaults: Readonly<{accepts: AcceptsOptions; idempotency: IdempotencyOptions; timeout: TimeoutOptions}>;
}

/** Public API preset shape — transport with request ID, security, and rate limiting, defaults with accepts, cache control, and timeout. */
export interface PublicPreset {
  readonly transport: Readonly<{requestId: TransportRequestIdOptions; security: TransportSecurityOptions; rateLimit: TransportRateLimitOptions}>;
  readonly defaults: Readonly<{accepts: AcceptsOptions; cacheControl: CacheControlOptions; timeout: TimeoutOptions}>;
}

/** Namespace object containing all available router presets. */
export interface Presets {
  readonly jsonApi: JsonApiPreset;
  readonly sse: SsePreset;
  readonly webhooks: WebhooksPreset;
  readonly public: PublicPreset;
}

// ---------------------------------------------------------------------------
// OpenAPI types
// ---------------------------------------------------------------------------

/** Contact information for the API (OpenAPI 3.1 Info Object > Contact Object). */
export interface OpenAPIContact {
  name?: string;
  url?: string;
  email?: string;
  [key: `x-${string}`]: unknown;
}

/** License information for the API (OpenAPI 3.1 Info Object > License Object). */
export interface OpenAPILicense {
  name: string;
  identifier?: string;
  url?: string;
  [key: `x-${string}`]: unknown;
}

/** API metadata (OpenAPI 3.1 Info Object). */
export interface OpenAPIInfo {
  title: string;
  version: string;
  description?: string;
  termsOfService?: string;
  contact?: OpenAPIContact;
  license?: OpenAPILicense;
  summary?: string;
  [key: `x-${string}`]: unknown;
}

/** Server variable for URL template substitution (OpenAPI 3.1 Server Variable Object). */
export interface OpenAPIServerVariable {
  default: string;
  enum?: string[];
  description?: string;
  [key: `x-${string}`]: unknown;
}

/** Server endpoint (OpenAPI 3.1 Server Object). */
export interface OpenAPIServer {
  url: string;
  description?: string;
  variables?: Record<string, OpenAPIServerVariable>;
  [key: `x-${string}`]: unknown;
}

/** Describes a single operation parameter (OpenAPI 3.1 Parameter Object). */
export interface OpenAPIParameter {
  name: string;
  in: 'query' | 'header' | 'path' | 'cookie';
  required?: boolean;
  schema?: Record<string, unknown>;
  description?: string;
  [key: `x-${string}`]: unknown;
}

/** Media type entry within a request body or response (OpenAPI 3.1 Media Type Object). */
export interface OpenAPIMediaType {
  schema?: Record<string, unknown>;
  [key: `x-${string}`]: unknown;
}

/** Describes a request body (OpenAPI 3.1 Request Body Object). */
export interface OpenAPIRequestBody {
  required?: boolean;
  content: Record<string, OpenAPIMediaType>;
  description?: string;
  [key: `x-${string}`]: unknown;
}

/** Describes a single API operation on a path (OpenAPI 3.1 Operation Object). */
export interface OpenAPIOperation {
  summary?: string;
  description?: string;
  operationId?: string;
  tags?: string[];
  deprecated?: boolean;
  parameters?: OpenAPIParameter[];
  requestBody?: OpenAPIRequestBody;
  responses?: Record<string, unknown>;
  security?: Array<Record<string, string[]>>;
  externalDocs?: {description?: string; url: string; [key: `x-${string}`]: unknown};
  [key: `x-${string}`]: unknown;
}

/** Path item containing operations keyed by HTTP method (OpenAPI 3.1 Path Item Object). */
export interface OpenAPIPathItem {
  get?: OpenAPIOperation;
  put?: OpenAPIOperation;
  post?: OpenAPIOperation;
  delete?: OpenAPIOperation;
  options?: OpenAPIOperation;
  head?: OpenAPIOperation;
  patch?: OpenAPIOperation;
  trace?: OpenAPIOperation;
  [key: `x-${string}`]: unknown;
}

/** Defines a security scheme (OpenAPI 3.1 Security Scheme Object). */
export interface OpenAPISecurityScheme {
  type: 'apiKey' | 'http' | 'mutualTLS' | 'oauth2' | 'openIdConnect';
  scheme?: string;
  name?: string;
  in?: 'query' | 'header' | 'cookie';
  description?: string;
  [key: `x-${string}`]: unknown;
}

/** Holds reusable components (OpenAPI 3.1 Components Object). */
export interface OpenAPIComponents {
  securitySchemes?: Record<string, OpenAPISecurityScheme>;
  [key: `x-${string}`]: unknown;
}

/** Top-level OpenAPI 3.1 document. */
export interface OpenAPIDocument {
  openapi: string;
  info: OpenAPIInfo;
  paths: Record<string, OpenAPIPathItem>;
  servers?: OpenAPIServer[];
  components?: OpenAPIComponents;
  [key: `x-${string}`]: unknown;
}

/** Options accepted by `generateOpenAPI()`. */
export interface GenerateOpenAPIOptions {
  title?: string;
  version?: string;
  description?: string;
  servers?: OpenAPIServer[];
  info?: Partial<OpenAPIInfo>;
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
 * @typeParam C - The route config shape (inference source).
 * @typeParam B - Parsed body type. Defaults to `unknown`. Only relevant when
 *   `body` is enabled in config (uncommon for GET routes).
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
export declare function defineGet<C extends RouteConfigBase, B = unknown>(
  config: C,
  execute: (
    req: IncomingMessage,
    res: ServerResponse,
    domainAcc: InferAccumulator<C, B> & AutoGetAccumulator<C>,
    responseAcc: Record<string, unknown>
  ) => unknown
): RouteConfig<InferAccumulator<C, B> & AutoGetAccumulator<C>>;

/**
 * Type-inference helper for POST/PUT/PATCH routes. Infers the domain accumulator
 * type from enabled middleware config keys. Provides auto-included `body` typing
 * for POST/PUT/PATCH methods.
 *
 * @typeParam C - The route config shape (inference source).
 * @typeParam B - Parsed body type. Specify to narrow `acc.body.parsed` from `unknown`.
 *
 * @example
 * interface CreateUserBody { name: string; email: string; }
 *
 * router.post('/users', definePost<typeof config, CreateUserBody>(
 *   {authorization: true, body: {limit: 2048}},
 *   (req, res, acc) => {
 *     acc.body.parsed.name;  // string — typed!
 *     acc.body.parsed.email; // string — typed!
 *   }
 * ));
 */
export declare function definePost<C extends RouteConfigBase, B = unknown>(
  config: C,
  execute: (
    req: IncomingMessage,
    res: ServerResponse,
    domainAcc: InferAccumulator<C, B> & AutoPostAccumulator<C, B>,
    responseAcc: Record<string, unknown>
  ) => unknown
): RouteConfig<InferAccumulator<C, B> & AutoPostAccumulator<C, B>>;

/**
 * General type-inference helper (method-agnostic). Infers the domain accumulator
 * type from enabled middleware config keys. Does not include method-specific
 * auto-includes — add `url: true` or `body: true` explicitly if needed.
 *
 * @typeParam C - The route config shape (inference source).
 * @typeParam B - Parsed body type. Defaults to `unknown`. Only relevant when
 *   `body` is enabled in config.
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
export declare function defineRoute<C extends RouteConfigBase, B = unknown>(
  config: C,
  execute: (
    req: IncomingMessage,
    res: ServerResponse,
    domainAcc: InferAccumulator<C, B>,
    responseAcc: Record<string, unknown>
  ) => unknown
): RouteConfig<InferAccumulator<C, B>>;

/**
 * Type-inference helper for PUT routes. Alias for {@link definePost} — PUT
 * routes share the same auto-included `body` typing as POST/PATCH.
 *
 * @typeParam C - The route config shape (inference source).
 * @typeParam B - Parsed body type. Specify to narrow `acc.body.parsed` from `unknown`.
 *
 * @example
 * interface UpdateUserBody { name: string; }
 *
 * router.put('/users/:id', definePut<typeof config, UpdateUserBody>(
 *   {authorization: true, body: {limit: 2048}},
 *   (req, res, acc) => {
 *     acc.body.parsed.name;  // string — typed!
 *   }
 * ));
 */
export declare function definePut<C extends RouteConfigBase, B = unknown>(
  config: C,
  execute: (
    req: IncomingMessage,
    res: ServerResponse,
    domainAcc: InferAccumulator<C, B> & AutoPostAccumulator<C, B>,
    responseAcc: Record<string, unknown>
  ) => unknown
): RouteConfig<InferAccumulator<C, B> & AutoPostAccumulator<C, B>>;

/**
 * Type-inference helper for PATCH routes. Alias for {@link definePost} — PATCH
 * routes share the same auto-included `body` typing as POST/PUT.
 *
 * @typeParam C - The route config shape (inference source).
 * @typeParam B - Parsed body type. Specify to narrow `acc.body.parsed` from `unknown`.
 *
 * @example
 * interface PatchUserBody { name?: string; }
 *
 * router.patch('/users/:id', definePatch<typeof config, PatchUserBody>(
 *   {authorization: true, body: true},
 *   (req, res, acc) => {
 *     acc.body.parsed.name;  // string | undefined — typed!
 *   }
 * ));
 */
export declare function definePatch<C extends RouteConfigBase, B = unknown>(
  config: C,
  execute: (
    req: IncomingMessage,
    res: ServerResponse,
    domainAcc: InferAccumulator<C, B> & AutoPostAccumulator<C, B>,
    responseAcc: Record<string, unknown>
  ) => unknown
): RouteConfig<InferAccumulator<C, B> & AutoPostAccumulator<C, B>>;

/**
 * Type-inference helper for DELETE routes. Alias for {@link defineGet} — DELETE
 * routes share the same auto-included `url` typing as GET.
 *
 * @typeParam C - The route config shape (inference source).
 * @typeParam B - Parsed body type. Defaults to `unknown`. Only relevant when
 *   `body` is enabled in config (uncommon for DELETE routes).
 *
 * @example
 * router.delete('/users/:id', defineDelete(
 *   {authorization: true, url: true},
 *   (req, res, acc) => {
 *     acc.auth;           // AuthorizationResult
 *     acc.url.query;      // Record<string, string | string[]>
 *     acc.route.params;   // Record<string, string>
 *   }
 * ));
 */
export declare function defineDelete<C extends RouteConfigBase, B = unknown>(
  config: C,
  execute: (
    req: IncomingMessage,
    res: ServerResponse,
    domainAcc: InferAccumulator<C, B> & AutoGetAccumulator<C>,
    responseAcc: Record<string, unknown>
  ) => unknown
): RouteConfig<InferAccumulator<C, B> & AutoGetAccumulator<C>>;
