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

    it('passes domainAcc as 4th argument to catchHandler', async () => {
      let receivedAcc;
      const wrap = createAutoWrap({
        catchHandler: (req, res, err, domainAcc) => {
          receivedAcc = domainAcc;
          res.end();
        }
      });
      const handler = wrap([
        () => {
          throw new Error('catch with acc');
        }
      ]);
      await handler(createMockReq(), createMockRes(), {userId: '7'});
      assert.ok(receivedAcc, 'domainAcc should be provided');
      assert.deepEqual(receivedAcc.route, {params: {userId: '7'}});
    });

    it('passes partially populated domainAcc when error occurs mid-pipeline', async () => {
      let receivedAcc;
      const wrap = createAutoWrap({
        catchHandler: (req, res, err, domainAcc) => {
          receivedAcc = domainAcc;
          res.end();
        }
      });
      const handler = wrap([
        (req, res, domainAcc) => {
          domainAcc.parsed = {name: 'test'};
          return {value: {parsed: {name: 'test'}}};
        },
        () => {
          throw new Error('mid-pipeline failure');
        }
      ]);
      await handler(createMockReq(), createMockRes(), {});
      assert.ok(receivedAcc, 'domainAcc should be provided');
      assert.deepEqual(receivedAcc.parsed, {name: 'test'});
    });

    it('always includes route.params in domainAcc for catchHandler', async () => {
      let receivedAcc;
      const wrap = createAutoWrap({
        catchHandler: (req, res, err, domainAcc) => {
          receivedAcc = domainAcc;
          res.end();
        }
      });
      const handler = wrap([
        () => {
          throw new Error('params check');
        }
      ]);
      await handler(createMockReq(), createMockRes(), {id: '42', slug: 'test'});
      assert.ok(receivedAcc.route, 'route should be present');
      assert.deepEqual(receivedAcc.route.params, {id: '42', slug: 'test'});
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
        {fn: () => ({value: 'ok'}), setPath: 'logger'},
        {fn: () => ({response: {statusCode: 403, detail: 'Forbidden'}}), setPath: 'auth'},
        {fn: () => ({value: 'never'}), setPath: 'body'}
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

  describe('timing mode', () => {
    function createTimingRes() {
      const res = createMockRes();
      res.headersSent = false;
      const origWriteHead = function (statusCode) {
        if (!this.headersSent) {
          if (statusCode != null) this.statusCode = statusCode;
          this.headersSent = true;
        }
        return this;
      };
      res.writeHead = origWriteHead;
      const origEnd = res.end.bind(res);
      res.end = function (chunk) {
        if (!this.headersSent) this.writeHead(this.statusCode);
        return origEnd.call(this, chunk);
      };
      return res;
    }

    it('sets x-response-time header when timing is true', async () => {
      const wrap = createAutoWrap({timing: true});
      const handler = wrap([() => ({response: {statusCode: 200, body: {ok: true}}})]);
      const res = createTimingRes();
      await handler(createMockReq(), res, {});
      assert.equal(res.statusCode, 200);
      const timingValue = res.getHeader('x-response-time');
      assert.ok(timingValue, 'x-response-time header should be present');
      assert.ok(!isNaN(Number(timingValue)), 'timing value should be a numeric string');
      assert.ok(Number(timingValue) >= 0, 'timing value should be non-negative');
    });

    it('uses custom header and precision when timing is an object', async () => {
      const wrap = createAutoWrap({timing: {header: 'server-timing', precision: 0}});
      const handler = wrap([() => ({response: {statusCode: 200, body: {ok: true}}})]);
      const res = createTimingRes();
      await handler(createMockReq(), res, {});
      const timingValue = res.getHeader('server-timing');
      assert.ok(timingValue, 'server-timing header should be present');
      assert.ok(!timingValue.includes('.'), 'precision 0 should produce integer');
    });

    it('uses default header and precision when timing is empty object', async () => {
      const wrap = createAutoWrap({timing: {}});
      const handler = wrap([() => ({response: {statusCode: 200, body: {ok: true}}})]);
      const res = createTimingRes();
      await handler(createMockReq(), res, {});
      const timingValue = res.getHeader('x-response-time');
      assert.ok(timingValue, 'default x-response-time header should be present');
      assert.ok(!isNaN(Number(timingValue)), 'timing value should be a numeric string');
    });

    it('does not set timing header when timing is false (default)', async () => {
      const wrap = createAutoWrap();
      const handler = wrap([() => ({response: {statusCode: 200, body: {ok: true}}})]);
      const res = createTimingRes();
      await handler(createMockReq(), res, {});
      assert.equal(res.getHeader('x-response-time'), undefined);
    });

    it('sets timing header on catchHandler error path', async () => {
      const wrap = createAutoWrap({
        timing: true,
        catchHandler: (req, res, err) => {
          res.statusCode = err.statusCode || 500;
          res.end(JSON.stringify({caught: true}));
        }
      });
      const handler = wrap([
        () => {
          throw new Error('caught');
        }
      ]);
      const res = createTimingRes();
      await handler(createMockReq(), res, {});
      const timingValue = res.getHeader('x-response-time');
      assert.ok(timingValue, 'x-response-time header should be present on catch path');
      assert.ok(Number(timingValue) >= 0, 'timing value should be non-negative');
    });

    it('timing header value is a non-negative numeric string with default precision', async () => {
      const wrap = createAutoWrap({timing: true});
      const handler = wrap([() => ({response: {statusCode: 200, body: {ok: true}}})]);
      const res = createTimingRes();
      await handler(createMockReq(), res, {});
      const timingValue = res.getHeader('x-response-time');
      const num = Number(timingValue);
      assert.ok(!isNaN(num), 'should be a valid number');
      assert.ok(num >= 0, 'should be non-negative');
      const parts = timingValue.split('.');
      if (parts.length === 2) {
        assert.ok(parts[1].length <= 3, 'default precision should be at most 3 decimal places');
      }
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

  describe('onResponse hook', () => {
    it('router-level onResponse fires on every route', async () => {
      let hookCount = 0;
      const wrap = createAutoWrap({
        onResponse: () => {
          hookCount++;
        }
      });
      const handler = wrap([() => ({response: {statusCode: 200, body: 'ok'}})]);
      await handler(createMockReq(), createMockRes(), {});
      await handler(createMockReq(), createMockRes(), {});
      assert.equal(hookCount, 2);
    });

    it('per-route onResponse fires only on that route', async () => {
      let routeHookCount = 0;
      const wrap = createAutoWrap();
      const handlerA = wrap([() => ({response: {statusCode: 200, body: 'a'}})], {
        onResponse: () => {
          routeHookCount++;
        }
      });
      const handlerB = wrap([() => ({response: {statusCode: 200, body: 'b'}})]);
      await handlerA(createMockReq(), createMockRes(), {});
      await handlerB(createMockReq(), createMockRes(), {});
      assert.equal(routeHookCount, 1);
    });

    it('both fire when both are configured (route-level first)', async () => {
      const order = [];
      const wrap = createAutoWrap({
        onResponse: () => {
          order.push('router');
        }
      });
      const handler = wrap([() => ({response: {statusCode: 200, body: 'ok'}})], {
        onResponse: () => {
          order.push('route');
        }
      });
      await handler(createMockReq(), createMockRes(), {});
      assert.deepEqual(order, ['route', 'router']);
    });

    it('hook errors are swallowed independently', async () => {
      let routerCalled = false;
      const wrap = createAutoWrap({
        onResponse: () => {
          routerCalled = true;
        }
      });
      const handler = wrap([() => ({response: {statusCode: 200, body: 'ok'}})], {
        onResponse: () => {
          throw new Error('route hook error');
        }
      });
      const res = createMockRes();
      await handler(createMockReq(), res, {});
      assert.equal(res.statusCode, 200);
      assert.equal(routerCalled, true, 'router hook should still fire');
    });

    it('hook receives responseInfo with correct shape', async () => {
      let hookInfo;
      const wrap = createAutoWrap({
        onResponse(req, res, responseInfo) {
          hookInfo = responseInfo;
        }
      });
      const handler = wrap([() => ({response: {statusCode: 201, body: {id: 1}}})]);
      await handler(createMockReq({method: 'POST', url: '/items'}), createMockRes(), {});
      assert.equal(hookInfo.statusCode, 201);
      assert.equal(hookInfo.method, 'POST');
      assert.equal(hookInfo.url, '/items');
      assert.equal(typeof hookInfo.duration, 'number');
      assert.ok(hookInfo.duration >= 0);
      assert.equal(typeof hookInfo.headers, 'object');
    });

    it('hook receives domainAcc with pipeline-accumulated values', async () => {
      let receivedAcc;
      const wrap = createAutoWrap({
        onResponse(req, res, responseInfo, domainAcc) {
          receivedAcc = domainAcc;
        }
      });
      const handler = wrap([
        (req, res, domainAcc) => {
          domainAcc.custom = 'test';
          return {response: {statusCode: 200, body: 'ok'}};
        }
      ]);
      await handler(createMockReq(), createMockRes(), {id: '5'});
      assert.equal(receivedAcc.custom, 'test');
      assert.deepEqual(receivedAcc.route, {params: {id: '5'}});
    });

    it('fires on catchHandler path (success, no throw)', async () => {
      let hookCalled = false;
      const wrap = createAutoWrap({
        catchHandler: () => {},
        onResponse: () => {
          hookCalled = true;
        }
      });
      const handler = wrap([() => ({response: {statusCode: 200, body: 'ok'}})]);
      await handler(createMockReq(), createMockRes(), {});
      assert.equal(hookCalled, true);
    });

    it('route-level onResponse succeeds on catchHandler path without entering catch', async () => {
      let routeHookCalled = false;
      const wrap = createAutoWrap({catchHandler: () => {}});
      const handler = wrap([() => ({response: {statusCode: 200, body: 'ok'}})], {
        onResponse: () => {
          routeHookCalled = true;
        }
      });
      await handler(createMockReq(), createMockRes(), {});
      assert.equal(routeHookCalled, true);
    });

    it('fires on noSend path with correct responseInfo', async () => {
      let hookInfo;
      const wrap = createAutoWrap({
        onResponse(req, res, responseInfo) {
          hookInfo = responseInfo;
        }
      });
      const handler = wrap(
        [
          (req, res) => {
            res.statusCode = 204;
            res.end();
          }
        ],
        {noSend: true}
      );
      const res = createMockRes();
      await handler(createMockReq({method: 'DELETE', url: '/items/5'}), res, {});
      assert.equal(res.statusCode, 204);
      assert.ok(hookInfo, 'onResponse should fire on noSend path');
      assert.equal(hookInfo.statusCode, 204);
      assert.equal(hookInfo.method, 'DELETE');
      assert.equal(hookInfo.url, '/items/5');
      assert.equal(typeof hookInfo.duration, 'number');
    });

    it('swallows route-level hook errors on catchHandler path', async () => {
      let routerCalled = false;
      const wrap = createAutoWrap({
        catchHandler: () => {},
        onResponse: () => {
          routerCalled = true;
        }
      });
      const handler = wrap([() => ({response: {statusCode: 200, body: 'ok'}})], {
        onResponse: () => {
          throw new Error('route hook error on catch path');
        }
      });
      const res = createMockRes();
      await handler(createMockReq(), res, {});
      assert.equal(res.statusCode, 200);
      assert.equal(
        routerCalled,
        true,
        'router hook fires even when route hook throws on catch path'
      );
    });

    it('swallows router-level hook errors on catchHandler path', async () => {
      const wrap = createAutoWrap({
        catchHandler: () => {},
        onResponse: () => {
          throw new Error('router hook error on catch path');
        }
      });
      const handler = wrap([() => ({response: {statusCode: 200, body: 'ok'}})]);
      const res = createMockRes();
      await handler(createMockReq(), res, {});
      assert.equal(res.statusCode, 200);
    });

    it('swallows router-level hook errors on non-catchHandler path', async () => {
      const wrap = createAutoWrap({
        onResponse: () => {
          throw new Error('router hook error');
        }
      });
      const handler = wrap([() => ({response: {statusCode: 200, body: 'ok'}})]);
      const res = createMockRes();
      await handler(createMockReq(), res, {});
      assert.equal(res.statusCode, 200);
    });

    it('does not fire on catchHandler path when pipeline throws (catchHandler takes over)', async () => {
      let hookCalled = false;
      const wrap = createAutoWrap({
        catchHandler: () => {},
        onResponse: () => {
          hookCalled = true;
        }
      });
      const handler = wrap([
        () => {
          throw new Error('fail');
        }
      ]);
      const res = createMockRes();
      await handler(createMockReq(), res, {});
      assert.equal(hookCalled, false, 'hook should not fire when catchHandler handles the error');
    });
  });
});
