# Workbench 0.89 — Remediation Reoccurrence & Evidence Review

Implemented:
  - Detect findings present in a later release evidence bundle after a finding was previously marked Resolved or Accepted Risk.
  - Avoid treating a repeated import of the same generated export as a new recurrence.
  - Preserve the previous disposition until a reviewer explicitly selects Reopen finding.
  - Preserve source bundle identity, detection/review timestamps, and finding-level plus decision-record audit history.
  - Make unreviewed recurring error-severity findings block rollout readiness, and keep reopened errors blocked as Open findings.
  - Include recurrence context in decision Markdown, release evidence JSON, bundle review warnings, and the risk assessment.

Verified:
  npm run test:simulation                 (236 passed)
  Focused review tracking / release bundle / rollout readiness tests (37 passed)
  npm run test:workbench-format           (22 passed)
  npm run test:workbench-artifacts        (11 passed)
  npm run check:package-lock-consistency  (19/19 passed)
  npm run test:package-lock-consistency   (6 passed)
  TypeScript JSX parser and changed JavaScript syntax checks (passed)
  ZIP integrity (passed after packaging)

Not verified:
  Production Vite build and real browser behavior were not verified because project dependencies and the Vite executable are not installed in the extracted workspace.
