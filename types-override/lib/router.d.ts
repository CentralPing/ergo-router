import type {RouterOptions, Router} from '../ergo-router.js';

/**
 * Create a new Ergo router instance.
 *
 * @param options - Router configuration
 * @returns A router instance with typed route methods
 */
declare function createRouter(options?: RouterOptions): Router;

export default createRouter;
