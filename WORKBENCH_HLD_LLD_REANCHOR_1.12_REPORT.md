# Sketchizi Workbench HLD/LLD Re-anchor — 1.12

## Scope
This is a narrow first UX correction on top of the user-provided `sketchizi-workbench-policy-governance-hardening-1.11(1).zip`. The package version remains `1.10.86`.

## Change
- When the semantic model is empty and the user is on a non-Build Workbench tab (including Inspect), show a visible HLD/LLD starting panel rather than leaving the user with only an empty inspector.
- The panel offers a direct action to create the existing starter architecture from the System view, a navigation action to reach System when another view is active, and a shortcut to the component catalog.
- Copy explicitly explains that the starter is editable and is not a production-ready design.
- Existing Build-tab template UI, file format, canvas behavior, model schema, and generated artifacts are unchanged.

## Verification
Passed:
- `node --test tests/workbench-panel-layout.test.js tests/workbench-poc-ui.test.js` — 16/16 tests.

Not verified:
- Production build and browser visual review were not run because this extracted ZIP does not include `node_modules`.
- This is an onboarding fix, not the complete HLD-to-LLD workflow. Nested service-level design, richer architecture templates, and explicit drill-down between design levels remain follow-up implementation work.

## Suggested Git commit
`fix(workbench): surface HLD and LLD starting actions in empty views`
