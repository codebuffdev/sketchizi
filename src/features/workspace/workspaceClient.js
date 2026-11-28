const PREFIX = "/api/workspace";
import { getCsrfHeaders, invalidateCsrfToken, isCsrfRejection } from "../auth/csrfClient.js";

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

async function request(path, { method = "GET", body, headers = {}, timeout } = {}) {
  const isWrite = !["GET", "HEAD"].includes(method);
  let serialized;
  if (body !== undefined) serialized = JSON.stringify(body);
  const buildHeaders = async (forceToken) => {
    const requestHeaders = new Headers({ accept: "application/json", ...headers });
    if (serialized !== undefined) requestHeaders.set("content-type", "application/json");
    if (isWrite) {
      try {
        Object.entries(await getCsrfHeaders({ force: forceToken })).forEach(([key, value]) => requestHeaders.set(key, value));
      } catch (error) { throw requestFailure(error, error?.message); }
    }
    return requestHeaders;
  };
  // Reads are idempotent, so one automatic retry on a transient timeout is safe.
  // Writes are never retried after a timeout (it may have been applied), but a
  // 403 means the server rejected the request, so one retry with a fresh
  // security token is safe and avoids a manual page refresh.
  const attempts = method === "GET" ? 2 : 1;
  let csrfRetried = false;
  let forceToken = false;
  for (let attempt = 1; ; attempt += 1) {
    const requestHeaders = await buildHeaders(forceToken);
    forceToken = false;
    let response;
    try {
      response = await fetch(`${PREFIX}${path}`, {
        method,
        credentials: "include",
        cache: "no-store",
        headers: requestHeaders,
        body: serialized,
        signal: timeoutSignal(timeout),
      });
    } catch (error) {
      const failure = requestFailure(error, "Cloud Workspace is temporarily unavailable.");
      if (attempt >= attempts || failure.code !== "workspace_timeout") throw failure;
      continue;
    }
    if (!response.ok) {
      const payload = await response.json().catch(() => null);
      if (isWrite && !csrfRetried && isCsrfRejection(response.status, payload)) {
        csrfRetried = true;
        invalidateCsrfToken();
        forceToken = true;
        attempt -= 1;
        continue;
      }
      const error = new Error(payload?.error || `Workspace request failed (${response.status}).`);
      error.status = response.status;
      error.code = payload?.code || "workspace_request_failed";
      error.payload = payload;
      throw error;
    }
    if (response.status === 204) return null;
    return response.json();
  }
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
