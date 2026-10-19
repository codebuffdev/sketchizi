# Sketchizi Workbench 0.31 — Release Gate Runner

## Purpose

This milestone prioritizes verification rather than adding another simulation feature. It adds a repeatable Windows PowerShell entry point that runs the build, existing application regression suites, Workbench suites, and the isolated browser persistence/index-artifact smoke test.

## Added

- Added `scripts/verify-workbench-release.ps1`.
- Checks that Node.js/npm are available.
- Runs `npm ci` and the production build first.
- Runs existing application regression suites for networking, architecture catalog, chat protocol, collaboration synchronization, UI defaults, auth, AI, device support, backend warmup, recovery, community gateway, and font handling.
- Runs Workbench calibration/import, simulation, artifacts, format/persistence, infrastructure, UI/model, validation, POC, and browser fixture tests.
- Runs the existing isolated browser persistence/history/index-artifact smoke last.
- Stops at the first failed command and names the failing step.
- Explicitly says a passing script does not certify production capacity or replace external OpenAPI/SQL validation.

## Verification executed in this environment

Node-based application and Workbench regressions were rerun from the packaged source. The application suites run without installed npm dependencies in this extracted environment; the production build still requires a complete dependency install.

Existing application regression suites:

- Networking rules: **4 passed, 0 failed**.
- Architecture catalog: **3 passed, 0 failed**.
- Chat protocol: **10 passed, 0 failed**.
- Collaboration synchronization: **35 passed, 0 failed**.
- UI defaults: **11 passed, 0 failed**.
- Authentication: **17 passed, 0 failed**.
- AI client and gateway: **27 passed, 0 failed**.
- Collaboration host authentication: **6 passed, 0 failed**.
- Device support: **7 passed, 0 failed**.
- Backend warmup: **4 passed, 0 failed**.
- Recovery drafts: **1 passed, 0 failed**.
- Community gateway: **3 passed, 0 failed**.
- Font asset handling: **7 passed, 0 failed**.
- Font family defaults: **7 passed, 0 failed**.

Workbench regression suites:

- Load-test calibration/import: **15 passed, 0 failed**.
- Simulation: **124 passed, 0 failed**.
- Workbench artifact generation: **11 passed, 0 failed**.
- Workbench format/persistence: **22 passed, 0 failed**.
- Infrastructure profiles: **9 passed, 0 failed**.
- Workbench UI/model: **32 passed, 0 failed**.
- Workbench validation: **25 passed, 0 failed**.
- Workbench POC: **13 passed, 0 failed**.
- Browser verification server: **6 passed, 0 failed**.
- Browser fixture: **1 passed, 0 failed**.
- ZIP archive integrity verified.

These are individual suite executions, with overlap across suites; the numbers should not be added as unique tests. Node tests passing without installed dependencies do not replace the production build or browser run.

## Release blockers observed

- `npm ci --no-audit --no-fund` did not complete: package-registry requests to `registry.npmjs.org` failed with `EAI_AGAIN` and left only a partial `node_modules` directory.
- `npm run build` failed before Vite because `node_modules/@excalidraw/excalidraw/dist/prod/fonts` was absent. The missing files are a consequence of the incomplete dependency install in this environment; the build is not marked passed.
- Attempted Chromium/Playwright navigation to the isolated local browser smoke page returned `ERR_BLOCKED_BY_ADMINISTRATOR`. No real-browser smoke result was received, so browser verification is still open.

## Still open

- Run this gate from a clean extraction on a machine/network where `npm ci` succeeds, then require a successful `npm run build` and browser smoke result.
- Exercise the actual React Workbench UI end-to-end: create/open the POC, configure and validate it, run baseline/stressed simulation, inspect traces, generate artifacts, save/reopen, and confirm the views/history persist. The current browser fixture covers persistence and generated artifact invariants, not the complete rendered UI journey.
- Validate generated OpenAPI with a real OpenAPI validator and SQL against a real PostgreSQL parser/test database.
- Validate the JSON, k6 and JMeter import adapters against representative real tool exports. Current automated fixtures are test fixtures; no user-provided real load-test export was available during this run.

## Windows next action

Extract the ZIP to a clean directory, open PowerShell in `sketchizi-main`, and run:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-workbench-release.ps1
```

Run on a network with access to the npm registry. The script stops at the first failing step. A successful run covers the listed tests/build/browser fixture only and does not itself certify the simulation or production capacity.

## Suggested Git commit

`test(workbench): add repeatable full release gate runner`

Application package version remains `1.10.86`; 0.31 is a Workbench prototype milestone, not an application release version.
