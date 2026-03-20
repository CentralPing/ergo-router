/**
 * @fileoverview Layer 1 boundary tests for lib/transport/request-id.
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import createRequestId from './request-id.js';
import {createMockReq, createMockRes} from '../../test/helpers.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

describe('[Boundary] transport/request-id', () => {
  it('generates a UUID and sets it as a response header', () => {
    const apply = createRequestId();
    const req = createMockReq();
    const res = createMockRes();
    const id = apply(req, res);
    assert.match(id, UUID_RE);
    assert.equal(res.getHeader('x-request-id'), id);
  });

  it('returns the generated request ID from the function', () => {
    const apply = createRequestId();
    const req = createMockReq();
    const res = createMockRes();
    const returned = apply(req, res);
    assert.match(returned, UUID_RE);
  });

  it('generates a new UUID for each request', () => {
    const apply = createRequestId();
    const id1 = apply(createMockReq(), createMockRes());
    const id2 = apply(createMockReq(), createMockRes());
    assert.notEqual(id1, id2);
  });

  it('uses a custom generate function when provided', () => {
    const apply = createRequestId({generate: () => 'fixed-id'});
    const res = createMockRes();
    const id = apply(createMockReq(), res);
    assert.equal(id, 'fixed-id');
    assert.equal(res.getHeader('x-request-id'), 'fixed-id');
  });

  it('uses a custom header name', () => {
    const apply = createRequestId({header: 'x-trace-id'});
    const res = createMockRes();
    apply(createMockReq(), res);
    assert.ok(res.getHeader('x-trace-id'));
    assert.equal(res.getHeader('x-request-id'), undefined);
  });

  describe('trustProxy', () => {
    const validUUID = '550e8400-e29b-41d4-a716-446655440000';

    it('reuses a valid incoming UUID when trustProxy=true', () => {
      const apply = createRequestId({trustProxy: true});
      const req = createMockReq({headers: {'x-request-id': validUUID}});
      const res = createMockRes();
      const id = apply(req, res);
      assert.equal(id, validUUID);
      assert.equal(res.getHeader('x-request-id'), validUUID);
    });

    it('generates a new ID when trustProxy=true but no header present', () => {
      const apply = createRequestId({trustProxy: true});
      const req = createMockReq();
      const res = createMockRes();
      const id = apply(req, res);
      assert.match(id, UUID_RE);
    });

    it('ignores the incoming header when trustProxy=false (default)', () => {
      const apply = createRequestId({trustProxy: false});
      const req = createMockReq({headers: {'x-request-id': validUUID}});
      const res = createMockRes();
      const id = apply(req, res);
      assert.notEqual(id, validUUID);
      assert.match(id, UUID_RE);
    });

    it('rejects incoming header containing CRLF and generates new ID', () => {
      const apply = createRequestId({trustProxy: true});
      const req = createMockReq({headers: {'x-request-id': 'bad\r\nInjected: header'}});
      const res = createMockRes();
      const id = apply(req, res);
      assert.match(id, UUID_RE);
    });

    it('rejects incoming header with non-UUID format and generates new ID', () => {
      const apply = createRequestId({trustProxy: true});
      const req = createMockReq({headers: {'x-request-id': 'not-a-uuid-at-all'}});
      const res = createMockRes();
      const id = apply(req, res);
      assert.match(id, UUID_RE);
    });

    it('rejects oversized incoming header and generates new ID', () => {
      const apply = createRequestId({trustProxy: true});
      const req = createMockReq({headers: {'x-request-id': 'a'.repeat(200)}});
      const res = createMockRes();
      const id = apply(req, res);
      assert.match(id, UUID_RE);
    });

    it('uses custom validate function when provided', () => {
      const apply = createRequestId({
        trustProxy: true,
        validate: v => typeof v === 'string' && v.startsWith('trace-')
      });
      const req = createMockReq({headers: {'x-request-id': 'trace-abc123'}});
      const res = createMockRes();
      const id = apply(req, res);
      assert.equal(id, 'trace-abc123');
    });

    it('rejects value failing custom validate', () => {
      const apply = createRequestId({
        trustProxy: true,
        validate: v => typeof v === 'string' && v.startsWith('trace-')
      });
      const req = createMockReq({headers: {'x-request-id': 'bad-prefix-123'}});
      const res = createMockRes();
      const id = apply(req, res);
      assert.match(id, UUID_RE);
    });
  });
});
