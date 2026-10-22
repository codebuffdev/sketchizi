# Sketchizi Workbench 1.00 — Escalation Review & Handoff

## Summary

The remediation workflow now has a document-wide escalation review and handoff view. It brings acknowledged rollout blockers, active follow-ups, overdue tasks, and resolved queue tasks whose underlying findings remain open into one focused summary. Reviewers can save handoff notes to a selected architecture decision record and export the current review plus recorded notes as Markdown.

## Behavior

- Derive four cross-record work categories from the existing remediation queue: acknowledged rollout blockers, unresolved follow-ups that are not currently overdue, overdue active tasks, and resolved queue tasks whose canonical finding status remains open. Categories may overlap by design, so their counts must not be added to infer a unique task count.
- Show counts and a bounded list of tasks for each category, with direct navigation to the owning decision record and queue task. Display truncation where the category count exceeds the included preview.
- Save a handoff note with a required author and note, optional handoff recipient, timestamp, and a point-in-time snapshot of the summary counts plus bounded task references. The note is stored on the selected decision record, without rewriting the decision report, canonical finding disposition, verification runs, or original evidence snapshots.
- Limit a decision record to the 30 most recent normalized handoff notes. The document-wide Markdown export includes up to the 100 most recent notes from up to 50 decision records and states the relevant truncation limits.
- Export the current queue summary, four category lists, saved handoff notes, point-in-time snapshots, and interpretation limits as `sketchizi-escalation-handoff-<date>.md`.
- Include handoff notes and a derived handoff summary in the release evidence JSON bundle. The release-bundle reviewer checks note shape, required fields, duplicate IDs, unsupported independent-verification claims, snapshot structure, summary counts, bounded category references, and consistency with the included queue/risk summary.
- Keep handoff notes classified as manual coordination context, not evidence verification or proof of notification delivery. Resolving a queue task does not alter the underlying finding disposition; an open error finding remains a rollout blocker.

## Verification

- `npm run test:simulation`: 305 passed, 0 failed.
- `node --test tests/remediation-handoff.test.js`: 5 passed, 0 failed.
- `npm run test:workbench-format`: 22 passed, 0 failed.
- `npm run test:workbench-artifacts`: 11 passed, 0 failed.
- `npm run test:workbench-ui`: 32 passed, 0 failed.
- `npm run check:package-lock-consistency`: 19/19 checks passed.
- `npm run test:package-lock-consistency`: 6 passed, 0 failed.
- `node --check` passed for changed JavaScript modules and the new handoff test.
- TypeScript JSX parser check passed for `src/features/simulation/experiments/SimulationExperimentPanel.jsx`.
- ZIP integrity: checked at packaging time.
- Production Vite build and real-browser validation: not run because the extracted workspace does not contain the installed Vite executable or project dependencies.

## Limitations

The handoff summary is derived from current saved decision records and queue metadata. Acknowledgement does not prove a recipient was contacted; note author and target are manual inputs; neither is independently authenticated. Saved handoff snapshots are point-in-time summaries and may differ from the live queue later. The bundle reviewer checks internal structure and consistency, not source authenticity. Handoff notes do not approve a deployment or change canonical findings.

## Suggested Git commit

`feat(workbench): add escalation review and handoff export`

## Next increment

Workbench 1.01 — Handoff Receipt & Follow-up Reconciliation. Add reviewer-recorded receipt/acknowledgement for a saved handoff note and compare its point-in-time task snapshot with the current queue. Changed task state should surface as carry-forward work, while a receipt remains a manual attestation rather than proof of external delivery or acceptance.
