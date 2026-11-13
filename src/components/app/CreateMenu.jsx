import { useEffect, useRef, useState } from "react";

/**
 * One canvas-first entry point for creating drawings. Advanced studios remain
 * available, but are no longer the first thing someone sees.
 */
export default function CreateMenu({
  onBlankDrawing,
  onTemplates,
  onCloudWorkspace,
  onKubernetesStudio,
  onDockerStudio,
  onBeforeOpen,
  dismissWhen = false,
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  useEffect(() => {
    if (dismissWhen) setOpen(false);
  }, [dismissWhen]);

  useEffect(() => {
    if (!open) return undefined;

    const items = () => [...(menuRef.current?.querySelectorAll('[role="menuitem"]') || [])];
    const onPointerDown = (event) => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        setOpen(false);
        triggerRef.current?.focus();
        return;
      }
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const options = items();
      if (!options.length) return;
      event.preventDefault();
      const current = options.indexOf(document.activeElement);
      const next = event.key === "Home" ? 0
        : event.key === "End" ? options.length - 1
        : event.key === "ArrowDown" ? (current + 1) % options.length
        : (current <= 0 ? options.length - 1 : current - 1);
      options[next]?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    // Excalidraw handles Escape in document-level listeners. Capture at window
    // so the Create menu can dismiss before those handlers consume the key.
    window.addEventListener("keydown", onKeyDown, true);
    items()[0]?.focus();
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open]);

  const choose = (callback) => {
    setOpen(false);
    callback?.();
  };

  const toggle = () => {
    if (open) {
      setOpen(false);
      return;
    }
    onBeforeOpen?.();
    setOpen(true);
  };

  return (
    <div className="devops-studio-menu create-design-menu sketchizi-create-menu" ref={rootRef}>
      <button
        ref={triggerRef}
        type="button"
        className={open ? "design-studio-header-toggle active" : "design-studio-header-toggle"}
        onClick={toggle}
        title="Create a drawing or open a design workspace"
        aria-label="Create drawing"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <svg className="workspaces-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
        <span>Create</span>
        <svg className="devops-studio-chevron" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4.5 6 3.5 3.5L11.5 6" /></svg>
      </button>
      {open && (
        <div ref={menuRef} className="devops-studio-dropdown create-design-dropdown" role="menu" aria-label="Create a drawing">
          <div className="sketchizi-create-menu-heading">Draw</div>
          <button type="button" role="menuitem" className="sketchizi-blank-drawing-menu-item" onClick={() => choose(onBlankDrawing)}>
            <span className="create-design-menu-icon" aria-hidden="true">＋</span>
            <span><strong>Blank drawing</strong><small>Start with an empty canvas</small></span>
          </button>
          <button type="button" role="menuitem" className="design-studio-menu-item" onClick={() => choose(onTemplates)}>
            <span className="create-design-menu-icon" aria-hidden="true">◇</span>
            <span><strong>Templates</strong><small>Flowcharts, mind maps, and diagrams</small></span>
          </button>
          <div className="sketchizi-create-menu-heading">Engineering tools</div>
          <button type="button" role="menuitem" className="kubernetes-studio-menu-item" onClick={() => choose(onKubernetesStudio)}>
            <span className="create-design-menu-icon" aria-hidden="true"><img src="/icons/kubernetes.svg" alt="" width="22" height="22" /></span>
            <span><strong>Kubernetes Studio</strong><small>Import and visualize manifests</small></span>
          </button>
          <button type="button" role="menuitem" className="docker-compose-studio-menu-item" onClick={() => choose(onDockerStudio)}>
            <span className="create-design-menu-icon" aria-hidden="true"><img src="/icons/docker.svg" alt="" width="22" height="22" /></span>
            <span><strong>Docker Compose Studio</strong><small>Visualize services and connections</small></span>
          </button>
          <div className="sketchizi-create-menu-heading">Your files</div>
          <button type="button" role="menuitem" className="cloud-workspace-menu-item" onClick={() => choose(onCloudWorkspace)}>
            <span className="create-design-menu-icon" aria-hidden="true">☁</span>
            <span><strong>Cloud Workspace</strong><small>Open saved projects and drawings</small></span>
          </button>
        </div>
      )}
    </div>
  );
}
