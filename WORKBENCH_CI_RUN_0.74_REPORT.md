# Sketchizi Workbench 0.74 — Real CI Run Helper

## Purpose

Provide a safe, repeatable PowerShell entry point for dispatching the existing GitHub Actions release gate and collecting its actual diagnostic evidence. This release is focused on closing the local-verification-to-real-CI gap, not adding another simulation feature.

## Changes

- Added `scripts/run-workbench-ci.ps1` to dispatch or inspect a known release-gate run using GitHub CLI.
- Requires local `HEAD` to match `origin/<ref>` before dispatch and verifies the completed run used that same commit. It never pushes code.
- Waits for the workflow result, downloads `workbench-release-gate-diagnostics`, and runs the existing diagnostic ZIP importer.
- Collects evidence even when the release run failed, then returns a non-zero exit code for a failed CI conclusion.
- Added PowerShell usage and requirements in `docs/WORKBENCH_CI_RUN_0.74.md`.
- Added the helper contract test to the package scripts, local release plan, and GitHub Actions regression list.

## Verification performed in this environment

- CI helper contract tests: 4 passed.
- Combined CI workflow-contract, helper, and local-runner tests: 30 passed, 0 failed.
- Full Workbench CI regression script list from the 0.73 archive: all 18 scripts completed successfully, including 162 simulation tests, 22 Workbench format/persistence tests, 32 Workbench UI tests, 25 validation tests, 13 POC tests, 12 PostgreSQL guard tests, and diagnostic verifier/import tests.
- Package manifest/lockfile consistency: 19/19 passed.
- JavaScript test files executed successfully; archive integrity checked after packaging.

## Not verified

- The PowerShell helper was not executed against an authenticated GitHub account in this environment.
- No new GitHub Actions run was triggered; the real CI result remains unknown.
- Clean `npm ci`, production Vite build, external OpenAPI/SQL validator execution, rendered Chromium smoke, and live PostgreSQL execution were not run here.

## Suggested commit

`ci(workbench): add PowerShell helper to run and inspect release gate`
