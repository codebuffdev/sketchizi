# Sketchizi Workbench 1.41 — Requirement-to-Architecture Studio

## Goal
Start differentiating Sketchizi through a requirement-driven architecture workflow rather than another layout-only iteration.

## Implemented
- Added a System-view Requirement-to-Architecture Studio in `WorkbenchPanel.jsx`.
- Added deterministic proposal logic in `src/features/workbench/requirementArchitectureProposal.js`.
- The initial heuristic proposes a web client, REST service, and PostgreSQL database; keywords for payment, asynchronous/event workflows, and deployment surface additional integration, queue/worker, and deployment components.
- Proposals include explicit assumptions and unresolved decisions. The UI clearly labels the proposal heuristic and does not claim AI reasoning.
- Users review the proposed components and add them individually through the existing `onAddComponent` callback into the current semantic model.
- Added tests for insufficient input, base proposal, payment/event-driven proposal, and UI/model callback integration.
- Package version remains `1.10.86`.

## Limitations
- This is a deterministic first slice, not natural-language AI architecture generation.
- Adding components individually does not automatically create typed relationships, contracts, data schemas, sequence diagrams, or service boundaries. Those remain explicit engineering steps.
- No automatic apply-all operation is included, to avoid creating unreviewed model elements and misleadingly implying the relationships are inferred.

## Verification
- Focused Node test command: 43 passed, 0 failed.
- ZIP integrity checked after packaging.
- Production build and browser visual verification were not run. Dependencies were not installed in this source bundle.

## Suggested commit
`feat(workbench): add requirement-driven architecture proposal studio`
