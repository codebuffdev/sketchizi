# Sketchizi AI Ask — frontend integration and deployment

This document applies to the existing Sketchizi 1.10.38 frontend. The AI service is a separate project in the independent `sketchizi-ai-service.zip`; it is not deployed as part of this frontend or the existing authentication service.

## Architecture and trust boundary

- Browser / React + Excalidraw: displays AI Ask and builds a fresh allow-listed JSON diagram snapshot at send time.
- Existing auth service: owns Google OIDC login, user identity, the `SESSION` cookie, and logout. No second OAuth flow was added to the AI service.
- Cloudflare Pages Function `/api/ai/*`: validates same-origin + CSRF on mutations, sends only the `SESSION` cookie to the configured auth service's `/api/auth/me` introspection endpoint, then signs a 60-second HMAC-SHA256 identity assertion. It removes browser cookies, authorization headers, and client-supplied identity headers before forwarding to the AI service.
- Independent Spring Boot AI service: verifies the assertion signature/audience/expiry, consumes its unique `jti` in PostgreSQL to prevent replay, authorizes the trusted OIDC subject, and owns usage/request metadata.
- Existing Node collaboration service and diagram persistence are not part of the AI service and are not changed for AI context.

The HMAC secret is shared only between the Cloudflare Pages Function environment and the AI Render service. Generate a new secret with `openssl rand -hex 32`, then copy the exact output into both server-side environments. Do not place it in a `VITE_` variable, client JavaScript, a URL, repository, or log.

## Cloudflare Pages environment variables

Set these in the Cloudflare Pages project's server-side environment variables for **both production and preview only if you intentionally enable the feature in preview**:

| Variable | Value |
|---|---|
| `AUTH_SERVICE_ORIGIN` | Base origin of the already-deployed auth Render service, e.g. `https://YOUR-AUTH-SERVICE.onrender.com` (no path/query) |
| `AI_SERVICE_ORIGIN` | Base origin of the new AI Render service, e.g. `https://YOUR-AI-SERVICE.onrender.com` (no path/query) |
| `AI_IDENTITY_HMAC_SECRET` | Exact same random secret configured on the AI service, at least 32 UTF-8 bytes |
| `PUBLIC_FRONTEND_ORIGIN` | `https://sketchizi.pages.dev` for production |

No changes to the existing auth Render deployment or Google OAuth client configuration are required for this integration because the gateway introspects the existing `/api/auth/me` endpoint. The AI service never receives the browser's session cookie.

The Vite local Pages-Functions middleware accepts the same environment variable names. For local auth and AI development, set `AUTH_SERVICE_ORIGIN`, `AI_SERVICE_ORIGIN`, `AI_IDENTITY_HMAC_SECRET`, and `PUBLIC_FRONTEND_ORIGIN=http://localhost:5173` in the local process environment. The AI service must also be running at `localhost:8090`, and the existing auth service at `localhost:8080` unless those URLs are changed.

## Deploy the independent AI service

1. Create a separate repository from the contents of `sketchizi-ai-service.zip` (the project root contains `pom.xml` and `Dockerfile`).
2. Provision Neon PostgreSQL. Copy the JDBC URL with `sslmode=require` and set the database user/password separately in Render. Flyway runs `src/main/resources/db/migration/V1__ai_usage.sql` on startup.
3. Create an independent Render Web Service from the AI repository. The included `render.yaml` and Dockerfile use Java 17 and the container health path `/actuator/health`.
4. Configure `DATABASE_URL`, `DATABASE_USERNAME`, `DATABASE_PASSWORD`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `GEMINI_MAX_OUTPUT_TOKENS`, and `AI_IDENTITY_HMAC_SECRET`. Use the same identity secret value as Cloudflare. `GEMINI_API_KEY` must be a Google AI Studio key for Built-in Gemini; keep it server-side only.
5. Set `GEMINI_MODEL=gemini-2.5-flash` initially, or select a model verified for the Google GenAI API. Built-in Gemini keys are never sent to the browser. BYOK calls use a per-request `x-goog-api-key` header and do not mutate a shared credential-bearing client.
6. Wait for a successful deployment and verify `https://YOUR-AI-SERVICE.onrender.com/actuator/health` reports `UP`. The endpoint intentionally provides no database or credential detail.
7. Set the Cloudflare environment variables above and redeploy Pages so its Functions receive the current values.
8. Verify an anonymous browser can draw and collaborate normally, AI Ask asks the user to sign in, and the existing Google login returns to the same location with AI Ask open. Then test a signed-in Built-in question and a BYOK question.

Do not expose `/api/v1/ai/*` directly to browser code. Production browser requests go through same-origin `/api/ai/*`. The Render service uses signed assertions rather than browser cookies or unauthenticated `X-User-Id` headers.

## API routing

The frontend calls these same-origin paths:

| Browser path | Method | AI service route |
|---|---|---|
| `/api/ai/health` | GET | `/actuator/health` |
| `/api/ai/conversations` | POST | `/api/v1/ai/conversations` |
| `/api/ai/chat` | POST | `/api/v1/ai/chat` |
| `/api/ai/usage?conversationId=<uuid>` | GET | `/api/v1/ai/usage` |
| `/api/ai/requests/<uuid>` | GET | `/api/v1/ai/requests/<uuid>` |

For JSON `POST` requests, the frontend obtains a CSRF token from the existing `/api/auth/csrf` endpoint and sends it with the `XSRF-TOKEN` cookie. The AI gateway rejects missing/wrong origin, mismatched CSRF, non-JSON mutations, excessive body size, missing authentication, and untrusted client identity headers. AI responses are always marked `no-store` and the service worker bypasses `/api/ai/*`.

## AI Ask behavior and limits

- Normal drawing, saving, and collaboration remain usable when logged out. AI Ask requires the existing Google sign-in in either provider mode.
- Every submitted question takes a new complete current-canvas snapshot, limited to 1,500 live elements and 180,000 serialized context characters. It does not screenshot the canvas or modify it. Oversized diagrams produce a clear error rather than partial analysis.
- Built-in mode reserves quota atomically before generation. Limits are 5 successful Built-in questions per conversation and 10 successful Built-in questions per account in a rolling 12-hour window. Pending requests reserve slots temporarily; failed generations release them. A database success record is required before an answer is returned.
- BYOK requires sign-in but is exempt from Sketchizi's Built-in quotas. The key is kept only in the current browser tab's `sessionStorage`, sent over HTTPS only for a BYOK request, never written to Neon/session storage/files/logs, and cleared on logout or explicit removal. `sessionStorage` is not a secure vault against same-origin script compromise.
- The active transcript and draft live in tab-scoped `sessionStorage`; the backend stores no prompts, transcript, response text, diagram JSON, or BYOK keys.
- Database rows keep request IDs/status and successful completion timestamps because they support idempotency, rolling quota accounting, and the conversation lifetime limit. Expired identity assertions and old rate-limit windows are cleaned automatically. Stale pending reservations are marked failed without consuming successful-question quota. Do not delete `ai_requests` history without first replacing its role in idempotency and all-time conversation quota accounting.
- Request IDs are unique per logical send. A transport retry reuses the same ID; deliberate regeneration creates a new ID. The service avoids claiming exactly-once provider execution across a process crash. If a generation succeeded but its short-lived in-memory answer cache was lost on a restart, status/usage may confirm success without recovering the answer; a new deliberate retry is a new request and could consume another allowance if successful.

## Local development and validation

Frontend (from the Sketchizi project root):

```bash
npm ci
npm run dev
npm run test:ai
npm run test:auth
npm run build
```

Backend (from the independent AI service root; unit tests use deterministic mocks. Starting the service requires a reachable Neon/PostgreSQL database for Flyway and usage metadata):

```bash
cp .env.example .env
# Set actual values in your shell/development environment; do not commit .env.
mvn test
mvn spring-boot:run
```

Backend endpoints require a valid gateway-signed identity assertion on every `/api/v1/ai/*` request; direct browser testing without the Cloudflare/Vite gateway should receive a controlled 401. The project includes unit tests for diagram validation, identity assertions, successful-usage commit ordering, provider-failure reservation release, duplicate-request handling, and BYOK usage separation. Database-backed quota races and live Gemini/BYOK calls still need validation against the deployed database/provider. Never use a real production API key in test logs or committed fixtures.

## AI Ask request lifecycle troubleshooting

The frontend keeps a stable request ID for a logical generation. Transport retries and recovery after an ambiguous response reuse that ID. An explicit retry after a confirmed failure creates a new generation ID; an explicit new attempt after an uncertain outcome also gets a new ID and warns that the provider may be called again. A missing status record alone does not prove that the original POST never reached the service. Do not automatically resubmit with a new ID when the outcome is unknown.

The AI service logs request IDs and provider mode only (never prompts, responses, diagram data, keys, cookies, account IDs, or identity assertions). For a failing request, locate the relevant `requestId` in Render logs and inspect these events in order:

- `AI chat request received`: the request reached the AI controller and passed the earlier gateway/security checks.
- `AI request reserved`: the database reservation was committed; a following provider-start event means the provider call began.
- `AI provider request failed`: generation returned a controlled provider error and the service attempted to mark the reservation failed.
- `AI request completed successfully`: the successful usage record was committed and the answer was placed in the short-lived process-local result cache.
- `AI request is durably successful but its answer is not retained in this process`: usage was already recorded, but this service instance cannot return the cached answer. The UI must not regenerate automatically.

If `AI chat request received` appears without `AI request reserved`, inspect the structured API error code and database logs: failure may have occurred during reservation before generation. If `AI request reserved` and provider-start appear without a terminal event, correlate the instance's restart/timeout logs; the final provider outcome may be unknown. If a success event exists but the browser saw an upstream error, status lookup should be tried with the original request ID. A successful DB status with no cached answer is explicitly reported as an unavailable-result case because storing answers durably is outside this privacy boundary.

Usage loading has a 15-second client timeout and an explicit Retry usage control. It is independent of chat-request state. Usage errors do not weaken server-side quota enforcement; Neon and the AI service remain authoritative.
