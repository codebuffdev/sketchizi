import { useCallback, useEffect, useMemo, useState } from "react";
import { workspaceClient } from "./workspaceClient.js";
import "./workspace.css";

const dateLabel = (value) => value ? new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "Recently";

export default function WorkspaceDashboard({ user, onOpenEditor, onSignOut }) {
  const [projects, setProjects] = useState([]);
  const [activeId, setActiveId] = useState("");
  const [diagrams, setDiagrams] = useState([]);
  const [loading, setLoading] = useState(true);
  const [diagramLoading, setDiagramLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [projectName, setProjectName] = useState("");
  const [diagramName, setDiagramName] = useState("");
  const [projectForm, setProjectForm] = useState(false);
  const [diagramForm, setDiagramForm] = useState(false);
  const active = projects.find((p) => p.id === activeId) || null;
  const filtered = useMemo(() => projects.filter((p) => p.name.toLowerCase().includes(query.trim().toLowerCase())), [projects, query]);

  const reloadProjects = useCallback(async (preferred) => {
    setLoading(true); setError("");
    try {
      const result = await workspaceClient.listProjects();
      const rows = Array.isArray(result) ? result : result?.projects || [];
      setProjects(rows);
      setActiveId((current) => rows.some((p) => p.id === preferred) ? preferred : rows.some((p) => p.id === current) ? current : rows[0]?.id || "");
    } catch (e) { setError(e.message || "Could not load cloud projects."); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { reloadProjects(); }, [reloadProjects]);
  useEffect(() => {
    if (!activeId) { setDiagrams([]); return undefined; }
    let cancelled = false;
    setDiagramLoading(true);
    workspaceClient.listDiagrams(activeId).then((r) => { if (!cancelled) setDiagrams(Array.isArray(r) ? r : r?.diagrams || []); })
      .catch((e) => { if (!cancelled) setError(e.message || "Could not load diagrams."); })
      .finally(() => { if (!cancelled) setDiagramLoading(false); });
    return () => { cancelled = true; };
  }, [activeId]);

  const createProject = async (event) => {
    event.preventDefault(); if (!projectName.trim() || busy) return;
    setBusy(true); setError(""); setNotice("");
    try { const p = await workspaceClient.createProject({ name: projectName.trim(), description: "" }); setProjectName(""); setProjectForm(false); await reloadProjects(p.id); setNotice("Project created and saved to your cloud workspace."); }
    catch (e) { setError(e.message || "Could not create project."); } finally { setBusy(false); }
  };
  const createDiagram = async (event) => {
    event.preventDefault(); if (!active || !diagramName.trim() || busy) return;
    setBusy(true); setError(""); setNotice("");
    try {
      const createdResult = await workspaceClient.createDiagram({ projectId: active.id, name: diagramName.trim(), format: "excalidraw", document: { elements: [], appState: {}, files: {}, metadata: {}, extensions: {} } });
      const created = createdResult?.diagram || createdResult;
      setDiagramName(""); setDiagramForm(false);
      if (created?.id) {
        window.location.assign(`/?editor=1&cloudDiagramId=${encodeURIComponent(created.id)}&cloudProjectId=${encodeURIComponent(active.id)}`);
        return;
      }
      const rows = await workspaceClient.listDiagrams(active.id); setDiagrams(Array.isArray(rows) ? rows : rows?.diagrams || []);
      await reloadProjects(active.id); setNotice("Diagram created. Open it to begin editing.");
    } catch (e) { setError(e.message || "Could not create diagram."); } finally { setBusy(false); }
  };
  const renameProject = async (p) => {
    const name = window.prompt("Project name", p.name); if (name === null || !name.trim() || name.trim() === p.name) return;
    setBusy(true); setError("");
    try { await workspaceClient.updateProject(p.id, { name: name.trim(), description: p.description || "" }); await reloadProjects(p.id); setNotice("Project renamed."); }
    catch (e) { setError(e.message || "Could not rename project."); } finally { setBusy(false); }
  };
  const deleteProject = async (p) => {
    if (!window.confirm(`Delete "${p.name}" and all its diagrams? This cannot be undone.`)) return;
    setBusy(true); setError("");
    try { await workspaceClient.deleteProject(p.id); await reloadProjects(); setNotice("Project deleted."); }
    catch (e) { setError(e.message || "Could not delete project."); } finally { setBusy(false); }
  };
  const diagramAction = async (d, action) => {
    if (action === "rename") { const name = window.prompt("Diagram name", d.name); if (name === null || !name.trim() || name.trim() === d.name) return; d = { ...d, nextName: name.trim() }; }
    if (action === "delete" && !window.confirm(`Delete "${d.name}"? This cannot be undone.`)) return;
    setBusy(true); setError("");
    try {
      if (action === "rename") await workspaceClient.updateDiagram(d.id, { name: d.nextName, projectId: d.projectId });
      if (action === "duplicate") await workspaceClient.duplicateDiagram(d.id);
      if (action === "delete") await workspaceClient.deleteDiagram(d.id);
      const rows = await workspaceClient.listDiagrams(activeId); setDiagrams(Array.isArray(rows) ? rows : rows?.diagrams || []);
      await reloadProjects(activeId); setNotice(action === "duplicate" ? "Diagram duplicated." : action === "delete" ? "Diagram deleted." : "Diagram renamed.");
    } catch (e) { setError(e.message || `Could not ${action} diagram.`); } finally { setBusy(false); }
  };

  return <main className="cloud-workspace">
    <header className="cw-header"><a className="cw-brand" href="/" aria-label="Sketchizi"><span className="cw-brand-mark">S</span> Sketchizi <span className="cw-brand-sub">CLOUD WORKSPACE</span></a><div className="cw-header-actions"><span className="cw-user">{user?.name || user?.email || "Signed in"}</span><button className="cw-button cw-quiet" onClick={onOpenEditor}>Open editor</button><button className="cw-button cw-quiet" onClick={onSignOut}>Sign out</button></div></header>
    <section className="cw-content"><div className="cw-eyebrow">YOUR WORKSPACE</div><div className="cw-title-row"><div><h1>Cloud Workspace</h1><p>Your projects and diagrams, saved to your account.</p></div><button className="cw-button cw-primary" onClick={() => setProjectForm(!projectForm)}>+ New project</button></div>
      {error && <div className="cw-message cw-error" role="alert">{error}<button onClick={() => setError("")} aria-label="Dismiss">×</button></div>}{notice && <div className="cw-message cw-success" role="status">{notice}<button onClick={() => setNotice("")} aria-label="Dismiss">×</button></div>}
      {projectForm && <form className="cw-form" onSubmit={createProject}><label htmlFor="cw-project-name">Project name</label><input id="cw-project-name" autoFocus maxLength={120} required value={projectName} onChange={(e) => setProjectName(e.target.value)} placeholder="e.g. E-commerce architecture"/><div className="cw-form-actions"><button type="button" className="cw-button cw-quiet" onClick={() => setProjectForm(false)}>Cancel</button><button className="cw-button cw-primary" disabled={busy}>{busy ? "Creating…" : "Create project"}</button></div></form>}
      <div className="cw-toolbar"><strong>PROJECTS <span>{projects.length}</span></strong><input aria-label="Search projects" className="cw-search" placeholder="Search projects…" value={query} onChange={(e) => setQuery(e.target.value)}/></div>
      {loading ? <div className="cw-loading">Loading your workspace…</div> : projects.length === 0 ? <div className="cw-empty"><div className="cw-empty-icon">▦</div><h2>Your workspace starts here</h2><p>Create a project to keep your architecture diagrams together. Projects are private to your account.</p><button className="cw-button cw-primary" onClick={() => setProjectForm(true)}>Create your first project</button></div> : <div className="cw-layout">
        <aside className="cw-project-list" aria-label="Projects">{filtered.map((p) => <article className={p.id === activeId ? "cw-project is-active" : "cw-project"} key={p.id}><button className="cw-project-select" onClick={() => setActiveId(p.id)}><span className="cw-project-icon">▦</span><span><b>{p.name}</b><small>{p.diagramCount ?? 0} diagrams · {dateLabel(p.updatedAt)}</small></span></button><div className="cw-project-actions"><button disabled={busy} onClick={() => renameProject(p)}>Rename</button><button disabled={busy} onClick={() => deleteProject(p)}>Delete</button></div></article>)}{!filtered.length && <p className="cw-muted">No matching projects.</p>}</aside>
        <section className="cw-diagrams">{active ? <><div className="cw-diagram-heading"><div><div className="cw-eyebrow">PROJECT</div><h2>{active.name}</h2><p>{active.description || "Diagrams in this project"}</p></div><button className="cw-button cw-primary" onClick={() => setDiagramForm(!diagramForm)}>+ New diagram</button></div>
          {diagramForm && <form className="cw-form" onSubmit={createDiagram}><label htmlFor="cw-diagram-name">Diagram name</label><input id="cw-diagram-name" autoFocus maxLength={120} required value={diagramName} onChange={(e) => setDiagramName(e.target.value)} placeholder="e.g. System overview"/><div className="cw-form-actions"><button type="button" className="cw-button cw-quiet" onClick={() => setDiagramForm(false)}>Cancel</button><button className="cw-button cw-primary" disabled={busy}>{busy ? "Creating…" : "Create diagram"}</button></div></form>}
          {diagramLoading ? <div className="cw-loading">Loading diagrams…</div> : diagrams.length ? <div className="cw-diagram-grid">{diagrams.map((d) => <article className="cw-diagram-card" key={d.id}><div className="cw-diagram-preview"><span/><i/><span/></div><div className="cw-diagram-body"><b>{d.name}</b><small>{d.format} · {dateLabel(d.updatedAt)}</small><div className="cw-diagram-actions"><button disabled={busy} onClick={() => window.location.assign(`/?editor=1&cloudDiagramId=${encodeURIComponent(d.id)}&cloudProjectId=${encodeURIComponent(activeId)}`)}>Open</button><button disabled={busy} onClick={() => diagramAction(d,"rename")}>Rename</button><button disabled={busy} onClick={() => diagramAction(d,"duplicate")}>Duplicate</button><button disabled={busy} onClick={() => diagramAction(d,"delete")}>Delete</button></div></div></article>)}</div> : <div className="cw-empty cw-empty-small"><div className="cw-empty-icon">◇</div><h3>No diagrams yet</h3><p>Create a diagram to start building this project.</p><button className="cw-button cw-quiet" onClick={() => setDiagramForm(true)}>Create diagram</button></div>}
        </> : <div className="cw-empty cw-empty-small"><h3>Select a project</h3></div>}</section></div>}
      <footer className="cw-footnote"><span/> Cloud storage · PostgreSQL · Private to your account</footer>
    </section>
  </main>;
}
