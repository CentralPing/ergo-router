# Changelog

All notable changes to this project will be documented in this file.

## [0.1.0] - 2026-03-20

### Added

- Initial public release as `ergo-router` (unscoped).
- REST-compliant router with path matching via `find-my-way`.
- Automatic REST compliance: 405+Allow, HEAD, OPTIONS, and PATCH enforcement.
- Transport-level middleware: security headers, CORS, rate limiting, request ID.
- Declarative pipeline builder with composable stage configuration.
- Graceful shutdown support with in-flight request draining.
- Structured error responses via RFC 9457 Problem Details.
- Pure ESM with Node.js >= 22.
