const NO_CACHE = {
  "cache-control": "no-store, no-cache, must-revalidate, private",
  pragma: "no-cache",
  expires: "0",
  "x-content-type-options": "nosniff",
  vary: "Cookie, Origin",
};
const FRONTEND_PREFIX = "/api/ai";
const MAX_REQUEST_BYTES = 900 * 1024;
const ASSERTION_LIFETIME_SECONDS = 60;

function jsonError(status, error, code) {
  return Response.json({ error, ...(code ? { code } : {}) }, { status, headers: NO_CACHE });
}

function validServiceOrigin(value) {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) return null;
    const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.protocol !== "https:" && !localHttp) return null;
    return url;
  } catch {
    return null;
  }
}

function cookieValue(header, name) {
  for (const item of String(header || "").split(";")) {
    const separator = item.indexOf("=");
    if (separator < 0) continue;
    if (item.slice(0, separator).trim() === name) return item.slice(separator + 1).trim();
  }
  return "";
}

function decodeCookie(value) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function bytesToBase64Url(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

async function signAssertion(subject, secret) {
  const now = Math.floor(Date.now() / 1000);
  const header = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = bytesToBase64Url(new TextEncoder().encode(JSON.stringify({
    sub: subject,
    aud: "sketchizi-ai",
    iat: now,
    exp: now + ASSERTION_LIFETIME_SECONDS,
    jti: crypto.randomUUID(),
  })));
  const signingInput = `${header}.${payload}`;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

async function inspectSession(authOrigin, request) {
  const session = cookieValue(request.headers.get("cookie"), "SESSION");
  if (!session) return null;
  let response;
  try {
    response = await fetch(new URL("/api/auth/me", authOrigin), {
      method: "GET",
      headers: { accept: "application/json", cookie: `SESSION=${session}` },
      cache: "no-store",
      redirect: "manual",
    });
  } catch {
    throw new Error("auth-unavailable");
  }
  if (response.status === 401) return null;
  if (!response.ok) throw new Error("auth-unavailable");
  const payload = await response.json().catch(() => null);
  const subject = payload?.authenticated === true && typeof payload?.user?.id === "string" ? payload.user.id : "";
  return subject && subject.length <= 255 ? subject : null;
}

function requestIsSameOrigin(request, incoming, env) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== incoming.origin) return false;
  if (env.PUBLIC_FRONTEND_ORIGIN) {
    try { if (new URL(env.PUBLIC_FRONTEND_ORIGIN).origin !== origin) return false; }
    catch { return false; }
  }
  return true;
}

function csrfIsValid(request) {
  const cookie = decodeCookie(cookieValue(request.headers.get("cookie"), "XSRF-TOKEN"));
  const header = request.headers.get("x-xsrf-token") || request.headers.get("x-csrf-token") || "";
  return Boolean(cookie && header && cookie.length === header.length && cookie === header);
}

function upstreamPath(pathname) {
  if (pathname === `${FRONTEND_PREFIX}/health`) return "/actuator/health";
  if (pathname === FRONTEND_PREFIX || pathname === `${FRONTEND_PREFIX}/`) return "/api/v1/ai";
  const suffix = pathname.slice(`${FRONTEND_PREFIX}/`.length);
  if (!suffix || !/^[A-Za-z0-9/_-]{1,240}$/.test(suffix) || suffix.split("/").some((part) => part === ".." || part === ".")) return null;
  return `/api/v1/ai/${suffix}`;
}

export async function onRequest({ request, env }) {
  const incoming = new URL(request.url);
  const mappedPath = upstreamPath(incoming.pathname);
  if (!mappedPath) return jsonError(400, "Invalid AI API path.", "invalid_path");
  if (!["GET", "HEAD", "POST"].includes(request.method)) return jsonError(405, "Method not allowed.", "method_not_allowed");

  const aiOrigin = validServiceOrigin(env.AI_SERVICE_ORIGIN);
  if (!aiOrigin) return jsonError(503, "The AI service is not configured.", "ai_service_not_configured");
  const isHealthCheck = incoming.pathname === `${FRONTEND_PREFIX}/health`;
  const upstream = new URL(mappedPath, aiOrigin);
  upstream.search = incoming.search;

  if (request.method === "POST") {
    if (!requestIsSameOrigin(request, incoming, env)) return jsonError(403, "Cross-origin AI requests are not allowed.", "origin_rejected");
    if (!csrfIsValid(request)) return jsonError(403, "The security token is missing or expired. Refresh the page and try again.", "csrf_rejected");
    const contentType = request.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("application/json")) return jsonError(415, "AI requests must use JSON.", "unsupported_media_type");
    let contentLength = Number(request.headers.get("content-length") || 0);
    if (!request.headers.has("content-length")) {
      try { contentLength = (await request.clone().arrayBuffer()).byteLength; }
      catch { return jsonError(400, "Could not read the AI request body.", "invalid_request_body"); }
    }
    if (contentLength > MAX_REQUEST_BYTES) return jsonError(413, "The AI request is too large.", "request_too_large");
  }

  let assertion = "";
  if (!isHealthCheck) {
    const authOrigin = validServiceOrigin(env.AUTH_SERVICE_ORIGIN);
    const secret = env.AI_IDENTITY_HMAC_SECRET;
    if (!authOrigin || typeof secret !== "string" || new TextEncoder().encode(secret).length < 32) {
      return jsonError(503, "The AI identity gateway is not configured.", "identity_gateway_not_configured");
    }
    let subject;
    try {
      subject = await inspectSession(authOrigin, request);
    } catch {
      return jsonError(502, "Could not verify your Sketchizi sign-in session.", "identity_verification_unavailable");
    }
    if (!subject) return jsonError(401, "Sign in with Google to use AI Ask.", "authentication_required");
    try { assertion = await signAssertion(subject, secret); }
    catch { return jsonError(503, "The AI identity gateway is unavailable.", "identity_assertion_failed"); }
  }

  const headers = new Headers(request.headers);
  for (const name of [
    "host", "connection", "content-length", "transfer-encoding", "cookie", "authorization",
    "x-user-id", "x-authenticated-user", "x-forwarded-user", "x-sketchizi-identity",
    "cf-connecting-ip", "cf-ray", "x-real-ip", "x-forwarded-for", "x-forwarded-host", "x-forwarded-proto",
    "x-xsrf-token", "x-csrf-token", "origin", "referer",
  ]) headers.delete(name);
  headers.set("accept-encoding", "identity");
  headers.set("cache-control", "no-store");
  if (assertion) headers.set("x-sketchizi-identity", assertion);

  try {
    const fetchOptions = { method: request.method, headers, redirect: "manual" };
    if (!["GET", "HEAD"].includes(request.method) && request.body !== null) {
      fetchOptions.body = request.body;
      fetchOptions.duplex = "half";
    }
    const response = await fetch(upstream, fetchOptions);
    const responseHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(NO_CACHE)) responseHeaders.set(key, value);
    responseHeaders.delete("server");
    responseHeaders.delete("set-cookie");
    responseHeaders.delete("location");
    responseHeaders.delete("content-length");
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
  } catch {
    return jsonError(502, "The AI service is temporarily unavailable. Your diagram has not been changed.", "ai_service_unavailable");
  }
}
