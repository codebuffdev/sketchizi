# Sketchizi Workbench 0.99 — Escalation Acknowledgement & Task Resolution Tracking

## Summary

The remediation work queue now supports reviewer-controlled acknowledgement of overdue rollout-blocker escalations, task-level follow-up notes, and a task-specific resolution lifecycle. These workflow states are stored with decision-record task metadata and remain distinct from the canonical finding disposition, remediation verification status, and historical evidence snapshots.

## Behavior

- Acknowledge an overdue blocker with an actor and explanatory note. The acknowledgement is tied to the task's escalation fingerprint and due-date snapshot; a changed due date or lifecycle makes the acknowledgement stale rather than silently reusing it.
- Add task-level follow-up notes with author and timestamp. Follow-up notes and their audit events persist independently of the underlying finding's reviewer notes and evidence.
- Resolve or reopen a queue task with an actor, rationale, and optional evidence reference. Task resolution does not mark the canonical finding Resolved, change its disposition, or modify its source evidence.
- A current escalation acknowledgement is required by the panel workflow before resolving an overdue task that blocks rollout. Reopening a task preserves prior resolution context and writes an audit event.
- Keep resolved task history visible in a bounded resolved-task view. A resolution whose lifecycle fingerprint no longer matches is treated as stale and returns to active follow-up.
- Include acknowledgement, task resolution, follow-up notes, and audit history in decision-record Markdown and release-evidence JSON exports. The release-bundle reviewer checks the optional resolved-task collection, summary counts, metadata consistency, acknowledgement fingerprint/due-date consistency, resolution fingerprint and history, and risk representation for resolved queue tasks whose canonical error finding is still open.
- Workload and escalation summaries explicitly distinguish acknowledged and unacknowledged overdue blockers. Task-level status does not independently clear a rollout blocker while the underlying canonical error finding remains open.

## Verification

- `npm run test:simulation`: 300 passed, 0 failed.
- Focused queue and release-bundle integration group: 40 passed, 0 failed.
- `npm run test:workbench-format`: 22 passed, 0 failed.
- `npm run test:workbench-artifacts`: 11 passed, 0 failed.
- `npm run test:workbench-ui`: 32 passed, 0 failed.
- `npm run check:package-lock-consistency`: 19/19 checks passed.
- `npm run test:package-lock-consistency`: 6 passed, 0 failed.
- `node --check` passed for changed JavaScript modules.
- TypeScript JSX parser check passed for `SimulationExperimentPanel.jsx`.
- ZIP integrity: checked at packaging time.
- Production Vite build and real-browser validation: not run because the extracted workspace does not contain the installed Vite executable or project dependencies.

## Limitations

Task acknowledgement, follow-up notes, resolution and supplied references are manual workflow metadata. The application does not notify an assignee or independently verify an external reference. Resolving a queue task is not proof that the underlying finding is fixed and does not change its canonical disposition or the rollout-readiness result. History and task lists are bounded by the existing document limits.

## Suggested Git commit

`feat(workbench): track escalation acknowledgements and task resolution`

## Next increment

Workbench 1.00 — Escalation Review & Handoff. Add a focused review summary for acknowledged blockers, unresolved follow-ups, and resolved queue tasks that still correspond to open findings, with exportable reviewer handoff notes that preserve the underlying decision and evidence history.
