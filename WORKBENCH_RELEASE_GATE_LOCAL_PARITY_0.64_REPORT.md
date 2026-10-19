# Sketchizi Workbench 0.64 — Local Release-Gate Parity

## Objective

Make the local release runner behave like the GitHub Actions release gate when an early stage fails: continue independent diagnostics, skip only checks whose required inputs are unavailable, and preserve a strict final release verdict.

## Changes

- Removed the local runner's global stop-after-first-blocking-failure behavior.
- Added explicit stage prerequisites for font preflight, production build, OpenAPI validation, SQL parsing, PostgreSQL execution, and browser smoke.
- Kept independent application and Workbench regression suites, artifact fixture generation, and external-tool installation eligible to run after unrelated failures.
- Kept multi-command stages fail-fast internally so a failing command does not cause later commands in that same stage to produce misleading results.
- Kept skipped required stages as non-passing outcomes in the shared release summary; continuing diagnostics cannot turn a failed gate into a pass.
- Added tests for independent-stage continuation, prerequisite-based skips, and the declared dependency boundaries.

## Validation performed

- Local release-runner tests: 9 passed, 0 failed.
- GitHub Actions workflow contract tests: 12 passed, 0 failed.
- Release summary tests: 9 passed, 0 failed.
- Package-lock consistency unit tests: 6 passed, 0 failed.
- npm registry diagnostic unit tests: 5 passed, 0 failed.
- Simulation regression suite: 162 passed, 0 failed.
- Workbench artifact tests: 11 passed, 0 failed.
- External artifact adapter tests: 6 passed, 0 failed.
- PostgreSQL integration guard tests: 12 passed, 0 failed. These are unit tests with mocked command execution, not a live PostgreSQL run.
- Package manifest/lockfile consistency: 19/19 checks passed.
- JavaScript syntax checks for modified files: passed.
- ZIP integrity: checked after packaging.

## Not verified in this environment

- `npm ci` and production Vite build were not run as a clean release attempt.
- Real Chromium browser smoke was not run; the previous environment's `ERR_BLOCKED_BY_ADMINISTRATOR` navigation restriction remains unresolved.
- External Redocly/pgsql-parser validation was not run against newly generated fixtures in this verification pass.
- Live PostgreSQL DDL execution was not run. PostgreSQL-related tests above verify safety and orchestration contracts only.
- GitHub Actions itself was not executed from this workspace.

## Expected behavior

A failed install now skips only stages that require installed dependencies. Independent regression tests and artifact generation still run, while validators wait for both their fixtures and required tooling. The release summary remains `NOT PASSED` if any required stage fails or is skipped.
