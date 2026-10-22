# Workbench 0.93 — Evidence-to-Metric Mapping

## Summary

Workbench now links each numeric before/after remediation measurement to a declared origin. Supported source types are saved load-test record fields, report fields, and cited evidence fields. The evaluator checks source-value agreement and reports whether each mapping is linked, unlinked, incomplete, inconsistent, orphaned, or unavailable in the release bundle.

## Behavior

- Load-test mappings retain the source record ID and descriptive metadata, metric field path, source numeric value, and any explicit transformation. The derived success-rate mapping is shown as `100 - error rate`; it is not represented as a directly observed source field.
- Report-field and evidence-reference mappings record a source path/reference and the claimed numeric source value. Those details are user-supplied and are not independently authenticated.
- A numeric remediation run with incomplete or inconsistent source mappings cannot be reviewer-confirmed.
- Existing numeric verification runs with no source mappings stay visible as historical records, but no longer count as traceable current verification. A new, fully mapped run is required for confirmation.
- Mapping details and compact evaluation summaries are preserved in the decision record, Markdown export and JSON release evidence bundle.
- Bundle review recalculates source-value consistency against the included load-test record inventory and flags source records that are missing, fields or values that changed, incomplete mapping metadata, and inconsistent saved evaluation summaries.
- The release risk summary includes untraceable remediation measurements.

## Verification

- `npm run test:simulation`: 267 passed, 0 failed.
- `npm run test:remediation-effectiveness`: 68 passed, 0 failed.
- `npm run test:workbench-format`: 22 passed, 0 failed.
- `npm run test:workbench-artifacts`: 11 passed, 0 failed.
- `npm run check:package-lock-consistency`: 19/19 checks passed.
- `npm run test:package-lock-consistency`: 6 passed, 0 failed.
- TypeScript parser check for the modified JSX panel: passed.
- `node --check` for modified JavaScript modules and relevant tests: passed.
- ZIP integrity: checked at packaging time.
- Production build and real-browser validation: not run. The extracted workspace did not have the Vite executable or installed project dependencies.

## Limitations

Traceability proves only that a recorded number agrees with a declared source value that is available to the evaluator. External reports and references are not fetched or authenticated. A source link is not proof of authenticity, and these mappings do not independently validate the underlying measurement. Old numeric runs without mappings must be recorded again to qualify as traceable verification.

## Next increment

Workbench 0.94 — Remediation Source Drift Monitor. Compare remembered load-test source snapshots with currently attached records when opening a saved decision or preparing a new release bundle. Distinguish a missing record, changed value, changed field definition and consistent snapshot; preserve the original verification snapshot instead of overwriting it.
