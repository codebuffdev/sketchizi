import { useCallback, useEffect, useRef, useState } from "react";
import { Excalidraw } from "@excalidraw/excalidraw";
import Minimap from "../../Minimap";
import ShortcutHelp from "../../ShortcutHelp";
import { RemoteCursors, RemoteSelections } from "./CollaborationPresence";
import { getCanvasBackground } from "../../features/navigation/canvasTheme.js";
import { DEFAULT_FONT_FAMILY_ID, normalizeFontFamilyId } from "../../features/canvas/fontFamilyDefaults.js";

export default function SketchiziCanvas({
  savedSketch, isDarkTheme, handleExcalidrawAPI, handleChange, handleDrop,
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
      <RemoteCursors participants={collaborationParticipants} selfId={collaborationSelfId} />
      <RemoteSelections participants={collaborationParticipants} selfId={collaborationSelfId} apiRef={apiRef} />
      <Minimap minimapOpen={minimapOpen} minimapScene={minimapScene} apiRef={apiRef} minimapDragRef={minimapDragRef} centerOnMinimap={centerOnMinimap} />
      <ShortcutHelp open={shortcutHelpOpen} onClose={closeShortcuts} />
    </main>
  );
}
