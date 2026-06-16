import type {Router, GenerateOpenAPIOptions, OpenAPIDocument} from '../ergo-router.js';

/**
 * Generate an OpenAPI 3.1 specification document from a router's registered routes.
 *
 * @param router - An ergo-router instance created by `createRouter()`
 * @param options - OpenAPI document options
 * @returns OpenAPI 3.1 specification document
 */
declare function generateOpenAPI(router: Router, options?: GenerateOpenAPIOptions): OpenAPIDocument;

export default generateOpenAPI;
