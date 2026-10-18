# Sketchizi Workbench 0.24 — Query / Index Hypothesis

## Goal

Add a database-specific, evidence-gated what-if experiment that estimates whether an explicitly selected proposed PostgreSQL btree index could change the selected stressed simulation scenario. This is intentionally distinct from the existing concurrency, mean-service-time, and write-contention interventions.

## Behavior added

- The relational-store profile supports two explicit synthetic assumptions:
  - `indexBenefitReadFraction`: fraction of read operations that are assumed to benefit from the proposed index (default `0`, range `0..1`).
  - `indexReadSpeedupFactor`: assumed service-time speedup for those reads (default `3`, range `1..20`).
- The adapter treats both parameters as optional for backward compatibility with previously saved profiles. If present, bounds and assumption confirmation are validated.
- The engine applies the speedup only to read operations selected by a deterministic per-request random stream. It does not consume the workload RNG, discount writes, infer a SQL plan, or model index maintenance cost.
- The Workbench requires read-operation evidence from the selected completed non-outage scenario, a typed `Reads from` path, a database/table containment relation, and an eligible unindexed table column.
- The user must choose the candidate column when multiple columns are eligible. Aggregate read counts cannot tell Sketchizi which column a real query filters or sorts by.
- The proposed SQL is shown as a reviewable hypothesis. Only an explicit **Add candidate index to schema model** action adds the index to the table's modeled `indexes` property. The action changes the model revision and makes prior results stale; the SQL preview must then be regenerated.
- SQL artifact generation emits supported modeled btree index DDL and rejects malformed index definitions or references to columns not present in the table schema.
- Trace hops and per-node results expose whether the synthetic assumption applied and how much sampled service time was assumed saved. Those values are model outputs, not observed PostgreSQL timings.
- The compact hypothesis UI has a separate disclosure section and responsive select/SQL preview styling.

## Important modeling limits

This does not parse SQL statements, select a real index, run PostgreSQL `EXPLAIN`, estimate index selectivity/cardinality, estimate disk usage, or include index write-maintenance overhead. The model does not tie a trace to a specific filter/sort column; column choice is explicit user input. A test improvement is not evidence that creating the same index on a production database will improve it.

## Tests

- Focused database-index improvement suite: **41 passed, 0 failed** (includes overlapping simulation-engine, history, and artifact tests).
- Simulation suite after adding index metrics to evidence rows: **98 passed, 0 failed**.
- Workbench artifacts: **11 passed, 0 failed**.
- POC template: **13 passed, 0 failed**.
- Workbench UI: **32 passed, 0 failed**.
- Workbench validation: **25 passed, 0 failed**.
- Workbench format/persistence: **22 passed, 0 failed**.
- Collaboration sync: **35 passed, 0 failed**.
- Browser-verification server: **6 passed, 0 failed**.
- Font asset tests: **7 passed, 0 failed**.

These command groups overlap and their counts must not be added as a unique test count. The combined total of executions across those listed groups is 290, with zero failures.

## Build/browser gate

`npm run build` remains **unverified/blocked before Vite** because `node_modules/@excalidraw/excalidraw/dist/prod/fonts` is absent in this workspace. Dependency installation was not completed here, and the new React UI has not been exercised in a real browser. These are not passing build/browser checks.

## Local verification

From the extracted `sketchizi-main` folder in PowerShell:

```powershell
npm ci
npm run build
npm run test:database-index-improvement
npm run test:simulation
npm run test:workbench-artifacts
npm run dev
```

For manual verification: open the React → REST → PostgreSQL POC, accept the proposed simulation assumptions, run the 5× traffic scenario, open **Query / index hypothesis**, explicitly select a candidate table column, and run the same-scenario trial. Verify the proposed index is not added to the schema until the user selects **Add candidate index to schema model**. After accepting it, regenerate SQL and confirm the new `CREATE INDEX` statement appears; confirm the prior result is historical/stale for the revised model.
