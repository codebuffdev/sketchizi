# Sketchizi 1.10.7 — Production-Grade Logging Architecture

## Client logging
- Added `src/logging/logger.js` with `debug`, `info`, `warn`, and `error` APIs.
- Development defaults to readable DevTools output for all levels.
- Production disables debug console noise and routes structured events through the provider-neutral `errorReporter` abstraction.
- Application version is read from `package.json`; no duplicated hard-coded version.
- Structured context is sanitized and bounded to avoid secrets, private document data, and oversized log payloads.

## Error reporting
- Added `src/logging/errorReporter.js` as the vendor-neutral production reporting boundary.
- The default reporter is intentionally unconfigured; no Sentry/Cloudflare ingestion service was hard-coded. A future provider can be configured behind this abstraction.
- Global `window.error` and `unhandledrejection` events feed the logger.
- React `ErrorBoundary` uses the same logger.

## Collaboration logging
- Added low-volume lifecycle, connection, reconnect, permission, and error logs.
- High-frequency cursor/presence/scene update traffic is intentionally not logged.

## File logging
- Added meaningful new/open/save/folder/error events.
- Document contents and canvas element arrays are never logged.
- Added low-volume IndexedDB persistence restore/save failure diagnostics.

## Icon/API logging
- Eraser catalog load/sync and service-worker failures use structured low-volume logs.
- Normal icon rendering, pointer movement, and cache progress are not logged.

## Server logging
- Added `server/logger.mjs` for the collaboration runtime with structured JSON output and `SKETCHIZI_LOG_LEVEL`.
- Browser and server logging remain separate domains.

## Remaining console usage
- Client `console.*` calls remain only inside the logging implementation itself.
- CLI icon-sync scripts keep their console output for command-line progress/errors.
- The collaboration server writes through `server/logger.mjs`, which is its server-side logging sink.
- Cloudflare Pages functions currently have no application console logging.

## Scope
No collaboration protocol, canvas synchronization, permissions semantics, undo/redo, file format, or UI architecture was changed.
