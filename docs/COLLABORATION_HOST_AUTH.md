# Collaboration host authentication

## Behavior

- Starting a collaboration first checks `GET /api/auth/me`. Unauthenticated users see the existing Google sign-in dialog with an explanation that hosting requires sign-in.
- The post-login return destination is `/?startCollaboration=1`, which reopens the create dialog after the authenticated state is restored.
- The create dialog asks only for a collaboration name. The profile display name comes from the auth API (`user.name`, falling back to `user.email`).
- Submitting creation requests a short-lived, room-bound signed token through the CSRF-protected auth API. The Node.js WebSocket server verifies it before creating a new room and uses its signed name for host presence.
- Joining an existing room remains a normal guest join and does not require authentication.

## Shared secret

Set `COLLAB_HOST_TOKEN_SECRET` to the same random secret (at least 32 bytes) in both the Spring Boot Render auth service and the Node.js collaboration server. Keep it server-side only. See `GOOGLE_AUTH_SETUP.md` for generation and deployment notes.

## Manual verification

1. Open Sketchizi in a signed-out browser and click **Start Collaboration**. Confirm no room is created and the existing Google sign-in dialog explains the requirement.
2. Continue with Google. Confirm return to Sketchizi opens **Create collaboration**.
3. Confirm the create dialog contains Collaboration name, Create collaboration, and Cancel, with no Your name field.
4. Create a room and verify the host name matches the account profile, even if local browser collaboration-name storage contains a different value.
5. Open the resulting collaboration URL in a private/signed-out window. Join with a guest name and verify joining works without sign-in.
6. In a test environment, remove `COLLAB_HOST_TOKEN_SECRET` from the Node service and attempt a new room creation using a direct WebSocket `join` message without a valid token. Verify the server rejects it and creates no room. Restore the secret after the test.
7. Verify host leave/end, guest leave, viewer/editor roles, reconnect, and synchronization.
