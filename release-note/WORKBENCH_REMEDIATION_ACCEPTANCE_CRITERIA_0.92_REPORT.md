# Sketchizi Workbench 0.92 — Quantitative Remediation Acceptance Criteria

## Implemented

- Added optional quantitative acceptance targets per tracked release finding for p95 latency (maximum, ms), throughput (minimum, req/s), error rate (maximum, percent), and success rate (minimum, percent).
- Added typed before/after measurements to each remediation verification run. Numeric targets and measurements are normalized, bounded to supported metrics, and retained as point-in-time snapshots.
- Each configured target is evaluated against the after-remediation value. Results distinguish Pass, Fail and Unevaluated; missing measurements do not count as passing. Baseline values and before/after deltas are included for review context.
- A run declared Pass by the recorder cannot be reviewer-confirmed if any current quantitative target fails, is unevaluated, or the run predates the current target set.
- Changing or clearing acceptance targets invalidates current verification where applicable and requires a new run and reviewer confirmation before an old result can be considered current.
- Added quantitative target editors, numeric before/after measurement inputs, per-target status display, and metric history to the Workbench simulation panel.
- Preserved targets and values in decision-record persistence, Markdown export, and JSON release evidence bundles. Rollout readiness continues to block unresolved error findings and adds the quantitative evaluation reason when a resolved finding lacks current verification.
- Release bundle review recomputes numeric acceptance results from the target snapshot and measurements, warns on malformed targets/measurements, and flags bundles where the stored evaluation disagrees with the recomputed result.
- Added `npm run test:remediation-acceptance-criteria` and included the new test file in the simulation and remediation-effectiveness suites.

## Verification results

- `npm run test:simulation`: **259 passed**.
- `npm run test:remediation-effectiveness`: **60 passed**.
- `npm run test:workbench-format`: **22 passed**.
- `npm run test:workbench-artifacts`: **11 passed**.
- `npm run check:package-lock-consistency`: **19/19 checks passed**.
- `npm run test:package-lock-consistency`: **6 passed**.
- Changed JavaScript modules and JSX panel passed the installed TypeScript parser syntax check.
- ZIP integrity verified after packaging.

## Not verified

- Production Vite build and real-browser rendering were not run because the extracted workspace does not contain project dependencies or a Vite executable. Parser checks confirm syntax only, not integration/runtime behavior.
- Numeric measurements remain user-supplied values. Workbench evaluates those values against configured targets but does not execute referenced tests, authenticate evidence, or independently verify the source of the measurements.

## Suggested Git commit

`feat(workbench): evaluate remediation against quantitative acceptance criteria`

## Next increment

**Workbench 0.93 — Evidence-to-Metric Mapping.** Allow reviewers to associate each numeric value with a load-test record, report field, or source reference and identify criteria whose measurements have no traceable source. Keep source linkage separate from authenticity verification.
