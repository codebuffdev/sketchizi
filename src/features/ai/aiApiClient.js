const API_BASE = "/api/ai";

async function csrfHeaders() {
  const response = await fetch("/api/auth/csrf", {
    credentials: "same-origin",
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error("Could not prepare a secure AI request. Refresh your sign-in session and try again.");
  const payload = await response.json();
  if (!payload?.token) throw new Error("Could not prepare a secure AI request. Refresh your sign-in session and try again.");
  return { [payload.headerName || "X-XSRF-TOKEN"]: payload.token };
}

export async function aiApiRequest(path, { method = "GET", body, signal } = {}) {
  const normalizedMethod = method.toUpperCase();
  const retryableLogicalChat = normalizedMethod === "POST" && path === "/chat" && body && typeof body.requestId === "string";
  const maxAttempts = retryableLogicalChat ? 2 : 1;
  let lastNetworkError;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const headers = { accept: "application/json" };
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      Object.assign(headers, await csrfHeaders());
    }
    let response;
    try {
      response = await fetch(`${API_BASE}${path}`, {
        method: normalizedMethod,
        credentials: "same-origin",
        cache: "no-store",
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      });
    } catch (error) {
      if (signal?.aborted) throw error;
      lastNetworkError = error;
      // Only retry the same logical chat submission, preserving requestId for backend idempotency.
      if (attempt + 1 < maxAttempts) continue;
      const interrupted = new Error("The network interrupted the AI request. Check its status before submitting another generation.", { cause: lastNetworkError });
      interrupted.code = "transport_interrupted";
      throw interrupted;
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      const message = typeof payload.error === "string" ? payload.error : "The AI service could not complete this request.";
      const error = new Error(message);
      error.status = response.status;
      error.code = typeof payload.code === "string" ? payload.code : "ai_request_failed";
      throw error;
    }
    return payload;
  }

  throw lastNetworkError || new Error("The AI request failed.");
}

/** Runs a read request with a finite deadline so UI loading states cannot hang forever. */
export async function aiApiRequestWithTimeout(path, options = {}, timeoutMs = 15000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Math.max(1, timeoutMs));
  try {
    return await aiApiRequest(path, { ...options, signal: controller.signal });
  } catch (error) {
    if (controller.signal.aborted) {
      const timeoutError = new Error("The AI request timed out.");
      timeoutError.code = "request_timeout";
      throw timeoutError;
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

export function createRequestId() {
  if (typeof globalThis.crypto?.randomUUID === "function") return globalThis.crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof globalThis.crypto?.getRandomValues === "function") globalThis.crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((value) => value.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
