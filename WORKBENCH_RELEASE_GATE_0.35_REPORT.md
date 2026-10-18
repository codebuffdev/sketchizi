# Sketchizi Workbench 0.35 — Release Workflow Contract Tests

## Purpose

This iteration makes the GitHub Actions release gate self-checking. Earlier tests verified how the summary is rendered, but could not detect all kinds of drift between `.github/workflows/workbench-release-gate.yml` and `package.json`.

## Changes

- Added `tests/workbench-ci-contract.test.mjs` with checks that every `npm run` command named in the workflow exists in `package.json`.
- Added checks that push, pull-request, and manual triggers remain present.
- Added checks for the clean-install/build gates, pinned Playwright runner, Chromium installation, and rendered-browser test.
- Added checks that the summary and diagnostics artifact are retained on failure, while the production bundle is uploaded only after success.
- Added checks for the expected stage log names and diagnostic-artifact retention.
- Added `npm run test:workbench-ci-contract` to `package.json` and to the Workbench regression step in CI.

## Local verification performed

- Workflow-contract tests: **6 passed**.
- Release-summary tests: **4 passed**.
- All **26** application and Workbench regression commands configured in the workflow completed successfully in the current local run.
- JavaScript syntax checks for the summary writer and browser smoke runner passed.
- The workflow parsed with the available YAML parser. The `actionlint` executable was not installed, so actionlint validation was not performed.
- ZIP integrity check completed without errors.

These results are local regression evidence, not a GitHub Actions result. The dependency install and production build were not run successfully in this iteration; no real Chromium smoke test was executed here.

## Gates still open

- A fresh `npm ci` must complete successfully on a clean runner.
- `npm run build` must complete successfully, including copying Excalidraw font assets.
- The rendered-browser persistence smoke must pass in GitHub Actions and its JSON result must be reviewed.
- The focused persistence smoke does not cover every drawing interaction.
- Adapters still need representative real k6 and JMeter exports; no production capacity certification is claimed.
- External OpenAPI and SQL validators have not been run.

## Next action

Push this package to the repository and run **GitHub → Actions → Workbench release gate**. Use the first failed stage and its `workbench-release-gate-diagnostics` artifact to drive the next fix. Avoid treating a local contract test or a synthetic test as a green release gate.

## Suggested Git commit

`test(workbench): verify CI workflow contract and release-gate drift`

## Versioning note

`0.35` is the Workbench milestone label. The application's existing `package.json` version remains `1.10.86`.
