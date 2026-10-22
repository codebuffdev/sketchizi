# Sketchizi Workbench 0.90 — Reoccurrence Trend & Evidence Comparison

## Overview

Version 0.90 adds a saved per-finding observation timeline across imported release evidence bundles, a field-level comparison of the two latest observations, and a fresh-evidence gate after a previously closed finding is reopened.

## Changes

- Each tracked finding retains up to 20 bundle observations. Each observation stores source name, bundle record ID, generation/import timestamps, and a bounded snapshot of severity, title, and detail.
- A later observation that changes a finding's detail, title, or severity is matched to an existing finding when the code/title or unique code identifies a single candidate. The existing reviewer record and ID remain stable, and the current details are updated with an audit event describing the changed fields.
- The timeline orders observations by bundle generation time when present. Importing an older bundle after a newer one is retained as historical evidence but does not replace current details or trigger a false reoccurrence alert.
- The tracker UI exposes an observation timeline and compares the latest observation to its predecessor. Legacy observations without snapshots remain visible and are labelled as lacking detail snapshots.
- Reopening a previously Resolved or Accepted Risk finding retains the prior evidence as historical context and clears the active evidence field. The UI explicitly requests evidence from after the recurrence.
- Fresh evidence references must differ from the prior evidence before the finding can be Resolved or Accepted Risk again. The helper and decision-record update API enforce the gate, record when the new reference was entered, and preserve it through document persistence and release-bundle export. Workbench does not independently verify when the underlying artifact was created or whether its contents are authentic.
- Rollout readiness and release-bundle risk assessment surface outstanding fresh-evidence requirements.
- Findings disappearing from a bundle are not interpreted as proof of remediation.

## Verification

- Full simulation regression suite: 239 passed.
- Workbench format/persistence: 22 passed.
- Workbench artifacts: 11 passed.
- Package-lock consistency: 19/19 checks passed.
- Package-lock consistency tests: 6 passed.
- Focused review-finding, release-bundle and rollout-readiness suite: 50 passed.
- Updated review-finding tracking suite: 15 passed.
- Changed JavaScript files pass `node --check`; the updated JSX panel parses with the installed TypeScript JSX parser.
- ZIP integrity verified.

## Verification limitations

The production Vite build and real-browser interaction tests were not run because the extracted workspace does not contain installed project dependencies or the Vite executable. JSX parser validation does not replace a production build or browser test.

## Suggested Git commit

```text
feat(workbench): compare recurring findings and require fresh remediation evidence
```
