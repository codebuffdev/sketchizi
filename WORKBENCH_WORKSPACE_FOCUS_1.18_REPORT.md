# Workbench Workspace Focus 1.18

## Scope
Remove the large generic “Start your design” empty-state card from the Add tab. The component catalog is already the relevant action there; repeating a separate architecture-start card pushes the actual catalog down and makes the interface feel cluttered. The empty-model guidance remains visible in Properties, Validate, and Explore where there is otherwise no meaningful content to inspect.

## Change
- `src/features/workbench/WorkbenchPanel.jsx`: constrain the generic empty-model card to the Properties, Validate, and Explore tasks. Design retains its starter architecture flow; Add opens directly into component selection.
- Package version remains unchanged.

## Verification
- Source-level condition verified after edit.
- Full automated tests, production build, and browser interaction checks were not run in this environment because dependencies are not installed in this extracted ZIP.

## Acceptance check
With an empty model, selecting Add should show the component catalog without the generic empty-model card blocking the first screen. Selecting Properties, Validate, or Explore should still explain that the model is empty and provide a route back to design.
