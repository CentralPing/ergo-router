/**
 * @fileoverview Tests for lib/auto-wrap (v2 two-accumulator model).
 *
 * Layer 1: unit tests for createAutoWrap (no router, no HTTP).
 * Layer 3: contract tests use createRouter + real HTTP.
 *
 * Contract tests depend on pipeline-builder being v2-compatible.
 * They will be updated alongside pipeline-builder.
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import createAutoWrap from './auto-wrap.js';
import {createMockReq, createMockRes} from '../test/helpers.js';

// ---------------------------------------------------------------------------
// Layer 1: createAutoWrap unit tests (v2 two-accumulator model)
// ---------------------------------------------------------------------------
describe('[Boundary] auto-wrap', () => {
  it('returns the function unchanged when pipeline is already a function', () => {
    const wrap = createAutoWrap();
    const fn = () => {};
    assert.equal(wrap(fn), fn);
  });

  it('returns a function for array pipeline', () => {
    const wrap = createAutoWrap();
    const result = wrap([() => ({response: {statusCode: 200, body: 'ok'}})]);
    assert.equal(typeof result, 'function');
  });

  it('returns a 500-handler for non-array/non-function pipeline', () => {
    const wrap = createAutoWrap();
    const result = wrap(42);
    const res = createMockRes();
    result(createMockReq(), res);
    assert.equal(res.statusCode, 500);
  });

  it('seeds domainAcc with route.params', async () => {
    let receivedAcc;
    const wrap = createAutoWrap();
    const handler = wrap([
      (req, res, domainAcc) => {
        receivedAcc = domainAcc;
      }
    ]);
    await handler(createMockReq(), createMockRes(), {id: '42'});
    assert.deepEqual(receivedAcc.route, {params: {id: '42'}});
  });

  it('creates fresh accumulators per request', async () => {
    const accs = [];
    const wrap = createAutoWrap();
    const handler = wrap([
      (req, res, domainAcc, responseAcc) => {
        accs.push({domainAcc, responseAcc});
        return {response: {statusCode: 200, body: 'ok'}};
      }
    ]);
    await handler(createMockReq(), createMockRes(), {});
    await handler(createMockReq(), createMockRes(), {});
    assert.notEqual(accs[0].domainAcc, accs[1].domainAcc);
    assert.notEqual(accs[0].responseAcc, accs[1].responseAcc);
  });

  it('calls send() after successful pipeline with responseAcc data', async () => {
    const wrap = createAutoWrap();
    const handler = wrap([() => ({response: {statusCode: 200, body: {result: 'ok'}}})]);
    const res = createMockRes();
    await handler(createMockReq(), res, {});
    assert.equal(res.statusCode, 200);
    assert.ok(res.writableEnded);
    const body = JSON.parse(res._body);
    assert.deepEqual(body, {result: 'ok'});
  });

  it('catches pipeline errors and sets 500 when statusCode unset', async () => {
    const wrap = createAutoWrap();
    const handler = wrap([
      () => {
        throw new Error('unexpected');
      }
    ]);
    const res = createMockRes();
    await handler(createMockReq(), res, {});
    assert.equal(res.statusCode, 500);
    assert.ok(res.writableEnded);
  });

  it('preserves responseAcc.statusCode when already set before throw', async () => {
    const wrap = createAutoWrap();
    const handler = wrap([
      (req, res, domainAcc, responseAcc) => {
        responseAcc.statusCode = 408;
        responseAcc.detail = 'Request timed out';
        throw new Error('destroyed');
      }
    ]);
    const res = createMockRes();
    await handler(createMockReq(), res, {});
    assert.equal(res.statusCode, 408);
  });

  it('emits error on response when pipeline throws', async () => {
    const wrap = createAutoWrap();
    const err = new Error('test error');
    const handler = wrap([
      () => {
        throw err;
      }
    ]);
    const res = createMockRes();
    const errors = [];
    res.on('error', e => errors.push(e));
    await handler(createMockReq(), res, {});
    assert.equal(errors.length, 1);
    assert.equal(errors[0], err);
  });

  it('auto-populates responseAcc.instance from x-request-id on error', async () => {
    const wrap = createAutoWrap();
    const handler = wrap([
      () => {
        throw new Error('fail');
      }
    ]);
    const res = createMockRes();
    res.setHeader('x-request-id', 'req-abc');
    await handler(createMockReq(), res, {});
    const body = JSON.parse(res._body);
    assert.equal(body.instance, 'urn:uuid:req-abc');
  });

  it('does not call send() when noSend is true', async () => {
    const wrap = createAutoWrap();
    const handler = wrap(
      [
        (req, res) => {
          res.statusCode = 200;
          res.setHeader('content-type', 'text/plain');
          res.end('manual');
        }
      ],
      {noSend: true}
    );
    const res = createMockRes();
    await handler(createMockReq(), res, {});
    assert.equal(res._body, 'manual');
    assert.equal(res.statusCode, 200);
  });

  it('prepends appMiddleware before pipeline steps', async () => {
    const order = [];
    const wrap = createAutoWrap({}, [
      () => {
        order.push('app');
        return {value: {middlewareRan: true}};
      }
    ]);
    const handler = wrap([
      (req, res, domainAcc) => {
        order.push('route');
        assert.equal(domainAcc.middlewareRan, true);
        return {response: {statusCode: 200, body: 'ok'}};
      }
    ]);
    await handler(createMockReq(), createMockRes(), {});
    assert.deepEqual(order, ['app', 'route']);
  });

  it('forwards per-route send options', async () => {
    const wrap = createAutoWrap();
    const handler = wrap([() => ({response: {statusCode: 200, body: {a: 1}}})], {
      send: {prettify: true}
    });
    const res = createMockRes();
    await handler(createMockReq(), res, {});
    assert.ok(res._body.includes('\n'), 'prettified JSON should contain newlines');
  });

  describe('custom catchHandler', () => {
    it('delegates to catchHandler when pipeline throws', async () => {
      const wrap = createAutoWrap({
        catchHandler: (req, res, err) => {
          res.statusCode = err.statusCode || 500;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({custom: true, message: err.message}));
        }
      });
      const handler = wrap([
        () => {
          const err = new Error('custom catch');
          err.statusCode = 409;
          throw err;
        }
      ]);
      const res = createMockRes();
      await handler(createMockReq(), res, {});
      assert.equal(res.statusCode, 409);
      const body = JSON.parse(res._body);
      assert.equal(body.custom, true);
    });

    it('normalizes error statusCode for catchHandler', async () => {
      let receivedErr;
      const wrap = createAutoWrap({
        catchHandler: (req, res, err) => {
          receivedErr = err;
          res.end();
        }
      });
      const handler = wrap([
        () => {
          throw new Error('no status');
        }
      ]);
      await handler(createMockReq(), createMockRes(), {});
      assert.equal(receivedErr.statusCode, 500);
      assert.equal(receivedErr.status, 500);
    });

    it('calls send() on success even with catchHandler registered', async () => {
      const wrap = createAutoWrap({
        catchHandler: () => {
          throw new Error('should not be called');
        }
      });
      const handler = wrap([() => ({response: {statusCode: 200, body: {success: true}}})]);
      const res = createMockRes();
      await handler(createMockReq(), res, {});
      assert.equal(res.statusCode, 200);
      const body = JSON.parse(res._body);
      assert.equal(body.success, true);
    });

    it('emits error on response for catchHandler path', async () => {
      const errors = [];
      const wrap = createAutoWrap({
        catchHandler: (req, res) => {
          res.end();
        }
      });
      const handler = wrap([
        () => {
          throw new Error('listener test');
        }
      ]);
      const res = createMockRes();
      res.on('error', e => errors.push(e));
      await handler(createMockReq(), res, {});
      assert.equal(errors.length, 1);
      assert.equal(errors[0].message, 'listener test');
    });
  });

  describe('unexpected error redaction', () => {
    it('does not expose raw error message for 500 errors', async () => {
      const wrap = createAutoWrap();
      const handler = wrap([
        () => {
          throw new Error('database connection failed at /internal/db.js:42');
        }
      ]);
      const res = createMockRes();
      await handler(createMockReq(), res, {});
      assert.equal(res.statusCode, 500);
      const body = JSON.parse(res._body);
      assert.ok(!body.detail?.includes('database connection'));
    });
  });
});
