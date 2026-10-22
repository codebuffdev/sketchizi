# Sketchizi Workbench 0.88 — Review Findings & Remediation Tracking

## Product changes

- Added a review-finding tracking model attached to saved architecture decision records. Imported findings keep a stable ID based on their code, title, and detail, along with source bundle names, original severity/detail, current disposition, owner, rationale, supporting evidence, timestamps, and a bounded per-finding audit history.
- Added a `Track findings in <decision record>` action in Release Bundle Review. Re-importing a known finding preserves its existing disposition and records that it was observed in another bundle rather than creating a duplicate.
- Added reviewer-managed dispositions: Open, Accepted Risk, and Resolved. Accepted Risk and Resolved require an owner, rationale, and supporting evidence/reference. Direct decision-record updates enforce the same required fields.
- Persisted tracked findings with the Workbench document's decision record. The record-level audit trail records tracked findings, changes, status transitions, and observations in additional bundles; each finding also keeps its own bounded history.
- Added a remediation UI with owner/disposition/rationale/evidence fields, source bundle references, timestamps, and per-finding audit history.
- Connected findings to rollout readiness: open error-severity findings are hard blockers, open warning/info findings remain outstanding, and undocumented accepted/resolved dispositions are blocked. A finding disposition does not independently authenticate evidence or approve production rollout.
- Included the tracked finding states and audit history in the decision Markdown export and release evidence JSON export. The release bundle reviewer flags findings that remain open and reports tracked/open/blocking/accepted-risk/resolved counts on re-import.
- Bounded tracking to 100 findings per decision record and retained a bounded source list and per-finding audit history.

## Verification

- `npm run test:simulation`: 233 tests passed.
- `npm run test:workbench-format`: 22 tests passed.
- `npm run test:workbench-artifacts`: 11 tests passed.
- `npm run check:package-lock-consistency`: 19/19 checks passed.
- `npm run test:package-lock-consistency`: 6 tests passed.
- `npm run test:review-finding-tracking`: 24 tests passed (finding tracking plus release-bundle build and review).
- Decision record and rollout readiness suites passed in the focused combined run.
- TypeScript parser check for `SimulationExperimentPanel.jsx`: passed.
- `node --check` for review tracking, decision record, rollout readiness, release bundle, and bundle reviewer helpers: passed.
- ZIP integrity: verified after packaging.
- Production Vite build and browser runtime were not run because dependencies and the Vite executable are not installed in the extracted workspace.

## Suggested Git commit

`feat(workbench): track release review findings and remediation`
