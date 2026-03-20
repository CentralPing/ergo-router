/**
 * @fileoverview Boundary tests for lib/error-response shared helper.
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import endWithProblem from './error-response.js';
import {createMockRes} from '../test/helpers.js';

describe('[Boundary] error-response', () => {
  it('sets the correct status code on the response', () => {
    const res = createMockRes();
    endWithProblem(res, 404);
    assert.equal(res.statusCode, 404);
  });

  it('sets Content-Type to application/problem+json', () => {
    const res = createMockRes();
    endWithProblem(res, 500);
    assert.equal(res.getHeader('content-type'), 'application/problem+json; charset=utf-8');
  });

  it('sets Content-Length header', () => {
    const res = createMockRes();
    endWithProblem(res, 404);
    assert.ok(res.getHeader('content-length') > 0);
  });

  it('ends the response with a JSON body', () => {
    const res = createMockRes();
    endWithProblem(res, 404);
    assert.ok(res.writableEnded);
    const body = JSON.parse(res._body);
    assert.equal(body.status, 404);
    assert.equal(body.title, 'Not Found');
    assert.ok(body.type);
    assert.ok(body.detail);
  });

  it('preserves headers already set on res (e.g. Allow, Retry-After)', () => {
    const res = createMockRes();
    res.setHeader('Allow', 'GET, POST');
    endWithProblem(res, 405);
    assert.equal(res.getHeader('allow'), 'GET, POST');
    assert.equal(res.statusCode, 405);
  });

  it('forwards options to httpErrors (e.g. retryAfter)', () => {
    const res = createMockRes();
    endWithProblem(res, 429, {retryAfter: 60});
    const body = JSON.parse(res._body);
    assert.equal(body.status, 429);
    assert.equal(body.retryAfter, 60);
  });

  it('produces valid RFC 9457 shape for various status codes', () => {
    for (const code of [400, 401, 403, 404, 405, 415, 429, 500, 503]) {
      const res = createMockRes();
      endWithProblem(res, code);
      const body = JSON.parse(res._body);
      assert.equal(body.status, code, `status should be ${code}`);
      assert.ok(body.type, `type should be present for ${code}`);
      assert.ok(body.title, `title should be present for ${code}`);
    }
  });
});
