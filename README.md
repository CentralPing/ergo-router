<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="assets/logo-wordmark-dark.svg">
    <source media="(prefers-color-scheme: light)" srcset="assets/logo-wordmark-light.svg">
    <img alt="ergo-router" src="assets/logo-wordmark-light.svg" width="360">
  </picture>
</p>

[![CI](https://github.com/CentralPing/ergo-router/actions/workflows/ci.yml/badge.svg)](https://github.com/CentralPing/ergo-router/actions/workflows/ci.yml)
[![codecov](https://codecov.io/gh/CentralPing/ergo-router/branch/main/graph/badge.svg)](https://codecov.io/gh/CentralPing/ergo-router)
[![npm version](https://img.shields.io/npm/v/ergo-router.svg)](https://www.npmjs.com/package/ergo-router)
[![OpenSSF Scorecard](https://api.scorecard.dev/projects/github.com/CentralPing/ergo-router/badge)](https://scorecard.dev/viewer/?uri=github.com/CentralPing/ergo-router)
[![Node.js >=22](https://img.shields.io/badge/node-%3E%3D22-brightgreen)](https://nodejs.org)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

A **REST-compliant router** for [ergo](https://github.com/CentralPing/ergo) with strict Fast Fail semantics. Provides path matching via [`find-my-way`](https://github.com/delvedor/find-my-way), automatic REST compliance (405+Allow, HEAD, OPTIONS, PATCH enforcement), transport-level security, and seamless integration with ergo's composable middleware pipeline.

## Why ergo-router?

- **Automatic REST compliance** -- 405 Method Not Allowed with `Allow` header, HEAD falls back to GET, OPTIONS auto-responds with allowed methods, PATCH Content-Type enforcement. All per [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110).
- **Transport-level security** -- Security headers with conservative defaults (CSP `default-src 'none'`, HSTS, X-Frame-Options `DENY`), CORS, rate limiting, and request ID generation run before routing, ensuring every response -- including 404s and 405s -- is protected. Maps to [OWASP API8 (Security Misconfiguration)](https://owasp.org/API-Security/editions/2023/en/0xa8-security-misconfiguration/) and [API4 (Unrestricted Resource Consumption)](https://owasp.org/API-Security/editions/2023/en/0xa4-unrestricted-resource-consumption/).
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
npm install ergo-router ergo find-my-way
```

Requires **Node.js >= 22**. `ergo` is a peer dependency.

## Quick Start

```js
import createRouter from 'ergo-router';

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
  execute: (req, res, acc) => ({body: {id: acc.route.params.id}})
});

router.post('/users', {
  validate: {body: {type: 'object', properties: {name: {type: 'string'}}, required: ['name']}},
  execute: (req, res, acc) => ({statusCode: 201, body: acc.body.parsed})
});

router.listen(3000, () => console.log('Listening on :3000'));
```

## API Overview

### `createRouter(options?)`

Creates a new router instance with optional transport and default middleware configuration.

| Option | Description |
|---|---|
| `transport.requestId` | Request ID generation config |
| `transport.security` | Security headers (HSTS, CSP, etc.) |
| `transport.cors` | CORS configuration |
| `transport.rateLimit` | Rate limiting (sliding window) |
| `defaults.*` | Default middleware options applied to all routes |

### Route Methods

```js
router.get(path, config)
router.post(path, config)
router.put(path, config)
router.patch(path, config)
router.delete(path, config)
```

### Route Config

| Key | Description | Standard |
|---|---|---|
| `execute` | Route handler function (required) | -- |
| `validate` | JSON Schema for body/query validation | -- |
| `accepts` | Content negotiation override | [RFC 9110 &sect;12.5](https://www.rfc-editor.org/rfc/rfc9110#section-12.5) |
| `authorization` | Auth strategy override | [RFC 6750](https://www.rfc-editor.org/rfc/rfc6750), [RFC 7617](https://www.rfc-editor.org/rfc/rfc7617) |
| `timeout` | Request timeout override | -- |
| `precondition` | 428 enforcement | [RFC 6585 &sect;3](https://www.rfc-editor.org/rfc/rfc6585#section-3) |
| `rateLimit` | Per-route rate limit override | [RFC 6585 &sect;4](https://www.rfc-editor.org/rfc/rfc6585#section-4) |

### `graceful(server, options?)`

Graceful shutdown helper. Stops accepting new connections and drains in-flight requests.

```js
import createRouter, {graceful} from 'ergo-router';
const router = createRouter({...});
const server = router.listen(3000);
graceful(server);
```

See the [full API reference](https://centralping.github.io/api/ergo-router/) for detailed options and examples.

## Standards Compliance

| RFC / Standard | Description | ergo-router Feature |
|---|---|---|
| [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110) | HTTP Semantics | 405+Allow, HEAD/OPTIONS/PATCH enforcement |
| [RFC 9457](https://www.rfc-editor.org/rfc/rfc9457) | Problem Details for HTTP APIs | Structured error responses |
| [RFC 6797](https://www.rfc-editor.org/rfc/rfc6797) | HTTP Strict Transport Security | Transport security headers |
| [RFC 6585](https://www.rfc-editor.org/rfc/rfc6585) | Additional HTTP Status Codes | Rate limiting (429) |
| [Fetch Standard](https://fetch.spec.whatwg.org/#http-cors-protocol) | CORS Protocol | Transport CORS handling |
| [OWASP REST Security](https://cheatsheetseries.owasp.org/cheatsheets/REST_Security_Cheat_Sheet.html) | REST API security best practices | Transport-layer protections, error redaction, request ID tracing |

## Documentation

- [Getting Started](https://centralping.github.io/getting-started/)
- [API Reference](https://centralping.github.io/api/ergo-router/)
- [Architecture & Design](https://centralping.github.io/architecture/)

## Development

```bash
npm install
npm test            # lint + format check + tests with coverage
npm run test:watch  # watch mode
npm run lint        # ESLint
npm run format      # Prettier
```

## License

[MIT](LICENSE) &copy; 2019-present Jason Cust
