# Sketchizi Workbench 0.96 — Remediation Source Drift Work Queue

## Summary

Workbench now presents a single prioritized remediation work queue across the decision records saved in the current document. The queue is derived from each record's tracked findings and current load-test source inventory; it does not merge or alter individual records or their audit histories.

## Behavior

- Aggregate pending work across up to 50 saved architecture decision records and their tracked findings.
- Prioritize rollout blockers, then high-priority follow-up, then normal review work. Error-severity blockers remain clearly labelled.
- Queue pending source-drift review by the exact run, metric, side, and drift fingerprint. The queue button selects the owning decision record and scrolls directly to the original/current source comparison row.
- After a reviewer marks material source drift as requiring re-verification, the item transitions to a fresh-verification task while preserving the old run and source snapshot as historical.
- Queue recurring findings for explicit review before requiring a new verification run; preserve the current closed disposition until the reviewer takes the existing explicit reopen action.
- Queue newly reopened findings needing distinct fresh evidence, open findings needing disposition, resolved findings whose passing run awaits reviewer confirmation, and resolved findings still requiring a valid verification run.
- Add filters for all follow-up work, rollout blockers, source-drift reviews, re-verification, and recurring findings.
- Each task shows its decision record, finding, severity, status, owner, reason, and a direct navigation action. Queue derivation is read-only.
- The queue displays the top 300 prioritized tasks and reports when the view is truncated. Counts refer to the full derived task set.
- Keep a distinct task per source-drift fingerprint; accepted display-name-only context changes do not remain queued unless another action is still required.

## Verification

- `npm run test:simulation`: 283 passed, 0 failed.
- `npm run test:remediation-effectiveness`: 84 passed, 0 failed.
- `npm run test:workbench-ui`: 32 passed, 0 failed.
- `npm run test:workbench-format`: 22 passed, 0 failed.
- `npm run test:workbench-artifacts`: 11 passed, 0 failed.
- `npm run check:package-lock-consistency`: 19/19 checks passed.
- `npm run test:package-lock-consistency`: 6 passed, 0 failed.
- `node --check` for the new queue helper and queue tests: passed.
- TypeScript parser check for `SimulationExperimentPanel.jsx`: passed.
- ZIP integrity: checked at packaging time.
- Production Vite build and real-browser validation: not run because the extracted workspace does not have project dependencies installed and the Vite executable is absent.

## Limitations

Queue status is derived from saved decision records and the current load-test inventory. It does not independently authenticate external evidence, execute verification runs, change reviewer dispositions, or authorize deployment. Items retain their individual source records and audit histories. Large queues display the 300 highest-priority items and note truncation.

## Next increment

Workbench 0.97 — Work Queue Ownership & Due Dates. Add reviewer-managed task assignment, target dates, overdue indicators, and per-task audit history without replacing the finding-level owner or modifying the underlying finding disposition.
