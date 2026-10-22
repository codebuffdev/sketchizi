# Sketchizi Workbench 0.71 — Release Command Timeouts

## Summary

This release bounds long-running commands in the local release-gate runner so registry and tool-install operations cannot wait indefinitely without producing a clear diagnostic.

## Changes

- Added a configurable default command timeout through `WORKBENCH_RELEASE_COMMAND_TIMEOUT_MS` (default: 180 seconds).
- Added explicit timeouts for npm registry probing (20 seconds), clean dependency installation (10 minutes), external validator/Playwright installation (10 minutes), Chromium installation (10 minutes), and rendered-browser smoke (3 minutes).
- Timed-out commands write an explicit timeout marker to their stage log, receive SIGTERM, and receive SIGKILL after a five-second grace period if still running.
- A timeout exits as code 124 and remains a failed release stage. Dependent stages are skipped; independent diagnostic stages continue.
- Added an integration test that starts a deliberately stalled child process and verifies it is terminated and the timeout is recorded.

## Verification performed

- Local release runner tests: 13 passed.
- CI workflow contract tests: 12 passed.
- Release summary tests: 9 passed.
- Package-lock consistency tests: 6 passed.
- Simulation regression suite: 162 passed.
- Workbench artifact tests: 11 passed.
- Diagnostic bundle, redaction, and failure-analysis tests: 12 passed.
- Diagnostic bundle verifier tests: 10 passed.
- JavaScript syntax checks: passed.
- Package manifest/lockfile consistency: 19/19 passed.

## Full release-gate attempt

A complete local release-gate run was attempted, but did not finish in the available execution window. The clean install log reported npm's `Exit handler never called` error and noted that it could not write its npm log under the current environment. The run later reached the external-tools installation stage before the execution was interrupted; no complete release summary or diagnostic archive was produced by that attempt.

This does **not** establish a passing production build, clean dependency installation, live PostgreSQL execution, or browser workflow. Those remain unverified and should be rerun in GitHub Actions or another environment with working npm registry access.
