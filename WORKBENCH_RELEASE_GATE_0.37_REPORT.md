# Sketchizi Workbench 0.37 — Excalidraw Font Preflight

## Purpose

The previous release attempts identified a recurring, specific build gate: Sketchizi's prebuild script expects self-hosted font assets from the installed `@excalidraw/excalidraw` package. This iteration reports that dependency and asset state explicitly before Vite starts.

## Changes

- Added `scripts/verify-excalidraw-font-assets.mjs` and `npm run check:excalidraw-font-assets`.
- The check compares the declared, lockfile, and installed Excalidraw versions.
- It verifies `node_modules/@excalidraw/excalidraw/dist/prod/fonts` exists and recursively counts `.woff`, `.woff2`, `.ttf`, and `.otf` files. An empty folder no longer appears healthy.
- Added a CI preflight step before the production build, with its own log and release-summary outcome.
- Updated first-failure guidance to direct font-asset failures to `artifacts/ci-logs/excalidraw-font-assets.log`.
- Added five unit tests for a successful package, version mismatch, lockfile mismatch, empty fonts, and missing installed package.

## Local verification performed

- Font preflight, release-summary, and workflow-contract test set: **18 passed**.
- Configured application and Workbench regression commands: **27 commands passed**.
- `node --check` passed for the new preflight script, summary writer, and new test.
- ZIP archive integrity checked after packaging.

These are local Node-based checks with dependency-free fixtures. They do not prove that the real pinned npm package was installed in this environment.

## Release status — still open

- A fresh `npm ci` has not completed in this environment; attempts have timed out while accessing the package registry.
- Therefore the new preflight has not been confirmed against a real installed Excalidraw package here.
- `npm run build` has not passed in this environment.
- A real Playwright/Chromium smoke run has not passed in this environment.
- Actual GitHub Actions results have not been observed.
- Representative real k6 and JMeter export validation and external OpenAPI/SQL validation remain open.

## Next action

Push this package and inspect **GitHub → Actions → Workbench release gate**. If the font-preflight stage fails, use its dedicated log to compare dependency versions and the font-file count. Fix the first actual failing stage before adding more prototype scope.

## Suggested Git commit

`build(workbench): preflight Excalidraw font assets before Vite`

## Versioning note

`0.37` is the Workbench milestone label. The application's existing `package.json` version remains `1.10.86`.
