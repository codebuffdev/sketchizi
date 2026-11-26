/**
 * Deterministic network layer.
 *  - every non-local origin is aborted (fonts, analytics, CDNs): no flaky waits
 *  - /api/** is answered from fixtures so the suite never needs backend keys:
 *      auth (anonymous by default), warm-up, AI Ask (JSON), Eraser icon catalog,
 *      collaboration host-token. Anything else under /api/ -> 404 JSON.
 * Contracts were read from authClient.js, aiApiClient.js, AiAskPanel.jsx,
 * eraserLibrary.js and backendWarmup.js.
 */
const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

export const QA_USER = { id: "qa-user-0001", email: "qa@sketchizi.test", name: "QA Tester", picture: null };

export const MOCK_ERASER_NAMES = Array.from({ length: 24 }, (_, i) => `qa-icon-${String(i + 1).padStart(2, "0")}.svg`);

const TINY_SVG = (n) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" width="64" height="64"><rect x="6" y="6" width="52" height="52" rx="10" fill="#${["4f46e5", "0891b2", "16a34a", "d97706"][n % 4]}"/><circle cx="32" cy="32" r="12" fill="#fff"/></svg>`;

export const LONG_AI_ANSWER = [
  "Here is a **long, deterministic answer** used to exercise conversation scrolling and wrapping in the composer area.",
  "",
  ...Array.from({ length: 14 }, (_, i) => `${i + 1}. A reasonably long sentence about service number ${i + 1} that must wrap cleanly across narrow viewports without clipping, overlapping the composer, or forcing horizontal scrolling.`),
  "",
  "```\nconst veryLongIdentifierName = someFunctionWithAVeryLongName(argumentNumberOne, argumentNumberTwo, argumentNumberThree);\n```",
].join("\n");

function json(route, status, body) {
  return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
}

/**
 * @param {import('@playwright/test').BrowserContext} context
 * @param {{auth?: 'anonymous'|'signed-in', aiAnswer?: string, aiDelayMs?: number, log?: string[]}} options
 */
export async function installNetworkMocks(context, options = {}) {
  const state = { auth: options.auth || "anonymous", aiAnswer: options.aiAnswer || LONG_AI_ANSWER, aiDelayMs: options.aiDelayMs ?? 150, requests: [], blocked: [] };

  await context.route("**/*", async (route) => {
    const request = route.request();
    let url;
    try { url = new URL(request.url()); } catch { return route.continue(); }
    if (url.protocol === "data:" || url.protocol === "blob:" || url.protocol === "about:") return route.continue();

    const isLocal = LOCAL_HOSTS.has(url.hostname);
    const path = url.pathname;

    if (path.startsWith("/api/")) {
      state.requests.push(`${request.method()} ${path}`);
      if (path === "/api/auth/me") {
        return state.auth === "signed-in" ? json(route, 200, { authenticated: true, user: QA_USER }) : json(route, 401, { authenticated: false });
      }
      if (path === "/api/auth/csrf") return json(route, 200, { token: "qa-csrf", headerName: "X-CSRF-Token" });
      if (path === "/api/auth/providers") return json(route, 200, { google: true, github: true });
      if (path === "/api/auth/logout") return json(route, 200, { ok: true });
      if (path === "/api/auth/collaboration-host-token") return json(route, 200, { token: "qa-host-token", expiresAt: Date.now() + 3_600_000 });
      if (path === "/api/ai/warmup") return json(route, 200, { ok: true });
      if (path === "/api/ai/usage") return json(route, 200, { admin: true, accountRemaining: 99, conversationRemaining: 99, accountLimit: 100, conversationLimit: 100 });
      if (path === "/api/ai/conversations" && request.method() === "POST") return json(route, 200, { conversationId: "qa-conversation-1" });
      if (path === "/api/ai/chat" && request.method() === "POST") {
        if (state.aiDelayMs) await new Promise((r) => setTimeout(r, state.aiDelayMs));
        return json(route, 200, { status: "succeeded", answer: state.aiAnswer, usage: { admin: true, accountRemaining: 98, conversationRemaining: 98 } });
      }
      if (path.startsWith("/api/ai/requests/")) return json(route, 200, { status: "succeeded", answer: state.aiAnswer });
      if (path === "/api/eraser-catalog") return json(route, 200, { names: MOCK_ERASER_NAMES });
      if (path === "/api/eraser-icon") {
        const n = Number((url.searchParams.get("name") || "").replace(/\D/g, "")) || 0;
        return route.fulfill({ status: 200, contentType: "image/svg+xml", body: TINY_SVG(n) });
      }
      return json(route, 404, { error: "Not mocked by the responsive QA suite", path });
    }

    if (isLocal) return route.continue();

    state.blocked.push(url.hostname);
    return route.abort("blockedbyclient");
  });

  return state;
}
