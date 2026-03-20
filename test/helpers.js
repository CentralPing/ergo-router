/**
 * @fileoverview Shared test helpers for ergo-router unit and functional tests.
 */
import http from 'node:http';
import {EventEmitter} from 'node:events';
import {fetch} from 'undici';

export {fetch};

/**
 * Create a minimal HTTP request-like object for module tests.
 *
 * @param {object} [overrides]
 * @returns {object}
 */
export function createMockReq(overrides = {}) {
  const req = Object.assign(new EventEmitter(), {
    method: 'GET',
    url: '/',
    headers: {},
    socket: {encrypted: false, remoteAddress: '127.0.0.1'},
    destroy: () => {}
  });

  const normalized = overrides.headers
    ? {
        ...overrides,
        headers: Object.fromEntries(
          Object.entries(overrides.headers).map(([k, v]) => [k.toLowerCase(), v])
        )
      }
    : overrides;

  return Object.assign(req, normalized);
}

/**
 * Create a minimal HTTP response-like object for module tests.
 *
 * @param {object} [overrides]
 * @returns {object}
 */
export function createMockRes(overrides = {}) {
  const headers = {};
  const res = Object.assign(new EventEmitter(), {
    statusCode: 200,
    writableEnded: false,
    writable: true,
    _headers: headers,
    _body: null,
    setHeader(name, value) {
      headers[name.toLowerCase()] = value;
    },
    getHeader(name) {
      return headers[name.toLowerCase()];
    },
    removeHeader(name) {
      delete headers[name.toLowerCase()];
    },
    clearHeader(name) {
      delete headers[name.toLowerCase()];
    },
    getHeaders() {
      return {...headers};
    },
    write() {
      return true;
    },
    end(chunk) {
      if (chunk != null) {
        this._body = typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString();
      }
      this.writableEnded = true;
      this.emit('finish');
      return this;
    }
  });

  return Object.assign(res, overrides);
}

/**
 * Start a real Node.js HTTP server and return baseUrl + close().
 *
 * @param {function} handler - (req, res) => void
 * @returns {Promise<{baseUrl: string, close: function}>}
 */
export function setupServer(handler) {
  return new Promise((resolve, reject) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const {port} = server.address();
      resolve({
        baseUrl: `http://127.0.0.1:${port}`,
        close: () => {
          server.closeAllConnections();
          return new Promise(res => server.close(res));
        }
      });
    });
    server.once('error', reject);
  });
}
