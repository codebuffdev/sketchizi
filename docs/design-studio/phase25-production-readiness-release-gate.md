# Phase 25 — Production Readiness and Release Gate

This phase adds a repeatable release-readiness report for Sketchizi's architecture review collaboration work.

## Commands

- `npm run check:release-readiness` prints a Markdown summary and a machine-readable JSON report. It is diagnostic and does not fail just because external integration credentials are absent.
- `npm run check:release-readiness-strict` exits non-zero when the repository is not ready for release validation.
- `npm run test:release-readiness` tests the gate's ready and blocked paths.

## What the gate checks

- The Vite entry page, Vite executable, and pinned Excalidraw font assets required by the production build.
- Required shared-review SQL migrations and test/documentation artifacts.
- Presence (never the values) of environment variables required by the optional two-user Supabase integration test.
- Clear distinction between static readiness, a production build, browser smoke testing, and a live Supabase integration run.

## Release sequence

1. Run `npm ci` in an environment with npm registry access.
2. Run `npm run check:build-prerequisites`.
3. Run `npm run test:all`.
4. Run `npm run build` and retain the successful build log.
5. Configure integration credentials as protected environment secrets and run `npm run test:shared-review-integration`.
6. Test the deployed preview in a real browser, including two separate authenticated users, Realtime notifications, stale-save rejection, and reconnect behavior.

## Honest status semantics

A `ready-for-release-validation` report means static prerequisites, expected files, and supplied integration configuration are present. It does not certify the production build, external service permissions, browser behavior, or production readiness. The report always labels the build as `not-run` because it does not execute the build itself.
