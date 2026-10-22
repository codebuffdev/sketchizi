# Sketchizi Breakscale-Inspired Workbench — Phase 17 Acceptance Gate

## Purpose

Phase 17 pauses feature accumulation and records the first browser acceptance attempt for the relationship lifecycle delivered in Phases 13–16. No product source code or package version was changed in this phase.

## Environment

- Package version: `1.10.86`
- Browser: Chromium (`/usr/bin/chromium`)
- Browser runner: `scripts/run-workbench-browser-smoke.mjs`
- Smoke URL: `http://127.0.0.1:8765/tests/browser/workbench-persistence-smoke.html`

## Results

### Relationship regression tests

Command:

```bash
node --test tests/workbench-relationship-roundtrip-integration.test.js tests/workbench-relationship-lifecycle.test.js tests/workbench-relationship-editing.test.js tests/workbench-relationship-deletion.test.js
```

Result: **13 passed, 0 failed**.

The integration-style test covers model/connector identity, relationship editing, save/reopen serialization, targeted connector deletion, preservation of unrelated arrows, and invalid/duplicate relationship rejection. It exercises model and persistence helpers; it is not the live React controller workflow.

### Browser persistence smoke

Command:

```bash
npm run test:workbench-browser-e2e
```

Result: **BLOCKED — environment policy**, not a pass.

Chromium started and connected to DevTools, but navigation to the local smoke page was rejected with `net::ERR_BLOCKED_BY_ADMINISTRATOR`. The runner classified this as `environment-policy-block` and recorded the details in `artifacts/workbench-browser-smoke-result.json`.

## Acceptance decision

**Phase 17 is not accepted as end-to-end verified.** Source-level regression tests pass, but this environment's browser policy prevented the smoke page from running. The application workflow must be verified in a local or CI environment where Chromium is allowed to navigate to loopback URLs.

## Next steps for local verification

From the project root on the user's machine:

```powershell
npm ci
npm run build
npm run test:workbench-browser-e2e
```

If the browser smoke still reports an administrator block, run it in an approved local/CI environment and retain the generated `artifacts/workbench-browser-smoke-result.json`. Do not treat an environment block as a passing test.

## Suggested Git commit

```bash
git add BREAKSCALE_INSPIRED_WORKBENCH_PHASE17_ACCEPTANCE_GATE.md artifacts/workbench-browser-smoke-result.json
git commit -m "test(workbench): record relationship lifecycle browser acceptance gate"
```
