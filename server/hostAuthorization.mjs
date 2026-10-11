import { createHmac, timingSafeEqual } from "node:crypto";

const AUDIENCE = "sketchizi-collaboration-host";

/**
 * Verify the short-lived, room-bound host assertion and return a safe reason
 * code when it is rejected. The reason contains no token or claim values and
 * is suitable for structured service logs.
 */
export function inspectHostAuthorization(
  token,
  roomId,
  secret = process.env.COLLAB_HOST_TOKEN_SECRET,
  nowSeconds = Math.floor(Date.now() / 1000),
) {
  const rejected = (reason) => ({ authorization: null, reason });

  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32) {
    return rejected("server-secret-missing-or-too-short");
  }
  if (typeof token !== "string" || token.length === 0) return rejected("host-credential-missing");
  if (token.length > 4096) return rejected("host-credential-too-large");

  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return rejected("credential-format-invalid");

  let suppliedSignature;
  let claims;
  try {
    suppliedSignature = Buffer.from(parts[1], "base64url");
    const expectedSignature = createHmac("sha256", secret).update(parts[0], "ascii").digest();
    if (suppliedSignature.length !== expectedSignature.length || !timingSafeEqual(suppliedSignature, expectedSignature)) {
      return rejected("credential-signature-invalid");
    }
    claims = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  } catch {
    return rejected("credential-payload-invalid");
  }

  if (claims?.aud !== AUDIENCE) return rejected("claim-audience-invalid");
  if (typeof claims.sub !== "string" || !claims.sub.trim()) return rejected("claim-subject-invalid");
  if (typeof claims.name !== "string" || !claims.name.trim() || claims.name.trim().length > 48) {
    return rejected("claim-display-name-invalid");
  }
  if (claims.roomId !== roomId) return rejected("claim-room-mismatch");
  if (!Number.isInteger(claims.exp) || claims.exp <= nowSeconds) return rejected("credential-expired-or-expiry-invalid");
  if (claims.exp > nowSeconds + 301) return rejected("credential-expiry-too-far-in-future");

  return {
    authorization: { subject: claims.sub, name: claims.name.trim(), roomId: claims.roomId, expiresAt: claims.exp },
    reason: null,
  };
}

export function verifyHostAuthorization(token, roomId, secret = process.env.COLLAB_HOST_TOKEN_SECRET, nowSeconds = Math.floor(Date.now() / 1000)) {
  return inspectHostAuthorization(token, roomId, secret, nowSeconds).authorization;
}
