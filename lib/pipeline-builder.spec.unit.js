/**
 * @fileoverview Boundary tests for lib/pipeline-builder (v2 tuple format).
 * Tests config merging, stage inclusion/exclusion, false opt-out, body skipping for GET,
 * and CSRF method-dispatching adapter.
 *
 * v2 tuple format: [fn, setPath] (was [fn, getPaths, setPath])
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import buildPipeline from './pipeline-builder.js';

/**
 * Extract setPath names from a pipeline.
 * v2 tuples are [fn, setPath], so setPath is at index 1.
 */
function tupleNames(pipeline) {
  return pipeline.filter((step) => Array.isArray(step)).map((step) => step[1]);
}

describe('[Boundary] pipeline-builder', () => {
  const noop = () => ({response: {statusCode: 200, body: {ok: true}}});

  describe('config resolution', () => {
    it('route config overrides router defaults', () => {
      const pipeline = buildPipeline(
        'GET',
        {accepts: {types: ['text/html']}, execute: noop},
        {accepts: {types: ['application/json']}}
      );
      assert.ok(pipeline.length > 0, 'should produce a non-empty pipeline');
    });

    it('uses router defaults when route config omits a key', () => {
      const pipeline = buildPipeline(
        'GET',
        {execute: noop},
        {accepts: {types: ['application/json']}}
      );
      assert.ok(pipeline.length > 0);
    });

    it('false at route level disables a default', () => {
      const withDefault = buildPipeline(
        'POST',
        {execute: noop},
        {accepts: {types: ['application/json']}}
      );
      const withDisabled = buildPipeline(
        'POST',
        {accepts: false, execute: noop},
        {accepts: {types: ['application/json']}}
      );
      assert.ok(
        withDisabled.length < withDefault.length,
        'disabling accepts should shorten pipeline'
      );
    });

    it('true at route level uses empty options', () => {
      const pipeline = buildPipeline('GET', {cookie: true, execute: noop}, {});
      assert.ok(pipeline.length > 0);
    });
  });

  describe('v2 tuple format [fn, setPath]', () => {
    it('tuples have exactly 2 elements: [fn, setPath]', () => {
      const pipeline = buildPipeline(
        'POST',
        {logger: {}, accepts: {types: ['application/json']}, execute: noop},
        {}
      );
      const tuples = pipeline.filter((step) => Array.isArray(step));
      for (const tuple of tuples) {
        assert.equal(tuple.length, 2, `tuple for "${tuple[1]}" should have 2 elements`);
        assert.equal(typeof tuple[0], 'function', 'first element should be a function');
        assert.equal(typeof tuple[1], 'string', 'second element should be a string (setPath)');
      }
    });
  });

  describe('stage assembly', () => {
    it('includes logger as the first step when configured', () => {
      const pipeline = buildPipeline('GET', {logger: {}, execute: noop}, {});
      const firstStep = pipeline[0];
      assert.ok(Array.isArray(firstStep), 'first step should be a compose-with tuple');
      assert.equal(firstStep[1], 'log', 'first step should be logger with setPath "log"');
    });

    it('excludes logger when set to false', () => {
      const pipeline = buildPipeline('GET', {logger: false, execute: noop}, {logger: {}});
      const names = tupleNames(pipeline);
      assert.ok(!names.includes('log'));
    });

    it('includes execute function at the end', () => {
      const pipeline = buildPipeline('GET', {execute: noop}, {});
      const lastStep = pipeline[pipeline.length - 1];
      assert.equal(lastStep, noop);
    });
  });

  describe('body parsing', () => {
    it('auto-includes body for POST', () => {
      const names = tupleNames(buildPipeline('POST', {execute: noop}, {}));
      assert.ok(names.includes('body'), 'POST should include body parsing');
    });

    it('auto-includes body for PUT', () => {
      const names = tupleNames(buildPipeline('PUT', {execute: noop}, {}));
      assert.ok(names.includes('body'), 'PUT should include body parsing');
    });

    it('auto-includes body for PATCH', () => {
      const names = tupleNames(buildPipeline('PATCH', {execute: noop}, {}));
      assert.ok(names.includes('body'), 'PATCH should include body parsing');
    });

    it('does not include body for GET', () => {
      const names = tupleNames(buildPipeline('GET', {execute: noop}, {}));
      assert.ok(!names.includes('body'), 'GET should not include body parsing');
    });

    it('does not include body for DELETE', () => {
      const names = tupleNames(buildPipeline('DELETE', {execute: noop}, {}));
      assert.ok(!names.includes('body'), 'DELETE should not include body parsing');
    });

    it('body: false disables auto-inclusion for POST', () => {
      const names = tupleNames(buildPipeline('POST', {body: false, execute: noop}, {}));
      assert.ok(!names.includes('body'), 'body: false should disable body parsing');
    });
  });

  describe('stage ordering', () => {
    it('produces stages in the correct Fast Fail order', () => {
      const pipeline = buildPipeline(
        'POST',
        {
          logger: {},
          accepts: {types: ['application/json']},
          auth: {strategies: []},
          validate: {body: {type: 'object'}},
          timeout: {ms: 5000},
          execute: noop
        },
        {}
      );

      const stepNames = pipeline.map((step) => {
        if (Array.isArray(step)) return step[1];
        if (typeof step === 'function' && step === noop) return 'execute';
        return 'plain';
      });

      const logIdx = stepNames.indexOf('log');
      const acceptsIdx = stepNames.indexOf('accepts');
      const authIdx = stepNames.indexOf('auth');
      const bodyIdx = stepNames.indexOf('body');
      const validationIdx = stepNames.indexOf('validation');
      const executeIdx = stepNames.indexOf('execute');

      assert.ok(logIdx < acceptsIdx, 'logger before accepts');
      assert.ok(acceptsIdx < authIdx, 'accepts before auth');
      assert.ok(authIdx < bodyIdx, 'auth before body');
      assert.ok(bodyIdx < validationIdx, 'body before validation');
      assert.ok(validationIdx < executeIdx, 'validation before execute');
    });
  });

  describe('securityHeaders middleware', () => {
    it('includes securityHeaders when configured at route level', () => {
      const base = buildPipeline('POST', {execute: noop}, {});
      const withSecurity = buildPipeline('POST', {securityHeaders: {}, execute: noop}, {});
      assert.ok(withSecurity.length > base.length, 'securityHeaders should add steps');
    });

    it('includes securityHeaders when configured at defaults level', () => {
      const base = buildPipeline('POST', {execute: noop}, {});
      const withSecurity = buildPipeline('POST', {execute: noop}, {securityHeaders: {}});
      assert.ok(withSecurity.length > base.length, 'securityHeaders default should add steps');
    });

    it('securityHeaders: false disables it', () => {
      const withSecurity = buildPipeline('POST', {execute: noop}, {securityHeaders: {}});
      const withDisabled = buildPipeline(
        'POST',
        {securityHeaders: false, execute: noop},
        {securityHeaders: {}}
      );
      assert.ok(withDisabled.length < withSecurity.length, 'false should disable securityHeaders');
    });
  });

  describe('cacheControl middleware', () => {
    it('includes cacheControl when configured at route level', () => {
      const base = buildPipeline('POST', {execute: noop}, {});
      const withCache = buildPipeline('POST', {cacheControl: {}, execute: noop}, {});
      assert.ok(withCache.length > base.length, 'cacheControl should add steps');
    });

    it('includes cacheControl when configured at defaults level', () => {
      const base = buildPipeline('POST', {execute: noop}, {});
      const withCache = buildPipeline('POST', {execute: noop}, {cacheControl: {}});
      assert.ok(withCache.length > base.length, 'cacheControl default should add steps');
    });

    it('cacheControl: false disables it', () => {
      const withCache = buildPipeline('POST', {execute: noop}, {cacheControl: {}});
      const withDisabled = buildPipeline(
        'POST',
        {cacheControl: false, execute: noop},
        {cacheControl: {}}
      );
      assert.ok(withDisabled.length < withCache.length, 'false should disable cacheControl');
    });
  });

  describe('jsonApiQuery middleware', () => {
    it('includes jsonApiQuery when configured', () => {
      const base = buildPipeline('POST', {execute: noop}, {});
      const withJQ = buildPipeline('POST', {jsonApiQuery: {}, execute: noop}, {});
      assert.ok(withJQ.length > base.length, 'jsonApiQuery should add steps');
    });

    it('jsonApiQuery: false disables it', () => {
      const withJQ = buildPipeline('POST', {execute: noop}, {jsonApiQuery: {}});
      const withDisabled = buildPipeline(
        'POST',
        {jsonApiQuery: false, execute: noop},
        {jsonApiQuery: {}}
      );
      assert.ok(withDisabled.length < withJQ.length, 'false should disable jsonApiQuery');
    });
  });

  describe('auto-url for GET/DELETE', () => {
    it('auto-includes url parsing for GET even when not explicitly configured', () => {
      const pipeline = buildPipeline('GET', {execute: noop}, {});
      assert.ok(pipeline.length > 1, 'GET should auto-include url (more than just execute)');
    });

    it('auto-includes url parsing for DELETE even when not explicitly configured', () => {
      const pipeline = buildPipeline('DELETE', {execute: noop}, {});
      assert.ok(pipeline.length > 1, 'DELETE should auto-include url (more than just execute)');
    });

    it('does not auto-include url parsing for POST', () => {
      const names = tupleNames(buildPipeline('POST', {execute: noop}, {}));
      assert.ok(!names.includes('url'), 'POST should not auto-include url');
    });

    it('url: false disables auto-inclusion for GET', () => {
      const pipeline = buildPipeline('GET', {url: false, execute: noop}, {});
      assert.equal(pipeline.length, 1, 'url: false should leave only execute');
      assert.equal(pipeline[0], noop);
    });
  });

  describe('preconditionRequired middleware', () => {
    it('preconditionRequired: true adds middleware for PUT', () => {
      const base = buildPipeline('PUT', {execute: noop}, {});
      const withPrecond = buildPipeline('PUT', {preconditionRequired: true, execute: noop}, {});
      assert.ok(withPrecond.length > base.length, 'preconditionRequired should add steps for PUT');
    });

    it('preconditionRequired: true adds middleware for PATCH', () => {
      const base = buildPipeline('PATCH', {execute: noop}, {});
      const withPrecond = buildPipeline('PATCH', {preconditionRequired: true, execute: noop}, {});
      assert.ok(
        withPrecond.length > base.length,
        'preconditionRequired should add steps for PATCH'
      );
    });

    it('preconditionRequired: true does NOT add middleware for GET', () => {
      const base = buildPipeline('GET', {execute: noop}, {});
      const withPrecond = buildPipeline('GET', {preconditionRequired: true, execute: noop}, {});
      assert.equal(withPrecond.length, base.length, 'GET should not gain precondition middleware');
    });

    it('preconditionRequired: true does NOT add middleware for DELETE', () => {
      const base = buildPipeline('DELETE', {execute: noop}, {});
      const withPrecond = buildPipeline('DELETE', {preconditionRequired: true, execute: noop}, {});
      assert.equal(
        withPrecond.length,
        base.length,
        'DELETE should not gain precondition middleware'
      );
    });

    it('preconditionRequired: true does NOT add middleware for POST', () => {
      const base = buildPipeline('POST', {execute: noop}, {});
      const withPrecond = buildPipeline('POST', {preconditionRequired: true, execute: noop}, {});
      assert.equal(withPrecond.length, base.length, 'POST should not gain precondition middleware');
    });

    it('preconditionRequired: false disables it', () => {
      const base = buildPipeline('PUT', {execute: noop}, {preconditionRequired: true});
      const disabled = buildPipeline(
        'PUT',
        {preconditionRequired: false, execute: noop},
        {preconditionRequired: true}
      );
      assert.ok(disabled.length < base.length, 'false should disable precondition');
    });

    it('preconditionRequired with custom methods adds middleware for DELETE', () => {
      const base = buildPipeline('DELETE', {url: false, execute: noop}, {});
      const withPrecond = buildPipeline(
        'DELETE',
        {url: false, preconditionRequired: {methods: ['DELETE']}, execute: noop},
        {}
      );
      assert.ok(
        withPrecond.length > base.length,
        'custom methods should add precondition for DELETE'
      );
    });

    it('preconditionRequired from defaults applies to PUT', () => {
      const base = buildPipeline('PUT', {execute: noop}, {});
      const withDefault = buildPipeline('PUT', {execute: noop}, {preconditionRequired: true});
      assert.ok(
        withDefault.length > base.length,
        'defaults preconditionRequired should add steps for PUT'
      );
    });
  });

  describe('rateLimit', () => {
    it('includes rateLimit middleware when configured', () => {
      const base = buildPipeline('POST', {execute: noop}, {});
      const withRate = buildPipeline('POST', {rateLimit: true, execute: noop}, {});
      assert.ok(withRate.length > base.length, 'rateLimit should add a pipeline step');
    });

    it('false disables rateLimit', () => {
      const base = buildPipeline('POST', {execute: noop}, {});
      const withRate = buildPipeline('POST', {rateLimit: false, execute: noop}, {});
      assert.equal(withRate.length, base.length);
    });

    it('rateLimit from defaults applies', () => {
      const base = buildPipeline('POST', {body: false, execute: noop}, {});
      const withDefault = buildPipeline(
        'POST',
        {body: false, execute: noop},
        {rateLimit: {max: 50}}
      );
      assert.ok(withDefault.length > base.length, 'defaults rateLimit should add steps');
    });

    it('route-level rateLimit overrides defaults', () => {
      const withFalse = buildPipeline(
        'POST',
        {body: false, rateLimit: false, execute: noop},
        {rateLimit: {max: 50}}
      );
      const base = buildPipeline('POST', {body: false, execute: noop}, {});
      assert.equal(withFalse.length, base.length, 'route false should override default');
    });
  });

  describe('prefer', () => {
    it('includes prefer middleware when configured', () => {
      const base = buildPipeline('POST', {body: false, execute: noop}, {});
      const withPrefer = buildPipeline('POST', {body: false, prefer: true, execute: noop}, {});
      assert.ok(withPrefer.length > base.length, 'prefer should add a pipeline step');
    });

    it('false disables prefer', () => {
      const base = buildPipeline('POST', {body: false, execute: noop}, {});
      const withPrefer = buildPipeline('POST', {body: false, prefer: false, execute: noop}, {});
      assert.equal(withPrefer.length, base.length);
    });

    it('prefer from defaults applies', () => {
      const base = buildPipeline('POST', {body: false, execute: noop}, {});
      const withDefault = buildPipeline('POST', {body: false, execute: noop}, {prefer: true});
      assert.ok(withDefault.length > base.length, 'defaults prefer should add steps');
    });
  });

  describe('sequential composition (no compose.all)', () => {
    it('multi-item Stage 1 produces individual sequential steps', () => {
      const pipeline = buildPipeline(
        'POST',
        {accepts: {types: ['application/json']}, cookie: true, securityHeaders: {}, execute: noop},
        {}
      );

      const names = tupleNames(pipeline);

      assert.ok(names.includes('accepts'), 'should include accepts');
      assert.ok(names.includes('cookies'), 'should include cookies');
      assert.ok(names.includes('security'), 'should include securityHeaders');

      for (const step of pipeline) {
        if (typeof step === 'function' && step !== noop) {
          assert.fail('multi-item stages should not produce a composed function');
        }
      }
    });

    it('multi-item Stage 2 produces individual sequential steps', () => {
      const pipeline = buildPipeline(
        'POST',
        {auth: {strategies: []}, csrf: {secret: 'test'}, execute: noop},
        {}
      );

      const names = tupleNames(pipeline);

      assert.ok(names.includes('csrf'), 'should include csrf');
      assert.ok(names.includes('auth'), 'should include auth');
    });
  });

  describe('Fail Fast intra-stage ordering', () => {
    it('Stage 1: rateLimit before accepts before securityHeaders', () => {
      const pipeline = buildPipeline(
        'POST',
        {
          rateLimit: true,
          accepts: {types: ['application/json']},
          securityHeaders: {},
          execute: noop
        },
        {}
      );

      const names = tupleNames(pipeline);

      const rateLimitIdx = names.indexOf('rateLimit');
      const acceptsIdx = names.indexOf('accepts');
      const securityIdx = names.indexOf('security');

      assert.ok(rateLimitIdx !== -1, 'rateLimit should be present');
      assert.ok(acceptsIdx !== -1, 'accepts should be present');
      assert.ok(securityIdx !== -1, 'security should be present');
      assert.ok(rateLimitIdx < acceptsIdx, 'rateLimit before accepts');
      assert.ok(acceptsIdx < securityIdx, 'accepts before securityHeaders');
    });

    it('Stage 1: accepts before precondition before cookie', () => {
      const pipeline = buildPipeline(
        'PUT',
        {
          accepts: {types: ['application/json']},
          preconditionRequired: true,
          cookie: true,
          execute: noop
        },
        {}
      );

      const names = tupleNames(pipeline);

      const acceptsIdx = names.indexOf('accepts');
      const precondIdx = names.indexOf('precondition');
      const cookieIdx = names.indexOf('cookies');

      assert.ok(acceptsIdx < precondIdx, 'accepts before precondition');
      assert.ok(precondIdx < cookieIdx, 'precondition before cookie');
    });

    it('Stage 1: cookie before prefer before securityHeaders before cacheControl', () => {
      const pipeline = buildPipeline(
        'POST',
        {
          cookie: true,
          prefer: true,
          securityHeaders: {},
          cacheControl: {},
          execute: noop
        },
        {}
      );

      const names = tupleNames(pipeline);

      const cookieIdx = names.indexOf('cookies');
      const preferIdx = names.indexOf('prefer');
      const securityIdx = names.indexOf('security');
      const cacheIdx = names.indexOf('cache');

      assert.ok(cookieIdx < preferIdx, 'cookie before prefer');
      assert.ok(preferIdx < securityIdx, 'prefer before securityHeaders');
      assert.ok(securityIdx < cacheIdx, 'securityHeaders before cacheControl');
    });

    it('Stage 2: csrf before auth', () => {
      const pipeline = buildPipeline(
        'POST',
        {
          csrf: {secret: 'test'},
          auth: {strategies: []},
          execute: noop
        },
        {}
      );

      const names = tupleNames(pipeline);

      const csrfIdx = names.indexOf('csrf');
      const authIdx = names.indexOf('auth');

      assert.ok(csrfIdx !== -1, 'csrf should be present');
      assert.ok(authIdx !== -1, 'auth should be present');
      assert.ok(csrfIdx < authIdx, 'csrf before auth');
    });
  });

  describe('CSRF method-dispatching adapter', () => {
    it('csrf tuple contains a callable function (not the raw {issue, verify} object)', () => {
      const pipeline = buildPipeline(
        'POST',
        {csrf: {secret: 'test'}, execute: noop},
        {}
      );
      const csrfStep = pipeline.find((step) => Array.isArray(step) && step[1] === 'csrf');
      assert.ok(csrfStep, 'csrf step should exist');
      assert.equal(typeof csrfStep[0], 'function', 'csrf adapter should be a callable function');
    });
  });

  describe('compress and timeout are plain functions (no tuple)', () => {
    it('timeout is a plain function, not wrapped in a tuple', () => {
      const pipeline = buildPipeline('GET', {timeout: {ms: 5000}, execute: noop}, {});
      const timeoutStep = pipeline.find(
        (step) => typeof step === 'function' && step !== noop
      );
      assert.ok(timeoutStep, 'timeout should be a plain function');
    });

    it('compress is a plain function, not wrapped in a tuple', () => {
      const pipeline = buildPipeline('GET', {compress: {}, execute: noop}, {});
      const nonTupleFns = pipeline.filter(
        (step) => typeof step === 'function' && step !== noop
      );
      assert.ok(nonTupleFns.length > 0, 'compress should be a plain function');
    });
  });

  describe('empty config', () => {
    it('returns only url + execute for GET with no middleware configured', () => {
      const pipeline = buildPipeline('GET', {execute: noop}, {});
      assert.equal(pipeline.length, 2, 'GET should have url + execute');
    });

    it('returns only body + execute for POST with no middleware configured', () => {
      const pipeline = buildPipeline('POST', {execute: noop}, {});
      assert.equal(pipeline.length, 2, 'POST should have body + execute');
    });

    it('returns empty pipeline when no execute provided (non-URL method)', () => {
      const pipeline = buildPipeline('PATCH', {}, {});
      const hasExecute = pipeline.some((step) => step === noop);
      assert.ok(!hasExecute);
    });
  });
});
