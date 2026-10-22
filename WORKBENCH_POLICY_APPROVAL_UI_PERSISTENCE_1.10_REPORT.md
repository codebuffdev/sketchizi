# Sketchizi Workbench 1.10 — Policy Approval UI & Persistence Integration

## Scope

This release connects the existing escalation-policy approval workflow to the Engineering Workbench UI and persists its records inside the `.sketchizi` Workbench document extension.

## Implemented

- Added a **Policy** tab to the Engineering Workbench.
- Added `PolicyApprovalPanel.jsx` with controls to create a versioned escalation policy, select severity filters, configure thresholds, provide change rationale, submit a version for approval, and approve/reject a pending version as a separate reviewer.
- Reuses the existing policy governance and approval functions rather than duplicating policy transition logic.
- Adds `policyGovernance.policyHistory` and `policyGovernance.approvalEvents` to the Workbench document extension.
- Adds a controller update method that saves policy records through the same Sketchizi document persistence path as the Workbench model.
- Preserves policy history across Sketchizi serialize/parse round trips.
- Displays derived counts for total versions, approved versions, pending versions, and blocked versions.
- Keeps the release gate fail-closed; blocked policy status does not clear other rollout blockers.
- Adds responsive styling for the policy panel and small viewports.

## Verification

- `npm run test:simulation`: **330 passed, 0 failed**.
- `npm run test:workbench-ui`: **35 passed, 0 failed**.
- Focused policy/document tests: **19 passed, 0 failed**.
- `npm run check:package-lock-consistency`: **19/19 checks passed**.
- `node --check` on the policy governance JavaScript modules: passed.
- ZIP integrity: checked after packaging.

## Outstanding checks

- `npm run build` was attempted but stopped in the prebuild font-copy step because Excalidraw font assets are absent under `node_modules/@excalidraw/excalidraw/dist/prod/fonts`. Run `npm ci`, verify font assets, then rerun the build.
- Real-browser end-to-end testing was not performed in this environment.
- Approval actors and timestamps are document-backed workflow metadata. This UI does not independently authenticate reviewer identities or prove external organizational authorization.

## Suggested commit

`feat(workbench): integrate policy approval UI and document persistence`
