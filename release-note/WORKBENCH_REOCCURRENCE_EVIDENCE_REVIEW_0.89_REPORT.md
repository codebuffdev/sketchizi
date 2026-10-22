# Sketchizi Workbench 0.89 — Remediation Reoccurrence & Evidence Review

## Product changes

- Added bounded per-finding source-bundle observation metadata. The generated timestamp and decision-record ID distinguish a later release evidence export even when it reuses the same filename; re-importing the exact same export does not create a recurrence signal.
- When a later bundle reports a finding previously marked Resolved or Accepted Risk, the finding remains in its previous disposition and receives a visible `unreviewed` reoccurrence marker, the source bundle and timestamp, plus a per-finding audit event.
- Added an explicit **Reopen finding** action. The reviewer-controlled transition moves the finding to Open, stores when it was reviewed, preserves the previous disposition in the recurrence record, and appends both finding-level and decision-record audit events.
- Connected unreviewed reoccurrences to rollout readiness. A recurring error-severity finding is a hard blocker before it is reopened; after explicit reopening it continues to block under the normal open-error rule. Other recurring findings remain outstanding.
- Added UI summaries and a recurrence notice to tracked findings. Decision Markdown and JSON release evidence exports retain recurrence metadata; the release-bundle reviewer flags unreviewed recurring findings, and the bundle risk assessment calls out recurring blockers.
- Kept the source bundle list and observation history bounded; no external evidence is fetched or independently authenticated.

## Verification

- `npm run test:simulation`: 236 tests passed.
- Focused review tracking, release bundle builder/reviewer and rollout-readiness suites: 37 tests passed.
- `npm run test:workbench-format`: 22 tests passed.
- `npm run test:workbench-artifacts`: 11 tests passed.
- `npm run check:package-lock-consistency`: 19/19 checks passed.
- `npm run test:package-lock-consistency`: 6 tests passed.
- TypeScript JSX parser check for `SimulationExperimentPanel.jsx`: passed.
- `node --check` for the changed review tracking, readiness, decision record, release bundle and bundle reviewer modules: passed.
- ZIP integrity: verified after packaging.
- Production Vite build and real-browser behavior were not verified because the extracted workspace does not contain installed project dependencies or a Vite executable.

## Suggested Git commit

`feat(workbench): flag recurring release findings and allow explicit reopen`
