import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import Minimap from "../../Minimap";
import ShortcutHelp from "../../ShortcutHelp";
import { RemoteCursors, RemoteSelections } from "./CollaborationPresence";
import { getCanvasBackground } from "../../features/navigation/canvasTheme.js";
import { DEFAULT_FONT_FAMILY_ID, normalizeFontFamilyId } from "../../features/canvas/fontFamilyDefaults.js";
import { describeRuntimeOverlayNode, runtimeOverlayIsCurrent } from "../../features/simulation/experiments/runtimeOverlayModel.js";

export default function SketchiziCanvas({
  savedSketch, isDarkTheme, handleExcalidrawAPI, handleChange, handleDrop,
  workbench = null, runtimeOverlay = null, onFocusRuntimeEntity,
  viewModeEnabled = false,
  minimapOpen, minimapScene, apiRef, minimapDragRef, centerOnMinimap,
  closeShortcuts, shortcutHelpOpen, setMinimapOpen, collaborationParticipants = [], collaborationSelfId, updateCollaborationCursor, onViewportChange,
}) {
  const canvasRootRef = useRef(null);
  const [canvasRevision, setCanvasRevision] = useState(0);
  const handleSceneChange = useCallback((elements, appState, files) => {
    setCanvasRevision((revision) => revision + 1);
    handleChange?.(elements, appState, files);
  }, [handleChange]);
  const handleViewportChange = useCallback((...args) => {
    setCanvasRevision((revision) => revision + 1);
    onViewportChange?.(...args);
  }, [onViewportChange]);
  const registerExcalidrawAPI = useCallback((api) => {
    handleExcalidrawAPI?.(api);
    setCanvasRevision((revision) => revision + 1);
  }, [handleExcalidrawAPI]);

  useEffect(() => {
    const element = canvasRootRef.current;
    if (!element || typeof ResizeObserver === "undefined") return undefined;
    const observer = new ResizeObserver(() => setCanvasRevision((revision) => revision + 1));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const runtimeOverlayCards = useMemo(() => {
    if (!runtimeOverlayIsCurrent(runtimeOverlay, workbench, workbench?.activeViewId)) return [];
    const api = apiRef?.current;
    if (!api) return [];
    const appState = api.getAppState?.() || {};
    const elements = api.getSceneElementsIncludingDeleted?.() || api.getSceneElements?.() || [];
    const zoom = appState.zoom?.value ?? appState.zoom ?? 1;
    const scrollX = appState.scrollX ?? 0;
    const scrollY = appState.scrollY ?? 0;
    const nodeByEntityId = new Map((runtimeOverlay.nodes || []).map((node) => [node.entityId, node]));
    return elements.flatMap((element) => {
      const metadata = element?.customData?.workbench;
      if (element.isDeleted || metadata?.role !== "container" || metadata.viewId !== workbench.activeViewId) return [];
      const node = nodeByEntityId.get(metadata.entityId);
      if (!node) return [];
      const description = describeRuntimeOverlayNode(node);
      const left = (element.x + scrollX) * zoom;
      const top = (element.y + scrollY) * zoom;
      const height = Math.abs(element.height * zoom);
      const width = Math.abs(element.width * zoom);
      const badgeTop = top >= 34 ? top - 29 : top + Math.min(Math.max(5, height - 30), 8);
      const details = [description.statusLabel, description.detail].filter(Boolean).join(" · ");
      return [{
        id: `${element.id}:${node.entityId}`,
        elementId: element.id,
        entityId: node.entityId,
        name: node.name,
        ...description,
        investigated: runtimeOverlay.traceFocus?.entityId === node.entityId,
        traceRequestId: runtimeOverlay.traceFocus?.entityId === node.entityId ? runtimeOverlay.traceFocus.requestId : null,
        title: runtimeOverlay.traceFocus?.entityId === node.entityId
          ? `${node.name} · trace ${runtimeOverlay.traceFocus.requestId} · ${runtimeOverlay.scenarioLabel} · ${details}. Synthetic simulation output; not live telemetry.`
          : `${node.name} · ${runtimeOverlay.scenarioLabel} · ${details}. Synthetic simulation output; not live telemetry.`,
        ariaLabel: runtimeOverlay.traceFocus?.entityId === node.entityId
          ? `${node.name}. Trace focus for request ${runtimeOverlay.traceFocus.requestId}. ${details}. Scenario ${runtimeOverlay.scenarioLabel}. Click to focus component.`
          : `${node.name}. ${details}. Scenario ${runtimeOverlay.scenarioLabel}. Click to focus component.`,
        style: { left: Math.max(4, left + Math.min(8, Math.max(0, width - 24))), top: badgeTop, transform: `scale(${Math.min(1, Math.max(0.68, zoom))})` },
      }];
    });
  }, [apiRef, canvasRevision, runtimeOverlay, workbench]);

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

  return (
    <main ref={canvasRootRef} className={viewModeEnabled ? "canvas viewer-mode" : "canvas"} onDropCapture={handleDrop} onPointerMove={updateCursorFromPointer} onPointerLeave={clearRemoteCursor}>
      <Excalidraw
        // Always seed the scene with the active Day/Night background. Legacy
        // saved scenes may contain an old independent canvas color, which must
        // never flash or override the current global theme during initialization.
        initialData={{
          elements: savedSketch?.elements || [],
          appState: {
            ...(savedSketch?.appState || {}),
            zoom: { value: savedSketch?.appState?.zoom?.value ?? savedSketch?.appState?.zoom ?? 1 },
            currentItemFontFamily: normalizeFontFamilyId(savedSketch?.appState?.currentItemFontFamily) ?? DEFAULT_FONT_FAMILY_ID,
            viewBackgroundColor: getCanvasBackground(isDarkTheme),
          },
          files: savedSketch?.files || {},
        }}
        excalidrawAPI={registerExcalidrawAPI}
        onExcalidrawAPI={registerExcalidrawAPI}
        theme={isDarkTheme ? "dark" : "light"}
        viewModeEnabled={viewModeEnabled}
        aiEnabled={true}
        onChange={handleSceneChange}
        onScrollChange={handleViewportChange}
      />
      {runtimeOverlayCards.length > 0 && <div className="workbench-runtime-overlay-layer" aria-label="Selected scenario runtime status">
        <div className="workbench-runtime-overlay-legend" aria-live="polite">
          <span className="workbench-runtime-overlay-dot" aria-hidden="true" />
          <strong>SIMULATED</strong>
          <span>{runtimeOverlay.scenarioLabel}</span>
          <span className="workbench-runtime-overlay-disclaimer">Not live telemetry</span>
        </div>
        {runtimeOverlayCards.map((card) => <button
          type="button"
          key={card.id}
          className={`workbench-runtime-overlay-card ${card.tone}${card.investigated ? " is-investigated" : ""}`}
          style={card.style}
          title={card.title}
          aria-label={card.ariaLabel}
          onClick={() => onFocusRuntimeEntity?.(card.entityId)}
        >
          <span>{card.investigated ? "TRACE FOCUS · " + card.statusLabel : card.statusLabel}</span>
          <strong>{card.detail}</strong>
          {card.investigated && <em>{card.traceRequestId}</em>}
        </button>)}
      </div>}
      <RemoteCursors participants={collaborationParticipants} selfId={collaborationSelfId} />
      <RemoteSelections participants={collaborationParticipants} selfId={collaborationSelfId} apiRef={apiRef} />
      <Minimap minimapOpen={minimapOpen} minimapScene={minimapScene} apiRef={apiRef} minimapDragRef={minimapDragRef} centerOnMinimap={centerOnMinimap} />
      <ShortcutHelp open={shortcutHelpOpen} onClose={closeShortcuts} />
    </main>
  );
}
