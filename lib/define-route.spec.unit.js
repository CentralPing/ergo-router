import {describe, it} from 'node:test';
import assert from 'node:assert/strict';

import {
  defineGet,
  definePost,
  defineRoute,
  definePut,
  definePatch,
  defineDelete
} from './define-route.js';

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

  describe('definePut', () => {
    it('merges config and execute into a null-prototype object', () => {
      const config = {body: {limit: 2048}, authorization: true};
      const execute = () => ({response: {body: 'updated'}});
      const result = definePut(config, execute);

      assert.equal(Object.getPrototypeOf(result), null);
      assert.deepEqual(result.body, {limit: 2048});
      assert.equal(result.authorization, true);
      assert.equal(result.execute, execute);
    });

    it('does not mutate the original config', () => {
      const config = Object.freeze({body: true});
      const execute = () => ({});
      const result = definePut(config, execute);

      assert.notEqual(result, config);
      assert.equal(result.body, true);
    });
  });

  describe('definePatch', () => {
    it('merges config and execute into a null-prototype object', () => {
      const config = {body: true, authorization: true};
      const execute = () => ({response: {body: 'patched'}});
      const result = definePatch(config, execute);

      assert.equal(Object.getPrototypeOf(result), null);
      assert.equal(result.body, true);
      assert.equal(result.authorization, true);
      assert.equal(result.execute, execute);
    });

    it('does not mutate the original config', () => {
      const config = Object.freeze({body: {limit: 512}});
      const execute = () => ({});
      const result = definePatch(config, execute);

      assert.notEqual(result, config);
      assert.deepEqual(result.body, {limit: 512});
    });
  });

  describe('defineDelete', () => {
    it('merges config and execute into a null-prototype object', () => {
      const config = {authorization: true, url: true};
      const execute = () => ({response: {statusCode: 204}});
      const result = defineDelete(config, execute);

      assert.equal(Object.getPrototypeOf(result), null);
      assert.equal(result.authorization, true);
      assert.equal(result.url, true);
      assert.equal(result.execute, execute);
    });

    it('does not mutate the original config', () => {
      const config = Object.freeze({url: true});
      const execute = () => ({});
      const result = defineDelete(config, execute);

      assert.notEqual(result, config);
      assert.equal(result.url, true);
    });
  });
});
