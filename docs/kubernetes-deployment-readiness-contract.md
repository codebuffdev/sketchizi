# Kubernetes Deployment Readiness Report Contract

`buildKubernetesDeploymentReadinessReport(validation)` combines existing Kubernetes findings from resource-property validation, relationship validation, and architecture completeness checks into one prioritized, read-only report.

- Priority order is errors, warnings, then informational recommendations.
- Findings retain their original diagnostic metadata and are deduplicated by `diagnosticId` (or a stable fallback identity).
- The report includes severity counts, a concise summary, and a status of `action-required`, `review-recommended`, `optional-improvements`, or `no-findings`.
- AWS and Networking findings are excluded from the Kubernetes report and remain in the existing shared validation groups.
- The report is a review of the diagram model only. It does not contact a live Kubernetes cluster, validate admission policies, or guarantee a successful deployment.
- The report and its helper never mutate the validation input or diagram elements.

Run `npm run test:kubernetes-readiness` to verify the report contract.
