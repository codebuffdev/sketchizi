const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Resolve the collaboration WebSocket endpoint for the current deployment.
 * Local development may use the Vite origin; deployed builds must explicitly
 * point to the separately hosted collaboration server.
 */
export function resolveCollaborationWebSocketUrl(configuredValue, locationLike) {
  const configured = typeof configuredValue === "string" ? configuredValue.trim() : "";
  const hostname = typeof locationLike?.hostname === "string" ? locationLike.hostname : "";
  const protocol = typeof locationLike?.protocol === "string" ? locationLike.protocol : "";
  const host = typeof locationLike?.host === "string" ? locationLike.host : hostname;
  const isLocalDevelopment = LOCAL_HOSTS.has(hostname);

  if (!configured && !isLocalDevelopment) {
    throw new Error(
      "Collaboration is not configured for this deployment. Set VITE_COLLAB_WS_URL in Cloudflare Pages to the running collaboration server's wss:// URL ending in /collaboration, then redeploy."
    );
  }

  const candidate = configured || `${protocol === "https:" ? "wss" : "ws"}://${host}/collaboration`;
  let endpoint;
  try {
    endpoint = new URL(candidate);
  } catch {
    throw new Error("VITE_COLLAB_WS_URL is not a valid WebSocket URL. Use wss://your-collaboration-host/collaboration.");
  }

  if (endpoint.protocol !== "ws:" && endpoint.protocol !== "wss:") {
    throw new Error("VITE_COLLAB_WS_URL must use ws:// or wss://.");
  }
  if (protocol === "https:" && endpoint.protocol !== "wss:") {
    throw new Error("Sketchizi is served over HTTPS, so VITE_COLLAB_WS_URL must use wss://.");
  }
  if (endpoint.pathname.replace(/\/+$/, "") !== "/collaboration") {
    throw new Error("VITE_COLLAB_WS_URL must end with the /collaboration WebSocket path.");
  }
  if (endpoint.username || endpoint.password || endpoint.hash) {
    throw new Error("VITE_COLLAB_WS_URL must be a public WebSocket endpoint without credentials or a URL fragment.");
  }

  return endpoint.toString();
}
