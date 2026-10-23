# Phase 26 — CI Build Verification

## Purpose

Make production verification less flaky and easier to diagnose before a commit reaches the hosting platform.

## Workflow behavior

The GitHub Actions workflow runs on pushes, pull requests, and manual dispatch. It installs from `package-lock.json`, checks build prerequisites, runs the full automated suite, builds the production bundle, installs temporary Playwright tooling, installs Chromium, starts the Vite preview, waits for the preview HTTP endpoint to respond, and runs the creation-journey browser smoke test.

The workflow writes a concise GitHub Actions job summary with the commit, ref, runtime versions, and run link. If the job fails after the preview is started, its log is uploaded as a diagnostic artifact. The production `dist/` artifact is uploaded only after the preceding steps succeed.

## Validation and limitations

Contract tests verify the workflow's order, readiness wait, read-only permissions, summary, and failure-log handling. These tests do not execute GitHub Actions. A successful hosted workflow run is still required to confirm the real dependency install, build, Chromium installation, and browser journey.

## Commands

```bash
npm run test:production-workflow
npm run test:all
npm run build
```
