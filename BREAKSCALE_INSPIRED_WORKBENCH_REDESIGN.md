# Breakscale-inspired Workbench redesign — Phase 1

## Baseline
- Source archive: `sketchizi-workbench-audit-commit-5-real-usability.zip`
- Application version preserved: `1.10.86`

## Scope of this phase
- Adds a dedicated `workbench-studio` styling hook and state-specific classes to the Workbench root.
- Introduces a more restrained, functional surface style inspired by Breakscale's canvas-first interaction model: compact header, segmented task navigation, quieter borders, and less decorative card styling.
- Tightens the component palette and experiment editor surfaces without changing semantic model behavior.
- Adds a reduced-motion accommodation for Workbench transitions.

## Preserved
- No engineering-model schema changes.
- No changes to persistence, relationship validation, API/SQL generation, simulation calculations, collaboration, or file formats.
- Package version remains `1.10.86`.

## Verification
- Focused regression suite: 74 passed, 0 failed.
- Production build not run in this environment because `node_modules` is absent from the supplied source archive.
- Browser visual verification has not been performed; this is a first styling pass, not final acceptance.

## Suggested commit
`style(workbench): introduce Breakscale-inspired engineering workspace surfaces`
