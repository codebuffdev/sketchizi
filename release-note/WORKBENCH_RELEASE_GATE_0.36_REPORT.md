# Sketchizi Workbench 0.36 — Actionable Release-Gate Summary

## Goal

Make the GitHub Actions release-gate result easier to diagnose without falsely treating skipped stages, missing outcome variables, or local tests as a green release.

## Changes

- Release summary JSON schema advanced to version 2.
- Summary includes GitHub repository, ref, commit SHA, run ID/attempt, and workflow URL when valid values are available.
- Summary identifies the first non-successful release stage and gives stage-specific diagnostics guidance.
- GitHub run URL creation validates repository/run identifier shapes and omits the URL when malformed.
- Markdown summary calls out that downstream stages may be skipped after an earlier failure.
- Added tests for first-failure guidance, missing outcomes, GitHub metadata, safe run URLs, and summary outcome mappings in the actual workflow.
- CI already runs the summary and workflow-contract tests; no extra dependency is required.

## Local verification performed

- `npm run test:workbench-ci-summary`: **6 passed**.
- `npm run test:workbench-ci-contract`: **7 passed**.
- Additional regression commands completed successfully in this local run:
  - `test:load-test-calibration`
  - `test:simulation`
  - `test:workbench-artifacts`
  - `test:workbench-format`
  - `test:infrastructure-profiles`
  - `test:workbench-ui`
  - `test:workbench-validation`
  - `test:workbench-poc`
  - `test:browser-verification-server`
  - `test:browser-index-fixture`
- Combined local run: **12 test commands completed successfully**; the log contained no failed test marker.
- Node syntax checks and ZIP integrity check passed.

## Release status — still open

These are not confirmed by this local run:

- Fresh `npm ci` on a clean runner.
- `npm run build` with Excalidraw font assets present.
- Actual Playwright/Chromium browser smoke on the GitHub Actions runner.
- Review of a successful uploaded browser result artifact.
- Validation with representative real k6 and JMeter exports.
- External OpenAPI and SQL validators.

The environment used to create this ZIP did not have installed project dependencies, so no production build or real Chromium test is claimed.

## Next action

Push the changes to the repository and run **GitHub → Actions → Workbench release gate**. Use the new first-failure section and `workbench-release-gate-diagnostics` artifact to target the earliest actual failure. Further code changes should be driven by that result rather than adding features ahead of a green release gate.

## Suggested Git commit

`ci(workbench): add actionable release gate context and failure guidance`

## Versioning note

`0.36` is the Workbench milestone label. The application's existing `package.json` version remains `1.10.86`.
