# Phase 5D — Safe Kubernetes Relationship Corrections

## Scope

This phase completes the explicit correction flow for Kubernetes relationship diagnostics. It does not add automatic mutation and does not change AWS or Networking correction behavior.

## Changes

- Kubernetes invalid/unknown relationship diagnostics now include endpoint-aware compatible relationship types and remediation text.
- Unsupported Kubernetes relationship types are preserved in the derived graph so Kubernetes-specific rules can diagnose them and offer safe alternatives. Other providers retain the existing unsupported-type exclusion behavior.
- Architecture Validation displays remediation, suggested types, and separate correction buttons.
- Correction buttons are gated by current edit permission. Applying one requires explicit confirmation.
- The correction service revalidates the live scene, rejects stale diagnostics, missing endpoints, duplicate relationship IDs, incompatible suggestions and already-correct relationships.
- Only the relationship type is changed; IDs, endpoints, connector metadata and unrelated scene elements are preserved.
- Diagnostic selection now checks provider metadata explicitly.

## Verification

Command:

```bash
npm run test:kubernetes-corrections
```

Result: **19/19 tests passed** across diagnostic correction, relationship service and validation-guidance suites.

Additional graph/completeness/resource-validation suite: **32 passed, 12 failed**. The 12 failures are in pre-existing Kubernetes architecture-completeness and resource-property validation expectations; they are outside the correction flow and remain follow-up work. The graph tests and all correction/guidance tests passed.

JavaScript module syntax checks passed for the modified non-JSX service modules. The JSX build and full production build are **not verified** because this extracted environment does not have a confirmed working dependency installation/font preflight.

## Release status

Not release-ready until the production build succeeds and the remaining baseline Kubernetes failures are triaged. No deployment is recommended from this phase alone.
