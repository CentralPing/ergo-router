import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {defineGet, definePost, defineRoute} from './define-route.js';

describe('[Boundary] define-route helpers', () => {
  describe('defineGet', () => {
    it('merges config and execute into a null-prototype object', () => {
      const config = {authorization: true, url: true};
      const execute = () => ({response: {body: 'ok'}});
      const result = defineGet(config, execute);

      assert.equal(Object.getPrototypeOf(result), null);
      assert.equal(result.authorization, true);
      assert.equal(result.url, true);
      assert.equal(result.execute, execute);
    });

    it('does not mutate the original config', () => {
      const config = Object.freeze({accepts: true});
      const execute = () => ({});
      const result = defineGet(config, execute);

      assert.notEqual(result, config);
      assert.equal(result.accepts, true);
    });
  });

  describe('definePost', () => {
    it('merges config and execute into a null-prototype object', () => {
      const config = {body: {limit: 1024}};
      const execute = () => ({response: {body: 'created'}});
      const result = definePost(config, execute);

      assert.equal(Object.getPrototypeOf(result), null);
      assert.deepEqual(result.body, {limit: 1024});
      assert.equal(result.execute, execute);
    });
  });

  describe('defineRoute', () => {
    it('merges config and execute into a null-prototype object', () => {
      const config = {paginate: true, logger: true};
      const execute = () => ({response: {body: []}});
      const result = defineRoute(config, execute);

      assert.equal(Object.getPrototypeOf(result), null);
      assert.equal(result.paginate, true);
      assert.equal(result.logger, true);
      assert.equal(result.execute, execute);
    });

    it('returns an object usable as RouteConfig', () => {
      const config = {authorization: true};
      const execute = () => ({response: {body: {}}});
      const result = defineRoute(config, execute);

      assert.equal(typeof result.execute, 'function');
      assert.equal(result.authorization, true);
    });
  });
});
