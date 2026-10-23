# Sketchizi 1.12.5 — Exportable Kubernetes Deployment Review

## Added
- Export current Kubernetes deployment-review findings as Markdown or JSON.
- Include severity-prioritized findings, remediation guidance, reviewed/unreviewed status, and in-session resolution history.
- Explicit scope and privacy notes in each report.
- Allowlist report fields so diagram elements, credentials, arbitrary metadata, and unrelated-provider findings are not exported.

## Verification
- Targeted Kubernetes review-export tests and prior deployment-review regression suite.
- JavaScript syntax checks, package/lockfile version alignment, and ZIP integrity.
- Production build and browser download interaction were not run in this environment.
