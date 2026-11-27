import { useCallback, useEffect, useRef } from "react";
import { sanitizeTabAppState, createCanvasTabId } from "../features/workspace/tabSnapshot.js";
import { saveCanvasTabs, saveClosedTabs, loadClosedTabs, loadCanvasTabs, saveCanvasTabsPagehideBackup } from "../persistence.js";
import { getPages, pageSkeleton, DEFAULT_PAGE_SIZE } from "../features/pages/pageModel.js";
import { logger } from "../logging/logger";
import { isValidCanvasStartDate, createTabDates, getLocalDateString, normalizeTabDates } from "../features/canvas/canvasStartDate.js";
import { restoreElements, CaptureUpdateAction, convertToExcalidrawElements } from "@excalidraw/excalidraw";
import { hydrateFilesSync, hydrateMissingFromCache } from "../features/workspace/binaryFileCache.js";
import { sceneFingerprint } from "../features/workspace/cloudSaveGuard.js";
import { hasCloudSceneChange, allowsEmptyCloudSave } from "../features/workspace/cloudSavePolicy.js";
import { isPristineCanvas } from "../features/workspace/tabClose.js";
import { createCloudDocument } from "../features/workspace/cloudDocument.js";
import { workspaceClient } from "../features/workspace/workspaceClient.js";
import { normalizeClosedTabs, buildClosedTabRecord, pushClosedTab, restoreClosedTab, removeClosedTab, isTabBackedByFileOrCloud } from "../features/workspace/closedTabs.js";
import { normalizeCloudDiagramResponse } from "../features/workspace/cloudDiagramPayload.js";
import { recordWorkspaceItemOpened } from "../features/workspace/workspacePresentation.js";
import { buildChapterEditorUrl } from "../features/workspace/useChapterNavigation.js";
import { readDiagramRows, findDuplicateDiagramName } from "../features/workspace/diagramNames.js";
import { resolveChapterSequence, readChapterLayout, appendChapter, writeChapterLayout, buildChapterLayout } from "../features/workspace/chapterSequence.js";
import { DEFAULT_SYSTEM_DESIGN_TAB_STATE, persistSystemDesignTabState } from "../features/system-design/systemDesignTabState.js";
import { orderTabsByPin, togglePinTab, PIN_LIMIT_MESSAGE } from "../features/workspace/tabPinning.js";

/**
 * Tab & workspace lifecycle, phase 2: everything that acts on the open canvas tabs.
 *
 *  - snapshot capture/apply and persistence of the tab list
 *  - switching, creating, reordering and closing tabs (including the close-tab prompt)
 *  - recently-closed tab archive / reopen
 *  - first-load restore of stored tabs (and rehydrating cloud tabs)
 *  - pagehide flush, dirty-state sync and cloud workspace navigation helpers
 *
 * Phase 1 (state and refs) lives in useWorkspaceTabState. This hook is called after
 * useDocumentPersistence and useFileManager because it consumes their results.
 *
 * Moved verbatim out of App.jsx; declaration order (and therefore effect order) is unchanged.
 */
function createDefaultPagesSnapshot(api, existingChapter = null) {
  const chapterId = existingChapter?.id || crypto.randomUUID();
  const title = existingChapter?.title || "Untitled Page";
  const appState = api?.getAppState?.() || {};
  const size = {
    width: Math.max(320, Math.round(appState.width || (typeof window !== "undefined" ? window.innerWidth : 0) || DEFAULT_PAGE_SIZE.width)),
    height: Math.max(320, Math.round(appState.height || (typeof window !== "undefined" ? window.innerHeight : 0) || DEFAULT_PAGE_SIZE.height)),
  };
  const elements = convertToExcalidrawElements(pageSkeleton([], size, chapterId), { regenerateIds: false })
    .map(element => element.id === chapterId ? {
      ...element,
      name: title,
      customData: {
        ...element.customData,
        pageOrder: 1,
        activeChapterId: chapterId,
        chapterTitle: title,
        tagline: existingChapter?.subtitle || "",
        completed: Boolean(existingChapter?.completed),
        paperTexture: existingChapter?.paperTexture || "dots",
      },
    } : element);
  const chapter = {
    ...(existingChapter || {}),
    id: chapterId,
    num: existingChapter?.num ?? "01",
    title,
    subtitle: existingChapter?.subtitle || "",
    completed: Boolean(existingChapter?.completed),
    paperTexture: existingChapter?.paperTexture || "dots",
    elements,
    appState: existingChapter?.appState || {},
  };
  return {
    elements,
    chapters: [chapter],
    activeChapterId: chapterId,
    appState: { viewBackgroundColor: api?.getAppState?.().viewBackgroundColor || "#ffffff", scrollX: 0, scrollY: 0, zoom: { value: 1 } },
    files: {}, metadata: {}, extensions: {}, format: "excalidraw",
    systemDesign: { ...DEFAULT_SYSTEM_DESIGN_TAB_STATE },
    file: null, cloudSession: { active: false, diagramId: "", projectId: "", revision: null, name: "" },
    cloudDetached: true, cloudSaveState: { state: "inactive", error: "" }, cloudDocumentName: "Cloud diagram",
  };
}

export function useWorkspaceTabs({
  activeCanvasId,
  activeCanvasIdRef,
  apiReady,
  apiRef,
  canvasTabsRef,
  canvasTabsRestoredRef,
  canvasTabsSaveTimerRef,
  closeTabPrompt,
  closedTabToastTimerRef,
  closedTabsRef,
  cloudDetachedRef,
  cloudDiagramId,
  cloudDocumentName,
  cloudFingerprintsRef,
  cloudHydrationPendingTabIdRef,
  cloudLoadStartedRef,
  cloudRestoringTabIdRef,
  cloudRevisionRegistryRef,
  cloudSaveQueueRef,
  cloudSaveState,
  cloudSaveStateRef,
  cloudSaveTimerRef,
  cloudSceneReadyRef,
  cloudSessionRef,
  currentFile,
  currentFileRef,
  documentDirty,
  documentMetadataRef,
  fileActionsRef,
  getCurrentFileSceneSignature,
  globalThemeRef,
  handleExcalidrawAPI,
  markCurrentDocumentChanged,
  retryLocalSave,
  saveCloudDiagramNow,
  saveStatus,
  setActiveCanvasId,
  setActiveWorkspaceTabId,
  setCanvasTabs,
  setCanvasTabsReady,
  setCloseTabPrompt,
  setClosedTabToast,
  setClosedTabs,
  setCloudDetached,
  setCloudDocumentName,
  setCloudSaveState,
  setCurrentFile,
  setCurrentFileRef,
  setDontAskDraftChecked,
  setSavedSketch,
  setStartupChooserOpen,
  showToast,
  sketchReady,
  skipDraftPromptRef,
  startupChoiceMadeRef,
  toolStyles,
  systemDesignRef,
} = {}) {
  // Read volatile UI state through a ref so captureCanvasTabSnapshot (and every
  // callback built on it, including Excalidraw's onChange) keeps a stable
  // identity. A changing onChange prop makes Excalidraw re-run componentDidUpdate
  // and call onChange again, which is what turned a status update into a loop.
  const canvasSnapshotStateRef = useRef(null);
  canvasSnapshotStateRef.current = { documentDirty, cloudSaveState, cloudDocumentName };
  const captureCanvasTabSnapshot = useCallback((elements, appState) => {
    const api = apiRef.current;
    const live = canvasSnapshotStateRef.current;
    const sceneElements = Array.isArray(elements) ? elements : (api?.getSceneElementsIncludingDeleted?.() || api?.getSceneElements?.() || []);
    const sceneAppState = appState || api?.getAppState?.() || {};
    const chapterFrames = getPages(sceneElements);
    const chapters = chapterFrames.map((frame, index) => ({
      id: frame.id,
      num: frame.customData?.pageOrder ?? index + 1,
      title: frame.customData?.chapterTitle || frame.name || `Chapter ${index + 1}`,
      tagline: frame.customData?.tagline || "",
      badge: frame.customData?.badge || "RULE OF THUMB",
      keyNote: frame.customData?.keyNote || "",
      completed: Boolean(frame.customData?.completed),
      paperTexture: frame.customData?.paperTexture || "Dots",
      elements: sceneElements.filter(element => element.id === frame.id || element.frameId === frame.id || element.customData?.sketchiziPagePaper === frame.id),
      appState: sanitizeTabAppState(frame.customData?.chapterAppState || {
        zoom: sceneAppState.zoom, scrollX: sceneAppState.scrollX, scrollY: sceneAppState.scrollY,
      }),
    }));
    const activeChapterId = chapterFrames.find(frame => frame.customData?.activeChapterId)?.customData?.activeChapterId || null;
    return {
      elements: sceneElements,
      appState: sanitizeTabAppState(sceneAppState),
      chapters,
      activeChapterId,
      files: api?.getFiles?.() || {},
      metadata: documentMetadataRef.current?.metadata || {},
      extensions: documentMetadataRef.current?.extensions || {},
      format: documentMetadataRef.current?.format || "excalidraw",
      file: currentFileRef.current || null,
      cloudSession: { ...cloudSessionRef.current },
      fileSceneSignature: getCurrentFileSceneSignature?.() || null,
      fileDirty: live.documentDirty,
      cloudDetached: cloudDetachedRef.current,
      cloudSaveState: { ...live.cloudSaveState },
      cloudDocumentName: live.cloudDocumentName,
      // Per-tool style memory travels with the tab so it survives tab switches and reloads.
      toolStylePresets: toolStyles.exportCanvas(activeCanvasIdRef.current) || undefined,
      systemDesign: systemDesignRef?.current?.getTabState?.(activeCanvasIdRef.current),
    };
  }, [apiRef, currentFileRef, getCurrentFileSceneSignature, toolStyles, systemDesignRef]);

  const persistCanvasTabs = useCallback((nextTabs) => {
    // Pinned tabs always sit at the far left and never exceed the pin cap.
    const normalizedTabs = orderTabsByPin(nextTabs).map((tab) => ({ ...tab, active: tab.id === activeCanvasIdRef.current }));
    canvasTabsRef.current = normalizedTabs;
    setCanvasTabs(normalizedTabs);
    try {
      const activeTab = normalizedTabs.find(tab => tab.id === activeCanvasIdRef.current);
      localStorage.setItem("sketchizi.active-workspace-tab-mode", activeTab?.type === "pages" || activeTab?.type === "page" ? "pages" : "infinite");
    } catch { /* The IndexedDB tab manifest remains authoritative. */ }
    if (canvasTabsSaveTimerRef.current) window.clearTimeout(canvasTabsSaveTimerRef.current);
    canvasTabsSaveTimerRef.current = window.setTimeout(() => {
      canvasTabsSaveTimerRef.current = null;
      saveCanvasTabs(canvasTabsRef.current).catch((error) => {
        logger.warn("Canvas tabs could not be saved", { category: "persistence", error });
      });
    }, 450);
  }, []);

  const persistSystemDesignState = useCallback((tabId, systemDesign) => {
    if (!tabId || !canvasTabsRestoredRef.current) return;
    const nextTabs = persistSystemDesignTabState(canvasTabsRef.current, tabId, systemDesign);
    persistCanvasTabs(nextTabs);
  }, [persistCanvasTabs]);

  const updateActiveCanvasStartDate = useCallback((startDate) => {
    if (!isValidCanvasStartDate(startDate)) return;
    persistCanvasTabs(canvasTabsRef.current.map((tab) => tab.id === activeCanvasIdRef.current
      ? { ...tab, startDate }
      : tab));
  }, [persistCanvasTabs]);

  const updateCanvasActivity = useCallback((tabId, activity) => {
    persistCanvasTabs(canvasTabsRef.current.map((tab) => tab.id === tabId
      ? { ...tab, activity }
      : tab));
  }, [persistCanvasTabs]);

  const openTodoTab = useCallback(() => {
    const tabId = activeCanvasIdRef.current;
    const nextTabs = canvasTabsRef.current.map((tab) => tab.id === tabId ? { ...tab, todoTabOpen: true, todoTabActive: true } : { ...tab, todoTabActive: false });
    persistCanvasTabs(nextTabs);
    setActiveWorkspaceTabId(`todo:${tabId}`);
  }, [persistCanvasTabs]);

  const closeTodoTab = useCallback((canvasId) => {
    const nextTabs = canvasTabsRef.current.map((tab) => tab.id === canvasId ? { ...tab, todoTabOpen: false, todoTabActive: false } : tab);
    persistCanvasTabs(nextTabs);
    setActiveWorkspaceTabId((current) => current === `todo:${canvasId}` ? canvasId : current);
  }, [persistCanvasTabs]);

  const updateCanvasTodoItems = useCallback((tabId, todoItems) => {
    persistCanvasTabs(canvasTabsRef.current.map((tab) => tab.id === tabId
      ? { ...tab, todoItems }
      : tab));
  }, [persistCanvasTabs]);

  const persistActiveCanvasSnapshot = useCallback((elements, appState) => {
    if (!canvasTabsRestoredRef.current) return;
    const snapshot = captureCanvasTabSnapshot(elements, appState);
    const activeTab = canvasTabsRef.current.find((tab) => tab.id === activeCanvasIdRef.current);
    const hasPersistenceChanges = Boolean(snapshot.fileDirty || snapshot.documentDirty
      || ["pending", "saving", "error", "conflict"].includes(snapshot.cloudSaveState?.state));
    // Excalidraw can emit onChange while restoring the generated Pages frame
    // and paper. Do not mark that empty scaffold as an authored/dirty draft.
    const pristine = isPristineCanvas({
      tab: activeTab ? { ...activeTab, dirty: false } : null,
      snapshot,
      elements: snapshot.elements,
      dirty: hasPersistenceChanges,
    });
    const next = canvasTabsRef.current.map((tab) => tab.id === activeCanvasIdRef.current
      ? { ...tab, snapshot, dirty: !pristine }
      : tab);

    // Scene changes arrive from Excalidraw's onChange callback. Persist the
    // snapshot without setting React state here: updating the tab manifest UI
    // on every scene event can feed a render loop back into the editor while
    // a cloud document is being restored.
    canvasTabsRef.current = next;
    if (canvasTabsSaveTimerRef.current) window.clearTimeout(canvasTabsSaveTimerRef.current);
    canvasTabsSaveTimerRef.current = window.setTimeout(() => {
      canvasTabsSaveTimerRef.current = null;
      saveCanvasTabs(canvasTabsRef.current).catch((error) => {
        logger.warn("Canvas tabs could not be saved", { category: "persistence", error });
      });
    }, 450);
  }, [captureCanvasTabSnapshot]);

  const applyCanvasTabSnapshot = useCallback((tab) => {
    const api = apiRef.current;
    if (!api?.updateScene) return;
    const storedSnapshot = tab?.snapshot || {};
    const storedElements = Array.isArray(storedSnapshot.elements) ? storedSnapshot.elements : [];
    const isPagesTab = tab?.type === "pages" || tab?.type === "page" ||
      (!tab?.type && ((Array.isArray(tab?.chapters) && tab.chapters.length > 0) ||
        (Array.isArray(storedSnapshot.chapters) && storedSnapshot.chapters.length > 0)));
    let snapshot = storedSnapshot;
    if (isPagesTab && getPages(storedElements).length === 0) {
      const seeded = createDefaultPagesSnapshot(api, storedSnapshot.chapters?.[0] || tab?.chapters?.[0]);
      snapshot = {
        ...seeded,
        ...storedSnapshot,
        elements: [...storedElements, ...seeded.elements],
        chapters: seeded.chapters,
        activeChapterId: storedSnapshot.activeChapterId || seeded.activeChapterId,
      };
      const updatedTabs = canvasTabsRef.current.map(item => item.id === tab.id
        ? { ...item, type: "pages", snapshot }
        : item);
      persistCanvasTabs(updatedTabs);
    }
    if (tab?.id) toolStyles.hydrateCanvas(tab.id, snapshot.toolStylePresets);
    if (tab?.id) systemDesignRef?.current?.restoreTabState?.(tab.id, snapshot.systemDesign);
    const elements = restoreElements(Array.isArray(snapshot.elements) ? snapshot.elements : [], null, { repairBindings: true });
    documentMetadataRef.current = {
      metadata: snapshot.metadata || {},
      extensions: snapshot.extensions || {},
      format: snapshot.format || "excalidraw",
    };
    cloudDetachedRef.current = snapshot.cloudDetached !== false;
    setCloudDetached(cloudDetachedRef.current);
    cloudSceneReadyRef.current = Boolean(snapshot.cloudSession?.active);
    cloudSessionRef.current = snapshot.cloudSession || { active: false, diagramId: "", projectId: "", revision: null, name: "" };
    setCloudSaveState(snapshot.cloudSaveState || { state: "inactive", error: "" });
    setCloudDocumentName(snapshot.cloudDocumentName || snapshot.cloudSession?.name || "Cloud diagram");
    const hydrated = hydrateFilesSync(api, elements, snapshot.files || {});
    api.updateScene({
      elements: hydrated.elements,
      appState: { ...api.getAppState(), ...sanitizeTabAppState(snapshot.appState), theme: globalThemeRef.current, selectedElementIds: {}, selectedGroupIds: {}, selectedLinearElement: null },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    api.history?.clear?.();
    if (hydrated.missing.length) hydrateMissingFromCache(api, hydrated.missing).catch(() => {});
    if (snapshot.cloudSession?.active && snapshot.cloudSession.diagramId) {
      // The snapshot's session copy can be older than a save that finished
      // after it was captured; the registry keeps the newest revision.
      cloudRevisionRegistryRef.current.note(snapshot.cloudSession.diagramId, snapshot.cloudSession.revision);
      const known = cloudFingerprintsRef.current.get(snapshot.cloudSession.diagramId);
      if (!known) {
        const fp = sceneFingerprint(elements, snapshot.files || {});
        cloudFingerprintsRef.current.set(snapshot.cloudSession.diagramId, { saved: fp, queued: fp });
      }
    }
    setSavedSketch(snapshot.elements ? { elements, appState: snapshot.appState || {}, files: snapshot.files || {}, metadata: snapshot.metadata || {}, extensions: snapshot.extensions || {}, format: snapshot.format || "excalidraw" } : null);
    setCurrentFile(snapshot.file || null, snapshot.fileSceneSignature || undefined);
    // A tab that already has a saved view keeps its own pan and zoom. Only a
    // tab that has never been viewed (or a Pages tab, which frames its page)
    // is fitted to its content.
    const storedView = sanitizeTabAppState(snapshot.appState);
    const hasStoredView = Number.isFinite(storedView.scrollX) && Number.isFinite(storedView.scrollY) && Boolean(storedView.zoom) && !isPagesTab;
    if (elements.length && !hasStoredView) api.scrollToContent?.(elements, { fitToContent: true, animate: false });
  }, [apiRef, setCurrentFile, setSavedSketch, toolStyles, systemDesignRef, persistCanvasTabs]);

  useEffect(() => {
    if (!apiReady || !apiRef.current) return;
    // A cloud deep-link is already restoring this tab from the server. Do not
    // let the generic tab effect reapply its cached snapshot over that load.
    if (cloudHydrationPendingTabIdRef.current === activeCanvasId) {
      cloudHydrationPendingTabIdRef.current = "";
      return;
    }
    const activeTab = canvasTabsRef.current.find((tab) => tab.id === activeCanvasId);
    if (activeTab && (activeTab.snapshot || activeTab.type === "pages" || activeTab.type === "page")) applyCanvasTabSnapshot(activeTab);
  }, [apiReady, activeCanvasId, applyCanvasTabSnapshot]);

  const setActiveCanvasTabType = useCallback((type) => {
    const tabId = activeCanvasIdRef.current;
    const currentTab = canvasTabsRef.current.find(tab => tab.id === tabId);
    if (!currentTab) return;
    let snapshot = apiRef.current ? captureCanvasTabSnapshot() : (currentTab.snapshot || {});
    if (type === "pages" && getPages(snapshot?.elements || []).length === 0) {
      snapshot = { ...snapshot, ...createDefaultPagesSnapshot(apiRef.current, snapshot?.chapters?.[0]) };
    }
    const nextTabs = canvasTabsRef.current.map(tab => tab.id === tabId
      ? { ...tab, type: type === "pages" ? "pages" : "canvas", mode: type === "pages" ? "pages" : "infinity", snapshot }
      : tab);
    persistCanvasTabs(nextTabs);
    if (type === "pages") applyCanvasTabSnapshot(nextTabs.find(tab => tab.id === tabId));
  }, [apiRef, captureCanvasTabSnapshot, persistCanvasTabs, applyCanvasTabSnapshot]);

  const switchCanvasTab = useCallback((nextId) => {
    if (!nextId || nextId === activeCanvasIdRef.current) return;
    const previousId = activeCanvasIdRef.current;
    const currentSnapshot = apiRef.current
      ? captureCanvasTabSnapshot()
      : (canvasTabsRef.current.find((tab) => tab.id === previousId)?.snapshot || null);
    const currentTabs = canvasTabsRef.current.map((tab) => tab.id === previousId
      ? { ...tab, ...(currentSnapshot ? { snapshot: currentSnapshot } : {}) }
      : tab.id === nextId ? { ...tab, todoTabActive: false } : tab);
    const target = currentTabs.find((tab) => tab.id === nextId);
    if (!target) return;
    // Todo is a separate workspace view. If its hidden canvas has temporarily
    // released the Excalidraw API, switch the tab state now and restore the
    // selected snapshot when the newly keyed canvas mounts.
    if (!apiRef.current) {
      activeCanvasIdRef.current = nextId;
      setActiveCanvasId(nextId);
      setActiveWorkspaceTabId(nextId);
      persistCanvasTabs(currentTabs);
      return;
    }
    if (!cloudSessionRef.current.active || cloudDetachedRef.current) {
      retryLocalSave();
    } else if (hasCloudSceneChange(currentSnapshot?.elements)) {
      // With no element records at all there is nothing to flush; never let an
      // empty-canvas error abort the tab switch before any state is updated.
      const session = cloudSessionRef.current;
      const api = apiRef.current;
      const cloudDocument = createCloudDocument({
        api,
        elements: currentSnapshot.elements,
        appState: currentSnapshot.appState,
        metadata: { metadata: currentSnapshot.metadata, extensions: currentSnapshot.extensions, format: currentSnapshot.format },
        allowEmpty: allowsEmptyCloudSave(currentSnapshot.elements),
      });
      if (cloudSaveTimerRef.current) window.clearTimeout(cloudSaveTimerRef.current);
      cloudSaveTimerRef.current = null;
      cloudSaveQueueRef.current = cloudSaveQueueRef.current.catch(() => {}).then(async () => {
        const latest = await workspaceClient.getDiagram(session.diagramId);
        const latestDiagram = latest?.diagram || latest;
        const revision = latestDiagram?.revision ?? latest?.revision ?? latest?.version ?? session.revision;
        const result = await workspaceClient.saveDiagram(session.diagramId, revision, cloudDocument);
        session.revision = result?.revision ?? (typeof revision === "number" ? revision + 1 : revision);
        cloudRevisionRegistryRef.current.note(session.diagramId, session.revision);
        const savedTabs = canvasTabsRef.current.map((tab) => tab.id === previousId
          ? { ...tab, dirty: false, snapshot: { ...tab.snapshot, cloudSession: { ...session }, cloudSaveState: { state: "saved", error: "" } } }
          : tab);
        canvasTabsRef.current = savedTabs;
        setCanvasTabs(savedTabs);
        saveCanvasTabs(savedTabs).catch(() => {});
      }).catch((error) => {
        const failedTabs = canvasTabsRef.current.map((tab) => tab.id === previousId
          ? { ...tab, dirty: true, snapshot: { ...tab.snapshot, cloudSaveState: { state: "error", error: error.message || "Could not save this cloud canvas." } } }
          : tab);
        canvasTabsRef.current = failedTabs;
        setCanvasTabs(failedTabs);
        saveCanvasTabs(failedTabs).catch(() => {});
        showToast(error.message || "Could not save this cloud canvas.", "error");
      });
    }
    activeCanvasIdRef.current = nextId;
    setActiveCanvasId(nextId);
    setActiveWorkspaceTabId(nextId);
    persistCanvasTabs(currentTabs);
    applyCanvasTabSnapshot(target);
  }, [apiRef, captureCanvasTabSnapshot, persistCanvasTabs, applyCanvasTabSnapshot, retryLocalSave, showToast]);

  const selectWorkspaceTab = useCallback((tabId) => {
    if (String(tabId).startsWith("todo:")) {
      const canvasId = String(tabId).slice(5);
      if (canvasId !== activeCanvasIdRef.current) switchCanvasTab(canvasId);
      const nextTabs = canvasTabsRef.current.map((tab) => tab.id === canvasId ? { ...tab, todoTabOpen: true, todoTabActive: true } : { ...tab, todoTabActive: false });
      persistCanvasTabs(nextTabs);
      setActiveWorkspaceTabId(`todo:${canvasId}`);
      return;
    }
    if (tabId !== activeCanvasIdRef.current) switchCanvasTab(tabId);
    setActiveWorkspaceTabId(tabId);
    persistCanvasTabs(canvasTabsRef.current.map((tab) => tab.id === tabId ? { ...tab, todoTabActive: false } : tab));
  }, [persistCanvasTabs, switchCanvasTab]);

  const createCanvasTab = useCallback(({ name: requestedName, type: requestedType = "canvas" } = {}) => {
    const currentSnapshot = apiRef.current
      ? captureCanvasTabSnapshot()
      : (canvasTabsRef.current.find((tab) => tab.id === activeCanvasIdRef.current)?.snapshot || null);
    const currentTabs = canvasTabsRef.current.map((tab) => tab.id === activeCanvasIdRef.current
      ? { ...tab, ...(currentSnapshot ? { snapshot: currentSnapshot } : {}) }
      : tab);
    const nextNumber = currentTabs.reduce((max, tab) => Math.max(max, Number(tab.name.match(/Canvas (\d+)/)?.[1] || 0)), 0) + 1;
    const id = createCanvasTabId(currentTabs.map((tab) => tab.id));
    const isPagesTab = requestedType === "pages";
    const requestedMode = requestedType === "canvas" ? "infinity" : requestedType;
    const isSystemDesignTab = requestedMode === "system-design";
    const nextTab = {
      id,
      name: requestedName || (isPagesTab ? `Page ${nextNumber}` : isSystemDesignTab ? `System Design ${nextNumber}` : `Canvas ${nextNumber}`),
      type: isPagesTab ? "pages" : requestedType,
      mode: requestedMode,
      ...createTabDates(), todoItems: [], todoTabOpen: false, todoTabActive: false, dirty: false,
      snapshot: isPagesTab ? createDefaultPagesSnapshot(apiRef.current) : {
        elements: [], appState: { viewBackgroundColor: apiRef.current?.getAppState?.().viewBackgroundColor || "#ffffff" },
        files: {}, metadata: {}, extensions: {}, format: "excalidraw",
        systemDesign: { ...DEFAULT_SYSTEM_DESIGN_TAB_STATE, ...(isSystemDesignTab ? { active: true } : {}) },
        file: null, cloudSession: { active: false, diagramId: "", projectId: "", revision: null, name: "" },
        cloudDetached: true, cloudSaveState: { state: "inactive", error: "" }, cloudDocumentName: "Cloud diagram",
      },
    };
    const nextTabs = [...currentTabs, nextTab];
    persistCanvasTabs(nextTabs);
    switchCanvasTab(id);
  }, [apiRef, captureCanvasTabSnapshot, persistCanvasTabs, switchCanvasTab]);

  useEffect(() => {
    const createCanvasFromShortcut = (event) => {
      if (!(event.ctrlKey || event.metaKey) || event.altKey || event.shiftKey || event.key.toLowerCase() !== "n") return;
      const target = event.target;
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable='true'], .monaco-editor, .cm-editor")) return;
      event.preventDefault();
      event.stopPropagation();
      // Holding Ctrl+N fires auto-repeat keydowns; only the first one opens a tab.
      if (event.repeat) return;
      createCanvasTab();
    };
    window.addEventListener("keydown", createCanvasFromShortcut, true);
    return () => window.removeEventListener("keydown", createCanvasFromShortcut, true);
  }, [createCanvasTab]);

  // Closing the final tab returns to the welcome screen. The live scene, cloud
  // binding and active id are all cleared so nothing from the closed canvas
  // stays visible or keeps saving in the background.
  const returnToWelcomeScreen = useCallback(() => {
    if (canvasTabsSaveTimerRef.current) {
      window.clearTimeout(canvasTabsSaveTimerRef.current);
      canvasTabsSaveTimerRef.current = null;
    }
    // Detach first so clearing the scene below cannot queue an empty save.
    cloudDetachedRef.current = true;
    setCloudDetached(true);
    cloudSceneReadyRef.current = false;
    cloudSessionRef.current = { active: false, diagramId: "", projectId: "", revision: null, name: "" };
    setCloudSaveState({ state: "inactive", error: "" });
    documentMetadataRef.current = { metadata: {}, extensions: {}, format: "excalidraw" };
    const liveApi = apiRef.current;
    liveApi?.updateScene?.({
      elements: [],
      appState: { ...liveApi.getAppState?.(), selectedElementIds: {}, selectedGroupIds: {}, selectedLinearElement: null },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    liveApi?.history?.clear?.();
    setSavedSketch(null);
    setCurrentFile(null);
    canvasTabsRef.current = [];
    activeCanvasIdRef.current = "";
    setCanvasTabs([]);
    setActiveCanvasId("");
    setActiveWorkspaceTabId("");
    // The canvas unmounts with no active tab; release the API handle so no
    // effect keeps talking to the discarded editor instance.
    handleExcalidrawAPI(null);
    // Return to the editor's welcome chooser in place. Navigating to
    // /workspace invokes the authentication gate and incorrectly opens
    // the sign-in dialog for users who are already working in the editor.
    startupChoiceMadeRef.current = false;
    setStartupChooserOpen(true);
    setCloseTabPrompt(null);
    saveCanvasTabs([]).catch((error) => {
      logger.warn("The empty canvas workspace could not be saved", { category: "persistence", error });
    });
  }, [handleExcalidrawAPI, setCurrentFile, setSavedSketch]);

  const commitClosedTabs = useCallback((next) => {
    closedTabsRef.current = next;
    setClosedTabs(next);
    saveClosedTabs(next).catch((error) => {
      logger.warn("Recently closed canvases could not be saved", { category: "persistence", error });
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    loadClosedTabs().then((stored) => {
      if (cancelled) return;
      const seen = new Set(closedTabsRef.current.map((item) => item.closedId));
      const merged = normalizeClosedTabs([...closedTabsRef.current, ...stored.filter((item) => item && !seen.has(item.closedId))]);
      closedTabsRef.current = merged;
      setClosedTabs(merged);
    }).catch((error) => {
      logger.warn("Recently closed canvases could not be restored", { category: "persistence", error });
    });
    return () => { cancelled = true; };
  }, []);

  // Serialize the tab (live scene for the active tab) into the closed-tab store
  // before it is removed. Returns null for empty canvases, which need no recovery.
  const archiveClosedTab = useCallback((tabId) => {
    const tab = canvasTabsRef.current.find((item) => item.id === tabId);
    if (!tab) return null;
    const liveSnapshot = tabId === activeCanvasIdRef.current && apiRef.current ? captureCanvasTabSnapshot() : null;
    const record = buildClosedTabRecord(tab, liveSnapshot || tab.snapshot);
    if (!record) return null;
    commitClosedTabs(pushClosedTab(closedTabsRef.current, record));
    return record;
  }, [captureCanvasTabSnapshot, commitClosedTabs]);

  const dismissClosedTabToast = useCallback(() => {
    if (closedTabToastTimerRef.current) window.clearTimeout(closedTabToastTimerRef.current);
    closedTabToastTimerRef.current = null;
    setClosedTabToast(null);
  }, []);

  const showClosedTabToast = useCallback((record) => {
    if (closedTabToastTimerRef.current) window.clearTimeout(closedTabToastTimerRef.current);
    setClosedTabToast({ closedId: record.closedId, name: record.name, id: Date.now() });
    closedTabToastTimerRef.current = window.setTimeout(() => {
      closedTabToastTimerRef.current = null;
      setClosedTabToast(null);
    }, 6000);
  }, []);

  // Reopen a specific closed tab, or the most recently closed one.
  const reopenClosedTab = useCallback((closedId) => {
    const list = closedTabsRef.current;
    const record = closedId ? list.find((item) => item.closedId === closedId) : list[0];
    const currentTabs = canvasTabsRef.current;
    const restored = restoreClosedTab(record, currentTabs.map((tab) => tab.id));
    if (!restored) {
      showToast("No recently closed canvas to reopen", "error");
      return false;
    }
    const activeId = activeCanvasIdRef.current;
    const currentSnapshot = apiRef.current && activeId
      ? captureCanvasTabSnapshot()
      : (currentTabs.find((tab) => tab.id === activeId)?.snapshot || null);
    const syncedTabs = currentTabs.map((tab) => tab.id === activeId && currentSnapshot ? { ...tab, snapshot: currentSnapshot } : tab);
    persistCanvasTabs([...syncedTabs, restored]);
    commitClosedTabs(removeClosedTab(list, record.closedId));
    startupChoiceMadeRef.current = true;
    setStartupChooserOpen(false);
    dismissClosedTabToast();
    switchCanvasTab(restored.id);
    showToast(`Reopened “${restored.name}” as a browser draft`);
    return true;
  }, [captureCanvasTabSnapshot, commitClosedTabs, dismissClosedTabToast, persistCanvasTabs, showToast, switchCanvasTab]);

  const deleteClosedTab = useCallback((closedId) => {
    commitClosedTabs(removeClosedTab(closedTabsRef.current, closedId));
  }, [commitClosedTabs]);

  const clearClosedTabs = useCallback(() => {
    dismissClosedTabToast();
    commitClosedTabs([]);
  }, [commitClosedTabs, dismissClosedTabToast]);

  useEffect(() => {
    const reopenFromShortcut = (event) => {
      if (!(event.ctrlKey || event.metaKey) || !event.shiftKey || event.altKey || event.key.toLowerCase() !== "t") return;
      const target = event.target;
      if (target instanceof Element && target.closest("input, textarea, select, [contenteditable='true'], .monaco-editor, .cm-editor")) return;
      // Some browsers reserve this chord for their own tabs; where the page does
      // receive it, claim it. The tab "+" menu and command palette are the fallback.
      event.preventDefault();
      event.stopPropagation();
      if (event.repeat) return;
      reopenClosedTab();
    };
    window.addEventListener("keydown", reopenFromShortcut, true);
    return () => window.removeEventListener("keydown", reopenFromShortcut, true);
  }, [reopenClosedTab]);

  const performCloseCanvasTab = useCallback((tabId, { keepDraft = true } = {}) => {
    const currentTabs = canvasTabsRef.current;
    const tabIndex = currentTabs.findIndex((tab) => tab.id === tabId);
    if (tabIndex < 0) return;
    const remainingTabs = currentTabs.filter((item) => item.id !== tabId);
    const isActive = tabId === activeCanvasIdRef.current;

    // Archive before anything is cleared or switched so the live scene is intact.
    const archived = keepDraft ? archiveClosedTab(tabId) : null;
    if (archived) showClosedTabToast(archived);

    if (remainingTabs.length === 0) {
      returnToWelcomeScreen();
      return;
    }

    if (isActive) {
      const nextActive = currentTabs[tabIndex - 1] || remainingTabs[0];
      // Switching first captures and persists the live scene before removal.
      switchCanvasTab(nextActive.id);
    }
    // switchCanvasTab updates the manifest (for example it clears the next
    // tab's todoTabActive). Re-derive the remaining tabs from the live manifest
    // instead of persisting the copy taken before the switch.
    persistCanvasTabs(isActive ? canvasTabsRef.current.filter((item) => item.id !== tabId) : remainingTabs);
    // The archived draft already carries the snapshot (with its tool presets).
    toolStyles.forgetCanvas(tabId);
    setCloseTabPrompt(null);
  }, [archiveClosedTab, persistCanvasTabs, returnToWelcomeScreen, showClosedTabToast, switchCanvasTab, toolStyles]);

  const closeCanvasTab = useCallback((tabId) => {
    const currentTabs = canvasTabsRef.current;
    const tab = currentTabs.find((item) => item.id === tabId);
    if (!tab) return;
    // Pinned tabs cannot be closed by accident; unpin first.
    if (tab.pinned) {
      showToast("Unpin this tab before closing it");
      return;
    }
    const isActive = tabId === activeCanvasIdRef.current;
    // Capture the live active scene (or use the persisted background-tab
    // snapshot) so generated Pages frame/paper elements can be distinguished
    // from authored content and editorial metadata.
    const snapshot = isActive && apiRef.current ? captureCanvasTabSnapshot() : tab.snapshot;
    const sceneElements = isActive
      ? (apiRef.current?.getSceneElements?.() || snapshot?.elements || [])
      : (Array.isArray(snapshot?.elements) ? snapshot.elements : []);
    const hasDocumentUnsavedChanges = Boolean(snapshot?.fileDirty || snapshot?.documentDirty || (isActive && (
      canvasSnapshotStateRef.current?.documentDirty ||
      ["pending", "saving", "error", "conflict"].includes(canvasSnapshotStateRef.current?.cloudSaveState?.state)
    )));
    // A persisted dirty bit can be left behind by Excalidraw's initial page
    // scaffold hydration. Re-evaluate the actual scene before treating it as
    // an unsaved edit; authored content/metadata still retains the warning.
    const pristine = isPristineCanvas({
      tab: { ...tab, dirty: false },
      snapshot,
      elements: sceneElements,
      dirty: hasDocumentUnsavedChanges,
    });
    const hasUnsavedChanges = hasDocumentUnsavedChanges || (Boolean(tab.dirty) && !pristine);
    const cloudBacked = Boolean(snapshot?.cloudSession?.active && snapshot?.cloudSession?.diagramId && snapshot?.cloudDetached !== true);
    const fileBacked = !cloudBacked && isTabBackedByFileOrCloud(snapshot);
    // A clean file/cloud-backed canvas can close directly. Unbacked content
    // still needs the recovery choice even if its dirty bit has not propagated.
    const needsCloseConfirmation = !pristine && (!fileBacked && !cloudBacked || hasUnsavedChanges);
    if (needsCloseConfirmation && !skipDraftPromptRef.current) {
      setDontAskDraftChecked(false);
      setCloseTabPrompt({ tabId, name: tab.name, isActive, cloudBacked, fileBacked });
      return;
    }
    performCloseCanvasTab(tabId);
  }, [captureCanvasTabSnapshot, performCloseCanvasTab, showToast]);

  // "Save to file" from the close prompt. Only close once the canvas is really
  // linked to a file; a cancelled picker leaves the tab open. The archive made
  // on close means nothing is lost either way.
  const saveAndCloseTab = useCallback(async (prompt) => {
    setCloseTabPrompt(null);
    if (!prompt.isActive) {
      switchCanvasTab(prompt.tabId);
      showToast(`Save “${prompt.name}” to a file, then close it again`);
      return;
    }
    await fileActionsRef.current.saveCurrentDrawing?.();
    if (currentFileRef.current && activeCanvasIdRef.current === prompt.tabId) performCloseCanvasTab(prompt.tabId);
    else showToast("Canvas not saved to a file, so it was left open", "error");
  }, [currentFileRef, fileActionsRef, performCloseCanvasTab, showToast, switchCanvasTab]);

  useEffect(() => {
    if (!closeTabPrompt) return undefined;
    const dismissOnEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      setCloseTabPrompt(null);
    };
    window.addEventListener("keydown", dismissOnEscape, true);
    return () => window.removeEventListener("keydown", dismissOnEscape, true);
  }, [closeTabPrompt]);

  const reorderCanvasTabs = useCallback((sourceId, targetId) => {
    const current = [...canvasTabsRef.current];
    const from = current.findIndex((tab) => tab.id === sourceId);
    const to = current.findIndex((tab) => tab.id === targetId);
    if (from < 0 || to < 0 || from === to) return;
    const [moved] = current.splice(from, 1);
    current.splice(to, 0, moved);
    // persistCanvasTabs regroups pinned tabs, so a drag can never carry a tab
    // across the pinned / unpinned boundary.
    persistCanvasTabs(current);
  }, [persistCanvasTabs]);

  // Pin or unpin a canvas tab. Returns { status } where status is "pinned",
  // "unpinned", "limit" (already at the cap) or "missing", so the tab bar can
  // react to a refused pin by highlighting the pin badges.
  const togglePinCanvasTab = useCallback((tabId) => {
    const result = togglePinTab(canvasTabsRef.current, tabId);
    if (result.status === "limit") {
      showToast(PIN_LIMIT_MESSAGE);
      return result;
    }
    if (result.status === "pinned" || result.status === "unpinned") persistCanvasTabs(result.tabs);
    return result;
  }, [persistCanvasTabs, showToast]);

  useEffect(() => {
    if (!sketchReady || !apiReady || canvasTabsRestoredRef.current) return;
    let cancelled = false;
    loadCanvasTabs().then(async (stored) => {
      if (cancelled) return;
      // Rehydrate every open cloud canvas, not only the active tab. Local
      // canvases already have their complete persisted snapshots; cloud
      // canvases must refresh from the workspace so tabs are current after
      // a full app reload.
      const refreshedTabs = await Promise.all((Array.isArray(stored) ? stored : []).map(async (tab) => {
        const session = tab.snapshot?.cloudSession;
        if (!session?.active || !session.diagramId) return tab;
        if (["pending", "saving", "conflict"].includes(tab.snapshot.cloudSaveState?.state)) return tab;
        try {
          const result = await workspaceClient.getDiagram(session.diagramId);
          const { diagram, document, name } = normalizeCloudDiagramResponse(result, session.diagramId, { fallbackName: session.name || tab.name });
          cloudRevisionRegistryRef.current.note(session.diagramId, diagram.revision ?? result?.revision ?? result?.version);
          return {
            ...tab,
            name,
            dirty: false,
            snapshot: {
              ...tab.snapshot,
              elements: document.elements,
              appState: document.appState || {},
              files: document.files || {},
              metadata: document.metadata || {},
              extensions: document.extensions || {},
              format: document.format || diagram.format || "excalidraw",
              cloudSession: {
                ...session,
                active: true,
                diagramId: diagram.id || session.diagramId,
                projectId: diagram.projectId || session.projectId,
                revision: diagram.revision ?? result?.revision ?? result?.version ?? session.revision,
                name,
              },
              cloudDetached: false,
              cloudSaveState: { state: "saved", error: "" },
              cloudDocumentName: name,
            },
          };
        } catch (error) {
          logger.warn("A cloud canvas could not be refreshed during startup", {
            category: "persistence", diagramId: session.diagramId, error,
          });
          // Keep the cached copy, but make the failure visible instead of
          // presenting stale content as if it were current.
          return {
            ...tab,
            snapshot: {
              ...tab.snapshot,
              cloudSaveState: { state: "error", error: "Could not refresh this diagram from Cloud Workspace. Showing the last cached copy." },
            },
          };
        }
      }));
      if (cancelled) return;
      if (Array.isArray(stored) && stored.length) {
        const today = getLocalDateString();
        const restoredTabs = orderTabsByPin((refreshedTabs.length ? refreshedTabs : stored).map((tab) => {
          const normalized = { ...tab, ...normalizeTabDates(tab, today) };
          const hasPageChapters = (Array.isArray(normalized.chapters) && normalized.chapters.length > 0) ||
            (Array.isArray(normalized.snapshot?.chapters) && normalized.snapshot.chapters.length > 0) ||
            getPages(normalized.snapshot?.elements || []).length > 0;
          if (normalized.type === "pages" || normalized.type === "page") return { ...normalized, type: "pages" };
          if (normalized.type) return normalized;
          return hasPageChapters ? { ...normalized, type: "pages" } : normalized;
        }));
        const activeId = restoredTabs.find((tab) => tab.active)?.id || restoredTabs[0].id;
        const activeTab = restoredTabs.find((tab) => tab.id === activeId) || restoredTabs[0];
        setActiveWorkspaceTabId(activeTab.todoTabOpen && activeTab.todoTabActive ? `todo:${activeId}` : activeId);
        try { localStorage.setItem("sketchizi.active-workspace-tab-mode", activeTab.type === "pages" ? "pages" : "infinite"); } catch { /* Optional startup hint. */ }
        canvasTabsRef.current = restoredTabs;
        setCanvasTabs(restoredTabs);
        saveCanvasTabs(restoredTabs).catch(() => {});
        activeCanvasIdRef.current = activeId;
        setActiveCanvasId(activeId);
        if (activeTab.snapshot || activeTab.type === "pages") applyCanvasTabSnapshot(activeTab);
      } else {
        const initial = {
          id: "canvas-1", name: "Canvas 1", ...createTabDates(), todoItems: [], todoTabOpen: false, todoTabActive: false, dirty: false,
          snapshot: captureCanvasTabSnapshot(),
        };
        // A direct cloud open needs no empty local placeholder. Preserve a
        // legacy local drawing when there is real content to restore.
        const initialTabs = cloudDiagramId && !initial.snapshot.elements.some((element) => !element.isDeleted)
          ? []
          : [initial];
        canvasTabsRef.current = initialTabs;
        setCanvasTabs(initialTabs);
        if (initialTabs.length) saveCanvasTabs(initialTabs).catch(() => {});
      }
      if (cloudDiagramId) {
        // Reopening a cloud URL should focus the tab already holding that
        // cloud document instead of creating another tab for the same file.
        const existingCloudTab = canvasTabsRef.current.find(
          (tab) => tab.snapshot?.cloudSession?.active
            && tab.snapshot.cloudSession.diagramId === cloudDiagramId,
        );
        if (existingCloudTab) {
          const focusedTabs = canvasTabsRef.current.map((tab) => ({
            ...tab,
            active: tab.id === existingCloudTab.id,
          }));
          canvasTabsRef.current = focusedTabs;
          setCanvasTabs(focusedTabs);
          if (activeCanvasIdRef.current !== existingCloudTab.id) {
            cloudHydrationPendingTabIdRef.current = existingCloudTab.id;
          }
          activeCanvasIdRef.current = existingCloudTab.id;
          cloudRestoringTabIdRef.current = existingCloudTab.id;
          setActiveCanvasId(existingCloudTab.id);
          setActiveWorkspaceTabId(existingCloudTab.id);
          // Reopening a cloud URL must always hydrate from the server. The
          // startup refresh above is best-effort; if it failed, trusting this
          // cached tab would leave its placeholder name and stale/empty scene
          // in place forever. Restore the cached snapshot for continuity, then
          // detach its session so the cloud-load effect fetches the requested
          // diagram and replaces it with the authoritative document.
          applyCanvasTabSnapshot(existingCloudTab);
          cloudLoadStartedRef.current = false;
          cloudSceneReadyRef.current = false;
          cloudSessionRef.current = { active: false, diagramId: "", projectId: "", revision: null, name: "" };
          cloudDetachedRef.current = true;
          setCloudDetached(true);
          setCloudSaveState({ state: "loading", error: "" });
          saveCanvasTabs(focusedTabs).catch(() => {});
        } else {
          const api = apiRef.current;
          const nextCloudTab = {
          id: `cloud-${cloudDiagramId}-${Date.now()}`,
          name: "Cloud diagram",
          ...createTabDates(),
          dirty: false,
          snapshot: {
            elements: [],
            appState: { viewBackgroundColor: api?.getAppState?.().viewBackgroundColor },
            files: {}, metadata: {}, extensions: {}, format: "excalidraw",
            systemDesign: { ...DEFAULT_SYSTEM_DESIGN_TAB_STATE },
            file: null,
            cloudSession: { active: false, diagramId: "", projectId: "", revision: null, name: "" },
            cloudDetached: true,
            cloudSaveState: { state: "inactive", error: "" },
            cloudDocumentName: "Cloud diagram",
          },
        };
        const nextTabs = [...canvasTabsRef.current, nextCloudTab].map((tab) => ({ ...tab, active: tab.id === nextCloudTab.id }));
        canvasTabsRef.current = nextTabs;
        setCanvasTabs(nextTabs);
        activeCanvasIdRef.current = nextCloudTab.id;
        cloudRestoringTabIdRef.current = nextCloudTab.id;
        cloudHydrationPendingTabIdRef.current = nextCloudTab.id;
        setActiveCanvasId(nextCloudTab.id);
        setActiveWorkspaceTabId(nextCloudTab.id);

        // A cloud URL always gets its own clean canvas. The previously active
        // tab has already been restored above, so do not let its live scene
        // temporarily become the cloud tab's contents while the network load
        // is in flight.
        cloudSceneReadyRef.current = false;
        cloudDetachedRef.current = true;
        cloudSessionRef.current = { active: false, diagramId: "", projectId: "", revision: null, name: "" };
        setCloudDetached(true);
        setCloudSaveState({ state: "loading", error: "" });
        documentMetadataRef.current = { metadata: {}, extensions: {}, format: "excalidraw" };
        setSavedSketch(null);
        setCurrentFileRef.current?.(null);
        api?.updateScene?.({
          elements: [],
          appState: {
            ...api.getAppState?.(),
            selectedElementIds: {},
            selectedGroupIds: {},
            selectedLinearElement: null,
          },
          captureUpdate: CaptureUpdateAction.NEVER,
        });
        api?.history?.clear?.();
        saveCanvasTabs(nextTabs).catch(() => {});
        }
      }
      canvasTabsRestoredRef.current = true;
      setCanvasTabsReady(true);
    }).catch(() => {
      const initial = { id: "canvas-1", name: "Canvas 1", ...createTabDates(), dirty: false, snapshot: captureCanvasTabSnapshot() };
      const nextTabs = cloudDiagramId ? [initial, {
        id: `cloud-${cloudDiagramId}-${Date.now()}`, name: "Cloud diagram", ...createTabDates(), dirty: false,
        snapshot: { elements: [], appState: {}, files: {}, metadata: {}, extensions: {}, format: "excalidraw", systemDesign: { ...DEFAULT_SYSTEM_DESIGN_TAB_STATE }, file: null,
          cloudSession: { active: false, diagramId: "", projectId: "", revision: null, name: "" }, cloudDetached: true,
          cloudSaveState: { state: "inactive", error: "" }, cloudDocumentName: "Cloud diagram" },
      }] : [initial];
      canvasTabsRef.current = nextTabs;
      setCanvasTabs(nextTabs);
      if (cloudDiagramId) {
        activeCanvasIdRef.current = nextTabs[1].id;
        cloudRestoringTabIdRef.current = nextTabs[1].id;
        setActiveCanvasId(nextTabs[1].id);
        setActiveWorkspaceTabId(nextTabs[1].id);
        cloudSceneReadyRef.current = false;
        cloudDetachedRef.current = true;
        cloudSessionRef.current = { active: false, diagramId: "", projectId: "", revision: null, name: "" };
        setCloudDetached(true);
        setCloudSaveState({ state: "loading", error: "" });
        documentMetadataRef.current = { metadata: {}, extensions: {}, format: "excalidraw" };
        setSavedSketch(null);
        setCurrentFileRef.current?.(null);
        apiRef.current?.updateScene?.({
          elements: [],
          appState: {
            ...apiRef.current?.getAppState?.(),
            selectedElementIds: {},
            selectedGroupIds: {},
            selectedLinearElement: null,
          },
          captureUpdate: CaptureUpdateAction.NEVER,
        });
        apiRef.current?.history?.clear?.();
      }
      canvasTabsRestoredRef.current = true;
      setCanvasTabsReady(true);
    });
    return () => { cancelled = true; };
  }, [sketchReady, apiReady, cloudDiagramId, applyCanvasTabSnapshot, captureCanvasTabSnapshot, setSavedSketch]);

  const captureOpenCanvasTabs = useCallback(() => {
    const activeId = activeCanvasIdRef.current;
    if (!apiRef.current || cloudRestoringTabIdRef.current === activeId) {
      return canvasTabsRef.current;
    }
    const snapshot = captureCanvasTabSnapshot();
    return canvasTabsRef.current.map((tab) => tab.id === activeId
      ? { ...tab, snapshot }
      : tab);
  }, [captureCanvasTabSnapshot]);

  const openCloudWorkspace = useCallback(async () => {
    if (canvasTabsRestoredRef.current) {
      const latest = captureOpenCanvasTabs();
      canvasTabsRef.current = latest;
      try {
        await saveCanvasTabs(latest);
      } catch (error) {
        showToast(error.message || "Unable to preserve open canvases. Try opening Cloud Files again.", "error");
        return;
      }
    }
    window.location.assign("/workspace");
  }, [captureOpenCanvasTabs, showToast]);

  // Header Workspace quick switcher. Before leaving for another chapter: flush a
  // pending cloud save, confirm if it cannot be saved, and persist every open
  // canvas tab so the editor restores them (and focuses / adds the chapter's tab).
  const prepareEditorExit = useCallback(async () => {
    if (cloudSessionRef.current.active) {
      if (["pending", "saving"].includes(cloudSaveStateRef.current.state)) {
        saveCloudDiagramNow();
        await new Promise((resolve) => setTimeout(resolve, 60));
        await cloudSaveQueueRef.current.catch(() => {});
        await new Promise((resolve) => setTimeout(resolve, 60));
      }
      if (["error", "conflict", "pending", "saving"].includes(cloudSaveStateRef.current.state)
        && !window.confirm("This chapter has changes that are not saved to Cloud Workspace. Switch chapters anyway?")) return false;
    }
    if (canvasTabsRestoredRef.current) {
      const latest = captureOpenCanvasTabs();
      canvasTabsRef.current = latest;
      try {
        await saveCanvasTabs(latest);
      } catch (error) {
        showToast(error.message || "Unable to preserve open canvases. Try again.", "error");
        return false;
      }
    }
    return true;
  }, [captureOpenCanvasTabs, saveCloudDiagramNow, showToast]);

  const openWorkspaceDiagram = useCallback(async (project, diagram) => {
    if (!project?.id || !diagram?.id) return;
    if (!(await prepareEditorExit())) return;
    const usedAt = new Date().toISOString();
    recordWorkspaceItemOpened(diagram.id, usedAt);
    await Promise.race([
      workspaceClient.updateDiagram(diagram.id, { lastOpenedAt: usedAt }).catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 1200)),
    ]);
    window.location.assign(buildChapterEditorUrl(project.id, diagram.id));
  }, [prepareEditorExit]);

  // Appends a blank chapter to the END of the project's sequence, then opens it.
  // Throws a readable Error so the popover can show it inline.
  const createWorkspaceChapter = useCallback(async (project, name) => {
    const chapterName = String(name || "").trim();
    if (!project?.id || !chapterName) return;
    if (!(await prepareEditorExit())) throw new Error("Chapter was not created.");
    const currentDiagrams = readDiagramRows(await workspaceClient.listDiagrams(project.id));
    if (findDuplicateDiagramName(currentDiagrams, chapterName)) {
      throw new Error("A diagram with this name already exists in this project.");
    }
    const limits = await workspaceClient.getLimits();
    if (!limits?.admin && Number(limits?.diagramCount || 0) >= Number(limits?.diagramLimit || 3)) {
      throw new Error("Your Cloud Workspace diagram limit has been reached. Delete a diagram before creating another.");
    }
    const createdResult = await workspaceClient.createDiagram({
      projectId: project.id, name: chapterName, format: "excalidraw",
      document: { elements: [], appState: {}, files: {}, metadata: {}, extensions: {} },
    });
    const created = createdResult?.diagram || createdResult;
    if (!created?.id) throw new Error("Cloud Workspace did not return the new chapter.");
    const chapters = resolveChapterSequence(currentDiagrams, readChapterLayout(project.id));
    const next = appendChapter(chapters, { ...created, name: created.name || chapterName, chapterStatus: "up-next" });
    writeChapterLayout(project.id, buildChapterLayout(next));
    recordWorkspaceItemOpened(created.id);
    await Promise.race([
      workspaceClient.updateDiagramChapter(created.id, next[next.length - 1]).catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
    window.location.assign(buildChapterEditorUrl(project.id, created.id));
  }, [prepareEditorExit]);

  useEffect(() => {
    const flushCanvasTabs = () => {
      if (!canvasTabsRestoredRef.current) return;
      const pending = canvasTabsSaveTimerRef.current !== null;
      const latest = captureOpenCanvasTabs();
      canvasTabsRef.current = latest;
      if (pending || cloudSessionRef.current.active) saveCanvasTabsPagehideBackup(latest);
      saveCanvasTabs(latest).catch(() => {});
    };
    window.addEventListener("pagehide", flushCanvasTabs);
    return () => {
      window.removeEventListener("pagehide", flushCanvasTabs);
      if (canvasTabsSaveTimerRef.current) window.clearTimeout(canvasTabsSaveTimerRef.current);
    };
  }, [captureOpenCanvasTabs]);

  useEffect(() => {
    if (!canvasTabsRestoredRef.current) return;
    const dirty = Boolean(documentDirty) || (
      cloudSessionRef.current.active
        ? ["pending", "saving", "error", "conflict"].includes(cloudSaveState.state)
        : ["pending", "saving", "error"].includes(saveStatus.state)
    );
    const current = canvasTabsRef.current;
    let changed = false;
    const next = current.map((tab) => {
      if (tab.id !== activeCanvasIdRef.current || tab.dirty === dirty) return tab;
      changed = true;
      return { ...tab, dirty };
    });
    if (changed) persistCanvasTabs(next);
  }, [documentDirty, cloudSaveState.state, saveStatus.state, persistCanvasTabs]);

  useEffect(() => {
    if (!canvasTabsRestoredRef.current || !apiReady || !currentFile) return;
    persistActiveCanvasSnapshot();
  }, [apiReady, currentFile, persistActiveCanvasSnapshot]);

  useEffect(() => {
    if (!apiReady || !currentFile) return;
    markCurrentDocumentChanged(apiRef.current?.getSceneElementsIncludingDeleted?.() || apiRef.current?.getSceneElements?.() || []);
  }, [apiReady, currentFile, markCurrentDocumentChanged]);

  return {
    persistCanvasTabs,
    updateActiveCanvasStartDate,
    updateCanvasActivity,
    openTodoTab,
    closeTodoTab,
    updateCanvasTodoItems,
    persistActiveCanvasSnapshot,
    switchCanvasTab,
    selectWorkspaceTab,
    setActiveCanvasTabType,
    createCanvasTab,
    reopenClosedTab,
    deleteClosedTab,
    clearClosedTabs,
    performCloseCanvasTab,
    closeCanvasTab,
    saveAndCloseTab,
    reorderCanvasTabs,
    togglePinCanvasTab,
    openCloudWorkspace,
    openWorkspaceDiagram,
    createWorkspaceChapter,
  };
}
