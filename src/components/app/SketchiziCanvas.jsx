import { useCallback, useEffect, useRef, useState } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import Minimap from "../../Minimap";
import ShortcutHelp from "../../ShortcutHelp";
import ToolOptionsDock from "./ToolOptionsDock";
import AlignmentGuides from "./AlignmentGuides";
import TextSizeIndicator from "./TextSizeIndicator";
import ShapeMeasurements from "./ShapeMeasurements";
import RectangleTitles from "./RectangleTitles";
import { RemoteCursors, RemoteSelections } from "./CollaborationPresence";
import { getCanvasAppearanceBackground, getCanvasAppearanceRoughness, getCanvasAppearanceTheme } from "../../features/navigation/canvasAppearance.js";
import { DEFAULT_FONT_FAMILY_ID, normalizeFontFamilyId } from "../../features/canvas/fontFamilyDefaults.js";
import { handleStickyNoteRapidFlow } from "../../features/canvas/stickyNoteFlow.js";
import { applyMarkdownListEdit, getMarkdownListEdit } from "../../features/canvas/markdownListShortcuts.js";
import { getScrollBackPlacement } from "../../features/canvas/scrollBackPlacement.js";
import { workspaceFocusRect, spotlightGridPattern, workspaceCoarseGridPattern } from "../../features/canvas/gridSpotlight.js";

export default function SketchiziCanvas({
  savedSketch, isDarkTheme, handleExcalidrawAPI, handleChange, handleDrop,
  pageContext,
  viewModeEnabled = false,
  minimapOpen, minimapScene, apiRef, minimapDragRef, centerOnMinimap,
  selectedElements = [], canEdit = true,
  closeShortcuts, shortcutHelpOpen, setMinimapOpen, collaborationParticipants = [], collaborationSelfId, updateCollaborationCursor, onViewportChange,
  gridEnabled = false, gridStyle = "focus", canvasAppearance = "clean", onGridVisibilityChange,
}) {
  const canvasRootRef = useRef(null);
  const bindToolbarTooltipRef = useRef(null);
  const [canvasRevision, setCanvasRevision] = useState(0);
  const spotlightNodeRef = useRef(null);
  const drawingPointerRef = useRef(null);
  const textEditingRef = useRef(false);
  const dropActiveRef = useRef(false);
  const workAnchorRef = useRef(null);
  const spotlightSelectedRef = useRef(selectedElements);
  spotlightSelectedRef.current = selectedElements;

  const paintWorkspaceGrid = useCallback(() => {
    const root = canvasRootRef.current;
    const node = spotlightNodeRef.current;
    if (!root || !node?.isConnected) return;
    const rect = root.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const api = apiRef?.current;
    const state = api?.getAppState?.() || {};
    // Canvas patterns are a Sketchizi presentation layer, independent of
    // Excalidraw's native grid. This prevents the native grid from stacking
    // underneath the selected custom pattern.
    const showGrid = !!gridEnabled;
    node.classList.toggle("is-grid-enabled", !!showGrid);
    ["normal", "focus", "local", "dots", "ruled", "columns", "coordinates"].forEach((style) => {
      node.classList.toggle(`is-${style}-style`, gridStyle === style);
    });

    // In Pages mode, clip column guides to the active page outline.
    const pageOutline = pageContext?.mode === "pages"
      ? document.querySelector(".canvas-pages-page-outline")
      : null;
    if (gridStyle === "columns" && pageOutline) {
      const layerRect = node.getBoundingClientRect();
      const pageRect = pageOutline.getBoundingClientRect();
      const left = Math.max(0, pageRect.left - layerRect.left);
      const top = Math.max(0, pageRect.top - layerRect.top);
      node.style.setProperty("--sk-grid-page-left", `${left}px`);
      node.style.setProperty("--sk-grid-page-top", `${top}px`);
      node.style.setProperty("--sk-grid-page-width", `${Math.max(0, Math.min(layerRect.width - left, pageRect.width))}px`);
      node.style.setProperty("--sk-grid-page-height", `${Math.max(0, Math.min(layerRect.height - top, pageRect.height))}px`);
      node.classList.add("is-page-bounded-columns");
    } else {
      node.classList.remove("is-page-bounded-columns");
    }
    if (!showGrid) {
      node.classList.remove("has-focus");
      return;
    }
    const fine = spotlightGridPattern(state);
    const coarse = workspaceCoarseGridPattern(state);
    node.style.setProperty("--sk-grid-size", `${fine.spacing}px`);
    node.style.setProperty("--sk-grid-offset-x", `${fine.offsetX}px`);
    node.style.setProperty("--sk-grid-offset-y", `${fine.offsetY}px`);
    node.style.setProperty("--sk-grid-coarse-size", `${coarse.spacing}px`);
    node.style.setProperty("--sk-grid-coarse-offset-x", `${coarse.offsetX}px`);
    node.style.setProperty("--sk-grid-coarse-offset-y", `${coarse.offsetY}px`);

    const editor = root.querySelector(".excalidraw-textEditorContainer textarea");
    const textActive = textEditingRef.current && !!editor;
    const editorBounds = textActive ? editor.getBoundingClientRect() : null;
    const anchor = textActive ? {
      x: editorBounds.left + editorBounds.width / 2 - rect.left,
      y: editorBounds.top + editorBounds.height / 2 - rect.top,
    } : (drawingPointerRef.current !== null || dropActiveRef.current)
      ? workAnchorRef.current
      : null;
    const focus = workspaceFocusRect({
      elements: api?.getSceneElements?.() || savedSketch?.elements || [],
      selectedElements: spotlightSelectedRef.current,
      state,
      width: rect.width,
      height: rect.height,
      anchor,
    });
    // The broad grid appears only when Show Grid is on. Detail exists when there is
    // content or a real editing gesture, never because the pointer hovered.
    node.classList.toggle("has-focus", !!focus);
    if (!focus) return;
    node.style.setProperty("--sk-grid-focus-left", `${focus.left}px`);
    node.style.setProperty("--sk-grid-focus-top", `${focus.top}px`);
    node.style.setProperty("--sk-grid-focus-width", `${focus.width}px`);
    node.style.setProperty("--sk-grid-focus-height", `${focus.height}px`);
  }, [apiRef, savedSketch, gridEnabled, gridStyle, pageContext]);

  useEffect(() => {
    const root = canvasRootRef.current;
    if (!root) return undefined;
    let layer = null;
    let frame = 0;
    let dropTimer = null;
    const schedulePaint = () => {
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        paintWorkspaceGrid();
      });
    };
    const attach = () => {
      const wrapper = root.querySelector(".excalidraw__canvas-wrapper");
      if (!wrapper || layer?.parentElement === wrapper) return;
      layer?.remove();
      layer = document.createElement("div");
      layer.className = "sketchizi-grid-spotlight";
      layer.setAttribute("aria-hidden", "true");
      wrapper.appendChild(layer);
      spotlightNodeRef.current = layer;
      schedulePaint();
    };
    const isDrawingCanvas = (target) =>
      target instanceof Element &&
      !!target.closest("canvas.excalidraw__canvas.interactive");
    const onPointerDown = (event) => {
      if (!canEdit || viewModeEnabled || !isDrawingCanvas(event.target) ||
        (event.pointerType === "mouse" && event.button !== 0)) return;
      drawingPointerRef.current = event.pointerId;
      const rect = root.getBoundingClientRect();
      workAnchorRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      schedulePaint();
    };
    const onPointerMove = (event) => {
      // Never move or show detail for plain hover. Only an active gesture
      // can update the work anchor.
      if (drawingPointerRef.current === null || drawingPointerRef.current !== event.pointerId) return;
      const rect = root.getBoundingClientRect();
      workAnchorRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      schedulePaint();
    };
    const onPointerEnd = (event) => {
      if (drawingPointerRef.current !== event.pointerId) return;
      drawingPointerRef.current = null;
      workAnchorRef.current = null;
      schedulePaint();
    };
    const isTextEditor = (event) =>
      event.target instanceof Element &&
      event.target.matches(".excalidraw-textEditorContainer textarea");
    const onTextFocus = (event) => {
      if (!canEdit || viewModeEnabled || !isTextEditor(event)) return;
      textEditingRef.current = true;
      schedulePaint();
    };
    const onTextBlur = (event) => {
      if (!isTextEditor(event)) return;
      textEditingRef.current = false;
      schedulePaint();
    };
    const onTextInput = (event) => {
      if (isTextEditor(event)) schedulePaint();
    };
    const onDrop = (event) => {
      if (!canEdit || viewModeEnabled || !(event.target instanceof Element) ||
        !event.target.closest(".excalidraw")) return;
      const rect = root.getBoundingClientRect();
      workAnchorRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      dropActiveRef.current = true;
      schedulePaint();
      if (dropTimer !== null) window.clearTimeout(dropTimer);
      dropTimer = window.setTimeout(() => {
        dropActiveRef.current = false;
        workAnchorRef.current = null;
        schedulePaint();
      }, 650);
    };
    const observer = new MutationObserver(attach);
    observer.observe(root, { childList: true, subtree: true });
    attach();
    root.addEventListener("pointerdown", onPointerDown, true);
    root.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerup", onPointerEnd, true);
    window.addEventListener("pointercancel", onPointerEnd, true);
    root.addEventListener("focusin", onTextFocus, true);
    root.addEventListener("focusout", onTextBlur, true);
    root.addEventListener("input", onTextInput, true);
    root.addEventListener("drop", onDrop, true);
    window.addEventListener("resize", schedulePaint, { passive: true });
    return () => {
      observer.disconnect();
      root.removeEventListener("pointerdown", onPointerDown, true);
      root.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerEnd, true);
      window.removeEventListener("pointercancel", onPointerEnd, true);
      root.removeEventListener("focusin", onTextFocus, true);
      root.removeEventListener("focusout", onTextBlur, true);
      root.removeEventListener("input", onTextInput, true);
      root.removeEventListener("drop", onDrop, true);
      window.removeEventListener("resize", schedulePaint);
      if (dropTimer !== null) window.clearTimeout(dropTimer);
      if (frame) cancelAnimationFrame(frame);
      layer?.remove();
      if (spotlightNodeRef.current === layer) spotlightNodeRef.current = null;
      drawingPointerRef.current = null;
      textEditingRef.current = false;
      dropActiveRef.current = false;
    };
  }, [canEdit, viewModeEnabled, paintWorkspaceGrid]);

  const handleSceneChange = useCallback((elements, appState, files) => {
    setCanvasRevision((revision) => revision + 1);
    handleChange?.(elements, appState, files);
  }, [canEdit, handleChange, viewModeEnabled, onGridVisibilityChange]);
  const handleViewportChange = useCallback((...args) => {
    setCanvasRevision((revision) => revision + 1);
    onViewportChange?.(...args);
  }, [onViewportChange]);
  const registerExcalidrawAPI = useCallback((api) => {
    handleExcalidrawAPI?.(api);
    setCanvasRevision((revision) => revision + 1);
  }, [handleExcalidrawAPI]);

  useEffect(() => {
    // Follow scene content and the viewport, not arbitrary mouse movement.
    paintWorkspaceGrid();
  }, [canvasRevision, selectedElements, paintWorkspaceGrid]);

  useEffect(() => {
    const element = canvasRootRef.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => setCanvasRevision((revision) => revision + 1));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // Enhance Excalidraw's own toolbar in place. Buttons and their React handlers
  // stay native; this adds only a grip, separators, and session-only dragging.
  useEffect(() => {
    const root = canvasRootRef.current;
    if (!root) return undefined;
    let disposed = false;
    let observer;
    let frame = 0;
    let activeDragCleanup = null;
    let dockLocked = true;
    const publishDockLockState = (locked) => {
      dockLocked = locked;
      const container = root.querySelector(".App-toolbar-container");
      if (container) container.dataset.sketchiziDockLocked = String(locked);
      window.dispatchEvent(new CustomEvent("sketchizi:dock-lock-state", { detail: { locked } }));
    };
    const toggleDockLock = () => publishDockLockState(!dockLocked);
    window.addEventListener("sketchizi:toggle-dock-lock", toggleDockLock);
    const toolbarTooltip = document.createElement("div");
    toolbarTooltip.className = "sketchizi-toolbar-tooltip";
    toolbarTooltip.setAttribute("role", "tooltip");
    toolbarTooltip.setAttribute("aria-hidden", "true");
    toolbarTooltip.style.visibility = "hidden";
    document.body.appendChild(toolbarTooltip);
    const tooltipBindings = new Map();
    let activeTooltipButton = null;
    const hideToolbarTooltip = () => {
      activeTooltipButton = null;
      toolbarTooltip.style.visibility = "hidden";
      toolbarTooltip.style.opacity = "0";
      toolbarTooltip.setAttribute("aria-hidden", "true");
    };
    const showToolbarTooltip = (button) => {
      const label = button?.dataset?.sketchiziTooltip;
      if (!label || !button.isConnected) return;
      activeTooltipButton = button;
      const keyMatch = label.match(/^(.*?)\s*\(([^)]+)\)$/);
      if (keyMatch) {
        toolbarTooltip.innerHTML = `${keyMatch[1]} <kbd class="sketchizi-dock-kbd">${keyMatch[2]}</kbd>`;
      } else {
        toolbarTooltip.textContent = label;
      }
      const appShell = root.closest(".app");
      toolbarTooltip.classList.toggle("theme-dark", !!appShell?.classList.contains("theme-dark"));
      toolbarTooltip.classList.toggle("theme-light", !!appShell?.classList.contains("theme-light"));
      toolbarTooltip.style.visibility = "hidden";
      toolbarTooltip.style.opacity = "0";
      const buttonRect = button.getBoundingClientRect();
      const tipRect = toolbarTooltip.getBoundingClientRect();
      const toolbar = button.closest(".App-toolbar") || root.querySelector(".App-toolbar");
      const vertical = toolbar?.dataset.sketchiziOrientation === "vertical";
      const side = toolbar?.dataset.sketchiziDockSide;
      const scrollBackTooltip = /scroll back to content/i.test(label);
      let left;
      let top;
      let keepOutsideDock = false;
      if (vertical) {
        left = side === "right" ? buttonRect.left - tipRect.width - 10 : buttonRect.right + 10;
        if (left < 8) left = buttonRect.right + 10;
        if (left + tipRect.width > window.innerWidth - 8) left = buttonRect.left - tipRect.width - 10;
        top = buttonRect.top + (buttonRect.height - tipRect.height) / 2;
      } else {
        left = buttonRect.left + (buttonRect.width - tipRect.width) / 2;
        if (scrollBackTooltip) {
          // The control itself now sits outside the dock, so keep its tooltip
          // anchored to that control rather than placing it over the toolbar.
          top = buttonRect.top - tipRect.height - 8;
          if (top < 8) top = buttonRect.bottom + 8;
        } else {
          top = buttonRect.top - tipRect.height - 8;
          if (top < 8) top = buttonRect.bottom + 8;
        }
      }
      left = Math.max(8, Math.min(window.innerWidth - tipRect.width - 8, left));
      if (keepOutsideDock) {
        if (top + tipRect.height > window.innerHeight - 8) {
          top = Math.max(8, toolbar.getBoundingClientRect().top - tipRect.height - 8);
        }
      } else {
        top = Math.max(8, Math.min(window.innerHeight - tipRect.height - 8, top));
      }
      toolbarTooltip.style.left = `${left}px`;
      toolbarTooltip.style.top = `${top}px`;
      toolbarTooltip.style.visibility = "visible";
      toolbarTooltip.style.opacity = "1";
      toolbarTooltip.setAttribute("aria-hidden", "false");
    };
    const onToolbarTooltipResize = () => {
      if (activeTooltipButton?.isConnected) showToolbarTooltip(activeTooltipButton);
      else hideToolbarTooltip();
    };
    const bindToolbarTooltip = (button) => {
      if (tooltipBindings.has(button)) return;
      const show = () => showToolbarTooltip(button);
      const hide = () => { if (activeTooltipButton === button) hideToolbarTooltip(); };
      button.addEventListener("pointerenter", show);
      button.addEventListener("pointerleave", hide);
      button.addEventListener("focus", show);
      button.addEventListener("blur", hide);
      tooltipBindings.set(button, { show, hide });
    };
    bindToolbarTooltipRef.current = bindToolbarTooltip;
    window.addEventListener("resize", onToolbarTooltipResize);
    const clampDockToViewport = () => {
      const container = root.querySelector(".App-toolbar-container");
      if (!container || !container.style.left || !container.style.top) return;
      const rect = container.getBoundingClientRect();
      const maxLeft = Math.max(8, window.innerWidth - rect.width - 8);
      const maxTop = Math.max(8, window.innerHeight - rect.height - 8);
      const left = Math.min(maxLeft, Math.max(8, rect.left));
      const top = Math.min(maxTop, Math.max(8, rect.top));
      container.style.setProperty("left", `${left}px`, "important");
      container.style.setProperty("top", `${top}px`, "important");
    };
    const decorateToolbar = () => {
      if (disposed) return;
      const toolbar = root.querySelector(".App-toolbar");
      const container = root.querySelector(".App-toolbar-container");
      if (!toolbar || !container) return;
      toolbar.dataset.sketchiziDock = "true";
      // Excalidraw renders its More Tools overflow trigger as a dropdown-menu
      // control in the toolbar. Hide that native trigger directly; matching
      // its localized accessible label is unreliable across Excalidraw builds.
      toolbar.querySelectorAll(":scope > .dropdown-menu-button").forEach((control) => {
        control.dataset.sketchiziHideOverflowTools = "true";
      });
      // The Primary Dock starts vertically on the left on desktop. Keep the
      // mobile toolbar layout unchanged and preserve any user-positioned dock.
      if (!toolbar.dataset.sketchiziOrientation && !window.matchMedia("(max-width: 760px)").matches) {
        toolbar.dataset.sketchiziOrientation = "vertical";
        toolbar.dataset.sketchiziDockSide = "left";
      }
      if (!container.dataset.sketchiziDockPositioned && !window.matchMedia("(max-width: 760px)").matches) {
        container.style.setProperty("left", "8px", "important");
        container.style.setProperty("top", "50%", "important");
        container.style.setProperty("right", "auto", "important");
        container.style.setProperty("bottom", "auto", "important");
        container.style.setProperty("transform", "translateY(-50%)", "important");
        container.dataset.sketchiziDockPositioned = "true";
      }
      if (!container.dataset.sketchiziDockLocked) {
        container.dataset.sketchiziDockLocked = "true";
        dockLocked = true;
        window.dispatchEvent(new CustomEvent("sketchizi:dock-lock-state", { detail: { locked: true } }));
      } else {
        dockLocked = container.dataset.sketchiziDockLocked !== "false";
      }
      if (!toolbar.querySelector(":scope > .sketchizi-dock-grip")) {
        const grip = document.createElement("button");
        grip.type = "button";
        grip.className = "sketchizi-dock-grip";
        grip.setAttribute("aria-label", "Move drawing toolbar");
        grip.title = "Drag to move toolbar";
        grip.innerHTML = '<span aria-hidden="true"></span><span aria-hidden="true"></span><span aria-hidden="true"></span>';
        grip.addEventListener("keydown", (event) => {
          const directions = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] };
          const delta = directions[event.key];
          if (!delta || window.matchMedia("(max-width: 760px)").matches) return;
          const dock = root.querySelector(".App-toolbar-container");
          if (!dock || dock.dataset.sketchiziDockLocked !== "false") return;
          event.preventDefault();
          const rect = dock.getBoundingClientRect();
          dock.style.setProperty("width", "max-content", "important");
          dock.style.setProperty("max-width", "max-content", "important");
          dock.style.setProperty("overflow", "visible", "important");
          dock.style.setProperty("transform", "none", "important");
          const proposedLeft = rect.left + delta[0];
          const dockElement = root.querySelector(".App-toolbar");
          const edgeThreshold = 28;
          const side = proposedLeft <= edgeThreshold ? "left"
            : proposedLeft + rect.width >= window.innerWidth - edgeThreshold ? "right" : null;
          if (dockElement) {
            dockElement.dataset.sketchiziOrientation = side ? "vertical" : "horizontal";
            if (side) dockElement.dataset.sketchiziDockSide = side;
            else delete dockElement.dataset.sketchiziDockSide;
          }
          const width = dock.offsetWidth;
          const left = side === "left" ? 8 : side === "right"
            ? Math.max(8, window.innerWidth - width - 8)
            : Math.min(Math.max(8, window.innerWidth - width - 8), Math.max(8, proposedLeft));
          const top = Math.min(Math.max(8, window.innerHeight - dock.offsetHeight - 8), Math.max(8, rect.top + delta[1]));
          dock.style.setProperty("left", `${left}px`, "important");
          dock.style.setProperty("top", `${top}px`, "important");
          dock.style.setProperty("right", "auto", "important");
          dock.style.setProperty("bottom", "auto", "important");
        });
        grip.addEventListener("pointerdown", (event) => {
          if (container.dataset.sketchiziDockLocked !== "false" || event.button !== 0 || window.matchMedia("(max-width: 760px)").matches) return;
          event.preventDefault();
          hideToolbarTooltip();
          const rect = container.getBoundingClientRect();
          const startX = event.clientX;
          const startY = event.clientY;
          const initialLeft = rect.left;
          const initialTop = rect.top;
          container.style.setProperty("width", "max-content", "important");
          container.style.setProperty("max-width", "max-content", "important");
          container.style.setProperty("overflow", "visible", "important");
          container.style.setProperty("left", `${initialLeft}px`, "important");
          container.style.setProperty("top", `${initialTop}px`, "important");
          container.style.setProperty("right", "auto", "important");
          container.style.setProperty("bottom", "auto", "important");
          container.style.setProperty("transform", "none", "important");
          const move = (moveEvent) => {
            const proposedLeft = initialLeft + moveEvent.clientX - startX;
            const proposedTop = initialTop + moveEvent.clientY - startY;
            const edgeThreshold = 28;
            const dock = root.querySelector(".App-toolbar");
            const dockRight = proposedLeft + container.offsetWidth;
            const verticalSide = proposedLeft <= edgeThreshold
              ? "left"
              : dockRight >= window.innerWidth - edgeThreshold ? "right" : null;

            // Dock vertically only while the user places it against a screen edge.
            // Returning it away from the edge restores the horizontal toolbar.
            if (dock) {
              dock.dataset.sketchiziOrientation = verticalSide ? "vertical" : "horizontal";
              if (verticalSide) dock.dataset.sketchiziDockSide = verticalSide;
              else delete dock.dataset.sketchiziDockSide;
            }
            const width = container.offsetWidth;
            const height = container.offsetHeight;
            const maxLeft = Math.max(8, window.innerWidth - width - 8);
            const maxTop = Math.max(8, window.innerHeight - height - 8);
            const left = verticalSide === "left" ? 8 : verticalSide === "right"
              ? Math.max(8, window.innerWidth - width - 8)
              : Math.min(maxLeft, Math.max(8, proposedLeft));
            const top = Math.min(maxTop, Math.max(8, proposedTop));
            container.style.setProperty("left", `${left}px`, "important");
            container.style.setProperty("top", `${top}px`, "important");
          };
          const finish = () => {
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", finish);
            window.removeEventListener("pointercancel", finish);
            if (activeDragCleanup === finish) activeDragCleanup = null;
          };
          activeDragCleanup?.();
          activeDragCleanup = finish;
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", finish, { once: true });
          window.addEventListener("pointercancel", finish, { once: true });
        });
        toolbar.insertBefore(grip, toolbar.firstChild);
      }
      // A dedicated collapse control keeps the Primary Dock available as a
      // compact left-edge rail without affecting the independent bottom dock.
      let collapseToggle = toolbar.querySelector(":scope > .sketchizi-dock-collapse-toggle");
      if (!collapseToggle) {
        collapseToggle = document.createElement("button");
        collapseToggle.type = "button";
        collapseToggle.className = "sketchizi-dock-collapse-toggle";
        collapseToggle.dataset.sketchiziCollapseToggle = "true";
        collapseToggle.setAttribute("aria-label", "Collapse Primary Dock");
        collapseToggle.addEventListener("click", () => {
          const collapsed = toolbar.dataset.sketchiziCollapsed !== "true";
          toolbar.dataset.sketchiziCollapsed = String(collapsed);
          container.dataset.sketchiziCollapsed = String(collapsed);
          collapseToggle.setAttribute("aria-expanded", String(!collapsed));
          collapseToggle.setAttribute("aria-label", collapsed ? "Expand Primary Dock" : "Collapse Primary Dock");
          collapseToggle.title = collapsed ? "Expand Primary Dock" : "Collapse Primary Dock";
          collapseToggle.innerHTML = collapsed
            ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>'
            : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
          try { window.localStorage.setItem("sketchizi-primary-dock-collapsed", String(collapsed)); } catch {}
        });
        toolbar.insertBefore(collapseToggle, toolbar.firstChild);
      }
      if (toolbar.dataset.sketchiziCollapsed === undefined) {
        let initiallyCollapsed = false;
        try { initiallyCollapsed = window.localStorage.getItem("sketchizi-primary-dock-collapsed") === "true"; } catch {}
        toolbar.dataset.sketchiziCollapsed = String(initiallyCollapsed);
        container.dataset.sketchiziCollapsed = String(initiallyCollapsed);
      }
      const initiallyCollapsed = toolbar.dataset.sketchiziCollapsed === "true";
      collapseToggle.setAttribute("aria-expanded", String(!initiallyCollapsed));
      collapseToggle.setAttribute("aria-label", initiallyCollapsed ? "Expand Primary Dock" : "Collapse Primary Dock");
      collapseToggle.title = initiallyCollapsed ? "Expand Primary Dock" : "Collapse Primary Dock";
      collapseToggle.innerHTML = initiallyCollapsed
        ? '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 18 6-6-6-6"/></svg>'
        : '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m15 18-6-6 6-6"/></svg>';
      // Excalidraw owns the active-tool state and marks its selected toolbar button.
      // Style that native state instead of inferring tools from labels, which can
      // incorrectly highlight unrelated controls or remain stale while editing text.
      // Add concise native hover labels without replacing Excalidraw's own
      // accessible names, button elements, keyboard bindings, or handlers.
      // Shortcut text is read from Excalidraw's rendered keybinding element.
      const candidates = [...toolbar.querySelectorAll("button, [role='button']")]
        .filter((node) => !node.classList.contains("sketchizi-dock-grip"));
      candidates.forEach((button) => {
        const accessibleName = (button.getAttribute("aria-label") || button.getAttribute("title") || "")
          .replace(/\s+/g, " ").trim();
        if (!accessibleName) return;
        // Keep tool names available to assistive technology, but do not show
        // descriptive hover tooltips on Primary Dock buttons. Shortcut hints
        // remain visible in the button itself through the native keybinding node.
        if (!button.getAttribute("aria-label")) button.setAttribute("aria-label", accessibleName);
        button.removeAttribute("title");
        const keybinding = button.querySelector(".ToolIcon__keybinding")?.textContent?.replace(/\s+/g, " ").trim();
        if (keybinding) button.dataset.sketchiziPersistentShortcut = keybinding;
      });

      // Insert separators before known native tool groups only when the DOM
      // exposes a direct toolbar child boundary. Never reorder or wrap tools.
      const groupStarts = [
        { name: "navigation", pattern: /^(hand|pan|zoom)$/i },
        { name: "selection-shapes", pattern: /^(select|selection|rectangle|rect|diamond|ellipse)$/i },
        { name: "connectors", pattern: /^(arrow|line|elbow|connector)$/i },
        { name: "drawing", pattern: /^(draw|freedraw|freehand|pen)$/i },
        { name: "annotation-editing", pattern: /^(text|note|image|eraser)$/i },
      ];
      toolbar.dataset.sketchiziDockLayout = "grouped";
      const directChildren = [...toolbar.children];
      const nativeTools = directChildren.filter((node) =>
        node.matches(".ToolIcon, .dropdown-menu-button, button, [role='button']"),
      );
      let previousGroup = null;
      nativeTools.forEach((anchor) => {
        const button = anchor.matches("button, [role='button']") ? anchor : anchor.querySelector("button, [role='button']");
        if (!button || button.classList.contains("sketchizi-dock-grip")) return;
        const label = `${button.getAttribute("aria-label") || ""} ${button.getAttribute("title") || ""} ${button.dataset.testid || ""}`.trim().toLowerCase();
        const normalized = label.split(/[(:\\s-]/)[0];
        const group = groupStarts.find((entry) => entry.pattern.test(normalized));
        if (!group) {
          delete anchor.dataset.sketchiziToolGroup;
          delete button.dataset.sketchiziToolGroup;
          delete anchor.dataset.sketchiziGroupStart;
          return;
        }
        anchor.dataset.sketchiziToolGroup = group.name;
        button.dataset.sketchiziToolGroup = group.name;
        if (previousGroup !== group.name) {
          anchor.dataset.sketchiziGroupStart = "true";
          if (previousGroup &&
            !anchor.previousElementSibling?.classList.contains("sketchizi-dock-separator")) {
            const separator = document.createElement("span");
            separator.className = "sketchizi-dock-separator";
            separator.dataset.group = group.name;
            separator.setAttribute("aria-hidden", "true");
            toolbar.insertBefore(separator, anchor);
          }
        } else {
          delete anchor.dataset.sketchiziGroupStart;
        }
        previousGroup = group.name;
      });

      // Keep Bucket Fill as the only custom quick tool in the native dock.
      // Reconcile the group on toolbar mutations because Excalidraw may rebuild
      // descendants; direct activation must not open the More Tools menu.
      let quickGroup = toolbar.querySelector(":scope > .sketchizi-dock-quick-tools");
      if (!quickGroup) {
        quickGroup = document.createElement("div");
        quickGroup.className = "sketchizi-dock-quick-tools";
        quickGroup.setAttribute("role", "group");
        quickGroup.setAttribute("aria-label", "Quick tools");
      }
      // Find the native eraser even when Excalidraw nests its tool button.
      // Keep custom tools before the trailing native menu button because
      // useMoreTools hides that native button; custom controls must stay clickable.
      const directToolbarChildren = [...toolbar.children].filter((node) =>
        !node.classList.contains("sketchizi-dock-quick-tools") &&
        !node.classList.contains("sketchizi-dock-separator") &&
        !node.classList.contains("sketchizi-dock-grip") &&
        !node.classList.contains("App-toolbar__spacer") &&
        !node.classList.contains("toolbar__spacer") &&
        node.getAttribute("data-toolbar-spacer") !== "true"
      );
      const eraserButton = [...toolbar.querySelectorAll("button, [role='button']")].find((node) =>
        !node.closest(".sketchizi-dock-quick-tools") &&
        /eraser/i.test((node.getAttribute("aria-label") || "") + " " +
          (node.getAttribute("title") || "") + " " + (node.dataset.testid || ""))
      );
      const directChildFor = (node) => {
        let current = node;
        while (current && current.parentElement !== toolbar) current = current.parentElement;
        return current && current.parentElement === toolbar ? current : null;
      };
      const eraser = directChildFor(eraserButton);
      const trailingNativeButton = directToolbarChildren.at(-1);
      const insertionPoint = eraser ? eraser.nextElementSibling : trailingNativeButton;
      if (insertionPoint && insertionPoint !== quickGroup) {
        toolbar.insertBefore(quickGroup, insertionPoint);
      } else if (!quickGroup.parentElement) {
        toolbar.appendChild(quickGroup);
      }

      const quickTools = [
        { id: "bucketfill", label: "Bucket Fill", icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17a8.5 8.5 0 0 1-17 0Z" fill="currentColor" stroke="none"/></svg>', shortcut: "B" },
        { id: "autoshape", label: "Draw to Shape", icon: '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 15.5c1.7-4.8 3.4-7.1 5.1-5.8"/><path d="M9.5 12h3.2"/><path d="M11 10.3 12.7 12 11 13.7"/><path d="M16 7h5v10h-5z"/></svg>', shortcut: "⇧X" },
      ];
      quickTools.forEach(({ id, label, icon, shortcut }) => {
        let button = quickGroup.querySelector(`[data-sketchizi-quick-tool="${id}"]`);
        if (!button) {
          button = document.createElement("button");
          button.type = "button";
          button.className = "sketchizi-dock-quick-tool";
          button.dataset.sketchiziQuickTool = id;
          // Activate on pointerdown so Excalidraw's toolbar focus/selection
          // updates cannot race the browser's later click event. Keep keyboard
          // activation on click for Enter/Space.
          let pointerActivationAt = 0;
          button.addEventListener("pointerdown", (event) => {
            if (event.button !== 0) return;
            event.preventDefault();
            event.stopPropagation();
            pointerActivationAt = Date.now();
            window.dispatchEvent(new CustomEvent("sketchizi:activate-tool", { detail: { tool: id } }));
          });
          button.addEventListener("click", (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (Date.now() - pointerActivationAt < 700) return;
            window.dispatchEvent(new CustomEvent("sketchizi:activate-tool", { detail: { tool: id } }));
          });
        }
        button.dataset.sketchiziTooltip = `${label} (${shortcut})`;
        button.setAttribute("aria-label", label);
        button.setAttribute("title", `${label} (${shortcut})`);
        button.removeAttribute("hidden");
        button.disabled = false;
        button.style.display = "inline-flex";
        button.style.visibility = "visible";
        button.style.opacity = "1";
        button.style.flex = "0 0 34px";
        button.style.width = "34px";
        button.style.minWidth = "34px";
        button.style.height = "34px";
        button.innerHTML = `<span aria-hidden="true">${icon}</span>`;
        // appendChild also restores the intended order when Excalidraw mutates
        // the toolbar; only move nodes when they are not already in order.
        if (button.parentElement !== quickGroup) quickGroup.appendChild(button);
      });
      const activeIds = new Set(quickTools.map(({ id }) => id));
      quickGroup.querySelectorAll("[data-sketchizi-quick-tool]").forEach((button) => {
        if (!activeIds.has(button.dataset.sketchiziQuickTool)) button.remove();
      });
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(decorateToolbar);
    };
    schedule();
    window.addEventListener("resize", clampDockToViewport);
    observer = new MutationObserver(schedule);
    observer.observe(root, { childList: true, subtree: true });
    return () => {
      disposed = true;
      activeDragCleanup?.();
      cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener("sketchizi:toggle-dock-lock", toggleDockLock);
      window.removeEventListener("resize", clampDockToViewport);
      window.removeEventListener("resize", onToolbarTooltipResize);
      tooltipBindings.forEach(({ show, hide }, button) => {
        button.removeEventListener("pointerenter", show);
        button.removeEventListener("pointerleave", hide);
        button.removeEventListener("focus", show);
        button.removeEventListener("blur", hide);
      });
      tooltipBindings.clear();
      if (bindToolbarTooltipRef.current === bindToolbarTooltip) bindToolbarTooltipRef.current = null;
      toolbarTooltip.remove();
    };
  }, []);

  // Keep the native navigation area minimal; only reposition the scroll-back control.
  useEffect(() => {
    const root = canvasRootRef.current;
    if (!root) return undefined;
    let disposed = false;
    let observer;
    const bindToolbarTooltip = (button) => bindToolbarTooltipRef.current?.(button);
    const placeScrollBackControl = () => {
      const toolbar = root.querySelector(".App-toolbar");
      const buttons = [...root.querySelectorAll("button, [role='button']")];
      const button = buttons.find((candidate) => {
        const label = [
          candidate.getAttribute("aria-label"),
          candidate.getAttribute("title"),
          candidate.textContent,
        ].filter(Boolean).join(" ").replace(/\\s+/g, " ").trim();
        return /scroll back to content/i.test(label);
      });
      if (!button || !toolbar) return;
      button.classList.add("sketchizi-scroll-back-control");
      button.dataset.sketchiziTooltip = "Scroll back to content";
      if (!button.getAttribute("aria-label")) button.setAttribute("aria-label", "Scroll back to content");
      button.removeAttribute("title");
      bindToolbarTooltip(button);

      const position = getScrollBackPlacement({
        dock: toolbar.getBoundingClientRect(),
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        vertical: toolbar.dataset.sketchiziOrientation === "vertical",
        dockSide: toolbar.dataset.sketchiziDockSide,
      });
      button.style.setProperty("position", "fixed", "important");
      button.style.setProperty("left", `${position.left}px`, "important");
      button.style.setProperty("top", `${position.top}px`, "important");
      button.style.setProperty("right", "auto", "important");
      button.style.setProperty("bottom", "auto", "important");
      button.style.setProperty("z-index", "10020", "important");
    };
    const suppressNativeScrollBackTooltip = () => {
      document.querySelectorAll('[role="tooltip"]').forEach((tooltip) => {
        if (tooltip.classList.contains("sketchizi-toolbar-tooltip")) return;
        if (!/scroll back to content/i.test(tooltip.textContent || "")) return;
        tooltip.style.setProperty("display", "none", "important");
      });
    };
    const syncNavigationControls = () => {
      if (disposed) return;
      suppressNativeScrollBackTooltip();
      const zoomActions = root.querySelector(".zoom-actions");
      if (!zoomActions) {
        placeScrollBackControl();
        return;
      }
      placeScrollBackControl();

      const nativeTitles = [
        [".zoom-out", "Zoom out"],
        [".zoom-in", "Zoom in"],
        [".reset-zoom", "Reset zoom to 100%"],
        [".undo-button", "Undo (Ctrl/Cmd+Z)"],
        [".redo-button", "Redo (Ctrl+Y / Cmd+Shift+Z)"],
      ];
      nativeTitles.forEach(([selector, title]) => {
        root.querySelectorAll(selector).forEach((button) => {
          if (!button.getAttribute("title")) button.setAttribute("title", title);
        });
      });
    };
    syncNavigationControls();
    observer = new MutationObserver(syncNavigationControls);
    observer.observe(root, { childList: true, subtree: true });
    const repositionOnPointerMove = () => placeScrollBackControl();
    window.addEventListener("resize", repositionOnPointerMove);
    window.addEventListener("pointermove", repositionOnPointerMove, { passive: true });
    const tooltipObserver = new MutationObserver(suppressNativeScrollBackTooltip);
    tooltipObserver.observe(document.body, { childList: true, subtree: true });
    suppressNativeScrollBackTooltip();
    return () => {
      disposed = true;
      observer?.disconnect();
      window.removeEventListener("resize", repositionOnPointerMove);
      window.removeEventListener("pointermove", repositionOnPointerMove);
      tooltipObserver.disconnect();
      root.querySelectorAll(".sketchizi-scroll-back-control").forEach((button) => {
        button.classList.remove("sketchizi-scroll-back-control");
        ["position", "left", "top", "right", "bottom", "z-index"].forEach((property) => button.style.removeProperty(property));
      });
    };
  }, [apiRef, canEdit, viewModeEnabled]);

  // Markdown-style list shortcuts are handled by the existing Excalidraw text
  // textarea. Keep list markers as plain text for native scene compatibility.
  useEffect(() => {
    const root = canvasRootRef.current;
    if (!root || !canEdit || viewModeEnabled) return undefined;
    const handleMarkdownListKeyDown = (event) => {
      const textarea = event.target;
      if (!(textarea instanceof HTMLTextAreaElement) ||
        !textarea.matches(".excalidraw-textEditorContainer textarea")) return;
      const edit = getMarkdownListEdit({
        value: textarea.value,
        selectionStart: textarea.selectionStart,
        selectionEnd: textarea.selectionEnd,
        key: event.key,
      });
      if (!edit) return;
      event.preventDefault();
      event.stopPropagation();
      applyMarkdownListEdit(textarea, edit);
    };
    root.addEventListener("keydown", handleMarkdownListKeyDown, true);
    return () => root.removeEventListener("keydown", handleMarkdownListKeyDown, true);
  }, [canEdit, viewModeEnabled]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!apiRef?.current || !canEdit || viewModeEnabled) return;
      handleStickyNoteRapidFlow(event, apiRef.current);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [apiRef, canEdit, viewModeEnabled]);

  const updateCursorFromPointer = (event) => {
    const target = event.target;
    if (!(target instanceof Element) || !target.closest("canvas")) {
      updateCollaborationCursor?.(null);
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    updateCollaborationCursor?.({ x: event.clientX - rect.left, y: event.clientY - rect.top });
  };
  const clearRemoteCursor = () => {
    updateCollaborationCursor?.(null);
  };
  const visibleSceneElements = apiRef?.current?.getSceneElements?.() || savedSketch?.elements || [];
  const isCanvasEmpty = visibleSceneElements.every((element) => element?.isDeleted || element?.deleted);
  const activeAppearance = ["sketch", "clean", "chalkboard"].includes(canvasAppearance) ? canvasAppearance : "clean";

  return (
    <main ref={canvasRootRef} className={`${viewModeEnabled ? "canvas viewer-mode" : "canvas"} canvas-appearance-${activeAppearance}`} data-canvas-appearance={activeAppearance} onDropCapture={handleDrop} onPointerMove={updateCursorFromPointer} onPointerLeave={clearRemoteCursor}>
      <Excalidraw
        // Preserve the drawing background when restoring a scene.
        initialData={{
          elements: savedSketch?.elements || [],
          appState: {
            ...(savedSketch?.appState || {}),
            // Start in the standard Sketchizi workspace. Zen Mode remains
            // available as an explicit user choice, not the default on startup.
            // Keep this after the saved appState spread so older drawings that
            // were saved in Zen Mode do not force it on for every new session.
            zenModeEnabled: false,
            zoom: { value: savedSketch?.appState?.zoom?.value ?? savedSketch?.appState?.zoom ?? 1 },
            currentItemFontFamily: normalizeFontFamilyId(savedSketch?.appState?.currentItemFontFamily) ?? DEFAULT_FONT_FAMILY_ID,
            viewBackgroundColor: savedSketch?.appState?.viewBackgroundColor || getCanvasAppearanceBackground(activeAppearance, isDarkTheme),
            currentItemRoughness: savedSketch?.appState?.currentItemRoughness ?? (savedSketch ? 1 : getCanvasAppearanceRoughness(activeAppearance)),
            gridModeEnabled: false,
          },
          files: savedSketch?.files || {},
        }}
        excalidrawAPI={registerExcalidrawAPI}
        onExcalidrawAPI={registerExcalidrawAPI}
        theme={getCanvasAppearanceTheme(activeAppearance, isDarkTheme)}
        viewModeEnabled={viewModeEnabled}
        aiEnabled={true}
        onChange={handleSceneChange}
        onScrollChange={handleViewportChange}
      />
      <ToolOptionsDock apiRef={apiRef} selectedElements={selectedElements} canvasRevision={canvasRevision} canEdit={canEdit && !viewModeEnabled} />
      <AlignmentGuides canvasRootRef={canvasRootRef} apiRef={apiRef} canEdit={canEdit} viewModeEnabled={viewModeEnabled} />
      <ShapeMeasurements apiRef={apiRef} canvasRootRef={canvasRootRef} selectedElements={selectedElements} canvasRevision={canvasRevision} viewModeEnabled={viewModeEnabled} isDarkTheme={isDarkTheme} />
      <RectangleTitles
        api={apiRef.current}
        canvasRootRef={canvasRootRef}
        elements={visibleSceneElements}
        pageContext={pageContext}
        canEdit={canEdit && !viewModeEnabled}
      />
      <TextSizeIndicator apiRef={apiRef} canvasRootRef={canvasRootRef} selectedElements={selectedElements} canvasRevision={canvasRevision} />
      <RemoteCursors participants={collaborationParticipants} selfId={collaborationSelfId} />
      <RemoteSelections participants={collaborationParticipants} selfId={collaborationSelfId} apiRef={apiRef} />
      <Minimap minimapOpen={minimapOpen} minimapScene={minimapScene} apiRef={apiRef} minimapDragRef={minimapDragRef} centerOnMinimap={centerOnMinimap} />
      <ShortcutHelp open={shortcutHelpOpen} onClose={closeShortcuts} />
    </main>
  );
}
