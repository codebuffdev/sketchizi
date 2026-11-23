import { useCallback, useRef, useState } from "react";
import { createTabDates } from "../features/canvas/canvasStartDate.js";
import { readSkipLocalDraftPrompt } from "../features/navigation/useSketchiziPreferences";
import { saveCanvasTabs } from "../persistence.js";

/**
 * Tab & workspace lifecycle, phase 1: the state and refs that describe the open canvas tabs,
 * the recently-closed ("local drafts") list and the close-tab prompt.
 *
 * This is split from useWorkspaceTabs (phase 2, the operations) on purpose: persistence
 * needs commitCanvasTabs/canvasTabsRef/setCanvasTabs early, while the operations need
 * values produced by persistence and the file manager. Declaring state first keeps every
 * dependency flowing forward with no late-bound closures.
 *
 * Moved verbatim out of App.jsx; declaration order is unchanged.
 */
export function useWorkspaceTabState() {
  const [canvasTabs, setCanvasTabs] = useState(() => [{ id: "canvas-1", name: "Canvas 1", ...createTabDates(), snapshot: null, dirty: false }]);
  const [closeTabPrompt, setCloseTabPrompt] = useState(null);
  const [dontAskDraftChecked, setDontAskDraftChecked] = useState(false);

  // Recently closed tabs ("local drafts"): persisted in IndexedDB so a closed
  // canvas can always be reopened, including after a page reload.
  const [closedTabs, setClosedTabs] = useState([]);
  const closedTabsRef = useRef([]);
  const [closedTabToast, setClosedTabToast] = useState(null);
  const closedTabToastTimerRef = useRef(null);
  const skipDraftPromptRef = useRef(readSkipLocalDraftPrompt());
  const [activeCanvasId, setActiveCanvasId] = useState("canvas-1");
  const [activeWorkspaceTabId, setActiveWorkspaceTabId] = useState("canvas-1");
  const [canvasTabsReady, setCanvasTabsReady] = useState(false);
  const canvasTabsRef = useRef(canvasTabs);
  const activeCanvasIdRef = useRef("canvas-1");
  const canvasTabsRestoredRef = useRef(false);
  const canvasTabsSaveTimerRef = useRef(null);
  const commitCanvasTabs = useCallback(() => {
    if (!canvasTabsRestoredRef.current) return Promise.resolve();
    return saveCanvasTabs(canvasTabsRef.current);
  }, []);
  activeCanvasIdRef.current = activeCanvasId;

  return {
    canvasTabs,
    setCanvasTabs,
    closeTabPrompt,
    setCloseTabPrompt,
    dontAskDraftChecked,
    setDontAskDraftChecked,
    closedTabs,
    setClosedTabs,
    closedTabsRef,
    closedTabToast,
    setClosedTabToast,
    closedTabToastTimerRef,
    skipDraftPromptRef,
    activeCanvasId,
    setActiveCanvasId,
    activeWorkspaceTabId,
    setActiveWorkspaceTabId,
    canvasTabsReady,
    setCanvasTabsReady,
    canvasTabsRef,
    activeCanvasIdRef,
    canvasTabsRestoredRef,
    canvasTabsSaveTimerRef,
    commitCanvasTabs,
  };
}
