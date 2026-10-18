# Sketchizi Workbench 0.47 — PostgreSQL parser result compatibility

## Why this milestone exists

The Windows release-gate run completed clean installation, the production build, the application and Workbench regression suites, and Redocly OpenAPI validation. It then stopped at generated SQL syntax validation with:

`PostgreSQL parser returned no statements for generated SQL.`

The failure was in the validation adapter's expected return shape, not evidence of a SQL syntax error. The adapter treated `pgsql-parser.parse()` as if it always returned an array, while the parser's result object exposes parsed statements through `stmts`.

## What changed

- The SQL validator accepts the parser's `{ stmts: [...] }` result shape and the direct-array shape used by injected test adapters.
- Empty or unrecognized parser results still fail closed.
- Added regression coverage for parser result objects and empty `stmts` arrays.
- No generated SQL, database safety opt-in, or SQL fixture matching policy was relaxed.

## Verification performed for 0.47

- `node --test tests/workbench-artifact-external-validation.test.mjs`: 6/6 passed.
- The previous 0.46 Windows run had already passed `npm ci`, the production build, application regressions, Workbench regressions, and Redocly OpenAPI validation.
- The full release gate has **not** yet been rerun with this fix.

## Next verification

From a fresh extraction on Windows:

```powershell
npm run verify:workbench-release
```

Confirm that PostgreSQL SQL syntax validation passes, then address any next failing stage. The run still needs to demonstrate live disposable PostgreSQL execution and the rendered Chromium persistence smoke before the overall release can be marked passed.

## Scope

The SQL parser gate validates a generated representative fixture. It is not a general-purpose SQL runner and does not validate arbitrary user-created architecture models or production migrations.
