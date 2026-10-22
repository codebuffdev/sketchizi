# Sketchizi Workbench 1.08 — Escalation Policy Governance & Audit Reporting

## Summary

This release adds a small, independently testable governance layer for escalation policy definitions. It complements the existing escalation decision, review scheduling, SLA metrics, and what-if simulation features without changing canonical findings or operational action state.

## Implemented

- **Versioned policy definitions:** records policy ID/version, thresholds, severities, rollout-blocker constraint, change timestamp, change owner, and rationale.
- **Sequential version validation:** rejects duplicate versions and version gaps; versions cannot predate their predecessor.
- **Policy version comparison:** reports field-level changes between two versions without mutating either input.
- **Decision-to-policy audit links:** resolves the most recently recorded policy version effective at each decision timestamp and flags decisions without a matching policy version.
- **Supersession visibility:** marks prior decisions referenced by a later decision's `supersedesDecisionId`.
- **Markdown governance export:** includes policy change history, field-level changes, policy-version links, unmatched decisions, and superseded decisions.
- **Evidence caveat:** reports explicitly distinguish retained governance metadata from proof that a policy was deployed, communicated, or independently approved.

## Verification

- `node --test tests/escalation-policy-governance.test.js`: **4 passed, 0 failed**.
- `npm run test:simulation`: **322 passed, 0 failed**.
- `node --check src/features/simulation/experiments/escalationPolicyGovernance.js`: passed.
- `npm run check:package-lock-consistency`: **19/19 checks passed**.
- `npm run build`: **not successful**. The prebuild check reports that Excalidraw font assets are missing from `node_modules/@excalidraw/excalidraw/dist/prod/fonts`; run `npm ci` and retry.
- Real-browser testing: not performed.

## Scope and safeguards

Policy governance functions create audit metadata and comparisons only. They do not deploy or activate policies, notify reviewers, change remediation action status, alter canonical finding disposition, or clear rollout blockers. Version-to-decision matching uses the retained policy history and the decision timestamp; incomplete history is reported as unmatched rather than inferred.

## Suggested Git commit

`feat(workbench): add versioned escalation policy governance and audit reports`
