# Sketchizi 1.10.77 — Excalidraw font asset loading fix

## Root-cause finding

The project used Excalidraw's native font picker and its supported `fontFamily` identifiers, but did not explicitly provision the font files from the exact installed Excalidraw package. It relied on the upstream font CDN at runtime. That makes the picker UI able to present and select a family while the runtime font file needed to draw the typeface may be unresolved or unavailable for the bundled package revision.

## Changes

- Set `window.EXCALIDRAW_ASSET_PATH` to `/` before the application module initializes.
- Added `scripts/copy-excalidraw-fonts.mjs`, which copies the font assets from the installed, lockfile-pinned `@excalidraw/excalidraw/dist/prod/fonts` into `public/fonts`.
- Added `predev` and `prebuild` steps so the assets are present in both local development and production builds, without introducing a second font registry or changing Excalidraw's family IDs.
- Bumped the service-worker application cache version to invalidate old cached app assets.
- Added tests for asset path ordering, build/development provisioning, font directory preservation, and missing-asset failures.

## Scope

No Excalidraw dependency upgrade, custom font picker, persistence rewrite, collaboration change, authentication change, or AI Ask change.

## Verification notes

The focused tests are expected to validate the font provisioning logic. Actual rendered-font and save/reload behavior still requires a production build and browser test in an environment where `npm ci` can fetch the project's dependencies.
