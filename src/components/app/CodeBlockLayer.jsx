import { useCallback, useEffect, useRef, useState } from "react";
import { sceneCoordsToViewportCoords, viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import CodeBlockEditor from "./CodeBlockEditor.jsx";
import { CODE_METRICS, getCodeBlockGeometry } from "../../features/canvas/codeBlock/codeBlockLayout.js";
import { DEFAULT_CODE_FILENAME } from "../../features/canvas/codeBlock/codeLanguages.js";
import { codeToCopy, findCodeBlocks, hitTestCodeBlock, readCodeBlock } from "../../features/canvas/codeBlock/codeBlockModel.js";
import { insertCodeBlock, restoreCodeBlock, setCodeBlockOpacity, rethemeCodeBlocks, updateCodeBlock } from "../../features/canvas/codeBlock/codeBlockScene.js";
import { copyTextToClipboard } from "../../features/canvas/codeBlock/copyToClipboard.js";
import { CODE_BLOCK_TOOL_ID, isCodeBlockShortcut, isTypingTarget } from "../../features/canvas/codeBlock/codeBlockShortcut.js";
import "../../styles/code-block.css";

const COPY_FEEDBACK_MS = 1400;

/**
 * Code Block tool: placement, editing and the hover Copy action for code
 * cards. Committed cards are canvas elements (see codeBlockScene.js); this
 * layer only owns the transient DOM editor and a Copy chip over hovered or
 * selected cards.
 */
export default function CodeBlockLayer({ apiRef, canvasRootRef, canvasRevision = 0, canEdit = true, viewModeEnabled = false, canvasTheme = "light", sceneKey = null }) {
  const layerRef = useRef(null);
  const [toolActive, setToolActive] = useState(false);
  const [session, setSession] = useState(null);
  const [hoveredId, setHoveredId] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const toolActiveRef = useRef(false);
  const swallowGestureRef = useRef(false);
  const sessionRef = useRef(null);
  const copiedTimerRef = useRef(0);
  const interactive = canEdit && !viewModeEnabled;
  const themeRef = useRef(canvasTheme);
  themeRef.current = canvasTheme;
  sessionRef.current = session;
  toolActiveRef.current = toolActive;

  const deactivateTool = useCallback(({ notify = true } = {}) => {
    if (!toolActiveRef.current) return;
    toolActiveRef.current = false;
    setToolActive(false);
    if (notify) window.dispatchEvent(new CustomEvent("sketchizi:clear-custom-tool", { detail: { tool: CODE_BLOCK_TOOL_ID } }));
  }, []);

  /* ------------------------------------------------------------ editor sessions */
  const openNew = useCallback((point) => {
    setSession({ id: null, x: point.x, y: point.y, scale: 1, focus: "code", original: null, data: { code: "", filename: DEFAULT_CODE_FILENAME, theme: themeRef.current } });
  }, []);

  const openEdit = useCallback((element, focus = "code") => {
    const api = apiRef.current;
    const data = readCodeBlock(element);
    if (!api || !data) return;
    const original = { id: element.id, opacity: element.opacity ?? 100 };
    api.updateScene({ appState: { selectedElementIds: {} }, captureUpdate: "NEVER" });
    setCodeBlockOpacity(api, element.id, 0);
    // Carry the user's resize into the editor: `scale` is the uniform zoom of the card on the canvas and
    // `box` the natural-size floor, so the overlay opens at exactly the canvas size with no jump.
    const { scale, box } = getCodeBlockGeometry(element, data);
    setSession({ id: element.id, x: element.x, y: element.y, scale, focus, original, data: { ...data, box, theme: themeRef.current } });
  }, [apiRef]);

  const handleCommit = useCallback((next) => {
    const current = sessionRef.current;
    const api = apiRef.current;
    setSession(null);
    if (!current || !api) return;
    const data = { ...next, theme: themeRef.current };
    if (current.id === null) {
      if (data.code.trim()) insertCodeBlock(api, { x: current.x, y: current.y, ...data });
      return;
    }
    // Put the original back first (not undoable) so one Undo returns to the pre-edit card.
    restoreCodeBlock(api, current.original);
    const before = current.data;
    const changed = before.code !== data.code || before.filename !== data.filename || before.theme !== data.theme;
    if (changed) updateCodeBlock(api, current.id, data, { scale: current.scale });
    else api.updateScene({ appState: { selectedElementIds: { [current.id]: true } }, captureUpdate: "NEVER" });
  }, [apiRef]);

  // A tab switch / unmount while editing must not leave the card hidden.
  useEffect(() => () => {
    const current = sessionRef.current;
    const api = apiRef.current;
    if (current?.id && current.original && api) { try { restoreCodeBlock(api, current.original); } catch { /* scene already gone */ } }
  }, [apiRef]);

  /* ------------------------------------------------------------ tool activation (dock click or "C") */
  useEffect(() => {
    const onActivate = (event) => {
      const tool = String(event.detail?.tool || "").toLowerCase();
      if (tool === CODE_BLOCK_TOOL_ID) {
        if (!interactive) return;
        apiRef.current?.setActiveTool?.({ type: "selection" });
        setToolActive(true);
      } else if (toolActiveRef.current) {
        setToolActive(false);
      }
    };
    const onClear = (event) => {
      if (String(event.detail?.tool || "").toLowerCase() === CODE_BLOCK_TOOL_ID) return;
      setToolActive(false);
    };
    window.addEventListener("sketchizi:activate-tool", onActivate);
    window.addEventListener("sketchizi:clear-custom-tool", onClear);
    return () => {
      window.removeEventListener("sketchizi:activate-tool", onActivate);
      window.removeEventListener("sketchizi:clear-custom-tool", onClear);
    };
  }, [apiRef, interactive]);

  // Picking any native Excalidraw tool ends the Code Block tool.
  useEffect(() => {
    if (!toolActive) return;
    const type = apiRef.current?.getAppState?.()?.activeTool?.type;
    if (type && type !== "selection") deactivateTool();
  }, [canvasRevision, toolActive, apiRef, deactivateTool]);

  useEffect(() => {
    const root = canvasRootRef.current;
    if (!root) return undefined;
    root.classList.toggle("sketchizi-code-tool-active", toolActive);
    return () => root.classList.remove("sketchizi-code-tool-active");
  }, [toolActive, canvasRootRef]);

  /* ------------------------------------------------------------ keyboard: "C", Esc, Enter-to-edit */
  useEffect(() => {
    const onKeyDown = (event) => {
      if (!interactive) return;
      if (isCodeBlockShortcut(event)) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        window.dispatchEvent(new CustomEvent("sketchizi:activate-tool", { detail: { tool: CODE_BLOCK_TOOL_ID } }));
        return;
      }
      if (sessionRef.current || isTypingTarget(event.target)) return;
      if (event.key === "Escape" && toolActiveRef.current) {
        event.preventDefault();
        event.stopPropagation();
        deactivateTool();
        return;
      }
      if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey) {
        const api = apiRef.current;
        const selectedIds = Object.entries(api?.getAppState?.()?.selectedElementIds || {}).filter(([, on]) => on).map(([id]) => id);
        if (selectedIds.length !== 1) return;
        const element = findCodeBlocks(api.getSceneElements()).find((candidate) => candidate.id === selectedIds[0]);
        if (!element) return;
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        openEdit(element);
      }
    };
    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [apiRef, interactive, deactivateTool, openEdit]);

  /* ------------------------------------------------------------ canvas pointer: place / edit / hover */
  useEffect(() => {
    const root = canvasRootRef.current;
    if (!root) return undefined;
    const isCanvasTarget = (target) => target instanceof HTMLCanvasElement && root.contains(target);
    const toScene = (event) => {
      const appState = apiRef.current?.getAppState?.();
      return appState ? viewportCoordsToSceneCoords({ clientX: event.clientX, clientY: event.clientY }, appState) : null;
    };

    // While the tool is armed, swallow the whole click gesture so Excalidraw never sees it.
    // The gesture that placed a block is swallowed to its final click, otherwise
    // Excalidraw's trailing pointerup/click would steal focus from the new editor.
    let gestureTimer = 0;
    const endGesture = () => { swallowGestureRef.current = false; window.clearTimeout(gestureTimer); };
    const swallow = (event) => {
      if (!(toolActiveRef.current || swallowGestureRef.current) || !interactive || event.button > 0 || !isCanvasTarget(event.target)) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      if (event.type === "click") endGesture();
    };
    const onPointerDown = (event) => {
      if (!toolActiveRef.current || !interactive || event.button > 0 || !isCanvasTarget(event.target)) return;
      swallow(event);
      const point = toScene(event);
      if (!point) return;
      swallowGestureRef.current = true;
      window.clearTimeout(gestureTimer);
      gestureTimer = window.setTimeout(endGesture, 1200); // safety net if no click follows (drag off-canvas)
      deactivateTool();
      openNew(point);
    };
    const onDoubleClick = (event) => {
      if (!interactive || !isCanvasTarget(event.target)) return;
      const point = toScene(event);
      const element = point && hitTestCodeBlock(apiRef.current?.getSceneElements?.(), point);
      if (!element) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      openEdit(element, point.y - element.y < CODE_METRICS.headerHeight ? "filename" : "code");
    };
    let hoverFrame = 0;
    const onPointerMove = (event) => {
      if (sessionRef.current || hoverFrame) return;
      hoverFrame = requestAnimationFrame(() => {
        hoverFrame = 0;
        if (!isCanvasTarget(event.target)) return;
        const point = toScene(event);
        const element = point && hitTestCodeBlock(apiRef.current?.getSceneElements?.(), point, 6);
        setHoveredId((current) => ((element?.id ?? null) === current ? current : (element?.id ?? null)));
      });
    };
    const onPointerLeave = () => setHoveredId(null);

    for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "click"]) {
      root.addEventListener(type, type === "pointerdown" ? onPointerDown : swallow, true);
    }
    root.addEventListener("dblclick", onDoubleClick, true);
    root.addEventListener("pointermove", onPointerMove, { passive: true });
    root.addEventListener("pointerleave", onPointerLeave);
    return () => {
      for (const type of ["pointerdown", "pointerup", "mousedown", "mouseup", "click"]) {
        root.removeEventListener(type, type === "pointerdown" ? onPointerDown : swallow, true);
      }
      root.removeEventListener("dblclick", onDoubleClick, true);
      root.removeEventListener("pointermove", onPointerMove);
      root.removeEventListener("pointerleave", onPointerLeave);
      window.clearTimeout(gestureTimer);
      if (hoverFrame) cancelAnimationFrame(hoverFrame);
    };
  }, [apiRef, canvasRootRef, interactive, deactivateTool, openNew, openEdit]);

  /* ------------------------------------------------------------ theme: repaint cards for the current mode */
  useEffect(() => {
    const api = apiRef.current;
    if (!api?.getSceneElements) return undefined;
    // Defer past Excalidraw's own theme/scene update cycle.
    const frame = requestAnimationFrame(() => {
      try { rethemeCodeBlocks(api, canvasTheme); } catch { /* scene not ready yet */ }
    });
    return () => cancelAnimationFrame(frame);
  }, [apiRef, canvasTheme, sceneKey, canvasRevision > 0]);

  useEffect(() => () => window.clearTimeout(copiedTimerRef.current), []);

  /* ------------------------------------------------------------ render */
  const api = apiRef.current;
  const appState = api?.getAppState?.();
  const layerRect = layerRef.current?.getBoundingClientRect();
  const zoom = Number(appState?.zoom?.value ?? appState?.zoom) || 1;
  const toLocal = (sceneX, sceneY) => {
    const client = sceneCoordsToViewportCoords({ sceneX, sceneY }, appState);
    return { left: client.x - (layerRect?.left || 0), top: client.y - (layerRect?.top || 0) };
  };

  let editor = null;
  if (session && appState && layerRect) {
    const pos = toLocal(session.x, session.y);
    editor = <CodeBlockEditor key={session.id ?? "new"} session={session} left={pos.left} top={pos.top} zoom={zoom * (session.scale || 1)} theme={canvasTheme} onCommit={handleCommit} />;
  }

  // Copy chip: hovered or selected card, above its top-right corner.
  let copyChip = null;
  if (!session && appState && layerRect && zoom >= 0.4) {
    const selectedIds = Object.entries(appState.selectedElementIds || {}).filter(([, on]) => on).map(([id]) => id);
    const targetId = hoveredId || (selectedIds.length === 1 ? selectedIds[0] : null);
    const element = targetId && findCodeBlocks(api.getSceneElements()).find((candidate) => candidate.id === targetId);
    if (element) {
      const topRight = toLocal(element.x + element.width, element.y);
      const chipHeight = Math.max(18, Math.min(26, CODE_METRICS.headerHeight * zoom));
      copyChip = (
        <button
          type="button"
          className="sk-code-copy-chip"
          data-testid="code-block-copy"
          aria-label="Copy code"
          style={{ left: topRight.left, top: topRight.top + (CODE_METRICS.headerHeight * zoom - chipHeight) / 2, height: chipHeight }}
          onMouseDown={(event) => event.preventDefault()}
          onClick={async (event) => {
            event.stopPropagation();
            const ok = await copyTextToClipboard(codeToCopy(readCodeBlock(element)));
            if (!ok) return;
            setCopiedId(element.id);
            window.clearTimeout(copiedTimerRef.current);
            copiedTimerRef.current = window.setTimeout(() => setCopiedId(null), COPY_FEEDBACK_MS);
          }}
        >
          {copiedId === element.id ? "Copied" : "Copy"}
        </button>
      );
    }
  }

  return (
    <div ref={layerRef} className="sk-code-layer" data-active={toolActive ? "true" : "false"}>
      {editor}
      {copyChip}
    </div>
  );
}
