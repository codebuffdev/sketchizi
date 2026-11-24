import test from "node:test";
import assert from "node:assert/strict";
import { register } from "node:module";

// Render-phase smoke test for the hooks extracted from App.jsx. It executes every hook body
// (state, refs, memoised callbacks) inside a real React render, wired exactly the way App wires
// them, so a missing parameter, a temporal-dead-zone ordering mistake or a bad return shape
// fails here instead of in the browser. Effects do not run under server rendering.
register("./fixtures/hook-smoke-loader.mjs", import.meta.url);
globalThis.window ??= {
  location: { search: "", href: "http://localhost/", pathname: "/", hash: "" },
  history: { state: null, replaceState() {} },
  addEventListener() {}, removeEventListener() {}, setTimeout, clearTimeout,
};

const React = (await import("react")).default;
const { renderToString } = await import("react-dom/server");
const { useWorkspaceTabState } = await import("../src/hooks/useWorkspaceTabState.js");
const { useDocumentPersistence } = await import("../src/hooks/useDocumentPersistence.js");
const { useWorkspaceTabs } = await import("../src/hooks/useWorkspaceTabs.js");

const noop = () => {};

function renderHooks() {
  const captured = {};
  function Harness() {
    const apiRef = React.useRef(null);
    const setCurrentFileRef = React.useRef(null);
    const globalThemeRef = React.useRef("light");
    const startupChoiceMadeRef = React.useRef(false);
    const toolStyles = React.useMemo(() => ({}), []);
    const handleExcalidrawAPI = React.useCallback(noop, []);
    const showToast = React.useCallback(noop, []);
    const [apiReady] = React.useState(false);

    const tabState = useWorkspaceTabState();
    const persistence = useDocumentPersistence({
      activeCanvasIdRef: tabState.activeCanvasIdRef,
      apiReady, apiRef,
      canvasTabsReady: tabState.canvasTabsReady,
      canvasTabsRef: tabState.canvasTabsRef,
      commitCanvasTabs: tabState.commitCanvasTabs,
      setCanvasTabs: tabState.setCanvasTabs,
      setCurrentFileRef, showToast,
    });

    // Stand-in for useFileManager's results (App assigns the bridge right after calling it).
    const currentFileRef = React.useRef(null);
    const getCurrentFileSceneSignature = React.useCallback(() => null, []);
    const fileActionsRef = React.useRef({});
    persistence.fileManagerBridgeRef.current = { currentFileRef, getCurrentFileSceneSignature };

    const tabs = useWorkspaceTabs({
      activeCanvasId: tabState.activeCanvasId, activeCanvasIdRef: tabState.activeCanvasIdRef,
      apiReady, apiRef,
      canvasTabsRef: tabState.canvasTabsRef, canvasTabsRestoredRef: tabState.canvasTabsRestoredRef,
      canvasTabsSaveTimerRef: tabState.canvasTabsSaveTimerRef,
      closeTabPrompt: tabState.closeTabPrompt, closedTabToastTimerRef: tabState.closedTabToastTimerRef,
      closedTabsRef: tabState.closedTabsRef,
      cloudDetachedRef: persistence.cloudDetachedRef, cloudDiagramId: persistence.cloudDiagramId,
      cloudDocumentName: persistence.cloudDocumentName, cloudFingerprintsRef: persistence.cloudFingerprintsRef,
      cloudHydrationPendingTabIdRef: persistence.cloudHydrationPendingTabIdRef,
      cloudLoadStartedRef: persistence.cloudLoadStartedRef, cloudRestoringTabIdRef: persistence.cloudRestoringTabIdRef,
      cloudRevisionRegistryRef: persistence.cloudRevisionRegistryRef, cloudSaveQueueRef: persistence.cloudSaveQueueRef,
      cloudSaveState: persistence.cloudSaveState, cloudSaveStateRef: persistence.cloudSaveStateRef,
      cloudSaveTimerRef: persistence.cloudSaveTimerRef, cloudSceneReadyRef: persistence.cloudSceneReadyRef,
      cloudSessionRef: persistence.cloudSessionRef,
      currentFile: null, currentFileRef, documentDirty: false, documentMetadataRef: persistence.documentMetadataRef,
      fileActionsRef, getCurrentFileSceneSignature, globalThemeRef, handleExcalidrawAPI,
      markCurrentDocumentChanged: noop, retryLocalSave: persistence.retryLocalSave,
      saveCloudDiagramNow: persistence.saveCloudDiagramNow, saveStatus: persistence.saveStatus,
      setActiveCanvasId: tabState.setActiveCanvasId, setActiveWorkspaceTabId: tabState.setActiveWorkspaceTabId,
      setCanvasTabs: tabState.setCanvasTabs, setCanvasTabsReady: tabState.setCanvasTabsReady,
      setCloseTabPrompt: tabState.setCloseTabPrompt, setClosedTabToast: tabState.setClosedTabToast,
      setClosedTabs: tabState.setClosedTabs, setCloudDetached: persistence.setCloudDetached,
      setCloudDocumentName: persistence.setCloudDocumentName, setCloudSaveState: persistence.setCloudSaveState,
      setCurrentFile: noop, setCurrentFileRef, setDontAskDraftChecked: tabState.setDontAskDraftChecked,
      setSavedSketch: persistence.setSavedSketch, setStartupChooserOpen: noop, showToast,
      sketchReady: persistence.sketchReady, skipDraftPromptRef: tabState.skipDraftPromptRef,
      startupChoiceMadeRef, toolStyles,
    });
    Object.assign(captured, { tabState, persistence, tabs });
    return null;
  }
  renderToString(React.createElement(Harness));
  return captured;
}

test("useWorkspaceTabState initialises one blank tab and stable refs", () => {
  const { tabState } = renderHooks();
  assert.equal(tabState.canvasTabs.length, 1);
  assert.equal(tabState.canvasTabs[0].id, "canvas-1");
  assert.equal(tabState.canvasTabs[0].dirty, false);
  assert.equal(tabState.activeCanvasId, "canvas-1");
  assert.equal(tabState.activeWorkspaceTabId, "canvas-1");
  assert.equal(tabState.canvasTabsReady, false);
  assert.equal(tabState.activeCanvasIdRef.current, "canvas-1", "the ref mirrors the active id during render");
  assert.equal(tabState.canvasTabsRef.current, tabState.canvasTabs);
  assert.deepEqual(tabState.closedTabs, []);
  assert.equal(tabState.closeTabPrompt, null);
});

test("commitCanvasTabs is a no-op until tabs have been restored", async () => {
  const { tabState } = renderHooks();
  assert.equal(tabState.canvasTabsRestoredRef.current, false);
  assert.equal(await tabState.commitCanvasTabs(), undefined);
});

test("useDocumentPersistence returns its full public surface with inactive cloud defaults", () => {
  const { persistence } = renderHooks();
  const expected = [
    "documentMetadataRef", "savedSketch", "setSavedSketch", "sketchReady", "storageError", "setStorageError",
    "saveStatus", "saveTimerRef", "persistSketchNow", "retryLocalSave", "resetLocalSketch", "downloadRecoveryBackup",
    "cloudDiagramId", "cloudProjectId", "cloudSessionRef", "cloudSaveTimerRef", "cloudSaveQueueRef",
    "cloudLoadStartedRef", "cloudHydrationPendingTabIdRef", "cloudRestoringTabIdRef", "cloudDetachedRef",
    "cloudDetached", "setCloudDetached", "cloudSceneReadyRef", "cloudSaveState", "setCloudSaveState",
    "cloudDocumentName", "setCloudDocumentName", "cloudRevisionRegistryRef", "cloudFingerprintsRef",
    "cloudConflictDismissed", "setCloudConflictDismissed", "cloudSaveStateRef", "chapterNav",
    "cloudSaveDialogOpen", "setCloudSaveDialogOpen", "saveDrawingToCloud", "queueSketchSave",
    "saveCloudDiagramNow", "navigateToChapter", "fileManagerBridgeRef",
  ];
  for (const key of expected) assert.ok(key in persistence, `missing ${key}`);
  assert.equal(Object.keys(persistence).length, expected.length, "no unexpected exports");
  assert.deepEqual(persistence.cloudSessionRef.current, { active: false, diagramId: "", projectId: "", revision: null, name: "" });
  assert.deepEqual(persistence.cloudSaveState, { state: "inactive", error: "" });
  assert.equal(persistence.cloudDetached, false);
  assert.equal(persistence.cloudDiagramId, "");
  assert.equal(persistence.cloudSaveDialogOpen, false);
  assert.equal(persistence.cloudConflictDismissed, false);
  assert.equal(persistence.cloudSaveStateRef.current, persistence.cloudSaveState, "the state ref mirrors state during render");
  assert.ok(persistence.cloudRevisionRegistryRef.current, "revision registry is created once");
  assert.ok(persistence.cloudFingerprintsRef.current instanceof Map);
  for (const fn of ["queueSketchSave", "saveDrawingToCloud", "saveCloudDiagramNow", "navigateToChapter"]) assert.equal(typeof persistence[fn], "function", fn);
});

test("the file-manager bridge is the only channel for late-bound file state", () => {
  const { persistence } = renderHooks();
  assert.deepEqual(Object.keys(persistence.fileManagerBridgeRef.current).sort(), ["currentFileRef", "getCurrentFileSceneSignature"]);
  assert.equal(persistence.fileManagerBridgeRef.current.currentFileRef.current, null);
  assert.equal(persistence.fileManagerBridgeRef.current.getCurrentFileSceneSignature(), null);
});

test("useWorkspaceTabs exposes every tab and workspace operation App renders", () => {
  const { tabs } = renderHooks();
  const expected = [
    "persistCanvasTabs", "updateActiveCanvasStartDate", "updateCanvasActivity", "openTodoTab", "closeTodoTab",
    "updateCanvasTodoItems", "persistActiveCanvasSnapshot", "switchCanvasTab", "selectWorkspaceTab", "setActiveCanvasTabType", "createCanvasTab",
    "reopenClosedTab", "deleteClosedTab", "clearClosedTabs", "performCloseCanvasTab", "closeCanvasTab",
    "saveAndCloseTab", "reorderCanvasTabs", "openCloudWorkspace", "openWorkspaceDiagram", "createWorkspaceChapter",
  ];
  for (const key of expected) assert.equal(typeof tabs[key], "function", key);
  assert.equal(Object.keys(tabs).length, expected.length, "no unexpected exports");
});
