# Sketchizi Workbench 0.98 — Work Queue Accountability & Follow-up

## Summary

The cross-record remediation queue now includes derived per-assignee workload summaries, a seven-day deadline view, and an explicit escalation summary for overdue rollout blockers. These are projections of saved decision-record findings and task-level assignment/due-date metadata; they do not change canonical finding disposition or historical evidence.

## Behavior

- Group active follow-up tasks by assignee, including an Unassigned group. Summaries report total tasks, blockers, overdue tasks, overdue blockers, upcoming deadlines, and affected decision-record count.
- Calculate workload summaries across all derived queue tasks, not only the first 300 prioritized tasks displayed in the main list. At most 100 assignee rows are shown/exported; counts still cover all derived tasks and indicate when the assignee list is truncated.
- Add an Upcoming deadlines view spanning the evaluation date through seven days later (including tasks due today). It includes a bounded preview of the ten soonest tasks, and those tasks remain directly navigable even when outside the main 300-task prioritized list.
- Add a dedicated escalation summary for overdue rollout blockers: total blockers, unassigned overdue blockers, affected decision-record count, oldest due date and days overdue, assignee breakdown, and up to five oldest overdue task previews.
- Provide a one-action filter for overdue blockers and upcoming deadlines while preserving the existing blocking, source-drift, re-verification, recurrence, and general overdue filters.
- Preserve task assignment, due-date history, finding disposition, and original evidence snapshots independently. The queue does not send notifications or imply an assignee has been contacted.
- Include accountability summaries and preview details in JSON release bundles. The bundle reviewer recalculates workload/deadline/escalation summaries against displayed tasks when the queue is not truncated, validates bounded previews and dates, and checks that overdue blocker escalation is represented in the risk summary.
- Extend decision-record Markdown export with an evaluated workload table, upcoming deadline snapshot, and overdue-blocker escalation summary for the selected decision record. The in-app queue aggregates across all saved decision records; the single-record Markdown/release bundle scope is explicitly distinguished.
- The general queue remains capped at 300 prioritized tasks. Upcoming previews show at most 10 deadlines, escalation previews at most five blockers, and assignee summaries at most 100 groups. Truncation is visible rather than silently implying completeness.

## Verification

- `npm run test:simulation`: 295 passed, 0 failed.
- `npm run test:remediation-work-queue`: 20 passed, 0 failed.
- `npm run test:workbench-format`: 22 passed, 0 failed.
- `npm run test:workbench-artifacts`: 11 passed, 0 failed.
- `npm run test:workbench-ui`: 32 passed, 0 failed.
- `npm run check:package-lock-consistency`: 19/19 checks passed.
- `npm run test:package-lock-consistency`: 6 passed, 0 failed.
- `node --check` passed for changed JavaScript modules and queue tests.
- TypeScript JSX parser check passed for `SimulationExperimentPanel.jsx`.
- ZIP integrity: checked at packaging time.
- Production Vite build and real-browser validation: not run because the extracted workspace does not contain the Vite executable or installed project dependencies.

## Limitations

Assignees and due dates are manual planning data. Workload groups describe derived tasks, not unique findings or estimates of person-hours. The due window is date-based and does not send reminders. The seven-day view is a bounded preview; task lists, assignee summaries and escalation previews disclose their caps. Summaries are derived consistency assessments, not proof that a task was completed, that an assignee was notified, that evidence is authentic, or that rollout is approved.

## Suggested Git commit

`feat(workbench): add remediation workload and overdue blocker escalation summaries`

## Next increment

Workbench 0.99 — Escalation Acknowledgement & Task Resolution Tracking. Add reviewer-controlled acknowledgements and per-task follow-up notes for escalated work without turning derived tasks into canonical finding status or rewriting source evidence history.
