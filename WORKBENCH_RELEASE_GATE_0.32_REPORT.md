# Sketchizi Workbench 0.32 — Clean CI Gate

## Purpose

The previous verification attempt was blocked by this environment's inability to complete `npm ci` from `registry.npmjs.org`. This milestone adds a clean GitHub Actions runner so the exact lockfile install, production build, and automated regression suites can run on a runner with registry access.

## Added

- `.github/workflows/workbench-release-gate.yml`
- Triggers on push, pull request, and manual workflow dispatch.
- Uses Ubuntu, Node.js 22, `npm ci --no-audit --no-fund`, then `npm run build`.
- Runs the existing core application and Workbench regression scripts after the build.
- Uploads the production `dist/` directory only when all preceding steps pass.
- Uses read-only repository permissions, a 30-minute job timeout, and cancels superseded runs for the same ref.

## What this changes

This adds an automated way to obtain a clean install/build/regression result independent of the local sandbox's network. It does not make the build pass by assertion, and no workflow result is claimed until the workflow actually runs in the target repository.

## Still not verified

- The workflow has not been executed from the user's repository in this session.
- Actual browser UI end-to-end flow. The workflow runs browser fixture/server tests but does not claim a real rendered-browser persistence smoke test.
- Generated OpenAPI validation by an OpenAPI validator and SQL validation against a PostgreSQL parser or test database. No standalone OpenAPI contract or SQL migration was found in this package to validate in this pass.
- k6/JMeter import adapters against representative real exports. Current coverage uses repository fixtures; real exported files were not provided.
- Production capacity certification. Simulated capacity remains assumption-dependent and must not be presented as a measured production limit.

## Next action

Commit and push this package to the target GitHub repository, then open the **Actions → Workbench release gate** run. Fix the first failing CI step rather than expanding feature scope. When CI passes, perform the separate rendered-browser test and feed representative k6/JMeter exports through the importers.

## Suggested Git commit

`ci(workbench): add clean install build and regression gate`

Application package version remains `1.10.86`; 0.32 is a Workbench engineering milestone, not an application release version.
