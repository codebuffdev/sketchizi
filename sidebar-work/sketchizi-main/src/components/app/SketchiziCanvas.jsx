import { Excalidraw } from "@excalidraw/excalidraw";
import Minimap from "../../Minimap";
import ShortcutHelp from "../../ShortcutHelp";
import { RemoteCursors, RemoteSelections } from "./CollaborationPresence";

export default function SketchiziCanvas({
  savedSketch, isDarkTheme, handleExcalidrawAPI, handleChange, handleDrop,
  viewModeEnabled = false,
  minimapOpen, minimapScene, apiRef, minimapDragRef, centerOnMinimap,
  closeShortcuts, shortcutHelpOpen, setMinimapOpen, collaborationParticipants = [], collaborationSelfId, updateCollaborationCursor, onViewportChange,
}) {
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
    <main className={viewModeEnabled ? "canvas viewer-mode" : "canvas"} onDropCapture={handleDrop} onPointerMove={updateCursorFromPointer} onPointerLeave={clearRemoteCursor}>
      <Excalidraw
        initialData={savedSketch ? {
          elements: savedSketch.elements || [],
          appState: savedSketch.appState ? { ...savedSketch.appState, zoom: { value: savedSketch.appState.zoom?.value ?? savedSketch.appState.zoom ?? 1 } } : {},
          files: savedSketch.files || {},
        } : undefined}
        excalidrawAPI={handleExcalidrawAPI}
        onExcalidrawAPI={handleExcalidrawAPI}
        theme={isDarkTheme ? "dark" : "light"}
        viewModeEnabled={viewModeEnabled}
        aiEnabled={true}
        onChange={handleChange}
        onScrollChange={onViewportChange}
      />
      <RemoteCursors participants={collaborationParticipants} selfId={collaborationSelfId} />
      <RemoteSelections participants={collaborationParticipants} selfId={collaborationSelfId} apiRef={apiRef} />
      <Minimap minimapOpen={minimapOpen} minimapScene={minimapScene} apiRef={apiRef} minimapDragRef={minimapDragRef} centerOnMinimap={centerOnMinimap} />
      <ShortcutHelp open={shortcutHelpOpen} onClose={closeShortcuts} />
    </main>
  );
}
