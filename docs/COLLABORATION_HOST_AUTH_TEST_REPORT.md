# Collaboration Host Authentication — Test Report

Date: 2026-10-10

## Passed

- Node.js syntax checks: `src/features/collaboration/useCollaboration.js`, `src/collaboration.js`, `server/collaboration-server.mjs`, `server/hostAuthorization.mjs`, and `src/features/auth/authClient.js` passed `node --check`.
- Focused and regression Node tests: **46 passed, 0 failed** using:

  ```sh
  node --test tests/collaboration-host-auth.test.js tests/auth-gateway.test.js tests/auth-client.test.js tests/networking.test.js tests/architecture-catalog.test.js tests/chat-protocol.test.js tests/collaboration-sync-core.test.js tests/sync-diagnostics.test.js tests/ui-defaults.test.js
  ```

- Collaboration synchronization characterization tests: **11 passed, 0 failed** using:

  ```sh
  node --import ./tests/register-sync-test-loader.mjs --test tests/collaboration-sync-characterization.test.js
  ```

The focused host-auth tests cover signed token acceptance/rejection, token tampering, expiry, room binding, no-secret fail-closed behavior, server creation-boundary presence, host-vs-guest name fields, and same-origin CSRF-protected token acquisition.

## Not run / unverified

- `npm run build`: attempted but could not run because Vite was unavailable (`vite: not found`). `npm ci` did not complete in this execution environment, so the dependency tree was not usable.
- Spring Boot/Maven tests: not run because Maven (`mvn`) is not installed in this environment. New MockMvc tests were added for authenticated token issuance, unauthenticated rejection, and CSRF enforcement, but their results are unverified.
- Live WebSocket direct-bypass verification, live Google login, browser interaction, Render/Cloudflare deployment, and real reconnect behavior were not performed.

Do not treat these results as a production deployment verification. Configure the shared server-side `COLLAB_HOST_TOKEN_SECRET` before deploying; without it, hosting intentionally fails closed.
