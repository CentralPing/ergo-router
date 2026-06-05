# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

- **Typed `RouteConfig` with generic accumulator.** Hand-written TypeScript declaration overrides
  (`types-override/`) provide precise type information for declarative route configuration.
  Each middleware key is typed with its specific ergo option interface (e.g., `AcceptsOptions`,
  `BodyOptions`) instead of generic `object | boolean`. The `execute` callback's domain
  accumulator accepts a generic type parameter `RouteConfig<A>` (defaults to
  `Record<string, unknown>`), enabling consumers to annotate their accumulator shape for
  type-safe property access. `RouterOptions`, `TransportOptions`, `GracefulOptions`, and the
  `Router` instance are also fully typed. Adopts the `types-override` pattern established in
  `@centralping/ergo`. (#68)

### Changed

- **Config value type validation at registration time.** Declarative route config values,
  `createRouter()` options, and `options.defaults` are now validated for correct types at
  registration time. Invalid values (e.g., `timeout: 'five seconds'`, `rateLimit: 42`,
  `validate: [1,2,3]`) throw immediately with descriptive error messages instead of causing
  cryptic runtime errors at request time. Pipeline middleware keys accept `boolean | object`;
  route option keys enforce their specific types (`send`: object, `noSend`: boolean,
  `catchHandler`: function); router option keys enforce per-key types. Value type errors
  always throw regardless of `strict` setting. (#69)

---

## [0.2.0] - 2026-06-04

### Added

- **OpenTelemetry pipeline-builder integration.** `tracing` config key enables W3C trace
  context propagation and per-request `ergo.pipeline` spans via `@centralping/ergo`'s tracing
  middleware. Placed first in Stage 1 (before logger) for trace ID correlation in log output.
  `auto-wrap.js` ends the span after `send()` with `http.status_code` attribute and
  appropriate OTEL status. Supports all code paths: success, error, `catchHandler`, and
  `noSend`. Zero overhead when no OTEL SDK is registered (no-op spans). (#63)
- **OpenAPI 3.1 specification generation.** `generateOpenAPI(router, options)` produces a
  standards-compliant OpenAPI 3.1 document from registered route metadata. Extracts validation
  schemas (params, query, body), authorization strategies, content types, and manual `openapi`
  annotations. Resolves config keys against router defaults using the same precedence as the
  pipeline builder. Available via `@centralping/ergo-router/openapi` sub-path export. (#54)
- **`openapi` annotation key for declarative route configs.** Pass-through object for per-route
  OpenAPI metadata (summary, description, tags, operationId, deprecated, responses,
  externalDocs). Validated at registration time as a plain object. (#54)
- **Route metadata registry (`router._routes`).** Stores `{method, path, config}` entries for
  all registered routes, enabling introspection without coupling to the routing engine. (#54)
- **`use` config key for custom per-route middleware**: declarative route configs accept a `use` array of `[fn, setPath]` tuples (or bare functions) that run after Stage 3 (Validation) and before Stage 4 (Execution). Router `defaults.use` entries are concatenated before route-level entries; `use: false` disables all custom middleware. (#51)
- **Pipeline debug tracing.** Pass `{debug: true}` in router options to enable pipeline
  tracing. When enabled, `responseAcc._trace` is initialized on each request. The
  `compose-with` serial and concurrent runners record each middleware label in `steps` and set
  `breakAt` to the label that triggered a pipeline break. On error responses (>= 400),
  `_trace` appears as an RFC 9457 extension member. (#59)
- **Typed Router interface**: `createRouter()` returns a fully typed object with `get`, `post`, `put`, `patch`, `delete`, `use`, `mount`, `handle`, and `listen` methods instead of `object`. Route methods accept `RouteConfig` type for declarative pipeline config. (#50)
- **`RouteConfig` typedef**: exported from `lib/pipeline-builder.js` with typed properties for all 18 pipeline keys, 3 route option keys, and a typed `execute` callback signature. (#50)
- **Typed `graceful()` options**: `exit`, `onStartup`, `onShutdown`, and `log` parameters have specific function/object types instead of `Function`. (#50)
- **CI type validation**: `tsconfig.check-types.json` validates generated `.d.ts` files with `strict: true` and `skipLibCheck: false`. `check-types` script added to `package.json`. (#50)
- **Config validation at registration time**: declarative route config objects, `createRouter()` options, and `options.defaults` are validated for unknown keys with Levenshtein-based "did you mean?" suggestions. Unknown keys throw by default (`strict: true`) or warn (`strict: false`). (#49)
- Missing or non-function `execute` in declarative route configs now throws at registration time with a descriptive error naming the route (method + path), instead of producing a 500 at request time. (#55)
- `strict` option on `createRouter()` to control config validation strictness (default `true`).
- Auto-included middleware documentation in README.md Route Config section. (#52)
- TypeScript usage example alongside the JavaScript Quick Start in `README.md`. (#46)
- CI `peer-compat` job that validates the peer dependency contract against published `@centralping/ergo` versions (minimum and newest). (#35)
- Import surface smoke test (`lib/peer-surface.spec.unit.js`) that asserts every `@centralping/ergo` import used by ergo-router is available at module load time. (#35)
- Contract tests for PATCH `application/merge-patch+json` and `application/json-patch+json` body parsing through declarative pipeline routes. (#36)
- Docs dispatch step in release workflow for automatic docs site rebuild on release. (#40)

### Changed

- **BREAKING**: Renamed route config key `auth` to `authorization` for consistency with the `authorization()` middleware factory name. The accumulator path `acc.auth` is unchanged. (#53)
- Bumped `@centralping/ergo` peer dependency range to `>=0.2.0 <0.3.0` (was `>=0.1.0 <0.2.0`). Floor bumped to 0.2.0 for OpenTelemetry tracing imports (`tracing` main entry, `statusFromHttp` from `lib/tracing`). (#63)
- Bounded `@centralping/ergo` peer dependency range to `>=0.1.0-beta.4 <0.2.0` (was unbounded `>=0.1.0-beta.3`). Floor bumped from beta.3 to beta.4 for PATCH content-type body parsing support. (#35)

### Fixed

- **`instance` field on all error paths.** The RFC 9457 `instance` field
  (`urn:uuid:{requestId}`) is now populated from the `x-request-id` response header on all
  auto-wrap error paths — pipeline breaks, caught errors (both default and `catchHandler`),
  and `endWithProblem` short-circuit responses (404, 405, 415, 429, 500). Previously,
  `instance` was only populated in the default `catch` block. (#59)
- Bumped `@centralping/ergo` peer dependency floor from `>=0.1.0-beta.1` to `>=0.1.0-beta.3` to match actual import surface (`idempotency` export requires beta.3). (#34)
- README license link changed from relative path to absolute URL (broken on npm). (#40)
- CI dispatch now includes `client-payload` identifying ergo-router for docs site deploy. (#40)

---

## [0.1.0-beta.2] - 2026-05-29

### Added

- Idempotency pipeline key in pipeline builder for deduplicating repeated requests.

---

## [0.1.0-beta.1] - 2026-05-20

### Changed

- **BREAKING**: Renamed package from `ergo-router` to `@centralping/ergo-router`.
- **BREAKING**: Pipeline v2 — two-accumulator model integration. Route handlers now receive `domainAcc` (seeded with `{route: {params}}`) and `responseAcc` instead of a single accumulator. The `formatError` router option is removed; errors flow through `responseAcc`.
- Pipeline builder uses `[fn, setPath]` tuple format (removed `getPaths` element).
- Simplified `prefer` option from key string to boolean flag.
- Added TypeScript declaration files (`.d.ts`) generated from JSDoc.
- Added `--test-force-exit` to test command (prevents CI hangs from unclosed handles).
- Updated release workflow to support pre-release dist-tags.
- Tightened peerDependency to `@centralping/ergo@>=0.1.0-beta.1`.

## [0.1.0] - 2026-03-20

### Added

- Initial development release as `ergo-router` (unscoped, never published to npm).
- REST-compliant router with path matching via `find-my-way`.
- Automatic REST compliance: 405+Allow, HEAD, OPTIONS, and PATCH enforcement.
- Transport-level middleware: security headers, CORS, rate limiting, request ID.
- Declarative pipeline builder with composable stage configuration.
- Graceful shutdown support with in-flight request draining.
- Structured error responses via RFC 9457 Problem Details.
- Pure ESM with Node.js >= 22.
