# Sketchizi Workbench 0.61 — Browser Runner Reliability

## Changes

- Removed the undeclared Playwright runtime import from the browser smoke runner.
- Added a Chromium DevTools Protocol runner using Node's built-in WebSocket API, so the smoke test can use an installed Chromium without adding an npm package or changing the lockfile.
- Added `WORKBENCH_CHROMIUM_PATH` / `CHROMIUM_PATH` overrides for locating Chromium in CI or developer environments.
- Added explicit navigation-error handling. A browser policy block is recorded as a failed smoke run rather than leaving the runner waiting for 180 seconds on an unrelated `about:blank` page.
- Added cleanup for the Chromium process group on Unix and a runner-contract test suite.

## Verification

- `npm run test:simulation`: **162 passed, 0 failed**.
- `npm run test:workbench-browser-workflow`: **13 passed, 0 failed**.
- `npm run check:package-lock-consistency`: **19/19 checks passed**.
- `node --check scripts/run-workbench-browser-smoke.mjs`: passed.
- `node --check tests/workbench-browser-runner.test.mjs`: passed.
- ZIP integrity: checked after packaging.

## Real Chromium attempt

The browser runner was executed with `/usr/bin/chromium`. Chromium started and exposed the DevTools endpoint, but its navigation to the local smoke page was rejected with `net::ERR_BLOCKED_BY_ADMINISTRATOR`. The runner now exits promptly and writes a failure report with that exact reason.

This is **not** a browser smoke pass. The browser policy restriction prevents the persistence/replay assertions from running in Chromium. The production Vite build and complete release gate were not run; `node_modules` is absent in this environment.

## Interpretation boundary

The runner no longer depends on Playwright being installed, and the Node workflow tests pass. A real Chromium workflow remains unverified until run in an environment that permits navigation to the local smoke server.
