# Sketchizi Workbench 0.44 — Guarded PostgreSQL DDL Execution

## Purpose

The PostgreSQL integration stage creates database objects to execute generated DDL. In 0.43 this safety boundary depended mainly on documentation. Workbench 0.44 makes the stage fail closed by default and requires an explicit opt-in before it mutates a target database.

## Changes

- Added `assertSafePostgresTarget()` to `scripts/validate-workbench-generated-sql-postgres.mjs`.
- Requires `WORKBENCH_POSTGRES_ALLOW_SCHEMA_MUTATION=true` before running any `psql` command.
- Requires `WORKBENCH_POSTGRES_ALLOW_REMOTE=true` as a second explicit opt-in for non-loopback hosts. Localhost, 127.0.0.1, and IPv6 loopback remain the default allowed host category when schema mutation is enabled.
- Refuses exact protected database names `prod`, `production`, `live`, `customer-data`, `customer_data`, and `customerdata`.
- Emits an actionable message before invoking `psql` when the guard blocks a target.
- Configures the GitHub Actions PostgreSQL step to set the mutation opt-in only for its own temporary PostgreSQL 17 service. The CI workflow does not enable remote targets.
- Adds guard regression tests for no opt-in, remote-host opt-in, protected database names, and IPv4/IPv6 loopback behavior.
- Improves release-summary remediation guidance and updates `README.md` and `WORKBENCH_NEXT_STEP.txt`.

These checks reduce accidental mutation risk but cannot prove that a database is disposable. Do not point this stage at production.

## Verification performed

- Offline regression command matrix: **33/33 passed**. Detailed output: `WORKBENCH_0.44_OFFLINE_REGRESSIONS.log`.
- Focused Node.js tests across PostgreSQL integration, CI contract, release runner, and release summary: **38/38 passed**. Detailed output: `WORKBENCH_0.44_FOCUSED_TESTS.log`.
- Re-extracted the finished ZIP to a clean directory with neither `artifacts/` nor `node_modules/` present and reran those focused tests: **38/38 passed**. Detailed output: `WORKBENCH_0.44_FRESH_EXTRACTION_TESTS.log`.
- Manifest/lockfile checker: **19/19 checks passed**.
- Generated representative OpenAPI and PostgreSQL DDL fixtures from the Workbench generators into a temporary directory successfully.
- JavaScript syntax checks passed for modified code and tests.
- GitHub Actions workflow YAML parsed successfully with PyYAML.
- The archive integrity check passed.

Test counts overlap; do not sum them as unique tests.

## Still unverified

- A fresh `npm ci` and the production build have not passed in this environment. The last actual release run failed during npm package download with registry DNS error `EAI_AGAIN`.
- Redocly OpenAPI validation, `pgsql-parser` execution, PostgreSQL DDL execution against a live server, Chromium installation, and rendered-browser smoke still require the connected CI runner or a suitable local environment.
- The new PostgreSQL safety guard is unit-tested, but no live database was available here (`psql` and Docker are not installed).
- This test fixture is synthetic. It does not certify production migrations, application query behavior, production capacity, or real customer k6/JMeter adapter compatibility.

## Local next action (PowerShell)

Configure a disposable local database that permits schema creation. Then set the explicit opt-in and run the full release gate:

```powershell
$env:WORKBENCH_POSTGRES_ALLOW_SCHEMA_MUTATION = "true"
# Only if using a non-loopback disposable test host:
# $env:WORKBENCH_POSTGRES_ALLOW_REMOTE = "true"
# Set WORKBENCH_POSTGRES_URL if the default local test database is not correct.
npm run verify:workbench-release
```

The default URL is `postgresql://workbench:workbench@127.0.0.1:5432/workbench`. Protected database names such as `prod`, `production`, and `live` are refused. The guardrails are not a substitute for choosing a disposable database. Inspect `artifacts/workbench-release-gate-summary.md` and `artifacts/ci-logs/` after the run.

## Version note

The application package version remains `1.10.86`. `0.44` is the Workbench milestone label.
