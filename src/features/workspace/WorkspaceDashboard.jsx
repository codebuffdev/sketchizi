import { useCallback, useEffect, useMemo, useState } from "react";
import AuthenticationControl from "../auth/AuthenticationControl.jsx";
import { buildBlankWorkspaceDocument, workspaceClient } from "./workspaceClient.js";
import "./workspace.css";

function dateLabel(value) {
  if (!value) return "Not saved yet";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Recently updated" : date.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function Icon({ name }) {
  if (name === "folder") return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3.5 6.5h6l2 2H20v9.2a1.8 1.8 0 0 1-1.8 1.8H5.3a1.8 1.8 0 0 1-1.8-1.8z"/><path d="M3.5 8.5H20"/></svg>;
  if (name === "diagram") return <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="3" width="7" height="6" rx="1.5"/><rect x="14" y="15" width="7" height="6" rx="1.5"/><rect x="3" y="15" width="7" height="6" rx="1.5"/><path d="M6.5 9v3h11v3M10 18h4"/></svg>;
  return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"/></svg>;
}

export default function WorkspaceDashboard({ user, onOpenLocalEditor, onOpenDiagram }) {
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [diagrams, setDiagrams] = useState([]);
  const [loadingProjects, setLoadingProjects] = useState(Boolean(user));
  const [loadingDiagrams, setLoadingDiagrams] = useState(false);
  const [error, setError] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectDescription, setProjectDescription] = useState("");
  const [diagramName, setDiagramName] = useState("");
  const [busy, setBusy] = useState(false);
  const [renamingId, setRenamingId] = useState("");
  const [renameValue, setRenameValue] = useState("");

  const selectedProject = useMemo(() => projects.find((project) => project.id === selectedProjectId) || null, [projects, selectedProjectId]);

  const reloadProjects = useCallback(async (preferredId) => {
    if (!user) return;
    setLoadingProjects(true);
    try {
      const rows = await workspaceClient.listProjects();
      setProjects(rows);
      const target = preferredId && rows.some((item) => item.id === preferredId) ? preferredId
        : rows.some((item) => item.id === selectedProjectId) ? selectedProjectId
        : rows[0]?.id || "";
      setSelectedProjectId(target);
      setError("");
    } catch (requestError) {
      setError(requestError.message || "Could not load your projects.");
    } finally {
      setLoadingProjects(false);
    }
  }, [selectedProjectId, user]);

  useEffect(() => { reloadProjects(); }, [reloadProjects]);

  useEffect(() => {
    let cancelled = false;
    if (!user || !selectedProjectId) { setDiagrams([]); return undefined; }
    setLoadingDiagrams(true);
    workspaceClient.listDiagrams(selectedProjectId).then((rows) => {
      if (!cancelled) { setDiagrams(rows); setError(""); }
    }).catch((requestError) => {
      if (!cancelled) setError(requestError.message || "Could not load this project's diagrams.");
    }).finally(() => { if (!cancelled) setLoadingDiagrams(false); });
    return () => { cancelled = true; };
  }, [selectedProjectId, user]);

  const createProject = async (event) => {
    event.preventDefault();
    if (busy || !projectName.trim()) return;
    setBusy(true); setError("");
    try {
      const project = await workspaceClient.createProject({ name: projectName.trim(), description: projectDescription.trim() });
      setProjectName(""); setProjectDescription("");
      await reloadProjects(project.id);
    } catch (requestError) { setError(requestError.message || "Could not create the project."); }
    finally { setBusy(false); }
  };

  const createDiagram = async (event) => {
    event.preventDefault();
    if (busy || !selectedProject || !diagramName.trim()) return;
    setBusy(true); setError("");
    try {
      const diagram = await workspaceClient.createDiagram({
        projectId: selectedProject.id,
        name: diagramName.trim(),
        format: "excalidraw",
        document: buildBlankWorkspaceDocument(),
      });
      setDiagramName("");
      onOpenDiagram(diagram);
    } catch (requestError) { setError(requestError.message || "Could not create the diagram."); }
    finally { setBusy(false); }
  };

  const renameProject = async (event) => {
    event.preventDefault();
    if (!renamingId || !renameValue.trim() || busy) return;
    setBusy(true); setError("");
    try {
      const project = projects.find((item) => item.id === renamingId);
      await workspaceClient.updateProject(renamingId, { name: renameValue.trim(), description: project?.description || "" });
      setRenamingId("");
      await reloadProjects(renamingId);
    } catch (requestError) { setError(requestError.message || "Could not rename the project."); }
    finally { setBusy(false); }
  };

  const deleteProject = async (project) => {
    if (busy || !window.confirm('Delete "' + project.name + '" and all diagrams inside it? This cannot be undone.')) return;
    setBusy(true); setError("");
    try {
      await workspaceClient.deleteProject(project.id);
      await reloadProjects(selectedProjectId === project.id ? "" : selectedProjectId);
    } catch (requestError) { setError(requestError.message || "Could not delete the project."); }
    finally { setBusy(false); }
  };

  const duplicateDiagram = async (diagram) => {
    if (busy) return;
    setBusy(true); setError("");
    try {
      await workspaceClient.duplicateDiagram(diagram.id, diagram.name + " copy");
      const rows = await workspaceClient.listDiagrams(selectedProjectId);
      setDiagrams(rows);
    } catch (requestError) { setError(requestError.message || "Could not duplicate the diagram."); }
    finally { setBusy(false); }
  };

  const deleteDiagram = async (diagram) => {
    if (busy || !window.confirm('Delete "' + diagram.name + '"? This cannot be undone.')) return;
    setBusy(true); setError("");
    try {
      await workspaceClient.deleteDiagram(diagram.id);
      setDiagrams((current) => current.filter((item) => item.id !== diagram.id));
      await reloadProjects(selectedProjectId);
    } catch (requestError) { setError(requestError.message || "Could not delete the diagram."); }
    finally { setBusy(false); }
  };

  return (
    <main className="workspace-dashboard">
      <header className="workspace-topbar">
        <a className="workspace-brand" href="/" aria-label="Sketchizi home"><img src="/sketchizi-logo.svg" alt="" /><span>Sketchizi</span></a>
        <div className="workspace-topbar-middle"><span className="workspace-eyebrow">YOUR CLOUD SPACE</span><strong>Workspace</strong></div>
        <div className="workspace-topbar-actions"><button className="workspace-local-button" type="button" onClick={onOpenLocalEditor}>Open local editor</button><AuthenticationControl /></div>
      </header>

      <section className="workspace-hero">
        <div>
          <span className="workspace-eyebrow">PROJECT HUB</span>
          <h1>Your ideas, organized.</h1>
          <p>Keep architecture diagrams and technical designs in one place. Changes to cloud diagrams are saved automatically in your account.</p>
        </div>
        {user && <div className="workspace-user-card"><span className="workspace-avatar">{(user.name || user.email || "S").trim().slice(0,1).toUpperCase()}</span><div><strong>{user.name || "Welcome back"}</strong><span>{user.email || "Signed in to Sketchizi"}</span></div></div>}
      </section>

      {!user ? (
        <section className="workspace-signin-panel">
          <div className="workspace-panel-icon"><Icon name="folder" /></div>
          <h2>Sign in to access cloud projects</h2>
          <p>Your local editor remains available without an account. Sign in to create and save cloud projects.</p>
          <button type="button" className="workspace-primary-button" onClick={() => window.location.assign("/api/auth/login/google?returnTo=%2Fworkspace")}>Sign in with Google</button>
          <button type="button" className="workspace-link-button" onClick={onOpenLocalEditor}>Continue locally</button>
        </section>
      ) : (
        <section className="workspace-content">
          <aside className="workspace-projects-panel">
            <div className="workspace-section-heading"><div><span className="workspace-eyebrow">LIBRARY</span><h2>Projects</h2></div><span className="workspace-count">{projects.length}</span></div>
            <form className="workspace-create-project-form" onSubmit={createProject}>
              <input aria-label="New project name" placeholder="Project name" maxLength={120} value={projectName} onChange={(event) => setProjectName(event.target.value)} required />
              <textarea aria-label="Project description (optional)" placeholder="Short description (optional)" maxLength={1000} rows={2} value={projectDescription} onChange={(event) => setProjectDescription(event.target.value)} />
              <button className="workspace-primary-button" type="submit" disabled={busy || !projectName.trim()}><Icon name="plus" /> Create project</button>
            </form>
            {loadingProjects ? <div className="workspace-empty">Loading projects…</div> : projects.length === 0 ? (
              <div className="workspace-empty"><Icon name="folder" /><strong>No projects yet</strong><span>Create a project to organize your first cloud diagram.</span></div>
            ) : (
              <div className="workspace-project-list">
                {projects.map((project) => (
                  <article key={project.id} className={project.id === selectedProjectId ? "workspace-project-item selected" : "workspace-project-item"}>
                    {renamingId === project.id ? (
                      <form onSubmit={renameProject} className="workspace-rename-form">
                        <input aria-label="New project name" value={renameValue} maxLength={120} onChange={(event) => setRenameValue(event.target.value)} autoFocus />
                        <button type="submit" disabled={busy || !renameValue.trim()}>Save</button>
                        <button type="button" onClick={() => setRenamingId("")}>Cancel</button>
                      </form>
                    ) : (
                      <>
                        <button type="button" className="workspace-project-select" onClick={() => setSelectedProjectId(project.id)}>
                          <Icon name="folder" /><span><strong>{project.name}</strong><small>{project.diagramCount} {project.diagramCount === 1 ? "diagram" : "diagrams"} · {dateLabel(project.updatedAt)}</small></span>
                        </button>
                        <div className="workspace-project-actions">
                          <button type="button" aria-label={"Rename " + project.name} title="Rename project" onClick={() => { setRenamingId(project.id); setRenameValue(project.name); }}>Rename</button>
                          <button type="button" aria-label={"Delete " + project.name} title="Delete project" onClick={() => deleteProject(project)}>Delete</button>
                        </div>
                      </>
                    )}
                  </article>
                ))}
              </div>
            )}
          </aside>

          <section className="workspace-diagrams-panel">
            {!selectedProject ? (
              <div className="workspace-no-selection"><div className="workspace-panel-icon"><Icon name="diagram" /></div><h2>Select or create a project</h2><p>Your project's diagrams will appear here.</p></div>
            ) : (
              <>
                <div className="workspace-section-heading workspace-diagrams-heading"><div><span className="workspace-eyebrow">PROJECT</span><h2>{selectedProject.name}</h2><p>{selectedProject.description || "Your cloud diagrams and technical designs."}</p></div><span className="workspace-count">{diagrams.length}</span></div>
                <form className="workspace-create-diagram-form" onSubmit={createDiagram}>
                  <input aria-label="New diagram name" placeholder="Name your new diagram" maxLength={120} value={diagramName} onChange={(event) => setDiagramName(event.target.value)} required />
                  <button type="submit" className="workspace-primary-button" disabled={busy || !diagramName.trim()}><Icon name="plus" /> New diagram</button>
                </form>
                {loadingDiagrams ? <div className="workspace-empty">Loading diagrams…</div> : diagrams.length === 0 ? (
                  <div className="workspace-empty workspace-empty-large"><Icon name="diagram" /><strong>This project is ready</strong><span>Create a diagram to start designing. Cloud diagrams are kept in your account and can be opened on another device.</span></div>
                ) : (
                  <div className="workspace-diagram-grid">
                    {diagrams.map((diagram) => (
                      <article className="workspace-diagram-card" key={diagram.id}>
                        <button type="button" className="workspace-diagram-open" onClick={() => onOpenDiagram(diagram)}>
                          <span className="workspace-diagram-preview"><Icon name="diagram" /></span>
                          <strong>{diagram.name}</strong>
                          <span className="workspace-diagram-meta">{diagram.format === "sketchizi" ? "Sketchizi diagram" : "Excalidraw diagram"} · v{diagram.revision}</span>
                          <span className="workspace-diagram-meta">Updated {dateLabel(diagram.updatedAt)}</span>
                        </button>
                        <div className="workspace-diagram-actions">
                          <button type="button" onClick={() => duplicateDiagram(diagram)} disabled={busy}>Duplicate</button>
                          <button type="button" onClick={() => deleteDiagram(diagram)} disabled={busy}>Delete</button>
                        </div>
                      </article>
                    ))}
                  </div>
                )}
              </>
            )}
            {error && <div className="workspace-error" role="alert">{error}<button type="button" onClick={() => reloadProjects(selectedProjectId)}>Retry</button></div>}
          </section>
        </section>
      )}
      <footer className="workspace-footer"><span>Sketchizi Workspace</span><span>Cloud storage · Private to your account</span></footer>
    </main>
  );
}
