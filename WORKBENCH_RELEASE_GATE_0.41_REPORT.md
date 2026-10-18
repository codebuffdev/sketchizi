# Sketchizi Workbench 0.41 — Package-lock consistency preflight

## Purpose

The prior release run failed before dependency installation could finish. The captured npm debug log shows repeated `EAI_AGAIN` failures for requests to `registry.npmjs.org`, while npm exited with `Exit handler never called!`. That evidence points to a registry DNS/network failure in the test environment; it does not demonstrate an application source-code failure.

Workbench 0.41 adds a dependency-free check to answer a separate question before network access: do `package.json` and the root/direct-dependency metadata in `package-lock.json` agree?

## Changes

- Added `scripts/check-package-lock-consistency.mjs`.
- Added six offline tests in `tests/package-lock-consistency.test.mjs` for the current manifest, root metadata drift, direct spec drift, missing direct package entry, missing lock root and unsupported lockfile version.
- Added npm scripts `check:package-lock-consistency` and `test:package-lock-consistency`.
- Runs the lockfile check and its unit tests before registry diagnostics and `npm ci`, both in the local release runner and GitHub Actions.
- Includes both stages in the shared Markdown/JSON summary and diagnostic logs.
- Updated the next-step note, which previously referred to milestone 0.32.

## Results in this environment

- Package/lockfile preflight: **PASS, 19/19 checks**.
- Focused tests covering lockfile checker, CI summary, workflow contract, and local release runner: **31/31 passed**.
- `package.json` vs `package-lock.json`: direct dependency specifications match; all six direct dependencies have lockfile entries.
- The last full install attempt failed with registry DNS errors. Therefore `npm ci`, actual installed Excalidraw font assets, production build and rendered Chromium smoke remain **unverified**.

## Limitations

This is a static package metadata check. It does not prove that every locked version satisfies every semver range, download packages, validate the full dependency graph as npm does, or replace `npm ci`.

## Next action

Run `npm run verify:workbench-release` in a machine with npm registry connectivity. The expected order now checks manifest/lockfile consistency before attempting network access. If `npm ci` passes, continue to the actual font, build, regression and browser stages. Do not treat this preflight as a successful release gate.

Application package version remains `1.10.86`; `0.41` is a Workbench milestone label.
