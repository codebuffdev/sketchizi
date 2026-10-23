# Sketchizi 1.13.13 — Kubernetes Review Flow

## Improvements
- Added a unified dashboard action to reset finding, comparison, and remediation filters/search/sort.
- Reset action appears only when the review view has non-default filtering or sorting.
- Dashboard shortcut labels reflect their selected state and expose appropriate accessible state attributes.
- Finding shortcuts clear resource filters; pending-task shortcuts clear task search; comparison shortcuts clear resource search and restore severity sorting.
- Added compact selected-shortcut styling and reduced-motion consideration for review navigation.
- Resetting filters does not modify review marks, snapshots, findings, or remediation task statuses.

## Verification
- Automated Kubernetes review and architecture regression suite.
- JavaScript syntax checks for relevant non-JSX services.
- ZIP integrity and package version checks.
- Production build/browser testing was not run because project dependencies are unavailable in this environment.
