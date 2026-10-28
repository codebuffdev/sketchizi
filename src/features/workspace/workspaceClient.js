const PREFIX = "/api/workspace";
const CSRF_URL = "/api/auth/csrf";
const REQUEST_TIMEOUT_MS = 12000;

function timeoutSignal() {
  return AbortSignal.timeout(REQUEST_TIMEOUT_MS);
}

function requestFailure(error, fallback) {
  if (error?.name === "TimeoutError" || error?.name === "AbortError") {
    return new Error("The Cloud Workspace request timed out. Check your connection and whether the diagram appeared in Cloud Workspace before trying again.");
  }
  return error instanceof Error ? error : new Error(fallback);
}

async function getCsrfHeaders() {
  // Workspace persistence is served by the authenticated backend, not AI Ask.
  // Do not block project operations on the separate AI service warm-up endpoint.
  const response = await fetch(CSRF_URL, {
    credentials: "same-origin",
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  if (!response.ok) throw new Error("Could not obtain a security token. Refresh the page and retry.");
  const payload = await response.json();
  if (!payload?.token || !payload?.headerName) throw new Error("The security token response was invalid.");
  return { [payload.headerName]: payload.token };
}

async function request(path, { method = "GET", body, headers = {} } = {}) {
  const requestHeaders = new Headers({ accept: "application/json", ...headers });
  let serialized;
  if (body !== undefined) {
    requestHeaders.set("content-type", "application/json");
    serialized = JSON.stringify(body);
  }
  if (!["GET", "HEAD"].includes(method)) {
    Object.entries(await getCsrfHeaders()).forEach(([key, value]) => requestHeaders.set(key, value));
  }
  const response = await fetch(`${PREFIX}${path}`, {
    method,
    credentials: "same-origin",
    cache: "no-store",
    headers: requestHeaders,
    body: serialized,
  });
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
  createDiagram: (diagram) => request("/diagrams", { method: "POST", body: diagram }),
  getDiagram: (diagramId) => request(`/diagrams/${encodeURIComponent(diagramId)}`),
  saveDiagram: (diagramId, revision, document) => request(`/diagrams/${encodeURIComponent(diagramId)}`, {
    method: "PUT", headers: { "if-match": String(revision) }, body: document,
  }),
  updateDiagram: (diagramId, metadata) => request(`/diagrams/${encodeURIComponent(diagramId)}`, { method: "PATCH", body: metadata }),
  duplicateDiagram: (diagramId) => request(`/diagrams/${encodeURIComponent(diagramId)}/duplicate`, { method: "POST" }),
  deleteDiagram: (diagramId) => request(`/diagrams/${encodeURIComponent(diagramId)}`, { method: "DELETE" }),
});
