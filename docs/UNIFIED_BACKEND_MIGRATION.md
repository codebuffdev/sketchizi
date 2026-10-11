# Unified backend deployment notes

The frontend remains on Cloudflare Pages. The auth and AI Cloudflare Pages Functions are unchanged; they continue to use the same-origin `/api/*` routes. Configure both server-side variables `AUTH_SERVICE_ORIGIN` and `AI_SERVICE_ORIGIN` to the same new unified Spring Boot service origin after the unified service passes smoke tests.

Keep `AI_IDENTITY_HMAC_SECRET` identical in Cloudflare Pages and the unified backend. Keep `COLLAB_HOST_TOKEN_SECRET` identical in the unified backend and the independently deployed Node.js collaboration service. Neither secret may use a `VITE_` prefix.

The unified backend carries forward the auth SQL initializer and the AI Flyway migration chain. Use the existing Neon database and do not reset, drop, or truncate schemas. Do not remove the existing auth/AI Render services until Google sign-in, sign-out, session/CSRF, AI Built-in Gemini, BYOK, quota accounting, authenticated host creation, and guest collaboration are verified against the new deployment.

See the separate unified-backend archive's `README.md` for backend environment variables, OAuth callback configuration, and rollout/rollback steps.
