# Render backend warm-up

Sketchizi 1.10.58 sends a best-effort `GET /api/ai/warmup` after the app mounts. The same readiness check is awaited before session checks, Google OAuth navigation, and AI API calls. Concurrent callers share a single readiness loop; transient startup/network failures are retried for up to 120 seconds, and successful readiness is cached in memory for 15 seconds.

The Cloudflare Pages AI Function maps `/api/ai/warmup` to the unified Spring Boot backend's public `GET /api/warmup` endpoint. That endpoint returns a no-store response and intentionally performs no database query, session creation, usage reservation, or Gemini call. It is not an uptime guarantee: Render may still spin down after its inactivity period.

Because authentication and AI now share one Render service, set both `AUTH_SERVICE_ORIGIN` and `AI_SERVICE_ORIGIN` in the Cloudflare Pages environment to the same unified backend origin. No new secret or database migration is required.
