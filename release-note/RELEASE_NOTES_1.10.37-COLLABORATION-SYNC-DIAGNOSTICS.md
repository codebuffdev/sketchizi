# Sketchizi 1.10.37 — Collaboration Synchronization Diagnostics

## Scope

Diagnostics and characterization tests only. No collaboration protocol changes or synchronization fixes are included.

## Diagnostics

- Client diagnostics are disabled by default. Enable with `?sketchiziSyncDiagnostics=1` in the application URL, then reload.
- Server diagnostics are disabled by default. Start the collaboration server with `SKETCHIZI_SYNC_DIAGNOSTICS=1` in its environment.
- Both sides emit `[Sketchizi Sync Diagnostics]` structured records containing event type, per-process event ID, timestamps, hashed room/client references, counts, byte sizes, WebSocket state/buffer information, and durations measured within the owning process.
- Diagnostics omit scene objects, file data, customData, message bodies, chat text, URLs, and complete WebSocket payloads. Hashes are for local trace correlation, not authentication.
- Disable both flags after the diagnostic session. High-volume client scene logging is expected when enabled.

## Test harness

- `npm run test:sync` runs the client synchronization characterization, server merge characterization, and diagnostics opt-in/privacy tests.
- `npm run test:sync-performance` runs a synthetic Node-only sample at 100, 1,000, and 5,000 elements.
- Existing chat, Networking, and Architecture Catalog tests are unchanged and can be run via their existing package scripts.

## Validation status

All diagnostic and existing focused tests passed in the available Node environment. JavaScript syntax and package JSON checks passed. The production build could not run because Vite is not installed (`vite: not found`, exit 127). Browser/multi-client measurements were not available; see `COLLABORATION-SYNCHRONIZATION-DIAGNOSTICS-REPORT.md`.
