import type {RouteConfig, RouteConfigDefaults} from '../ergo-router.js';

/**
 * Build a Fast Fail pipeline array from a declarative route configuration.
 *
 * @param method - HTTP method (e.g. 'GET', 'POST')
 * @param routeConfig - Per-route configuration
 * @param defaults - Router-level defaults for each key
 * @returns Composed pipeline array suitable for auto-wrap
 */
declare function buildPipeline(method: string, routeConfig: RouteConfig, defaults?: RouteConfigDefaults): any[];

export default buildPipeline;

export type {RouteConfig};
