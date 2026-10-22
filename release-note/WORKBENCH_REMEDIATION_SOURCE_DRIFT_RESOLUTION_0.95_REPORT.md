# Workbench 0.95 — Source Drift Resolution Workflow

## Summary

Workbench now supports reviewer dispositions for source drift detected between a saved remediation verification snapshot and the currently attached load-test source. The workflow preserves the original and current comparison, records the reviewer rationale, and guides material changes to a new verification run rather than editing historical measurements.

## Behavior

- Source-drift items expose the original and current source snapshots side by side, including record/schema information, field path and value, metadata, workload inputs, and field definition.
- Each drift disposition records the reviewer, rationale, time, exact source fingerprint, original/current snapshots, and change details in the saved decision record and audit trail.
- Only a display-name-only metadata change can be accepted as non-material context. Missing sources, incomplete historical snapshots, numeric value changes, field-definition/schema changes, target-environment/source/test-time metadata changes, and workload changes require re-verification.
- Recording a requires-reverification disposition supersedes a currently verified run as historical, preserving its values and source snapshots rather than modifying them.
- A review is bound to the exact drift fingerprint. If the source changes again, the prior review remains history but no longer resolves the current drift.
- A prior verification can remain current after an explicitly reviewed display-name-only change. Material changes require a new verification run with current mappings plus explicit reviewer confirmation.
- The Workbench panel shows the original/current comparison and prior review history. Decision Markdown and release-evidence JSON export the review decision, source snapshots, rationale, and audit context.
- Release-bundle review checks that a recorded source-drift disposition still matches the included evidence. Stale fingerprints and invalid non-material dispositions are flagged; bundle risk assessment only treats eligible display-name-only changes as reviewed context.
- Source review is not independent source authentication. The workflow verifies consistency and records reviewer judgment; it does not execute tests or fetch/authenticate external reports.

## Verification

- `npm run test:simulation`: 275 passed, 0 failed.
- `npm run test:remediation-effectiveness`: 76 passed, 0 failed.
- `npm run test:workbench-format`: 22 passed, 0 failed.
- `npm run test:workbench-artifacts`: 11 passed, 0 failed.
- `npm run check:package-lock-consistency`: 19/19 checks passed.
- `npm run test:package-lock-consistency`: 6 passed, 0 failed.
- `node --check` for changed JavaScript modules: passed.
- TypeScript parser check for `SimulationExperimentPanel.jsx`: passed.
- ZIP archive integrity: checked at packaging time.
- Production build and real-browser validation: not run. The extracted workspace does not have installed project dependencies or the Vite executable.

## Limitations

A display-name-only change is the only drift category that can be accepted as non-material context because the record ID, numeric field, definition, and workload assumptions remain stable. Any changed source fingerprint requires a new review. The process depends on the source data included in or available to Workbench and does not establish authenticity or production safety.

## Next increment

Workbench 0.96 — Source Drift Remediation Work Queue. Aggregate pending drift reviews and re-verification needs across tracked findings, prioritize blockers, and navigate reviewers directly to the relevant comparison without flattening per-finding history.
