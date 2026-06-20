import type {RouterOptions, Router, Presets, GracefulLog, GracefulOptions, GracefulResult} from './ergo-router.js';

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
export declare const definePut: typeof import('./ergo-router.js').definePut;
export declare const definePatch: typeof import('./ergo-router.js').definePatch;
export declare const defineDelete: typeof import('./ergo-router.js').defineDelete;

export type {
  RouterOptions,
  Router,
  Presets,
  JsonApiPreset,
  SsePreset,
  WebhooksPreset,
  PublicPreset,
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
  GracefulLog,
  GracefulOptions,
  GracefulResult,
  GenerateOpenAPIOptions,
  OpenAPIDocument,
  OpenAPIInfo,
  OpenAPIContact,
  OpenAPILicense,
  OpenAPIServer,
  OpenAPIServerVariable,
  OpenAPIParameter,
  OpenAPIMediaType,
  OpenAPIRequestBody,
  OpenAPIOperation,
  OpenAPIPathItem,
  OpenAPISecurityScheme,
  OpenAPIComponents,
} from './ergo-router.js';
