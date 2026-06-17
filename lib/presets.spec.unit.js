/**
 * @fileoverview Boundary tests for lib/presets.
 *
 * Validates shape, deep immutability, and spread-override semantics of the
 * exported presets namespace.
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {presets} from './presets.js';

describe('[Boundary] presets', () => {
  describe('namespace shape', () => {
    it('exports a presets object with jsonApi property', () => {
      assert.equal(typeof presets, 'object');
      assert.ok(Object.hasOwn(presets, 'jsonApi'));
    });

    it('jsonApi has transport and defaults keys', () => {
      assert.ok(Object.hasOwn(presets.jsonApi, 'transport'));
      assert.ok(Object.hasOwn(presets.jsonApi, 'defaults'));
    });

    it('transport has requestId and security keys', () => {
      assert.ok(Object.hasOwn(presets.jsonApi.transport, 'requestId'));
      assert.ok(Object.hasOwn(presets.jsonApi.transport, 'security'));
    });

    it('transport.requestId is an empty object', () => {
      assert.deepEqual(presets.jsonApi.transport.requestId, {});
    });

    it('transport.security is an empty object', () => {
      assert.deepEqual(presets.jsonApi.transport.security, {});
    });

    it('defaults has accepts key with types array', () => {
      assert.ok(Object.hasOwn(presets.jsonApi.defaults, 'accepts'));
      assert.deepEqual(presets.jsonApi.defaults.accepts.types, ['application/json']);
    });

    it('defaults has timeout set to empty object (ergo built-in defaults)', () => {
      assert.ok(Object.hasOwn(presets.jsonApi.defaults, 'timeout'));
      assert.deepEqual(presets.jsonApi.defaults.timeout, {});
    });

    it('does not include auth, cors, or rateLimit', () => {
      assert.equal(Object.hasOwn(presets.jsonApi.transport, 'cors'), false);
      assert.equal(Object.hasOwn(presets.jsonApi.transport, 'rateLimit'), false);
      assert.equal(Object.hasOwn(presets.jsonApi.defaults, 'authorization'), false);
    });
  });

  describe('deep immutability', () => {
    it('presets namespace is frozen', () => {
      assert.ok(Object.isFrozen(presets));
    });

    it('jsonApi is frozen', () => {
      assert.ok(Object.isFrozen(presets.jsonApi));
    });

    it('transport is frozen', () => {
      assert.ok(Object.isFrozen(presets.jsonApi.transport));
    });

    it('transport.requestId is frozen', () => {
      assert.ok(Object.isFrozen(presets.jsonApi.transport.requestId));
    });

    it('transport.security is frozen', () => {
      assert.ok(Object.isFrozen(presets.jsonApi.transport.security));
    });

    it('defaults is frozen', () => {
      assert.ok(Object.isFrozen(presets.jsonApi.defaults));
    });

    it('defaults.accepts is frozen', () => {
      assert.ok(Object.isFrozen(presets.jsonApi.defaults.accepts));
    });

    it('defaults.accepts.types array is frozen', () => {
      assert.ok(Object.isFrozen(presets.jsonApi.defaults.accepts.types));
    });

    it('defaults.timeout is frozen', () => {
      assert.ok(Object.isFrozen(presets.jsonApi.defaults.timeout));
    });

    it('mutation attempts throw in strict mode', () => {
      assert.throws(() => {
        presets.jsonApi = {};
      }, TypeError);
      assert.throws(() => {
        presets.jsonApi.transport = {};
      }, TypeError);
      assert.throws(() => {
        presets.jsonApi.defaults.accepts.types.push('text/html');
      }, TypeError);
    });
  });

  describe('spread-override semantics', () => {
    it('shallow spread allows overriding transport', () => {
      const merged = {...presets.jsonApi, transport: {cors: {origin: '*'}}};
      assert.deepEqual(merged.transport, {cors: {origin: '*'}});
      assert.deepEqual(merged.defaults, presets.jsonApi.defaults);
    });

    it('shallow spread allows overriding defaults', () => {
      const merged = {...presets.jsonApi, defaults: {authorization: true}};
      assert.deepEqual(merged.defaults, {authorization: true});
      assert.deepEqual(merged.transport, presets.jsonApi.transport);
    });

    it('nested spread preserves preset defaults alongside overrides', () => {
      const merged = {
        ...presets.jsonApi,
        defaults: {...presets.jsonApi.defaults, authorization: true}
      };
      assert.deepEqual(merged.defaults.accepts, {types: ['application/json']});
      assert.deepEqual(merged.defaults.timeout, {});
      assert.equal(merged.defaults.authorization, true);
    });

    it('nested spread allows overriding timeout', () => {
      const merged = {
        ...presets.jsonApi,
        defaults: {...presets.jsonApi.defaults, timeout: {ms: 5000}}
      };
      assert.deepEqual(merged.defaults.timeout, {ms: 5000});
      assert.deepEqual(merged.defaults.accepts, {types: ['application/json']});
    });

    it('nested spread allows disabling timeout', () => {
      const merged = {
        ...presets.jsonApi,
        defaults: {...presets.jsonApi.defaults, timeout: false}
      };
      assert.equal(merged.defaults.timeout, false);
    });

    it('spread result is a new mutable object', () => {
      const merged = {...presets.jsonApi};
      assert.equal(Object.isFrozen(merged), false);
    });
  });
});

describe('[Boundary] presets.sse', () => {
  describe('namespace shape', () => {
    it('exports a presets object with sse property', () => {
      assert.ok(Object.hasOwn(presets, 'sse'));
    });

    it('sse has transport and defaults keys', () => {
      assert.ok(Object.hasOwn(presets.sse, 'transport'));
      assert.ok(Object.hasOwn(presets.sse, 'defaults'));
    });

    it('transport has requestId and security keys', () => {
      assert.ok(Object.hasOwn(presets.sse.transport, 'requestId'));
      assert.ok(Object.hasOwn(presets.sse.transport, 'security'));
    });

    it('transport.requestId is an empty object', () => {
      assert.deepEqual(presets.sse.transport.requestId, {});
    });

    it('transport.security is an empty object', () => {
      assert.deepEqual(presets.sse.transport.security, {});
    });

    it('defaults has compress set to false', () => {
      assert.equal(presets.sse.defaults.compress, false);
    });

    it('defaults has timeout set to false', () => {
      assert.equal(presets.sse.defaults.timeout, false);
    });

    it('defaults has accepts with text/event-stream', () => {
      assert.ok(Object.hasOwn(presets.sse.defaults, 'accepts'));
      assert.deepEqual(presets.sse.defaults.accepts.types, ['text/event-stream']);
    });

    it('does not include auth, cors, or rateLimit', () => {
      assert.equal(Object.hasOwn(presets.sse.transport, 'cors'), false);
      assert.equal(Object.hasOwn(presets.sse.transport, 'rateLimit'), false);
      assert.equal(Object.hasOwn(presets.sse.defaults, 'authorization'), false);
    });

    it('does not include noSend in defaults', () => {
      assert.equal(Object.hasOwn(presets.sse.defaults, 'noSend'), false);
    });
  });

  describe('deep immutability', () => {
    it('sse is frozen', () => {
      assert.ok(Object.isFrozen(presets.sse));
    });

    it('transport is frozen', () => {
      assert.ok(Object.isFrozen(presets.sse.transport));
    });

    it('transport.requestId is frozen', () => {
      assert.ok(Object.isFrozen(presets.sse.transport.requestId));
    });

    it('transport.security is frozen', () => {
      assert.ok(Object.isFrozen(presets.sse.transport.security));
    });

    it('defaults is frozen', () => {
      assert.ok(Object.isFrozen(presets.sse.defaults));
    });

    it('defaults.accepts is frozen', () => {
      assert.ok(Object.isFrozen(presets.sse.defaults.accepts));
    });

    it('defaults.accepts.types array is frozen', () => {
      assert.ok(Object.isFrozen(presets.sse.defaults.accepts.types));
    });

    it('mutation attempts throw in strict mode', () => {
      assert.throws(() => {
        presets.sse = {};
      }, TypeError);
      assert.throws(() => {
        presets.sse.transport = {};
      }, TypeError);
      assert.throws(() => {
        presets.sse.defaults.accepts.types.push('text/html');
      }, TypeError);
    });
  });

  describe('spread-override semantics', () => {
    it('shallow spread allows overriding transport', () => {
      const merged = {...presets.sse, transport: {cors: {origin: '*'}}};
      assert.deepEqual(merged.transport, {cors: {origin: '*'}});
      assert.deepEqual(merged.defaults, presets.sse.defaults);
    });

    it('shallow spread allows overriding defaults', () => {
      const merged = {...presets.sse, defaults: {timeout: {ms: 5000}}};
      assert.deepEqual(merged.defaults, {timeout: {ms: 5000}});
      assert.deepEqual(merged.transport, presets.sse.transport);
    });

    it('nested spread preserves preset defaults alongside overrides', () => {
      const merged = {
        ...presets.sse,
        defaults: {...presets.sse.defaults, logger: true}
      };
      assert.equal(merged.defaults.compress, false);
      assert.equal(merged.defaults.timeout, false);
      assert.deepEqual(merged.defaults.accepts, {types: ['text/event-stream']});
      assert.equal(merged.defaults.logger, true);
    });

    it('spread result is a new mutable object', () => {
      const merged = {...presets.sse};
      assert.equal(Object.isFrozen(merged), false);
    });
  });
});

describe('[Boundary] presets.webhooks', () => {
  describe('namespace shape', () => {
    it('exports a presets object with webhooks property', () => {
      assert.ok(Object.hasOwn(presets, 'webhooks'));
    });

    it('webhooks has transport and defaults keys', () => {
      assert.ok(Object.hasOwn(presets.webhooks, 'transport'));
      assert.ok(Object.hasOwn(presets.webhooks, 'defaults'));
    });

    it('transport has requestId and security keys', () => {
      assert.ok(Object.hasOwn(presets.webhooks.transport, 'requestId'));
      assert.ok(Object.hasOwn(presets.webhooks.transport, 'security'));
    });

    it('transport.requestId is an empty object', () => {
      assert.deepEqual(presets.webhooks.transport.requestId, {});
    });

    it('transport.security is an empty object', () => {
      assert.deepEqual(presets.webhooks.transport.security, {});
    });

    it('defaults has accepts with application/json', () => {
      assert.ok(Object.hasOwn(presets.webhooks.defaults, 'accepts'));
      assert.deepEqual(presets.webhooks.defaults.accepts.types, ['application/json']);
    });

    it('defaults has idempotency with required: true', () => {
      assert.ok(Object.hasOwn(presets.webhooks.defaults, 'idempotency'));
      assert.deepEqual(presets.webhooks.defaults.idempotency, {required: true});
    });

    it('defaults has timeout set to empty object (ergo built-in defaults)', () => {
      assert.ok(Object.hasOwn(presets.webhooks.defaults, 'timeout'));
      assert.deepEqual(presets.webhooks.defaults.timeout, {});
    });

    it('does not include auth, cors, or rateLimit', () => {
      assert.equal(Object.hasOwn(presets.webhooks.transport, 'cors'), false);
      assert.equal(Object.hasOwn(presets.webhooks.transport, 'rateLimit'), false);
      assert.equal(Object.hasOwn(presets.webhooks.defaults, 'authorization'), false);
    });
  });

  describe('deep immutability', () => {
    it('webhooks is frozen', () => {
      assert.ok(Object.isFrozen(presets.webhooks));
    });

    it('transport is frozen', () => {
      assert.ok(Object.isFrozen(presets.webhooks.transport));
    });

    it('transport.requestId is frozen', () => {
      assert.ok(Object.isFrozen(presets.webhooks.transport.requestId));
    });

    it('transport.security is frozen', () => {
      assert.ok(Object.isFrozen(presets.webhooks.transport.security));
    });

    it('defaults is frozen', () => {
      assert.ok(Object.isFrozen(presets.webhooks.defaults));
    });

    it('defaults.accepts is frozen', () => {
      assert.ok(Object.isFrozen(presets.webhooks.defaults.accepts));
    });

    it('defaults.accepts.types array is frozen', () => {
      assert.ok(Object.isFrozen(presets.webhooks.defaults.accepts.types));
    });

    it('defaults.idempotency is frozen', () => {
      assert.ok(Object.isFrozen(presets.webhooks.defaults.idempotency));
    });

    it('defaults.timeout is frozen', () => {
      assert.ok(Object.isFrozen(presets.webhooks.defaults.timeout));
    });

    it('mutation attempts throw in strict mode', () => {
      assert.throws(() => {
        presets.webhooks = {};
      }, TypeError);
      assert.throws(() => {
        presets.webhooks.transport = {};
      }, TypeError);
      assert.throws(() => {
        presets.webhooks.defaults.accepts.types.push('text/html');
      }, TypeError);
    });
  });

  describe('spread-override semantics', () => {
    it('shallow spread allows overriding transport', () => {
      const merged = {...presets.webhooks, transport: {cors: {origin: '*'}}};
      assert.deepEqual(merged.transport, {cors: {origin: '*'}});
      assert.deepEqual(merged.defaults, presets.webhooks.defaults);
    });

    it('shallow spread allows overriding defaults', () => {
      const merged = {...presets.webhooks, defaults: {authorization: true}};
      assert.deepEqual(merged.defaults, {authorization: true});
      assert.deepEqual(merged.transport, presets.webhooks.transport);
    });

    it('nested spread preserves preset defaults alongside overrides', () => {
      const merged = {
        ...presets.webhooks,
        defaults: {...presets.webhooks.defaults, authorization: true}
      };
      assert.deepEqual(merged.defaults.accepts, {types: ['application/json']});
      assert.deepEqual(merged.defaults.idempotency, {required: true});
      assert.deepEqual(merged.defaults.timeout, {});
      assert.equal(merged.defaults.authorization, true);
    });

    it('nested spread allows overriding timeout', () => {
      const merged = {
        ...presets.webhooks,
        defaults: {...presets.webhooks.defaults, timeout: {ms: 5000}}
      };
      assert.deepEqual(merged.defaults.timeout, {ms: 5000});
      assert.deepEqual(merged.defaults.accepts, {types: ['application/json']});
    });

    it('spread result is a new mutable object', () => {
      const merged = {...presets.webhooks};
      assert.equal(Object.isFrozen(merged), false);
    });
  });
});

describe('[Boundary] presets.public', () => {
  describe('namespace shape', () => {
    it('exports a presets object with public property', () => {
      assert.ok(Object.hasOwn(presets, 'public'));
    });

    it('public has transport and defaults keys', () => {
      assert.ok(Object.hasOwn(presets.public, 'transport'));
      assert.ok(Object.hasOwn(presets.public, 'defaults'));
    });

    it('transport has requestId, security, and rateLimit keys', () => {
      assert.ok(Object.hasOwn(presets.public.transport, 'requestId'));
      assert.ok(Object.hasOwn(presets.public.transport, 'security'));
      assert.ok(Object.hasOwn(presets.public.transport, 'rateLimit'));
    });

    it('transport.requestId is an empty object', () => {
      assert.deepEqual(presets.public.transport.requestId, {});
    });

    it('transport.security is an empty object', () => {
      assert.deepEqual(presets.public.transport.security, {});
    });

    it('transport.rateLimit is an empty object (built-in defaults)', () => {
      assert.deepEqual(presets.public.transport.rateLimit, {});
    });

    it('defaults has accepts with application/json', () => {
      assert.ok(Object.hasOwn(presets.public.defaults, 'accepts'));
      assert.deepEqual(presets.public.defaults.accepts.types, ['application/json']);
    });

    it('defaults has cacheControl with public: true and maxAge: 300', () => {
      assert.ok(Object.hasOwn(presets.public.defaults, 'cacheControl'));
      assert.deepEqual(presets.public.defaults.cacheControl, {public: true, maxAge: 300});
    });

    it('defaults has timeout set to empty object (ergo built-in defaults)', () => {
      assert.ok(Object.hasOwn(presets.public.defaults, 'timeout'));
      assert.deepEqual(presets.public.defaults.timeout, {});
    });

    it('does not include auth or cors', () => {
      assert.equal(Object.hasOwn(presets.public.transport, 'cors'), false);
      assert.equal(Object.hasOwn(presets.public.defaults, 'authorization'), false);
    });
  });

  describe('deep immutability', () => {
    it('public is frozen', () => {
      assert.ok(Object.isFrozen(presets.public));
    });

    it('transport is frozen', () => {
      assert.ok(Object.isFrozen(presets.public.transport));
    });

    it('transport.requestId is frozen', () => {
      assert.ok(Object.isFrozen(presets.public.transport.requestId));
    });

    it('transport.security is frozen', () => {
      assert.ok(Object.isFrozen(presets.public.transport.security));
    });

    it('transport.rateLimit is frozen', () => {
      assert.ok(Object.isFrozen(presets.public.transport.rateLimit));
    });

    it('defaults is frozen', () => {
      assert.ok(Object.isFrozen(presets.public.defaults));
    });

    it('defaults.accepts is frozen', () => {
      assert.ok(Object.isFrozen(presets.public.defaults.accepts));
    });

    it('defaults.accepts.types array is frozen', () => {
      assert.ok(Object.isFrozen(presets.public.defaults.accepts.types));
    });

    it('defaults.cacheControl is frozen', () => {
      assert.ok(Object.isFrozen(presets.public.defaults.cacheControl));
    });

    it('defaults.timeout is frozen', () => {
      assert.ok(Object.isFrozen(presets.public.defaults.timeout));
    });

    it('mutation attempts throw in strict mode', () => {
      assert.throws(() => {
        presets.public = {};
      }, TypeError);
      assert.throws(() => {
        presets.public.transport = {};
      }, TypeError);
      assert.throws(() => {
        presets.public.defaults.accepts.types.push('text/html');
      }, TypeError);
    });
  });

  describe('spread-override semantics', () => {
    it('shallow spread allows overriding transport', () => {
      const merged = {...presets.public, transport: {cors: {origin: '*'}}};
      assert.deepEqual(merged.transport, {cors: {origin: '*'}});
      assert.deepEqual(merged.defaults, presets.public.defaults);
    });

    it('shallow spread allows overriding defaults', () => {
      const merged = {...presets.public, defaults: {authorization: true}};
      assert.deepEqual(merged.defaults, {authorization: true});
      assert.deepEqual(merged.transport, presets.public.transport);
    });

    it('nested spread preserves preset defaults alongside overrides', () => {
      const merged = {
        ...presets.public,
        defaults: {...presets.public.defaults, authorization: true}
      };
      assert.deepEqual(merged.defaults.accepts, {types: ['application/json']});
      assert.deepEqual(merged.defaults.cacheControl, {public: true, maxAge: 300});
      assert.deepEqual(merged.defaults.timeout, {});
      assert.equal(merged.defaults.authorization, true);
    });

    it('nested spread allows overriding timeout', () => {
      const merged = {
        ...presets.public,
        defaults: {...presets.public.defaults, timeout: {ms: 5000}}
      };
      assert.deepEqual(merged.defaults.timeout, {ms: 5000});
      assert.deepEqual(merged.defaults.accepts, {types: ['application/json']});
    });

    it('nested spread allows overriding rateLimit in transport', () => {
      const merged = {
        ...presets.public,
        transport: {...presets.public.transport, rateLimit: {max: 30}}
      };
      assert.deepEqual(merged.transport.rateLimit, {max: 30});
      assert.deepEqual(merged.transport.requestId, {});
      assert.deepEqual(merged.transport.security, {});
    });

    it('spread result is a new mutable object', () => {
      const merged = {...presets.public};
      assert.equal(Object.isFrozen(merged), false);
    });
  });
});
