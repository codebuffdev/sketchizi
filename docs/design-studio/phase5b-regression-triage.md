# Sketchizi Design Studio — Phase 5B Regression Triage

Date: 2026-10-23  
Baseline: `sketchizi-no-workbench-1.10.86(1).zip`  
Candidate: Phase 5 compatibility/regression ZIP

## Purpose

Compare the current full-suite failures against the original no-Workbench baseline before making unrelated product changes. This phase is triage and reproducibility work; it does not claim to fix the unrelated Kubernetes or architecture-review failures.

## Reproducible test command

Run:

```bash
npm run test:all
```

The script loads the existing test-only ESM resolution shim required by the collaboration-sync characterization tests, then runs all `tests/*.test.js` files.

## Baseline comparison

Both runs used Node.js 22.16.0 and the same test-only loader.

| Run | Tests | Passed | Failed |
|---|---:|---:|---:|
| Original no-Workbench baseline | 342 | 293 | 49 |
| Phase 5 candidate | 353 | 306 | 47 |

Two failures present on the original baseline no longer fail in Phase 5:

- `canvas persistence callbacks keep stable identities between renders`
- `design diagnostics avoid scheduling state updates for identical validation results`

The 47 remaining failures have the same test names as failures already present on the original baseline. This comparison does not prove every failure is harmless; it establishes that these failures were not newly introduced by the Design Studio work in this candidate.

## Remaining failure inventory

| Area | Failing checks | Triage finding |
|---|---:|---|
| Kubernetes architecture completeness | 6 | Expected contextual recommendations/warnings are not produced for several topology scenarios. |
| Architecture review/dashboard UI | 26 | Tests expect filters, review-state interactions, snapshots, comparisons, remediation workflow, export, accessibility and dashboard navigation that are not satisfied by current source. |
| Kubernetes relationship correction behavior | 4 | Expected safe correction, compatible alternatives, stale-endpoint protection and explicit confirmation are not satisfied. |
| Kubernetes relationship service module | 1 test file | Test import fails because `getKubernetesRelationshipGuidance` is not exported by `kubernetesRelationshipService.js`. |
| Kubernetes resource/relationship validation | 10 | Expected property validation, relationship remediation and accessible validation-panel guidance are not satisfied. |
| **Total** | **47** | Existing baseline issues requiring separate triage. |

## Recommended order

1. Keep Design Studio changes isolated; do not alter unrelated Kubernetes behavior merely to reduce the failure count.
2. Address the missing relationship-service export and its contract as a dedicated Kubernetes relationship task.
3. Prioritize the architecture-review/dashboard test cluster as its own product milestone; the failures describe a broad set of expected UI capabilities, not one isolated defect.
4. Fix Kubernetes completeness and validation behavior in focused changes with domain-level tests.
5. Re-run `npm run test:all` after each subsystem change and compare against this baseline.
6. Install dependencies in a network-enabled environment and verify `npm run build`. The production build remains unverified in this phase.

## Release decision

**Not release-ready.** The baseline comparison shows two previously failing checks resolved and no newly failing test names in the full suite, but 47 baseline failures remain and the production build is unverified.
