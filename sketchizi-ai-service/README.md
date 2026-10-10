# Sketchizi AI Service

Standalone Spring Boot + Spring AI backend for Sketchizi AI Ask. It builds and deploys independently from the existing React frontend and existing Google authentication service. It does not contain OAuth login or session management.

## Technology

- Java 17
- Spring Boot 3.5.16
- Spring AI 1.1.8, Google GenAI starter
- Spring Web / Security / JDBC / Actuator
- PostgreSQL on Neon with Flyway-managed schema
- Docker and Render Web Service

The selected Spring AI module exposes the Google GenAI chat model via `spring.ai.google.genai.api-key` and `spring.ai.google.genai.chat.model`. Spring Boot 3.5.16 requires Java 17 or later; see the official version references in the deployment documentation.

## Security model

The already-deployed auth service remains authoritative for Google OIDC, sessions, and logout. The Cloudflare Pages Function receives the browser's same-origin `/api/ai/*` request, verifies its `SESSION` by calling the auth service's `/api/auth/me`, and issues an HS256 signed assertion valid for 60 seconds. The assertion carries the authenticated OIDC subject, the `sketchizi-ai` audience, timestamps, and a unique `jti`. This service verifies the signature and claims, then consumes the `jti` in PostgreSQL to prevent replay. It never trusts an arbitrary browser-supplied account ID and never accepts the browser's session cookie as its AI authentication mechanism.

The AI service requires `AI_IDENTITY_HMAC_SECRET` (32 or more UTF-8 bytes), and Cloudflare Pages must use the exact same secret. Use a cryptographically random value such as the output of `openssl rand -hex 32`. Do not expose this variable to browser JavaScript.

## Environment variables

Use `.env.example` as a placeholder-only inventory. Production variables are set in Render, not stored in the ZIP.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | Yes | JDBC URL, e.g. `jdbc:postgresql://HOST/DB?sslmode=require` |
| `DATABASE_USERNAME` | Yes | Neon database role |
| `DATABASE_PASSWORD` | Yes | Neon database password |
| `AI_IDENTITY_HMAC_SECRET` | Yes | Shared Cloudflare/AI identity assertion secret, 32+ UTF-8 bytes |
| `GEMINI_API_KEY` | For Built-in | Server-side Gemini Developer API key |
| `GEMINI_MODEL` | No | Model ID; default `gemini-2.5-flash` |
| `GEMINI_MAX_OUTPUT_TOKENS` | No | Maximum Built-in Gemini output tokens; default `2048` |
| `PORT` | No | Render port; default 8090 |
| `DB_POOL_SIZE` | No | Hikari maximum pool size; default 5 |
| `AI_MAX_REQUEST_BODY_BYTES` | No | Body size bound; default 921600 |
| `AI_MAX_DIAGRAM_ELEMENTS` | No | Normalized diagram element limit; default 1500 |
| `AI_MAX_DIAGRAM_CONTEXT_CHARS` | No | Context character limit; default 180000 |
| `AI_MAX_REQUESTS_PER_MINUTE` | No | Authenticated API rate limit; default 60 |
| `AI_MAX_SUBMISSIONS_PER_MINUTE` | No | New request quota attempt rate; default 10 |
| `AI_MAX_CONCURRENT_REQUESTS` | No | Concurrent pending request limit per account; default 2 |
| `AI_RESERVATION_LEASE_SECONDS` | No | Pending reservation lease; default 120 |
| `AI_CONVERSATION_QUESTION_LIMIT` | No | Successful Built-in questions per conversation; default 5 |
| `AI_ACCOUNT_QUESTION_LIMIT` | No | Successful Built-in questions per rolling window; default 10 |
| `AI_ACCOUNT_WINDOW_HOURS` | No | Rolling account usage window; default 12 |
| `AI_PROVIDER_TIMEOUT_SECONDS` | No | Provider timeout; default 45 |
| `AI_MAX_ANSWER_CHARS` | No | Maximum assistant answer length; default 16000 |

Neon connections must use TLS (`sslmode=require`). Only the metadata needed for usage accounting and request idempotency is stored. Full prompts, assistant responses, history transcripts, diagram snapshots, and BYOK keys are not stored in PostgreSQL. The request ledger retains metadata to preserve unique request IDs and lifetime conversation quotas; old rows should not be deleted without replacing those semantics.

## Local development

1. Install JDK 17 and Maven 3.6.3 or later.
2. Provision PostgreSQL/Neon and create a database role.
3. Export variables from `.env.example`. Do not commit a populated `.env` file.
4. Run `mvn test` then `mvn spring-boot:run`.
5. Run Sketchizi with its Pages Functions development middleware and configure `AI_SERVICE_ORIGIN=http://localhost:8090`, `AUTH_SERVICE_ORIGIN=http://localhost:8080`, `PUBLIC_FRONTEND_ORIGIN=http://localhost:5173`, and the shared identity secret.
6. Open AI Ask in the app and sign in with the existing Google flow. Direct requests to protected `/api/v1/ai/*` without a valid signed assertion should return 401.

Flyway applies `V1__ai_usage.sql`, `V2__ensure_identity_assertion_store.sql`, `V3__qualify_identity_assertion_store.sql`, and `V4__repair_rate_limit_table_schema.sql` at application startup in the dedicated PostgreSQL schema `sketchizi_ai`. V2 is an idempotent repair for the one-time assertion replay table/index; V3 explicitly ensures that replay store exists in `sketchizi_ai`. V4 repairs a confirmed legacy schema mismatch: when `public.ai_rate_limits` exists, it copies its `(account_id, window_start, request_count)` rows into `sketchizi_ai.ai_rate_limits`, merging conflicts with the greater counter to avoid weakening the rate limit. It does not alter or delete the `public` table. Application SQL schema-qualifies AI tables rather than relying on a session-level `SET search_path`, which is not reliable with transaction-pooled PostgreSQL connections such as Neon pooled URLs. This avoids enabling `baselineOnMigrate`, which could mark version 1 as already applied and skip the AI table migration. The configured Neon database role must be allowed to create schemas and tables and read the legacy `public.ai_rate_limits` table (or an administrator must run the equivalent migration with those permissions). To verify the deployed tables directly in Neon, run `SELECT to_regclass('sketchizi_ai.ai_identity_assertions'), to_regclass('sketchizi_ai.ai_rate_limits');` and confirm both return their schema-qualified names. `/actuator/health` is the health/readiness path, and deliberately exposes no credential or database detail. The AI service has no public auth login endpoint.

## API contract

All protected API routes are under `/api/v1/ai` and require a valid `X-Sketchizi-Identity` assertion from the trusted gateway:

- `POST /conversations` → `{ "conversationId": "uuid" }`
- `POST /chat` → completed `{ "requestId": "uuid", "status": "succeeded", "answer": "...", "usage": { ... } }`, or HTTP 202 `{ "requestId": "uuid", "status": "processing" }`
- `GET /usage?conversationId=<uuid>` → conversation/account remaining counts and `nextAvailableAt`
- `GET /requests/<uuid>` → request status; assistant text is only available in the process-local retry cache
- `GET /actuator/health` → health status

A chat request contains `conversationId`, `requestId`, `provider` (`builtin` or `byok`), `question`, `diagramContext`, and bounded recent `history`. BYOK additionally contains `apiKey` only in that HTTPS request. The API does not accept a user ID from the browser.

## Quotas and idempotency

The quota repository serializes account and conversation reservations in PostgreSQL before the provider call. It counts successful Built-in requests and active reservations for both the per-conversation and rolling account limits. It releases failed/expired reservations without charging successful-question allowance. The database transaction is not held open over Gemini. On success, the request's completion timestamp is committed before an answer is returned. Unique request IDs and status rows prevent a duplicate request from initiating another generation. Automatic network retries must reuse the same ID; deliberate regeneration must use a new ID.

The model's answer is retained only in a bounded, short-lived in-memory response cache so database storage does not contain responses. If a process crashes after persisting success but before the caller receives the answer, usage remains correct; a later request-status check may identify the success but cannot reconstruct an answer not persisted. The service does not claim exactly-once execution across arbitrary provider/network/process failures.

## Deploy on Render

1. Place this directory's contents at the root of a dedicated repository.
2. Create a Neon database and save JDBC URL, user, and password in Render environment settings. Keep `sslmode=require` on the connection URL.
3. Create a Render Web Service using Docker or apply `render.yaml`. The Dockerfile builds the JAR in a Java 17/Maven image and runs a non-root Java 17 runtime image.
4. Set required values listed above. For Built-in Gemini, set `GEMINI_API_KEY`; keep it private. Generate `AI_IDENTITY_HMAC_SECRET` and set the exact same value in the Cloudflare Pages project.
5. Deploy. Verify `/actuator/health` returns `UP`.
6. In Cloudflare Pages, set `AUTH_SERVICE_ORIGIN`, `AI_SERVICE_ORIGIN`, `AI_IDENTITY_HMAC_SECRET`, and `PUBLIC_FRONTEND_ORIGIN`. Do not add a `VITE_` prefix to secrets or server-side gateway variables.
7. Redeploy Pages, sign in, then exercise both providers. Confirm that Built-in usage decrements only after successful generations and BYOK does not consume the Built-in allowance.

## Testing and limitations

Run `mvn test` and `mvn package` in a Java 17/Maven environment with dependencies available. Unit tests cover normalized diagram validation and signed-assertion expiry/audience/replay behavior. The current project does not include live credentials, and mocked/unit tests do not prove that the deployed Gemini key, Render networking, or Neon quota contention works in production. Perform the deployment verification above before describing the complete flow as production verified.
