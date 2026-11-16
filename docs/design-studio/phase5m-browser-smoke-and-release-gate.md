# Phase 5M — Browser Smoke and Release Gate

## Scope

This phase extends the existing production-verification workflow with a Chromium smoke test for the Design Studio creation journey. It does not change the template catalog, scene generation, persistence format, collaboration protocol, or editor behavior.

## Browser journey exercised in CI

1. Load the production Vite preview.
2. Open Create Design.
3. Select the AWS architecture category and Three-Tier AWS Web Application.
4. Enable Configure first and set a design name, AWS region, and environment.
5. Use the template and verify the creation screen closes and Excalidraw appears.
6. Fail on uncaught browser page errors.

Playwright and Chromium are installed temporarily in the CI job after the locked application dependencies and production build. They are not added to the application's package dependencies or lockfile.

## Verification in this workspace

- `npm run test:all`: passed (384 tests).
- `npm run test:browser-smoke-contract`: passed (2 tests).
- `npm run check:package-lock-consistency`: passed (19 checks).
- `npm ci --no-audit --no-fund`: timed out in this execution environment.
- `npm run build`: not run successfully because dependency installation did not complete and Vite/font assets are unavailable.
- Chromium browser journey: not run locally; it is wired into the GitHub Actions workflow and requires that workflow to execute.

## Release gate

Do not consider the production build or browser journey passed until the GitHub Actions job has completed successfully. A source-level workflow contract test verifies that the smoke step is present, but is not a substitute for executing the browser test.
