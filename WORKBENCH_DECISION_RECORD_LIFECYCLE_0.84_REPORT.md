# Sketchizi Workbench 0.84 — Decision Record Lifecycle

## Product increment

Architecture Decision Report now supports an explicit review lifecycle. A user can create a decision record from the current report, edit its title and rationale, assign an owner, select Proposed / Accepted / Rejected / Deferred, track validation gates, inspect an audit trail, and export the record as Markdown.

Decision records are saved as `decisionRecords` alongside the semantic Workbench data and existing simulation history in the current Sketchizi document extension. Each record keeps a bounded point-in-time snapshot of the source report, including architecture changes, comparable simulation metrics, bottleneck signals, trace evidence, recommendations, optimization portfolio summary, risks and limitations. This prevents later report changes from silently rewriting the evidence behind an earlier decision.

Accepted or rejected proposals require both an owner and human rationale. Validation gates remain independent: accepting a proposal does not imply that gates are complete or authorize production rollout. The collection retains at most 50 records and each record retains at most 50 audit events.

## Verification

- `npm run test:simulation`: 199 passed.
- `npm run test:workbench-format`: 22 passed.
- `npm run test:workbench-artifacts`: 11 passed.
- `npm run check:package-lock-consistency`: 19/19 checks passed.
- `npm run test:package-lock-consistency`: 6 passed.
- Focused decision-record tests: 10 passed.
- JavaScript syntax checks: passed.
- TypeScript parser JSX syntax checks for `SimulationExperimentPanel.jsx`, `WorkbenchPanel.jsx`, and `App.jsx`: passed.
- ZIP integrity: checked after packaging.

The production Vite build and live browser testing were not run because this ZIP workspace does not have the Vite executable or installed project dependencies. The JSX parser check confirms syntax only; it does not substitute for a production build or UI test.
