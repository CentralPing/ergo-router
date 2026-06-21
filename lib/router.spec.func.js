/**
 * @fileoverview Layer 3 contract tests for the full ergo-router HTTP handler.
 * Uses a real HTTP server and undici.fetch for end-to-end verification.
 */
import {describe, it, before, after} from 'node:test';
import assert from 'node:assert/strict';
import {setupServer, fetch} from '../test/helpers.js';
import createRouter from './router.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a minimal router with a set of routes and start the server.
 * @param {function} configure - (router) => void
 * @param {object} [routerOpts]
 * @returns {Promise<{baseUrl: string, close: function}>}
 */
async function makeServer(configure, routerOpts = {}) {
  const router = createRouter(routerOpts);
  configure(router);
  return setupServer(router.handle());
}

// ---------------------------------------------------------------------------
// Basic routing
// ---------------------------------------------------------------------------
describe('[Contract] router – basic routing', () => {
  let baseUrl, close;

  before(async () => {
    ({baseUrl, close} = await makeServer(r => {
      r.get('/hello', (req, res) => {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'text/plain');
        res.end('hello world');
      });

      r.get('/users/:id', (req, res, params) => {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({id: params.id}));
      });

      r.post('/items', (req, res) => {
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({created: true}));
      });

      r.delete('/items/:id', (req, res) => {
        res.end();
      });
    }));
  });

  after(() => close());

  it('GET /hello returns 200 with body', async () => {
    const res = await fetch(`${baseUrl}/hello`);
    assert.equal(res.status, 200);
    assert.equal(await res.text(), 'hello world');
  });

  it('GET /unknown returns 404 with RFC 9457 body', async () => {
    const res = await fetch(`${baseUrl}/unknown`);
    assert.equal(res.status, 404);
    assert.equal(res.headers.get('content-type'), 'application/problem+json; charset=utf-8');
    const body = await res.json();
    assert.equal(body.status, 404);
    assert.equal(body.title, 'Not Found');
    assert.ok(body.type);
  });

  it('DELETE on a GET-only path returns 405 with Allow header and RFC 9457 body', async () => {
    const res = await fetch(`${baseUrl}/hello`, {method: 'DELETE'});
    assert.equal(res.status, 405);
    const allow = res.headers.get('allow') || '';
    assert.ok(allow.includes('GET'));
    assert.equal(res.headers.get('content-type'), 'application/problem+json; charset=utf-8');
    const body = await res.json();
    assert.equal(body.status, 405);
    assert.equal(body.title, 'Method Not Allowed');
  });

  it('passes route params as third argument to raw handlers', async () => {
    const res = await fetch(`${baseUrl}/users/99`);
    const body = await res.json();
    assert.equal(body.id, '99');
  });

  it('POST defaults to 201 Created', async () => {
    const res = await fetch(`${baseUrl}/items`, {
      method: 'POST',
      headers: {'content-type': 'application/json'},
      body: '{}'
    });
    assert.equal(res.status, 201);
  });

  it('DELETE defaults to 204 No Content', async () => {
    const res = await fetch(`${baseUrl}/items/1`, {method: 'DELETE'});
    assert.equal(res.status, 204);
  });

  it('query string is ignored during routing', async () => {
    const res = await fetch(`${baseUrl}/hello?foo=bar`);
    assert.equal(res.status, 200);
  });
});

// ---------------------------------------------------------------------------
// HEAD method (RFC 7230 §3.3)
// ---------------------------------------------------------------------------
describe('[Contract] router – HEAD method', () => {
  let baseUrl, close;

  before(async () => {
    ({baseUrl, close} = await makeServer(r => {
      r.get('/resource', (req, res) => {
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Length', '25');
        res.end(JSON.stringify({data: 'value'}));
      });
    }));
  });

  after(() => close());

  it('HEAD request succeeds (200) using the GET handler', async () => {
    const res = await fetch(`${baseUrl}/resource`, {method: 'HEAD'});
    assert.equal(res.status, 200);
  });

  it('HEAD response has no body', async () => {
    const res = await fetch(`${baseUrl}/resource`, {method: 'HEAD'});
    const text = await res.text();
    assert.equal(text, '');
  });

  it('HEAD response preserves headers set by the GET handler', async () => {
    const res = await fetch(`${baseUrl}/resource`, {method: 'HEAD'});
    assert.equal(res.headers.get('content-type'), 'application/json');
  });
});

// ---------------------------------------------------------------------------
// OPTIONS automatic response
// ---------------------------------------------------------------------------
describe('[Contract] router – OPTIONS', () => {
  let baseUrl, close;

  before(async () => {
    ({baseUrl, close} = await makeServer(r => {
      r.get('/things', (req, res) => res.end());
      r.post('/things', (req, res) => res.end());
    }));
  });

  after(() => close());

  it('OPTIONS on known path returns 204', async () => {
    const res = await fetch(`${baseUrl}/things`, {method: 'OPTIONS'});
    assert.equal(res.status, 204);
  });

  it('Allow header includes registered methods and OPTIONS', async () => {
    const res = await fetch(`${baseUrl}/things`, {method: 'OPTIONS'});
    const allow = res.headers.get('allow') || '';
    assert.ok(allow.includes('GET'));
    assert.ok(allow.includes('POST'));
    assert.ok(allow.includes('OPTIONS'));
  });
});

// ---------------------------------------------------------------------------
// PATCH Content-Type enforcement
// ---------------------------------------------------------------------------
describe('[Contract] router – PATCH strictPatch', () => {
  let baseUrl, close;

  before(async () => {
    ({baseUrl, close} = await makeServer(
      r => {
        r.patch('/items/:id', (req, res) => {
          res.statusCode = 200;
          res.end('patched');
        });
      },
      {strictPatch: true}
    ));
  });

  after(() => close());

  it('returns 415 for PATCH with text/plain Content-Type', async () => {
    const res = await fetch(`${baseUrl}/items/1`, {
      method: 'PATCH',
      headers: {'content-type': 'text/plain'},
      body: 'data'
    });
    assert.equal(res.status, 415);
  });

  it('sets Accept-Patch header on 415 response', async () => {
    const res = await fetch(`${baseUrl}/items/1`, {
      method: 'PATCH',
      headers: {'content-type': 'text/html'},
      body: 'data'
    });
    assert.ok(res.headers.get('accept-patch'));
  });

  it('allows PATCH with application/json', async () => {
    const res = await fetch(`${baseUrl}/items/1`, {
      method: 'PATCH',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({x: 1})
    });
    assert.equal(res.status, 200);
  });

  it('allows PATCH with application/merge-patch+json', async () => {
    const res = await fetch(`${baseUrl}/items/1`, {
      method: 'PATCH',
      headers: {'content-type': 'application/merge-patch+json'},
      body: JSON.stringify({x: 1})
    });
    assert.equal(res.status, 200);
  });
});

// ---------------------------------------------------------------------------
// PATCH merge-patch body parsing (declarative pipeline)
// ---------------------------------------------------------------------------
describe('[Contract] router – PATCH merge-patch body parsing', () => {
  let baseUrl, close;

  before(async () => {
    ({baseUrl, close} = await makeServer(
      r => {
        r.patch('/items/:id', {
          execute: (req, res, acc) => ({response: {body: acc.body.parsed}})
        });
      },
      {strictPatch: true, transport: {requestId: false, security: false}}
    ));
  });

  after(() => close());

  it('parses application/merge-patch+json body through declarative pipeline', async () => {
    const payload = {title: 'updated'};
    const res = await fetch(`${baseUrl}/items/1`, {
      method: 'PATCH',
      headers: {'content-type': 'application/merge-patch+json'},
      body: JSON.stringify(payload)
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, payload);
  });

  it('parses application/json-patch+json body through declarative pipeline', async () => {
    const payload = [{op: 'replace', path: '/title', value: 'updated'}];
    const res = await fetch(`${baseUrl}/items/1`, {
      method: 'PATCH',
      headers: {'content-type': 'application/json-patch+json'},
      body: JSON.stringify(payload)
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, payload);
  });

  it('parses application/json body through declarative pipeline', async () => {
    const payload = {title: 'updated'};
    const res = await fetch(`${baseUrl}/items/1`, {
      method: 'PATCH',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify(payload)
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.deepEqual(body, payload);
  });
});

// ---------------------------------------------------------------------------
// Transport layer – request ID
// ---------------------------------------------------------------------------
describe('[Contract] router – transport request ID', () => {
  let baseUrl, close;

  before(async () => {
    ({baseUrl, close} = await makeServer(
      r => {
        r.get('/ping', (req, res) => {
          res.statusCode = 200;
          res.end('pong');
        });
      },
      {transport: {requestId: {}, security: false}}
    ));
  });

  after(() => close());

  it('adds x-request-id to every response', async () => {
    const res = await fetch(`${baseUrl}/ping`);
    assert.ok(res.headers.get('x-request-id'), 'x-request-id must be present');
  });

  it('generates a unique request ID per request', async () => {
    const res1 = await fetch(`${baseUrl}/ping`);
    const res2 = await fetch(`${baseUrl}/ping`);
    assert.notEqual(res1.headers.get('x-request-id'), res2.headers.get('x-request-id'));
  });
});

// ---------------------------------------------------------------------------
// Transport layer – security headers
// ---------------------------------------------------------------------------
describe('[Contract] router – transport security headers', () => {
  let baseUrl, close;

  before(async () => {
    ({baseUrl, close} = await makeServer(
      r => {
        r.get('/ping', (req, res) => {
          res.statusCode = 200;
          res.end('pong');
        });
      },
      {transport: {requestId: false, security: {}}}
    ));
  });

  after(() => close());

  it('sets X-Content-Type-Options: nosniff', async () => {
    const res = await fetch(`${baseUrl}/ping`);
    assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  });

  it('sets X-Frame-Options', async () => {
    const res = await fetch(`${baseUrl}/ping`);
    assert.ok(res.headers.get('x-frame-options'));
  });

  it('does not set Cache-Control (handled at pipeline level)', async () => {
    const res = await fetch(`${baseUrl}/ping`);
    assert.equal(res.headers.get('cache-control'), null);
  });

  it('sets Referrer-Policy: no-referrer', async () => {
    const res = await fetch(`${baseUrl}/ping`);
    assert.equal(res.headers.get('referrer-policy'), 'no-referrer');
  });

  it('does NOT set HSTS on plain HTTP', async () => {
    const res = await fetch(`${baseUrl}/ping`);
    // HTTP server — HSTS must not be sent (RFC 6797 §7.2)
    assert.equal(res.headers.get('strict-transport-security'), null);
  });
});

// ---------------------------------------------------------------------------
// Transport layer – rate limiting
// ---------------------------------------------------------------------------
describe('[Contract] router – transport rate limit', () => {
  let baseUrl, close;

  before(async () => {
    ({baseUrl, close} = await makeServer(
      r => {
        r.get('/api', (req, res) => {
          res.statusCode = 200;
          res.end('ok');
        });
      },
      {transport: {requestId: false, security: false, rateLimit: {max: 2, windowMs: 60000}}}
    ));
  });

  after(() => close());

  it('sets X-RateLimit-* headers on every response', async () => {
    const res = await fetch(`${baseUrl}/api`);
    assert.ok(res.headers.get('x-ratelimit-limit'));
    assert.ok(res.headers.get('x-ratelimit-remaining'));
    assert.ok(res.headers.get('x-ratelimit-reset'));
    await res.body?.cancel();
  });

  it('returns 429 after exceeding max requests', async () => {
    // Use a dedicated server with a very low limit to avoid interference
    const {baseUrl: url, close: closeLocal} = await makeServer(
      r =>
        r.get('/api', (req, res) => {
          res.statusCode = 200;
          res.end('ok');
        }),
      {transport: {requestId: false, security: false, rateLimit: {max: 1, windowMs: 60000}}}
    );
    try {
      await fetch(`${url}/api`); // first – allowed
      const res = await fetch(`${url}/api`); // second – limited
      assert.equal(res.status, 429);
      assert.ok(res.headers.get('retry-after'), 'Retry-After must be present on 429');
    } finally {
      await closeLocal();
    }
  });
});

// ---------------------------------------------------------------------------
// Transport layer – CORS
// ---------------------------------------------------------------------------
describe('[Contract] router – transport CORS', () => {
  let baseUrl, close;

  before(async () => {
    ({baseUrl, close} = await makeServer(
      r => {
        r.get('/data', (req, res) => {
          res.statusCode = 200;
          res.setHeader('Content-Type', 'application/json');
          res.end('{}');
        });
      },
      {
        transport: {
          requestId: false,
          security: false,
          cors: {origin: 'https://allowed.com', credentials: true}
        }
      }
    ));
  });

  after(() => close());

  it('handles CORS preflight (OPTIONS) with 204', async () => {
    const res = await fetch(`${baseUrl}/data`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://allowed.com',
        'access-control-request-method': 'GET'
      }
    });
    assert.equal(res.status, 204);
  });

  it('sets Access-Control-Allow-Origin on preflight', async () => {
    const res = await fetch(`${baseUrl}/data`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://allowed.com',
        'access-control-request-method': 'GET'
      }
    });
    assert.equal(res.headers.get('access-control-allow-origin'), 'https://allowed.com');
    await res.body?.cancel();
  });

  it('sets CORS headers on cross-origin GET requests', async () => {
    const res = await fetch(`${baseUrl}/data`, {
      headers: {origin: 'https://allowed.com'}
    });
    assert.equal(res.headers.get('access-control-allow-origin'), 'https://allowed.com');
    await res.body?.cancel();
  });

  it('returns 403 for preflight from disallowed origin', async () => {
    const res = await fetch(`${baseUrl}/data`, {
      method: 'OPTIONS',
      headers: {
        origin: 'https://evil.com',
        'access-control-request-method': 'GET'
      }
    });
    assert.equal(res.status, 403);
  });
});

// ---------------------------------------------------------------------------
// Sub-router mounting
// ---------------------------------------------------------------------------
describe('[Contract] router – mount()', () => {
  let baseUrl, close;

  before(async () => {
    const parent = createRouter();
    const v1 = createRouter();

    v1.get('/users', (req, res) => {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify([{id: 1}]));
    });

    v1.get('/users/:id', (req, res, params) => {
      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({id: params.id}));
    });

    parent.mount('/api/v1', v1);
    ({baseUrl, close} = await setupServer(parent.handle()));
  });

  after(() => close());

  it('routes sub-router paths with the prefix', async () => {
    const res = await fetch(`${baseUrl}/api/v1/users`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.ok(Array.isArray(body));
  });

  it('extracts URL params from sub-router paths', async () => {
    const res = await fetch(`${baseUrl}/api/v1/users/42`);
    const body = await res.json();
    assert.equal(body.id, '42');
  });

  it('returns 404 for sub-router path without prefix', async () => {
    const res = await fetch(`${baseUrl}/users`);
    assert.equal(res.status, 404);
    await res.body?.cancel();
  });
});

// ---------------------------------------------------------------------------
// Declarative route config
// ---------------------------------------------------------------------------
describe('[Contract] router – declarative route config', () => {
  let baseUrl, close;

  before(async () => {
    ({baseUrl, close} = await makeServer(
      r => {
        r.get('/data', {
          execute: () => ({response: {body: {source: 'declarative'}}})
        });

        r.get('/users/:id', {
          execute: (req, res, acc) => ({response: {body: {id: acc.route.params.id}}})
        });

        r.get('/no-accepts', {
          accepts: false,
          execute: () => ({response: {body: {ok: true}}})
        });

        // Escape hatch: array pipeline alongside declarative
        r.get('/array', [() => ({response: {body: {source: 'array'}}})]);
      },
      {
        transport: {requestId: false, security: false},
        defaults: {accepts: {types: ['application/json']}}
      }
    ));
  });

  after(() => close());

  it('declarative GET route returns correct response', async () => {
    const res = await fetch(`${baseUrl}/data`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.source, 'declarative');
  });

  it('route params accessible via acc.route.params', async () => {
    const res = await fetch(`${baseUrl}/users/99`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.id, '99');
  });

  it('accepts: false overrides router default', async () => {
    const res = await fetch(`${baseUrl}/no-accepts`, {
      headers: {accept: 'text/html'}
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.ok, true);
  });

  it('escape hatch (array pipeline) still works alongside declarative routes', async () => {
    const res = await fetch(`${baseUrl}/array`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.source, 'array');
  });
});

// ---------------------------------------------------------------------------
// Precondition Required (RFC 6585 §3)
// ---------------------------------------------------------------------------
describe('[Contract] router – preconditionRequired', () => {
  let baseUrl, close;

  before(async () => {
    ({baseUrl, close} = await makeServer(
      r => {
        r.put('/items/:id', {
          execute: () => ({response: {body: {updated: true}}})
        });

        r.patch('/items/:id', {
          execute: () => ({response: {body: {patched: true}}})
        });

        r.get('/items/:id', {
          execute: (req, res, acc) => ({response: {body: {id: acc.route.params.id}}})
        });
      },
      {
        transport: {requestId: false, security: false},
        defaults: {preconditionRequired: true}
      }
    ));
  });

  after(() => close());

  it('PUT without conditional header returns 428 with RFC 9457 body', async () => {
    const res = await fetch(`${baseUrl}/items/1`, {
      method: 'PUT',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({name: 'test'})
    });
    assert.equal(res.status, 428);
    const body = await res.json();
    assert.equal(body.status, 428);
    assert.equal(body.title, 'Precondition Required');
    assert.ok(body.type);
  });

  it('PUT with If-Match header proceeds normally', async () => {
    const res = await fetch(`${baseUrl}/items/1`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'if-match': '*'
      },
      body: JSON.stringify({name: 'test'})
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.updated, true);
  });

  it('PUT with If-Unmodified-Since header proceeds normally', async () => {
    const res = await fetch(`${baseUrl}/items/1`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'if-unmodified-since': 'Wed, 21 Oct 2015 07:28:00 GMT'
      },
      body: JSON.stringify({name: 'test'})
    });
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.updated, true);
  });

  it('PATCH without conditional header returns 428', async () => {
    const res = await fetch(`${baseUrl}/items/1`, {
      method: 'PATCH',
      headers: {'content-type': 'application/json'},
      body: JSON.stringify({name: 'test'})
    });
    assert.equal(res.status, 428);
  });

  it('GET is not affected by preconditionRequired', async () => {
    const res = await fetch(`${baseUrl}/items/99`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.id, '99');
  });
});

describe('[Contract] router – pipeline rateLimit', () => {
  let baseUrl, close;

  before(async () => {
    ({baseUrl, close} = await makeServer(
      r => {
        r.get('/limited', {
          execute: () => ({response: {body: {ok: true}}})
        });
      },
      {
        transport: {requestId: false, security: false},
        defaults: {rateLimit: {max: 3, windowMs: 60000}}
      }
    ));
  });

  after(() => close());

  it('includes X-RateLimit-* headers in response', async () => {
    const res = await fetch(`${baseUrl}/limited`);
    assert.equal(res.status, 200);
    assert.ok(res.headers.has('x-ratelimit-limit'));
    assert.ok(res.headers.has('x-ratelimit-remaining'));
    assert.ok(res.headers.has('x-ratelimit-reset'));
    assert.equal(res.headers.get('x-ratelimit-limit'), '3');
  });

  it('returns 429 when rate limit is exceeded', async () => {
    await fetch(`${baseUrl}/limited`);
    await fetch(`${baseUrl}/limited`);
    const res = await fetch(`${baseUrl}/limited`);
    assert.equal(res.status, 429);
    const body = await res.json();
    assert.equal(body.title, 'Too Many Requests');
  });
});

describe('[Contract] router – Prefer header (RFC 7240)', () => {
  let baseUrl, close;

  before(async () => {
    ({baseUrl, close} = await makeServer(
      r => {
        r.put('/items/:id', {
          preconditionRequired: false,
          execute: (req, res, acc) => ({
            response: {body: {id: acc.route.params.id, name: 'updated'}}
          })
        });

        r.post('/items', {
          execute: () => ({
            response: {statusCode: 201, body: {id: 42, name: 'new item'}, location: '/items/42'}
          })
        });
      },
      {
        transport: {requestId: false, security: false},
        defaults: {prefer: true}
      }
    ));
  });

  after(() => close());

  it('PUT with Prefer: return=minimal returns 204', async () => {
    const res = await fetch(`${baseUrl}/items/1`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        prefer: 'return=minimal',
        'if-match': '*'
      },
      body: JSON.stringify({name: 'updated'})
    });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get('preference-applied'), 'return=minimal');
    const text = await res.text();
    assert.equal(text, '');
  });

  it('POST with Prefer: return=minimal returns 201 with Location, no body', async () => {
    const res = await fetch(`${baseUrl}/items`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        prefer: 'return=minimal'
      },
      body: JSON.stringify({name: 'new item'})
    });
    assert.equal(res.status, 201);
    assert.equal(res.headers.get('preference-applied'), 'return=minimal');
    assert.equal(res.headers.get('location'), '/items/42');
    const text = await res.text();
    assert.equal(text, '');
  });

  it('PUT with Prefer: return=representation returns 200 with full body', async () => {
    const res = await fetch(`${baseUrl}/items/1`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        prefer: 'return=representation',
        'if-match': '*'
      },
      body: JSON.stringify({name: 'updated'})
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('preference-applied'), 'return=representation');
    const body = await res.json();
    assert.equal(body.name, 'updated');
  });

  it('request without Prefer header returns normal response', async () => {
    const res = await fetch(`${baseUrl}/items/1`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'if-match': '*'
      },
      body: JSON.stringify({name: 'updated'})
    });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('preference-applied'), null);
    const body = await res.json();
    assert.equal(body.name, 'updated');
  });

  it('includes Vary: Prefer in response', async () => {
    const res = await fetch(`${baseUrl}/items/1`, {
      method: 'PUT',
      headers: {
        'content-type': 'application/json',
        'if-match': '*'
      },
      body: JSON.stringify({name: 'test'})
    });
    const vary = res.headers.get('vary') || '';
    assert.ok(vary.includes('Prefer'), 'Vary should include Prefer');
  });
});

// ---------------------------------------------------------------------------
// Config validation at registration time
// ---------------------------------------------------------------------------

describe('[Contract] route config validation', () => {
  it('throws at registration time for missing execute (not at request time)', () => {
    assert.throws(
      () => {
        const router = createRouter({transport: {requestId: false, security: false}});
        router.get('/bad', {validate: {}, timeout: {}});
      },
      {message: /Missing "execute" function in route config for GET \/bad/}
    );
  });

  it('throws at registration time for unknown config key with suggestion', () => {
    assert.throws(
      () => {
        const router = createRouter({transport: {requestId: false, security: false}});
        router.post('/items', {execute: () => ({}), validatte: {}});
      },
      {message: /Unknown config key "validatte".*did you mean "validate"/}
    );
  });

  it('throws at registration time for non-function execute', () => {
    assert.throws(
      () => {
        const router = createRouter({transport: {requestId: false, security: false}});
        router.delete('/items/:id', {execute: {handler: true}});
      },
      {message: /Invalid "execute" in route config for DELETE \/items\/:id/}
    );
  });

  it('valid declarative config registers and serves requests successfully', async () => {
    const {baseUrl, close} = await makeServer(
      router => {
        router.get('/health', {execute: () => ({response: {body: {status: 'ok'}}})});
      },
      {transport: {requestId: false, security: false}}
    );

    try {
      const res = await fetch(`${baseUrl}/health`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.equal(body.status, 'ok');
    } finally {
      await close();
    }
  });
});

// ---------------------------------------------------------------------------
// Custom middleware via `use` config key
// ---------------------------------------------------------------------------
describe('[Contract] router – custom middleware via use key', () => {
  let baseUrl, close;

  before(async () => {
    ({baseUrl, close} = await makeServer(
      r => {
        r.get('/enriched', {
          use: [{fn: () => ({requestedAt: 'test-timestamp'}), setPath: 'timing'}],
          execute: (req, res, acc) => ({
            response: {body: {timing: acc.timing.requestedAt}}
          })
        });

        r.get('/defaults-and-route', {
          use: [{fn: () => ({source: 'route'}), setPath: 'routeMw'}],
          execute: (req, res, acc) => ({
            response: {
              body: {
                defaultVal: acc.defaultMw?.source,
                routeVal: acc.routeMw.source
              }
            }
          })
        });

        r.get('/disabled', {
          use: false,
          execute: (req, res, acc) => ({
            response: {body: {hasDefault: acc.defaultMw !== undefined}}
          })
        });
      },
      {
        transport: {requestId: false, security: false},
        defaults: {use: [{fn: () => ({source: 'default'}), setPath: 'defaultMw'}]}
      }
    ));
  });

  after(() => close());

  it('custom use middleware populates accumulator key in response', async () => {
    const res = await fetch(`${baseUrl}/enriched`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.timing, 'test-timestamp');
  });

  it('concatenates defaults.use and route.use (both accessible)', async () => {
    const res = await fetch(`${baseUrl}/defaults-and-route`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.defaultVal, 'default');
    assert.equal(body.routeVal, 'route');
  });

  it('use: false disables defaults custom middleware', async () => {
    const res = await fetch(`${baseUrl}/disabled`);
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.hasDefault, false);
  });
});

// ---------------------------------------------------------------------------
// Declarative pagination
// ---------------------------------------------------------------------------
describe('[Contract] router – declarative pagination', () => {
  let baseUrl, close;

  before(async () => {
    ({baseUrl, close} = await makeServer(
      r => {
        r.get('/items', {
          paginate: true,
          execute: () => ({
            response: {
              body: [{id: 1}, {id: 2}, {id: 3}],
              paginate: {total: 50}
            }
          })
        });

        r.get('/cursored', {
          paginate: {strategy: 'cursor'},
          execute: () => ({
            response: {
              body: [{id: 10}],
              paginate: {nextCursor: 'abc', prevCursor: 'xyz'}
            }
          })
        });

        r.get('/no-paginate', {
          execute: () => ({
            response: {body: [{id: 99}]}
          })
        });
      },
      {
        transport: {requestId: false, security: false}
      }
    ));
  });

  after(() => close());

  it('offset paginate: emits Link and X-Total-Count headers', async () => {
    const res = await fetch(`${baseUrl}/items?page=2&per_page=10`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('x-total-count'), '50');
    const link = res.headers.get('link');
    assert.ok(link, 'Link header should be present');
    assert.ok(link.includes('rel="first"'), 'Link should contain first');
    assert.ok(link.includes('rel="last"'), 'Link should contain last');
    assert.ok(link.includes('rel="prev"'), 'Link should contain prev');
    assert.ok(link.includes('rel="next"'), 'Link should contain next');
    assert.ok(link.includes('page=1'), 'first link should have page=1');
  });

  it('offset paginate: page 1 has no prev link', async () => {
    const res = await fetch(`${baseUrl}/items?page=1&per_page=10`);
    assert.equal(res.status, 200);
    const link = res.headers.get('link');
    assert.ok(link);
    assert.ok(!link.includes('rel="prev"'), 'page 1 should not have prev');
    assert.ok(link.includes('rel="next"'), 'page 1 should have next');
  });

  it('offset paginate: preserves non-pagination query params', async () => {
    const res = await fetch(`${baseUrl}/items?page=1&per_page=10&sort=name`);
    assert.equal(res.status, 200);
    const link = res.headers.get('link');
    assert.ok(link);
    assert.ok(link.includes('sort=name'), 'Link should preserve sort param');
  });

  it('cursor paginate: emits Link header with next/prev', async () => {
    const res = await fetch(`${baseUrl}/cursored?cursor=start&limit=5`);
    assert.equal(res.status, 200);
    const link = res.headers.get('link');
    assert.ok(link, 'Link header should be present');
    assert.ok(link.includes('rel="next"'), 'Link should contain next');
    assert.ok(link.includes('rel="prev"'), 'Link should contain prev');
    assert.ok(link.includes('cursor=abc'), 'next link should have nextCursor');
    assert.ok(link.includes('cursor=xyz'), 'prev link should have prevCursor');
  });

  it('no paginate: does not emit Link or X-Total-Count', async () => {
    const res = await fetch(`${baseUrl}/no-paginate`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('link'), null);
    assert.equal(res.headers.get('x-total-count'), null);
  });
});

// ---------------------------------------------------------------------------
// Response timing option
// ---------------------------------------------------------------------------
describe('[Contract] router – timing option', () => {
  it('timing: true produces x-response-time header', async () => {
    const {baseUrl, close} = await makeServer(
      r => {
        r.get('/ping', {
          execute: () => ({response: {body: {ok: true}}})
        });
      },
      {transport: {requestId: false, security: false}, timing: true}
    );
    try {
      const res = await fetch(`${baseUrl}/ping`);
      assert.equal(res.status, 200);
      const timing = res.headers.get('x-response-time');
      assert.ok(timing, 'x-response-time header should be present');
      assert.ok(!isNaN(Number(timing)), 'timing value should be a numeric string');
      assert.ok(Number(timing) >= 0, 'timing value should be non-negative');
    } finally {
      await close();
    }
  });

  it('timing: {header, precision} produces custom header', async () => {
    const {baseUrl, close} = await makeServer(
      r => {
        r.get('/ping', {
          execute: () => ({response: {body: {ok: true}}})
        });
      },
      {
        transport: {requestId: false, security: false},
        timing: {header: 'server-timing', precision: 0}
      }
    );
    try {
      const res = await fetch(`${baseUrl}/ping`);
      assert.equal(res.status, 200);
      const timing = res.headers.get('server-timing');
      assert.ok(timing, 'server-timing header should be present');
      assert.ok(!timing.includes('.'), 'precision 0 should produce integer');
      assert.equal(
        res.headers.get('x-response-time'),
        null,
        'default header should not be present'
      );
    } finally {
      await close();
    }
  });

  it('default (no timing) does not produce timing header', async () => {
    const {baseUrl, close} = await makeServer(
      r => {
        r.get('/ping', {
          execute: () => ({response: {body: {ok: true}}})
        });
      },
      {transport: {requestId: false, security: false}}
    );
    try {
      const res = await fetch(`${baseUrl}/ping`);
      assert.equal(res.status, 200);
      assert.equal(res.headers.get('x-response-time'), null);
    } finally {
      await close();
    }
  });
});

// ---------------------------------------------------------------------------
// onResponse hook (declarative config path through extractRouteOpts)
// ---------------------------------------------------------------------------
describe('[Contract] router – onResponse hook via declarative config', () => {
  it('route-level onResponse fires when set in declarative config', async () => {
    let hookCalled = false;
    const {baseUrl, close} = await makeServer(
      r => {
        r.get('/hooked', {
          execute: () => ({response: {body: {ok: true}}}),
          onResponse: () => {
            hookCalled = true;
          }
        });
      },
      {transport: {requestId: false, security: false}}
    );
    try {
      const res = await fetch(`${baseUrl}/hooked`);
      assert.equal(res.status, 200);
      assert.equal(hookCalled, true, 'onResponse should fire via declarative config');
    } finally {
      await close();
    }
  });
});

// ---------------------------------------------------------------------------
// onResponse hook on transport-level short-circuit responses (#135)
// ---------------------------------------------------------------------------
describe('[Contract] router – onResponse fires for transport-level responses', () => {
  it('onResponse fires for 404 (unknown path) with source: transport', async () => {
    let hookInfo;
    let hookDomainAcc;
    const {baseUrl, close} = await makeServer(
      r => {
        r.get('/exists', {execute: () => ({response: {body: {ok: true}}})});
      },
      {
        transport: {requestId: false, security: false},
        onResponse(req, res, responseInfo, domainAcc) {
          hookInfo = responseInfo;
          hookDomainAcc = domainAcc;
        }
      }
    );
    try {
      const res = await fetch(`${baseUrl}/nope`);
      assert.equal(res.status, 404);
      assert.ok(hookInfo, 'onResponse should fire for 404');
      assert.equal(hookInfo.statusCode, 404);
      assert.equal(hookInfo.source, 'transport');
      assert.equal(hookInfo.method, 'GET');
      assert.equal(hookInfo.url, '/nope');
      assert.equal(typeof hookInfo.duration, 'number');
      assert.equal(
        hookDomainAcc,
        undefined,
        'domainAcc should be undefined for transport responses'
      );
    } finally {
      await close();
    }
  });

  it('onResponse fires for 405 (known path, wrong method) with source: transport', async () => {
    let hookInfo;
    const {baseUrl, close} = await makeServer(
      r => {
        r.get('/only-get', {execute: () => ({response: {body: {ok: true}}})});
      },
      {
        transport: {requestId: false, security: false},
        onResponse(req, res, responseInfo) {
          hookInfo = responseInfo;
        }
      }
    );
    try {
      const res = await fetch(`${baseUrl}/only-get`, {method: 'DELETE'});
      assert.equal(res.status, 405);
      assert.ok(hookInfo, 'onResponse should fire for 405');
      assert.equal(hookInfo.statusCode, 405);
      assert.equal(hookInfo.source, 'transport');
      assert.equal(hookInfo.method, 'DELETE');
    } finally {
      await close();
    }
  });

  it('onResponse fires for 415 (PATCH bad content-type) with source: transport', async () => {
    let hookInfo;
    const {baseUrl, close} = await makeServer(
      r => {
        r.patch('/item', {
          execute: () => ({response: {body: {ok: true}}})
        });
      },
      {
        transport: {requestId: false, security: false},
        onResponse(req, res, responseInfo) {
          hookInfo = responseInfo;
        }
      }
    );
    try {
      const res = await fetch(`${baseUrl}/item`, {
        method: 'PATCH',
        headers: {'content-type': 'text/plain'},
        body: 'bad'
      });
      assert.equal(res.status, 415);
      assert.ok(hookInfo, 'onResponse should fire for PATCH 415');
      assert.equal(hookInfo.statusCode, 415);
      assert.equal(hookInfo.source, 'transport');
    } finally {
      await close();
    }
  });

  it('onResponse fires for 415 (POST missing content-type) with source: transport', async () => {
    let hookInfo;
    const {baseUrl, close} = await makeServer(
      r => {
        r.post('/items', {execute: () => ({response: {body: {ok: true}}})});
      },
      {
        transport: {requestId: false, security: false},
        onResponse(req, res, responseInfo) {
          hookInfo = responseInfo;
        }
      }
    );
    try {
      const res = await fetch(`${baseUrl}/items`, {method: 'POST'});
      assert.equal(res.status, 415);
      assert.ok(hookInfo, 'onResponse should fire for POST 415');
      assert.equal(hookInfo.statusCode, 415);
      assert.equal(hookInfo.source, 'transport');
    } finally {
      await close();
    }
  });

  it('onResponse fires for 429 (rate limited) with source: transport', async () => {
    let hookInfo;
    const {baseUrl, close} = await makeServer(
      r => {
        r.get('/limited', {execute: () => ({response: {body: {ok: true}}})});
      },
      {
        transport: {
          requestId: false,
          security: false,
          rateLimit: {max: 1, windowMs: 60_000}
        },
        onResponse(req, res, responseInfo) {
          hookInfo = responseInfo;
        }
      }
    );
    try {
      await fetch(`${baseUrl}/limited`);
      hookInfo = undefined;
      const res = await fetch(`${baseUrl}/limited`);
      assert.equal(res.status, 429);
      assert.ok(hookInfo, 'onResponse should fire for 429');
      assert.equal(hookInfo.statusCode, 429);
      assert.equal(hookInfo.source, 'transport');
    } finally {
      await close();
    }
  });

  it('onResponse fires for OPTIONS 204 with source: transport', async () => {
    let hookInfo;
    const {baseUrl, close} = await makeServer(
      r => {
        r.get('/resource', {execute: () => ({response: {body: {ok: true}}})});
      },
      {
        transport: {requestId: false, security: false},
        onResponse(req, res, responseInfo) {
          hookInfo = responseInfo;
        }
      }
    );
    try {
      const res = await fetch(`${baseUrl}/resource`, {method: 'OPTIONS'});
      assert.equal(res.status, 204);
      assert.ok(hookInfo, 'onResponse should fire for OPTIONS 204');
      assert.equal(hookInfo.statusCode, 204);
      assert.equal(hookInfo.source, 'transport');
      assert.equal(hookInfo.method, 'OPTIONS');
    } finally {
      await close();
    }
  });

  it('onResponse fires for CORS preflight 204 with source: transport', async () => {
    let hookInfo;
    const {baseUrl, close} = await makeServer(
      r => {
        r.get('/api', {execute: () => ({response: {body: {ok: true}}})});
      },
      {
        transport: {
          requestId: false,
          security: false,
          cors: {origin: 'https://example.com'}
        },
        onResponse(req, res, responseInfo) {
          hookInfo = responseInfo;
        }
      }
    );
    try {
      const res = await fetch(`${baseUrl}/api`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://example.com',
          'Access-Control-Request-Method': 'GET'
        }
      });
      assert.equal(res.status, 204);
      assert.ok(hookInfo, 'onResponse should fire for CORS preflight');
      assert.equal(hookInfo.statusCode, 204);
      assert.equal(hookInfo.source, 'transport');
    } finally {
      await close();
    }
  });

  it('onResponse hook errors are swallowed on transport paths', async () => {
    const {baseUrl, close} = await makeServer(
      r => {
        r.get('/exists', {execute: () => ({response: {body: {ok: true}}})});
      },
      {
        transport: {requestId: false, security: false},
        onResponse() {
          throw new Error('hook error');
        }
      }
    );
    try {
      const res = await fetch(`${baseUrl}/nope`);
      assert.equal(res.status, 404, 'response should still be 404 despite hook error');
    } finally {
      await close();
    }
  });

  it('async onResponse hook rejections are swallowed on transport paths', async () => {
    let hookCalled = false;
    const {baseUrl, close} = await makeServer(
      r => {
        r.get('/exists', {execute: () => ({response: {body: {ok: true}}})});
      },
      {
        transport: {requestId: false, security: false},
        async onResponse() {
          hookCalled = true;
          throw new Error('async hook error');
        }
      }
    );
    try {
      const res = await fetch(`${baseUrl}/nope`);
      assert.equal(res.status, 404, 'response should still be 404 despite async hook error');
      assert.equal(hookCalled, true, 'async hook should have been called');
    } finally {
      await close();
    }
  });

  it('onResponse fires with correct source for both pipeline and transport paths', async () => {
    const sources = [];
    const {baseUrl, close} = await makeServer(
      r => {
        r.get('/ok', {execute: () => ({response: {body: {ok: true}}})});
      },
      {
        transport: {requestId: false, security: false},
        onResponse(req, res, responseInfo) {
          sources.push(responseInfo.source);
        }
      }
    );
    try {
      await fetch(`${baseUrl}/ok`);
      await fetch(`${baseUrl}/nope`);
      assert.equal(sources.length, 2);
      assert.equal(sources[0], 'pipeline', 'matched route should have source: pipeline');
      assert.equal(sources[1], 'transport', 'unmatched route should have source: transport');
    } finally {
      await close();
    }
  });

  it('onResponse responseInfo has correct headers for transport responses', async () => {
    let hookInfo;
    const {baseUrl, close} = await makeServer(
      r => {
        r.get('/only-get', {execute: () => ({response: {body: {ok: true}}})});
      },
      {
        transport: {requestId: {}, security: false},
        onResponse(req, res, responseInfo) {
          hookInfo = responseInfo;
        }
      }
    );
    try {
      const res = await fetch(`${baseUrl}/only-get`, {method: 'DELETE'});
      assert.equal(res.status, 405);
      assert.ok(hookInfo.headers, 'responseInfo should include headers');
      assert.ok(hookInfo.headers['x-request-id'], 'transport request-id should be present');
      assert.ok(hookInfo.headers.allow, 'Allow header should be present on 405');
    } finally {
      await close();
    }
  });
});

// ---------------------------------------------------------------------------
// Send option merging: paginate + router-level errorFormatter (#120)
// ---------------------------------------------------------------------------
describe('[Contract] router – paginate does not clobber router-level send options', () => {
  let baseUrl, close;

  before(async () => {
    ({baseUrl, close} = await makeServer(
      r => {
        r.get('/items', {
          paginate: true,
          execute: () => ({
            response: {
              body: [{id: 1}, {id: 2}],
              paginate: {total: 20}
            }
          })
        });

        r.get('/error', {
          paginate: true,
          execute: () => ({
            response: {statusCode: 422, detail: 'Validation failed'}
          })
        });
      },
      {
        transport: {requestId: false, security: false},
        send: {
          errorFormatter: (problem, ctx) => ({
            ...problem,
            correlationId: ctx.requestId ?? 'none'
          })
        }
      }
    ));
  });

  after(() => close());

  it('paginated success response includes Link headers (paginate preserved)', async () => {
    const res = await fetch(`${baseUrl}/items?page=1&per_page=10`);
    assert.equal(res.status, 200);
    const link = res.headers.get('link');
    assert.ok(link, 'Link header should be present on paginated route');
    assert.ok(link.includes('rel="last"'), 'Link should contain last');
    assert.equal(res.headers.get('x-total-count'), '20');
  });

  it('paginated error response includes errorFormatter output (router send preserved)', async () => {
    const res = await fetch(`${baseUrl}/error`);
    assert.equal(res.status, 422);
    const body = await res.json();
    assert.equal(body.status, 422);
    assert.ok('correlationId' in body, 'errorFormatter should add correlationId');
  });
});
