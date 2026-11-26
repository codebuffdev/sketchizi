import { useCallback, useEffect, useRef, useState } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import Minimap from "../../Minimap";
import ShortcutHelp from "../../ShortcutHelp";
import ToolOptionsDock from "./ToolOptionsDock";
import PrimaryDock from "./PrimaryDock";
import CanvasVerticalScrollbar from "./CanvasVerticalScrollbar";
import AlignmentGuides from "./AlignmentGuides";
import TextSizeIndicator from "./TextSizeIndicator";
import SelectionFrame from "./SelectionFrame";
import ShapeMeasurements from "./ShapeMeasurements";
import RectangleTitles from "./RectangleTitles";
import ArrowVertexEditor from "./ArrowVertexEditor";
import { RemoteCursors, RemoteSelections } from "./CollaborationPresence";
import { getCanvasAppearanceBackground, getCanvasAppearanceRoughness, getCanvasAppearanceTheme } from "../../features/navigation/canvasAppearance.js";
import { DEFAULT_FONT_FAMILY_ID, normalizeFontFamilyId } from "../../features/canvas/fontFamilyDefaults.js";
import { handleStickyNoteRapidFlow } from "../../features/canvas/stickyNoteFlow.js";
import { applyMarkdownListEdit, getMarkdownListEdit, getMarkdownHeadingInputEdit } from "../../features/canvas/markdownListShortcuts.js";
import { getScrollBackPlacement } from "../../features/canvas/scrollBackPlacement.js";
import { workspaceFocusRect, spotlightGridPattern, workspaceCoarseGridPattern } from "../../features/canvas/gridSpotlight.js";
import { createFreeDrawElementFromSamples, drawFreeDrawPreviewSample, getPointerEventSamples } from "../../features/canvas/freeDrawEngine.js";

export default function SketchiziCanvas({
  savedSketch, isDarkTheme, handleExcalidrawAPI, handleChange, handleDrop,
  pageContext,
  todoItems = [],
  onTodoItemsChange,
  onOpenTodoTab,
  viewModeEnabled = false,
  minimapOpen, minimapScene, apiRef, minimapDragRef, centerOnMinimap,
  selectedElements = [], onClearSelection, canEdit = true,
  closeShortcuts, shortcutHelpOpen, setMinimapOpen, collaborationParticipants = [], collaborationSelfId, updateCollaborationCursor, onViewportChange,
  gridEnabled = false, gridStyle = "focus", canvasAppearance = "clean", onGridVisibilityChange,
  nativeMenuOpen = false,
  hudSuppressed = false,
  onToolStyleChange = null,
}) {
  const canvasRootRef = useRef(null);
  const collaborationCursorFrameRef = useRef(0);
  const pendingCollaborationCursorRef = useRef(null);
  const [canvasRevision, setCanvasRevision] = useState(0);
  const canvasRevisionFrameRef = useRef(0);
  const spotlightNodeRef = useRef(null);
  const drawingPointerRef = useRef(null);
  const textEditingRef = useRef(false);
  const dropActiveRef = useRef(false);
  const workAnchorRef = useRef(null);
  const spotlightSelectedRef = useRef(selectedElements);
  spotlightSelectedRef.current = selectedElements;

  const cameraLockUpdateRef = useRef(false);
  const pagesMode = pageContext?.mode === "pages";

  useEffect(() => {
    const onTodoShortcut = (event) => {
      if (event.key?.toLowerCase() !== "l" || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      const target = event.target;
      if (target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select, [contenteditable='true']"))) return;
      if (pagesMode || viewModeEnabled || !canEdit) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      onOpenTodoTab?.();
    };
    window.addEventListener("keydown", onTodoShortcut, true);
    return () => window.removeEventListener("keydown", onTodoShortcut, true);
  }, [pagesMode, viewModeEnabled, canEdit, onOpenTodoTab]);

  // A Pages chapter is a bounded sheet, not an infinite canvas. Consume all
  // viewport-navigation gestures before Excalidraw can translate its camera.
  useEffect(() => {
    const root = canvasRootRef.current;
    if (!root || !pagesMode) return undefined;
    const stopViewportGesture = (event) => {
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    };
    const onPointerDown = (event) => {
      if (event.button === 1 || event.pointerType === "touch") stopViewportGesture(event);
    };
    const onKeyDown = (event) => {
      if (event.code !== "Space" || event.repeat) return;
      if (event.target instanceof Element &&
          event.target.closest("input, textarea, select, [contenteditable='true']")) return;
      stopViewportGesture(event);
    };
    root.addEventListener("wheel", stopViewportGesture, { capture: true, passive: false });
    root.addEventListener("touchmove", stopViewportGesture, { capture: true, passive: false });
    root.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      root.removeEventListener("wheel", stopViewportGesture, true);
      root.removeEventListener("touchmove", stopViewportGesture, true);
      root.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [pagesMode]);

  // Excalidraw assigns "S" to its color panel. When a shape is selected,
  // keep that shortcut from opening the panel; window capture runs before
  // Excalidraw's editor-level keyboard handlers.
  useEffect(() => {
    const shapeTypes = new Set([
      "rectangle", "ellipse", "diamond", "arrow", "line",
      "freedraw", "frame",
    ]);
    const handleShapeSelectionShortcut = (event) => {
      if (event.key?.toLowerCase() !== "s" ||
        event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
      if (event.target instanceof Element &&
        event.target.closest("input, textarea, select, [contenteditable='true']")) return;
      const hasSelectedShape = selectedElements.some((element) =>
        element && !element.isDeleted && shapeTypes.has(element.type));
      if (!hasSelectedShape) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    };
    window.addEventListener("keydown", handleShapeSelectionShortcut, true);
    return () => window.removeEventListener("keydown", handleShapeSelectionShortcut, true);
  }, [selectedElements]);


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
    const showGrid = !!gridEnabled && pageContext?.mode !== "pages";
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
    if (pageContext?.mode === "pages") {
      const zoomValue = Number(appState?.zoom?.value ?? appState?.zoom ?? 1);
      const cameraNeedsLock = appState?.scrollX !== 0 || appState?.scrollY !== 0 || zoomValue !== 1;
      const handToolActive = appState?.activeTool?.type === "hand";
      if ((cameraNeedsLock || handToolActive) && !cameraLockUpdateRef.current) {
        cameraLockUpdateRef.current = true;
        apiRef?.current?.updateScene?.({
          appState: {
            scrollX: 0,
            scrollY: 0,
            zoom: { value: 1 },
            ...(handToolActive ? { activeTool: { type: "selection" } } : {}),
          },
          captureUpdate: "NEVER",
        });
        requestAnimationFrame(() => { cameraLockUpdateRef.current = false; });
        appState = {
          ...appState,
          scrollX: 0,
          scrollY: 0,
          zoom: { value: 1 },
          ...(handToolActive ? { activeTool: { type: "selection" } } : {}),
        };
      }
    }
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
  }, [apiRef, handleChange, pageContext?.mode]);
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

  // Keep contextual formatting controls in the bottom-center workspace slot.
  // The Primary Dock remains independently fixed along the left edge.
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

  // Keep the native navigation area minimal; only reposition the scroll-back control.
  useEffect(() => {
    const root = canvasRootRef.current;
    if (!root) return undefined;
    let disposed = false;
    let observer;
    let observedContextualDock = null;
    const resizeObserver = typeof ResizeObserver !== "undefined"
      ? new ResizeObserver(() => placeScrollBackControl())
      : null;
    const placeScrollBackControl = () => {
      const buttons = [...root.querySelectorAll("button, [role='button']")];
      const button = buttons.find((candidate) => {
        const label = [
          candidate.getAttribute("aria-label"),
          candidate.getAttribute("title"),
          candidate.textContent,
        ].filter(Boolean).join(" ").replace(/\\s+/g, " ").trim();
        return /scroll back to content/i.test(label);
      });
      if (!button) return;
      button.classList.add("sketchizi-scroll-back-control");
      button.dataset.sketchiziTooltip = "Scroll back to content";
      if (!button.getAttribute("aria-label")) button.setAttribute("aria-label", "Scroll back to content");

      // Anchor the native action to the canvas bottom edge, independently of
      // the primary dock's position or orientation.
      const canvasRect = root.getBoundingClientRect();
      const position = getScrollBackPlacement({
        dock: {
          left: canvasRect.left,
          right: canvasRect.right,
          top: canvasRect.top,
          bottom: canvasRect.bottom,
          width: canvasRect.width,
          height: canvasRect.height,
        },
        viewportWidth: window.innerWidth,
        viewportHeight: window.innerHeight,
        bottomAligned: true,
        gap: 16,
      });

      // The contextual dock also occupies the bottom-center canvas slot.
      // When it is open, lift the scroll-back action just above it so both
      // controls remain visible and independently clickable.
      const contextualDock = root.querySelector(".sketchizi-tool-options-dock");
      if (contextualDock !== observedContextualDock) {
        if (observedContextualDock) resizeObserver?.unobserve(observedContextualDock);
        observedContextualDock = contextualDock;
        if (observedContextualDock) resizeObserver?.observe(observedContextualDock);
      }
      if (contextualDock && contextualDock.getClientRects().length) {
        const contextualRect = contextualDock.getBoundingClientRect();
        const buttonHeight = button.getBoundingClientRect().height || 42;
        const buttonWidth = button.getBoundingClientRect().width || 148;
        const overlapsHorizontally = position.left < contextualRect.right &&
          position.left + buttonWidth > contextualRect.left;
        const liftedTop = contextualRect.top - buttonHeight - 12;
        if (overlapsHorizontally && liftedTop >= canvasRect.top + 8) {
          position.top = Math.min(position.top, Math.round(liftedTop));
        } else if (overlapsHorizontally) {
          const rightSpace = canvasRect.right - contextualRect.right;
          const leftSpace = contextualRect.left - canvasRect.left;
          if (rightSpace >= buttonWidth + 12) {
            position.left = Math.round(contextualRect.right + 12);
          } else if (leftSpace >= buttonWidth + 12) {
            position.left = Math.round(contextualRect.left - buttonWidth - 12);
          }
        }
      }
      button.style.setProperty("position", "fixed", "important");
      button.style.setProperty("left", `${position.left}px`, "important");
      button.style.setProperty("top", `${position.top}px`, "important");
      button.style.setProperty("right", "auto", "important");
      button.style.setProperty("bottom", "auto", "important");
      button.style.setProperty("z-index", "10040", "important");
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
    resizeObserver?.observe(root);
    window.addEventListener("resize", placeScrollBackControl);
    const tooltipObserver = new MutationObserver(suppressNativeScrollBackTooltip);
    tooltipObserver.observe(document.body, { childList: true, subtree: true });
    suppressNativeScrollBackTooltip();
    return () => {
      disposed = true;
      observer?.disconnect();
      resizeObserver?.disconnect();
      observedContextualDock = null;
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
    const isEditorTextarea = (target) => target instanceof HTMLTextAreaElement &&
      target.matches(".excalidraw-textEditorContainer textarea");
    const getEditingElement = () => {
      const api = apiRef?.current;
      const id = api?.getAppState?.()?.editingTextElement?.id;
      if (!id) return null;
      const elements = api.getSceneElementsIncludingDeleted?.() || api.getSceneElements?.() || [];
      return elements.find((element) => element.id === id) || null;
    };
    // Heading style lives on the whole text box. Bold is recorded in
    // customData (Excalidraw text has no native font weight).
    const applyHeadingStyle = (edit) => {
      const api = apiRef?.current;
      const editing = getEditingElement();
      if (!api || !editing) return;
      const customData = { ...(editing.customData || {}) };
      if (edit.headingLevel) { customData.markdownHeading = edit.headingLevel; customData.fontWeight = 700; }
      else { delete customData.markdownHeading; delete customData.fontWeight; }
      const elements = api.getSceneElementsIncludingDeleted?.() || api.getSceneElements?.() || [];
      api.updateScene?.({
        elements: elements.map((element) => element.id === editing.id
          ? {
            ...element,
            fontSize: edit.headingFontSize,
            customData,
            version: (Number(element.version) || 0) + 1,
            versionNonce: Math.floor(Math.random() * 2147483647),
            updated: Date.now(),
          }
          : element),
        captureUpdate: "IMMEDIATELY",
      });
    };
    const handleMarkdownListKeyDown = (event) => {
      const textarea = event.target;
      if (!isEditorTextarea(textarea) || event.isComposing) return;
      const edit = getMarkdownListEdit({
        value: textarea.value,
        selectionStart: textarea.selectionStart,
        selectionEnd: textarea.selectionEnd,
        key: event.key,
        isHeading: Boolean(getEditingElement()?.customData?.markdownHeading),
      });
      if (!edit) return;
      event.preventDefault();
      event.stopPropagation();
      applyMarkdownListEdit(textarea, edit);
      if (edit.headingFontSize) applyHeadingStyle(edit);
    };
    // Fallback for keyboards/IMEs where keydown does not report " ".
    const handleMarkdownHeadingInput = (event) => {
      const textarea = event.target;
      if (!isEditorTextarea(textarea) || event.isComposing) return;
      const edit = getMarkdownHeadingInputEdit({
        value: textarea.value,
        selectionStart: textarea.selectionStart,
        selectionEnd: textarea.selectionEnd,
      });
      if (!edit) return;
      applyMarkdownListEdit(textarea, edit);
      applyHeadingStyle(edit);
    };
    root.addEventListener("input", handleMarkdownHeadingInput, true);
    root.addEventListener("keydown", handleMarkdownListKeyDown, true);
    return () => {
      root.removeEventListener("keydown", handleMarkdownListKeyDown, true);
      root.removeEventListener("input", handleMarkdownHeadingInput, true);
    };
  }, [canEdit, viewModeEnabled]);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (!apiRef?.current || !canEdit || viewModeEnabled) return;
      handleStickyNoteRapidFlow(event, apiRef.current);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [apiRef, canEdit, viewModeEnabled]);

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
  // Excalidraw's initialData is mount-only. Freeze it for this editor
  // instance; cloud loads and canvas-tab switches update the live scene via
  // api.updateScene and must never feed a new initialization object back in.
  const [excalidrawInitialData] = useState(() => ({
    elements: savedSketch?.elements || [],
    appState: {
      ...(savedSketch?.appState || {}),
      zenModeEnabled: false,
      zoom: { value: savedSketch?.appState?.zoom?.value ?? savedSketch?.appState?.zoom ?? 1 },
      currentItemFontFamily: normalizeFontFamilyId(savedSketch?.appState?.currentItemFontFamily) ?? DEFAULT_FONT_FAMILY_ID,
      viewBackgroundColor: savedSketch?.appState?.viewBackgroundColor || getCanvasAppearanceBackground(activeAppearance, isDarkTheme),
      ...(pageContext?.mode === "pages" ? { viewBackgroundColor: "transparent" } : {}),
      currentItemRoughness: savedSketch?.appState?.currentItemRoughness ?? (savedSketch ? 1 : getCanvasAppearanceRoughness(activeAppearance)),
      gridModeEnabled: false,
    },
    files: savedSketch?.files || {},
  }));

  useEffect(() => {
    if (pageContext?.mode !== "pages") return;
    apiRef?.current?.updateScene?.({ appState: { viewBackgroundColor: "transparent" }, captureUpdate: "NEVER" });
  }, [pageContext?.mode, pageContext?.page?.id, isDarkTheme, apiRef]);

  return (
    <main ref={canvasRootRef} className={`${viewModeEnabled ? "canvas viewer-mode" : "canvas"} canvas-appearance-${activeAppearance}${pageContext?.mode === "pages" ? " pages-canvas-wrapper" : ""}`} data-canvas-appearance={activeAppearance} onDropCapture={handleDrop} onPointerMove={updateCursorFromPointer} onPointerLeave={clearRemoteCursor}>
      {!hudSuppressed && <PrimaryDock
        rootRef={canvasRootRef}
        apiRef={apiRef}
        selectedElements={selectedElements}
        canEdit={canEdit && !viewModeEnabled}
        isDarkTheme={isDarkTheme}
        canvasRevision={canvasRevision}
        nativeMenuOpen={nativeMenuOpen}
        onToolStyleChange={onToolStyleChange}
        onOpenTodoTab={onOpenTodoTab}
      />}
      <Excalidraw
        // Preserve the drawing background when restoring a scene.
        initialData={excalidrawInitialData}
        excalidrawAPI={registerExcalidrawAPI}
        onExcalidrawAPI={registerExcalidrawAPI}
        theme={getCanvasAppearanceTheme(activeAppearance, isDarkTheme)}
        viewModeEnabled={viewModeEnabled || hudSuppressed}
        aiEnabled={true}
        onChange={handleSceneChange}
        onScrollChange={handleViewportChange}
      />
      {!hudSuppressed && <ToolOptionsDock apiRef={apiRef} selectedElements={selectedElements} onClearSelection={onClearSelection} canvasRevision={canvasRevision} canEdit={canEdit && !viewModeEnabled} onToolStyleChange={onToolStyleChange} />}
      <AlignmentGuides canvasRootRef={canvasRootRef} apiRef={apiRef} canEdit={canEdit} viewModeEnabled={viewModeEnabled} />
      <ArrowVertexEditor apiRef={apiRef} canvasRootRef={canvasRootRef} canvasRevision={canvasRevision} canEdit={canEdit} viewModeEnabled={viewModeEnabled || hudSuppressed} />
      <ShapeMeasurements apiRef={apiRef} canvasRootRef={canvasRootRef} selectedElements={selectedElements} canvasRevision={canvasRevision} viewModeEnabled={viewModeEnabled} isDarkTheme={isDarkTheme} />
      <RectangleTitles
        api={apiRef.current}
        canvasRootRef={canvasRootRef}
        elements={visibleSceneElements}
        pageContext={pageContext}
        canEdit={canEdit && !viewModeEnabled}
      />
      <SelectionFrame apiRef={apiRef} canvasRootRef={canvasRootRef} canvasRevision={canvasRevision} viewModeEnabled={viewModeEnabled || hudSuppressed} />
      <TextSizeIndicator apiRef={apiRef} canvasRootRef={canvasRootRef} selectedElements={selectedElements} canvasRevision={canvasRevision} />
      <RemoteCursors participants={collaborationParticipants} selfId={collaborationSelfId} />
      <RemoteSelections participants={collaborationParticipants} selfId={collaborationSelfId} apiRef={apiRef} />
      <CanvasVerticalScrollbar apiRef={apiRef} canvasRootRef={canvasRootRef} canvasRevision={canvasRevision} disabled={pageContext?.mode === "pages"} />
      <Minimap minimapOpen={minimapOpen} minimapScene={minimapScene} apiRef={apiRef} minimapDragRef={minimapDragRef} centerOnMinimap={centerOnMinimap} />
      <ShortcutHelp open={shortcutHelpOpen} onClose={closeShortcuts} />
    </main>
  );
}
