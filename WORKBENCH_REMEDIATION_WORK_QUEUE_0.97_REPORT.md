# Sketchizi Workbench 0.97 — Work Queue Ownership & Due Dates

## Summary

The remediation work queue supports task-level assignment, due dates, overdue indicators, and a per-task audit trail. These planning fields are persisted on each architecture decision record independently of the tracked finding's owner, disposition, evidence, and verification snapshots.

## Behavior

- Assign a person or team to an individual derived remediation queue task without replacing the finding's owner.
- Set, change, or clear a task due date using a validated `YYYY-MM-DD` calendar date.
- Show due-today and overdue indicators, count overdue and unassigned active queue work, and filter the queue to overdue tasks.
- Sort overdue tasks ahead of non-overdue tasks within the same blocker/high/normal priority class; higher-priority rollout blockers remain first.
- Record task creation and assignment/date changes as a task-level audit trail, bounded to 30 events per task.
- Persist task metadata within each decision record, with metadata bounded to 300 task entries per record. This is separate from canonical finding state and the record's point-in-time evidence snapshots.
- Preserve task-level planning fields and audit history in decision Markdown and JSON release evidence bundles.
- Include active queue tasks, assignees, due dates, due-state assessments, and history in release bundles; add risks for overdue and unassigned tasks.
- Re-evaluate overdue state as of the recorded bundle date. The read-only bundle reviewer checks queue counts, due-state consistency, saved metadata agreement, task audit presence, and whether overdue/unassigned tasks appear in the risk summary.
- Keep task records when their derived queue item is no longer active so the prior assignment/date history remains available in decision exports.

## Verification

- `npm run test:simulation`: 290 passed, 0 failed.
- Focused queue/metadata/decision/bundle tests: 40 passed, 0 failed.
- `npm run test:remediation-work-queue`: 15 passed, 0 failed.
- `npm run test:workbench-format`: 22 passed, 0 failed.
- `npm run test:workbench-ui`: 32 passed, 0 failed.
- `npm run test:workbench-artifacts`: 11 passed, 0 failed.
- `npm run check:package-lock-consistency`: 19/19 checks passed.
- `npm run test:package-lock-consistency`: 6 passed, 0 failed.
- JavaScript syntax checks: passed for changed JavaScript modules and the new test file.
- TypeScript JSX parser check: passed for `SimulationExperimentPanel.jsx`.
- ZIP integrity: checked at packaging time.
- Production Vite build and real-browser validation: not run because the extracted workspace lacks installed project dependencies and the Vite executable.

## Limitations

Task assignees and due dates are human-entered planning metadata. Overdue state is date-based and does not imply that an owner has been notified. The queue does not deliver notifications, enforce external assignments, prove task execution, alter finding disposition, authenticate evidence, or authorize deployment. Due dates are date-only fields; task audit trails are capped at 30 events and saved task entries at 300 per decision record.

## Next increment

Workbench 0.98 — Work Queue Accountability & Follow-up. Consider overdue/escalation summaries and exportable per-assignee workload views while retaining explicit reviewer-controlled finding disposition and evidence history.
