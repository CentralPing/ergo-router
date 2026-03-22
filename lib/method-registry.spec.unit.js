/**
 * @fileoverview Layer 1 boundary tests for lib/method-registry.
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import MethodRegistry from './method-registry.js';

describe('[Boundary] MethodRegistry', () => {
  describe('add()', () => {
    it('registers a method for a path', () => {
      const reg = new MethodRegistry();
      reg.add('GET', '/users');
      assert.ok(reg.getAllowed('/users').has('GET'));
    });

    it('normalises method to uppercase', () => {
      const reg = new MethodRegistry();
      reg.add('get', '/items');
      assert.ok(reg.getAllowed('/items').has('GET'));
    });

    it('accumulates multiple methods for the same path', () => {
      const reg = new MethodRegistry();
      reg.add('GET', '/posts');
      reg.add('POST', '/posts');
      const allowed = reg.getAllowed('/posts');
      assert.ok(allowed.has('GET'));
      assert.ok(allowed.has('POST'));
      assert.equal(allowed.size, 2);
    });

    it('keeps different paths independent', () => {
      const reg = new MethodRegistry();
      reg.add('GET', '/a');
      reg.add('POST', '/b');
      assert.ok(reg.getAllowed('/a').has('GET'));
      assert.ok(!reg.getAllowed('/a').has('POST'));
      assert.ok(reg.getAllowed('/b').has('POST'));
    });
  });

  describe('getAllowed()', () => {
    it('returns empty Set for unknown path', () => {
      const reg = new MethodRegistry();
      assert.equal(reg.getAllowed('/unknown').size, 0);
    });

    it('returns the exact Set of registered methods', () => {
      const reg = new MethodRegistry();
      reg.add('DELETE', '/things');
      const allowed = reg.getAllowed('/things');
      assert.deepEqual([...allowed], ['DELETE']);
    });
  });

  describe('has()', () => {
    it('returns false for unknown paths', () => {
      const reg = new MethodRegistry();
      assert.equal(reg.has('/nope'), false);
    });

    it('returns true once a method is registered', () => {
      const reg = new MethodRegistry();
      reg.add('PUT', '/resource');
      assert.equal(reg.has('/resource'), true);
    });
  });
});
