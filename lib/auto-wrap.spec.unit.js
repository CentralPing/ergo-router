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

  it('populates instance on pipeline break (return-value, no throw)', async () => {
    const wrap = createAutoWrap();
    const handler = wrap([
      (req, res, domainAcc, responseAcc) => {
        responseAcc.statusCode = 422;
        responseAcc.detail = 'Validation failed';
      }
    ]);
    const res = createMockRes();
    res.setHeader('x-request-id', 'break-id-789');
    await handler(createMockReq(), res, {});
    const body = JSON.parse(res._body);
    assert.equal(body.instance, 'urn:uuid:break-id-789');
    assert.equal(body.status, 422);
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

    it('populates err.instance for catchHandler', async () => {
      let receivedErr;
      const wrap = createAutoWrap({
        catchHandler: (req, res, err) => {
          receivedErr = err;
          res.end();
        }
      });
      const handler = wrap([
        () => {
          throw new Error('with instance');
        }
      ]);
      const res = createMockRes();
      res.setHeader('x-request-id', 'catch-id-111');
      await handler(createMockReq(), res, {});
      assert.equal(receivedErr.instance, 'urn:uuid:catch-id-111');
    });

    it('populates responseAcc.instance on catchHandler success path (pipeline break)', async () => {
      const wrap = createAutoWrap({
        catchHandler: () => {
          throw new Error('should not be called on pipeline break');
        }
      });
      const handler = wrap([
        (req, res, domainAcc, responseAcc) => {
          responseAcc.statusCode = 422;
          responseAcc.detail = 'Validation failed';
        }
      ]);
      const res = createMockRes();
      res.setHeader('x-request-id', 'catch-break-222');
      await handler(createMockReq(), res, {});
      const body = JSON.parse(res._body);
      assert.equal(body.instance, 'urn:uuid:catch-break-222');
      assert.equal(body.status, 422);
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

  describe('debug mode', () => {
    it('includes _trace in error body when debug is true', async () => {
      const wrap = createAutoWrap({debug: true});
      const handler = wrap([
        [() => ({value: 'ok'}), 'logger'],
        [() => ({response: {statusCode: 403, detail: 'Forbidden'}}), 'auth'],
        [() => ({value: 'never'}), 'body']
      ]);
      const res = createMockRes();
      await handler(createMockReq(), res, {});
      const body = JSON.parse(res._body);
      assert.equal(body.status, 403);
      assert.ok(body._trace, '_trace should be present');
      assert.ok(Array.isArray(body._trace.steps), 'steps should be an array');
    });

    it('does not include _trace when debug is false', async () => {
      const wrap = createAutoWrap();
      const handler = wrap([() => ({response: {statusCode: 403, detail: 'Forbidden'}})]);
      const res = createMockRes();
      await handler(createMockReq(), res, {});
      const body = JSON.parse(res._body);
      assert.equal(body._trace, undefined);
    });

    it('does not include _trace on 2xx responses', async () => {
      const wrap = createAutoWrap({debug: true});
      const handler = wrap([() => ({response: {statusCode: 200, body: {ok: true}}})]);
      const res = createMockRes();
      await handler(createMockReq(), res, {});
      const body = JSON.parse(res._body);
      assert.equal(body._trace, undefined);
      assert.equal(body.ok, true);
    });

    it('initializes _trace for catchFn path when debug is true', async () => {
      let capturedResponseAcc;
      const wrap = createAutoWrap({
        debug: true,
        catchHandler: (req, res) => {
          res.end();
        }
      });
      const handler = wrap([
        (req, res, domainAcc, responseAcc) => {
          capturedResponseAcc = responseAcc;
          throw new Error('with trace');
        }
      ]);
      await handler(createMockReq(), createMockRes(), {});
      assert.ok(capturedResponseAcc._trace, '_trace should be initialized');
      assert.ok(Array.isArray(capturedResponseAcc._trace.steps), 'steps should be an array');
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

  describe('OTEL span lifecycle', () => {
    function createMockSpan() {
      const calls = [];
      return {
        calls,
        span: {
          setAttribute(key, value) {
            calls.push({method: 'setAttribute', key, value});
          },
          setStatus(status) {
            calls.push({method: 'setStatus', status});
          },
          recordException(err) {
            calls.push({method: 'recordException', err});
          },
          end() {
            calls.push({method: 'end'});
          }
        }
      };
    }

    it('ends span with status on successful pipeline', async () => {
      const {span, calls} = createMockSpan();
      const wrap = createAutoWrap();
      const handler = wrap([
        (req, res, domainAcc) => {
          domainAcc.trace = {span};
          return {response: {statusCode: 200, body: {ok: true}}};
        }
      ]);
      const res = createMockRes();
      await handler(createMockReq(), res, {});
      assert.equal(res.statusCode, 200);

      const setAttr = calls.find(c => c.method === 'setAttribute');
      assert.ok(setAttr, 'should call setAttribute');
      assert.equal(setAttr.key, 'http.status_code');
      assert.equal(setAttr.value, 200);

      const setStatus = calls.find(c => c.method === 'setStatus');
      assert.ok(setStatus, 'should call setStatus');
      assert.equal(setStatus.status.code, 0); // SpanStatusCode.UNSET

      const end = calls.find(c => c.method === 'end');
      assert.ok(end, 'should call end');
    });

    it('records exception and ends span on pipeline error', async () => {
      const {span, calls} = createMockSpan();
      const pipelineErr = new Error('pipeline failure');
      const wrap = createAutoWrap();
      const handler = wrap([
        (req, res, domainAcc) => {
          domainAcc.trace = {span};
          throw pipelineErr;
        }
      ]);
      const res = createMockRes();
      await handler(createMockReq(), res, {});
      assert.equal(res.statusCode, 500);

      const recEx = calls.find(c => c.method === 'recordException');
      assert.ok(recEx, 'should call recordException');
      assert.equal(recEx.err, pipelineErr);

      const setAttr = calls.find(c => c.method === 'setAttribute');
      assert.ok(setAttr, 'should call setAttribute');
      assert.equal(setAttr.value, 500);

      const setStatus = calls.find(c => c.method === 'setStatus');
      assert.ok(setStatus, 'should call setStatus');
      assert.equal(setStatus.status.code, 2); // SpanStatusCode.ERROR

      const end = calls.find(c => c.method === 'end');
      assert.ok(end, 'should call end');
    });

    it('ends span on catchHandler error path', async () => {
      const {span, calls} = createMockSpan();
      const pipelineErr = new Error('catch me');
      pipelineErr.statusCode = 409;
      const wrap = createAutoWrap({
        catchHandler: (req, res, err) => {
          res.statusCode = err.statusCode;
          res.end(JSON.stringify({caught: true}));
        }
      });
      const handler = wrap([
        (req, res, domainAcc) => {
          domainAcc.trace = {span};
          throw pipelineErr;
        }
      ]);
      const res = createMockRes();
      await handler(createMockReq(), res, {});

      const recEx = calls.find(c => c.method === 'recordException');
      assert.ok(recEx, 'should call recordException');
      assert.equal(recEx.err, pipelineErr);

      const setAttr = calls.find(c => c.method === 'setAttribute');
      assert.ok(setAttr, 'should call setAttribute');
      assert.equal(setAttr.value, 409);

      const end = calls.find(c => c.method === 'end');
      assert.ok(end, 'should call end');
    });

    it('ends span on catchHandler success path', async () => {
      const {span, calls} = createMockSpan();
      const wrap = createAutoWrap({
        catchHandler: () => {
          throw new Error('should not be called');
        }
      });
      const handler = wrap([
        (req, res, domainAcc) => {
          domainAcc.trace = {span};
          return {response: {statusCode: 201, body: {created: true}}};
        }
      ]);
      const res = createMockRes();
      await handler(createMockReq(), res, {});
      assert.equal(res.statusCode, 201);

      const setAttr = calls.find(c => c.method === 'setAttribute');
      assert.ok(setAttr, 'should call setAttribute');
      assert.equal(setAttr.value, 201);

      const end = calls.find(c => c.method === 'end');
      assert.ok(end, 'should call end');
    });

    it('ends span on noSend path', async () => {
      const {span, calls} = createMockSpan();
      const wrap = createAutoWrap();
      const handler = wrap(
        [
          (req, res, domainAcc) => {
            domainAcc.trace = {span};
            res.statusCode = 204;
            res.end();
          }
        ],
        {noSend: true}
      );
      const res = createMockRes();
      await handler(createMockReq(), res, {});

      const setAttr = calls.find(c => c.method === 'setAttribute');
      assert.ok(setAttr, 'should call setAttribute');
      assert.equal(setAttr.value, 204);

      const end = calls.find(c => c.method === 'end');
      assert.ok(end, 'should call end');
    });

    it('does nothing when no span is on domainAcc', async () => {
      const wrap = createAutoWrap();
      const handler = wrap([() => ({response: {statusCode: 200, body: 'ok'}})]);
      const res = createMockRes();
      await handler(createMockReq(), res, {});
      assert.equal(res.statusCode, 200);
    });
  });
});
