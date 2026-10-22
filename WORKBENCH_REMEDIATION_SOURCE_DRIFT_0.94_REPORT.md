# Workbench 0.94 — Remediation Source Drift Monitor

## Summary

Workbench now compares the saved load-test source snapshot recorded with each quantitative remediation verification run against the currently attached load-test record inventory. A source change is reported as drift; the original verification snapshot remains unchanged.

## Behavior

- At verification-run recording time, load-test measurement mappings snapshot the source record ID, schema version, descriptive metadata, workload inputs, field definition, field path, numeric source value, and any transformation.
- The evaluator reports unchanged, drift-detected, snapshot-incomplete, not-applicable, or not-evaluated states. It identifies missing source records, changed numeric values, changed field definitions/schema, changed metadata, and changed workload inputs.
- Legacy mappings without the complete snapshot are flagged as snapshot-incomplete rather than being treated as proven unchanged.
- Current source drift blocks reviewer confirmation and invalidates current remediation-effectiveness status. A new verification run against the current evidence and explicit reviewer confirmation are required.
- Rollout readiness incorporates current source-drift status. Drift and incomplete snapshots remain visible in the panel and explain why verification cannot currently support rollout.
- Decision Markdown exports and release-evidence JSON preserve the original snapshot and include drift findings; the release bundle reviewer recalculates consistency against the included load-test record inventory.
- Report-field and evidence-reference mappings continue to be treated as user-supplied links, not externally fetched or independently authenticated evidence. A consistent source snapshot is not proof of authenticity.

## Verification

- `npm run test:simulation`: 271 passed, 0 failed.
- `npm run test:remediation-effectiveness`: 72 passed, 0 failed.
- `npm run test:workbench-format`: 22 passed, 0 failed.
- `npm run test:workbench-artifacts`: 11 passed, 0 failed.
- `npm run check:package-lock-consistency`: 19/19 checks passed.
- `node --test tests/package-lock-consistency.test.mjs`: 6 passed, 0 failed.
- `node --check` for the changed JavaScript modules and test: passed.
- TypeScript parser check for the changed JSX panel: passed.
- ZIP archive integrity: checked at packaging time.
- Production build and real-browser validation: not run. The extracted workspace does not have the Vite executable or installed project dependencies.

## Limitations

Drift monitoring compares persisted source snapshots with load-test records available to Workbench; it does not fetch external sources or establish data authenticity. Metadata or workload changes are conservatively treated as changed evidence context even when a metric number remains the same. Older snapshots are retained for review but are not considered provably unchanged if their baselines are incomplete.

## Next increment

Workbench 0.95 — Source Drift Resolution Workflow. Add an explicit review action for each drift category, preserve the prior/current comparison, and guide the reviewer to record a new verification run instead of editing historical measurements in place.
