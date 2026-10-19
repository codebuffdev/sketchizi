# Sketchizi Workbench 0.40 — One-Command Local Release Check

## Objective

Give Windows/macOS/Linux developers one local command that runs the same release gates as GitHub Actions, preserves command output, and produces a shareable report without confusing skipped stages or stale output with a passing release.

## Changes

- Added `npm run verify:workbench-release`, backed by `scripts/run-workbench-release-check.mjs`.
- Mirrors the CI order: toolchain check, dependency-free registry probe tests, non-blocking npm registry diagnostic, `npm ci`, Excalidraw font preflight, production build, application regressions, Workbench regressions, pinned Playwright install, Chromium install, and rendered-browser persistence smoke test.
- Writes separate logs under `artifacts/ci-logs/` and JSON/Markdown summaries under `artifacts/`.
- Uses the same release summary schema as CI, including first-failure guidance and explicit skipped stages.
- Treats the npm registry probe as diagnostic only; `npm ci` remains authoritative.
- Clears stale logs/reports before a run and ignores generated `artifacts/` locally, so an older PASS report is not accidentally reused or committed.
- Stops downstream release stages after a blocking failure and exits non-zero unless every blocking release stage passes.
- Added runner tests to the Workbench regression suite and GitHub Actions workflow.
- Application version remains `1.10.86`; `0.40` is the Workbench milestone label.

## Verification completed

- Configured offline application and Workbench regression commands: **28/28 passed**.
- Local release-runner unit tests: **8/8 passed**.
- CI workflow-contract tests: **8/8 passed**.
- Release-summary tests: **8/8 passed**.
- JavaScript syntax checks passed.
- ZIP integrity check passed.

## Release gates still open

The new one-command runner has not been completed end-to-end in this restricted environment. Prior attempts encountered npm registry DNS error `EAI_AGAIN`; therefore this package does **not** claim that `npm ci`, the production build, the Playwright/Chromium install, or the rendered-browser smoke test passed.

## Next action on Windows

From the extracted project root, run:

```powershell
npm run verify:workbench-release
```

Then inspect `artifacts/workbench-release-gate-summary.md` and the first failing stage's log under `artifacts/ci-logs/`. Share the summary and that first log if a stage fails. This is now the most direct route to resolving the outstanding release gate.

## Suggested Git commit

`ci(workbench): add one-command local release verification and reports`
