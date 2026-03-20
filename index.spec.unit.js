/**
 * @fileoverview Coverage test for ergo-router index.js barrel export.
 * Importing the package entry point is sufficient to register it as covered.
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import createRouter, {graceful} from './index.js';

describe('[Boundary] ergo-router index barrel', () => {
  it('exports createRouter as the default export', () => {
    assert.equal(typeof createRouter, 'function');
  });

  it('exports graceful as a named export', () => {
    assert.equal(typeof graceful, 'function');
  });

  it('createRouter() returns a router with HTTP method helpers', () => {
    const router = createRouter();
    assert.equal(typeof router.get, 'function');
    assert.equal(typeof router.post, 'function');
    assert.equal(typeof router.put, 'function');
    assert.equal(typeof router.patch, 'function');
    assert.equal(typeof router.delete, 'function');
    assert.equal(typeof router.handle, 'function');
  });
});
