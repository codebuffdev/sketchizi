# Sketchizi Workbench 0.25 — Index Workflow Release Verification

## Purpose

This increment strengthens the release-verification path for the 0.24 query/index hypothesis workflow. It does not add another optimization hypothesis or change production application behavior. The original 1.10.86 application version remains unchanged.

## Changes

- Refactored the browser smoke fixture into `tests/browser/workbench-index-smoke-fixture.js`, shared by the browser reload smoke and a Node test.
- The fixture creates a real five-entity Workbench model: React, REST service, PostgreSQL, the `GET /api/items` endpoint, and the `items` table. It includes typed runtime, endpoint ownership, and table containment relationships.
- The fixture runs the existing simulation runner, prepares a candidate index hypothesis from actual database-read evidence, runs that hypothesis, and verifies indexed-read counts and saved-time metrics are event-derived.
- It verifies that the hypothesis changes only a cloned profile and does not mutate the canonical model or original profile.
- The browser smoke now checks that accepted index metadata, generated `CREATE INDEX` SQL, the `/api/items` OpenAPI path, semantic entities, simulation history, and unknown extension data survive IndexedDB/file save-reload round trips.
- Added `npm run test:browser-index-fixture` for deterministic verification of the shared fixture in Node.
- Updated the Windows browser-verification success label to include the index artifact checks.

## Verification performed in this environment

- Shared Node/browser fixture test: **1 passed, 0 failed**.
- Query/index hypothesis suite: **41 passed, 0 failed**.
- Simulation suite: **98 passed, 0 failed**.
- Workbench artifact generation: **11 passed, 0 failed**.
- Workbench format/persistence: **22 passed, 0 failed**.
- Browser verification server: **6 passed, 0 failed**.
- POC workflow: **13 passed, 0 failed**.
- Workbench UI: **32 passed, 0 failed**.
- Workbench validation: **25 passed, 0 failed**.
- Collaboration sync: **35 passed, 0 failed**.
- Both modified JSX panels passed TypeScript JSX parser checks; both browser smoke modules passed `node --check`.
- ZIP archive integrity: checked after packaging.

These are test executions across overlapping suites, not a count of unique tests.

## Build and real-browser limitations

- `npm ci` could not restore dependencies because DNS resolution to `registry.npmjs.org` failed with `EAI_AGAIN`; npm then emitted `Exit handler never called!`.
- `npm run build` remains blocked in `prebuild` because `node_modules/@excalidraw/excalidraw/dist/prod/fonts` is absent. Vite does not start, so this is not a successful production build.
- Headless Chromium in this environment did not complete even a minimal `data:` URL navigation within the timeout. Therefore the real-browser smoke test was not run here.
- No claim is made that the complete React/Excalidraw UI has passed real-browser verification.

## Windows verification

From the extracted `sketchizi-main` folder in PowerShell:

```powershell
npm ci
npm run build
npm run test:browser-index-fixture
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-workbench-browser.ps1
```

The final command opens `http://127.0.0.1:8765/tests/browser/workbench-persistence-smoke.html` on a separate origin and waits for the page's automatic PASS/FAIL report after IndexedDB save and reload. A pass requires every assertion to read PASS, including the new index schema, generated SQL, OpenAPI, and hypothesis evidence checks.

## Exit criteria

The release verification gate is not closed until `npm ci`, `npm run build`, and the Windows real-browser reload test all pass. Passing Node tests do not substitute for these checks.
