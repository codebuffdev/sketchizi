# Breakscale-inspired Workbench redesign — Phase 2

## Scope
- Refines the design-view switcher into a compact segmented navigation strip.
- Adds stronger visual hierarchy to the current design-level summary.
- Makes the HLD/LLD model navigator a contained, searchable engineering panel with clearer entity rows and parent-scope controls.
- Uses restrained per-view accent colors to distinguish System, LLD, API, Data, and Deployment contexts without changing the underlying model.
- Improves narrow viewport behavior by keeping design navigation horizontally scrollable instead of forcing labels to compress.

## Preserved
- Package version remains `1.10.86`.
- No schema, persistence, relation, generator, simulation, collaboration, or file-format changes.

## Verification
- Focused regression tests should be run from the project root (commands provided with the delivery).
- Browser visual verification and production build have not been run in this environment.

## Suggested commit
`style(workbench): clarify design modes and model navigation`
