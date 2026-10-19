# Sketchizi Workbench 0.38 — npm Registry Connectivity Diagnostic

## Objective

Distinguish a registry DNS/network problem from a missing package, lockfile issue, build failure, or application regression. This is diagnostic support for the existing release gate, not a substitute for a clean install.

## Changes

- Added `scripts/probe-npm-registry.mjs` and `npm run check:npm-registry`.
- The probe independently checks DNS for `registry.npmjs.org`, then requests metadata for the pinned `@excalidraw/excalidraw@0.18.0-c0ad61c` version.
- Reports structured DNS/HTTP errors and writes `artifacts/ci-logs/npm-registry-probe.json`.
- Added dependency-free tests covering success, DNS failure (`EAI_AGAIN`), HTTP failure, version mismatch, and request/network error handling.
- Added a non-blocking diagnostic step before `npm ci` so a probe failure does not conceal the actual install result.
- Extended the release summary to present registry-probe failure separately from the hard release verdict; `npm ci` remains authoritative.
- Extended workflow contract checks to ensure the diagnostic step runs before `npm ci`, logs are retained, and the summary consumes the corresponding step outcome.

## Local verification

- Full configured application + Workbench regression command set: **28/28 commands passed**.
- Registry probe unit tests: **5/5 passed**.
- Release summary tests: **7/7 passed**.
- Workflow contract tests: **8/8 passed**.
- `node --check` passed for the new probe, summary generator, and related tests.
- ZIP integrity checked after packaging.

## Observed environment limitation

A live execution of `npm run check:npm-registry` in this environment returned:

```text
npm registry connectivity probe: DNS-FAILED
DNS: failed
HTTP: not-attempted
DNS error: EAI_AGAIN: getaddrinfo EAI_AGAIN registry.npmjs.org
```

A direct `npm view` request also failed with `EAI_AGAIN`. Therefore `npm ci` did not complete here, and neither the production build nor the rendered Chromium test is claimed as passing. The diagnostic establishes that this runtime currently cannot resolve the npm registry; it does not establish that the package itself is broken.

The pinned Excalidraw version appears in the npm version history, and the official Excalidraw documentation describes `dist/prod/fonts` as the self-hosted font path:

- https://www.npmjs.com/package/@excalidraw/excalidraw?activeTab=versions
- https://docs.excalidraw.com/docs/@excalidraw/excalidraw/installation

## Still-open release gates

1. A real GitHub Actions run with a successful `npm ci`.
2. Production Vite build, including the font preflight and asset copy.
3. Rendered Chromium persistence smoke test.
4. Validation against representative real k6/JMeter files and external OpenAPI/SQL validation.

## Next action

Push this package and inspect **GitHub → Actions → Workbench release gate**. If the registry probe reports failure but `npm ci` passes, it remains only a transient diagnostic warning. If both fail, use `npm-registry-probe.json` and `npm-ci.log` to distinguish DNS from npm dependency resolution. Fix the earliest actual failing gate before changing application code.

## Suggested Git commit

`ci(workbench): diagnose npm registry connectivity before clean install`

## Versioning note

`0.38` is the Workbench milestone label. The application's existing `package.json` version remains `1.10.86`.
