# Sketchizi Workbench Browser Verification Tooling 0.14.2

## What changed

This iteration makes the isolated browser smoke test report its own outcome to the local PowerShell runner instead of requiring the user to read the page and manually decide whether it passed.

- `scripts/workbench-browser-test-server.mjs` is a small dependency-free local server for the smoke test.
- `tests/browser/workbench-persistence-smoke.js` submits final PASS/FAIL assertions after the page reload phase.
- `scripts/verify-workbench-browser.ps1` opens the test page, waits up to 180 seconds for the posted result, prints each assertion, and returns an appropriate exit code.
- The local server binds to `127.0.0.1`, uses no-store responses, rejects traversal, limits result payload size, rejects invalid methods/payloads, and accepts result reports only from the exact test-page origin.

## Run on Windows

After installing dependencies and verifying the production build:

```powershell
npm ci
npm run build
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-workbench-browser.ps1
```

The browser test uses the separate origin `http://127.0.0.1:8765`. It exercises the actual persistence modules and simulation orchestration with a seeded React → REST service → PostgreSQL Workbench model. It checks the saved `.sketchizi` document, active and recent IndexedDB records, emergency backup, inactive view layout, image payload, saved simulation history without rerunning, and stale-result detection after semantic/profile changes.

## Automated tests

The local Node test suite includes tests for the test server's static-file response, result submission/status, malformed payloads, unsupported methods, origin rejection, path traversal, and browser assertion reporting.

## Verification status in this environment

- Full Node test suite: **256 passed, 0 failed**.
- Syntax checks for test server and browser smoke script: passed.
- Local test-server protocol check: passed (serving the page, accepting a same-origin result, and exposing the final status).
- ZIP integrity: passed after packaging.
- Actual browser execution: **not run**; the current hosted environment blocks Chromium navigation to local pages.
- Production build: **not verified**. `npm run build` stops because `node_modules/@excalidraw/excalidraw/dist/prod/fonts` is absent.
- Dependency restore: `npm ping` fails with `EAI_AGAIN` while resolving `registry.npmjs.org`; `npm ci` cannot be trusted to complete here until DNS/network is available.

This is verification tooling, not a production release. OpenAPI and SQL generation remain paused until the deterministic simulation workflow has passed the real browser and build gate. The original stable v1.10.86 ZIP remains untouched.
