const API_ROOT = "/api/workspace";
const CSRF_URL = "/api/auth/csrf";

async function readResponse(response) {
  if (response.status === 204) return null;
  const text = await response.text();
  if (!text) return null;
  try { return JSON.parse(text); } catch { return { message: text }; }
}

function errorFrom(response, payload) {
  const nested = payload?.error && typeof payload.error === "object" ? payload.error : null;
  const message = nested?.message || (typeof payload?.error === "string" ? payload.error : "") ||
    payload?.message || (response.status === 401 ? "Sign in to use Cloud Workspace." : "The Workspace request failed.");
  const error = new Error(message);
  error.status = response.status;
  error.code = nested?.code || payload?.code || (response.status === 401 ? "unauthorized" : "workspace_request_failed");
  error.requestId = nested?.requestId || payload?.requestId || "";
  return error;
}

async function csrfHeaders() {
  const response = await fetch(CSRF_URL, {
    method: "GET",
    credentials: "same-origin",
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  const payload = await readResponse(response);
  if (!response.ok || !payload?.token || !payload?.headerName) {
    throw errorFrom(response, payload);
  }
  return { [payload.headerName]: payload.token };
}

async function request(path, { method = "GET", body, headers: suppliedHeaders = {} } = {}) {
  const normalizedMethod = method.toUpperCase();
  const headers = new Headers({ accept: "application/json", ...suppliedHeaders });
  if (body !== undefined) headers.set("content-type", "application/json");
  if (!["GET", "HEAD", "OPTIONS"].includes(normalizedMethod)) {
    const csrf = await csrfHeaders();
    for (const [key, value] of Object.entries(csrf)) headers.set(key, value);
  }
  const response = await fetch(API_ROOT + path, {
    method: normalizedMethod,
    credentials: "same-origin",
    cache: "no-store",
    headers,
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const payload = await readResponse(response);
  if (!response.ok) throw errorFrom(response, payload);
  return payload;
}

export const workspaceClient = {
  listProjects: () => request("/projects"),
  createProject: ({ name, description = "" }) => request("/projects", { method: "POST", body: { name, description } }),
  updateProject: (id, { name, description = "" }) => request("/projects/" + encodeURIComponent(id), { method: "PATCH", body: { name, description } }),
  deleteProject: (id) => request("/projects/" + encodeURIComponent(id), { method: "DELETE" }),
  listDiagrams: (projectId) => request("/projects/" + encodeURIComponent(projectId) + "/diagrams"),
  createDiagram: ({ projectId, name, format = "excalidraw", document }) => request("/diagrams", {
    method: "POST", body: { projectId, name, format, document },
  }),
  getDiagram: (id) => request("/diagrams/" + encodeURIComponent(id)),
  saveDiagram: (id, { name, format, document, revision }) => request("/diagrams/" + encodeURIComponent(id), {
    method: "PUT",
    headers: { "if-match": '"' + String(revision) + '"' },
    body: { name, format, document, revision },
  }),
  updateDiagram: (id, { name, projectId }) => request("/diagrams/" + encodeURIComponent(id), {
    method: "PATCH", body: { name, ...(projectId ? { projectId } : {}) },
  }),
  duplicateDiagram: (id, name) => request("/diagrams/" + encodeURIComponent(id) + "/duplicate", {
    method: "POST", body: name ? { name } : {},
  }),
  deleteDiagram: (id) => request("/diagrams/" + encodeURIComponent(id), { method: "DELETE" }),
};

export function buildBlankWorkspaceDocument() {
  return {
    type: "excalidraw",
    version: 2,
    source: "https://sketchizi.pages.dev",
    elements: [],
    appState: { viewBackgroundColor: "#ffffff", scrollX: 0, scrollY: 0, zoom: { value: 1 }, gridModeEnabled: false },
    files: {},
    metadata: {},
    extensions: {},
    format: "excalidraw",
  };
}
