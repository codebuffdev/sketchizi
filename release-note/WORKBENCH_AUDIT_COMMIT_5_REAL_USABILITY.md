# Workbench Audit — Commit 5: Real Usability

## Scope

This commit fixes a verified shell-level usability blocker in the source: when the Workbench was open, the desktop grid unconditionally hid both the resource palette and contextual inspector. The new wide-desktop layout (1280px and above) retains the palette when enabled, the canvas, the Engineering Workbench, and the contextual inspector when open. Closed regions do not reserve their grid tracks. The existing narrower-width split/overlay behavior is retained.

## Changed files

- `src/styles/responsive-final.css`: added a wide-desktop multi-region grid and explicit visibility/placement rules.
- `tests/workbench-five-region-usability.test.mjs`: added regression checks for the palette, canvas, Engineering, and optional inspector regions.

## Verification

Command:

```sh
node --test tests/workbench-five-region-usability.test.mjs tests/workbench-workspace-shell.test.mjs tests/workbench-persistence-lifecycle.test.js
```

Result: **8 passed, 0 failed**.

ZIP integrity is checked after packaging. Production build and browser visual verification were not run: `node_modules` is absent in this source bundle. These tests verify source/layout contracts, not actual pixel-level behavior in a running browser. The final acceptance criterion therefore remains partially verified until a browser run at full-screen and half-screen widths is performed.

Package version remains `1.10.86`.

## Suggested Git commit

```text
fix(workbench): retain palette and inspector in wide desktop layout
```
