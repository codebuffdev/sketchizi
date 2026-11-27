import React, { useCallback, useEffect, useRef, useState } from "react";
import { strokeWidthAppStatePatch } from "../../features/canvas/strokeWidthKey.js";
import { insertPresetShape } from "../../features/canvas/presetShapeInsertion.js";
import { DockIcon } from "./primaryDockIcons.jsx";
import {
  DOCK_SLOTS,
  HIGHLIGHTER_DEFAULTS,
  defaultSlotMemory,
  findChild,
  findSlot,
  isGroupedSlot,
  isPersistentTool,
  resolveActiveChild,
  sectionBreakAfter,
  tooltipLabel,
} from "./primaryDockModel.js";
import { INSERT_IMAGE_EVENT } from "../../features/canvas/imageImport/imageImportModel.js";

// Grace period before the dock collapses after the pointer leaves it.
const COLLAPSE_GRACE_MS = 3000;
// Child rail timings (mouse only).
const CHILD_OPEN_INTENT_MS = 90;
const CHILD_CLOSE_GRACE_MS = 160;
const SINGLE_TOOLTIP_DELAY_MS = 180;
const CUSTOM_TOOLS = ["bucketfill", "autoshape", "highlighter", "codeblock"];

function activateTool({ child, root, apiRef }) {
  const api = apiRef.current;
  if (child.tool === "image") {
    // The canvas's role-aware image import owns the picker (size limits + shrink prompt).
    if (!window.dispatchEvent(new CustomEvent(INSERT_IMAGE_EVENT, { cancelable: true }))) return;
    const imageButton = root?.querySelector('.excalidraw [data-testid="toolbar-image"], .excalidraw button[aria-label*="image" i]');
    if (imageButton instanceof HTMLElement) imageButton.click();
    else api?.setActiveTool?.({ type: "image" });
    return;
  }
  api?.setActiveTool?.({ type: child.tool });
}

export default function PrimaryDock({
  rootRef,
  apiRef,
  selectedElements = [],
  canEdit = true,
  isDarkTheme = false,
  canvasRevision = 0,
  nativeMenuOpen = false,
  onToolStyleChange = null,
  onOpenTodoTab = null,
}) {
  const [activeTool, setActiveTool] = useState(() => apiRef.current?.getAppState?.()?.activeTool?.type || "selection");
  const [customTool, setCustomTool] = useState(null);
  const [expanded, setExpanded] = useState(false);
  const [slotMemory, setSlotMemory] = useState(defaultSlotMemory);
  const [openSlotId, setOpenSlotId] = useState(null);
  const [railArrowOffset, setRailArrowOffset] = useState(0);
  const [tooltip, setTooltip] = useState(null);

  const navRef = useRef(null);
  const customToolRef = useRef(null);
  const highlighterSavedRef = useRef(null);
  const collapseTimerRef = useRef(null);
  const openTimerRef = useRef(null);
  const closeTimerRef = useRef(null);
  const tooltipTimerRef = useRef(null);
  const pinnedRef = useRef(false);
  const openSlotRef = useRef(null);
  const slotButtonRefs = useRef({});
  const activeButtonRef = useRef(null);
  const firstSlotButtonRef = useRef(null);

  openSlotRef.current = openSlotId;
  customToolRef.current = customTool;

  useEffect(() => {
    const nextTool = apiRef.current?.getAppState?.()?.activeTool?.type;
    if (nextTool) setActiveTool(nextTool);
  }, [apiRef, canvasRevision]);

  /* ---------------------------------------------------------------- highlighter */
  const restoreHighlighter = () => {
    const saved = highlighterSavedRef.current;
    highlighterSavedRef.current = null;
    if (!saved) return;
    apiRef.current?.updateScene?.({ appState: { currentItemStrokeColor: saved.strokeColor, currentItemOpacity: saved.opacity, ...strokeWidthAppStatePatch(saved.strokeWidth) } });
  };

  // Leaving freedraw by any route (shortcut, native toolbar) ends highlighter mode.
  useEffect(() => {
    if (customTool === "highlighter" && activeTool !== "freedraw") {
      setCustomTool(null);
      restoreHighlighter();
      window.dispatchEvent(new CustomEvent("sketchizi:clear-custom-tool"));
    }
  }, [activeTool, customTool]);

  useEffect(() => {
    const syncCustomTool = (event) => {
      const tool = String(event.detail?.tool || "").toLowerCase();
      if (!CUSTOM_TOOLS.includes(tool)) return;
      // Another custom tool (e.g. "C" for Code Block) taking over ends highlighter mode cleanly.
      if (customToolRef.current === "highlighter" && tool !== "highlighter") restoreHighlighter();
      setCustomTool(tool);
    };
    const clearCustomTool = (event) => {
      // Highlighter is a persistent drawing mode; canvas clicks must not end it.
      if (customToolRef.current === "highlighter") return;
      if (!event.target?.closest?.(".sketchizi-tool-sidebar button")) setCustomTool(null);
    };
    // The Code Block layer disarms itself after placing a card (or on Esc).
    const clearCodeBlockTool = () => { if (customToolRef.current === "codeblock") setCustomTool(null); };
    window.addEventListener("sketchizi:activate-tool", syncCustomTool);
    window.addEventListener("sketchizi:clear-custom-tool", clearCodeBlockTool);
    window.addEventListener("click", clearCustomTool, true);
    return () => {
      window.removeEventListener("sketchizi:activate-tool", syncCustomTool);
      window.removeEventListener("sketchizi:clear-custom-tool", clearCodeBlockTool);
      window.removeEventListener("click", clearCustomTool, true);
    };
  }, []);

  /* ---------------------------------------------------------------- timers */
  const clearTimer = (ref) => { if (ref.current) window.clearTimeout(ref.current); ref.current = null; };
  useEffect(() => () => {
    [collapseTimerRef, openTimerRef, closeTimerRef, tooltipTimerRef].forEach(clearTimer);
  }, []);

  /* ---------------------------------------------------------------- selection-derived presentation */
  const appState = apiRef.current?.getAppState?.() || {};
  const selectedIds = Object.entries(appState.selectedElementIds || {})
    .filter(([, isSelected]) => isSelected)
    .map(([id]) => id);
  const liveSelectedElements = (apiRef.current?.getSceneElements?.() || []).filter((element) =>
    selectedIds.includes(element.id) && element && !element.isDeleted && !element.deleted,
  );
  const hasLiveSelectionState = appState.selectedElementIds && typeof appState.selectedElementIds === "object";
  const selected = hasLiveSelectionState
    ? liveSelectedElements
    : selectedElements.filter((element) => element && !element.isDeleted && !element.deleted);
  const selectedType = selected.length > 0 && selected.every((element) => element.type === selected[0].type)
    ? selected[0].type
    : null;
  const selectedRounded = selectedType === "rectangle" && Boolean(selected[0]?.roundness);

  const activeChild = resolveActiveChild({ activeToolType: activeTool, customTool, selectedType, selectedRounded, slotMemory });
  const activeSlotId = activeChild?.slotId || null;
  const activeId = customTool || activeTool;
  const pillChild = activeChild || findChild("select");

  /* ---------------------------------------------------------------- collapse */
  const previousActiveIdRef = useRef(activeId);
  const selectionKey = selected.map((element) => element.id).sort().join("|");
  const previousSelectionKeyRef = useRef(selectionKey);
  const cancelCollapseTimer = () => clearTimer(collapseTimerRef);

  const closeRail = useCallback(() => {
    clearTimer(openTimerRef);
    clearTimer(closeTimerRef);
    pinnedRef.current = false;
    setOpenSlotId(null);
  }, []);

  // Any change of the active tool (click or keyboard shortcut) collapses the
  // dock, EXCEPT while a touch-pinned child rail is open: the tap that opened it
  // also activated the remembered tool, and collapsing then would hide the rail
  // the user is about to use. Focus is deliberately left alone.
  useEffect(() => {
    if (previousActiveIdRef.current === activeId) return;
    previousActiveIdRef.current = activeId;
    if (pinnedRef.current) return;
    cancelCollapseTimer();
    closeRail();
    setExpanded(false);
  }, [activeId, closeRail]);
  useEffect(() => {
    if (previousSelectionKeyRef.current === selectionKey) return;
    previousSelectionKeyRef.current = selectionKey;
    if (pinnedRef.current) return;
    cancelCollapseTimer();
    closeRail();
    setExpanded(false);
  }, [selectionKey, closeRail]);

  const expandDock = () => {
    cancelCollapseTimer();
    setExpanded(true);
  };
  // Touch / hover-less devices emit a synthetic mouseenter right before click.
  // Ignore it so the pill is a true tap-to-toggle instead of expand-then-collapse.
  const canHover = () => typeof window === "undefined" || !window.matchMedia?.("(hover: none)").matches;
  const hoverExpand = () => { if (canHover()) expandDock(); };
  const collapseDock = useCallback((returnFocus = true) => {
    cancelCollapseTimer();
    closeRail();
    setTooltip(null);
    setExpanded(false);
    if (returnFocus) window.requestAnimationFrame(() => activeButtonRef.current?.focus());
  }, [closeRail]);
  const scheduleCollapse = () => {
    cancelCollapseTimer();
    collapseTimerRef.current = window.setTimeout(() => {
      closeRail();
      setExpanded(false);
      collapseTimerRef.current = null;
    }, COLLAPSE_GRACE_MS);
  };
  const hoverCollapse = () => { if (canHover() && !pinnedRef.current) scheduleCollapse(); };
  const handleExpandClick = () => {
    if (!canHover() && expanded) { collapseDock(); return; }
    expandDock();
    window.requestAnimationFrame(() => firstSlotButtonRef.current?.focus());
  };

  // "\" toggles the dock immediately (ignored while typing or with modifiers).
  useEffect(() => {
    const onKeyDown = (event) => {
      if (event.key !== "\\" || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target?.isContentEditable) return;
      event.preventDefault();
      setExpanded((value) => {
        if (value) { collapseDock(false); return false; }
        cancelCollapseTimer();
        return true;
      });
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [collapseDock]);

  /* ---------------------------------------------------------------- child rail open/close */
  const measureRailTop = (slotId) => {
    const button = slotButtonRefs.current[slotId];
    if (!button) return;
    const slot = findSlot(slotId);
    const railHeight = slot ? slot.tools.length * 32 + (slot.tools.length - 1) * 4 + 12 : 0;
    const buttonRect = button.getBoundingClientRect();
    const idealTop = buttonRect.top + buttonRect.height / 2 - railHeight / 2;
    const clampedTop = Math.max(16, Math.min(window.innerHeight - 16 - railHeight, idealTop));
    // The rail moves by (clamped - ideal); its notch counter-shifts by the inverse.
    setRailArrowOffset(idealTop - clampedTop);
  };
  const openRail = (slotId, { pinned = false } = {}) => {
    clearTimer(closeTimerRef);
    clearTimer(openTimerRef);
    setTooltip(null);
    measureRailTop(slotId);
    pinnedRef.current = pinned;
    setOpenSlotId(slotId);
  };
  const scheduleRailClose = () => {
    clearTimer(openTimerRef);
    clearTimer(closeTimerRef);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      if (!pinnedRef.current) setOpenSlotId(null);
    }, CHILD_CLOSE_GRACE_MS);
  };

  // Pinned (touch/pen/keyboard) rail closes on outside tap or Escape.
  useEffect(() => {
    if (!openSlotId) return undefined;
    const onPointerDown = (event) => {
      if (navRef.current?.contains(event.target)) return;
      closeRail();
    };
    const onKeyDown = (event) => {
      if (event.key !== "Escape" || !openSlotRef.current) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      const slotId = openSlotRef.current;
      closeRail();
      window.requestAnimationFrame(() => slotButtonRefs.current[slotId]?.focus());
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [openSlotId, closeRail]);

  /* ---------------------------------------------------------------- activation */
  const runChild = (child) => {
    // Leaving the highlighter for anything else restores the previous style.
    if (customToolRef.current === "highlighter" && child.kind !== "highlighter") {
      restoreHighlighter();
      setCustomTool(null);
      window.dispatchEvent(new CustomEvent("sketchizi:clear-custom-tool"));
    }
    // Switching away from an armed Code Block tool disarms it.
    if (customToolRef.current === "codeblock" && child.tool !== "codeblock") {
      setCustomTool(null);
      window.dispatchEvent(new CustomEvent("sketchizi:clear-custom-tool"));
    }
    const api = apiRef.current;
    if (child.kind === "action") {
      if (child.action === "todo") onOpenTodoTab?.();
      return;
    }
    if (child.kind === "custom") {
      window.dispatchEvent(new CustomEvent("sketchizi:activate-tool", { detail: { tool: child.tool } }));
      setCustomTool(child.tool);
      return;
    }
    if (child.kind === "preset") {
      insertPresetShape(api, child.preset);
      setActiveTool("selection");
      return;
    }
    if (child.kind === "highlighter") {
      if (customToolRef.current !== "highlighter") {
        const state = api?.getAppState?.() || {};
        highlighterSavedRef.current = {
          strokeColor: state.currentItemStrokeColor || "#1e1e1e",
          opacity: state.currentItemOpacity ?? 100,
          strokeWidth: state.currentItemStrokeWidth ?? 2,
        };
      }
      api?.setActiveTool?.({ type: "freedraw" });
      api?.updateScene?.({ appState: { currentItemStrokeColor: HIGHLIGHTER_DEFAULTS.strokeColor, currentItemOpacity: HIGHLIGHTER_DEFAULTS.opacity, ...strokeWidthAppStatePatch(HIGHLIGHTER_DEFAULTS.strokeWidth) } });
      window.dispatchEvent(new CustomEvent("sketchizi:activate-tool", { detail: { tool: "highlighter" } }));
      setActiveTool("freedraw");
      setCustomTool("highlighter");
      return;
    }
    // Variants (sharp vs rounded rectangle, arrow flavours) are recorded into the
    // per-canvas tool presets. The preset controller re-applies the remembered
    // style on every tool switch, so writing currentItem* directly would be undone.
    if (child.record && typeof onToolStyleChange === "function") {
      onToolStyleChange(child.record.targets, child.record.patch, { syncAppState: true });
    }
    activateTool({ child, root: rootRef.current, apiRef });
    setActiveTool(child.tool);
    setCustomTool(null);
  };

  const rememberChild = (child) => setSlotMemory((memory) => ({ ...memory, [child.slotId]: child.id }));

  const chooseChild = (child, { keepOpen = false } = {}) => {
    rememberChild(child);
    runChild(child);
    if (!keepOpen) collapseDock();
  };

  const rememberedChild = (slot) => findChild(slotMemory[slot.id]) || slot.tools[0];

  const handleSlotClick = (slot, event) => {
    const child = rememberedChild(slot);
    const isTouchLike = event.nativeEvent?.pointerType ? event.nativeEvent.pointerType !== "mouse" : !canHover();
    if (isGroupedSlot(slot) && isTouchLike) {
      // Touch / pen: activate the remembered tool (when it is a persistent tool)
      // AND open the child rail pinned. Presets/actions are never re-fired by a tap.
      openRail(slot.id, { pinned: true });
      if (isPersistentTool(child)) { runChild(child); }
      return;
    }
    chooseChild(child);
  };

  /* ---------------------------------------------------------------- slot pointer handlers (mouse only) */
  const handleSlotPointerEnter = (slot, event) => {
    if (event.pointerType !== "mouse") return;
    clearTimer(closeTimerRef);
    if (isGroupedSlot(slot)) {
      clearTimer(tooltipTimerRef);
      setTooltip(null);
      clearTimer(openTimerRef);
      if (openSlotRef.current === slot.id) return;
      // Sliding from one grouped slot to another opens instantly.
      const delay = openSlotRef.current ? 0 : CHILD_OPEN_INTENT_MS;
      if (delay === 0) { openRail(slot.id); return; }
      openTimerRef.current = window.setTimeout(() => { openTimerRef.current = null; openRail(slot.id); }, delay);
      return;
    }
    // Single slot: close any open rail, then show its tooltip after 180ms.
    clearTimer(openTimerRef);
    if (openSlotRef.current) scheduleRailClose();
    clearTimer(tooltipTimerRef);
    const button = slotButtonRefs.current[slot.id];
    const nav = navRef.current;
    if (!button || !nav) return;
    const top = Math.round(button.getBoundingClientRect().top - nav.getBoundingClientRect().top - nav.clientTop + button.offsetHeight / 2);
    tooltipTimerRef.current = window.setTimeout(() => {
      tooltipTimerRef.current = null;
      if (!openSlotRef.current) setTooltip({ label: tooltipLabel(slot.tools[0]), top });
    }, SINGLE_TOOLTIP_DELAY_MS);
  };
  const handleSlotPointerLeave = (slot, event) => {
    if (event.pointerType !== "mouse") return; // touch "leaves" right after a tap
    clearTimer(openTimerRef);
    clearTimer(tooltipTimerRef);
    setTooltip(null);
    if (isGroupedSlot(slot) && openSlotRef.current === slot.id) scheduleRailClose();
  };

  /* ---------------------------------------------------------------- keyboard */
  const focusSlotByOffset = (slotId, offset) => {
    const ids = DOCK_SLOTS.map((slot) => slot.id);
    const next = ids[(ids.indexOf(slotId) + offset + ids.length) % ids.length];
    slotButtonRefs.current[next]?.focus();
  };
  const handleSlotKeyDown = (slot, event) => {
    if (isGroupedSlot(slot) && (event.key === "Enter" || event.key === "ArrowRight")) {
      event.preventDefault();
      openRail(slot.id, { pinned: true });
      window.requestAnimationFrame(() => navRef.current?.querySelector(".sketchizi-tool-sidebar-child-rail button")?.focus());
    } else if (event.key === "ArrowDown") { event.preventDefault(); focusSlotByOffset(slot.id, 1); }
    else if (event.key === "ArrowUp") { event.preventDefault(); focusSlotByOffset(slot.id, -1); }
  };
  const handleChildKeyDown = (slot, event) => {
    const buttons = [...event.currentTarget.parentElement.querySelectorAll("button")];
    const index = buttons.indexOf(event.currentTarget);
    if (event.key === "ArrowDown") { event.preventDefault(); buttons[(index + 1) % buttons.length]?.focus(); }
    else if (event.key === "ArrowUp") { event.preventDefault(); buttons[(index - 1 + buttons.length) % buttons.length]?.focus(); }
    else if (event.key === "ArrowLeft") {
      event.preventDefault();
      closeRail();
      slotButtonRefs.current[slot.id]?.focus();
    }
  };

  useEffect(() => {
    if (!openSlotId) return undefined;
    const reposition = () => measureRailTop(openSlotId);
    window.addEventListener("resize", reposition);
    return () => window.removeEventListener("resize", reposition);
  }, [openSlotId]);
  return (
    <nav
      ref={navRef}
      className={`sketchizi-tool-sidebar${isDarkTheme ? " is-dark" : ""}${nativeMenuOpen ? " is-menu-open" : ""}${expanded ? " is-expanded" : ""}`}
      aria-label="Drawing tools"
      aria-hidden={nativeMenuOpen}
      inert={nativeMenuOpen}
      data-canvas-revision={canvasRevision}
      onMouseEnter={hoverExpand}
      onMouseLeave={hoverCollapse}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget) && !pinnedRef.current) scheduleCollapse();
      }}
    >
      <div className="sketchizi-tool-sidebar-list" id="sketchizi-tool-sidebar-list" role="toolbar" aria-orientation="vertical" aria-label="All drawing tools" inert={!expanded}>
        {DOCK_SLOTS.map((slot, slotIndex) => {
          const grouped = isGroupedSlot(slot);
          const isActive = activeSlotId === slot.id;
          const shown = isActive && activeChild ? activeChild : rememberedChild(slot);
          const label = grouped ? `${slot.label}: ${shown.label}` : shown.label;
          return (
            <React.Fragment key={slot.id}>
              <div className="tool-slot" data-slot={slot.id}>
                <button
                  type="button"
                  ref={(node) => { slotButtonRefs.current[slot.id] = node; if (slotIndex === 0) firstSlotButtonRef.current = node; }}
                  className={`sketchizi-tool-sidebar-button${isActive ? " is-active" : ""}${grouped ? " has-children" : ""}${openSlotId === slot.id ? " is-open" : ""}`}
                  aria-label={label}
                  aria-pressed={isActive}
                  aria-haspopup={grouped ? "true" : undefined}
                  aria-expanded={grouped ? openSlotId === slot.id : undefined}
                  data-slot={slot.id}
                  disabled={!canEdit}
                  style={{ "--sk-i": slotIndex }}
                  onClick={(event) => handleSlotClick(slot, event)}
                  onPointerEnter={(event) => handleSlotPointerEnter(slot, event)}
                  onPointerLeave={(event) => handleSlotPointerLeave(slot, event)}
                  onKeyDown={(event) => handleSlotKeyDown(slot, event)}
                >
                  <DockIcon name={shown.id} />
                </button>
                {openSlotId === slot.id && grouped && (
                  <div
                    className="sketchizi-tool-sidebar-child-rail sub-dock"
                    role="toolbar"
                    aria-orientation="vertical"
                    aria-label={`${slot.label} tools`}
                    data-slot={slot.id}
                    style={{ "--arrow-offset": `${railArrowOffset}px`, "--clamp-y": `${-railArrowOffset}px` }}
                    onPointerEnter={(event) => { if (event.pointerType === "mouse") clearTimer(closeTimerRef); }}
                    onPointerLeave={(event) => { if (event.pointerType === "mouse" && !pinnedRef.current) scheduleRailClose(); }}
                  >
                    {slot.tools.map((child) => {
                      const isCurrent = activeChild?.id === child.id;
                      return (
                        <button
                          key={child.id}
                          type="button"
                          className={`sketchizi-tool-sidebar-child${isCurrent ? " is-active" : ""}`}
                          aria-label={child.label}
                          aria-pressed={isCurrent}
                          data-tool={child.id}
                          data-tip={tooltipLabel(child)}
                          disabled={!canEdit}
                          onClick={() => chooseChild(child)}
                          onKeyDown={(event) => handleChildKeyDown(slot, event)}
                        >
                          <DockIcon name={child.id} />
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              {sectionBreakAfter(slot, slotIndex) && <div className="sketchizi-tool-sidebar-divider" aria-hidden="true" />}
            </React.Fragment>
          );
        })}
      </div>

      {tooltip && !openSlotId && (
        <div className="sketchizi-tool-sidebar-tooltip" role="tooltip" style={{ top: tooltip.top }}>{tooltip.label}</div>
      )}

      <div className="sketchizi-tool-sidebar-collapsed">
        <button
          type="button"
          ref={activeButtonRef}
          className="sketchizi-tool-sidebar-active"
          aria-label={`Active tool: ${pillChild.label}. Expand drawing tools`}
          aria-expanded={expanded}
          aria-controls="sketchizi-tool-sidebar-list"
          disabled={!canEdit}
          onMouseEnter={hoverExpand}
          onClick={handleExpandClick}
        >
          <DockIcon name={pillChild.id} />
        </button>
      </div>
    </nav>
  );
}
