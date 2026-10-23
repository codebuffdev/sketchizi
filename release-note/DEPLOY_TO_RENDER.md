# Deploy Sketchizi Auth to Render with Docker

This repository includes a Render Blueprint (`render.yaml`) and a multi-stage Dockerfile at `auth-service/Dockerfile`. Render builds the Docker image from the repository when you deploy; you do not need to build or push an image to Docker Hub manually.

## Important safety checks before deployment

- The Blueprint sets `SPRING_PROFILES_ACTIVE=prod`. Do not set it to `dev` on Render. `DevDatabaseReset` is active only in the `dev` profile and deletes authentication users/sessions at startup.
- Use a database dedicated to production. Do not point this service at the development database while the dev reset is enabled locally.
- Rotate any database or Google OAuth credentials previously exposed in local files/messages. Do not commit secrets.
- Docker builds use `auth-service/.dockerignore` to exclude `.idea`, `target`, `.env` and log files. Never remove these exclusions for a deployment build.

## Deploy through Render Blueprint

1. Commit and push the repository to GitHub/GitLab.
2. In Render, choose **New → Blueprint** and connect the repository containing `render.yaml`.
3. Review the service. The Blueprint sets the root directory to `auth-service`, uses its `Dockerfile`, and configures `/actuator/health` as the health-check path.
4. Render will request the environment variables marked `sync: false`. Enter the values listed below in the Render dashboard.
5. Select a Render region close to the production database region where possible. Your current Neon hostname is in AWS `us-east-2`; a US East Render region generally minimizes cross-region latency.
6. Deploy and wait for `/actuator/health` to return a `2xx` response.

You can also create a **Web Service** manually from the same monorepo with runtime **Docker**, Root Directory `auth-service`, Dockerfile Path `Dockerfile`, Docker Context `.`, and Health Check Path `/actuator/health`.

## Render backend environment variables

Set these in the Render service's Environment page. Never commit actual values.

| Variable | Production value |
| --- | --- |
| `SPRING_PROFILES_ACTIVE` | `prod` |
| `COOKIE_SECURE` | `true` |
| `PUBLIC_BASE_URL` | `https://sketchizi.pages.dev` |
| `FRONTEND_ORIGIN` | `https://sketchizi.pages.dev` |
| `DATABASE_URL` | Full JDBC URL from your production PostgreSQL provider; use its supported pooled endpoint if appropriate |
| `DATABASE_USERNAME` | Database role username |
| `DATABASE_PASSWORD` | Database role password |
| `GOOGLE_CLIENT_ID` | Google OAuth Web client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth client secret |
| `DB_POOL_SIZE` | `5` (adjust to database/service plan limits) |

Render supplies `PORT` automatically. The application listens on `${PORT:8080}` and binds to `0.0.0.0`.

### Why `PUBLIC_BASE_URL` is the frontend URL

The production OAuth callback is routed through the same-origin Cloudflare Pages gateway: `https://sketchizi.pages.dev/api/auth/oauth2/callback/google`. Therefore `PUBLIC_BASE_URL` and `FRONTEND_ORIGIN` are the public Sketchizi frontend origin, not the Render backend URL. Keep the exact callback URL registered in Google Cloud's **Authorized redirect URIs**.

## Update Cloudflare Pages

In the Sketchizi Pages project's environment variables, set `AUTH_SERVICE_ORIGIN` to the actual deployed backend URL from Render, for example `https://sketchizi-auth.onrender.com`. Use the exact URL shown in your Render dashboard, then redeploy Pages so its Functions use that value. Do not put database credentials or the Google client secret in the frontend environment.

## Post-deploy verification

1. Open `https://<your-render-service>.onrender.com/actuator/health`; expect `{"status":"UP"}` when the service and database are healthy.
2. Check Render logs for successful startup and database initialization. Ensure logs do not show the `DEV PROFILE: resetting authentication test data` messages.
3. Start Google sign-in from the real frontend URL. Confirm the callback returns through `/api/auth/oauth2/callback/google`.
4. Verify `GET /api/auth/me` returns an authenticated user after sign-in.
5. Verify `POST /api/auth/logout` returns `204`, and a following `GET /api/auth/me` returns `401`.

## Database connection reliability

The Dockerfile does not eliminate database/network interruptions. The application is configured with `minimum-idle: 0`, `idle-timeout: 240000`, and `max-lifetime: 1500000` to avoid keeping idle pool connections indefinitely. Continue to monitor Render logs for Hikari validation failures and JDBC timeouts. Test recovery before treating the deployment as production-ready.
