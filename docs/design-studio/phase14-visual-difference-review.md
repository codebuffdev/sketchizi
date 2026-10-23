# Phase 14 — Visual Difference Review

## Included
- Deterministic graph diff helper for added, removed and changed components.
- Connection additions/removals compared by source, target and relationship type rather than unstable connector IDs.
- Comparison panel now displays component and connection change counts and readable lists.
- Comparison JSON export includes the visual diff alongside existing scoring and finding comparison.

## Identity and limitations
Component IDs are treated as identity. If two independently created designs use different IDs for semantically equivalent components, they are shown as removed/added rather than matched. Component fields compared are name, type, role, replicas and availability zones. This is a structural diff, not a visual pixel diff or a runtime performance/cost estimate.

## Verification
- Full automated suite: 423/423 passed.
- Focused visual-diff tests: 4/4 passed.
- Production build: not verified in this environment because dependencies are not installed; npm registry access has previously failed. Run `npm ci` and `npm run build` in a network-enabled environment.
