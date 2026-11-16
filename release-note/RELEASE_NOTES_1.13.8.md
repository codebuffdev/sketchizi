# Sketchizi 1.13.8 — Kubernetes Review Workflow Polish

## Added
- Comparison navigation now targets only findings present in current diagnostics.
- Resolved comparison entries explain why there is no current canvas target.
- Stale or unmatched comparison entries explain when navigation is unavailable.
- Clearer styling for historical comparison entries and navigation notes.
- UI regression tests for current-only navigation and resolved-finding messaging.

## Clarification
- Remediation task status (pending/completed) remains separate from finding lifecycle (active/resolved).
- A finding disappearing from validation does not automatically mark the remediation task complete.
- No live Kubernetes API or cluster mutation was added.

## Verification
- 152 automated regression tests passed.
- JavaScript syntax checks passed for comparison services.
- ZIP integrity verified.
- Production build and browser-level testing were not run because project dependencies are not installed in this environment.
