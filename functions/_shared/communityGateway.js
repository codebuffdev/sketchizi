const NO_CACHE = { "cache-control": "no-store, no-cache, must-revalidate, private", pragma: "no-cache", "x-content-type-options": "nosniff", vary: "Cookie, Origin" };
export async function proxyCommunity({ request, env }) {
  const configured = env.AUTH_SERVICE_ORIGIN;
  if (!configured) return Response.json({ code: "service_not_configured", error: "Sketchizi backend is not configured." }, { status: 503, headers: NO_CACHE });
  let origin;
  try { origin = new URL(configured); if ((origin.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(origin.hostname)) || origin.username || origin.password || origin.search || origin.hash || (origin.pathname !== "/" && origin.pathname !== "")) throw new Error(); }
  catch { return Response.json({ code: "invalid_service_origin", error: "Sketchizi backend configuration is invalid." }, { status: 503, headers: NO_CACHE }); }
  if (!["GET", "POST", "PATCH", "DELETE"].includes(request.method)) return Response.json({ code: "method_not_allowed", error: "Method not allowed." }, { status: 405, headers: NO_CACHE });
  const incoming = new URL(request.url); const upstream = new URL(incoming.pathname, origin); upstream.search = incoming.search;
  const headers = new Headers(request.headers);
  for (const h of ["host", "connection", "content-length", "transfer-encoding", "cf-connecting-ip", "cf-ray", "x-real-ip"]) headers.delete(h);
  headers.set("accept-encoding", "identity");
  try {
    const init = { method: request.method, headers, redirect: "manual" };
    if (!["GET", "HEAD"].includes(request.method) && request.body) { init.body = request.body; init.duplex = "half"; }
    const response = await fetch(upstream, init); const responseHeaders = new Headers(response.headers);
    for (const [k,v] of Object.entries(NO_CACHE)) responseHeaders.set(k,v);
    responseHeaders.delete("server");
    const location = responseHeaders.get("location"); if (location) { try { const target = new URL(location, origin); if (target.origin === origin.origin) responseHeaders.set("location", `${incoming.origin}${target.pathname}${target.search}${target.hash}`); } catch {} }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers: responseHeaders });
  } catch { return Response.json({ code: "backend_unavailable", error: "Sketchizi backend is temporarily unavailable." }, { status: 502, headers: NO_CACHE }); }
}
