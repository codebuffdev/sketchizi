# Workbench 0.92 — Quantitative Remediation Acceptance Criteria

- Configure numeric targets for p95 latency, throughput, error rate, and success rate on a tracked release finding.
- Record before/after measurements alongside each remediation verification run.
- Evaluate each configured target as Pass, Fail, or Unevaluated; missing values never count as passing.
- Prevent reviewer confirmation when any configured target fails, remains unevaluated, or the run predates the current criteria.
- Changing the criteria makes existing verification historical until a new run passes and is reviewed.
- Preserve targets, measurements, comparison results, and review status in decision records and release evidence exports.
- Bundle review recalculates criterion results and flags malformed numeric values or inconsistent stored summaries.

Measurements are user-supplied and are not independently authenticated by Workbench. Production build and browser verification remain outstanding for this release workspace.
