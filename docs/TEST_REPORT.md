# Sketchizi 1.10.38 Phase 1 — verification report

Date: 2026-10-10

## Passed

- `npm run test:auth`: 7/7 passed. Covers auth API cache bypass, absence of browser credential storage, fixed upstream origin, method/body/CSRF forwarding, response status/cookie/no-store behavior, OAuth callback mapping, and same-origin authorization redirect mapping.
- `npm run test:networking`: 4/4 passed.
- `npm run test:catalog`: 3/3 passed.
- `npm run test:chat`: 10/10 passed.
- `npm run test:sync`: 22/22 passed.
- `npm run test:ui-defaults`: 6/6 passed.
- JavaScript syntax checks for `functions/api/auth/[[path]].js` and `vite.config.js` passed with `node --check`.

Total executed Node tests: 52 passed, 0 failed.

## Blocked / not verified

- Frontend production build: not run successfully. `vite` was absent because dependencies were not installed. `npm ci` did not complete in this environment (timed out), so JSX bundling and Vite CSS processing remain unverified here.
- Spring Boot build and JUnit tests: not run because Maven is not installed in the execution environment. Java 21 is present, but the project targets Java 17 and backend compilation has not been independently confirmed.
- Live Google OAuth: not tested; no client credentials were provided.
- Neon schema/session persistence, Render health check, Cloudflare deployment/gateway behavior, production cookie attributes, and browser-level sign-in/sign-out: not tested because no external services or credentials were configured.
- Visual/responsive browser QA: not run.

## Manual verification required before production use

1. Run `npm ci && npm run build` in a network-enabled environment.
2. Run `mvn test` from `auth-service` with Java 17+ and dependency access.
3. Configure Google, Neon, Render, and Pages environment variables using `docs/GOOGLE_AUTH_SETUP.md`.
4. Test fresh sign-in, refresh restoration, denied consent, callback state mismatch, CSRF rejection, logout invalidation, and sign-in return paths in a real browser.
5. Confirm the browser's `SESSION` cookie is host-only, HttpOnly, Secure, SameSite=Lax in production and that no `/api/auth/*` response appears in Cache Storage.

The code has not been deployed, and live Google login is not claimed as working until those manual integration checks pass.
