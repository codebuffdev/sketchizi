# Sketchizi Workbench 0.39 — Release Summary Stage Mapping Fix

## Objective

Ensure the CI release summary reports the earliest failing stage accurately, including the dependency-free npm registry diagnostic unit tests that run before `npm ci`.

## Change

- Added `REGISTRY_PROBE_TESTS_OUTCOME` to the release summary stage list and to the workflow summary environment.
- Added targeted guidance pointing to `artifacts/ci-logs/npm-registry-probe-tests.log` if those unit tests fail.
- Added a regression test proving a failing registry diagnostic test is reported before the subsequent skipped install/build/browser stages.
- Extended workflow contract checks to ensure the summary consumes the exact `registry-probe-tests` step outcome.
- No product behavior or application version changes were made.

## Local verification

- Release-summary tests: **8/8 passed**.
- CI workflow-contract tests: **8/8 passed**.
- npm registry probe unit tests: **5/5 passed**.
- All **28 configured offline regression commands** from the CI workflow completed successfully in the local run.
- JavaScript syntax checks passed for the summary generator and modified test files.
- ZIP integrity check passed.

## Important limitation

This environment cannot currently resolve `registry.npmjs.org` (`EAI_AGAIN`). Because the clean dependency installation did not complete, this local run does **not** verify `npm ci`, the production Vite build, or the rendered Playwright/Chromium browser smoke. The offline regression tests do not replace those gates.

## Next action

Push this version and inspect the actual **GitHub Actions → Workbench release gate** result. If the workflow fails, download `workbench-release-gate-diagnostics`; the summary should now identify the earliest non-success stage, including a failure in the registry diagnostic unit tests.

## Suggested Git commit

`ci(workbench): report registry probe test failures accurately`

## Versioning note

`0.39` is the Workbench milestone label. The application's existing `package.json` version remains `1.10.86`.
