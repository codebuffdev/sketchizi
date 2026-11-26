import { useEffect, useState } from "react";
import { workspaceClient } from "./workspaceClient.js";


// Theme comes from the app (isDarkTheme). If the prop is omitted, fall back to
// the nearest data-theme / .dark ancestor of the document so a portal still
// matches the root app container.
function detectTheme() {
  if (typeof document === "undefined") return "light";
  const root = document.querySelector("[data-theme]") || document.documentElement;
  const attr = root.getAttribute("data-theme");
  if (attr === "dark" || attr === "light") return attr;
  return document.documentElement.classList.contains("dark") || document.querySelector(".app.theme-dark") ? "dark" : "light";
}

export default function CloudSaveDialog({ initialName, onClose, onSave, isDarkTheme }) {
  const theme = isDarkTheme === undefined ? detectTheme() : isDarkTheme ? "dark" : "light";
  const [projects, setProjects] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [name, setName] = useState(() => (initialName || "Untitled drawing").replace(/\.(excalidraw|sketchizi)$/i, ""));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [creatingProject, setCreatingProject] = useState(false);
  const [newProjectName, setNewProjectName] = useState("");
  const [projectCreating, setProjectCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      if (!saving && !projectCreating) onClose?.();
    };
    window.addEventListener("keydown", closeOnEscape, true);
    return () => window.removeEventListener("keydown", closeOnEscape, true);
  }, [onClose, saving, projectCreating]);

  useEffect(() => {
    let active = true;
    workspaceClient.listProjects()
      .then((result) => {
        if (!active) return;
        const rows = Array.isArray(result) ? result : result?.projects || [];
        setProjects(rows);
        setProjectId((current) => rows.some((project) => project.id === current) ? current : rows[0]?.id || "");
      })
      .catch((cause) => {
        if (active) setError(cause.message || "Could not load Cloud Workspace projects.");
      })
      .finally(() => { if (active) setLoading(false); });
    workspaceClient.getLimits()
      .then((limits) => { if (active) setIsAdmin(Boolean(limits?.admin)); })
      .catch(() => { if (active) setIsAdmin(false); });
    return () => { active = false; };
  }, []);

  const createProject = async (event) => {
    event.preventDefault();
    const trimmedName = newProjectName.trim();
    if (!trimmedName || projectCreating || saving) return;
    setProjectCreating(true);
    setError("");
    try {
      const result = await workspaceClient.createProject({ name: trimmedName, description: "" });
      const project = result?.project || result;
      if (!project?.id) throw new Error("The project was created, but its ID was not returned. Refresh your projects and try again.");
      setProjects((current) => [...current.filter((item) => item.id !== project.id), project]);
      setProjectId(project.id);
      setNewProjectName("");
      setCreatingProject(false);
    } catch (cause) {
      setError(cause.message || "Could not create Cloud project.");
    } finally {
      setProjectCreating(false);
    }
  };

  const submit = async (event) => {
    event.preventDefault();
    if (!projectId || !name.trim() || saving) return;
    setSaving(true);
    setError("");
    try {
      await onSave({ projectId, name: name.trim() });
    } catch (cause) {
      setError(cause.message || "Could not save this drawing to Cloud Workspace.");
      setSaving(false);
    }
  };

  return (
    <div className="cloud-save-dialog-backdrop" data-theme={theme} onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <section className="cloud-save-dialog" role="dialog" aria-modal="true" aria-labelledby="cloud-save-dialog-title">
        <div className="cloud-save-dialog-header">
          <div>
            <h2 id="cloud-save-dialog-title">Save to Cloud Workspace</h2>
            <p>{isAdmin ? "Save this drawing and its embedded assets to a cloud project. Administrator accounts are exempt from the standard 2 MiB application limit." : "Save this drawing and its embedded assets to a cloud project. Standard accounts have a 2 MiB document limit."}</p>
          </div>
          <button type="button" className="cloud-save-dialog-close" aria-label="Close dialog" disabled={saving} onClick={onClose}>×</button>
        </div>
        {loading ? <div className="cloud-save-dialog-empty" role="status">Loading your cloud projects…</div> : (
          <form onSubmit={submit}>
            <div className="cloud-save-dialog-fields">
              <label htmlFor="cloud-save-name">Diagram name
                <input id="cloud-save-name" autoFocus required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. System overview" />
              </label>
              <label htmlFor="cloud-save-project">Cloud project
                <select id="cloud-save-project" required value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                  <option value="" disabled>{projects.length ? "Select a project" : "No projects yet"}</option>
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
              </label>
              {!creatingProject ? (
                <button type="button" className="cloud-save-create-project-trigger" disabled={saving || projectCreating} onClick={() => { setCreatingProject(true); setError(""); }}>+ Create Cloud project</button>
              ) : (
                <div className="cloud-save-create-project">
                  <label htmlFor="cloud-save-new-project">New project name
                    <input id="cloud-save-new-project" autoFocus required maxLength={120} value={newProjectName} onChange={(event) => setNewProjectName(event.target.value)} placeholder="e.g. System Design" />
                  </label>
                  <div className="cloud-save-create-project-actions">
                    <button type="button" disabled={projectCreating} onClick={() => { setCreatingProject(false); setNewProjectName(""); }}>Cancel</button>
                    <button type="button" className="primary" disabled={projectCreating || !newProjectName.trim()} onClick={createProject}>{projectCreating ? "Creating…" : "Create project"}</button>
                  </div>
                </div>
              )}
            </div>
            {error && <p className="cloud-save-dialog-error" role="alert">{error}</p>}
            <div className="cloud-save-dialog-actions">
              <button type="button" disabled={saving || projectCreating} onClick={onClose}>Cancel</button>
              <button type="submit" className="primary" disabled={saving || projectCreating || !projectId || !name.trim()}>{saving ? "Saving…" : "Save to Cloud"}</button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
