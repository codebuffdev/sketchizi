# Sketchizi 1.13.7 — Kubernetes Comparison References

## Added
- Deterministic finding references in snapshot comparison exports.
- Comparison report metadata with report version, schema version, generation timestamp, reference scheme, and scope.
- A remediation-change count in comparison summaries.
- Explicit finding references for new, changed, and resolved entries in Markdown exports.
- Tests for reference formatting, metadata, remediation context, and privacy.

## Scope
- Existing before/after severity, message, relationship, and remediation details remain available.
- References support discussion within comparison reports; they are not permanent IDs or security controls.
- Comparison remains based on diagram-validation snapshots and does not query a live Kubernetes cluster.

## Verification
- 152 automated regression tests passed.
- JavaScript syntax checks passed for the comparison and executive report services.
- ZIP integrity verified.
- Production build and browser-level testing were not run because project dependencies are not installed in this environment.
