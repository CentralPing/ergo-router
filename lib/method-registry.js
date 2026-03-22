/**
 * @fileoverview HTTP method registry for tracking routes by path.
 *
 * Maintains a `Map<path, Set<method>>` used by the router to:
 * - Generate `Allow` headers for `405 Method Not Allowed` responses
 * - Produce `OPTIONS` responses with the correct list of accepted methods
 * - Detect whether a path is known (enabling 405 vs 404 differentiation)
 *
 * @module lib/method-registry
 * @version 0.1.0
 * @since 0.1.0
 */

/**
 * Tracks which HTTP methods are registered for each path pattern.
 * Used for 405 Method Not Allowed + Allow header generation and
 * automatic OPTIONS responses.
 */
class MethodRegistry {
  constructor() {
    this._paths = new Map();
  }

  /**
   * Register a method for a path pattern.
   * @param {string} method - HTTP method (uppercase)
   * @param {string} path - Path pattern as registered with find-my-way
   */
  add(method, path) {
    let methods = this._paths.get(path);
    if (!methods) {
      methods = new Set();
      this._paths.set(path, methods);
    }
    methods.add(method.toUpperCase());
  }

  /**
   * Get all registered methods for a path pattern.
   * @param {string} path - Path pattern
   * @returns {Set<string>} Set of uppercase HTTP method names
   */
  getAllowed(path) {
    return this._paths.get(path) ?? new Set();
  }

  /**
   * Check if a path pattern has any registered methods.
   * @param {string} path - Path pattern
   * @returns {boolean}
   */
  has(path) {
    return this._paths.has(path);
  }
}

export default MethodRegistry;
