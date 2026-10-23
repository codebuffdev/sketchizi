# Phase 28 — Browser-Based Staging Acceptance

## Purpose

Exercise the deployed Sketchizi UI in Chromium after the lightweight HTTP and asset verification has passed. This workflow is manually triggered so a reviewer chooses the exact staging or preview URL.

## Coverage

- Creates a configured AWS architecture from the creation flow and verifies the editor mounts.
- Verifies the File application menu is available from the editor.
- Exercises the independent blank-canvas journey.
- Checks the creation screen at a 390px viewport for horizontal overflow.
- Fails on page exceptions, console errors, or failed same-origin requests.
- Captures a screenshot on failure when the browser has a page available.

## Run locally

Install dependencies and browser tooling first:

```bash
npm ci
npm install --no-save --no-package-lock playwright
npx playwright install chromium
SKETCHIZI_BASE_URL=https://your-staging-host.example node scripts/browser-acceptance.mjs
```

The script never embeds credentials in the URL and accepts only HTTP(S). Prefer HTTPS. The workflow does not sign in, write shared review data, or alter production records; use a dedicated staging deployment.

## GitHub Actions

Run **Sketchizi Staging Deployment Verification** with the staging URL. The workflow first checks the document and same-origin assets, installs temporary Playwright tooling, then runs the browser acceptance journey. A failing screenshot is retained as an artifact for seven days when available.

## Limits

This is a browser smoke/acceptance pass, not a complete end-to-end test of saving files, Supabase authorization, realtime synchronization, or every review workflow. It does not promote or deploy the application. Browser checks are considered verified only after the workflow completes successfully against a real staging URL.
