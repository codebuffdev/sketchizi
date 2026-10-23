# Phase 13 — Compare Saved Designs

## Summary

The System Design comparison panel can now load a saved `.sketchizi` file, a standard `.excalidraw` file, or graph JSON as the alternative design. It converts saved scene elements into the existing comparison graph contract and leaves the active canvas unchanged.

## Behavior

- Reads the selected file locally in the browser; it is not uploaded to a server.
- Supports Sketchizi wrapper files (`type: sketchizi`, `diagram.elements`) and standard scene JSON (`elements`).
- Derives nodes from active non-line elements and edges from bound arrows/lines with resolvable endpoints.
- Allows the user to inspect/edit the normalized graph JSON before running comparison.
- Reports invalid file shapes as an accessible error in the comparison panel.
- Does not replace or mutate the active diagram.

## Limitations

- Edges without source/target bindings or explicit system-design endpoint metadata are omitted from graph comparison.
- Excalidraw visual connectors can use different binding patterns; compare results are only as complete as the endpoints represented in the source file.
- The scoring remains heuristic and does not measure runtime performance, cost, or availability.
- Browser end-to-end and production build checks must be run in CI with dependencies installed.
