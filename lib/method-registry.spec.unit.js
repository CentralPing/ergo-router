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

  describe('merge()', () => {
    it('merges all methods from another registry with a prefix', () => {
      const parent = new MethodRegistry();
      const child = new MethodRegistry();
      child.add('GET', '/users');
      child.add('POST', '/users');

      parent.merge('/api', child);

      const allowed = parent.getAllowed('/api/users');
      assert.ok(allowed.has('GET'));
      assert.ok(allowed.has('POST'));
    });

    it('does not affect the parent when child is empty', () => {
      const parent = new MethodRegistry();
      const child = new MethodRegistry();
      parent.merge('/api', child);
      assert.equal(parent.has('/api'), false);
    });

    it('merges into a parent that already has routes', () => {
      const parent = new MethodRegistry();
      parent.add('GET', '/health');

      const child = new MethodRegistry();
      child.add('DELETE', '/items');

      parent.merge('/v1', child);

      assert.ok(parent.has('/health'));
      assert.ok(parent.has('/v1/items'));
      assert.ok(parent.getAllowed('/v1/items').has('DELETE'));
    });
  });
});
