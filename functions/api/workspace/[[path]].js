const NO_CACHE = {
  "cache-control": "no-store, no-cache, must-revalidate, private",
  pragma: "no-cache",
  "x-content-type-options": "nosniff",
  vary: "Cookie, Origin",
};

function validServiceOrigin(value) {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) return null;
    const localHttp = url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname);
    if (url.protocol !== "https:" && !localHttp) return null;
    return url;
  } catch { return null; }
}

function backendPath(pathname) {
  const prefix = "/api/workspace";
  if (pathname !== prefix && !pathname.startsWith(prefix + "/")) return null;
  const suffix = pathname.slice(prefix.length);
  if (!/^[A-Za-z0-9/_-]{0,300}$/.test(suffix) || suffix.split("/").some(part => part === "." || part === "..")) return null;
  return "/api/workspace" + suffix;
}

function getCookie(header, name) {
  for (const part of String(header || "").split(";")) {
    const separator = part.indexOf("=");
    if (separator >= 0 && part.slice(0, separator).trim() === name) {
      const value = part.slice(separator + 1).trim();
      try { return decodeURIComponent(value); } catch { return value; }
    }
  }
  return "";
}

function validCsrf(request) {
  const cookie = getCookie(request.headers.get("cookie"), "XSRF-TOKEN");
  const header = request.headers.get("x-xsrf-token") || request.headers.get("x-csrf-token") || "";
  return Boolean(cookie && header && cookie.length === header.length && cookie === header);
}

function sameOrigin(request, incoming, env) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== incoming.origin) return false;
  if (env.PUBLIC_FRONTEND_ORIGIN) {
    try { return new URL(env.PUBLIC_FRONTEND_ORIGIN).origin === origin; }
    catch { return false; }
  }
  return true;
}

function jsonError(status, message, code, requestId) {
  return Response.json({ error: message, code, requestId }, {
    status,
    headers: { ...NO_CACHE, "x-request-id": requestId },
  });
}

export async function onRequest({ request, env }) {
  const requestId = crypto.randomUUID();
  const fail = (status, message, code) => jsonError(status, message, code, requestId);
  const incoming = new URL(request.url);
  const targetPath = backendPath(incoming.pathname);
  if (!targetPath) return fail(400, "Invalid Workspace API path.", "invalid_path");
  if (!["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE"].includes(request.method)) {
    return fail(405, "Method not allowed.", "method_not_allowed");
  }

  const backendOrigin = validServiceOrigin(env.AUTH_SERVICE_ORIGIN);
  if (!backendOrigin) return fail(503, "Workspace service is not configured.", "workspace_service_not_configured");

  const mutating = !["GET", "HEAD"].includes(request.method);
  if (mutating) {
    if (!sameOrigin(request, incoming, env)) return fail(403, "Cross-origin Workspace requests are not allowed.", "origin_rejected");
    if (!validCsrf(request)) return fail(403, "The security token is missing or expired. Refresh and try again.", "csrf_rejected");
  }

  const contentType = request.headers.get("content-type") || "";
  if (mutating && request.body && contentType && !contentType.toLowerCase().startsWith("application/json")) {
    return fail(415, "Workspace requests must use JSON.", "unsupported_media_type");
  }

  const upstream = new URL(targetPath, backendOrigin);
  upstream.search = incoming.search;
  const headers = new Headers();
  for (const name of ["accept", "content-type", "if-match", "if-none-match", "x-xsrf-token", "x-csrf-token", "x-request-id"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  const cookieHeader = request.headers.get("cookie") || "";
  const session = getCookie(cookieHeader, "SESSION");
  const xsrf = getCookie(cookieHeader, "XSRF-TOKEN");
  const forwardedCookies = [
    session ? `SESSION=${encodeURIComponent(session)}` : "",
    xsrf ? `XSRF-TOKEN=${encodeURIComponent(xsrf)}` : "",
  ].filter(Boolean).join("; ");
  if (forwardedCookies) headers.set("cookie", forwardedCookies);
  headers.set("x-request-id", requestId);

  try {
    const init = { method: request.method, headers, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(15000) };
    if (!["GET", "HEAD"].includes(request.method) && request.body !== null) {
      init.body = request.body;
      init.duplex = "half";
    }
    const upstreamResponse = await fetch(upstream, init);
    const responseHeaders = new Headers(NO_CACHE);
    for (const name of ["content-type", "allow", "etag", "x-request-id"]) {
      const value = upstreamResponse.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    if (upstreamResponse.status === 204 || upstreamResponse.status === 304) {
      return new Response(null, { status: upstreamResponse.status, headers: responseHeaders });
    }
    return new Response(upstreamResponse.body, { status: upstreamResponse.status, headers: responseHeaders });
  } catch {
    return fail(502, "Workspace service is temporarily unavailable.", "workspace_service_unavailable");
  }
}
