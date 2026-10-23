# Phase 5L — Remote Production Build Verification

## Goal

Provide a reproducible build gate that can run in a clean environment with normal npm registry access. The local execution environment has repeatedly timed out while resolving `registry.npmjs.org` (`EAI_AGAIN`), preventing a complete `npm ci`; this does not establish a source compilation failure.

## Workflow

`.github/workflows/production-build.yml` runs on pushes, pull requests, and manual dispatch. It uses Node.js 20 and the committed lockfile, then:

1. Installs dependencies with `npm ci --no-audit --no-fund`.
2. Checks package-lock consistency.
3. Verifies the HTML entry page, Vite executable, and pinned Excalidraw font assets.
4. Runs `npm run test:all`.
5. Runs `npm run build`.
6. Uploads `dist/` as the `sketchizi-dist` artifact only if the build succeeded.

The workflow uses read-only repository permissions and does not deploy to Cloudflare or any other hosting provider.

## Local verification in this environment

- `npm run test:all`: passed (373 tests before this phase's five workflow-contract tests were added).
- `npm ci --no-audit --no-fund`: timed out due to repeated npm registry DNS failures (`EAI_AGAIN`).
- Production build: not run successfully; the Vite executable is unavailable after the incomplete install.
- The new workflow contract tests validate the workflow definition, not a live GitHub Actions run.

## Next action

Push this phase to a GitHub repository and inspect the **Sketchizi Production Verification** workflow. A successful run is the first authoritative clean-install and production-build result. If it fails after dependency installation, use the actual failing build log to fix source code; do not guess at build fixes while the install gate is blocked.
