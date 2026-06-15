# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Changed

- **Route-level `send` now merges with router-level `send` instead of replacing it.** (#120)
  Previously, `auto-wrap.js` used nullish coalescing (`routeOpts.send ?? routerOptions.send`)
  which treated any defined route-level `send` object as a complete replacement for
  router-level send options. When `addRoute()` auto-injected `{paginate: true}` or
  `{prefer: true}` into route-level send, router-level options like `errorFormatter` were
  silently dropped. Send resolution now uses spread-merge
  (`{...routerOptions.send, ...routeOpts.send}`) — router-level is the base, route-level
  overrides on conflict. This aligns with the route-config-over-defaults precedence model.
  Routes that need to suppress a router-level send option can set it to `undefined` explicitly
  (e.g., `send: {errorFormatter: undefined}`).

## [0.5.0] - 2026-06-13

### Added

- **Three new presets: `presets.sse`, `presets.webhooks`, `presets.public`.** (#106) The
  `presets` namespace now includes configurations for Server-Sent Events (disables compression
  and timeout, restricts to `text/event-stream`), webhook receivers (requires `Idempotency-Key`
  header, restricts to `application/json`), and public read-only APIs (restricts to
  `application/json`, enables rate limiting, sets `Cache-Control: public, max-age=300`).
  All presets are deeply frozen `RouterOptions` objects following the same spread-override
  semantics as `presets.jsonApi`. SSE routes should set `noSend: true` per-route (route option,
  not valid in defaults).
- **`onResponse` post-send lifecycle hook at router and route levels.** (#140)
  Observation callback fired after `send()` completes. Configurable at router level
  (`createRouter({onResponse})`) for all routes, and/or per-route (`{onResponse}` in route
  config). Both levels fire independently — route-level first, then router-level. Hook
  errors are swallowed. Receives `(req, res, responseInfo, domainAcc)`. Does not fire when
  `catchHandler` takes over (error path).
- **`catchHandler` now receives domain accumulator as 4th argument.** (#105) Custom error
  handlers (`catchHandler`) are now called with `(req, res, err, domainAcc)` instead of
  `(req, res, err)`. The domain accumulator contains route params, parsed body, auth identity,
  and other pipeline data available at the time the error was thrown. The accumulator may be
  partially populated if the error occurred mid-pipeline. Backwards compatible — existing
  3-argument handlers continue to work unchanged.
- **Semantic config validation at registration time.** (#104) Routes with `body: false` and
  `validate: {body: schema}` now throw at registration time instead of producing a guaranteed
  500 error on every request. The check uses resolved values (route config > defaults) so
  contradictions originating from `defaults` are also caught. Always throws regardless of
  `strict` setting (same rationale as value type errors).
- **New type export: `GracefulLog`.** (#102) Interface for the logger shape accepted by
  `graceful()` and guaranteed in lifecycle callbacks. Consumers can use `GracefulLog` to type
  a custom logger without extracting it from `GracefulOptions`.

### Changed

- Bumped `@centralping/ergo` peer dependency ceiling to `>=0.5.0 <0.7.0` (was `>=0.5.0 <0.6.0`).
  Ceiling expanded to include `@centralping/ergo@0.6.0`.

### Fixed

- **Declared `@types/node` as optional peer dependency for TypeScript consumers.** (#103)
  TypeScript consumers compiling with `skipLibCheck: false` received errors from
  ergo-router's `.d.ts` files because `import('node:http')` type references require
  `@types/node`. The package is now declared as an optional peer dependency (`>= 22`,
  matching `engines.node`), following the ecosystem standard used by Express, Fastify,
  and Koa. JavaScript-only consumers are unaffected.
- **openapi sub-path export now has TypeScript declarations.** (#101) The `./openapi` sub-path
  export was missing its `.d.ts` file because `openapi.js` was not included in the
  `tsconfig.json` compilation input. TypeScript consumers importing
  `@centralping/ergo-router/openapi` now get proper type information instead of `any`.
- **`graceful()` callbacks receive non-optional `log` parameter.** (#102) The `onStartup` and
  `onShutdown` callback context now correctly types `log` as always-defined (`GracefulLog`),
  matching the runtime behavior where `log` defaults to `console`. Previously, `log` was typed
  as `GracefulLog | undefined`, forcing consumers to use optional chaining or non-null
  assertions.

### Documentation

- **Route Config table now includes all valid config keys.** Added `noSend`, `send`, and
  `catchHandler` (Route Option Keys) and `idempotency` (Pipeline Key) to the README Route
  Config table. Previously only Pipeline Keys and Annotation Keys were listed. (#98)
- **`router.use()` documented in Route Methods section.** Added signature, behavior
  description (prepended to every declarative/array pipeline), and the array-pipelines-only
  caveat. (#98)
- **`@example` in `index.js` now uses `router.listen()` instead of raw `node:http`.** (#115)
  The package entry point example previously demonstrated `http.createServer(router.handle())`
  which is inconsistent with the README Quick Start and website guides. Updated to use the
  built-in `router.listen()` convenience method.

## [0.4.1] - 2026-06-07

### Added

- **Accumulator type inference via `defineGet`/`definePost`/`defineRoute` helpers.** (#91)
  New exported functions that infer the domain accumulator type from enabled middleware config
  keys, providing fully typed `acc` in execute callbacks without manual generic annotation.
  `defineGet` auto-includes `{url: UrlResult}` for GET/DELETE; `definePost` auto-includes
  `{body: BodyResult}` for POST/PUT/PATCH; `defineRoute` is method-agnostic. Keys set to `false`
  correctly suppress their accumulator type. `paginate` transitively includes URL types.

  ```js
  import {defineGet} from '@centralping/ergo-router';

  router.get(
    '/users/:id',
    defineGet({authorization: true, url: true}, (req, res, acc) => {
      acc.auth; // AuthorizationResult
      acc.url.query; // Record<string, string | string[]>
      acc.route.params; // Record<string, string>
    })
  );
  ```

  **Known limitation:** Middleware enabled via `createRouter({defaults: {...}})` is not visible
  to type inference. Add the key explicitly to the route config for typed access.

- **New type exports:** `RouteConfigBase`, `InferAccumulator<C>`, `AutoGetAccumulator<C>`,
  `AutoPostAccumulator<C>` — available for advanced use cases and custom inference helpers.

- **`timing` option on `createRouter()` for `X-Response-Time` header.** (#93)
  Pass `timing: true` for defaults or `timing: {header?, precision?}` for custom
  configuration. Measures pipeline execution time via a `res.writeHead` interception using
  the shared `applyResponseTiming` primitive from `@centralping/ergo/lib/response-time`.
  Zero overhead when disabled (default). Short-circuit responses (404, 405, 415, 429) are
  intentionally excluded — timing measures pipeline execution, not transport/routing overhead.

### Changed

- Bumped `@centralping/ergo` peer dependency floor to `>=0.4.1 <0.5.0` (was `>=0.4.0 <0.5.0`).
  Floor bumped to 0.4.1 for `applyResponseTiming` import from `lib/response-time`. (#93)

## [0.4.0] - 2026-06-06

### Changed

- **BREAKING: Pipeline builder uses config objects instead of tuples.** (#83)
  Aligned with `@centralping/ergo@0.4.0` compose-with API change. Domain-producing
  middleware now uses `{fn, setPath}` config objects. Response-only middleware (rateLimit,
  precondition, securityHeaders, cacheControl, validate, jsonApiQuery) are plain functions.
  `RouteConfig.use` accepts `Array<function|{fn: function, setPath: string}>`.
  Requires `@centralping/ergo >= 0.4.0 < 0.5.0`.

### Fixed

- **Transport `Referrer-Policy` default aligned with shared primitive.** Changed
  `TRANSPORT_DEFAULTS.referrerPolicy` from `'strict-origin-when-cross-origin'` to `'no-referrer'`,
  matching `@centralping/ergo`'s `lib/security-headers.js` default, the pipeline middleware, and
  all website documentation. Added contract test for `Referrer-Policy` header. (#80)
- **Generic propagation to route methods.** Router route methods (`get`, `post`, `put`,
  `patch`, `delete`) now propagate the `RouteConfig<A>` generic type parameter, allowing
  TypeScript consumers to pass typed route configs with full `domainAcc` inference in
  `execute` callbacks. Previously, route methods accepted only `RouteConfig` (defaulting to
  `Record<string, unknown>`), which caused type errors under `strictFunctionTypes` when
  passing `RouteConfig<SpecificType>`. The default `A = Record<string, unknown>` preserves
  backward compatibility. (#79)

---

## [0.3.0] - 2026-06-05

### Added

- **`paginate` pipeline config key.** Declarative route configs accept a `paginate` key that
  wires ergo's `paginate()` middleware into Stage 1 (Negotiation), after URL parsing.
  Automatically includes URL parsing when active (regardless of HTTP method). When enabled,
  `send()` receives `paginate: true` for automatic Link header and `X-Total-Count` generation.
  Supports offset-based (`paginate: true`) and cursor-based (`paginate: {strategy: 'cursor'}`)
  pagination strategies via ergo's pagination primitives. (#71)

- **`presets.jsonApi` convenience export.** A deeply frozen `RouterOptions` object that
  enables transport-level request ID and security headers, and restricts content negotiation
  to `application/json`. Consumers spread it into `createRouter()` for one-liner JSON API
  configuration. Excludes deployment-specific concerns (auth, CORS origin, rate limiting).
  Available via `import {presets} from '@centralping/ergo-router'`. (#70)

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
- Bumped `@centralping/ergo` peer dependency range to `>=0.3.0 <0.4.0` (was `>=0.2.0 <0.3.0`).
  Floor bumped to 0.3.0 for `paginate` middleware factory import. (#71)

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
