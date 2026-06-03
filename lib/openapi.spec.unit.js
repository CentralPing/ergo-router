/**
 * @fileoverview Boundary tests for lib/openapi.
 *
 * Black-box tests for the OpenAPI 3.1 specification generator. Covers path
 * parameter conversion, body/query/params schema extraction, authorization
 * strategy mapping, manual annotations, defaults resolution, sub-router
 * prefix handling, non-config routes, and structural OpenAPI 3.1 validity.
 */
import {describe, it} from 'node:test';
import assert from 'node:assert/strict';
import {Validator} from '@seriousme/openapi-schema-validator';
import createRouter from './router.js';
import generateOpenAPI from './openapi.js';

const noop = () => ({response: {body: {ok: true}}});

/**
 * Validate that a generated spec conforms to OpenAPI 3.1.
 *
 * @param {object} spec - OpenAPI document to validate
 */
async function assertValidOpenAPI(spec) {
  const validator = new Validator();
  const result = await validator.validate(spec);
  assert.equal(
    result.valid,
    true,
    `OpenAPI validation errors: ${JSON.stringify(result.errors, null, 2)}`
  );
}

describe('[Boundary] openapi', () => {
  describe('generateOpenAPI()', () => {
    it('produces a minimal valid OpenAPI 3.1 document', async () => {
      const router = createRouter();
      router.get('/health', noop);
      const spec = generateOpenAPI(router);

      assert.equal(spec.openapi, '3.1.0');
      assert.equal(spec.info.title, 'API');
      assert.equal(spec.info.version, '1.0.0');
      assert.ok(spec.paths['/health']);
      assert.ok(spec.paths['/health'].get);
      await assertValidOpenAPI(spec);
    });

    it('accepts custom info options', async () => {
      const router = createRouter();
      router.get('/ping', noop);
      const spec = generateOpenAPI(router, {
        title: 'My API',
        version: '2.0.0',
        description: 'A test API'
      });

      assert.equal(spec.info.title, 'My API');
      assert.equal(spec.info.version, '2.0.0');
      assert.equal(spec.info.description, 'A test API');
      await assertValidOpenAPI(spec);
    });

    it('accepts servers array', async () => {
      const router = createRouter();
      router.get('/ping', noop);
      const spec = generateOpenAPI(router, {
        servers: [{url: 'https://api.example.com'}]
      });

      assert.deepStrictEqual(spec.servers, [{url: 'https://api.example.com'}]);
      await assertValidOpenAPI(spec);
    });

    it('merges extra info properties', async () => {
      const router = createRouter();
      router.get('/ping', noop);
      const spec = generateOpenAPI(router, {
        info: {
          termsOfService: 'https://example.com/tos',
          contact: {name: 'Support', email: 'support@example.com'}
        }
      });

      assert.equal(spec.info.termsOfService, 'https://example.com/tos');
      assert.deepStrictEqual(spec.info.contact, {name: 'Support', email: 'support@example.com'});
      await assertValidOpenAPI(spec);
    });
  });

  describe('path parameter conversion', () => {
    it('converts :param to {param}', async () => {
      const router = createRouter();
      router.get('/users/:id', {execute: noop});
      const spec = generateOpenAPI(router);

      assert.ok(spec.paths['/users/{id}']);
      const params = spec.paths['/users/{id}'].get.parameters;
      assert.equal(params.length, 1);
      assert.equal(params[0].name, 'id');
      assert.equal(params[0].in, 'path');
      assert.equal(params[0].required, true);
      await assertValidOpenAPI(spec);
    });

    it('converts multiple :params', async () => {
      const router = createRouter();
      router.get('/orgs/:orgId/users/:userId', {execute: noop});
      const spec = generateOpenAPI(router);

      assert.ok(spec.paths['/orgs/{orgId}/users/{userId}']);
      const params = spec.paths['/orgs/{orgId}/users/{userId}'].get.parameters;
      assert.equal(params.length, 2);
      assert.equal(params[0].name, 'orgId');
      assert.equal(params[1].name, 'userId');
      await assertValidOpenAPI(spec);
    });

    it('converts * wildcard to {wildcard}', async () => {
      const router = createRouter();
      router.get('/files/*', {execute: noop});
      const spec = generateOpenAPI(router);

      assert.ok(spec.paths['/files/{wildcard}']);
      const params = spec.paths['/files/{wildcard}'].get.parameters;
      assert.equal(params.length, 1);
      assert.equal(params[0].name, 'wildcard');
      assert.equal(params[0].in, 'path');
      await assertValidOpenAPI(spec);
    });

    it('enriches path params with validation schema', async () => {
      const router = createRouter();
      router.get('/users/:id', {
        validate: {
          params: {
            type: 'object',
            properties: {id: {type: 'string', format: 'uuid'}}
          }
        },
        execute: noop
      });
      const spec = generateOpenAPI(router);

      const param = spec.paths['/users/{id}'].get.parameters[0];
      assert.deepStrictEqual(param.schema, {type: 'string', format: 'uuid'});
      await assertValidOpenAPI(spec);
    });
  });

  describe('query parameters', () => {
    it('extracts query params from validate.query', async () => {
      const router = createRouter();
      router.get('/search', {
        validate: {
          query: {
            type: 'object',
            properties: {
              q: {type: 'string'},
              limit: {type: 'integer'}
            },
            required: ['q']
          }
        },
        execute: noop
      });
      const spec = generateOpenAPI(router);

      const params = spec.paths['/search'].get.parameters;
      assert.equal(params.length, 2);
      const qParam = params.find(p => p.name === 'q');
      const limitParam = params.find(p => p.name === 'limit');
      assert.equal(qParam.in, 'query');
      assert.equal(qParam.required, true);
      assert.deepStrictEqual(qParam.schema, {type: 'string'});
      assert.equal(limitParam.in, 'query');
      assert.equal(limitParam.required, undefined);
      assert.deepStrictEqual(limitParam.schema, {type: 'integer'});
      await assertValidOpenAPI(spec);
    });
  });

  describe('request body', () => {
    it('extracts body schema for POST routes', async () => {
      const router = createRouter();
      router.post('/users', {
        validate: {
          body: {type: 'object', properties: {name: {type: 'string'}}, required: ['name']}
        },
        execute: noop
      });
      const spec = generateOpenAPI(router);

      const op = spec.paths['/users'].post;
      assert.ok(op.requestBody);
      assert.equal(op.requestBody.required, true);
      const jsonContent = op.requestBody.content['application/json'];
      assert.ok(jsonContent);
      assert.deepStrictEqual(jsonContent.schema, {
        type: 'object',
        properties: {name: {type: 'string'}},
        required: ['name']
      });
      await assertValidOpenAPI(spec);
    });

    it('uses accepts.types for requestBody content type', async () => {
      const router = createRouter();
      router.post('/data', {
        accepts: {types: ['application/xml']},
        validate: {body: {type: 'string'}},
        execute: noop
      });
      const spec = generateOpenAPI(router);

      const op = spec.paths['/data'].post;
      assert.ok(op.requestBody.content['application/xml']);
      await assertValidOpenAPI(spec);
    });

    it('does not produce requestBody for GET routes with body schema', async () => {
      const router = createRouter();
      router.get('/query', {
        validate: {body: {type: 'object'}},
        execute: noop
      });
      const spec = generateOpenAPI(router);

      assert.equal(spec.paths['/query'].get.requestBody, undefined);
      await assertValidOpenAPI(spec);
    });
  });

  describe('authorization / security', () => {
    it('maps Bearer strategy to http/bearer scheme', async () => {
      const router = createRouter();
      router.get('/protected', {
        authorization: {strategies: [{type: 'Bearer', authorizer: noop}]},
        execute: noop
      });
      const spec = generateOpenAPI(router);

      assert.ok(spec.components?.securitySchemes?.Bearer);
      assert.deepStrictEqual(spec.components.securitySchemes.Bearer, {
        type: 'http',
        scheme: 'bearer'
      });
      const op = spec.paths['/protected'].get;
      assert.deepStrictEqual(op.security, [{Bearer: []}]);
      await assertValidOpenAPI(spec);
    });

    it('maps Basic strategy to http/basic scheme', async () => {
      const router = createRouter();
      router.get('/basic', {
        authorization: {strategies: [{type: 'Basic', authorizer: noop}]},
        execute: noop
      });
      const spec = generateOpenAPI(router);

      assert.deepStrictEqual(spec.components.securitySchemes.Basic, {
        type: 'http',
        scheme: 'basic'
      });
      await assertValidOpenAPI(spec);
    });

    it('maps custom strategy to apiKey scheme', async () => {
      const router = createRouter();
      router.get('/custom-auth', {
        authorization: {strategies: [{type: 'X-API-Key', authorizer: noop}]},
        execute: noop
      });
      const spec = generateOpenAPI(router);

      assert.deepStrictEqual(spec.components.securitySchemes['X-API-Key'], {
        type: 'apiKey',
        in: 'header',
        name: 'Authorization'
      });
      await assertValidOpenAPI(spec);
    });

    it('does not produce components when no auth strategies', async () => {
      const router = createRouter();
      router.get('/public', {execute: noop});
      const spec = generateOpenAPI(router);

      assert.equal(spec.components, undefined);
      await assertValidOpenAPI(spec);
    });
  });

  describe('openapi annotations', () => {
    it('merges summary, description, tags from annotations', async () => {
      const router = createRouter();
      router.get('/users', {
        openapi: {
          summary: 'List users',
          description: 'Returns a paginated list of users',
          tags: ['Users']
        },
        execute: noop
      });
      const spec = generateOpenAPI(router);

      const op = spec.paths['/users'].get;
      assert.equal(op.summary, 'List users');
      assert.equal(op.description, 'Returns a paginated list of users');
      assert.deepStrictEqual(op.tags, ['Users']);
      await assertValidOpenAPI(spec);
    });

    it('merges operationId from annotations', async () => {
      const router = createRouter();
      router.get('/users', {
        openapi: {operationId: 'listUsers'},
        execute: noop
      });
      const spec = generateOpenAPI(router);

      assert.equal(spec.paths['/users'].get.operationId, 'listUsers');
      await assertValidOpenAPI(spec);
    });

    it('merges deprecated flag from annotations', async () => {
      const router = createRouter();
      router.get('/old', {
        openapi: {deprecated: true},
        execute: noop
      });
      const spec = generateOpenAPI(router);

      assert.equal(spec.paths['/old'].get.deprecated, true);
      await assertValidOpenAPI(spec);
    });

    it('uses annotation responses over default', async () => {
      const router = createRouter();
      router.post('/users', {
        openapi: {
          responses: {
            201: {description: 'User created'},
            400: {description: 'Validation error'}
          }
        },
        execute: noop
      });
      const spec = generateOpenAPI(router);

      const op = spec.paths['/users'].post;
      assert.deepStrictEqual(op.responses, {
        201: {description: 'User created'},
        400: {description: 'Validation error'}
      });
      await assertValidOpenAPI(spec);
    });

    it('produces default 200 response when no annotation responses', async () => {
      const router = createRouter();
      router.get('/ping', {execute: noop});
      const spec = generateOpenAPI(router);

      assert.deepStrictEqual(spec.paths['/ping'].get.responses, {
        200: {description: 'Successful response'}
      });
      await assertValidOpenAPI(spec);
    });

    it('merges externalDocs from annotations', async () => {
      const router = createRouter();
      router.get('/info', {
        openapi: {externalDocs: {url: 'https://docs.example.com', description: 'Docs'}},
        execute: noop
      });
      const spec = generateOpenAPI(router);

      assert.deepStrictEqual(spec.paths['/info'].get.externalDocs, {
        url: 'https://docs.example.com',
        description: 'Docs'
      });
      await assertValidOpenAPI(spec);
    });
  });

  describe('defaults resolution', () => {
    it('inherits auth strategies from router defaults', async () => {
      const router = createRouter({
        defaults: {authorization: {strategies: [{type: 'Bearer', authorizer: noop}]}}
      });
      router.get('/protected', {execute: noop});
      const spec = generateOpenAPI(router);

      const op = spec.paths['/protected'].get;
      assert.deepStrictEqual(op.security, [{Bearer: []}]);
      assert.ok(spec.components?.securitySchemes?.Bearer);
      await assertValidOpenAPI(spec);
    });

    it('inherits validate schemas from router defaults', async () => {
      const router = createRouter({
        defaults: {
          validate: {
            query: {
              type: 'object',
              properties: {page: {type: 'integer'}},
              required: ['page']
            }
          }
        }
      });
      router.get('/items', {execute: noop});
      const spec = generateOpenAPI(router);

      const params = spec.paths['/items'].get.parameters;
      assert.equal(params.length, 1);
      assert.equal(params[0].name, 'page');
      assert.equal(params[0].in, 'query');
      await assertValidOpenAPI(spec);
    });

    it('route-level config overrides defaults', async () => {
      const router = createRouter({
        defaults: {authorization: {strategies: [{type: 'Bearer', authorizer: noop}]}}
      });
      router.get('/public', {authorization: false, execute: noop});
      const spec = generateOpenAPI(router);

      const op = spec.paths['/public'].get;
      assert.equal(op.security, undefined);
      await assertValidOpenAPI(spec);
    });

    it('inherits accepts.types from defaults for requestBody content type', async () => {
      const router = createRouter({
        defaults: {accepts: {types: ['application/xml']}}
      });
      router.post('/data', {
        validate: {body: {type: 'object'}},
        execute: noop
      });
      const spec = generateOpenAPI(router);

      assert.ok(spec.paths['/data'].post.requestBody.content['application/xml']);
      await assertValidOpenAPI(spec);
    });
  });

  describe('non-config routes', () => {
    it('produces minimal entry for raw function handlers', async () => {
      const router = createRouter();
      router.get('/raw', (req, res) => res.end('ok'));
      const spec = generateOpenAPI(router);

      assert.ok(spec.paths['/raw']);
      assert.ok(spec.paths['/raw'].get);
      assert.deepStrictEqual(spec.paths['/raw'].get, {});
      await assertValidOpenAPI(spec);
    });

    it('produces minimal entry for array pipeline handlers', async () => {
      const router = createRouter();
      router.get('/arr', [noop]);
      const spec = generateOpenAPI(router);

      assert.ok(spec.paths['/arr']);
      assert.deepStrictEqual(spec.paths['/arr'].get, {});
      await assertValidOpenAPI(spec);
    });
  });

  describe('sub-router mounted routes', () => {
    it('includes child routes with prefix', async () => {
      const child = createRouter();
      child.get('/items', {
        openapi: {summary: 'List items'},
        execute: noop
      });
      child.get('/items/:id', {
        validate: {params: {type: 'object', properties: {id: {type: 'string'}}}},
        execute: noop
      });

      const parent = createRouter();
      parent.mount('/api/v1', child);
      const spec = generateOpenAPI(parent);

      assert.ok(spec.paths['/api/v1/items']);
      assert.equal(spec.paths['/api/v1/items'].get.summary, 'List items');
      assert.ok(spec.paths['/api/v1/items/{id}']);
      const param = spec.paths['/api/v1/items/{id}'].get.parameters[0];
      assert.equal(param.name, 'id');
      await assertValidOpenAPI(spec);
    });
  });

  describe('multiple methods on same path', () => {
    it('groups methods under the same path object', async () => {
      const router = createRouter();
      router.get('/users', {
        openapi: {summary: 'List users'},
        execute: noop
      });
      router.post('/users', {
        validate: {body: {type: 'object', properties: {name: {type: 'string'}}}},
        openapi: {summary: 'Create user'},
        execute: noop
      });
      const spec = generateOpenAPI(router);

      assert.ok(spec.paths['/users'].get);
      assert.ok(spec.paths['/users'].post);
      assert.equal(spec.paths['/users'].get.summary, 'List users');
      assert.equal(spec.paths['/users'].post.summary, 'Create user');
      await assertValidOpenAPI(spec);
    });
  });

  describe('router._routes metadata', () => {
    it('stores config for declarative routes', () => {
      const router = createRouter();
      const config = {execute: noop, openapi: {summary: 'Test'}};
      router.get('/test', config);

      assert.equal(router._routes.length, 1);
      assert.equal(router._routes[0].method, 'GET');
      assert.equal(router._routes[0].path, '/test');
      assert.equal(router._routes[0].config, config);
    });

    it('stores undefined config for non-config routes', () => {
      const router = createRouter();
      router.get('/raw', (req, res) => res.end());

      assert.equal(router._routes.length, 1);
      assert.equal(router._routes[0].config, undefined);
    });

    it('copies child routes with prefixed path on mount', () => {
      const child = createRouter();
      child.get('/items', {execute: noop});
      child.post('/items', {execute: noop});

      const parent = createRouter();
      parent.mount('/api', child);

      const mounted = parent._routes.filter(r => r.path.startsWith('/api'));
      assert.equal(mounted.length, 2);
      assert.equal(mounted[0].path, '/api/items');
      assert.equal(mounted[1].path, '/api/items');
      assert.equal(mounted[0].method, 'GET');
      assert.equal(mounted[1].method, 'POST');
    });
  });
});
