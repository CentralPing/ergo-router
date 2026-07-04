/**
 * @fileoverview Layer 1 boundary tests for lib/resolve-config.
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import resolve from './resolve-config.js';

describe('[Boundary] resolve-config', () => {
  describe('both absent', () => {
    it('returns undefined when both route and default are undefined', () => {
      assert.equal(resolve(undefined, undefined), undefined);
    });
  });

  describe('route absent — falls back to default', () => {
    it('returns false when default is false', () => {
      assert.equal(resolve(undefined, false), false);
    });

    it('normalizes true default to empty options object', () => {
      assert.deepEqual(resolve(undefined, true), {});
    });

    it('returns default options object as-is', () => {
      assert.deepEqual(resolve(undefined, {opt: 1}), {opt: 1});
    });
  });

  describe('route present — route wins over default', () => {
    it('returns false when route disables, even with default object', () => {
      assert.equal(resolve(false, {opt: 1}), false);
    });

    it('normalizes true route to empty options, ignoring default object', () => {
      assert.deepEqual(resolve(true, {opt: 1}), {});
    });

    it('returns route object, ignoring default object', () => {
      assert.deepEqual(resolve({custom: true}, {opt: 1}), {custom: true});
    });
  });

  describe('route present — default absent', () => {
    it('returns route object when default is undefined', () => {
      assert.deepEqual(resolve({custom: true}, undefined), {custom: true});
    });

    it('returns false when route disables and default is undefined', () => {
      assert.equal(resolve(false, undefined), false);
    });

    it('normalizes true route to empty options when default is undefined', () => {
      assert.deepEqual(resolve(true, undefined), {});
    });
  });
});
