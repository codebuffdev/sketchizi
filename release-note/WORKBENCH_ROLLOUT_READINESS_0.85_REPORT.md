# Sketchizi Workbench 0.85 — Rollout Readiness Checklist

## Summary

Adds an evidence-backed rollout readiness view to saved architecture decision records. The view derives status from the persisted decision, owner and rationale, semantic architecture delta, comparable simulation metrics, infrastructure-profile confirmation, saved decision validation gates, and the presence of imported load-test records. It also adds a required production checklist with evidence notes stored in the current Workbench document.

## Included changes

- Added `src/features/simulation/experiments/rolloutReadiness.js` with stable required-check definitions, legacy-data normalization, and derived readiness calculations.
- Decision records now initialize and persist seven required rollout checks: production-like load test, service objectives, rollback/recovery, observability, security/compatibility/migration, operational ownership, and post-deployment verification.
- Rollout check evidence references and completion changes are added to the existing bounded audit trail.
- The Simulation Experiment panel shows each derived system check and the editable production checks with evidence fields.
- Markdown decision-record exports now include the derived readiness status and checklist evidence.
- The checklist can only report `review-required` when all checks complete; the wording explicitly states that independent human release approval is still required.
- Added `tests/rollout-readiness.test.js` and included it in `npm run test:simulation`.

## Verification

| Check | Result |
|---|---:|
| `npm run test:simulation` | 209 passed |
| `npm run test:rollout-readiness` | 10 passed |
| `npm run test:workbench-format` | 22 passed |
| `npm run test:workbench-artifacts` | 11 passed |
| `npm run check:package-lock-consistency` | 19/19 passed |
| TypeScript JSX/JS parser check for `SimulationExperimentPanel.jsx` | Passed |
| ZIP integrity | Passed |
| Production Vite build / real browser | Not run |

## Limitations

- A load-test record being present does not prove that it matches the proposed architecture, workload, environment, or component scope. This remains an explicit checklist item requiring a human evidence reference.
- Checklist completion is not an automated release approval or a production-safety guarantee.
- Production build and real-browser validation remain outstanding because the extracted workspace does not contain installed project dependencies.

## Suggested Git commit

```text
feat(workbench): add evidence-backed rollout readiness checklist
```
