# Workbench 0.84 — Decision Record Lifecycle

## Shipped

- Create an architecture decision record from the live decision report.
- Preserve a bounded evidence snapshot so the report behind a decision does not drift as the architecture or simulation changes.
- Record title, review owner, Proposed / Accepted / Rejected / Deferred status, and human rationale.
- Require an owner and rationale before accepting or rejecting a proposal.
- Track report-derived validation gates with completion timestamps and an audit trail for gate/status/owner/rationale updates.
- Save decision records inside the Sketchizi Workbench document and verify save/load round-tripping.
- Export each record to Markdown with the decision, evidence snapshot, open gates, risks, and audit trail.
- Limit the document to the 50 most recent records and each record to 50 audit events.

## Verification

- Simulation regression suite: 199 passed.
- Workbench format/persistence suite: 22 passed.
- Workbench artifact suite: 11 passed.
- Package lock consistency: 19/19 checks passed; lock consistency unit tests 6 passed.
- Decision record tests: 10 passed.
- Changed JSX files parse successfully using the installed TypeScript parser.

Production Vite build and live browser tests were not run because project dependencies and the Vite executable are absent from this ZIP workspace. JSX parsing is a syntax check, not a substitute for a production build or rendered UI test.

## Suggested commit

`feat(workbench): persist architecture decision records and validation gates`

## Next

Workbench 0.85 should connect decision-record status and open validation gates to a compact rollout-readiness checklist while preserving the distinction between a recorded design decision and production release approval.
