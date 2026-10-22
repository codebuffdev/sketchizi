# Sketchizi Workbench 1.09 — Policy Approval Workflow & Release Gate Integration

## Summary

This release adds an append-only, human-attributed approval workflow for retained escalation-policy versions and a fail-closed release-gate evaluator. It builds on the 1.08 policy governance module without silently mutating policy history or clearing any unrelated rollout blocker.

## Implementation

- Added `src/features/simulation/experiments/escalationPolicyApproval.js`.
- Added `tests/escalation-policy-approval.test.js` and included it in `npm run test:simulation`.
- Workflow events support `submit`, `approve`, and `reject`, with actor, rationale, timestamp, policy version, and a canonical snapshot of policy settings.
- Approval requires a pending submission and a reviewer different from the recorded policy change owner.
- Rejected versions may be resubmitted; approved versions cannot be resubmitted and require a new policy version for changes.
- The release gate fails closed for missing/ambiguous policy versions, unsubmitted policies, pending approvals, rejected policies, and mismatched policy snapshots.
- Added a Markdown audit report with workflow event history and release eligibility.

## Verification

- `node --test tests/escalation-policy-approval.test.js`: **8 passed, 0 failed**.
- `npm run test:simulation`: **330 passed, 0 failed**.
- `node --check src/features/simulation/experiments/escalationPolicyApproval.js`: passed.
- `node --check src/features/simulation/experiments/escalationPolicyGovernance.js`: passed.
- `npm run check:package-lock-consistency`: **19/19 passed**.
- `npm run build`: **blocked** at `prebuild` because Excalidraw font assets were absent from `node_modules/@excalidraw/excalidraw/dist/prod/fonts`; the script instructs running `npm ci`.
- Real-browser verification: not performed.

## Scope and safety notes

This release adds reusable workflow logic and a release-gate evaluator; it does not claim that the workflow has been wired into a live production deployment or that approval records prove organizational authorization outside this application. The approval event is audit metadata, not cryptographic proof or independent verification. A blocked policy gate does not change, remove, or resolve other rollout blockers.

## Suggested Git commit

`feat(workbench): add escalation policy approval workflow and release gate`
