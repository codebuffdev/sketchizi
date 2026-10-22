# Sketchizi Workbench 0.34 — CI Diagnostics and Honest Gate Summary

## Changes

- The GitHub Actions workflow records separate console logs for toolchain details, `npm ci`, production build, application regression suites, Workbench regression suites, Playwright installation, Chromium installation, and rendered-browser smoke testing.
- The workflow writes a release-gate summary to the GitHub Actions job summary and to JSON/Markdown files, including each step's real GitHub Actions outcome.
- The JSON and Markdown summaries, browser smoke report, and CI logs are uploaded as a diagnostics artifact even when a later gate fails.
- Added `test:workbench-ci-summary` with tests for all-success handling, failed install with skipped follow-on steps, unknown/missing outcome values, and explicit scope limitations.

## Local verification performed for 0.34

- `node --test tests/workbench-ci-summary.test.mjs`: 4 passed.
- JavaScript syntax checks passed for the summary writer and browser-smoke runner.
- The GitHub Actions workflow YAML parsed successfully.
- All offline regression commands configured in the workflow completed successfully in this local run: application regression suites, Workbench/calibration suites, browser-verification server tests, browser-index fixture, and the new CI-summary tests.
- A generated-summary smoke check with synthetic step outcomes confirmed that JSON and Markdown outputs are written and appended to `GITHUB_STEP_SUMMARY`. Synthetic outcomes are only a writer test; they do not represent a successful release gate.

## Gates still open

- A fresh `npm ci` has not completed successfully in this restricted environment.
- The production build has not passed here; previous attempts stopped in `prebuild` because the installed Excalidraw font assets were missing after an incomplete dependency install.
- Chromium rendered-browser persistence smoke is configured in CI but has not yet produced a passing workflow result.
- The browser smoke is a focused Workbench persistence/artifact test, not a complete test of every Sketchizi drawing interaction.
- Adapters still need validation with representative real k6 and JMeter exports. The project does not claim production capacity certification from synthetic scenarios.
- External OpenAPI and SQL validators are not claimed to have passed.

## Next verification action

Commit and push the ZIP contents, open **GitHub → Actions → Workbench release gate**, and download the `workbench-release-gate-diagnostics` artifact. The job summary should identify the first failed or skipped stage and the artifact contains each stage's console log. If the job is green, inspect the browser smoke report as well before closing the gate.

## Suggested Git commit

`ci(workbench): retain release gate diagnostics and status summary`

## Versioning note

`0.34` is the Workbench milestone label. The application's existing `package.json` version remains `1.10.86`.
