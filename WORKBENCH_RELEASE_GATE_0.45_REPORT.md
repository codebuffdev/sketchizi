# Sketchizi Workbench 0.45 — SQL Fixture Execution Guard

## What changed

The PostgreSQL integration stage now accepts only SQL whose bytes exactly match the current SQL fixture produced by `createArtifactFixtures()` and the Workbench's actual SQL artifact generator. This stage is intentionally a repeatable validation of the known release fixture, not a general-purpose SQL runner.

This closes a command-execution escape route in the prior flow: `psql --file` accepts client-side meta-commands in addition to SQL. A supplied SQL file could otherwise contain commands such as `\connect` to switch the database after the connection URL had passed the target safety checks, or `\!` to invoke a local shell command. The validator now rejects modified or arbitrary files before calling `psql`, and it gives a specific diagnostic when a psql meta-command is detected.

The previous schema-mutation opt-ins remain required:

- `WORKBENCH_POSTGRES_ALLOW_SCHEMA_MUTATION=true`
- For non-loopback hosts, `WORKBENCH_POSTGRES_ALLOW_REMOTE=true`
- Protected database names remain rejected

The SQL-fixture restriction is specific to this CI/release test stage. To validate a changed schema model, update the fixture model/generator expectation and tests; do not point the guarded stage at arbitrary SQL.

## Verification performed

- All 33 configured offline regression commands passed.
- PostgreSQL integration test file: 12/12 passed, including two new rejection cases (psql meta-command and altered/arbitrary SQL) with an assertion that `psql` is never invoked.
- Package/lockfile consistency: 19/19 checks passed.
- JavaScript syntax checks passed for the changed validator and test file.
- Archive integrity and fresh-extraction targeted tests passed.

The unit tests use an injected `psql` runner; they do not execute DDL against a live PostgreSQL server.

## Release gates still open

The following have not been verified end-to-end in this environment:

- Clean dependency installation (`npm ci`); earlier attempts encountered npm registry DNS failures (`EAI_AGAIN`).
- Production Vite build and real Excalidraw font assets after a complete installation.
- Redocly OpenAPI lint and PostgreSQL parser package execution.
- Applying DDL to the PostgreSQL 17 CI service and checking catalog state.
- Rendered Chromium browser smoke test.
- Validation with representative real k6 and JMeter exports.

Do not describe the overall release gate as passed until the local runner or GitHub Actions completes those stages successfully.

## Next action

On a network-enabled machine, extract the ZIP and run:

```powershell
npm run verify:workbench-release
```

Review `artifacts/workbench-release-gate-summary.md` and the first failing log in `artifacts/ci-logs/`. Configure the PostgreSQL mutation opt-in only for a disposable test database.
