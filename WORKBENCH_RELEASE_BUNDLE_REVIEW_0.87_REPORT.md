# Sketchizi Workbench 0.87 — Release Bundle Review & Integrity

## Product changes

- Added a read-only viewer for previously exported Sketchizi release evidence bundle JSON files, accessible from the Simulation Experiments panel without needing to create or select a current decision record.
- Added schema checks for bundle type/version, required sections, decision identity, snapshot presence, and required review metadata.
- Added internal consistency checks for readiness counts/status/disposition, simulation status and metric snapshots, numeric simulation deltas, architecture-change summaries, load-test counts and truncation, validation gates, rollout evidence, and the final human-approval guardrail.
- Open readiness checks, validation gates, rollout checks, missing ownership/rationale, and load-test omissions are surfaced as review findings rather than silently accepted.
- Import is local and read-only. It does not modify the Sketchizi document or import the external bundle into the current decision-record collection. JSON files larger than 2 MB are rejected by the UI.
- Explicitly distinguishes structural/internal consistency from authenticity: no signature, origin, measurement source, external link, manual attestation, or production-safety claim is independently verified.

## Verification

- `npm run test:simulation`: 222 tests passed.
- `npm run test:workbench-format`: 22 tests passed.
- `npm run test:workbench-artifacts`: 11 tests passed.
- `npm run check:package-lock-consistency`: 19/19 checks passed.
- `npm run test:package-lock-consistency`: 6 tests passed.
- Focused release bundle builder/reviewer tests: 13 passed.
- TypeScript JSX parser check for `SimulationExperimentPanel.jsx`: passed.
- `node --check src/features/simulation/experiments/releaseEvidenceBundleReview.js`: passed.
- ZIP integrity: verified after packaging.
- Production Vite build and real-browser runtime were not run because project dependencies and the Vite executable are not installed in the extracted workspace.

## Suggested Git commit

`feat(workbench): review release evidence bundle consistency`
