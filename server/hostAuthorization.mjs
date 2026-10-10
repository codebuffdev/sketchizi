import { createHmac, timingSafeEqual } from "node:crypto";

const AUDIENCE = "sketchizi-collaboration-host";

export function verifyHostAuthorization(token, roomId, secret = process.env.COLLAB_HOST_TOKEN_SECRET, nowSeconds = Math.floor(Date.now() / 1000)) {
  if (typeof secret !== "string" || Buffer.byteLength(secret, "utf8") < 32) return null;
  if (typeof token !== "string" || token.length > 4096) return null;
  const parts = token.split(".");
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null;
  let suppliedSignature;
  let claims;
  try {
    suppliedSignature = Buffer.from(parts[1], "base64url");
    const expectedSignature = createHmac("sha256", secret).update(parts[0], "ascii").digest();
    if (suppliedSignature.length !== expectedSignature.length || !timingSafeEqual(suppliedSignature, expectedSignature)) return null;
    claims = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
  } catch {
    return null;
  }
  if (claims?.aud !== AUDIENCE || typeof claims.sub !== "string" || !claims.sub.trim()) return null;
  if (typeof claims.name !== "string" || !claims.name.trim() || claims.name.trim().length > 48) return null;
  if (claims.roomId !== roomId || !Number.isInteger(claims.exp) || claims.exp <= nowSeconds || claims.exp > nowSeconds + 301) return null;
  return { subject: claims.sub, name: claims.name.trim(), roomId: claims.roomId, expiresAt: claims.exp };
}
