const NO_CACHE = {
  "cache-control": "no-store, no-cache, must-revalidate, private",
  pragma: "no-cache",
  "x-content-type-options": "nosniff",
  vary: "Cookie, Origin",
};

function validBackendOrigin(value) {
  try {
    const origin = new URL(value);
    const localHttp = origin.protocol === "http:" && ["localhost", "127.0.0.1"].includes(origin.hostname);
    if ((origin.protocol !== "https:" && !localHttp) || origin.username || origin.password ||
        origin.search || origin.hash || (origin.pathname !== "/" && origin.pathname !== "")) return null;
    return origin;
  } catch {
    return null;
  }
}

export async function onRequest({ request, env }) {
  const origin = validBackendOrigin(env.AUTH_SERVICE_ORIGIN);
  if (!origin) {
    return Response.json({ error: "Sketchizi backend is not configured." }, { status: 503, headers: NO_CACHE });
  }
  const incoming = new URL(request.url);
  const allowedMethods = ["GET", "POST", "PUT", "PATCH", "DELETE"];
  if (!allowedMethods.includes(request.method)) {
    return Response.json({ error: "Method not allowed." }, { status: 405, headers: { ...NO_CACHE, allow: allowedMethods.join(", ") } });
  }

  const stateChanging = !["GET", "HEAD"].includes(request.method);
  if (stateChanging) {
    const requestOrigin = request.headers.get("origin");
    if (!requestOrigin || requestOrigin !== incoming.origin) {
      return Response.json({ error: "Cross-origin Workspace requests are not allowed.", code: "origin_rejected" }, { status: 403, headers: NO_CACHE });
    }
    if (env.PUBLIC_FRONTEND_ORIGIN) {
      try {
        if (new URL(env.PUBLIC_FRONTEND_ORIGIN).origin !== requestOrigin) {
          return Response.json({ error: "Cross-origin Workspace requests are not allowed.", code: "origin_rejected" }, { status: 403, headers: NO_CACHE });
        }
      } catch {
        return Response.json({ error: "Workspace gateway configuration is invalid." }, { status: 503, headers: NO_CACHE });
      }
    }
  }

  const route = incoming.pathname.slice("/api/workspace".length);
  if (!route || !/^\/[A-Za-z0-9/_-]{1,240}$/.test(route) ||
      route.split("/").some(segment => segment === "." || segment === "..")) {
    return Response.json({ error: "Invalid Workspace API path.", code: "invalid_path" }, { status: 400, headers: NO_CACHE });
  }

  const upstream = new URL("/api/workspace" + route, origin);
  upstream.search = incoming.search;
  const headers = new Headers(request.headers);
  for (const name of ["host", "connection", "content-length", "transfer-encoding", "cf-connecting-ip", "cf-ray", "x-real-ip"]) headers.delete(name);
  headers.set("accept-encoding", "identity");

  try {
    const init = { method: request.method, headers, redirect: "manual" };
    if (!["GET", "HEAD"].includes(request.method) && request.body) {
      init.body = request.body;
      init.duplex = "half";
    }
    const response = await fetch(upstream, init);
    const responseHeaders = new Headers(response.headers);
    for (const [key, value] of Object.entries(NO_CACHE)) responseHeaders.set(key, value);
    responseHeaders.delete("server");

    const location = responseHeaders.get("location");
    if (location) {
      try {
        const target = new URL(location, origin);
        if (target.origin === origin.origin) {
          responseHeaders.set("location", incoming.origin + target.pathname + target.search + target.hash);
        }
      } catch {
        // Do not turn an invalid Location header into a navigable URL.
      }
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
  } catch {
    return Response.json({ error: "Sketchizi backend is temporarily unavailable." }, { status: 502, headers: NO_CACHE });
  }
}
