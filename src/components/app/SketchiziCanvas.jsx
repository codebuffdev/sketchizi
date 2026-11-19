import { useCallback, useEffect, useRef, useState } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import Minimap from "../../Minimap";
import ShortcutHelp from "../../ShortcutHelp";
import ToolOptionsDock from "./ToolOptionsDock";
import ExperimentalPrimaryDock from "./ExperimentalPrimaryDock";
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
import { createFreeDrawElementFromSamples, drawFreeDrawPreviewSample, getPointerEventSamples } from "../../features/canvas/freeDrawEngine.js";

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
  const collaborationCursorFrameRef = useRef(0);
  const pendingCollaborationCursorRef = useRef(null);
  const bindToolbarTooltipRef = useRef(null);
  const [canvasRevision, setCanvasRevision] = useState(0);
  const [dockPreviewEnabled, setDockPreviewEnabled] = useState(false);
  const canvasRevisionFrameRef = useRef(0);
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
      // A local drawing gesture has no need to publish this user's remote
      // cursor. Cancel any queued presence update so it cannot compete with
      // the active pointer stream.
      pendingCollaborationCursorRef.current = null;
      if (collaborationCursorFrameRef.current) {
        cancelAnimationFrame(collaborationCursorFrameRef.current);
        collaborationCursorFrameRef.current = 0;
      }
      const rect = root.getBoundingClientRect();
      workAnchorRef.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
      schedulePaint();
    };
    // Do not recalculate the workspace focus grid on every pen sample.
    // The focus anchor is captured at pointer-down and refreshed after the
    // gesture ends; Excalidraw owns the time-critical drawing pointer stream.

    const onPointerEnd = (event) => {
      if (drawingPointerRef.current !== event.pointerId) return;
      drawingPointerRef.current = null;
      workAnchorRef.current = null;
      schedulePaint();
      // Publish one settled revision after the gesture, not one React render
      // for every intermediate freehand sample.
      setCanvasRevision((revision) => revision + 1);
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

      window.removeEventListener("pointerup", onPointerEnd, true);
      window.removeEventListener("pointercancel", onPointerEnd, true);
      root.removeEventListener("focusin", onTextFocus, true);
      root.removeEventListener("focusout", onTextBlur, true);
      root.removeEventListener("input", onTextInput, true);
      root.removeEventListener("drop", onDrop, true);
      window.removeEventListener("resize", schedulePaint);
      if (dropTimer !== null) window.clearTimeout(dropTimer);
      if (frame) cancelAnimationFrame(frame);
      if (canvasRevisionFrameRef.current) cancelAnimationFrame(canvasRevisionFrameRef.current);
      canvasRevisionFrameRef.current = 0;
      layer?.remove();
      if (spotlightNodeRef.current === layer) spotlightNodeRef.current = null;
      drawingPointerRef.current = null;
      textEditingRef.current = false;
      dropActiveRef.current = false;
    };
  }, [canEdit, viewModeEnabled, paintWorkspaceGrid]);

  // Free-draw uses a dedicated input/render path rather than Excalidraw's
  // per-pointermove React state + full-stroke outline regeneration. Capture
  // high-frequency samples, paint an incremental Bézier preview, then
  // commit one native Excalidraw free-draw element on pointer-up.
  useEffect(() => {
    const root = canvasRootRef.current;
    if (!root || !canEdit || viewModeEnabled) return undefined;

    let previewCanvas = null;
    let previewContext = null;
    let clearFrame = 0;
    let session = null;

    const clearPreview = () => {
      if (!previewContext || !previewCanvas) return;
      previewContext.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    };

    const redrawPreview = () => {
      if (!session || !previewContext) return;
      clearPreview();
      session.previewPoints = [];
      // The preview canvas is viewport-fixed, so client coordinates map
      // directly to its CSS pixel coordinate space.
      const rect = { left: 0, top: 0 };
      for (const sample of session.samples) {
        drawFreeDrawPreviewSample(previewContext, session, sample, session.appState, rect);
      }
    };

    const resizePreview = () => {
      if (!previewCanvas) return;
      const width = document.documentElement.clientWidth || window.innerWidth;
      const height = document.documentElement.clientHeight || window.innerHeight;
      const ratio = Math.max(1, window.devicePixelRatio || 1);
      previewCanvas.width = Math.max(1, Math.round(width * ratio));
      previewCanvas.height = Math.max(1, Math.round(height * ratio));
      previewCanvas.style.width = `${width}px`;
      previewCanvas.style.height = `${height}px`;
      previewContext = previewCanvas.getContext("2d", { alpha: true });
      previewContext?.setTransform(ratio, 0, 0, ratio, 0, 0);
      redrawPreview();
    };

    const attachPreview = () => {
      if (previewCanvas?.parentElement === document.body) return;
      previewCanvas?.remove();
      previewCanvas = document.createElement("canvas");
      previewCanvas.className = "sketchizi-free-draw-preview";
      previewCanvas.setAttribute("aria-hidden", "true");
      Object.assign(previewCanvas.style, {
        position: "fixed",
        inset: "0 auto auto 0",
        width: "100vw",
        height: "100vh",
        pointerEvents: "none",
        display: "block",
        visibility: "visible",
        opacity: "1",
        zIndex: "2147483647",
        transform: "translateZ(0)",
      });
      document.body.appendChild(previewCanvas);
      resizePreview();
    };

    const appendSamples = (activeSession, event) => {
      if (!previewContext) return;
      const rect = { left: 0, top: 0 };
      for (const sample of getPointerEventSamples(event)) {
        const previous = activeSession.samples[activeSession.samples.length - 1];
        if (
          previous &&
          previous.clientX === sample.clientX &&
          previous.clientY === sample.clientY &&
          previous.pressure === sample.pressure
        ) {
          continue;
        }
        activeSession.samples.push(sample);
        drawFreeDrawPreviewSample(previewContext, activeSession, sample, activeSession.appState, rect);
      }
    };

    const stopNativeEvent = (event) => {
      event.preventDefault?.();
      event.stopPropagation?.();
      event.stopImmediatePropagation?.();
    };

    const onPointerDown = (event) => {
      if (session || event.button !== 0 || event.isPrimary === false) return;
      const target = event.target;
      if (!(target instanceof Element) || !target.closest("canvas.excalidraw__canvas.interactive")) return;

      const api = apiRef?.current;
      const appState = api?.getAppState?.();
      if (!api?.updateScene || appState?.activeTool?.type !== "freedraw") return;

      attachPreview();
      if (!previewContext) return;

      if (clearFrame) {
        cancelAnimationFrame(clearFrame);
        clearFrame = 0;
      }
      clearPreview();
      session = {
        pointerId: event.pointerId,
        useRaw: event.pointerType === "pen" && "onpointerrawupdate" in window,
        receivedRaw: false,
        appState,
        pointerType: event.pointerType || "mouse",
        simulatePressure: event.pressure === 0.5,
        samples: [],
        previewPoints: [],
      };

      try {
        target.setPointerCapture?.(event.pointerId);
      } catch {
        // Window-level listeners still track the active pointer when capture
        // is unavailable (for example, on older browser implementations).
      }
      appendSamples(session, event);
      stopNativeEvent(event);
    };

    const onPointerMove = (event) => {
      if (!session || event.pointerId !== session.pointerId) return;
      stopNativeEvent(event);
      if (session.useRaw && session.receivedRaw) return;
      // Some browsers expose the raw-update property but do not emit the
      // event for a particular pointer. Fall back to coalesced pointermove.
      if (session.useRaw) session.useRaw = false;
      appendSamples(session, event);
    };

    const onPointerRawUpdate = (event) => {
      if (!session || event.pointerId !== session.pointerId) return;
      stopNativeEvent(event);
      if (!session.useRaw) return;
      session.receivedRaw = true;
      appendSamples(session, event);
    };

    const finishStroke = (event) => {
      if (!session || event.pointerId !== session.pointerId) return;
      const completed = session;
      stopNativeEvent(event);
      appendSamples(completed, event);

      try {
        const element = createFreeDrawElementFromSamples(completed.samples, completed.appState);
        const api = apiRef?.current;
        if (element && api?.updateScene) {
          const existing = api.getSceneElementsIncludingDeleted?.() || api.getSceneElements?.() || [];
          api.updateScene({
            elements: [...existing, element],
            captureUpdate: "IMMEDIATELY",
          });
        }
      } catch (error) {
        console.error("[Sketchizi] Free-draw commit failed:", error);
      }

      session = null;
      if (clearFrame) cancelAnimationFrame(clearFrame);
      // Let Excalidraw paint the committed scene before removing the preview.
      clearFrame = requestAnimationFrame(() => {
        clearFrame = requestAnimationFrame(() => {
          clearFrame = 0;
          if (!session) clearPreview();
        });
      });
    };

    const onWindowBlur = () => {
      if (session) finishStroke({ pointerId: session.pointerId });
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden" && session) {
        finishStroke({ pointerId: session.pointerId });
      }
    };

    attachPreview();
    root.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove, true);
    window.addEventListener("pointerrawupdate", onPointerRawUpdate, true);
    window.addEventListener("pointerup", finishStroke, true);
    window.addEventListener("pointercancel", finishStroke, true);
    window.addEventListener("blur", onWindowBlur);
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("resize", resizePreview, { passive: true });

    return () => {
      root.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove, true);
      window.removeEventListener("pointerrawupdate", onPointerRawUpdate, true);
      window.removeEventListener("pointerup", finishStroke, true);
      window.removeEventListener("pointercancel", finishStroke, true);
      window.removeEventListener("blur", onWindowBlur);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("resize", resizePreview);
      if (clearFrame) cancelAnimationFrame(clearFrame);
      previewCanvas?.remove();
      session = null;
    };
  }, [apiRef, canEdit, viewModeEnabled]);

  const handleSceneChange = useCallback((elements, appState, files) => {
    // Excalidraw can emit many scene changes during a single freehand gesture.
    // Avoid driving a React render (and grid/overlay recalculation) for every
    // point. While drawing, pointer-up publishes the settled revision.
    if (drawingPointerRef.current === null && !canvasRevisionFrameRef.current) {
      canvasRevisionFrameRef.current = requestAnimationFrame(() => {
        canvasRevisionFrameRef.current = 0;
        setCanvasRevision((revision) => revision + 1);
      });
    }
    handleChange?.(elements, appState, files);
  }, [handleChange]);
  const handleViewportChange = useCallback((...args) => {
    if (!canvasRevisionFrameRef.current) {
      canvasRevisionFrameRef.current = requestAnimationFrame(() => {
        canvasRevisionFrameRef.current = 0;
        setCanvasRevision((revision) => revision + 1);
      });
    }
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

  // Keep the contextual dock in the Primary Dock's bottom-center slot.
  // The Primary Dock is removed from layout while contextual controls are mounted.
  useEffect(() => {
    const root = canvasRootRef.current;
    if (!root) return undefined;
    let frame = 0;
    const placeContextualDock = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const dock = root.querySelector(".sketchizi-tool-options-dock");
        if (!dock) return;
        const canvasRect = root.getBoundingClientRect();
        const dockRect = dock.getBoundingClientRect();
        const maxWidth = Math.max(0, canvasRect.width - 16);
        const left = canvasRect.left + (canvasRect.width - Math.min(dockRect.width, maxWidth)) / 2;
        const top = Math.max(canvasRect.top + 8, canvasRect.bottom - dockRect.height - 16);
        dock.style.setProperty("position", "fixed", "important");
        dock.style.setProperty("left", `${left}px`, "important");
        dock.style.setProperty("top", `${top}px`, "important");
        dock.style.setProperty("right", "auto", "important");
        dock.style.setProperty("bottom", "auto", "important");
        dock.style.setProperty("transform", "none", "important");
        dock.style.setProperty("z-index", "10030", "important");
        dock.style.setProperty("max-width", `calc(${maxWidth}px)`, "important");
      });
    };
    const observer = new MutationObserver(placeContextualDock);
    observer.observe(root, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(placeContextualDock)
      : null;
    resizeObserver?.observe(root);
    window.addEventListener("resize", placeContextualDock);
    window.addEventListener("scroll", placeContextualDock, true);
    placeContextualDock();
    return () => {
      observer.disconnect();
      resizeObserver?.disconnect();
      window.removeEventListener("resize", placeContextualDock);
      window.removeEventListener("scroll", placeContextualDock, true);
      cancelAnimationFrame(frame);
      const dock = root.querySelector(".sketchizi-tool-options-dock");
      if (dock) ["position", "left", "top", "right", "bottom", "transform", "z-index", "max-width"].forEach((property) => dock.style.removeProperty(property));
    };
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
      const canvasRect = root.getBoundingClientRect();
      const rect = container.getBoundingClientRect();
      const minLeft = canvasRect.left + 8;
      const minTop = canvasRect.top + 8;
      const maxLeft = Math.max(minLeft, canvasRect.right - rect.width - 8);
      const maxTop = Math.max(minTop, canvasRect.bottom - rect.height - 8);
      const left = Math.min(maxLeft, Math.max(minLeft, rect.left));
      const top = Math.min(maxTop, Math.max(minTop, rect.top));
      container.style.setProperty("left", `${left}px`, "important");
      container.style.setProperty("top", `${top}px`, "important");
    };
    const decorateToolbar = () => {
      if (disposed) return;
      const toolbar = root.querySelector(".App-toolbar");
      const container = root.querySelector(".App-toolbar-container");
      if (!toolbar || !container) return;
      toolbar.dataset.sketchiziDock = "true";
      if (root.dataset.sketchiziDockPreview === "true") {
        toolbar.dataset.sketchiziDockPreview = "true";
        toolbar.dataset.sketchiziOrientation = "vertical";
        toolbar.dataset.sketchiziDockSide = "left";
        container.dataset.sketchiziDockPositioned = "true";
        container.style.setProperty("position", "fixed", "important");
        container.style.setProperty("left", "16px", "important");
        container.style.setProperty("top", "50%", "important");
        container.style.setProperty("right", "auto", "important");
        container.style.setProperty("bottom", "auto", "important");
        container.style.setProperty("transform", "translateY(-50%)", "important");
        container.style.setProperty("width", "max-content", "important");
        container.style.setProperty("max-width", "64px", "important");
        container.style.setProperty("height", "auto", "important");
        container.style.setProperty("max-height", "calc(100dvh - 32px)", "important");
        container.style.setProperty("overflow", "visible", "important");
      } else {
        toolbar.removeAttribute("data-sketchizi-dock-preview");
      }
      // Excalidraw renders its More Tools overflow trigger as a dropdown-menu
      // control in the toolbar. Hide that native trigger directly; matching
      // its localized accessible label is unreliable across Excalidraw builds.
      toolbar.querySelectorAll(":scope > .dropdown-menu-button").forEach((control) => {
        control.dataset.sketchiziHideOverflowTools = "true";
      });
      // The Primary Dock defaults to a horizontal strip centered at the
      // bottom of the canvas. Keep any explicitly user-positioned dock intact.
      if (!toolbar.dataset.sketchiziOrientation && !window.matchMedia("(max-width: 760px)").matches) {
        toolbar.dataset.sketchiziOrientation = "horizontal";
        delete toolbar.dataset.sketchiziDockSide;
      }
      if (!container.dataset.sketchiziDockPositioned && !window.matchMedia("(max-width: 760px)").matches) {
        const canvasRect = root.getBoundingClientRect();
        const dockRect = container.getBoundingClientRect();
        const dockWidth = dockRect.width || 48;
        const dockHeight = dockRect.height || 48;
        const minLeft = canvasRect.left + 8;
        const maxLeft = Math.max(minLeft, canvasRect.right - dockWidth - 8);
        const centeredLeft = canvasRect.left + (canvasRect.width - dockWidth) / 2;
        const left = Math.min(maxLeft, Math.max(minLeft, centeredLeft));
        const top = Math.max(canvasRect.top + 8, canvasRect.bottom - dockHeight - 16);
        container.style.setProperty("position", "fixed", "important");
        container.style.setProperty("left", `${left}px`, "important");
        container.style.setProperty("top", `${top}px`, "important");
        container.style.setProperty("right", "auto", "important");
        container.style.setProperty("bottom", "auto", "important");
        container.style.setProperty("transform", "none", "important");
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

      // Keep the native Selection tool as the visible collapsed-dock trigger.
      // Move its existing native wrapper to the first position; its original
      // React handler and keyboard shortcut remain untouched.
      const selectionButton = [...toolbar.querySelectorAll("button, [role='button']")].find((button) => {
        const label = `${button.getAttribute("aria-label") || ""} ${button.getAttribute("title") || ""} ${button.dataset.testid || ""}`.trim();
        return /(^|\\s)(select|selection)(?=\\s|$)/i.test(label);
      });
      if (selectionButton) {
        let selectionAnchor = selectionButton;
        while (selectionAnchor.parentElement && selectionAnchor.parentElement !== toolbar) {
          selectionAnchor = selectionAnchor.parentElement;
        }
        if (selectionAnchor.parentElement === toolbar) {
          selectionAnchor.dataset.sketchiziSelectionTrigger = "true";
          selectionButton.dataset.sketchiziSelectionTrigger = "true";
          toolbar.insertBefore(selectionAnchor, toolbar.firstChild);
        }
      }
      toolbar.dataset.sketchiziHoverExpand = "true";

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
    window.addEventListener("resize", placeScrollBackControl);
    const tooltipObserver = new MutationObserver(suppressNativeScrollBackTooltip);
    tooltipObserver.observe(document.body, { childList: true, subtree: true });
    suppressNativeScrollBackTooltip();
    return () => {
      disposed = true;
      observer?.disconnect();
      window.removeEventListener("resize", placeScrollBackControl);
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

  // Swap the Primary Dock out of the layout whenever contextual controls appear.
  useEffect(() => {
    const root = canvasRootRef.current;
    if (!root) return undefined;
    const syncDockVisibility = () => {
      const contextualDock = document.querySelector(".sketchizi-tool-options-dock");
      const primaryDock = root.querySelector(".App-toolbar-container");
      if (!primaryDock) return;
      const replacing = !!contextualDock;
      primaryDock.style.setProperty("display", replacing ? "none" : "", "important");
      primaryDock.setAttribute("aria-hidden", String(replacing));
      primaryDock.inert = replacing;
    };
    const observer = new MutationObserver(syncDockVisibility);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class"] });
    syncDockVisibility();
    return () => {
      observer.disconnect();
      const primaryDock = root.querySelector(".App-toolbar-container");
      if (primaryDock) {
        primaryDock.style.removeProperty("display");
        primaryDock.removeAttribute("aria-hidden");
        primaryDock.inert = false;
      }
    };
  }, []);

  // Coalesce high-frequency pointer events before updating collaboration
  // presence. This keeps remote-cursor work to at most one update per frame
  // and avoids competing with Excalidraw's time-critical pen event handling.
  const updateCursorFromPointer = (event) => {
    // Prioritize the local stroke over collaboration presence while drawing.
    if (drawingPointerRef.current !== null) return;
    const target = event.target;
    pendingCollaborationCursorRef.current = target instanceof Element && target.closest("canvas")
      ? { clientX: event.clientX, clientY: event.clientY, onCanvas: true }
      : { onCanvas: false };
    if (collaborationCursorFrameRef.current) return;
    collaborationCursorFrameRef.current = requestAnimationFrame(() => {
      collaborationCursorFrameRef.current = 0;
      const pending = pendingCollaborationCursorRef.current;
      pendingCollaborationCursorRef.current = null;
      if (!pending?.onCanvas) {
        updateCollaborationCursor?.(null);
        return;
      }
      const root = canvasRootRef.current;
      if (!root) return;
      const rect = root.getBoundingClientRect();
      updateCollaborationCursor?.({ x: pending.clientX - rect.left, y: pending.clientY - rect.top });
    });
  };
  const clearRemoteCursor = () => {
    pendingCollaborationCursorRef.current = null;
    if (collaborationCursorFrameRef.current) {
      cancelAnimationFrame(collaborationCursorFrameRef.current);
      collaborationCursorFrameRef.current = 0;
    }
    updateCollaborationCursor?.(null);
  };

  useEffect(() => () => {
    if (collaborationCursorFrameRef.current) cancelAnimationFrame(collaborationCursorFrameRef.current);
    collaborationCursorFrameRef.current = 0;
    pendingCollaborationCursorRef.current = null;
  }, []);
  const visibleSceneElements = apiRef?.current?.getSceneElements?.() || savedSketch?.elements || [];
  const isCanvasEmpty = visibleSceneElements.every((element) => element?.isDeleted || element?.deleted);
  const activeAppearance = ["sketch", "clean", "chalkboard"].includes(canvasAppearance) ? canvasAppearance : "clean";

  return (
    <main ref={canvasRootRef} className={`${viewModeEnabled ? "canvas viewer-mode" : "canvas"} canvas-appearance-${activeAppearance}`} data-canvas-appearance={activeAppearance} data-sketchizi-dock-preview={dockPreviewEnabled ? "true" : undefined} onDropCapture={handleDrop} onPointerMove={updateCursorFromPointer} onPointerLeave={clearRemoteCursor}>
      <button
        type="button"
        className="sketchizi-dock-preview-toggle"
        aria-label="Toggle experimental dock preview"
        aria-pressed={dockPreviewEnabled}
        onClick={() => setDockPreviewEnabled((enabled) => !enabled)}
      >
        <span className="sketchizi-dock-preview-indicator" aria-hidden="true" />
        {dockPreviewEnabled ? "Exit dock preview" : "Preview new dock"}
      </button>
      {dockPreviewEnabled && (
        <ExperimentalPrimaryDock
          rootRef={canvasRootRef}
          apiRef={apiRef}
          canEdit={canEdit && !viewModeEnabled}
          isDarkTheme={isDarkTheme}
          canvasRevision={canvasRevision}
        />
      )}
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
