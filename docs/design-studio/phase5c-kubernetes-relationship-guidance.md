# Phase 5C — Kubernetes Relationship Guidance

Baseline: Sketchizi Design Studio Phase 5B, version 1.10.86

## Delivered

- Added `getKubernetesRelationshipGuidance` to `kubernetesRelationshipService.js`.
- Guidance resolves the connector's live bound endpoints and reads their Kubernetes resource types.
- Compatible relationship types come from the shared semantic mapping, so the service and validators use the same rules.
- Missing/deleted/non-Kubernetes endpoints produce an indeterminate result (`isCompatible: null`) and no guessed alternatives.
- Wired the guidance into the selected connector's Properties panel.
- The panel now explains compatible relationships, warns when the selected type is semantically incompatible, and lists compatible alternatives.
- Added `npm run test:kubernetes-relationships` for focused repeatable verification.

## Verification

Command:

```bash
npm run test:kubernetes-relationships
```

Result: **7 passed, 0 failed**.

JavaScript syntax checks passed for the relationship service and diagnostic-fix service. The production build was not run because dependencies and Excalidraw font assets remain an environment-level verification blocker in the supplied baseline.

## Known remaining work

The separate `kubernetes-diagnostic-fixes.test.js` suite still has failures related to validation diagnostics not consistently providing correction suggestions and the Architecture Validation panel not yet exposing the full explicit correction workflow. These are not marked as resolved by this phase and should be handled as the next focused milestone. Do not treat the application as release-ready until these behaviors and the production build are verified.

## Suggested commit

`feat(kubernetes): add relationship compatibility guidance`
