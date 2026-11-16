# Phase 7 — System Design Architecture Intelligence

## Scope

Adds a non-mutating, provider-neutral analysis function for system-design graphs. It reports invalid connection endpoints, isolated components, self-connections, duplicate connections, and conditional resilience observations when replica or availability-zone metadata is explicitly provided.

## API

`analyzeSystemDesignArchitecture({ nodes, edges })`

Nodes use `{ id, name, type, role, replicas, availabilityZones }`; edges use `{ sourceId, targetId, type }`. The function returns `diagnostics`, severity-specific lists, and a summary. It does not modify the input, apply fixes, or assume an availability target.

## Safety and limitations

Resilience observations are recommendations, not proof of a production defect. Replica/zone warnings are emitted only when the corresponding numeric metadata is explicitly provided. The module is an additive analysis service; it does not silently change existing AWS/Kubernetes validation behavior or rewrite diagram elements. Browser UI integration remains a subsequent step.

## Verification

Run `npm run test:system-design-intelligence` and the repository's `npm run test:all`. Production build/browser verification still requires installed dependencies and a successful CI run.
