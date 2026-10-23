# Breakscale-inspired Workbench redesign — Phase 3

## Scope
- Adds a contextual Quick Add palette directly to the Design workspace so common architecture components can be added without switching to the full component catalog.
- System/HLD quick actions include REST Service, PostgreSQL Database, and Queue where those component kinds are available in the active view.
- LLD quick actions include Java Class, Java Interface, and Repository where those component kinds are available in the active view.
- Adds a direct link to the full component catalog and keyboard-visible focus styles.
- Uses compact component tiles and responsive wrapping to reduce friction without changing the underlying semantic model.

## Preserved
- Package version remains `1.10.86`.
- No changes to persistence schema, model validation, relation semantics, artifact generation, collaboration, or file formats.

## Verification
- Focused regression suite: 74 passed, 0 failed.
- Production build attempted but blocked in `prebuild`: installed Excalidraw font assets are missing from `node_modules/@excalidraw/excalidraw/dist/prod/fonts`. Run `npm ci` and retry.
- Browser visual verification was not performed.

## Suggested commit
`feat(workbench): add contextual quick-add palette for design modes`
