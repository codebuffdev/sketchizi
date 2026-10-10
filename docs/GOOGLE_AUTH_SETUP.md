# Sketchizi Google Sign-In foundation (1.10.38 Phase 1)

This phase adds optional Google sign-in only. It does not add AI Ask, Spring AI, Gemini, quotas, diagram storage, or any changes to collaboration. The canvas remains usable when authentication is unavailable.

## Architecture and request flow

- React/Vite remains hosted at `https://sketchizi.pages.dev`.
- `functions/api/auth/[[path]].js` is a fixed-origin gateway. It only targets `AUTH_SERVICE_ORIGIN`; callers cannot choose an upstream URL. The existing Eraser catalog and icon functions are retained unchanged.
- A separate Spring Boot 3.4 / Java 17 service owns OAuth, OIDC validation, user records, CSRF, logout, and sessions.
- Spring Session JDBC persists server-side sessions in Neon PostgreSQL. The browser receives an HttpOnly `SESSION` cookie scoped to the Sketchizi origin by the gateway; no JWT or session ID is stored in Web Storage.
- The OAuth callback registered with Google is `https://sketchizi.pages.dev/api/auth/oauth2/callback/google`. The Pages gateway maps it to Spring Security's `/login/oauth2/code/google` route. The initial login route and authorization redirect are also gateway-routed so the browser remains on the same origin until Google redirects it.
- `returnTo` accepts only safe relative application paths. Absolute URLs, protocol-relative destinations, backslashes, and malformed values fall back to `/`.

## Public endpoints

| Public URL | Method | Behavior |
| --- | --- | --- |
| `/api/auth/me` | GET | `200` with `{ authenticated: true, user: { id, email, name, picture } }`, or `401` with `{ authenticated: false }` |
| `/api/auth/csrf` | GET | Returns the CSRF token and required header name; sets the CSRF cookie |
| `/api/auth/logout` | POST | Requires CSRF header, invalidates the server session, returns `204` |
| `/api/auth/login/google?returnTo=%2F` | GET | Starts Google OAuth; return destination must be a safe local path |
| `/api/auth/oauth2/authorization/google` | GET | Internal gateway route to Spring's authorization endpoint |
| `/api/auth/oauth2/callback/google` | GET | OAuth callback registered in Google Cloud Console |

The user record is keyed by Google's validated OIDC `sub` plus provider `google`. Email, display name, and profile image are stored as optional display/account metadata. The ID is never accepted from browser input.

## Environment variables

### Spring Boot service (Render)

Set these in the Render service's environment settings. Use secrets for credential values.

| Variable | Example / purpose |
| --- | --- |
| `PORT` | Render supplies this; application defaults to `8080` locally |
| `GOOGLE_CLIENT_ID` | Google OAuth web client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth web client secret |
| `PUBLIC_BASE_URL` | Legacy configuration; not used to construct OAuth callback URIs after the callback-origin fix |
| `FRONTEND_ORIGIN` | `https://sketchizi.pages.dev` in production; `http://localhost:5173` locally |
| `DATABASE_URL` | JDBC URL, e.g. `jdbc:postgresql://HOST/DB?sslmode=require` (replace placeholders with Neon details) |
| `DATABASE_USERNAME` | Neon database role/user |
| `DATABASE_PASSWORD` | Neon database password |
| `COOKIE_SECURE` | `true` in production; `false` only for local HTTP development |
| `DB_POOL_SIZE` | Optional, defaults to `5` |

Do not commit `.env` files or credentials. `DATABASE_URL` must be a JDBC URL, not the `postgresql://` URI copied without conversion. Include Neon SSL settings (`sslmode=require`).

### Cloudflare Pages

Set `AUTH_SERVICE_ORIGIN` to the origin only for your actual Render service, for example `https://YOUR-RENDER-SERVICE.onrender.com` (replace the placeholder; do not include `/api` or a trailing route). Configure it for both Production and Preview only if the matching backend environment is intended. The gateway returns a non-cacheable `503` if this variable is missing.

The frontend uses same-origin `/api/auth/*` URLs. No frontend OAuth secret or backend hostname is compiled into the Vite bundle.

## Google Cloud Console setup

1. Create/select a Google Cloud project and configure the OAuth consent screen. Keep requested scopes to `openid`, `profile`, and `email`.
2. Create an OAuth client ID of type **Web application**.
3. Add the production authorized redirect URI exactly as `https://sketchizi.pages.dev/api/auth/oauth2/callback/google`.
4. For local development, add `http://localhost:5173/api/auth/oauth2/callback/google` as a separate authorized redirect URI if testing localhost OAuth.
5. Copy the client ID and secret to the Render environment variables above. Do not put the secret in Cloudflare Pages or frontend code.
6. If the consent screen is in testing mode, add the Google accounts that will test the flow.

No Google credentials are included in this repository. Live sign-in is not verified until you configure and test your own OAuth client.

## Neon PostgreSQL setup

1. Create a Neon project and database, then copy its host, database name, role, and password.
2. Form `DATABASE_URL` as `jdbc:postgresql://<host>/<database>?sslmode=require` and set the username/password separately.
3. On startup, Spring Session JDBC initializes its session tables (`SPRING_SESSION` and `SPRING_SESSION_ATTRIBUTES`). `schema.sql` creates `sketchizi_users` if it does not already exist. The application has no schema for diagrams, chat, or AI usage.
4. For production, use a dedicated database role with access only to the database/schema needed by this service and retain Neon backups/branching according to your operational policy.

The configured startup schema initialization is convenient for this first phase. Before adopting stricter release governance, replace automatic initialization with versioned migrations and run them as a controlled deployment step.

## Render deployment

1. Create a new Web Service from the repository.
2. Set **Root Directory** to `auth-service` and select the **Docker** runtime (uses `auth-service/Dockerfile`).
3. Set the environment variables listed above. `FRONTEND_ORIGIN` must be the public Sketchizi origin because OAuth callback URIs are routed through the Pages gateway. `PUBLIC_BASE_URL` is not used to construct OAuth callback URIs.
4. Set health-check path to `/actuator/health`.
5. Deploy and confirm the health endpoint returns `UP`. Copy the real Render service origin into Cloudflare's `AUTH_SERVICE_ORIGIN`.
6. Do not expose database URLs, OAuth secrets, cookie values, OAuth codes, or session identifiers in logs.

## Cloudflare Pages deployment

1. Keep the existing Pages project and `functions/api/eraser-catalog.js` and `functions/api/eraser-icon.js` files.
2. Add `AUTH_SERVICE_ORIGIN` in Pages project settings. Redeploy so the function receives it.
3. In Google Cloud Console, register the Pages callback URL above. In Render, set `FRONTEND_ORIGIN=https://sketchizi.pages.dev`. Register `https://sketchizi.pages.dev/api/auth/oauth2/callback/google` with Google. The gateway forwards this path to `/login/oauth2/code/google`.
4. Deploy the frontend and test in a normal browser tab, not only a private window. Verify `SESSION` is HttpOnly, Secure, SameSite=Lax, host-only, and has no broad Domain attribute.
5. Authentication routes use `Cache-Control: no-store`; the service worker explicitly bypasses `/api/auth/*`. Existing Eraser handlers are retained. The development Vite middleware routes Eraser requests to their existing handlers and auth requests to the same gateway handler.

## Local development

1. Run PostgreSQL/Neon credentials and the auth service locally with `PUBLIC_BASE_URL=http://localhost:5173`, `FRONTEND_ORIGIN=http://localhost:5173`, and `COOKIE_SECURE=false`.
2. Start the backend from `auth-service` using `mvn spring-boot:run` after configuring its environment variables.
3. Start the frontend using `AUTH_SERVICE_ORIGIN=http://localhost:8080 npm run dev`.
4. If testing live Google OAuth locally, register `http://localhost:5173/api/auth/oauth2/callback/google` in Google Cloud Console. Otherwise, automated tests use local/fake responses and do not require Google credentials.

## Security and operational notes

- Session inactivity timeout is seven days. Session storage is server-side in PostgreSQL.
- `SESSION` is HttpOnly, production Secure, SameSite=Lax, path `/`, and has no Domain attribute. `XSRF-TOKEN` is readable by the frontend by design; it is a CSRF token, not an authentication credential.
- State-changing logout requests require the CSRF token returned by `/api/auth/csrf`.
- The callback and authorization request use Spring Security's OAuth state handling; the application does not accept a browser-supplied identity.
- API authentication failures are JSON/HTTP status responses, not HTML login pages. OAuth navigation is a separate explicit browser redirect.
- `/actuator/health` exposes only health status.
- Google, Render, Neon, and Cloudflare have not been configured or deployed by this code change.

## Verification status

Run from the repository root:

```sh
npm ci
npm run build
npm run test:auth
npm run test:networking
npm run test:catalog
npm run test:chat
npm run test:sync
npm run test:ui-defaults
```

Run backend tests from `auth-service`:

```sh
mvn test
```

The gateway tests mock the upstream and cover fixed-origin forwarding, POST body/method, CSRF header forwarding, non-caching, cookie forwarding, and callback path mapping. Java unit tests cover safe return destinations. These tests do not prove live Google login or deployed Neon/Render/Cloudflare behavior. The build/test report delivered with this archive records what was actually executable in the build environment.

## Collaboration host authorization

Hosting a collaboration now requires a server-issued, room-bound authorization token. The Spring Boot auth service signs the token only after validating the existing OIDC session; the Node.js collaboration server verifies its HMAC signature and expiry before creating a room. Guest joins to an existing room do not require this token.

Configure the same randomly generated secret in both services:

- Spring Boot Render service: `COLLAB_HOST_TOKEN_SECRET`
- Node.js collaboration server: `COLLAB_HOST_TOKEN_SECRET`

Use a cryptographically random value of at least 32 bytes. Generate one locally with `openssl rand -base64 48`, then set the same value independently in both service environments. Never add it to frontend/Vite/Cloudflare Pages variables or commit it to source control. The signed authorization expires after five minutes and is bound to the requested room ID. If this variable is missing or shorter than 32 bytes, the auth service will refuse to issue tokens and the collaboration server will fail closed for new room creation. Restart/redeploy both services after configuring it.

The browser obtains the token via CSRF-protected `POST /api/auth/collaboration-host-token` with `{ "roomId": "..." }`. The Node.js service does not attempt to read the host-only browser session cookie and does not trust browser-supplied authentication flags or host display names.
