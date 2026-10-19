# Sketchizi Workbench 0.43 — PostgreSQL DDL Execution Gate

## Purpose

This milestone adds a live PostgreSQL execution check for the SQL artifact emitted by the Workbench. It complements parser-based syntax validation by executing the generated DDL against a disposable PostgreSQL 17 database, reapplying it to check idempotency, and verifying the resulting objects through PostgreSQL system catalogs.

This is not a production database migration test and does not validate application queries or production data.

## Changes

- Added `scripts/validate-workbench-generated-sql-postgres.mjs`.
- The validation script resolves `WORKBENCH_POSTGRES_URL` into libpq environment variables rather than placing the database password in command-line arguments.
- Applies `artifacts/generated/schema.sql` twice using `psql` with `ON_ERROR_STOP` enabled.
- Checks that the expected schema and table exist, there is one primary key and one unique constraint, the named index exists, and the generated column types/nullability match the fixture model.
- Added a disposable `postgres:17-alpine` service to `.github/workflows/workbench-release-gate.yml`; CI installs the PostgreSQL client and runs the integration check against that service.
- Added a separate release-runner stage and log at `artifacts/ci-logs/postgresql-execution-validation.log`.
- Updated release summary schema to version 5 with specific failure guidance.
- Added PostgreSQL URL parsing, apply-twice behavior, catalog-check order, failure, missing-CLI, and empty-SQL tests.
- Updated `README.md` and `WORKBENCH_NEXT_STEP.txt` with the local database requirement and a warning to use a disposable database only.

## Verification performed

- Configured offline regression commands: **32/32 passed**. Detailed output is in `WORKBENCH_0.43_OFFLINE_REGRESSIONS.log`.
- PostgreSQL integration orchestration tests: **6/6 passed**.
- CI summary tests: **9/9 passed**.
- CI workflow-contract tests: **10/10 passed**.
- Local release-runner tests: **8/8 passed**.
- Existing generated-artifact tests: **5/5 passed**.
- Package manifest/lockfile consistency: **19/19 checks passed**.
- The generated OpenAPI and SQL fixtures were refreshed from the Workbench artifact generators.
- The new PostgreSQL integration tests also passed with the ignored `artifacts/` directory temporarily absent, emulating a fresh ZIP extraction.
- JavaScript syntax checks and YAML parsing passed.

These test counts overlap; do not add them as if they represented unique tests.

## What is not verified

- This environment has neither `psql` nor Docker available, so the SQL was **not applied to a real PostgreSQL server locally**. The new GitHub Actions PostgreSQL 17 stage is configured but has not yet run in the user's repository.
- The prior actual release run failed at `npm ci` due to npm registry DNS error `EAI_AGAIN`. This iteration does not establish that network access is restored.
- A clean install, Excalidraw font check against installed dependencies, production build, Redocly lint, `pgsql-parser` execution, and rendered Chromium smoke remain open until run in a connected environment.
- The fixtures are synthetic. Passing their validation does not certify production capacity, live API behavior, real migrations, or compatibility with real customer k6/JMeter exports.

## Local next action

On a machine with npm registry access, `psql` available on `PATH`, and a disposable PostgreSQL database that allows schema creation, configure `WORKBENCH_POSTGRES_URL` and run:

```powershell
npm run verify:workbench-release
```

The default connection is `postgresql://workbench:workbench@127.0.0.1:5432/workbench`; override it for the local test database. **Never point this check at production.** Inspect `artifacts/workbench-release-gate-summary.md` and `artifacts/ci-logs/` after the command stops.

## Version note

Application package version remains `1.10.86`. `0.43` is a Workbench milestone label.
