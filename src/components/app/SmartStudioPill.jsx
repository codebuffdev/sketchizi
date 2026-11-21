import { useCallback, useEffect, useId, useRef, useState } from "react";
import { getSmartStudioPresentation } from "../../features/architecture/architectureContextDetection.js";
import { useDrawerPresence } from "../../features/navigation/useDrawerPresence.js";

export const SMART_STUDIO_EXIT_MS = 150;

function StudioGlyph({ name, size = 14 }) {
  const common = {
    viewBox: "0 0 24 24", width: size, height: size, fill: "none", stroke: "currentColor",
    strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": "true", focusable: "false",
  };
  if (name === "kubernetes") {
    return <svg {...common}><path d="M12 2.8 19.6 6.5l1.9 8.2-5.3 6.6H7.8l-5.3-6.6 1.9-8.2L12 2.8Z" /><circle cx="12" cy="12" r="2.4" /><path d="M12 9.6V6M14.1 10.8l3-1.9M14.1 13.2l3 1.9M12 14.4V18M9.9 13.2l-3 1.9M9.9 10.8l-3-1.9" /></svg>;
  }
  if (name === "docker") {
    return <svg {...common}><path d="M2.5 12.5h17.6c1.2 0 2-.5 2.4-1.5-.8-.2-1.4-.7-1.6-1.6-.9.3-1.7.1-2.3-.5" /><path d="M3 12.5c.4 3.8 3 6 7.2 6 4.7 0 8-2.3 9.3-6" /><rect x="5" y="8.8" width="2.6" height="2.4" /><rect x="8.2" y="8.8" width="2.6" height="2.4" /><rect x="11.4" y="8.8" width="2.6" height="2.4" /><rect x="8.2" y="6" width="2.6" height="2.4" /><rect x="11.4" y="6" width="2.6" height="2.4" /></svg>;
  }
  if (name === "review") {
    return <svg {...common}><path d="M4 5h16M4 12h10M4 19h7" /><path d="m16.5 17 1.8 1.8 3.2-3.6" /></svg>;
  }
  return <svg {...common}><path d="M12 3 4 6.2v5.2c0 4.5 3.2 8 8 9.6 4.8-1.6 8-5.1 8-9.6V6.2L12 3Z" /><path d="m8.8 12.1 2.2 2.2 4.2-4.6" /></svg>;
}

const MENU_ITEMS = [
  { id: "validate", glyph: "architecture", label: "Run Architecture Validation", hint: "Check relationships and rules", handler: "onRunValidation" },
  { id: "kubernetes", glyph: "kubernetes", label: "Open Kubernetes Studio / Export YAML", hint: "Author, validate, export", handler: "onOpenKubernetesStudio" },
  { id: "docker", glyph: "docker", label: "Open Docker Compose Studio", hint: "Edit and diagram Compose", handler: "onOpenDockerComposeStudio" },
  { id: "review", glyph: "review", label: "System Design Review", hint: "Resilience and recommendations", handler: "onOpenSystemDesignReview" },
];

/**
 * Contextual "Smart Studio" pill.
 *
 * Renders nothing for plain sketches and notes. When the scene contains
 * infrastructure nodes it springs in beside the AI button and opens a compact
 * quick-launch popover for the engineering studios.
 */
export default function SmartStudioPill({
  context = null,
  validation = null,
  isZenMode = false,
  onBeforeOpen,
  onRunValidation,
  onOpenKubernetesStudio,
  onOpenDockerComposeStudio,
  onOpenSystemDesignReview,
}) {
  const handlers = { onRunValidation, onOpenKubernetesStudio, onOpenDockerComposeStudio, onOpenSystemDesignReview };
  const visible = Boolean(context) && !isZenMode;
  const { present, phase } = useDrawerPresence(visible, SMART_STUDIO_EXIT_MS);
  const lastContextRef = useRef(context);
  if (context) lastContextRef.current = context;
  const renderedContext = context || lastContextRef.current;
  const presentation = getSmartStudioPresentation(renderedContext);

  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);
  const menuId = useId();

  const closeMenu = useCallback((restoreFocus = false) => {
    setOpen(false);
    if (restoreFocus) requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  useEffect(() => {
    if (!visible) setOpen(false);
  }, [visible]);

  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event) => {
      if (!(event.target instanceof Node)) return;
      if (rootRef.current?.contains(event.target)) return;
      setOpen(false);
    };
    const onKeyDown = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      closeMenu(true);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [open, closeMenu]);

  useEffect(() => {
    if (!open) return;
    const frame = requestAnimationFrame(() => menuRef.current?.querySelector("button")?.focus());
    return () => cancelAnimationFrame(frame);
  }, [open]);

  if (!present || !presentation) return null;

  const errorCount = Array.isArray(validation?.errors) ? validation.errors.length : 0;
  const warningCount = Array.isArray(validation?.warnings) ? validation.warnings.length : 0;
  const issueCount = errorCount + warningCount;
  const hasIssues = issueCount > 0;
  const statusLabel = hasIssues
    ? `${issueCount} validation ${issueCount === 1 ? "issue" : "issues"}`
    : "No validation issues";

  const onMenuKeyDown = (event) => {
    const items = [...(menuRef.current?.querySelectorAll("button") || [])];
    if (!items.length) return;
    const index = items.indexOf(document.activeElement);
    if (event.key === "ArrowDown") {
      event.preventDefault();
      items[(index + 1) % items.length].focus();
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      items[(index - 1 + items.length) % items.length].focus();
    } else if (event.key === "Home") {
      event.preventDefault();
      items[0].focus();
    } else if (event.key === "End") {
      event.preventDefault();
      items[items.length - 1].focus();
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  };

  return (
    <div
      ref={rootRef}
      className="smart-studio"
      data-smart-studio-context={renderedContext}
      data-motion={visible ? phase : "exit"}
    >
      <button
        ref={triggerRef}
        type="button"
        className={`smart-studio-pill${open ? " is-open" : ""}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        aria-label={`${presentation.label}. ${statusLabel}`}
        title={presentation.title}
        onClick={() => {
          if (!open) onBeforeOpen?.();
          setOpen((current) => !current);
        }}
      >
        <StudioGlyph name={presentation.icon} />
        <span className="smart-studio-pill-label">{presentation.label}</span>
        <span
          className={`smart-studio-status${hasIssues ? " has-issues" : " is-valid"}`}
          data-status={hasIssues ? "issues" : "valid"}
          aria-hidden="true"
        >
          <span className="smart-studio-dot" />
          {hasIssues && <span className="smart-studio-count">{issueCount > 99 ? "99+" : issueCount}</span>}
        </span>
      </button>

      {open && (
        <div
          ref={menuRef}
          id={menuId}
          className="smart-studio-popover"
          role="menu"
          aria-label="Studio quick launch"
          onKeyDown={onMenuKeyDown}
        >
          {MENU_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="menuitem"
              className="smart-studio-item"
              data-smart-studio-action={item.id}
              onClick={() => {
                closeMenu();
                handlers[item.handler]?.();
              }}
            >
              <span className="smart-studio-item-icon"><StudioGlyph name={item.glyph} size={15} /></span>
              <span className="smart-studio-item-copy">
                <strong>{item.label}</strong>
                <small>{item.hint}</small>
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
