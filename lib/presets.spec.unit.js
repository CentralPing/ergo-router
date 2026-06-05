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
      const merged = {...presets.jsonApi, defaults: {timeout: {ms: 5000}}};
      assert.deepEqual(merged.defaults, {timeout: {ms: 5000}});
      assert.deepEqual(merged.transport, presets.jsonApi.transport);
    });

    it('nested spread preserves preset defaults alongside overrides', () => {
      const merged = {
        ...presets.jsonApi,
        defaults: {...presets.jsonApi.defaults, timeout: {ms: 30000}}
      };
      assert.deepEqual(merged.defaults.accepts, {types: ['application/json']});
      assert.deepEqual(merged.defaults.timeout, {ms: 30000});
    });

    it('spread result is a new mutable object', () => {
      const merged = {...presets.jsonApi};
      assert.equal(Object.isFrozen(merged), false);
    });
  });
});
