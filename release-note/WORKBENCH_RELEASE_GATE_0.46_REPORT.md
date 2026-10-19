# Sketchizi Workbench 0.46 — Validated SQL stdin execution

## What changed

The PostgreSQL release-fixture validator no longer asks `psql` to reopen the validated SQL path. After verifying that the file exactly matches the current generated fixture and contains no psql client meta-commands, it sends that validated SQL text to `psql` through standard input (`--file -`).

This removes the validation-to-execution file-reopen window: replacing or modifying the original path after validation cannot change the SQL supplied to either DDL execution. The second idempotency pass receives the same validated text. Catalog assertions remain a separate `--command` invocation.

Existing safety controls remain unchanged:
- Exact generated-fixture match required.
- psql client meta-commands and arbitrary/modified SQL rejected.
- `WORKBENCH_POSTGRES_ALLOW_SCHEMA_MUTATION=true` required.
- `WORKBENCH_POSTGRES_ALLOW_REMOTE=true` additionally required for non-loopback targets.
- Protected database names remain rejected.

## Verification performed

- PostgreSQL integration unit tests: 12/12 passed.
- The integration test now asserts both DDL passes receive the exact validated fixture on stdin, use `--file -`, and do not pass the original SQL path to `psql`.
- JavaScript syntax checks passed for the changed validator and test file.

These tests inject a fake `psql` runner. They do not prove live PostgreSQL execution.

## Release gates still open

A complete release run has not been completed. Clean dependency installation, production build, external OpenAPI/SQL validation, live PostgreSQL 17 execution, and rendered Chromium smoke remain release blockers. The previously reported npm registry DNS issue (`EAI_AGAIN`) may still block installation; verify with a fresh run rather than assuming its current status.

Run on a network-enabled Windows machine:

```powershell
npm run verify:workbench-release
```

Review `artifacts/workbench-release-gate-summary.md` and the first failing log in `artifacts/ci-logs/`. Use schema-mutation opt-ins only for a disposable test database.

## Scope

This remains a representative synthetic fixture test, not a general-purpose SQL runner or certification of arbitrary architecture models.
