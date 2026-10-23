# Phase 29 — Architecture Implementation Planner

## Overview

The system design review dashboard can turn the current component graph into an editable delivery checklist. Tasks are ordered using graph dependencies, grouped into suggested phases, and assigned heuristic priority and effort defaults.

## Capabilities

- Generate one task per recognized architecture component.
- Derive task dependencies from incoming graph connections and suggested phase depth from topological ordering.
- Detect cycles and explicitly flag them for manual sequencing.
- Track status, priority, effort, owner, and notes.
- Refresh tasks from the current diagram while preserving progress for matching component IDs.
- Export the plan as Markdown or JSON.
- Persist task progress in browser-local storage under `sketchizi.system-design.implementation-plan.v1`.

## Limitations

Ordering and effort estimates are heuristic, not deployment guarantees. Dependency direction follows the graph's source-to-target connections. Browser-local data is not shared across devices or reviewers. Refresh preserves progress for components with matching IDs; removed components are not retained in the generated plan.

## Verification

Run `npm run test:system-design-implementation-plan` and `npm run test:all`.
