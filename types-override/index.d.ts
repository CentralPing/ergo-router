import type {RouterOptions, Router, Presets, GracefulOptions, GracefulResult} from './ergo-router.js';

export {default} from './lib/router.js';

declare function graceful(
  handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void,
  options?: GracefulOptions,
): Promise<GracefulResult>;

export {graceful};

export declare const presets: Presets;

export type {
  RouterOptions,
  Router,
  Presets,
  RouteConfig,
  RouteConfigDefaults,
  TransportOptions,
  TransportRequestIdOptions,
  TransportSecurityOptions,
  TransportRateLimitOptions,
  TransportCorsOptions,
  GracefulOptions,
  GracefulResult,
} from './ergo-router.js';
