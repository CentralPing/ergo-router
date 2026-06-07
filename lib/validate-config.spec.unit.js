/**
 * @fileoverview Boundary tests for lib/validate-config.
 *
 * Tests Levenshtein distance computation, suggestion finding, key validation,
 * route config validation (valid/unknown/missing-execute/non-function-execute),
 * defaults validation, router options validation, and strict vs lenient modes.
 */
import {describe, it, mock} from 'node:test';
import assert from 'node:assert/strict';
import {
  levenshtein,
  findSuggestion,
  validateKeys,
  validateRouteConfig,
  validateDefaults,
  validateRouterOptions,
  PIPELINE_KEYS,
  ROUTE_OPTION_KEYS,
  ANNOTATION_KEYS,
  VALID_ROUTE_CONFIG_KEYS,
  VALID_DEFAULTS_KEYS,
  VALID_ROUTER_OPTIONS_KEYS
} from './validate-config.js';

describe('[Boundary] validate-config', () => {
  describe('levenshtein()', () => {
    it('returns 0 for identical strings', () => {
      assert.equal(levenshtein('validate', 'validate'), 0);
    });

    it('returns string length for empty vs non-empty', () => {
      assert.equal(levenshtein('', 'abc'), 3);
      assert.equal(levenshtein('xyz', ''), 3);
    });

    it('returns 0 for two empty strings', () => {
      assert.equal(levenshtein('', ''), 0);
    });

    it('computes single substitution', () => {
      assert.equal(levenshtein('cat', 'bat'), 1);
    });

    it('computes single insertion', () => {
      assert.equal(levenshtein('cat', 'cats'), 1);
    });

    it('computes single deletion', () => {
      assert.equal(levenshtein('cats', 'cat'), 1);
    });

    it('computes "validatte" → "validate" = 1 (insertion)', () => {
      assert.equal(levenshtein('validatte', 'validate'), 1);
    });

    it('computes "timeOut" → "timeout" = 1 (case substitution)', () => {
      assert.equal(levenshtein('timeOut', 'timeout'), 1);
    });

    it('computes "auth" → "authorization" = 9 (large distance)', () => {
      assert.equal(levenshtein('auth', 'authorization'), 9);
    });

    it('is commutative', () => {
      assert.equal(levenshtein('abc', 'xyz'), levenshtein('xyz', 'abc'));
    });
  });

  describe('findSuggestion()', () => {
    const keys = new Set(['validate', 'timeout', 'authorization', 'body']);

    it('finds a suggestion within distance threshold', () => {
      assert.equal(findSuggestion('validatte', keys), 'validate');
    });

    it('finds closest match when multiple are within threshold', () => {
      assert.equal(findSuggestion('timeOut', keys), 'timeout');
    });

    it('returns undefined when no key is within threshold', () => {
      assert.equal(findSuggestion('auth', keys), undefined);
    });

    it('returns undefined for completely unrelated key', () => {
      assert.equal(findSuggestion('xyzzy', keys), undefined);
    });

    it('returns exact match at distance 0', () => {
      assert.equal(findSuggestion('body', keys), 'body');
    });
  });

  describe('validateKeys()', () => {
    const validKeys = new Set(['alpha', 'beta', 'gamma']);

    it('does not throw for valid keys', () => {
      assert.doesNotThrow(() => {
        validateKeys({alpha: 1, beta: 2}, validKeys, 'test', true);
      });
    });

    it('throws for unknown keys in strict mode', () => {
      assert.throws(() => validateKeys({alpha: 1, delta: 2}, validKeys, 'test', true), {
        message: /Unknown config key "delta" in test/
      });
    });

    it('includes "did you mean?" when suggestion exists', () => {
      assert.throws(() => validateKeys({betta: 1}, validKeys, 'test', true), {
        message: /did you mean "beta"/
      });
    });

    it('omits "did you mean?" when no suggestion within threshold', () => {
      assert.throws(
        () => validateKeys({xyzzy: 1}, validKeys, 'test', true),
        err => {
          assert.match(err.message, /Unknown config key "xyzzy"/);
          assert.doesNotMatch(err.message, /did you mean/);
          return true;
        }
      );
    });

    it('warns instead of throwing in lenient mode', () => {
      const warnMock = mock.method(console, 'warn', () => {});
      try {
        validateKeys({delta: 1}, validKeys, 'test', false);
        assert.equal(warnMock.mock.calls.length, 1);
        assert.match(warnMock.mock.calls[0].arguments[0], /Unknown config key "delta"/);
      } finally {
        warnMock.mock.restore();
      }
    });

    it('does nothing for empty object', () => {
      assert.doesNotThrow(() => {
        validateKeys({}, validKeys, 'test', true);
      });
    });

    it('throws TypeError for null', () => {
      assert.throws(() => validateKeys(null, validKeys, 'test config', true), {
        name: 'TypeError',
        message: /Expected test config to be a plain object/
      });
    });

    it('throws TypeError for array', () => {
      assert.throws(() => validateKeys([], validKeys, 'test config', true), {
        name: 'TypeError',
        message: /Expected test config to be a plain object/
      });
    });

    it('throws TypeError for non-object primitives', () => {
      assert.throws(() => validateKeys('string', validKeys, 'test config', true), {
        name: 'TypeError',
        message: /Expected test config to be a plain object/
      });
    });
  });

  describe('validateRouteConfig()', () => {
    const noop = () => ({});

    it('passes for a valid config with execute', () => {
      assert.doesNotThrow(() => {
        validateRouteConfig({execute: noop, validate: {}}, 'GET', '/test', true);
      });
    });

    it('passes for a config using all valid keys', () => {
      const config = {execute: noop};
      for (const key of PIPELINE_KEYS) {
        if (key === 'execute') continue;
        config[key] = key === 'use' ? [() => ({})] : {};
      }
      config.send = {};
      config.noSend = false;
      config.catchHandler = () => {};
      assert.doesNotThrow(() => {
        validateRouteConfig(config, 'POST', '/items', true);
      });
    });

    it('throws for unknown keys', () => {
      assert.throws(
        () => validateRouteConfig({execute: noop, validatte: {}}, 'GET', '/test', true),
        {message: /Unknown config key "validatte" in route config for GET \/test/}
      );
    });

    it('throws for missing execute', () => {
      assert.throws(() => validateRouteConfig({validate: {}}, 'POST', '/items', true), {
        message: /Missing "execute" function in route config for POST \/items/
      });
    });

    it('throws for non-function execute', () => {
      assert.throws(
        () => validateRouteConfig({execute: 'not-a-function'}, 'PUT', '/items/:id', true),
        {
          message:
            /Invalid "execute" in route config for PUT \/items\/:id.*expected a function.*got string/
        }
      );
    });

    it('throws for execute: null', () => {
      assert.throws(() => validateRouteConfig({execute: null}, 'GET', '/test', true), {
        message: /Invalid "execute"/
      });
    });

    it('throws for execute: true', () => {
      assert.throws(() => validateRouteConfig({execute: true}, 'GET', '/test', true), {
        message: /Invalid "execute"/
      });
    });

    it('passes for use as an array', () => {
      assert.doesNotThrow(() => {
        validateRouteConfig({execute: () => ({}), use: [() => ({})]}, 'GET', '/test', true);
      });
    });

    it('passes for use: false', () => {
      assert.doesNotThrow(() => {
        validateRouteConfig({execute: () => ({}), use: false}, 'GET', '/test', true);
      });
    });

    it('throws for use: true', () => {
      assert.throws(
        () => validateRouteConfig({execute: () => ({}), use: true}, 'GET', '/test', true),
        {
          message:
            /Invalid "use" in route config for GET \/test.*expected an array or false.*got boolean/
        }
      );
    });

    it('throws for use as a non-array object', () => {
      assert.throws(
        () => validateRouteConfig({execute: () => ({}), use: {}}, 'POST', '/items', true),
        {message: /Invalid "use".*expected an array or false.*got object/}
      );
    });

    it('throws for use as a string', () => {
      assert.throws(
        () => validateRouteConfig({execute: () => ({}), use: 'mw'}, 'GET', '/test', true),
        {message: /Invalid "use".*expected an array or false.*got string/}
      );
    });

    it('accepts openapi as a plain object', () => {
      assert.doesNotThrow(() =>
        validateRouteConfig({execute: () => ({}), openapi: {summary: 'Test'}}, 'GET', '/test', true)
      );
    });

    it('throws for openapi: true', () => {
      assert.throws(
        () => validateRouteConfig({execute: () => ({}), openapi: true}, 'GET', '/test', true),
        {message: /Invalid "openapi".*expected a plain object.*got boolean/}
      );
    });

    it('throws for openapi: "string"', () => {
      assert.throws(
        () => validateRouteConfig({execute: () => ({}), openapi: 'bad'}, 'GET', '/test', true),
        {message: /Invalid "openapi".*expected a plain object.*got string/}
      );
    });

    it('throws for openapi: null', () => {
      assert.throws(
        () => validateRouteConfig({execute: () => ({}), openapi: null}, 'GET', '/test', true),
        {message: /Invalid "openapi".*expected a plain object.*got null/}
      );
    });

    it('throws for openapi as an array', () => {
      assert.throws(
        () => validateRouteConfig({execute: () => ({}), openapi: []}, 'GET', '/test', true),
        {message: /Invalid "openapi".*expected a plain object.*got array/}
      );
    });

    it('throws for openapi as a class instance', () => {
      assert.throws(
        () => validateRouteConfig({execute: () => ({}), openapi: new Map()}, 'GET', '/test', true),
        {message: /Invalid "openapi".*expected a plain object.*got object/}
      );
    });

    it('accepts openapi as a null-prototype object', () => {
      const annotations = Object.create(null);
      annotations.summary = 'Test';
      assert.doesNotThrow(() =>
        validateRouteConfig({execute: () => ({}), openapi: annotations}, 'GET', '/test', true)
      );
    });

    describe('middleware value type validation', () => {
      it('rejects string values', () => {
        assert.throws(
          () => validateRouteConfig({execute: noop, timeout: 'five seconds'}, 'GET', '/test', true),
          {
            message:
              /Invalid "timeout" in route config for GET \/test.*expected object or boolean.*got string/
          }
        );
      });

      it('rejects number values', () => {
        assert.throws(
          () => validateRouteConfig({execute: noop, rateLimit: 42}, 'POST', '/items', true),
          {
            message:
              /Invalid "rateLimit" in route config for POST \/items.*expected object or boolean.*got number/
          }
        );
      });

      it('rejects array values', () => {
        assert.throws(
          () => validateRouteConfig({execute: noop, validate: [1, 2, 3]}, 'GET', '/test', true),
          {
            message:
              /Invalid "validate" in route config for GET \/test.*expected object or boolean.*got array/
          }
        );
      });

      it('rejects null values', () => {
        assert.throws(
          () => validateRouteConfig({execute: noop, accepts: null}, 'GET', '/test', true),
          {
            message:
              /Invalid "accepts" in route config for GET \/test.*expected object or boolean.*got null/
          }
        );
      });

      it('rejects function values', () => {
        assert.throws(
          () => validateRouteConfig({execute: noop, compress: () => {}}, 'GET', '/test', true),
          {
            message:
              /Invalid "compress" in route config for GET \/test.*expected object or boolean.*got function/
          }
        );
      });

      it('accepts true for middleware keys', () => {
        assert.doesNotThrow(() => {
          validateRouteConfig({execute: noop, timeout: true}, 'GET', '/test', true);
        });
      });

      it('accepts false for middleware keys', () => {
        assert.doesNotThrow(() => {
          validateRouteConfig({execute: noop, timeout: false}, 'GET', '/test', true);
        });
      });

      it('accepts objects for middleware keys', () => {
        assert.doesNotThrow(() => {
          validateRouteConfig({execute: noop, timeout: {ms: 5000}}, 'GET', '/test', true);
        });
      });

      it('accepts empty objects for middleware keys', () => {
        assert.doesNotThrow(() => {
          validateRouteConfig({execute: noop, compress: {}}, 'GET', '/test', true);
        });
      });

      it('skips custom-validated keys (execute, use, openapi)', () => {
        assert.throws(
          () => validateRouteConfig({execute: 'not-a-function'}, 'GET', '/test', true),
          {message: /Invalid "execute".*expected a function/}
        );
      });

      it('throws regardless of strict mode', () => {
        const warnMock = mock.method(console, 'warn', () => {});
        try {
          assert.throws(
            () => validateRouteConfig({execute: noop, timeout: 'bad'}, 'GET', '/test', false),
            {message: /Invalid "timeout"/}
          );
        } finally {
          warnMock.mock.restore();
        }
      });

      it('error message includes key name, method, path, expected type, and actual type', () => {
        assert.throws(
          () => validateRouteConfig({execute: noop, logger: 99}, 'DELETE', '/users/:id', true),
          err => {
            assert.match(err.message, /Invalid "logger"/);
            assert.match(err.message, /route config for DELETE \/users\/:id/);
            assert.match(err.message, /expected object or boolean/);
            assert.match(err.message, /got number/);
            return true;
          }
        );
      });
    });

    describe('route option value type validation', () => {
      it('rejects send: string', () => {
        assert.throws(
          () => validateRouteConfig({execute: noop, send: 'fast'}, 'GET', '/test', true),
          {message: /Invalid "send" in route config for GET \/test.*expected object.*got string/}
        );
      });

      it('rejects send: null', () => {
        assert.throws(
          () => validateRouteConfig({execute: noop, send: null}, 'GET', '/test', true),
          {message: /Invalid "send".*expected object.*got null/}
        );
      });

      it('rejects send: array', () => {
        assert.throws(() => validateRouteConfig({execute: noop, send: []}, 'GET', '/test', true), {
          message: /Invalid "send".*expected object.*got array/
        });
      });

      it('accepts send: object', () => {
        assert.doesNotThrow(() => {
          validateRouteConfig({execute: noop, send: {prefer: true}}, 'GET', '/test', true);
        });
      });

      it('rejects noSend: string', () => {
        assert.throws(
          () => validateRouteConfig({execute: noop, noSend: 'yes'}, 'GET', '/test', true),
          {message: /Invalid "noSend" in route config for GET \/test.*expected boolean.*got string/}
        );
      });

      it('rejects noSend: object', () => {
        assert.throws(
          () => validateRouteConfig({execute: noop, noSend: {}}, 'GET', '/test', true),
          {message: /Invalid "noSend".*expected boolean.*got object/}
        );
      });

      it('accepts noSend: true', () => {
        assert.doesNotThrow(() => {
          validateRouteConfig({execute: noop, noSend: true}, 'GET', '/test', true);
        });
      });

      it('accepts noSend: false', () => {
        assert.doesNotThrow(() => {
          validateRouteConfig({execute: noop, noSend: false}, 'GET', '/test', true);
        });
      });

      it('rejects catchHandler: object', () => {
        assert.throws(
          () => validateRouteConfig({execute: noop, catchHandler: {}}, 'GET', '/test', true),
          {
            message:
              /Invalid "catchHandler" in route config for GET \/test.*expected a function.*got object/
          }
        );
      });

      it('rejects catchHandler: string', () => {
        assert.throws(
          () => validateRouteConfig({execute: noop, catchHandler: 'handler'}, 'GET', '/test', true),
          {message: /Invalid "catchHandler".*expected a function.*got string/}
        );
      });

      it('accepts catchHandler: function', () => {
        assert.doesNotThrow(() => {
          validateRouteConfig({execute: noop, catchHandler: () => {}}, 'GET', '/test', true);
        });
      });
    });

    it('validates unknown keys before execute check (first unknown throws)', () => {
      assert.throws(() => validateRouteConfig({bogus: 1}, 'GET', '/test', true), {
        message: /Unknown config key "bogus"/
      });
    });

    it('in lenient mode, warns for unknown keys but still throws for missing execute', () => {
      const warnMock = mock.method(console, 'warn', () => {});
      try {
        assert.throws(() => validateRouteConfig({bogus: 1}, 'GET', '/test', false), {
          message: /Missing "execute"/
        });
        assert.equal(warnMock.mock.calls.length, 1);
      } finally {
        warnMock.mock.restore();
      }
    });
  });

  describe('validateDefaults()', () => {
    it('passes for valid defaults keys', () => {
      assert.doesNotThrow(() => {
        validateDefaults({validate: {}, timeout: {}, accepts: {}}, true);
      });
    });

    it('throws for "execute" in defaults', () => {
      assert.throws(() => validateDefaults({execute: () => {}}, true), {
        message: /Unknown config key "execute" in router defaults/
      });
    });

    it('throws for unknown defaults keys', () => {
      assert.throws(() => validateDefaults({validatte: {}}, true), {
        message: /Unknown config key "validatte" in router defaults/
      });
    });

    it('passes for use as an array in defaults', () => {
      assert.doesNotThrow(() => {
        validateDefaults({use: [() => ({})]}, true);
      });
    });

    it('passes for use: false in defaults', () => {
      assert.doesNotThrow(() => {
        validateDefaults({use: false}, true);
      });
    });

    it('throws for use: true in defaults', () => {
      assert.throws(() => validateDefaults({use: true}, true), {
        message: /Invalid "use" in router defaults.*expected an array or false.*got boolean/
      });
    });

    it('throws for non-array use in defaults', () => {
      assert.throws(() => validateDefaults({use: {}}, true), {
        message: /Invalid "use" in router defaults.*expected an array or false.*got object/
      });
    });

    describe('middleware value type validation', () => {
      it('rejects string values', () => {
        assert.throws(() => validateDefaults({timeout: 'five seconds'}, true), {
          message: /Invalid "timeout" in router defaults.*expected object or boolean.*got string/
        });
      });

      it('rejects number values', () => {
        assert.throws(() => validateDefaults({rateLimit: 42}, true), {
          message: /Invalid "rateLimit" in router defaults.*expected object or boolean.*got number/
        });
      });

      it('rejects null values', () => {
        assert.throws(() => validateDefaults({accepts: null}, true), {
          message: /Invalid "accepts" in router defaults.*expected object or boolean.*got null/
        });
      });

      it('rejects array values', () => {
        assert.throws(() => validateDefaults({validate: [1, 2, 3]}, true), {
          message: /Invalid "validate" in router defaults.*expected object or boolean.*got array/
        });
      });

      it('accepts true for middleware keys', () => {
        assert.doesNotThrow(() => {
          validateDefaults({timeout: true}, true);
        });
      });

      it('accepts false for middleware keys', () => {
        assert.doesNotThrow(() => {
          validateDefaults({timeout: false}, true);
        });
      });

      it('accepts objects for middleware keys', () => {
        assert.doesNotThrow(() => {
          validateDefaults({timeout: {ms: 5000}}, true);
        });
      });

      it('throws regardless of strict mode', () => {
        assert.throws(() => validateDefaults({timeout: 'bad'}, false), {
          message: /Invalid "timeout"/
        });
      });
    });

    it('warns in lenient mode', () => {
      const warnMock = mock.method(console, 'warn', () => {});
      try {
        validateDefaults({bogus: 1}, false);
        assert.equal(warnMock.mock.calls.length, 1);
      } finally {
        warnMock.mock.restore();
      }
    });
  });

  describe('validateRouterOptions()', () => {
    it('passes for valid router options', () => {
      assert.doesNotThrow(() => {
        validateRouterOptions(
          {transport: {}, strictPatch: true, strictBody: true, strict: true, defaults: {}},
          true
        );
      });
    });

    it('throws for unknown router options', () => {
      assert.throws(() => validateRouterOptions({trasport: {}}, true), {
        message: /Unknown config key "trasport" in router options.*did you mean "transport"/
      });
    });

    it('warns in lenient mode', () => {
      const warnMock = mock.method(console, 'warn', () => {});
      try {
        validateRouterOptions({bogus: 1}, false);
        assert.equal(warnMock.mock.calls.length, 1);
      } finally {
        warnMock.mock.restore();
      }
    });

    describe('value type validation', () => {
      it('rejects transport: string', () => {
        assert.throws(() => validateRouterOptions({transport: 'http'}, true), {
          message: /Invalid "transport" in router options.*expected object.*got string/
        });
      });

      it('rejects transport: null', () => {
        assert.throws(() => validateRouterOptions({transport: null}, true), {
          message: /Invalid "transport" in router options.*expected object.*got null/
        });
      });

      it('rejects transport: array', () => {
        assert.throws(() => validateRouterOptions({transport: []}, true), {
          message: /Invalid "transport" in router options.*expected object.*got array/
        });
      });

      it('accepts transport: object', () => {
        assert.doesNotThrow(() => {
          validateRouterOptions({transport: {}}, true);
        });
      });

      it('rejects strictPatch: string', () => {
        assert.throws(() => validateRouterOptions({strictPatch: 'yes'}, true), {
          message: /Invalid "strictPatch" in router options.*expected boolean.*got string/
        });
      });

      it('rejects strictBody: number', () => {
        assert.throws(() => validateRouterOptions({strictBody: 1}, true), {
          message: /Invalid "strictBody" in router options.*expected boolean.*got number/
        });
      });

      it('rejects strict: object', () => {
        assert.throws(() => validateRouterOptions({strict: {}}, true), {
          message: /Invalid "strict" in router options.*expected boolean.*got object/
        });
      });

      it('rejects debug: string', () => {
        assert.throws(() => validateRouterOptions({debug: 'yes'}, true), {
          message: /Invalid "debug" in router options.*expected boolean.*got string/
        });
      });

      it('accepts boolean values for boolean option keys', () => {
        assert.doesNotThrow(() => {
          validateRouterOptions(
            {strictPatch: true, strictBody: false, strict: true, debug: false},
            true
          );
        });
      });

      it('rejects send: string', () => {
        assert.throws(() => validateRouterOptions({send: 'fast'}, true), {
          message: /Invalid "send" in router options.*expected object.*got string/
        });
      });

      it('rejects send: null', () => {
        assert.throws(() => validateRouterOptions({send: null}, true), {
          message: /Invalid "send" in router options.*expected object.*got null/
        });
      });

      it('accepts send: object', () => {
        assert.doesNotThrow(() => {
          validateRouterOptions({send: {}}, true);
        });
      });

      it('rejects catchHandler: object', () => {
        assert.throws(() => validateRouterOptions({catchHandler: {}}, true), {
          message: /Invalid "catchHandler" in router options.*expected a function.*got object/
        });
      });

      it('rejects catchHandler: string', () => {
        assert.throws(() => validateRouterOptions({catchHandler: 'handler'}, true), {
          message: /Invalid "catchHandler" in router options.*expected a function.*got string/
        });
      });

      it('accepts catchHandler: function', () => {
        assert.doesNotThrow(() => {
          validateRouterOptions({catchHandler: () => {}}, true);
        });
      });

      it('rejects defaults: string', () => {
        assert.throws(() => validateRouterOptions({defaults: 'bad'}, true), {
          message: /Invalid "defaults" in router options.*expected object.*got string/
        });
      });

      it('rejects defaults: null', () => {
        assert.throws(() => validateRouterOptions({defaults: null}, true), {
          message: /Invalid "defaults" in router options.*expected object.*got null/
        });
      });

      it('rejects defaults: array', () => {
        assert.throws(() => validateRouterOptions({defaults: []}, true), {
          message: /Invalid "defaults" in router options.*expected object.*got array/
        });
      });

      it('rejects timing: string', () => {
        assert.throws(() => validateRouterOptions({timing: 'yes'}, true), {
          message: /Invalid "timing" in router options.*expected boolean or object.*got string/
        });
      });

      it('rejects timing: null', () => {
        assert.throws(() => validateRouterOptions({timing: null}, true), {
          message: /Invalid "timing" in router options.*expected boolean or object.*got null/
        });
      });

      it('rejects timing: array', () => {
        assert.throws(() => validateRouterOptions({timing: []}, true), {
          message: /Invalid "timing" in router options.*expected boolean or object.*got array/
        });
      });

      it('accepts timing: true', () => {
        assert.doesNotThrow(() => {
          validateRouterOptions({timing: true}, true);
        });
      });

      it('accepts timing: false', () => {
        assert.doesNotThrow(() => {
          validateRouterOptions({timing: false}, true);
        });
      });

      it('accepts timing: object', () => {
        assert.doesNotThrow(() => {
          validateRouterOptions({timing: {header: 'x-time', precision: 2}}, true);
        });
      });

      it('accepts defaults: object', () => {
        assert.doesNotThrow(() => {
          validateRouterOptions({defaults: {}}, true);
        });
      });

      it('throws regardless of strict mode', () => {
        assert.throws(() => validateRouterOptions({debug: 'yes'}, false), {
          message: /Invalid "debug"/
        });
      });
    });
  });

  describe('key set consistency', () => {
    it('PIPELINE_KEYS matches the exact set of pipeline-builder config keys', () => {
      const expected = new Set([
        'logger',
        'accepts',
        'authorization',
        'body',
        'cacheControl',
        'compress',
        'cookie',
        'csrf',
        'execute',
        'idempotency',
        'jsonApiQuery',
        'paginate',
        'preconditionRequired',
        'prefer',
        'rateLimit',
        'securityHeaders',
        'timeout',
        'tracing',
        'url',
        'use',
        'validate'
      ]);
      assert.deepEqual(PIPELINE_KEYS, expected);
    });

    it('ROUTE_OPTION_KEYS matches the exact set of extractRouteOpts keys', () => {
      const expected = new Set(['send', 'noSend', 'catchHandler']);
      assert.deepEqual(ROUTE_OPTION_KEYS, expected);
    });

    it('VALID_ROUTER_OPTIONS_KEYS matches the exact set of createRouter() option keys', () => {
      const expected = new Set([
        'transport',
        'strictPatch',
        'strictBody',
        'strict',
        'send',
        'catchHandler',
        'defaults',
        'debug',
        'timing'
      ]);
      assert.deepEqual(VALID_ROUTER_OPTIONS_KEYS, expected);
    });

    it('VALID_ROUTE_CONFIG_KEYS is the union of PIPELINE_KEYS, ROUTE_OPTION_KEYS, and ANNOTATION_KEYS', () => {
      const expected = new Set([...PIPELINE_KEYS, ...ROUTE_OPTION_KEYS, ...ANNOTATION_KEYS]);
      assert.deepEqual(VALID_ROUTE_CONFIG_KEYS, expected);
    });

    it('VALID_DEFAULTS_KEYS is PIPELINE_KEYS minus execute', () => {
      const expected = new Set([...PIPELINE_KEYS].filter(k => k !== 'execute'));
      assert.deepEqual(VALID_DEFAULTS_KEYS, expected);
    });
  });
});
