# Engineering Workbench UI Prototype 0.5

This prototype is based on the stable Sketchizi 1.10.86 source and adds the first visible Workbench vertical slice. It is an experimental development artifact, not a production release.

## Included

- An **Engineering Workbench** header toggle, visible for users who can edit.
- An introductory panel that enables Workbench per document without converting existing shapes or icons.
- System, APIs, Data, and Deployment view tabs backed by the `com.sketchizi.workbench` document extension.
- Eight typed component insertions. Each creates a shared semantic entity and a paired rectangle/label placement on the active view.
- Separate view scenes with shared entity IDs; switching views saves the outgoing layout and activates the selected layout.
- Model-revision increments for semantic component insertion.
- Workbench documents serialize as `.sketchizi`. Save-As suggests `.sketchizi`, and the file manager rejects a `.excalidraw` Save-As target rather than writing a Workbench envelope under an incompatible extension.
- Existing Icon Library items and ordinary shapes remain visual-only until a future explicit conversion flow.

## Not yet included

- Typed relation creation and endpoint validation.
- Entity property editing / context-sensitive inspector.
- Validation rules, findings, approvals, OpenAPI generation, and SQL generation.
- Collaboration synchronization of live Workbench semantics. Workbench should be treated as a local document prototype until that is designed and tested.
- Browser end-to-end validation of this new UI slice.

## Verification

Passed in this worktree:

- `npm run test:workbench-format`: file-format, Workbench-document, persistence-lifecycle, and registry tests.
- `node --import ./tests/register-sync-test-loader.mjs --test tests/collaboration-sync-core.test.js tests/sync-diagnostics.test.js`: core synchronization and diagnostics tests.
- `node --test tests/recovered-drafts.test.js`: recovery regression tests.
- `node --check` for the new Workbench controller and modified file-manager module.

The production build is **not verified**. `npm run build` stops at the prebuild step because `node_modules/@excalidraw/excalidraw/dist/prod/fonts` is absent. Installing dependencies must be done in an environment with npm registry access (`npm ci`). A broader collaboration characterization test also could not launch because Node's loader could not resolve an extensionless import in this dependency-incomplete worktree; the core synchronization tests pass independently.

## Run locally

1. Extract this ZIP to a new folder; do not overwrite the original stable baseline.
2. From `sketchizi-main`, run `npm ci` with network access.
3. Run `npm run test:workbench-format` and `npm run test:sync`.
4. Run `npm run dev` and create/open a drawing.
5. Click **Workbench**, enable it for the drawing, insert a React application and REST service, switch to APIs and Data, then switch back to System.
6. Save the drawing as `.sketchizi`, reload/reopen, and verify that each view retains its layout and the semantic count remains shared.

## Safety and known issue

Do not use this build on the only copy of a valuable diagram. Use a duplicate `.sketchizi` file while testing. The browser reload, Save-As prompt, and view-switch interactions need manual confirmation in a fully installed app before this should be merged into the primary branch. Enabling Workbench does not automatically migrate existing diagram nodes.
