import type {RouteConfig, RouteConfigDefaults} from '../ergo-router.js';

/**
 * Build a Fast Fail pipeline array from a declarative route configuration.
 *
 * @param method - HTTP method (e.g. 'GET', 'POST')
 * @param routeConfig - Per-route configuration
 * @param defaults - Router-level defaults for each key
 * @returns Composed pipeline array suitable for auto-wrap
 */
declare function buildPipeline<A extends object = Record<string, unknown>>(method: string, routeConfig: RouteConfig<A>, defaults?: RouteConfigDefaults): any[];

export default buildPipeline;

export type {RouteConfig};
