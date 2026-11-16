# Sketchizi 1.10.86 — GitHub Sign-In Foundation

## Added
- Added GitHub as an optional alternative OAuth sign-in provider alongside Google.
- Added provider discovery so the GitHub option is displayed only when `GITHUB_OAUTH_ENABLED=true`.
- Added server-side GitHub profile mapping using the immutable GitHub account ID. GitHub identities use a provider-qualified Sketchizi subject and are not automatically merged with Google accounts by email.
- Added Cloudflare Pages auth-gateway rewrites for GitHub authorization and callback routes.
- Kept GitHub sign-in scopes limited to `read:user` and `user:email`; repository authorization is not included in this step.

## Required backend environment variables
- `GITHUB_CLIENT_ID`
- `GITHUB_CLIENT_SECRET`
- `GITHUB_OAUTH_ENABLED=true`
- Existing `PUBLIC_BASE_URL`, configured consistently with the current Google OAuth callback setup.

Register `${PUBLIC_BASE_URL}/api/auth/oauth2/callback/github` as the GitHub OAuth App callback URL.

## Validation
- Auth client and Cloudflare auth gateway tests: 17 passed.
- YAML syntax validation: passed.
- Full frontend production build and Java backend tests were not run in this environment because npm dependencies/Maven are unavailable.
