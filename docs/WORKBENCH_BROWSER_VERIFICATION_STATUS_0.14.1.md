# Sketchizi Workbench Browser Verification Status 0.14.1

## Purpose

This is a verification-focused iteration. It strengthens simulation history freshness checks and extends the isolated browser persistence smoke page. It does not add a new product feature or claim that the UI has been browser-verified.

## Changes

- Canonicalized nested object keys when comparing semantic model snapshots and simulation profile inputs. Object insertion order no longer creates a false stale-result warning; array order remains preserved.
- Added regression coverage for equivalent models/profiles with reordered object keys and for actual value changes.
- Expanded the browser smoke workflow to create a React → REST service → PostgreSQL model, execute the same seeded baseline/traffic-surge/outage orchestration used by the UI, persist a bounded simulation-history record, reload the page, and check that results restore without rerunning the engine.
- The browser smoke also checks IndexedDB document and recent-file records, emergency backup, active `.sketchizi` metadata, inactive view layout, image payload, unknown extensions, and stale-history behavior after a model or profile change.

## Automated checks completed

- Full Node test suite: **250 passed, 0 failed**.
- Simulation-history tests: **7 passed, 0 failed**.
- Browser smoke JavaScript syntax check: passed.
- Runnable Workbench simulation example: baseline, traffic surge, and PostgreSQL outage all completed; example output is in `examples/simulation/workbench-experiment-runner.mjs` and can be run using `npm run example:workbench-simulation`.
- ZIP integrity check: passed.

## Still blocked / not verified

- The real browser smoke page did not complete in this hosted environment. Chromium returned `ERR_BLOCKED_BY_ADMINISTRATOR` when navigating to the isolated local test page. Do not treat the browser workflow as passed until it completes locally.
- Production build remains blocked before Vite because `node_modules/@excalidraw/excalidraw/dist/prod/fonts` is absent. Restore dependencies with `npm ci` in a network-enabled environment, then run `npm run build`.
- This smoke page verifies persistence modules and simulation-history restoration in a browser; it is not a complete React/Excalidraw app UI test.

## Run the isolated browser smoke test on Windows

1. Extract the ZIP.
2. Open PowerShell in `sketchizi-main`.
3. Run:

   ```powershell
   powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-workbench-browser.ps1
   ```

4. Wait for `PASS — browser reload and simulation-history test`. Every individual assertion must show `PASS`.
5. If it fails, copy the full `FAIL` output and the checks above it. The page runs at `http://127.0.0.1:8765`, isolated from Sketchizi's normal app origin.

## Roadmap checkpoint

OpenAPI and SQL generation remain paused until the end-to-end simulation workflow is reproducible, measurable, explainable, and verified in the running application. The original stable 1.10.86 baseline ZIP remains untouched.

Suggested commit:

`test(workbench): harden simulation history freshness and browser round-trip`
