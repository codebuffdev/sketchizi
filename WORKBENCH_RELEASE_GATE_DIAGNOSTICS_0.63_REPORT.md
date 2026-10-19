# Sketchizi Workbench 0.63 — Release Gate Diagnostic Continuation

## Objective

Make CI collect useful independent diagnostic results after a release-gate failure, without turning a partial run into a passing release.

## Changes

- Application and Workbench regression suites run even if an earlier install/build stage fails, so their outcomes are recorded independently.
- Artifact fixture generation and pinned external-tool installation continue after earlier failures, producing diagnostics when the environment permits.
- OpenAPI and PostgreSQL-parser validation run only when both generated fixtures and external validators are available.
- PostgreSQL execution validation runs only when fixture generation succeeds. Its existing disposable-database safeguards remain unchanged.
- Chromium installation is attempted independently; browser smoke runs only if that installation succeeds.
- Font preflight and production build are skipped when `npm ci` fails because they require the installed application dependencies.
- The summary remains a hard release gate: any failure or skipped required stage keeps the overall result `NOT PASSED`.

## Environment findings from this workspace

- Node.js: v22.16.0.
- npm: 10.9.2.
- package manifest/lockfile consistency: 19/19 checks passed.
- npm registry probe: DNS failure (`EAI_AGAIN registry.npmjs.org`); dependency installation and production build could not be completed in this environment.
- The previous Chromium smoke result remains an administrator-policy navigation block (`net::ERR_BLOCKED_BY_ADMINISTRATOR`). This release does not override browser policy or reinterpret the result as success.

## Validation performed

Dependency-free tests are run and recorded for this archive. Full `npm ci`, production build, external OpenAPI/SQL validators, PostgreSQL execution, and Chromium smoke are not claimed as passing because the environment's registry DNS and browser navigation restrictions prevent a trustworthy complete run.

## Test results

- Simulation regression suite: 162 passed, 0 failed.
- Browser workflow/runner tests: 15 passed, 0 failed.
- Workbench artifact tests: 11 passed, 0 failed.
- Workbench file-format/persistence tests: 22 passed, 0 failed.
- External artifact adapter tests: 6 passed, 0 failed.
- PostgreSQL integration guard tests: 12 passed, 0 failed. These are mocked/unit tests; they do not mean a live PostgreSQL server was contacted.
- Release workflow contract tests: 12 passed, 0 failed.
- Combined release contract, local-runner, summary, registry-probe, and lockfile suites: 40 passed, 0 failed.
- JavaScript syntax checks for release scripts: passed.
- Package manifest/lockfile consistency: 19/19 checks passed.
- ZIP archive integrity: checked after packaging.

The workflow contract tests validate the CI conditions and their dependency boundaries. They do not execute GitHub Actions itself.
