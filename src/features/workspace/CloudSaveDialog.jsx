import { useEffect, useState } from "react";
import { workspaceClient } from "./workspaceClient.js";


export default function CloudSaveDialog({ initialName, onClose, onSave }) {
  const [projects, setProjects] = useState([]);
  const [isAdmin, setIsAdmin] = useState(false);
  const [projectId, setProjectId] = useState("");
  const [name, setName] = useState(() => (initialName || "Untitled drawing").replace(/\.(excalidraw|sketchizi)$/i, ""));
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    Promise.all([workspaceClient.listProjects(), workspaceClient.getLimits()])
      .then(([result, limits]) => {
        if (active) setIsAdmin(Boolean(limits?.admin));
        if (!active) return;
        const rows = Array.isArray(result) ? result : result?.projects || [];
        setProjects(rows);
        setProjectId((current) => rows.some((project) => project.id === current) ? current : rows[0]?.id || "");
      })
      .catch((cause) => {
        if (active) setError(cause.message || "Could not load Cloud Workspace projects.");
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

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
    <div className="cloud-save-dialog-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget && !saving) onClose(); }}>
      <section className="cloud-save-dialog" role="dialog" aria-modal="true" aria-labelledby="cloud-save-dialog-title">
        <div className="cloud-save-dialog-header">
          <div>
            <h2 id="cloud-save-dialog-title">Save to Cloud Workspace</h2>
            <p>{isAdmin ? "Save this drawing and its embedded assets to a cloud project. Administrator accounts are exempt from the standard 2 MiB application limit." : "Save this drawing and its embedded assets to a cloud project. Standard accounts have a 2 MiB document limit."}</p>
          </div>
          <button type="button" className="cloud-save-dialog-close" aria-label="Close dialog" disabled={saving} onClick={onClose}>×</button>
        </div>
        {loading ? <div className="cloud-save-dialog-empty" role="status">Loading your cloud projects…</div> : projects.length ? (
          <form onSubmit={submit}>
            <div className="cloud-save-dialog-fields">
              <label htmlFor="cloud-save-name">Diagram name
                <input id="cloud-save-name" autoFocus required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} placeholder="e.g. System overview" />
              </label>
              <label htmlFor="cloud-save-project">Cloud project
                <select id="cloud-save-project" required value={projectId} onChange={(event) => setProjectId(event.target.value)}>
                  {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
                </select>
              </label>
            </div>
            {error && <p className="cloud-save-dialog-error" role="alert">{error}</p>}
            <div className="cloud-save-dialog-actions">
              <button type="button" disabled={saving} onClick={onClose}>Cancel</button>
              <button type="submit" className="primary" disabled={saving || !projectId || !name.trim()}>{saving ? "Saving…" : "Save to Cloud"}</button>
            </div>
          </form>
        ) : (
          <>
            <div className="cloud-save-dialog-empty">{error || "You don't have a Cloud Workspace project yet. Create a project first, then save this drawing to it."}</div>
            <div className="cloud-save-dialog-actions">
              <button type="button" onClick={onClose}>Cancel</button>
              <button type="button" className="primary" onClick={() => window.location.assign("/workspace")}>Open Cloud Workspace</button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
