# Sketchizi 1.13.5 — Kubernetes Executive Review Report

## Added
- Export a combined executive review as Markdown or JSON.
- Combine readiness assessment, finding severity counts, review coverage, and remediation checklist progress.
- Prioritize error-level and unreviewed findings with resource and remediation details.
- Include snapshot comparison counts when a comparison is active.
- Explicitly disclose missing comparison context and diagram-only scope limitations.
- Add automated tests for aggregation, priority ordering, safe export fields, and zero-state reports.

## Scope and privacy
The report excludes diagram/canvas data and arbitrary metadata. It does not query a live Kubernetes cluster or certify runtime readiness.
