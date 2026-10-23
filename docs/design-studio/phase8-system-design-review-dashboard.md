# Phase 8 — System Design Review Dashboard

## Scope

Integrates the provider-neutral system-design intelligence engine into the existing Architecture Validation panel. It reports component and connection counts, groups diagnostics by severity, filters findings, and offers a component-selection action where a diagnostic identifies a component. The review is advisory and does not mutate the diagram.

## Graph mapping

The dashboard maps visible Excalidraw shape-like elements into component nodes and arrows/lines with explicit start/end bindings into edges. Optional `customData.systemDesign` or `customData.architecture` metadata supplies role, replicas, availability zones, and relationship type. Unknown values are not inferred.

## Verification

- `npm run test:all`: 397 tests passed.
- `npm run test:system-design-review`: 8 tests passed.
- A raw `node --test tests/*.test.js` invocation fails one collaboration characterization test because that suite requires the repository's custom sync test loader. Use `npm run test:all` as the canonical suite.
- Production build not verified: dependency installation / Vite availability remains an environment prerequisite.

## Limitations

This is a structural review, not a capacity model, availability calculation, security audit, or production-readiness guarantee. Component-selection behavior uses the existing architecture-diagnostic navigation callback; visual browser verification is still recommended.
