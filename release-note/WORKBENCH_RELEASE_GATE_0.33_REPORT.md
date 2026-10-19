# Sketchizi Workbench 0.33 — Rendered-Browser Gate

## Added

- `scripts/run-workbench-browser-smoke.mjs` launches the existing isolated browser verification server, launches headless Chromium through Playwright, visits the persistence smoke page, waits for its result, and writes a JSON report.
- `npm run test:workbench-browser-e2e` runs the rendered-browser smoke test.
- The GitHub Actions workflow installs a pinned Playwright runner and Chromium, executes the browser smoke after the clean install/build/regression steps, and uploads the report even when the browser step fails.

## Coverage

The browser page exercises a real browser reload and checks IndexedDB active-document persistence, simulation history, stale-result marking, recent-file snapshot, emergency backup, `.sketchizi` serialization, image payload, index evidence, and regeneration of SQL/OpenAPI starter artifacts from the persisted semantic model.

## Verification status

- The new runner and workflow have been authored, but the GitHub Actions workflow has not been run against the user's repository in this session.
- This environment previously could not complete `npm ci`; the project build also stopped before Vite because the Excalidraw font asset directory was missing after the partial install.
- The smoke test is therefore a configured CI gate, not a claimed pass. A passing CI artifact is required before marking the rendered-browser persistence gate closed.
- This remains a persistence/Workbench smoke test, not a full end-to-end test of the entire Sketchizi drawing UI.
- Real k6/JMeter export validation and a production-capacity certification are out of scope and remain open.

## Running locally

After a successful clean dependency install and build prerequisites:

```powershell
npm install --no-save --no-package-lock --ignore-scripts playwright@1.64.1
npx playwright install chromium
npm run test:workbench-browser-e2e
```

The command writes `artifacts/workbench-browser-smoke-result.json` and exits non-zero if the page reports failed checks, an unhandled page error occurs, the server cannot start, or the test times out.

## Suggested commit

`test(workbench): automate browser persistence smoke in CI`
