# Design Studio — End-to-End Template Creation

## Scope

This milestone tightens the creation flow from template selection through editor handoff and saved document metadata. It preserves the existing Excalidraw scene model and the established Design Studio creation screen. Workbench is not reintroduced.

## User flow

1. Open Design Studio from the existing Sketchizi editor entry point.
2. Search or filter the template catalog and select a starter, or choose **Start blank**.
3. Optionally enable **Configure first**.
4. Configure the design name and validation mode. AWS templates additionally accept a planning region and environment; the system architecture starter can optionally include a cache.
5. Choose **Use template**. The app confirms before replacing a non-empty canvas, creates the scene and design profile, updates the editor, fits the scene to the viewport, and queues a local save.
6. Reload or reopen the saved `.sketchizi` file; the profile metadata and scene round-trip through the existing file format.

## AWS configuration semantics

Region and environment are stored as design-planning metadata in the namespaced design profile. They do not create AWS resources, validate AWS credentials, or deploy infrastructure. The AWS starter scenes remain normal editable Excalidraw elements with bound arrows.

## Verification

- `npm run test:design-studio-creation`
- `npm run test:package-lock-consistency`
- `npm run test:all`
- `npm run build`

A successful test run does not substitute for a browser smoke test. The production build is blocked in environments where the pinned Excalidraw font package assets are unavailable in `node_modules`; run `npm ci` in an environment with registry access, then run `npm run build` before release.
