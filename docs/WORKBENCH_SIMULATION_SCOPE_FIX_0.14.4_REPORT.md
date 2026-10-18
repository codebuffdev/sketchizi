# Sketchizi Engineering Workbench — Simulation Scope Fix 0.14.4

## Summary

This prototype fixes a misleading blocked-simulation experience observed in the Workbench UI. A disconnected External API had a saved simulation profile and was being treated as a required simulator node merely because its placement was included in the active-view seed list. The engine then rejected the unreachable runtime node, while the visible approximation warning made it appear that the approximation itself was the blocker.

This release separates **view placement** from **effective request-path scope** and keeps engine diagnostics visible at the Workbench suite level.

## Behavior changes

1. **Traffic-source-rooted scope.** When a React application is placed in the active view, runtime scope starts from those active-view React clients and follows supported typed relationships (`calls`, `reads`, `writes`, `publishes`, `subscribes`, `exposes`, `deploys-to`). Disconnected runtime placements remain in the document and saved profile but are excluded from that run.
2. **Explicit scope diagnostic.** `SIM-OUTSIDE-ACTIVE-SCOPE` identifies excluded components and explains that a supported typed runtime relationship is required to include them. The document is not mutated and no entities are deleted.
3. **Honest engine blockers.** If the compiled topology still cannot run—for example, visual arrows exist but the semantic model has no typed request relation—the runner exposes engine blockers at suite level and maps runtime node IDs back to Workbench entity IDs for focus actions.
4. **Approximation remains a warning.** A connected External API is labeled as a generic approximation. Once the user confirms the assumptions, that warning alone does not block execution. Unsupported topology behavior can still block a scenario and is reported separately.
5. **Auditable scope.** Provenance/history now record active-view placements, actual scope roots, and included scope entities. Saved experiment history retains these values across restore.
6. **Profile editor clarity.** The UI explains that disconnected components are retained in the document but excluded from simulation. The component count/profile list reflects the current effective scope.

## Expected result for the reported example

For a typed request path `React application → REST service → PostgreSQL`, an unrelated/disconnected External API should no longer appear as a profiled runtime component for that run and should not block the experiment. A profile for that External API is still preserved in document metadata for future work.

If the visible connectors are ordinary Excalidraw arrows and not Workbench typed relationships, the run should now show the real blocking diagnostic (for example, the traffic source has no modeled request route) and an informational scope diagnostic for disconnected REST/database nodes. Create typed relationships from the Workbench inspector to make those connections part of the semantic model.

If an External API is actually linked into the request path with a supported typed relationship, it remains in scope and is clearly disclosed as approximated. It can run only if the resulting topology fits the engine's supported routing semantics.

## Verification

All listed regression test runs passed:

| Suite | Passed | Failed |
|---|---:|---:|
| Simulation projection, engine, runner, experiment model and history | 54 | 0 |
| Workbench UI/layout tests | 18 | 0 |
| Workbench validation | 24 | 0 |
| Collaboration sync and diagnostics | 35 | 0 |
| Recovery | 1 | 0 |
| Workbench file format/persistence | 21 | 0 |
| Browser verification-server protocol | 6 | 0 |
| Font-asset tests | 7 | 0 |
| **Total test executions across suites** | **166** | **0** |

The suites overlap; 166 is the sum of test executions across these test commands, not a count of unique test cases. JavaScript syntax checks and a TypeScript-transpiler JSX syntax check passed.

### Remaining limitation

The production Vite build was not verified in this sandbox copy because it does not contain `node_modules`; the prebuild font-copy script fails because Excalidraw's font package assets are absent. The actual browser UI for this new simulation-scope fix has not yet been tested here. The user's earlier screenshot confirmed the separate-scrollbar layout fix in 0.14.3, but not this new simulation fix.

## Changed source files relative to 0.14.3

- `src/features/simulation/adapter/deriveSimulationScope.js` (new)
- `src/features/simulation/adapter/buildSimulationProjection.js`
- `src/features/simulation/runWorkbenchExperiments.js`
- `src/features/simulation/experiments/SimulationExperimentPanel.jsx`
- `src/features/simulation/experiments/simulationExperimentModel.js`
- `src/features/simulation/experiments/simulationHistory.js`
- `src/features/workbench/WorkbenchPanel.jsx`
- `src/styles/workbench.css`
- `tests/simulation-projection.test.js`
- `tests/workbench-simulation-runner.test.js`
- `tests/simulation-history.test.js`

The `package.json` application version remains `1.10.86`; 0.14.4 is a Workbench prototype iteration label, not an application release version. The original stable baseline archive remains untouched.
