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
import type {IncomingMessage, ServerResponse} from 'node:http';
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
  execute: (req: IncomingMessage, res: ServerResponse, acc: {route: {params: {id: string}}}) => ({
    response: {body: {id: acc.route.params.id}}
  })
});

router.post('/users', {
  validate: {body: {type: 'object', properties: {name: {type: 'string'}}, required: ['name']}},
  execute: (req: IncomingMessage, res: ServerResponse, acc: {body: {parsed: {name: string}}}) => ({
    response: {statusCode: 201, body: acc.body.parsed}
  })
});

router.listen(3000, () => console.log('Listening on :3000'));
```

> **Note:** The type annotations above represent the expected types for the accumulator
> properties. As ergo's `.d.ts` type declarations improve, these types will be inferred
> automatically — removing the need for explicit annotations.

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

## API Overview

### `createRouter(options?)`

Creates a new router instance with optional transport and default middleware configuration.

| Option                | Description                                      |
| --------------------- | ------------------------------------------------ |
| `transport.requestId` | Request ID generation config                     |
| `transport.security`  | Security headers (HSTS, CSP, etc.)               |
| `transport.cors`      | CORS configuration                               |
| `transport.rateLimit` | Rate limiting (sliding window)                   |
| `defaults.*`          | Default middleware options applied to all routes |

### Route Methods

```js
router.get(path, config);
router.post(path, config);
router.put(path, config);
router.patch(path, config);
router.delete(path, config);
```

### Route Config

| Key                    | Description                                                                          | Standard                                                                                                            |
| ---------------------- | ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------- |
| `execute`              | Route handler `(req, res, domainAcc, responseAcc) => {response?, value?}` (required) | --                                                                                                                  |
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
| `paginate`             | Pagination options or `false`. Auto-includes URL parsing.                            | [RFC 8288](https://www.rfc-editor.org/rfc/rfc8288)                                                                  |
| `prefer`               | Prefer header parsing options or `false`                                             | [RFC 7240](https://www.rfc-editor.org/rfc/rfc7240)                                                                  |
| `rateLimit`            | Per-route rate limit options or `false`                                              | [RFC 6585 &sect;4](https://www.rfc-editor.org/rfc/rfc6585#section-4)                                                |
| `use`                  | Custom middleware array `[fn, setPath]` tuples or bare functions, or `false`         | --                                                                                                                  |
| `openapi`              | OpenAPI annotation object (summary, description, tags, responses, etc.)              | [OpenAPI 3.1](https://spec.openapis.org/oas/v3.1.0)                                                                 |

#### Auto-included Middleware

Some middleware is automatically included based on the HTTP method, even when not explicitly configured. Setting the key to `false` disables auto-inclusion.

| Middleware | Auto-included for | Behavior                                                                             |
| ---------- | ----------------- | ------------------------------------------------------------------------------------ |
| `url`      | GET, DELETE        | URL/query parsing is included by default for methods that do not have a request body |
| `url`      | when `paginate` active | URL parsing is auto-included for any method when pagination is enabled           |
| `body`     | POST, PUT, PATCH   | Body parsing is included by default for methods that carry a request body            |

The `execute` function receives four arguments: `(req, res, domainAcc, responseAcc)`. Most handlers only need the domain accumulator (`acc` in the examples above) which carries route params, parsed body, auth identity, and other middleware outputs. The response accumulator is available as the 4th argument for advanced use cases — see the [Architecture](https://centralping.github.io/concepts/architecture/) page for the full two-accumulator model.

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
