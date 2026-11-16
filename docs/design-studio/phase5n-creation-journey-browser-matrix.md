# Phase 5N — Creation Journey Browser Matrix

## Scope

Extends the production Chromium smoke gate beyond a single happy path. No application dependencies or diagram-generation behavior are changed in this phase.

## Browser scenarios

1. Open Design Studio, select the Three-Tier AWS template, configure name/region/environment, and open the editor.
2. Use a fresh browser context to start from a blank canvas and open the editor.
3. Open Design Studio at 390 × 844 and assert that the creation screen has no horizontal document overflow.
4. Fail the smoke run if uncaught browser page exceptions occur.

## Run

The GitHub Actions production verification workflow runs the smoke script after `npm ci`, the full test suite, and a successful production build. Locally, with dependencies and Playwright available:

```sh
npm run test:browser-smoke-contract
npm run test:all
npm run build
node scripts/browser-smoke.mjs
```

## Verification status

Contract tests verify that all scenarios are included in the workflow script. Actual Chromium execution still requires a successful dependency install and production build; do not treat contract tests as a substitute for a successful CI run.
