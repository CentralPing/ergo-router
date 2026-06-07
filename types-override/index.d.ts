import type {RouterOptions, Router, Presets, GracefulOptions, GracefulResult} from './ergo-router.js';

export {default} from './lib/router.js';

declare function graceful(
  handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void,
  options?: GracefulOptions,
): Promise<GracefulResult>;

export {graceful};

export declare const presets: Presets;

export declare const defineGet: typeof import('./ergo-router.js').defineGet;
export declare const definePost: typeof import('./ergo-router.js').definePost;
export declare const defineRoute: typeof import('./ergo-router.js').defineRoute;

export type {
  RouterOptions,
  Router,
  Presets,
  RouteConfig,
  RouteConfigDefaults,
  RouteConfigBase,
  InferAccumulator,
  AutoGetAccumulator,
  AutoPostAccumulator,
  TransportOptions,
  TransportRequestIdOptions,
  TransportSecurityOptions,
  TransportRateLimitOptions,
  TransportCorsOptions,
  GracefulOptions,
  GracefulResult,
} from './ergo-router.js';
