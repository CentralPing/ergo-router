/**
 * Consumer-facing type interfaces for ergo-router.
 *
 * Exports typed interfaces for router configuration, route configuration,
 * and the router instance. These replace the generic `object` types that
 * tsc emits from JSDoc annotations.
 */

import type {
  AcceptsOptions,
  AuthorizationOptions,
  BodyOptions,
  CacheControlOptions,
  CompressOptions,
  CookieOptions,
  CsrfOptions,
  IdempotencyOptions,
  LoggerOptions,
  PreconditionOptions,
  RateLimitOptions,
  SecurityHeadersOptions,
  SendOptions,
  TimeoutOptions,
  TracingOptions,
  ValidateOptions,
} from '@centralping/ergo/types';

import type {IncomingMessage, ServerResponse} from 'node:http';

// ---------------------------------------------------------------------------
// Transport options
// ---------------------------------------------------------------------------

/** Options for transport-level request ID generation. */
export interface TransportRequestIdOptions {
  generate?: () => string;
  trustProxy?: boolean;
  headerName?: string;
}

/** Options for transport-level security headers. */
export interface TransportSecurityOptions {
  contentSecurityPolicy?: string | false;
  strictTransportSecurity?: string | false | {
    maxAge: number;
    includeSubDomains?: boolean;
    preload?: boolean;
  };
  xContentTypeOptions?: string | false;
  xFrameOptions?: string | false;
  referrerPolicy?: string | false;
  xXssProtection?: string | false;
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
  origin?: string | string[] | RegExp | ((origin: string) => boolean);
  allowMethods?: string[];
  allowHeaders?: string | string[] | RegExp | ((header: string) => boolean);
  exposeHeaders?: string | string[];
  allowCredentials?: boolean;
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
  use?: Array<((...args: any[]) => unknown) | [(...args: any[]) => unknown, string]> | false;
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
  use?: Array<((...args: any[]) => unknown) | [(...args: any[]) => unknown, string]> | false;
  execute: (req: IncomingMessage, res: ServerResponse, domainAcc: A, responseAcc: Record<string, unknown>) => unknown;
  send?: SendOptions;
  noSend?: boolean;
  catchHandler?: (req: IncomingMessage, res: ServerResponse, err: Error) => unknown;
  openapi?: Record<string, unknown>;
}

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
  get(path: string, pipeline: ((...args: any[]) => unknown) | Array<unknown> | RouteConfig, routeOpts?: object): Router;
  post(path: string, pipeline: ((...args: any[]) => unknown) | Array<unknown> | RouteConfig, routeOpts?: object): Router;
  put(path: string, pipeline: ((...args: any[]) => unknown) | Array<unknown> | RouteConfig, routeOpts?: object): Router;
  patch(path: string, pipeline: ((...args: any[]) => unknown) | Array<unknown> | RouteConfig, routeOpts?: object): Router;
  delete(path: string, pipeline: ((...args: any[]) => unknown) | Array<unknown> | RouteConfig, routeOpts?: object): Router;
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
