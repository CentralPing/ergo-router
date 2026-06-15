<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://raw.githubusercontent.com/CentralPing/ergo-router/main/assets/logo-wordmark-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="https://raw.githubusercontent.com/CentralPing/ergo-router/main/assets/logo-wordmark-light.svg">
    <img alt="ergo-router" src="https://raw.githubusercontent.com/CentralPing/ergo-router/main/assets/logo-wordmark-light.svg" width="360">
  </picture>
</p>

[![CI](https://github.com/CentralPing/ergo-router/actions/workflows/ci.yml/badge.svg)](https://github.com/CentralPing/ergo-router/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/CentralPing/ergo-router/branch/main/graph/badge.svg)](https://codecov.io/gh/CentralPing/ergo-router)
[![npm version](https://img.shields.io/npm/v/@centralping/ergo-router.svg)](https://www.npmjs.com/package/@centralping/ergo-router)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/CentralPing/ergo-router/badge)](https://scorecard.dev/viewer/?uri=github.com/CentralPing/ergo-router)
[![Node.js >=22](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://github.com/CentralPing/ergo-router/blob/main/LICENSE)

A **REST-compliant router** for [ergo](https://github.com/CentralPing/ergo) with strict Fast Fail semantics. Provides path matching via [`find-my-way`](https://github.com/delvedor/find-my-way), automatic REST compliance (405+Allow, HEAD, OPTIONS, PATCH enforcement), transport-level security, and seamless integration with ergo's composable middleware pipeline.

## Why ergo-router?

- **Automatic REST compliance** -- 405 Method Not Allowed with `Allow` header, HEAD falls back to GET, OPTIONS auto-responds with allowed methods, PATCH Content-Type enforcement. All per [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110).
- **Transport-level security** -- Security headers, CORS, rate limiting, and request ID generation run before routing, ensuring every response (including errors) is protected.
- **Declarative pipeline assembly** -- Define routes with a config object; the router assembles the full Fast Fail pipeline (negotiation, auth, validation, execution) from ergo middleware automatically.
- **Graceful shutdown** -- Built-in support for draining in-flight requests on SIGTERM/SIGINT.

## Request Dispatch Flow

```
Incoming Request
  |
  +- 1. Transport Layer (every request)
  |    +- Request ID generation (response header)
  |    +- Security headers
  |    +- Rate limiting (429 short-circuit)
  |    +- CORS (preflight 204 short-circuit)
  |
  +- 2. REST Semantics
  |    +- OPTIONS -> 204 + Allow header
  |    +- PATCH Content-Type enforcement -> 415
  |    +- HEAD -> falls back to GET handler
  |    +- Route matching (find-my-way)
  |    +- 405 + Allow or 404
  |
  +- 3. Application Pipeline
       +- Route params seeded in accumulator
       +- Stage 1: Negotiation
       +- Stage 2: Authorization
       +- Stage 3: Validation
       +- Stage 4: Execution
       +- Implicit send()
```

Every early exit (429, 403, 404, 405, 415, preflight 204) includes security headers and request ID automatically.

## Installation

```bash
npm install @centralping/ergo-router @centralping/ergo
```

Requires **Node.js >= 22**. `@centralping/ergo` is a peer dependency.

## Quick Start

```js
import createRouter from '@centralping/ergo-router';

const router = createRouter({
  transport: {
    requestId: {},
    security: {},
    cors: {origin: 'https://myapp.com'}
  },
  defaults: {
    accepts: {types: ['application/json']},
    timeout: {ms: 30000}
  }
});

router.get('/users/:id', {
  execute: (req, res, acc) => ({response: {body: {id: acc.route.params.id}}})
});

router.post('/users', {
  validate: {body: {type: 'object', properties: {name: {type: 'string'}}, required: ['name']}},
  execute: (req, res, acc) => ({response: {statusCode: 201, body: acc.body.parsed}})
});

router.listen(3000, () => console.log('Listening on :3000'));
```

<details>
<summary>TypeScript</summary>

```ts
import createRouter, {defineGet, definePost} from '@centralping/ergo-router';

const router = createRouter({
  transport: {
    requestId: {},
    security: {},
    cors: {origin: 'https://myapp.com'}
  },
  defaults: {
    accepts: {types: ['application/json']},
    timeout: {ms: 30000}
  }
});

router.get('/users/:id', defineGet(
  {url: true},
  (req, res, acc) => ({response: {body: {id: acc.route.params.id}}})
));

router.post('/users', definePost(
  {validate: {body: {type: 'object', properties: {name: {type: 'string'}}, required: ['name']}}},
  (req, res, acc) => ({response: {statusCode: 201, body: acc.body.parsed}})
));

router.listen(3000, () => console.log('Listening on :3000'));
```

> **Note:** The `defineGet` and `definePost` helpers infer the accumulator type from
> enabled middleware keys — `acc.route.params`, `acc.url`, `acc.body`, etc. are fully
> typed without manual annotation. See [Typed Route Helpers](#typed-route-helpers) below.

</details>

## Presets

Presets provide pre-built router configurations for common use cases. Spread them into `createRouter()` to get started quickly:

```js
import createRouter, {presets} from '@centralping/ergo-router';

const router = createRouter({
  ...presets.jsonApi,
  transport: {cors: {origin: 'https://myapp.com'}},
  defaults: {...presets.jsonApi.defaults, timeout: {ms: 30000}},
});
```

<details>
<summary>TypeScript</summary>

```ts
import createRouter, {presets} from '@centralping/ergo-router';

const router = createRouter({
  ...presets.jsonApi,
  transport: {cors: {origin: 'https://myapp.com'}},
  defaults: {...presets.jsonApi.defaults, timeout: {ms: 30000}},
});
```

</details>

### `presets.jsonApi`

Enables transport-level request ID and security headers, and restricts content negotiation to `application/json`.

| Key | Value | Purpose |
| --- | --- | --- |
| `transport.requestId` | `{}` | Generate unique request IDs |
| `transport.security` | `{}` | Set security response headers |
| `defaults.accepts` | `{types: ['application/json']}` | Restrict to JSON content type |

**Excludes** (deployment-specific): auth, CORS origin, rate limiting.

**Override semantics:** Standard shallow spread. Overriding `transport` replaces the entire transport object. To extend `defaults` while preserving preset values, use nested spread:

```js
defaults: {...presets.jsonApi.defaults, timeout: {ms: 30000}}
```

### `presets.sse`

Configures the router for Server-Sent Events. Enables transport-level request ID and security headers, disables compression (prevents buffering of streamed chunks), disables timeout (SSE connections are long-lived), and restricts content negotiation to `text/event-stream`.

| Key | Value | Purpose |
| --- | --- | --- |
| `transport.requestId` | `{}` | Generate unique request IDs |
| `transport.security` | `{}` | Set security response headers |
| `defaults.compress` | `false` | Prevent SSE chunk buffering |
| `defaults.timeout` | `false` | Allow long-lived connections |
| `defaults.accepts` | `{types: ['text/event-stream']}` | Restrict to event stream content type |

**Excludes** (deployment-specific): auth, CORS origin, rate limiting.

**Per-route:** SSE routes should set `noSend: true` so the handler can write the event stream directly. `noSend` is a route option and cannot be set in `defaults`.

```js
import createRouter, {presets} from '@centralping/ergo-router';

const router = createRouter({...presets.sse});

router.get('/events', {
  noSend: true,
  execute: (_req, res) => {
    res.writeHead(200, {'content-type': 'text/event-stream'});
    res.write('data: hello\n\n');
    // keep connection open for streaming...
  }
});
```

<details>
<summary>TypeScript</summary>

```ts
import createRouter, {presets} from '@centralping/ergo-router';

const router = createRouter({...presets.sse});

router.get('/events', {
  noSend: true,
  execute: (_req, res) => {
    res.writeHead(200, {'content-type': 'text/event-stream'});
    res.write('data: hello\n\n');
  }
});
```

</details>

### `presets.webhooks`

Configures the router for webhook receivers. Enables transport-level request ID and security headers, restricts content negotiation to `application/json`, and requires the `Idempotency-Key` header for safe at-least-once delivery.

| Key | Value | Purpose |
| --- | --- | --- |
| `transport.requestId` | `{}` | Generate unique request IDs |
| `transport.security` | `{}` | Set security response headers |
| `defaults.accepts` | `{types: ['application/json']}` | Restrict to JSON content type |
| `defaults.idempotency` | `{required: true}` | Require Idempotency-Key header |

**Excludes** (deployment-specific): auth, CORS origin, rate limiting.

```js
import createRouter, {presets} from '@centralping/ergo-router';

const router = createRouter({...presets.webhooks});

router.post('/hooks', {
  execute: (req, res, acc) => ({
    response: {body: {received: true, key: acc.idempotency.key}}
  })
});
```

<details>
<summary>TypeScript</summary>

```ts
import createRouter, {presets, definePost} from '@centralping/ergo-router';

const router = createRouter({...presets.webhooks});

router.post('/hooks', definePost(
  {idempotency: {required: true}},
  (_req, _res, acc) => ({
    response: {body: {received: true, key: acc.idempotency.key}}
  })
));
```

</details>

### `presets.public`

Configures the router for public read-only APIs. Enables transport-level request ID, security headers, and rate limiting (built-in defaults: 100 req/60s), restricts content negotiation to `application/json`, and sets `Cache-Control: public, max-age=300`.

| Key | Value | Purpose |
| --- | --- | --- |
| `transport.requestId` | `{}` | Generate unique request IDs |
| `transport.security` | `{}` | Set security response headers |
| `transport.rateLimit` | `{}` | Rate limiting (100 req/60s defaults) |
| `defaults.accepts` | `{types: ['application/json']}` | Restrict to JSON content type |
| `defaults.cacheControl` | `{public: true, maxAge: 300}` | 5-minute public cache |

**Excludes** (deployment-specific): auth, CORS origin.

```js
import createRouter, {presets} from '@centralping/ergo-router';

const router = createRouter({
  ...presets.public,
  transport: {...presets.public.transport, rateLimit: {max: 30}}
});

router.get('/data', {
  execute: () => ({response: {body: {items: []}}})
});
```

<details>
<summary>TypeScript</summary>

```ts
import createRouter, {presets} from '@centralping/ergo-router';

const router = createRouter({
  ...presets.public,
  transport: {...presets.public.transport, rateLimit: {max: 30}}
});

router.get('/data', {
  execute: () => ({response: {body: {items: []}}})
});
```

</details>

## API Overview

### `createRouter(options?)`

Creates a new router instance with optional transport and default middleware configuration.

| Option                | Description                                      |
| --------------------- | ------------------------------------------------ |
| `transport.requestId` | Request ID generation config                     |
| `transport.security`  | Security headers (HSTS, CSP, etc.)               |
| `transport.cors`      | CORS configuration                               |
| `transport.rateLimit` | Rate limiting (sliding window)                   |
| `defaults.*`          | Default middleware options applied to all routes  |
| `timing`              | `boolean \| {header?, precision?}` — inject `X-Response-Time` header measuring pipeline execution time (default `false`) |
| `onResponse`          | `function` — post-send observation hook `(req, res, responseInfo, domainAcc)` fired after every route response |

### Route Methods

```js
router.get(path, config);
router.post(path, config);
router.put(path, config);
router.patch(path, config);
router.delete(path, config);

router.use(...fns);
```

`router.use(...fns)` registers application-level middleware that is prepended to every declarative/array pipeline before all four stages (Negotiation, Authorization, Validation, Execution). Returns the router for chaining. **Array pipelines only** — raw function handlers (`router.get('/path', fn)`) bypass `router.use()` middleware.

### Route Config

| Key                    | Description                                                                          | Standard                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `execute`              | Route handler `(req, res, domainAcc, responseAcc) => {response?, value?}` (required). Most handlers use 3 args: `(req, res, acc)` — see below. | --                                                                                                                  |
| `tracing`              | OpenTelemetry tracing options or `false`                                             | [W3C Trace Context](https://www.w3.org/TR/trace-context/)                                                           |
| `validate`             | JSON Schema for body/query validation                                                | --                                                                                                                  |
| `accepts`              | Content negotiation options or `false`                                               | [RFC 9110 &sect;12.5](https://www.rfc-editor.org/rfc/rfc9110#section-12.5)                                          |
| `authorization`        | Authorization strategy options or `false`                                            | [RFC 6750](https://www.rfc-editor.org/rfc/rfc6750), [RFC 7617](https://www.rfc-editor.org/rfc/rfc7617)              |
| `csrf`                 | CSRF options or `false`                                                              | [OWASP CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) |
| `body`                 | Body parsing options or `false` (auto for POST/PUT/PATCH)                            | [RFC 7578](https://www.rfc-editor.org/rfc/rfc7578)                                                                  |
| `cookie`               | Cookie parsing options or `false`                                                    | [RFC 6265](https://www.rfc-editor.org/rfc/rfc6265)                                                                  |
| `url`                  | URL parsing options or `false` (auto for GET/DELETE)                                 | --                                                                                                                  |
| `logger`               | Request logging options or `false`                                                   | --                                                                                                                  |
| `timeout`              | Request timeout options or `false`                                                   | --                                                                                                                  |
| `compress`             | Response compression options or `false`                                              | [RFC 9110 &sect;12.5.3](https://www.rfc-editor.org/rfc/rfc9110#section-12.5.3)                                      |
| `securityHeaders`      | Security header options or `false`                                                   | [RFC 6797](https://www.rfc-editor.org/rfc/rfc6797)                                                                  |
| `cacheControl`         | Cache-Control options or `false`                                                     | [RFC 9111](https://www.rfc-editor.org/rfc/rfc9111)                                                                  |
| `jsonApiQuery`         | JSON:API query parsing options or `false`                                            | [JSON:API](https://jsonapi.org/)                                                                                    |
| `preconditionRequired` | 428 enforcement for PUT/PATCH or `false`                                             | [RFC 6585 &sect;3](https://www.rfc-editor.org/rfc/rfc6585#section-3)                                                |
| `idempotency`          | Idempotency-Key header enforcement options or `false`                                | [Idempotency-Key (Internet-Draft)](https://datatracker.ietf.org/doc/draft-ietf-httpapi-idempotency-key-header/)      |
| `paginate`             | Pagination options or `false`. Auto-includes URL parsing.                            | [RFC 8288](https://www.rfc-editor.org/rfc/rfc8288)                                                                  |
| `prefer`               | Prefer header parsing options or `false`                                             | [RFC 7240](https://www.rfc-editor.org/rfc/rfc7240)                                                                  |
| `rateLimit`            | Per-route rate limit options or `false`                                              | [RFC 6585 &sect;4](https://www.rfc-editor.org/rfc/rfc6585#section-4)                                                |
| `use`                  | Custom middleware array `{fn, setPath}` config objects or bare functions, or `false`  | --                                                                                                                  |
| `openapi`              | OpenAPI annotation object (summary, description, tags, responses, etc.)              | [OpenAPI 3.1](https://spec.openapis.org/oas/v3.1.0)                                                                 |
| `noSend`               | Skip automatic `send()` — handler manages the response directly (`boolean`, default `false`) | --                                                                                                                  |
| `send`                 | Per-route `send()` options (prettify, etag, vary, envelope, etc.)                    | --                                                                                                                  |
| `catchHandler`         | Per-route error handler `(req, res, err, domainAcc)`. Receives normalized errors with `statusCode`/`status` and the domain accumulator (may be partially populated) | --                                                                                                                  |
| `onResponse`           | Per-route post-send observation hook `(req, res, responseInfo, domainAcc)`. Fires before the router-level hook. Does not fire when `catchHandler` takes over | --                                                                                                                  |

#### Auto-included Middleware

Some middleware is automatically included based on the HTTP method, even when not explicitly configured. Setting the key to `false` disables auto-inclusion.

| Middleware | Auto-included for | Behavior                                                                             |
| ---------- | ----------------- | ------------------------------------------------------------------------------------ |
| `url`      | GET, DELETE        | URL/query parsing is included by default for methods that do not have a request body |
| `url`      | when `paginate` active | URL parsing is auto-included for any method when pagination is enabled           |
| `body`     | POST, PUT, PATCH   | Body parsing is included by default for methods that carry a request body            |

The `execute` function receives four arguments: `(req, res, domainAcc, responseAcc)`. Most handlers only need the domain accumulator (`acc` in the examples above) which carries route params, parsed body, auth identity, and other middleware outputs. The response accumulator is available as the 4th argument for advanced use cases — see the [Architecture](https://centralping.github.io/concepts/architecture/) page for the full two-accumulator model.

### Typed Route Helpers

`defineGet`, `definePost`, and `defineRoute` enable TypeScript to infer the domain accumulator type from enabled middleware config keys — providing fully typed `acc` in execute callbacks without manual generic annotation.

| Helper | Auto-includes | Use for |
| --- | --- | --- |
| `defineGet(config, execute)` | `{url: UrlResult}` | GET, DELETE routes |
| `definePost(config, execute)` | `{body: BodyResult}` | POST, PUT, PATCH routes |
| `defineRoute(config, execute)` | — | Method-agnostic (add `url`/`body` explicitly) |

```js
import createRouter, {defineGet, definePost} from '@centralping/ergo-router';

const router = createRouter({
  transport: {requestId: {}, security: {}},
  defaults: {accepts: {types: ['application/json']}}
});

router.get('/users/:id', defineGet(
  {authorization: true, url: true},
  (req, res, acc) => {
    acc.auth;         // AuthorizationResult — typed
    acc.url.query;    // Record<string, string | string[]> — typed
    acc.route.params; // Record<string, string> — always present
    return {response: {body: {id: acc.route.params.id}}};
  }
));

router.post('/users', definePost(
  {authorization: true, body: {limit: 2048}},
  (req, res, acc) => {
    acc.auth;         // AuthorizationResult — typed
    acc.body.parsed;  // unknown — typed
    return {response: {statusCode: 201, body: acc.body.parsed}};
  }
));
```

<details>
<summary>TypeScript</summary>

```ts
import createRouter, {defineGet, definePost} from '@centralping/ergo-router';

const router = createRouter({
  transport: {requestId: {}, security: {}},
  defaults: {accepts: {types: ['application/json']}}
});

router.get('/users/:id', defineGet(
  {authorization: true, url: true},
  (req, res, acc) => {
    acc.auth;         // AuthorizationResult
    acc.url.query;    // Record<string, string | string[]>
    acc.route.params; // Record<string, string>
    return {response: {body: {id: acc.route.params.id}}};
  }
));

router.post('/users', definePost(
  {authorization: true, body: {limit: 2048}},
  (req, res, acc) => {
    acc.auth;         // AuthorizationResult
    acc.body.parsed;  // unknown
    return {response: {statusCode: 201, body: acc.body.parsed}};
  }
));
```

</details>

Keys set to `false` correctly suppress their accumulator type. `paginate` transitively includes URL types.

**Known limitation:** Middleware enabled via `createRouter({defaults: {...}})` is not visible to type inference. Add the key explicitly to the route config for typed access.

**Advanced types:** `RouteConfigBase`, `InferAccumulator<C>`, `AutoGetAccumulator<C>`, and `AutoPostAccumulator<C>` are exported for custom inference helpers.

### `graceful(handler, options?)`

Creates an HTTP server with graceful lifecycle management. Starts listening after optional startup hooks and handles SIGTERM/SIGINT with connection draining.

```js
import createRouter, {graceful} from '@centralping/ergo-router';

const router = createRouter({...});
const {server, shutdown} = await graceful(router.handle(), {
  port: 3000,
  onStartup: async ({log}) => { /* connect DB, etc. */ },
  onShutdown: async ({log, signal}) => { /* cleanup */ }
});
```

**Note:** The promise returned by `graceful()` resolves _after_ the server is already listening. Do not attach a `'listening'` event listener to `server` after `await graceful(...)` — it will never fire because the event has already been emitted. The function logs `Server listening on {hostname}:{port}` upon successful bind.

#### OpenTelemetry SDK Lifecycle

When using `tracing`, manage the OTEL SDK via `graceful()` hooks:

```js
import {NodeSDK} from '@opentelemetry/sdk-node';
import createRouter, {graceful} from '@centralping/ergo-router';

const sdk = new NodeSDK({
  /* exporters, instrumentations */
});

const router = createRouter({defaults: {tracing: true}});
// ... register routes ...

await graceful(router.handle(), {
  onStartup: async () => {
    sdk.start();
  },
  onShutdown: async () => {
    await sdk.shutdown();
  }
});
```

See the [full API reference](https://centralping.github.io/packages/ergo-router/) for detailed options and examples.

### `generateOpenAPI(router, options?)`

Generates an [OpenAPI 3.1](https://spec.openapis.org/oas/v3.1.0) specification document from a router's registered routes. Available via the `@centralping/ergo-router/openapi` sub-path export.

```js
import createRouter from '@centralping/ergo-router';
import generateOpenAPI from '@centralping/ergo-router/openapi';

const router = createRouter({
  defaults: {
    accepts: {types: ['application/json']},
    authorization: {strategies: [{type: 'Bearer', authorizer: verifyToken}]}
  }
});

router.get('/users/:id', {
  openapi: {
    summary: 'Get user by ID',
    tags: ['Users'],
    responses: {
      200: {description: 'User found'},
      404: {description: 'User not found'}
    }
  },
  validate: {params: {type: 'object', properties: {id: {type: 'string', format: 'uuid'}}}},
  execute: (req, res, acc) => ({response: {body: {id: acc.route.params.id}}})
});

const spec = generateOpenAPI(router, {
  title: 'My API',
  version: '1.0.0',
  description: 'REST API with OpenAPI spec',
  servers: [{url: 'https://api.example.com'}]
});
// spec is a valid OpenAPI 3.1 document
```

The generator automatically extracts:

- **Path parameters** from `:param` patterns (with schema from `validate.params`)
- **Query parameters** from `validate.query`
- **Request body** from `validate.body` (POST/PUT/PATCH only)
- **Security schemes** from `authorization.strategies`
- **Content types** from `accepts.types`

Config keys are resolved against `router.defaults` using the same precedence as the pipeline builder (route > defaults > omitted).

## Standards Compliance

| RFC / Standard                                                      | Description                    | ergo-router Feature                       |
| ------------------------------------------------------------------- | ------------------------------ | ----------------------------------------- |
| [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110)                  | HTTP Semantics                 | 405+Allow, HEAD/OPTIONS/PATCH enforcement |
| [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457)                  | Problem Details for HTTP APIs  | Structured error responses                |
| [RFC 6797](https://www.rfc-editor.org/rfc/rfc6797)                  | HTTP Strict Transport Security | Transport security headers                |
| [RFC 6585](https://www.rfc-editor.org/rfc/rfc6585)                  | Additional HTTP Status Codes   | Rate limiting (429)                       |
| [Fetch Standard](https://fetch.spec.whatwg.org/#http-cors-protocol) | CORS Protocol                  | Transport CORS handling                   |
| [OpenAPI 3.1](https://spec.openapis.org/oas/v3.1.0)                 | API Description Format         | Route-based spec generation               |

## Documentation

- [Getting Started](https://centralping.github.io/getting-started/)
- [API Reference](https://centralping.github.io/packages/ergo-router/)
- [Fast Fail Pipeline](https://centralping.github.io/concepts/fast-fail/)

## Development

```bash
npm install
npm test            # lint + format check + tests with coverage
npm run test:watch  # watch mode
npm run lint        # ESLint
npm run format      # Prettier
```

## License

[MIT](https://github.com/CentralPing/ergo-router/blob/main/LICENSE) &copy; 2019-present Jason Cust
