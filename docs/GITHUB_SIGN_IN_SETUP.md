# GitHub Sign-In Setup

Sketchizi supports Google and GitHub through the same Spring Security OAuth2 client, server-managed session, `/api/auth/me` response, and collaboration-host authorization bridge. The sign-in dialog intentionally uses text-only provider buttons without logos.

## GitHub OAuth App

Create a GitHub OAuth App in GitHub Developer Settings. Set its Authorization callback URL to:

`https://sketchizi.pages.dev/api/auth/oauth2/callback/github`

Register the Cloudflare Pages origin as the callback, not the Render service URL. The Pages Function forwards this public path to Spring Security’s internal `/login/oauth2/code/github` handler.

## Render environment variables

Add these to the Spring Boot authentication service:

- `GITHUB_CLIENT_ID` — OAuth App client ID.
- `GITHUB_CLIENT_SECRET` — OAuth App client secret.

Keep existing `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `FRONTEND_ORIGIN`, database settings, and `COLLAB_HOST_TOKEN_SECRET` unchanged. OAuth callback redirect URIs are now built from `FRONTEND_ORIGIN`; `PUBLIC_BASE_URL` is no longer used for the provider callback URL. The Node.js collaboration service does not need GitHub credentials.

The callback path is `/api/auth/oauth2/callback/github`; the Pages Function maps it to Spring Security's `/login/oauth2/code/github`. Sign-in begins at `/api/auth/login/github`.

## Identity behavior

GitHub's stable numeric user ID is used as the provider subject. Display name uses the GitHub profile name and falls back to the GitHub login. Email can be unavailable for GitHub accounts with private email settings; collaboration hosting uses the display name/login fallback and does not require an email. Google identity and sign-out behavior remain unchanged. Provider identities are stored separately; matching email addresses do not automatically merge accounts.

## Verification

Run `npm test` and `npm run build` in the project, and `mvn test` from `auth-service`. Then configure the OAuth App variables in Render and test the callback on the deployed domain. Live GitHub OAuth cannot be verified without those credentials.
