# Phase 5I — Entry Page Recovery and Build Readiness

## Scope

Restore the Sketchizi HTML entry point and verify the existing Excalidraw self-hosted font setup without changing editor behavior or reintroducing Workbench.

## Changes

- Restored `index.html` from the known Sketchizi 1.10.86 baseline after discovering the file in the previous workspace was zero bytes.
- Preserved the `window.EXCALIDRAW_ASSET_PATH = "/"` assignment before `/src/main.jsx` loads, allowing Excalidraw to resolve self-hosted font assets from the site root.
- Preserved the existing metadata, canonical URL, social metadata, manifest, favicon, and app root markup from the baseline entry page.

## Verification

- Focused font/font-family/preflight tests: **19/19 passed**.
- Package-lock consistency: **19/19 checks passed**.
- Full automated suite (`npm run test:all`): **365/365 passed**.
- Production build: **blocked / not verified**. `npm ci` did not complete within the available 120-second window. The partial `node_modules` directory does not contain a usable Vite executable or the expected Excalidraw `dist/prod/fonts` directory, so the prebuild correctly stopped before Vite could run.

## Manual verification still required

After a complete `npm ci` in a network-enabled environment:

1. Run `npm run check:excalidraw-font-assets`.
2. Run `npm run build` and confirm `dist/index.html` is generated with the app entry script.
3. Preview the build and verify Excalifont, Nunito, Lilita One, and Comic Shanns render correctly.
4. Open the AWS architecture creation flow and confirm existing editor, templates, review dashboard, and Day/Night behavior remain unchanged.

## Result

The regression that caused the font asset path test to fail is fixed at its source: the HTML entry file is restored. Automated source and behavior-contract tests are green, but this phase must not be described as production-build verified until dependency installation and the build succeed.
