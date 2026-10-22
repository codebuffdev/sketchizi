# Sketchizi Workbench 1.06 — Escalation Review Scheduling & Decision Tracking

## Release summary

This release extends the existing escalation policy and handoff decision ledger with scheduled review tracking. The additions are deliberately metadata-oriented: they record human decisions and produce a review queue, but do not send notifications, close remediation actions, modify canonical finding disposition, or clear rollout blockers.

## Implemented

- Added `buildRemediationHandoffEscalationReviewQueue` to classify deferred decisions as overdue, due, upcoming, scheduled, or superseded based on their next-review date.
- Added current-policy comparison in the queue so reviewers can spot deferred decisions made under an older policy identifier.
- Added `recordRemediationHandoffEscalationReview` to record review outcomes and preserve a bounded review history on the source decision.
- Escalate, defer, and dismiss review outcomes create a linked replacement decision with `supersedesDecisionId`; the previous decision and its review history remain in the ledger.
- Re-review of a superseded decision is rejected, and escalation policy duplicate detection ignores superseded decisions.
- Markdown exports now include review events, policy-change flags, next-review dates, and decision supersession links.
- Added regression tests for queue date classification, policy changes, linked outcomes, review history, supersession, and exports.

## Verification

- `npm run test:simulation`: **316 passed, 0 failed**.
- `node --check src/features/simulation/experiments/remediationHandoff.js`: passed.
- `npm run check:package-lock-consistency`: **19/19 checks passed**.
- ZIP integrity: checked after packaging.
- `npm run build`: **not completed**. The prebuild step reports that Excalidraw font assets are missing from `node_modules/@excalidraw/excalidraw/dist/prod/fonts`; install dependencies with `npm ci` before attempting the production build.
- Real-browser testing was not performed.

## Safety and scope notes

- A review queue entry is not a notification or proof that a reviewer was contacted.
- Review outcomes are manual records, not independent verification.
- A supersession link does not close the underlying remediation action or change canonical findings.
- Policy comparison uses policy IDs; it does not independently load or validate policy definitions.

## Suggested Git commit

`feat(workbench): add escalation review scheduling and decision history`

## Suggested next release

**1.07 — Escalation SLA Metrics & Policy Simulation**: compute review-latency and overdue-rate metrics from recorded timestamps, provide a read-only what-if preview for threshold changes, and export an audit summary that distinguishes measured history from projected outcomes.
