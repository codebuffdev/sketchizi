# Phase 27 — Deployment Verification and Release Promotion

## Purpose

Provide an explicit, repeatable check against a deployed staging or preview URL after the build pipeline has produced and deployed an artifact. This phase does not deploy or promote releases; it verifies the URL supplied by the operator.

## Checks

- The configured URL is absolute HTTP(S) and contains no embedded credentials.
- The root returns a successful response with an HTML content type.
- The HTML contains a document and the expected React `#root` mount point.
- The HTML references JavaScript and CSS bundles.
- Same-origin referenced JS/CSS assets return successful responses.
- The workflow is manually dispatched and has read-only repository permissions.

## Run locally

```bash
STAGING_BASE_URL=https://your-staging-host.example npm run check:deployed-staging
npm run test:deployment-verification
```

Or run the **Sketchizi Staging Deployment Verification** GitHub Actions workflow and provide the deployed preview URL. The workflow checks only the supplied URL; it does not deploy, promote, or mutate infrastructure.

## Limits

This is a deployment smoke check, not a full browser test, accessibility audit, security assessment, backend integration test, or proof that all application workflows work. It checks same-origin assets referenced directly in the root HTML. Use a protected staging environment and avoid URLs containing credentials or private tokens.

## Release promotion policy

Promote a release only after the production build workflow is green, this deployed smoke check passes against the candidate artifact, browser-level tests pass, and any required Supabase integration tests have been run against the target environment. Promotion remains an explicit operator action.
