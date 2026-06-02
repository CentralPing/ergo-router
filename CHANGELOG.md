# Changelog

All notable changes to this project will be documented in this file.

## [Unreleased]

### Added

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
- Bounded `@centralping/ergo` peer dependency range to `>=0.1.0-beta.4 <0.2.0` (was unbounded `>=0.1.0-beta.3`). Floor bumped from beta.3 to beta.4 for PATCH content-type body parsing support. (#35)

### Fixed

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
