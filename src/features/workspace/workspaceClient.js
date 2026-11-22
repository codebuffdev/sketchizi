const PREFIX = "/api/workspace";
const CSRF_URL = "/api/auth/csrf";
const REQUEST_TIMEOUT_MS = 12000;
const DRAWING_WRITE_TIMEOUT_MS = 75000;

function timeoutSignal(timeout = REQUEST_TIMEOUT_MS) {
  return AbortSignal.timeout(timeout);
}

const CACHE_KEY = "sketchizi.workspace.cache.v1";

function requestFailure(error, fallback) {
  if (error?.name === "TimeoutError" || error?.name === "AbortError") {
    const timeoutError = new Error("The Cloud Workspace request timed out. Check your connection and whether the diagram appeared in Cloud Workspace before trying again.");
    timeoutError.code = "workspace_timeout";
    return timeoutError;
  }
  return error instanceof Error ? error : new Error(fallback);
}

/** True for timeouts and offline failures, never for HTTP errors. */
export function isWorkspaceTimeout(error) {
  return error?.code === "workspace_timeout" || error?.name === "TimeoutError" || error?.name === "AbortError" || error instanceof TypeError;
}

/** True for a signed-out / expired session (HTTP 401). */
export function isWorkspaceUnauthorized(error) {
  return error?.status === 401 || /unauthori[sz]ed/i.test(String(error?.message || ""));
}

/**
 * Stale-while-revalidate snapshot: { projects, chapters: { [projectId]: rows[] }, savedAt }.
 * Storage can be blocked or full, so every access is guarded.
 */
export function readWorkspaceCache() {
  try {
    const parsed = JSON.parse(window.localStorage.getItem(CACHE_KEY) || "null");
    if (parsed && Array.isArray(parsed.projects)) {
      return { projects: parsed.projects, chapters: parsed.chapters && typeof parsed.chapters === "object" ? parsed.chapters : {}, savedAt: parsed.savedAt || 0 };
    }
  } catch { /* Missing or corrupt cache. */ }
  return { projects: [], chapters: {}, savedAt: 0 };
}

export function writeWorkspaceCache(patch) {
  try {
    const current = readWorkspaceCache();
    const next = {
      projects: patch.projects || current.projects,
      chapters: patch.chapters ? { ...current.chapters, ...patch.chapters } : current.chapters,
      savedAt: Date.now(),
    };
    window.localStorage.setItem(CACHE_KEY, JSON.stringify(next));
  } catch { /* Quota or privacy mode: the cache is optional. */ }
}

export function clearWorkspaceCache() {
  try { window.localStorage.removeItem(CACHE_KEY); } catch { /* Ignore. */ }
}

async function getCsrfHeaders() {
  // Workspace persistence is served by the authenticated backend, not AI Ask.
  // Do not block project operations on the separate AI service warm-up endpoint.
  let response;
  try {
    response = await fetch(CSRF_URL, {
      credentials: "same-origin",
      cache: "no-store",
      headers: { accept: "application/json" },
      signal: timeoutSignal(),
    });
  } catch (error) {
    throw requestFailure(error, "Could not obtain a security token. Refresh the page and retry.");
  }
  if (!response.ok) throw new Error("Could not obtain a security token. Refresh the page and retry.");
  const payload = await response.json();
  if (!payload?.token || !payload?.headerName) throw new Error("The security token response was invalid.");
  return { [payload.headerName]: payload.token };
}

async function request(path, { method = "GET", body, headers = {}, timeout } = {}) {
  const requestHeaders = new Headers({ accept: "application/json", ...headers });
  let serialized;
  if (body !== undefined) {
    requestHeaders.set("content-type", "application/json");
    serialized = JSON.stringify(body);
  }
  if (!["GET", "HEAD"].includes(method)) {
    Object.entries(await getCsrfHeaders()).forEach(([key, value]) => requestHeaders.set(key, value));
  }
  // Reads are idempotent, so one automatic retry on a transient timeout is safe.
  // Writes are never retried: a timed-out write may still have been applied.
  const attempts = method === "GET" ? 2 : 1;
  let response;
  for (let attempt = 1; ; attempt += 1) {
    try {
      response = await fetch(`${PREFIX}${path}`, {
        method,
        credentials: "same-origin",
        cache: "no-store",
        headers: requestHeaders,
        body: serialized,
        signal: timeoutSignal(timeout),
      });
      break;
    } catch (error) {
      const failure = requestFailure(error, "Cloud Workspace is temporarily unavailable.");
      if (attempt >= attempts || failure.code !== "workspace_timeout") throw failure;
    }
  }
  if (!response.ok) {
    const payload = await response.json().catch(() => null);
    const error = new Error(payload?.error || `Workspace request failed (${response.status}).`);
    error.status = response.status;
    error.code = payload?.code || "workspace_request_failed";
    error.payload = payload;
    throw error;
  }
  if (response.status === 204) return null;
  return response.json();
}

export const workspaceClient = Object.freeze({
  getLimits: () => request("/limits"),
  listProjects: () => request("/projects"),
  createProject: (project) => request("/projects", { method: "POST", body: project }),
  getProject: (projectId) => request(`/projects/${encodeURIComponent(projectId)}`),
  updateProject: (projectId, project) => request(`/projects/${encodeURIComponent(projectId)}`, { method: "PATCH", body: project }),
  deleteProject: (projectId) => request(`/projects/${encodeURIComponent(projectId)}`, { method: "DELETE" }),
  listDiagrams: (projectId) => request(`/projects/${encodeURIComponent(projectId)}/diagrams`),
  createDiagram: (diagram) => request("/diagrams", { method: "POST", body: diagram, timeout: DRAWING_WRITE_TIMEOUT_MS }),
  getDiagram: (diagramId) => request(`/diagrams/${encodeURIComponent(diagramId)}`),
  saveDiagram: (diagramId, revision, document) => request(`/diagrams/${encodeURIComponent(diagramId)}`, {
    method: "PUT", headers: { "if-match": String(revision) }, body: document, timeout: DRAWING_WRITE_TIMEOUT_MS,
  }),
  updateDiagram: (diagramId, metadata) => request(`/diagrams/${encodeURIComponent(diagramId)}`, { method: "PATCH", body: metadata }),
  // Chapter sequence metadata (orderIndex / chapterStatus). Sent as a metadata-only
  // PATCH so it never touches the saved scene document or its revision.
  updateDiagramChapter: (diagramId, chapter) => request(`/diagrams/${encodeURIComponent(diagramId)}`, {
    method: "PATCH",
    body: {
      ...(Number.isInteger(chapter?.orderIndex) ? { orderIndex: chapter.orderIndex } : {}),
      ...(typeof chapter?.chapterStatus === "string" ? { chapterStatus: chapter.chapterStatus } : {}),
    },
  }),
  duplicateDiagram: (diagramId) => request(`/diagrams/${encodeURIComponent(diagramId)}/duplicate`, { method: "POST" }),
  deleteDiagram: (diagramId) => request(`/diagrams/${encodeURIComponent(diagramId)}`, { method: "DELETE" }),
});
