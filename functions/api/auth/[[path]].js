const NO_CACHE = {
  "cache-control": "no-store, no-cache, must-revalidate",
  pragma: "no-cache",
  "x-content-type-options": "nosniff",
};

function backendPath(pathname) {
  if (pathname === "/api/auth/login/google") return "/auth/login/google";
  if (pathname === "/api/auth/oauth2/callback/google") {
    return "/login/oauth2/code/google";
  }
  if (pathname === "/api/auth/oauth2/authorization/google") {
    return "/oauth2/authorization/google";
  }
  return pathname;
}

export async function onRequest({ request, env }) {
  const configuredOrigin = env.AUTH_SERVICE_ORIGIN;
  if (!configuredOrigin) {
    return Response.json(
      { error: "Authentication service is not configured." },
      { status: 503, headers: NO_CACHE }
    );
  }

  let origin;
  try {
    origin = new URL(configuredOrigin);
    if (
      origin.protocol !== "https:" &&
      origin.hostname !== "localhost" &&
      origin.hostname !== "127.0.0.1"
    ) {
      throw new Error("HTTPS required");
    }
  } catch {
    return Response.json(
      { error: "Authentication service configuration is invalid." },
      { status: 503, headers: NO_CACHE }
    );
  }

  const incoming = new URL(request.url);
  const upstream = new URL(backendPath(incoming.pathname), origin);
  upstream.search = incoming.search;

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("connection");
  headers.delete("content-length");
  headers.delete("transfer-encoding");
  headers.delete("cf-connecting-ip");
  headers.set("accept-encoding", "identity");

  try {
    const fetchOptions = {
      method: request.method,
      headers,
      redirect: "manual",
    };

    if (
      !["GET", "HEAD"].includes(request.method) &&
      request.body !== null
    ) {
      fetchOptions.body = request.body;
      fetchOptions.duplex = "half";
    }

    const response = await fetch(upstream, fetchOptions);
    const responseHeaders = new Headers(response.headers);

    for (const [key, value] of Object.entries(NO_CACHE)) {
      responseHeaders.set(key, value);
    }
    responseHeaders.delete("server");

    const location = responseHeaders.get("location");
    if (location) {
      try {
        const target = new URL(location, origin);
        if (target.origin === origin.origin) {
          let path = target.pathname;
          if (path === "/auth/login/google") {
            path = "/api/auth/login/google";
          } else if (path === "/oauth2/authorization/google") {
            path = "/api/auth/oauth2/authorization/google";
          } else if (path === "/login/oauth2/code/google") {
            path = "/api/auth/oauth2/callback/google";
          } else if (path === "/login") {
            path = "/api/auth/login";
          }

          responseHeaders.set(
            "location",
            `${incoming.origin}${path}${target.search}${target.hash}`
          );
        }
      } catch {
        // Leave malformed Location values unchanged.
      }
    }

    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("[auth-gateway] Upstream request failed:", error);
    return Response.json(
      { error: "Authentication service is temporarily unavailable." },
      { status: 502, headers: NO_CACHE }
    );
  }
}
