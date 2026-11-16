# Phase 5K — Build-Prerequisite Diagnostics

## Purpose

Make the next production-build attempt actionable when dependencies cannot be installed. A source-only test suite must not be mistaken for a successful Vite build.

## Changes

- Added `scripts/check-build-prerequisites.mjs` and `npm run check:build-prerequisites`.
- The check verifies the HTML entry point, declared build/Vite configuration, installed Vite executable, and installed pinned Excalidraw package/font assets.
- It returns a concise `READY` or `BLOCKED` status, machine-readable JSON, and the next action. It does not install dependencies, modify files, or claim to execute the production build.
- Added `tests/build-prerequisites.test.js` and `npm run test:build-prerequisites`, covering ready state and missing Vite, fonts, or entry page.
- No editor, canvas, collaboration, persistence, architecture rule, or dependency version changes were made.

## Verification

- `npm run test:all`: **373/373 passed**.
- `npm run test:build-prerequisites`: **4/4 passed**.
- `npm run test:build-readiness`: **16/16 passed**.
- `npm run test:review-integration`: **68/68 passed**.
- `npm run check:package-lock-consistency`: **19/19 passed**.
- `npm run check:build-prerequisites`: **BLOCKED**, correctly reporting missing Vite and installed Excalidraw font assets.
- `npm ci --ignore-scripts --fetch-retries=0 --fetch-timeout=10000`: did not complete within the execution limit. The independent registry probe reports DNS `EAI_AGAIN` for `registry.npmjs.org`.
- `npm run build`: **not run successfully / unverified** because the Vite executable is unavailable. Do not treat the source-contract tests as a substitute for a production build.

## Next action

On a machine or CI runner with working npm registry access, run `npm ci`, then `npm run check:build-prerequisites`, `npm run check:excalidraw-font-assets`, and `npm run build`. Investigate any actual build error only after dependencies install successfully.
