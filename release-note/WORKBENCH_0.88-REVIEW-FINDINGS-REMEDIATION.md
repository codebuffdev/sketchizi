# Workbench 0.88 — Review Findings & Remediation Tracking

Release evidence review findings can now be tracked on a saved architecture decision record instead of remaining ephemeral in the imported bundle viewer.

- Import review findings into a selected decision record.
- Assign an owner and keep Open, Accepted Risk, or Resolved as the review disposition.
- Require an owner, rationale, and supporting reference/evidence before accepting a risk or marking a finding resolved.
- Preserve source bundle names, timestamps, a per-finding audit trail, and record-level audit events.
- Re-importing the same finding preserves the current disposition and records new bundle observations.
- Open error-severity findings block rollout readiness; other open findings remain outstanding. Accepted risks remain visible, and no finding status grants production approval.
- Preserve tracked findings and their audit history in the Markdown decision export and JSON release evidence bundle.

Verification: simulation suite 232 passed; Workbench format/persistence 22 passed; artifact tests 11 passed; package-lock checks 19/19 plus 6 tests passed; JSX parser and changed helper syntax checks passed. Production Vite build and real-browser verification were not run because project dependencies were unavailable in the extracted workspace.

Suggested commit: `feat(workbench): track release review findings and remediation`
