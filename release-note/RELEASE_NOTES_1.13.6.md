# Sketchizi 1.13.6 — Kubernetes Report Quality and Sharing

## Added
- Deterministic, human-readable finding references (`K8S-XXXXXXXX`) for easier discussion across exports.
- Explicit priority groups for errors, unreviewed warnings, and unreviewed informational findings.
- Report metadata containing generation time, report version, schema version, reference scheme, and scope label.
- Matching metadata and priority-group sections in executive Markdown exports.

## Privacy and scope
- References are derived from normalized allowlisted diagnostic fields; raw finding and checklist IDs are not included in the executive report payload.
- Exports still omit the full diagram, canvas elements, credentials, and arbitrary diagnostic metadata.
- References are stable for unchanged normalized finding content, but are not permanent IDs or security guarantees.
- Reports remain diagram-level assessments and do not query or certify a live Kubernetes cluster.

## Verification
- 149 automated regression tests passed.
- JavaScript syntax checks passed for the executive report and related export/checklist services.
- ZIP integrity verified.
- Production build and browser-level testing were not run because project dependencies are not installed in this environment.
