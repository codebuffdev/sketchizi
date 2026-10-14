const NO_CACHE = {
  "cache-control": "no-store, no-cache, must-revalidate, private",
  pragma: "no-cache",
  "x-content-type-options": "nosniff",
  vary: "Cookie, Origin",
};

export async function onRequest({ request, env }) {
  const configuredOrigin = env.AUTH_SERVICE_ORIGIN;
  if (!configuredOrigin) {
    return Response.json({ error: "Sketchizi backend is not configured." }, { status: 503, headers: NO_CACHE });
  }

  let origin;
  try {
    origin = new URL(configuredOrigin);
    if ((origin.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(origin.hostname))
      || origin.username || origin.password || origin.search || origin.hash
      || (origin.pathname !== "/" && origin.pathname !== "")) throw new Error("Invalid backend origin");
  } catch {
    return Response.json({ error: "Sketchizi backend configuration is invalid." }, { status: 503, headers: NO_CACHE });
  }

  if (!["GET", "POST", "DELETE"].includes(request.method)) {
    return Response.json({ error: "Method not allowed." }, { status: 405, headers: NO_CACHE });
  }

  const incoming = new URL(request.url);
  const upstream = new URL(incoming.pathname, origin);
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
        // Keep provider redirects external. Rewrite backend-local redirects back through Pages
        // so the browser keeps using the same origin and session cookie.
        if (target.origin === origin.origin) {
          responseHeaders.set("location", `${incoming.origin}${target.pathname}${target.search}${target.hash}`);
        }
      } catch {
        // Leave malformed Location values unchanged; the browser will surface the failure.
      }
    }

    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
  } catch {
    return Response.json({ error: "Sketchizi backend is temporarily unavailable." }, { status: 502, headers: NO_CACHE });
  }
}
