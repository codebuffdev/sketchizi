import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import IconLibraryPanel from "./IconLibraryPanel";
import PropertiesPanel from "./PropertiesPanel";
import { CaptureUpdateAction, restoreElements } from "@excalidraw/excalidraw";
import { usePanelState } from "./features/navigation/usePanelState";
import { useNativeSketchiziMenu } from "./features/navigation/useNativeSketchiziMenu";
import { useMoreTools } from "./features/navigation/useMoreTools";
import { useSketchiziPreferences, readSkipLocalDraftPrompt } from "./features/navigation/useSketchiziPreferences";
import { buildClosedTabRecord, countLiveElements, describeClosedAt, normalizeClosedTabs, pushClosedTab, removeClosedTab, restoreClosedTab, isTabBackedByFileOrCloud } from "./features/workspace/closedTabs.js";
import { getInitialThemeMode } from "./features/navigation/themePreference.js";
import { applyCanvasAppearance, getCanvasAppearanceFromBackground, getCanvasAppearanceRoughness } from "./features/navigation/canvasAppearance.js";
import { useSketchiziEscape, useSketchiziCanvasDismissal } from "./features/navigation/useSketchiziEscape";
import { useDrawerPresence } from "./features/navigation/useDrawerPresence";
import { useSketchPersistence } from "./features/persistence/useSketchPersistence";
import { useCollaboration } from "./features/collaboration/useCollaboration";
import { useFileManager } from "./features/files/useFileManager";
import { useIconCatalog } from "./features/icon-library/useIconCatalog";
import { umlIcons } from "./umlLibrary";
import { mindMapIcons } from "./mindMapLibrary";
import { awsIcons, awsCategories, awsCategoryCounts, awsCategoryRepresentatives, AWS_CATALOG_LOGO, AWS_CATALOG_LOGO_DARK } from "./awsArchitectureLibrary";
import { kubernetesIcons, kubernetesCategories, kubernetesCategoryCounts, kubernetesCategoryRepresentatives } from "./kubernetesArchitectureLibrary";
import { useCanvasTools } from "./features/canvas/useCanvasTools";
import { useToolStylePresets } from "./features/canvas/useToolStylePresets";
import { useMinimapController } from "./features/canvas/useMinimapController";
import { useExcalidrawScene } from "./features/canvas/useExcalidrawScene";
import SketchiziCanvas from "./components/app/SketchiziCanvas";
import TodoList from "./components/app/TodoList.jsx";
import "./styles/canvas-tab-close-dialog.css";
import CollaborationUI from "./components/app/CollaborationUI";
import MoreTools from "./components/app/MoreTools";
import { useIconInsertion } from "./features/icon-library/useIconInsertion";
import { useCommandPalette } from "./features/navigation/useCommandPalette";
import { useSketchiziExportLifecycle } from "./features/navigation/useSketchiziExportLifecycle";
import { createSketchiziCommandRegistry } from "./features/commands/commandRegistry";
import { insertArchitecturePack as insertArchitecturePackIntoScene } from "./features/templates/architecturePackInsertion";
const CreateDesignScreen = lazy(() => import("./features/design/ui/CreateDesignScreen.jsx"));
import { createProfileForTemplate, createTemplateElements } from "./features/design/templates/templateRegistry.js";
import { withDesignProfile } from "./features/design/model/designDocument.js";
import { getAwsResourceDefinitionById } from "./awsResourceDefinitions";
import { getKubernetesResourceDefinitionById } from "./kubernetesResourceDefinitions";
import { getNetworkingResourceDefinitionById } from "./networkingResourceDefinitions.js";
import { workspaceClient } from "./features/workspace/workspaceClient.js";
import { sceneFingerprint, createRevisionRegistry, isRevisionConflict, classifyConflict } from "./features/workspace/cloudSaveGuard.js";
import { hydrateFilesSync, hydrateMissingFromCache } from "./features/workspace/binaryFileCache.js";
import { normalizeCloudDiagramResponse } from "./features/workspace/cloudDiagramPayload.js";
import { createCanvasTabId, sanitizeTabAppState } from "./features/workspace/tabSnapshot.js";
import { hasMountableCanvas } from "./features/workspace/tabClose.js";
import { findDuplicateTabName, getTabDisplayName } from "./features/workspace/tabLabel.js";
const CloudSaveDialog = lazy(() => import("./features/workspace/CloudSaveDialog.jsx"));
import { createCloudDocument, sanitizeCloudAppState } from "./features/workspace/cloudDocument.js";
import { allowsEmptyCloudSave, hasCloudSceneChange, isActiveCloudSession, isCloudSceneRestoring, resolveCloudLoadTarget } from "./features/workspace/cloudSavePolicy.js";
import { getSelectedAwsResource, updateAwsResource } from "./features/aws-resources/awsResourceService";
import { getSelectedKubernetesResource, updateKubernetesResource } from "./features/kubernetes-resources/kubernetesResourceService";
import { getSelectedNetworkingResource, updateNetworkingResource } from "./features/networking/networkingResourceService.js";
import { AWS_RELATIONSHIP_TYPES, getAwsRelationship, updateRelationshipType } from "./features/aws-relationships/awsRelationshipService";
import { KUBERNETES_RELATIONSHIP_TYPES, getKubernetesRelationship, getKubernetesRelationshipGuidance, updateKubernetesRelationshipMetadata } from "./features/kubernetes-relationships/kubernetesRelationshipService";
import CommandPalette from "./components/app/CommandPalette";
import DesktopAppHeader from "./components/app/DesktopAppHeader";
const ExportStudioModal = lazy(() => import("./components/app/ExportStudioModal"));
const ArchitectureTemplatesModal = lazy(() => import("./components/app/ArchitectureTemplatesModal"));
import AiAskPanel from "./features/ai/AiAskPanel.jsx";
import { getTabCloudMeta } from "./features/workspace/tabCloudState.js";
import { buildChapterEditorUrl, useChapterNavigation } from "./features/workspace/useChapterNavigation.js";
import { recordWorkspaceItemOpened } from "./features/workspace/workspacePresentation.js";
import { findDuplicateDiagramName, readDiagramRows } from "./features/workspace/diagramNames.js";
import { appendChapter, buildChapterLayout, readChapterLayout, resolveChapterSequence, writeChapterLayout } from "./features/workspace/chapterSequence.js";
import ZenHud from "./components/app/ZenHud.jsx";
import { applyCanvasSpellcheck } from "./features/canvas/nativeSpellcheck.js";
import { startPeriodicBackendWarmup, wakeBackendOnPageLoad } from "./features/backend/backendWarmup.js";
import "./styles/ai-ask.css";
import "./features/design/design.css";
import "./features/workspace/workspace.css";
import "./styles/startup-canvas-chooser.css";
import { loadCanvasTabs, saveCanvasTabs, saveCanvasTabsPagehideBackup, loadClosedTabs, saveClosedTabs } from "./persistence.js";
import { createTabDates, getLocalDateString, isValidCanvasStartDate, normalizeTabDates } from "./features/canvas/canvasStartDate.js";
import "./styles/canvas-tabs.css";
import "./styles/canvas-tabs-dock.css";
import "./styles/contextual-dock-polish.css";
import "./styles/todo-canvas-polish.css";
import "./styles/canvas-top-controls.css";
import "./styles/hud-capsules.css";
import "./styles/edge-drawer-motion.css";
import "./styles/smart-studio.css";

function App() {
  const iconCatalog = useIconCatalog();
  const { activeCategory, setActiveCategory, activeAwsCategory, setActiveAwsCategory, activeKubernetesCategory, setActiveKubernetesCategory, search, setSearch, eraserCatalog, eraserSyncing, eraserSyncProgress, eraserSyncError, eraserCachedCount, remoteLoading, remoteError, favorites, recentIcons, searchRef, iconListRef, iconDisplayLimit, setIconDisplayLimit, visibleIcons, networkingIcons, syncEraserLibrary, isFavorite, toggleFavorite, markRecentlyUsed } = iconCatalog;
  const [connectionMode, setConnectionMode] = useState(false);
  const [isZenMode, setIsZenMode] = useState(false);
  const isZenModeRef = useRef(false);
  const exitZenMode = useCallback(() => setIsZenMode(false), []);
  const [canvasPageContext, setCanvasPageContext] = useState({ mode: "infinite", page: null, pageCount: 0 });
  const [startupChooserOpen, setStartupChooserOpen] = useState(false);
  const startupChoiceMadeRef = useRef(false);
  const [designStudioOpen, setDesignStudioOpen] = useState(false);
  const [selectedConnector, setSelectedConnector] = useState(null);
  const [gridEnabled, setGridEnabled] = useState(() => {
    try {
      const stored = window.localStorage.getItem("sketchizi-grid-enabled");
      return stored === null ? true : stored === "true";
    } catch { return true; }
  });
  const [gridStyle, setGridStyle] = useState(() => {
    try {
      const stored = window.localStorage.getItem("sketchizi-grid-style");
      return ["normal", "focus", "local", "dots", "ruled"].includes(stored) ? stored : "normal";
    } catch { return "normal"; }
  });
  useEffect(() => {
    try { window.localStorage.setItem("sketchizi-grid-style", gridStyle); } catch { /* Private browsing. */ }
  }, [gridStyle]);
  useEffect(() => {
    try { window.localStorage.setItem("sketchizi-grid-enabled", String(gridEnabled)); } catch { /* Private browsing. */ }
  }, [gridEnabled]);
  const [canvasAppearance, setCanvasAppearance] = useState(() => getInitialThemeMode() === "dark" ? "sketch" : "clean");
  const [gridSize, setGridSize] = useState(20);
  const [selectedCount, setSelectedCount] = useState(0);
  const [selectedElements, setSelectedElements] = useState([]);
  const lastSelectionSignature = useRef("");
  const clearCanvasSelection = useCallback(() => {
    // Keep the scene callback's de-duplication key in sync with the explicit
    // clear, otherwise a stale signature can leave React's dock selection stuck.
    lastSelectionSignature.current = "";
    setSelectedElements([]);
    setSelectedCount(0);
    apiRef.current?.updateScene?.({
      appState: {
        selectedElementIds: {},
        selectedGroupIds: {},
        selectedLinearElement: null,
        activeTool: { type: "selection" },
      },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }, []);
  const apiRef = useRef(null);
  const globalThemeRef = useRef(getInitialThemeMode() === "dark" ? "dark" : "light");
  const setCurrentFileRef = useRef(null);
  const [apiReady, setApiReady] = useState(false);
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
  // toolPresetsByCanvasId: the last style chosen for each drawing tool, kept per
  // canvas tab (and saved in the tab snapshot), restored when that tool is re-picked.
  const toolStyles = useToolStylePresets({ apiRef, activeCanvasIdRef });
  const handleExcalidrawAPI = useCallback((api) => { apiRef.current = api || null; setApiReady(Boolean(api)); }, []);

  const [minimapOpen, setMinimapOpen] = useState(false);
  const [exportStudioOpen, setExportStudioOpen] = useState(false);
  const [templatesModalOpen, setTemplatesModalOpen] = useState(false);
  const minimapDragRef = useRef(null);
  const minimapController = useMinimapController({ apiRef, minimapOpen });
  const { minimapScene, updateMinimap, centerOnMinimap } = minimapController;
  const nativeMenuOpenRef = useRef(false);
  const [nativeMenuOpen, setNativeMenuOpen] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimerRef = useRef(null);
  const showToast = useCallback((text, kind = "success") => {
    if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    setToast({ text, kind, id: Date.now() });
    toastTimerRef.current = window.setTimeout(() => setToast(null), kind === "error" ? 5000 : 2800);
  }, []);

  const closeNativeMenu = useCallback(() => {
    const api = apiRef.current;
    // Keep React state, the ref, and Excalidraw's own menu state synchronized.
    // The native menu can be open even if its outside-click handler already
    // changed the ref before a different catalog is activated.
    nativeMenuOpenRef.current = false;
    setNativeMenuOpen(false);
    if (api?.updateScene) {
      api.updateScene({ appState: { openMenu: null }, captureUpdate: CaptureUpdateAction.NEVER });
    }
  }, []);

  // Toggle Excalidraw's menu state directly instead of synthesizing a click on
  // its native trigger. The native outside-click handler may close the menu
  // before this header button's click fires; the header passes the state
  // captured at pointer-down so that a single click still closes it.
  const toggleNativeMenu = useCallback((wasOpen = nativeMenuOpenRef.current) => {
    const api = apiRef.current;
    if (!api?.updateScene) return;
    const shouldOpen = !Boolean(wasOpen);
    nativeMenuOpenRef.current = shouldOpen;
    setNativeMenuOpen(shouldOpen);
    api.updateScene({
      appState: { openMenu: shouldOpen ? "canvas" : null },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }, []);

  const panelState = usePanelState({ apiRef, nativeMenuOpen, closeNativeMenu });
  const commandPalette = useCommandPalette({ closeNativeMenu });
  const { commandPaletteOpen, closeCommandPalette } = commandPalette;

  const {
    activeLeftPanel, activeRightPanel, activeTransientPanel, legacyPanelClasses,
    isRightRailPinned, isIconLibraryPinned, setIconLibraryPinned,
    openPanel, togglePanel, closePanel, closeLeftPanel,
    closeMostRecentDrawer, dismissUnpinnedDrawersFromCanvas,
    aiAskOpen, setAiAskOpen, toggleAiAsk,
    libraryOpen, propertiesOpen, moreToolsOpen, shortcutHelpOpen,
  } = panelState;
  const rightRailOpen = propertiesOpen;
  const libraryPresence = useDrawerPresence(libraryOpen);
  const rightRailPresence = useDrawerPresence(rightRailOpen);
  // Remember which right-rail panel was showing so it can finish its exit animation.
  const lastRightRailPanelRef = useRef("properties");
  if (rightRailOpen) lastRightRailPanelRef.current = "properties";
  const renderedRightRailPanel = lastRightRailPanelRef.current;

  // The hamburger menu and the icon library share the left edge; usePanelState
  // swaps them there. Nothing on the right edge is touched.

  useEffect(() => {
    wakeBackendOnPageLoad();
    return startPeriodicBackendWarmup();
  }, []);

  useEffect(() => {
    const currentUrl = new URL(window.location.href);
    if (currentUrl.searchParams.get("aiAsk") !== "1") return;
    setAiAskOpen(true);
    currentUrl.searchParams.delete("aiAsk");
    window.history.replaceState(window.history.state, "", currentUrl.pathname + currentUrl.search + currentUrl.hash);
  }, []);

  const documentMetadataRef = useRef({ metadata: {}, extensions: {}, format: "excalidraw" });
  const persistence = useSketchPersistence({ apiRef, documentMetadataRef, commitCanvasTabs });
  const { savedSketch, setSavedSketch, sketchReady, storageError, setStorageError, saveStatus, saveTimerRef, queueSketchSave: queueLocalSketchSave, persistSketchNow, retryLocalSave, resetLocalSketch, downloadRecoveryBackup } = persistence;
  const cloudUrlParams = new URLSearchParams(window.location.search);
  const cloudDiagramId = cloudUrlParams.get("cloudDiagramId") || "";
  const cloudProjectId = cloudUrlParams.get("cloudProjectId") || "";
  const cloudSessionRef = useRef({ active: false, diagramId: "", projectId: "", revision: null, name: "" });
  const cloudSaveTimerRef = useRef(null);
  const cloudSaveQueueRef = useRef(Promise.resolve());
  const cloudFlushImmediatelyRef = useRef(false);
  const cloudLoadStartedRef = useRef(false);
  const cloudHydrationPendingTabIdRef = useRef("");
  // Id of the canvas tab whose cloud document is still being restored. onChange is ignored only for that tab.
  const cloudRestoringTabIdRef = useRef("");
  const cloudDetachedRef = useRef(false);
  const [cloudDetached, setCloudDetached] = useState(false);
  const cloudSceneReadyRef = useRef(false);
  const [cloudSaveState, setCloudSaveState] = useState({ state: cloudDiagramId ? "loading" : "inactive", error: "" });
  const cloudManualSaveRequestedRef = useRef(false);
  const [cloudDocumentName, setCloudDocumentName] = useState("Cloud diagram");
  const cloudRevisionRegistryRef = useRef(null);
  if (!cloudRevisionRegistryRef.current) cloudRevisionRegistryRef.current = createRevisionRegistry();
  // diagramId -> { saved, queued }: structural fingerprints of the last saved / in-flight scene.
  const cloudFingerprintsRef = useRef(new Map());
  const [cloudConflictDismissed, setCloudConflictDismissed] = useState(false);
  const cloudSaveStateRef = useRef(cloudSaveState);
  cloudSaveStateRef.current = cloudSaveState;
  // Sibling chapters of the open cloud diagram (null unless the project has 2+ chapters).
  const chapterNav = useChapterNavigation({
    enabled: Boolean(cloudSessionRef.current.active && !cloudDetached),
    projectId: cloudSessionRef.current.projectId || cloudProjectId,
    diagramId: cloudSessionRef.current.diagramId || cloudDiagramId,
  });
  const [cloudSaveDialogOpen, setCloudSaveDialogOpen] = useState(false);

  useEffect(() => {
    if (!nativeMenuOpen) return;
    // Keep the native hamburger menu mutually exclusive with modal and
    // floating tool surfaces that are opened outside usePanelState.
    if (
      minimapOpen ||
      exportStudioOpen ||
      templatesModalOpen ||
      designStudioOpen ||
      cloudSaveDialogOpen ||
      commandPaletteOpen
    ) {
      closeNativeMenu();
    }
  }, [
    nativeMenuOpen,
    minimapOpen,
    exportStudioOpen,
    templatesModalOpen,
    designStudioOpen,
    cloudSaveDialogOpen,
    commandPaletteOpen,
    closeNativeMenu,
  ]);

  useEffect(() => {
    const detachCloudDocument = () => {
      cloudDetachedRef.current = true;
      cloudManualSaveRequestedRef.current = false;
      setCloudDetached(true);
      cloudSceneReadyRef.current = false;
      if (cloudSaveTimerRef.current) {
        window.clearTimeout(cloudSaveTimerRef.current);
        cloudSaveTimerRef.current = null;
      }
      cloudSessionRef.current = { active: false, diagramId: "", projectId: "", revision: null, name: "" };
      cloudFlushImmediatelyRef.current = false;
      setCloudSaveState({ state: "inactive", error: "" });
    };
    window.addEventListener("sketchizi:detach-cloud-document", detachCloudDocument);
    return () => window.removeEventListener("sketchizi:detach-cloud-document", detachCloudDocument);
  }, []);

  const saveDrawingToCloud = useCallback(async ({ projectId, name }) => {
    const api = apiRef.current;
    if (!api?.getSceneElements) throw new Error("The editor is not ready to save this drawing.");
    const limits = await workspaceClient.getLimits();
    if (!limits?.admin && Number(limits?.diagramCount || 0) >= Number(limits?.diagramLimit || 3)) {
      throw new Error("Your Cloud Workspace diagram limit has been reached. Delete a cloud diagram before saving another.");
    }
    const document = createCloudDocument({
      api,
      metadata: documentMetadataRef.current,
    });
    if (!limits?.admin) {
      const serializedDocument = JSON.stringify(document);
      const documentBytes = new TextEncoder().encode(serializedDocument).byteLength;
      const maxDocumentBytes = 2 * 1024 * 1024;
      if (documentBytes > maxDocumentBytes) {
        throw new Error(`This drawing is ${(documentBytes / (1024 * 1024)).toFixed(2)} MiB, above the 2 MiB Cloud Workspace limit for standard accounts. Administrator accounts are exempt from this application-level limit.`);
      }
    }
    const result = await workspaceClient.createDiagram({
      projectId,
      name: name.trim(),
      format: document.format,
      document,
    });
    const diagram = result?.diagram || result;
    if (!diagram?.id) throw new Error("Cloud Workspace did not return the saved diagram ID.");
    setCloudSaveDialogOpen(false);
    showToast("Saved to Cloud Workspace", "success");
    cloudSessionRef.current = { active: true, diagramId: diagram.id, projectId, revision: diagram.revision ?? result?.revision ?? 0, name: diagram.name || name.trim() };
    cloudSceneReadyRef.current = true;
    cloudDetachedRef.current = false;
    setCloudDetached(false);
    setCloudDocumentName(cloudSessionRef.current.name);
    setCloudSaveState({ state: "saved", error: "" });
    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.set("editor", "1");
    nextUrl.searchParams.set("cloudDiagramId", diagram.id);
    nextUrl.searchParams.set("cloudProjectId", projectId);
    window.history.replaceState(window.history.state, "", nextUrl.pathname + nextUrl.search + nextUrl.hash);
    const activeApi = apiRef.current;
    const activeSnapshot = {
      elements: activeApi?.getSceneElementsIncludingDeleted?.() || activeApi?.getSceneElements?.() || [],
      appState: activeApi?.getAppState?.() || {}, files: activeApi?.getFiles?.() || {},
      metadata: documentMetadataRef.current?.metadata || {}, extensions: documentMetadataRef.current?.extensions || {},
      format: documentMetadataRef.current?.format || "excalidraw", file: currentFileRef.current || null,
      fileSceneSignature: getCurrentFileSceneSignature?.() || null,
      cloudSession: { ...cloudSessionRef.current }, cloudDetached: false,
      cloudSaveState: { state: "saved", error: "" }, cloudDocumentName: diagram.name || name.trim(),
    };
    const updatedTabs = canvasTabsRef.current.map((tab) => tab.id === activeCanvasIdRef.current ? { ...tab, snapshot: activeSnapshot, dirty: false } : tab);
    canvasTabsRef.current = updatedTabs;
    setCanvasTabs(updatedTabs);
    saveCanvasTabs(updatedTabs).catch(() => {});
  }, [showToast]);

  const queueSketchSave = useCallback((elements, appState) => {
    if (!cloudSessionRef.current.active || cloudDetachedRef.current) {
      queueLocalSketchSave(elements, appState);
      return;
    }
    // A cloud session must never overwrite the browser-local sketch while its
    // document is loading or after a failed load.
    if (!cloudSceneReadyRef.current || !cloudSessionRef.current.active || !apiRef.current) return;
    // Excalidraw can emit a transient empty scene while restoring/updating a
    // scene. Never let that snapshot replace a non-empty cloud document.
    // Keep any already queued non-empty save intact when an empty callback
    // arrives during restoration.
    if (!hasCloudSceneChange(elements)) return;
    // Scroll, zoom and selection also fire onChange. Only a structural change
    // (elements / files) may start a cloud save; otherwise the save queue churns
    // and risks racing itself into a false revision conflict.
    const guardId = cloudSessionRef.current.diagramId;
    const guardFiles = apiRef.current?.getFiles?.() || {};
    const fingerprint = sceneFingerprint(elements, guardFiles);
    const known = cloudFingerprintsRef.current.get(guardId) || {};
    if (!cloudManualSaveRequestedRef.current && (fingerprint === known.queued || fingerprint === known.saved)) return;
    cloudFingerprintsRef.current.set(guardId, { ...known, queued: fingerprint });
    // Excalidraw fires onChange from componentDidUpdate. Returning a new object
    // here on every callback re-renders App, which rebuilds the onChange prop,
    // which makes Excalidraw update and fire onChange again (React #185).
    // Bail out when nothing actually changes.
    setCloudSaveState((current) => (current.state === "pending" && !current.error ? current : { ...current, state: "pending", error: "" }));
    const session = cloudSessionRef.current;
    const api = apiRef.current;
    if (!api || !Array.isArray(elements)) return;
    const document = createCloudDocument({
      api,
      elements,
      appState: appState || api.getAppState?.() || {},
      metadata: documentMetadataRef.current,
      // Deleting every element of an existing cloud diagram is a real edit.
      allowEmpty: allowsEmptyCloudSave(elements),
    });
    if (cloudSaveTimerRef.current) window.clearTimeout(cloudSaveTimerRef.current);
    cloudSaveTimerRef.current = window.setTimeout(() => {
      cloudSaveTimerRef.current = null;
      if (!isActiveCloudSession(session, cloudSessionRef.current)) return;
      setCloudSaveState((current) => (current.state === "saving" && !current.error ? current : { ...current, state: "saving", error: "" }));
      cloudSaveQueueRef.current = cloudSaveQueueRef.current.catch(() => {}).then(async () => {
        // The user may have created a new local drawing while a previous
        // cloud save was waiting in the queue. Never send that stale request.
        if (!isActiveCloudSession(session, cloudSessionRef.current)) return;
        const registry = cloudRevisionRegistryRef.current;
        const revision = registry.effective(session.diagramId, session.revision);
        const result = await workspaceClient.saveDiagram(session.diagramId, revision, document);
        // Record the new revision even if this tab was switched away meanwhile;
        // a stale snapshot copy would otherwise send an old if-match later.
        const savedRevision = result && result.revision !== undefined && result.revision !== null
          ? result.revision
          : (typeof revision === "number" ? revision + 1 : revision);
        registry.note(session.diagramId, savedRevision);
        cloudFingerprintsRef.current.set(session.diagramId, { saved: fingerprint, queued: fingerprint });
        if (!isActiveCloudSession(session, cloudSessionRef.current)) return;
        session.revision = savedRevision;
        setCloudSaveState({ state: "saved", error: "", lastSavedAt: Date.now() });
        if (cloudManualSaveRequestedRef.current) {
          cloudManualSaveRequestedRef.current = false;
          showToast("Saved to Cloud Workspace", "success");
        }
      }).catch((error) => {
        if (!isActiveCloudSession(session, cloudSessionRef.current)) return;
        return reconcileSaveFailure(error);
      });
      const reconcileSaveFailure = async (error) => {
        cloudManualSaveRequestedRef.current = false;
        const known = cloudFingerprintsRef.current.get(session.diagramId) || {};
        cloudFingerprintsRef.current.set(session.diagramId, { ...known, queued: known.saved });
        if (!isRevisionConflict(error)) {
          setCloudSaveState({ state: "error", error: error.message || "Could not save this cloud diagram." });
          return;
        }
        // A 409 is not necessarily another session: it can be our own duplicate
        // request. Compare against the server copy before alarming the user.
        const showConflict = () => setCloudSaveState({
          state: "conflict",
          error: "This cloud diagram changed in another session. Reload the latest version before continuing; your current edits are still available to download as a backup.",
        });
        try {
          const latest = await workspaceClient.getDiagram(session.diagramId);
          if (!isActiveCloudSession(session, cloudSessionRef.current)) return;
          const { diagram: remoteDiagram, document: remoteDocument } = normalizeCloudDiagramResponse(latest, session.diagramId);
          const remoteRevision = remoteDiagram.revision ?? latest?.revision ?? latest?.version;
          const liveApi = apiRef.current;
          const localFingerprint = sceneFingerprint(
            liveApi?.getSceneElementsIncludingDeleted?.() || [], liveApi?.getFiles?.() || {},
          );
          const verdict = classifyConflict({
            remoteFingerprint: sceneFingerprint(remoteDocument.elements, remoteDocument.files || {}),
            attemptedFingerprint: fingerprint,
            savedFingerprint: known.saved,
            localFingerprint,
          });
          cloudRevisionRegistryRef.current.note(session.diagramId, remoteRevision);
          if (verdict === "self-echo") {
            session.revision = remoteRevision ?? session.revision;
            cloudFingerprintsRef.current.set(session.diagramId, { saved: fingerprint, queued: fingerprint });
            setCloudSaveState({ state: "saved", error: "", lastSavedAt: Date.now() });
            return;
          }
          if (verdict === "reload" && liveApi?.updateScene) {
            const restored = restoreElements(remoteDocument.elements, null, { repairBindings: true });
            const hydrated = hydrateFilesSync(liveApi, restored, remoteDocument.files || {});
            liveApi.updateScene({ elements: hydrated.elements, captureUpdate: CaptureUpdateAction.NEVER });
            session.revision = remoteRevision ?? session.revision;
            cloudFingerprintsRef.current.set(session.diagramId, {
              saved: sceneFingerprint(restored, remoteDocument.files || {}),
              queued: sceneFingerprint(restored, remoteDocument.files || {}),
            });
            setCloudSaveState({ state: "saved", error: "", lastSavedAt: Date.now() });
            return;
          }
        } catch { /* Could not verify; fall through to the visible conflict. */ }
        setCloudConflictDismissed(false);
        showConflict();
      };
    }, cloudFlushImmediatelyRef.current ? 0 : 700);
  }, [apiRef, cloudDiagramId, documentMetadataRef, queueLocalSketchSave, showToast]);

  const saveCloudDiagramNow = useCallback(() => {
    const api = apiRef.current;
    if (!cloudSessionRef.current.active || !api) return;
    cloudManualSaveRequestedRef.current = true;
    cloudFlushImmediatelyRef.current = true;
    queueSketchSave(api.getSceneElements?.() || [], api.getAppState?.() || {});
    cloudFlushImmediatelyRef.current = false;
  }, [apiRef, cloudDiagramId, queueSketchSave]);

  // Move to another chapter of the same project. Flushes any pending cloud save first and
  // only records "last opened" - it never changes the chapter's sequence position.
  const navigateToChapter = useCallback(async (target) => {
    if (!target?.id || !cloudSessionRef.current.active) return;
    const projectId = cloudSessionRef.current.projectId || cloudProjectId;
    if (["pending", "saving"].includes(cloudSaveStateRef.current.state)) {
      saveCloudDiagramNow();
      await new Promise((resolve) => setTimeout(resolve, 60));
      await cloudSaveQueueRef.current.catch(() => {});
      await new Promise((resolve) => setTimeout(resolve, 60));
    }
    if (["error", "conflict", "pending", "saving"].includes(cloudSaveStateRef.current.state)
      && !window.confirm("This chapter has changes that are not saved to Cloud Workspace. Switch chapters anyway?")) return;
    const usedAt = new Date().toISOString();
    recordWorkspaceItemOpened(target.id, usedAt);
    await Promise.race([
      workspaceClient.updateDiagram(target.id, { lastOpenedAt: usedAt }).catch(() => {}),
      new Promise((resolve) => setTimeout(resolve, 1200)),
    ]);
    window.location.assign(buildChapterEditorUrl(projectId, target.id));
  }, [cloudProjectId, saveCloudDiagramNow]);

  useEffect(() => {
    if (!cloudDiagramId || !apiReady || !sketchReady || !canvasTabsReady || cloudLoadStartedRef.current || cloudSessionRef.current.active) return undefined;
    let cancelled = false;
    let settled = false;
    let applied = false;
    let readyFrame = 0;
    // Bind the load to the tab that started it. The response may arrive after
    // the user has switched to (or opened) another tab.
    const targetTabId = cloudRestoringTabIdRef.current || activeCanvasIdRef.current;
    cloudLoadStartedRef.current = true;
    cloudSceneReadyRef.current = false;
    setCloudSaveState({ state: "loading", error: "" });
    const updateTargetTab = (patch) => {
      const nextTabs = canvasTabsRef.current.map((tab) => (tab.id === targetTabId ? patch(tab) : tab));
      canvasTabsRef.current = nextTabs;
      setCanvasTabs(nextTabs);
      saveCanvasTabs(nextTabs).catch(() => {});
    };
    workspaceClient.getDiagram(cloudDiagramId).then((result) => {
      if (cancelled) return;
      const { diagram, document, name: loadedCloudName } = normalizeCloudDiagramResponse(result, cloudDiagramId);
      const disposition = resolveCloudLoadTarget({
        targetTabId,
        activeTabId: activeCanvasIdRef.current,
        tabIds: canvasTabsRef.current.map((tab) => tab.id),
      });
      if (disposition === "drop") {
        settled = true;
        cloudRestoringTabIdRef.current = "";
        return;
      }
      const elements = restoreElements(document.elements, null, { repairBindings: true });
      const format = document.format || diagram.format || "excalidraw";
      const session = {
        active: true,
        diagramId: diagram.id || cloudDiagramId,
        projectId: diagram.projectId || cloudProjectId,
        revision: diagram.revision ?? result?.revision ?? result?.version ?? 0,
        name: diagram.name || "Cloud diagram",
      };
      const loadedSnapshot = {
        elements, appState: document.appState || {}, files: document.files || {},
        metadata: document.metadata || {}, extensions: document.extensions || {},
        format, file: null,
        cloudSession: { ...session }, cloudDetached: false,
        cloudSaveState: { state: "saved", error: "" }, cloudDocumentName: loadedCloudName,
      };
      if (disposition === "store") {
        // The user is on another tab. Keep the live canvas and cloud flags of
        // that tab untouched; the loaded document is applied from the tab's
        // snapshot the next time the cloud tab is activated.
        updateTargetTab((tab) => ({ ...tab, name: loadedCloudName, snapshot: loadedSnapshot, dirty: false }));
        settled = true;
        cloudRestoringTabIdRef.current = "";
        return;
      }
      const api = apiRef.current;
      if (!api?.updateScene) throw new Error("The editor is not ready to load this cloud diagram.");
      documentMetadataRef.current = {
        metadata: document.metadata || {},
        extensions: document.extensions || {},
        format,
      };
      cloudDetachedRef.current = false;
      setCloudDetached(false);
      cloudSceneReadyRef.current = false;
      cloudSessionRef.current = session;
      setCloudDocumentName(loadedCloudName);
      // Register binary files BEFORE the scene so the first paint already has
      // every icon (no gray placeholder boxes).
      const hydrated = hydrateFilesSync(api, elements, document.files || {});
      api.updateScene({
        elements: hydrated.elements,
        appState: { ...api.getAppState(), ...sanitizeCloudAppState(document.appState || {}), selectedElementIds: {}, selectedGroupIds: {}, selectedLinearElement: null },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      api.history?.clear?.();
      if (hydrated.missing.length) hydrateMissingFromCache(api, hydrated.missing).catch(() => {});
      cloudRevisionRegistryRef.current.note(session.diagramId, session.revision);
      {
        const loadedFp = sceneFingerprint(elements, document.files || {});
        cloudFingerprintsRef.current.set(session.diagramId, { saved: loadedFp, queued: loadedFp });
      }
      setCloudConflictDismissed(false);
      setCurrentFileRef.current?.(null);
      setSavedSketch({ elements, appState: document.appState || {}, files: document.files || {}, metadata: document.metadata || {}, extensions: document.extensions || {}, format });
      applied = true;
      updateTargetTab((tab) => ({ ...tab, name: loadedCloudName, snapshot: { ...loadedSnapshot, cloudSession: { ...cloudSessionRef.current } }, dirty: false }));
      if (elements.length) api.scrollToContent?.(elements, { fitToContent: true, animate: false });

      // Excalidraw can emit onChange callbacks after updateScene returns.
      // Keep the restoration guard active through the next paint so those
      // callbacks cannot start the normal React/persistence pipeline midway
      // through cloud hydration.
      readyFrame = window.requestAnimationFrame(() => {
        readyFrame = 0;
        settled = true;
        if (cancelled) return;
        cloudSceneReadyRef.current = true;
        cloudRestoringTabIdRef.current = "";
        setCloudSaveState({ state: "saved", error: "" });
      });
    }).catch((error) => {
      if (cancelled) return;
      settled = true;
      const message = error.message || "Could not load this cloud diagram.";
      cloudRestoringTabIdRef.current = "";
      if (activeCanvasIdRef.current === targetTabId) {
        cloudSessionRef.current.active = false;
        cloudSceneReadyRef.current = true;
        setCloudSaveState({ state: "error", error: message });
      } else {
        // Do not touch the live state of whichever tab is active now.
        updateTargetTab((tab) => ({ ...tab, snapshot: { ...tab.snapshot, cloudSaveState: { state: "error", error: message } } }));
      }
    });
    return () => {
      cancelled = true;
      if (readyFrame) {
        // The scene was already restored; finish the ready transition now so
        // the tab is not left ignoring every onChange event.
        window.cancelAnimationFrame(readyFrame);
        readyFrame = 0;
        cloudSceneReadyRef.current = true;
        cloudRestoringTabIdRef.current = "";
      } else if (!settled && !applied) {
        // The request was abandoned before it produced anything (dependency
        // change). Allow the effect to start it again instead of leaving the
        // tab on its empty placeholder forever.
        cloudLoadStartedRef.current = false;
      }
    };
  }, [apiReady, canvasTabsReady, cloudDiagramId, cloudProjectId, documentMetadataRef, setSavedSketch, sketchReady]);

  useEffect(() => {
    const flushPendingCloudSave = () => {
      if (!cloudSessionRef.current.active || cloudDetachedRef.current || !apiRef.current) return;
      const api = apiRef.current;
      cloudFlushImmediatelyRef.current = true;
      queueSketchSave(api.getSceneElementsIncludingDeleted?.() || api.getSceneElements?.() || [], api.getAppState?.() || {});
      cloudFlushImmediatelyRef.current = false;
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") flushPendingCloudSave();
    };
    window.addEventListener("pagehide", flushPendingCloudSave);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("pagehide", flushPendingCloudSave);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      if (cloudSaveTimerRef.current) window.clearTimeout(cloudSaveTimerRef.current);
    };
  }, [apiRef, cloudDiagramId, queueSketchSave]);

  const createDesignFromStudio = useCallback(({ templateId, name, ruleMode = "guided", templateOptions = {} }) => {
    const api = apiRef.current;
    if (!api?.updateScene || !sketchReady) {
      showToast("The editor is still initializing. Please try again in a moment.", "error");
      return;
    }
    try {
      const currentElements = api.getSceneElements?.() || [];
      if (currentElements.some((element) => !element.isDeleted)) {
        const confirmed = window.confirm("Creating a new design will replace the current canvas. Make sure the current drawing is saved or exported before continuing. Continue?");
        if (!confirmed) return;
      }
      const profile = createProfileForTemplate(templateId, { name, ruleMode, templateOptions });
      const elements = createTemplateElements(templateId, templateOptions);
      documentMetadataRef.current = {
        ...(documentMetadataRef.current || {}),
        extensions: withDesignProfile(documentMetadataRef.current?.extensions || {}, profile),
      };
      api.updateScene({
        elements,
        appState: { selectedElementIds: {}, selectedGroupIds: {}, selectedLinearElement: null },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      if (elements.length && typeof api.scrollToContent === "function") {
        api.scrollToContent(elements, { fitToContent: true, animate: false });
      }
      queueSketchSave(elements, api.getAppState?.() || {});
      setDesignStudioOpen(false);
      showToast(`Created ${profile.name}`);
    } catch (error) {
      showToast(error?.message || "Unable to create this design. Your current drawing has been preserved.", "error");
    }
  }, [sketchReady, queueSketchSave, showToast]);

  const collaboration = useCollaboration({ apiRef, showToast, closeNativeMenu, sketchReady, apiReady });
  const { collaborationRef, collaborationRemoteUpdateRef, collaborationRoomId, collaborationClientId, collaborationOpen, setCollaborationOpen, collaborationMode, setCollaborationMode, collaborationDraftName, setCollaborationDraftName, collaborationDisplayName, setCollaborationDisplayName, collaborationSessionName, collaborationRoom, collaborationLink, collaborationStatus, collaborationJoinState, collaborationHostRecovery, collaborationEndedSession, setCollaborationEndedSession, collaborationUsers, collaborationParticipants, collaborationError, collaborationRole, collaborationPermission, collaborationRequestState, collaborationRequests, collaborationAuthorship, chatMessages, chatError, sendChatMessage, connectCollaboration, startCollaboration, createCollaboration, leaveOrEndCollaboration, requestEditAccess, decideEditRequest, revokeEditAccess, updateCollaborationCursor, markLocalViewportNavigation } = collaboration;

  const fileManager = useFileManager({
    apiRef, closeNativeMenu, showToast, queueSketchSave, saveTimerRef, resetLocalSketch, setSavedSketch, documentMetadataRef,
    lastSelectionSignature, startCollaboration,
  });
  const { recentFiles, recentFolders, currentFolder, currentFolderFiles, currentFile, currentFileRef, getCurrentFileSceneSignature, setCurrentFile, documentDirty, markCurrentDocumentChanged, fileActionsRef, refreshCurrentFolderFiles, handleFileError, replacementPrompt, resolveReplacementPrompt } = fileManager;
  setCurrentFileRef.current = setCurrentFile;

  // Read volatile UI state through a ref so captureCanvasTabSnapshot (and every
  // callback built on it, including Excalidraw's onChange) keeps a stable
  // identity. A changing onChange prop makes Excalidraw re-run componentDidUpdate
  // and call onChange again, which is what turned a status update into a loop.
  const canvasSnapshotStateRef = useRef(null);
  canvasSnapshotStateRef.current = { documentDirty, cloudSaveState, cloudDocumentName };
  const captureCanvasTabSnapshot = useCallback((elements, appState) => {
    const api = apiRef.current;
    const live = canvasSnapshotStateRef.current;
    return {
      elements: Array.isArray(elements) ? elements : (api?.getSceneElementsIncludingDeleted?.() || api?.getSceneElements?.() || []),
      appState: sanitizeTabAppState(appState || api?.getAppState?.() || {}),
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
    };
  }, [apiRef, currentFileRef, getCurrentFileSceneSignature, toolStyles]);

  const persistCanvasTabs = useCallback((nextTabs) => {
    const normalizedTabs = nextTabs.map((tab) => ({ ...tab, active: tab.id === activeCanvasIdRef.current }));
    canvasTabsRef.current = normalizedTabs;
    setCanvasTabs(normalizedTabs);
    if (canvasTabsSaveTimerRef.current) window.clearTimeout(canvasTabsSaveTimerRef.current);
    canvasTabsSaveTimerRef.current = window.setTimeout(() => {
      canvasTabsSaveTimerRef.current = null;
      saveCanvasTabs(canvasTabsRef.current).catch((error) => {
        logger.warn("Canvas tabs could not be saved", { category: "persistence", error });
      });
    }, 450);
  }, []);

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
    const next = canvasTabsRef.current.map((tab) => tab.id === activeCanvasIdRef.current
      ? { ...tab, snapshot, dirty: true }
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
    const snapshot = tab?.snapshot || {};
    if (tab?.id) toolStyles.hydrateCanvas(tab.id, snapshot.toolStylePresets);
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
    if (elements.length) api.scrollToContent?.(elements, { fitToContent: true, animate: false });
  }, [apiRef, setCurrentFile, setSavedSketch, toolStyles]);

  useEffect(() => {
    if (!apiReady || !apiRef.current) return;
    // A cloud deep-link is already restoring this tab from the server. Do not
    // let the generic tab effect reapply its cached snapshot over that load.
    if (cloudHydrationPendingTabIdRef.current === activeCanvasId) {
      cloudHydrationPendingTabIdRef.current = "";
      return;
    }
    const activeTab = canvasTabsRef.current.find((tab) => tab.id === activeCanvasId);
    if (activeTab?.snapshot) applyCanvasTabSnapshot(activeTab);
  }, [apiReady, activeCanvasId, applyCanvasTabSnapshot]);

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

  const createCanvasTab = useCallback(() => {
    const currentSnapshot = apiRef.current
      ? captureCanvasTabSnapshot()
      : (canvasTabsRef.current.find((tab) => tab.id === activeCanvasIdRef.current)?.snapshot || null);
    const currentTabs = canvasTabsRef.current.map((tab) => tab.id === activeCanvasIdRef.current
      ? { ...tab, ...(currentSnapshot ? { snapshot: currentSnapshot } : {}) }
      : tab);
    const nextNumber = currentTabs.reduce((max, tab) => Math.max(max, Number(tab.name.match(/Canvas (\d+)/)?.[1] || 0)), 0) + 1;
    const id = createCanvasTabId(currentTabs.map((tab) => tab.id));
    const nextTab = {
      id, name: `Canvas ${nextNumber}`, ...createTabDates(), todoItems: [], todoTabOpen: false, todoTabActive: false, dirty: false,
      snapshot: {
        elements: [], appState: { viewBackgroundColor: apiRef.current?.getAppState?.().viewBackgroundColor || "#ffffff" },
        files: {}, metadata: {}, extensions: {}, format: "excalidraw",
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
    const isActive = tabId === activeCanvasIdRef.current;
    // An untouched/cleared canvas has nothing to protect. Check the live
    // Excalidraw scene for the active tab and the persisted snapshot for
    // inactive tabs, ignoring deleted elements in either case.
    const sceneElements = isActive
      ? (apiRef.current?.getSceneElements?.() || [])
      : (Array.isArray(tab.snapshot?.elements) ? tab.snapshot.elements.filter((element) => element && !element.isDeleted) : []);
    const isEmptyCanvas = sceneElements.length === 0;
    const hasUnsavedChanges = !isEmptyCanvas && Boolean(tab.dirty || (isActive && (
      canvasSnapshotStateRef.current?.documentDirty ||
      ["pending", "saving", "error", "conflict"].includes(canvasSnapshotStateRef.current?.cloudSaveState?.state)
    )));
    if (hasUnsavedChanges && !skipDraftPromptRef.current) {
      const snapshot = isActive && apiRef.current ? captureCanvasTabSnapshot() : tab.snapshot;
      const cloudBacked = Boolean(snapshot?.cloudSession?.active && snapshot?.cloudSession?.diagramId && snapshot?.cloudDetached !== true);
      setDontAskDraftChecked(false);
      setCloseTabPrompt({ tabId, name: tab.name, isActive, cloudBacked, fileBacked: !cloudBacked && isTabBackedByFileOrCloud(snapshot) });
      return;
    }
    performCloseCanvasTab(tabId);
  }, [captureCanvasTabSnapshot, performCloseCanvasTab]);

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
    persistCanvasTabs(current);
  }, [persistCanvasTabs]);

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
        const restoredTabs = (refreshedTabs.length ? refreshedTabs : stored).map((tab) => ({
          ...tab,
          ...normalizeTabDates(tab, today),
        }));
        const activeId = restoredTabs.find((tab) => tab.active)?.id || restoredTabs[0].id;
        const activeTab = restoredTabs.find((tab) => tab.id === activeId) || restoredTabs[0];
        setActiveWorkspaceTabId(activeTab.todoTabOpen && activeTab.todoTabActive ? `todo:${activeId}` : activeId);
        canvasTabsRef.current = restoredTabs;
        setCanvasTabs(restoredTabs);
        saveCanvasTabs(restoredTabs).catch(() => {});
        activeCanvasIdRef.current = activeId;
        setActiveCanvasId(activeId);
        if (activeTab.snapshot) applyCanvasTabSnapshot(activeTab);
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
        snapshot: { elements: [], appState: {}, files: {}, metadata: {}, extensions: {}, format: "excalidraw", file: null,
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

  const renameActiveDocument = useCallback(async (name) => {
    const normalizedName = String(name || "").trim();
    if (!normalizedName) throw new Error("Enter a name for this canvas.");
    if (normalizedName.length > 120) throw new Error("Canvas names must be 120 characters or fewer.");
    const duplicateTab = findDuplicateTabName(canvasTabsRef.current, normalizedName, activeCanvasIdRef.current);
    if (duplicateTab) {
      const error = new Error(`Another open canvas is already named "${duplicateTab.name}". Choose a different name.`);
      showToast(error.message, "error");
      throw error;
    }
    if (cloudSessionRef.current.active && !cloudDetachedRef.current) {
      if (!cloudSessionRef.current.active) throw new Error("The Cloud Workspace document is still loading.");
      try {
        const result = await workspaceClient.updateDiagram(cloudSessionRef.current.diagramId, { name: normalizedName });
        const diagram = result?.diagram || result;
        const savedName = diagram?.name || normalizedName;
        cloudSessionRef.current.name = savedName;
        setCloudDocumentName(savedName);
        const renamedTabs = canvasTabsRef.current.map((tab) => tab.id === activeCanvasIdRef.current ? { ...tab, name: savedName } : tab);
        persistCanvasTabs(renamedTabs);
        showToast("Canvas renamed");
      } catch (error) {
        showToast(error?.message || "Unable to rename this cloud canvas.", "error");
        throw error;
      }
      return;
    }
    const rename = fileActionsRef.current.renameCurrentDocument;
    if (typeof rename !== "function") throw new Error("Canvas rename is not available right now.");
    await rename(normalizedName);
    const renamedTabs = canvasTabsRef.current.map((tab) => tab.id === activeCanvasIdRef.current ? { ...tab, name: normalizedName } : tab);
    persistCanvasTabs(renamedTabs);
  }, [cloudDiagramId, showToast, persistCanvasTabs]);

  const closeExportDialog = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const appState = api.getAppState?.();
    if (appState?.openDialog?.name !== "imageExport") return;
    api.updateScene({
      appState: { ...appState, openDialog: null },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }, []);

  const openCollaborationDetails = useCallback(() => {
    const activeCollaboration = Boolean(
      collaborationRoom &&
      collaborationRole &&
      collaborationStatus !== "disconnected",
    );
    if (activeCollaboration) setCollaborationMode("active");
    setCollaborationOpen(true);
  }, [collaborationRole, collaborationRoom, collaborationStatus, setCollaborationMode, setCollaborationOpen]);

  const collaborationCanEdit = (!collaborationRoom && !collaborationEndedSession) || collaborationEndedSession?.returned === true || (Boolean(collaborationRoom) && collaborationStatus === "connected" && collaborationHostRecovery?.state !== "recovering" && (collaborationPermission === "host" || collaborationPermission === "editor"));
  const moreTools = useMoreTools({ apiRef, moreToolsOpen, togglePanel, closePanel, canEdit: collaborationCanEdit });
  const { anchor: moreToolsAnchor, position: positionMoreToolsButton, activate: activateMoreTool } = moreTools;
  const iconInsertion = useIconInsertion({ apiRef, gridEnabled, gridSize, markRecentlyUsed, canEdit: collaborationCanEdit });
  const { draggingIcon, handleDragStart, handleIconMouseDown, handleIconPointerDown, handleIconClick, handleDragOver, handleDrop, createStarterMindMap } = iconInsertion;

  const canvasTools = useCanvasTools({ apiRef, gridEnabled, setGridEnabled, gridSize, setGridSize, connectionMode, setConnectionMode, selectedConnector, setSelectedConnector, selectedElements, canEdit: collaborationCanEdit, toolStylePresets: toolStyles });
  const { toggleGrid, activateArrowTool, activateSelectionTool, applyToSelected, applyToSelectedArrow, updateSingleSelected, firstSelected, hasTextSelection, hasArrowSelection, hasShapeSelection } = canvasTools;
  const selectedAwsResource = getSelectedAwsResource(selectedElements);
  const selectedAwsResourceDefinition = getAwsResourceDefinitionById(selectedAwsResource?.definitionId);
  const selectedKubernetesResource = getSelectedKubernetesResource(selectedElements);
  const selectedKubernetesResourceDefinition = getKubernetesResourceDefinitionById(selectedKubernetesResource?.definitionId);
  const selectedNetworkingResource = getSelectedNetworkingResource(selectedElements);
  const selectedNetworkingResourceDefinition = getNetworkingResourceDefinitionById(selectedNetworkingResource?.definitionId);
  const selectedAwsRelationship = selectedElements.length === 1 ? getAwsRelationship(selectedElements[0]) : null;
  const selectedKubernetesRelationship = selectedElements.length === 1 ? getKubernetesRelationship(selectedElements[0]) : null;
  const selectedKubernetesRelationshipGuidance = selectedKubernetesRelationship && selectedElements.length === 1
    ? getKubernetesRelationshipGuidance(selectedElements[0], apiRef.current?.getSceneElements?.() || selectedElements)
    : null;
  const selectedArchitectureRelationship = (() => {
    const connector = selectedElements.length === 1 && ["arrow", "line"].includes(selectedElements[0]?.type) ? selectedElements[0] : null;
    if (!connector) return null;
    if (connector.customData?.architectureRelationship) return { ...connector.customData.architectureRelationship, elementId: connector.id };
    const scene = apiRef.current?.getSceneElements?.() || [];
    const endpoints = [connector.startBinding?.elementId, connector.endBinding?.elementId].map((id) => scene.find((element) => element.id === id)).filter(Boolean);
    const providerOf = (element) => element?.customData?.awsResource ? "aws" : element?.customData?.kubernetesResource ? "kubernetes" : element?.customData?.networkingResource ? "networking" : null;
    const providers = new Set(endpoints.map(providerOf).filter(Boolean));
    return (providers.size > 1 || providers.has("networking")) ? { relationshipId: `architecture:${connector.id}`, relationshipType: "traffic-flow", elementId: connector.id } : null;
  })();
  const updateSelectedAwsResource = useCallback((patch) => {
    if (!collaborationCanEdit || !selectedAwsResource?.awsResourceId) return;
    updateAwsResource(apiRef.current, selectedAwsResource.awsResourceId, patch);
  }, [collaborationCanEdit, selectedAwsResource?.awsResourceId]);
  const updateSelectedKubernetesResource = useCallback((patch) => {
    if (!collaborationCanEdit || !selectedKubernetesResource?.kubernetesResourceId) return;
    updateKubernetesResource(apiRef.current, selectedKubernetesResource.kubernetesResourceId, patch);
  }, [collaborationCanEdit, selectedKubernetesResource?.kubernetesResourceId]);
  const updateSelectedNetworkingResource = useCallback((patch) => {
    if (!collaborationCanEdit || !selectedNetworkingResource?.networkingResourceId) return;
    const result = updateNetworkingResource(apiRef.current, selectedNetworkingResource.networkingResourceId, patch);
    if (result?.error) showToast(result.error, "error");
  }, [collaborationCanEdit, selectedNetworkingResource?.networkingResourceId, showToast]);
  const updateSelectedArchitectureRelationshipType = useCallback((relationshipType) => {
    if (!collaborationCanEdit || !selectedArchitectureRelationship?.elementId || !apiRef.current) return;
    const allowed = ["traffic-flow", "contains", "routes-to", "depends-on", "connects-to"];
    if (!allowed.includes(relationshipType)) return;
    const elements = apiRef.current.getSceneElementsIncludingDeleted();
    const next = elements.map((element) => element.id !== selectedArchitectureRelationship.elementId ? element : ({ ...element, customData: { ...(element.customData || {}), architectureRelationship: { relationshipId: `architecture:${element.id}`, relationshipType } }, version: (element.version || 0) + 1, versionNonce: Math.floor(Math.random() * 2147483647), updated: Date.now() }));
    apiRef.current.updateScene({ elements: next, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  }, [collaborationCanEdit, selectedArchitectureRelationship?.elementId]);
  const updateSelectedAwsRelationshipType = useCallback((relationshipType) => {
    if (!collaborationCanEdit || !selectedAwsRelationship?.relationshipId || !apiRef.current) return;
    const currentElements = apiRef.current.getSceneElements();
    const result = updateRelationshipType(currentElements, selectedAwsRelationship.relationshipId, relationshipType);
    if (!result.changed) return;
    apiRef.current.updateScene({ elements: result.elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  }, [collaborationCanEdit, selectedAwsRelationship?.relationshipId]);
  const updateSelectedKubernetesRelationshipType = useCallback((relationshipType) => {
    if (!collaborationCanEdit || !selectedKubernetesRelationship?.relationshipId || !apiRef.current) return;
    const currentElements = apiRef.current.getSceneElements();
    const result = updateKubernetesRelationshipMetadata(currentElements, selectedKubernetesRelationship.relationshipId, { relationshipType });
    if (!result.changed) return;
    apiRef.current.updateScene({ elements: result.elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  }, [collaborationCanEdit, selectedKubernetesRelationship?.relationshipId]);

  useSketchiziEscape({
    activeTransientPanel,
    closePanel,
    closeMostRecentDrawer,
    isZenMode,
    exitZenMode,
    commandPaletteOpen,
    closeCommandPalette,
    minimapOpen,
    setMinimapOpen,
    designStudioOpen,
    setDesignStudioOpen,
    exportStudioOpen,
    setExportStudioOpen,
    templatesModalOpen,
    setTemplatesModalOpen,
    collaborationOpen,
    setCollaborationOpen,
    connectionMode,
    activateSelectionTool,
    searchRef,
    apiRef,
    closeExportDialog,
  });
  useSketchiziCanvasDismissal({ dismissUnpinnedDrawersFromCanvas });
  useSketchiziExportLifecycle({ apiRef, showToast, closeExportDialog });
  useEffect(() => {
    if (!collaborationCanEdit && libraryOpen) closePanel("icon-library");
  }, [closePanel, collaborationCanEdit, libraryOpen]);
  const preferences = useSketchiziPreferences({
    apiRef, apiReady, closePanel, openPanel, togglePanel, connectionMode, selectedCount, toggleGrid,
    activateSelectionTool, setMinimapOpen, searchRef, saveTimerRef, fileActionsRef, setStorageError, sketchReady, savedSketch, canEdit: collaborationCanEdit,
    canvasAppearance, setCanvasAppearance,
  });
  const { themeMode, setThemeMode, isDarkTheme, spellcheckEnabled, toggleSpellcheck } = preferences;
  skipDraftPromptRef.current = preferences.skipLocalDraftPrompt;
  useEffect(() => {
    if (typeof document === "undefined" || typeof MutationObserver === "undefined") return undefined;
    applyCanvasSpellcheck(document, spellcheckEnabled);
    const observer = new MutationObserver(() => applyCanvasSpellcheck(document, spellcheckEnabled));
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [spellcheckEnabled]);
  globalThemeRef.current = isDarkTheme ? "dark" : "light";
  useEffect(() => {
    if (!savedSketch) return;
    const hasElements = (savedSketch.elements || []).some((element) => element && !element.isDeleted && !element.deleted);
    const roughness = savedSketch.appState?.currentItemRoughness;
    const background = String(savedSketch.appState?.viewBackgroundColor || "").trim();
    const hasExplicitAppearance = background.toLowerCase() === "#1b382f" ||
      (typeof roughness === "number" && (roughness === 0 || roughness >= 2));
    if (hasElements || hasExplicitAppearance) {
      setCanvasAppearance(getCanvasAppearanceFromBackground(background, roughness));
    } else {
      setCanvasAppearance(isDarkTheme ? "sketch" : "clean");
    }
  }, [isDarkTheme, savedSketch]);
  const handleCanvasAppearanceChange = useCallback((appearance) => {
    if (!collaborationCanEdit) return;
    setCanvasAppearance(appearance);
    // Sketch / Clean / Chalkboard restyle the whole canvas, so they replace the
    // roughness remembered per tool. Colours, widths and dashes are untouched.
    toolStyles.applyCanvasRoughness(getCanvasAppearanceRoughness(appearance));
    if (appearance === "clean") preferences.useThemeDefaultBackground();
    else applyCanvasAppearance(apiRef.current, appearance, isDarkTheme);
  }, [collaborationCanEdit, isDarkTheme, preferences.useThemeDefaultBackground, toolStyles]);
  const insertCatalogIconAtViewportCenter = (icon) => {
    const canvas = document.querySelector(".excalidraw");
    if (!canvas || !icon) return;
    const rect = canvas.getBoundingClientRect();
    iconInsertion.addIconToCanvas(icon, rect.left + rect.width / 2, rect.top + rect.height / 2);
  };
  const commands = createSketchiziCommandRegistry({
    apiRef,
    canEdit: collaborationCanEdit,
    selectedCount,
    themeMode,
    setThemeMode,
    gridEnabled,
    toggleGrid,
    spellcheckEnabled,
    toggleSpellcheck,
    setMinimapOpen,
    fitDiagram: preferences.fitDiagram,
    activateMoreTool,
    openPanel,
    startCollaboration,
    leaveOrEndCollaboration,
    requestEditAccess,
    collaborationRoom,
    collaborationPermission,
    currentFolder,
    fileActionsRef,
    reopenClosedTab,
    closedTabCount: closedTabs.length,
    openExportStudio: () => setExportStudioOpen(true),
    insertCatalogIcon: insertCatalogIconAtViewportCenter,
    insertArchitecturePack: (pack) => insertArchitecturePackIntoScene(apiRef.current, pack, { captureUpdate: CaptureUpdateAction.IMMEDIATELY }),
    openArchitectureTemplates: () => setTemplatesModalOpen(true),
    openDesignTemplates: () => setDesignStudioOpen(true),
  });
  useNativeSketchiziMenu({ apiRef, fileActionsRef, openCloudWorkspace, canvasMode: canvasPageContext.mode, closedTabs, reopenClosedTab, deleteClosedTab, clearClosedTabs, currentFolder, currentFolderFiles, recentFiles, recentFolders, refreshCurrentFolderFiles, handleFileError, useThemeDefaultBackground: preferences.useThemeDefaultBackground, markCanvasBackgroundCustom: preferences.markCanvasBackgroundCustom });
  const handleExcalidrawChange = useExcalidrawScene({
    apiRef, nativeMenuOpenRef, setNativeMenuOpen, onNativeMenuOpen: closeLeftPanel, lastSelectionSignature,
    setSelectedCount, setSelectedElements, setSelectedConnector, updateMinimap, queueSketchSave,
    collaborationRemoteUpdateRef, collaborationRef, canEdit: collaborationCanEdit,
    onDocumentSceneChange: markCurrentDocumentChanged,
    toolStylePresets: toolStyles,
  });
  const syncStartupChooser = useCallback((elements, useRestoredFallback = false, appState = null) => {
    if (cloudDiagramId || !collaborationCanEdit) return;
    // Changing text-tool defaults or editing an existing text element can emit
    // transient empty-scene updates. Those are not a request to choose a canvas.
    if (appState?.activeTool?.type === "text" || appState?.editingElement) return;
    const hasLiveElements = (Array.isArray(elements) ? elements : []).some((element) => element && !element.isDeleted && !element.deleted);
    const hasRestoredElements = useRestoredFallback && (savedSketch?.elements || []).some((element) => element && !element.isDeleted && !element.deleted);
    if (hasLiveElements || hasRestoredElements) {
      // Existing content means startup is already past the canvas-choice step.
      // Keep this latched: transient empty-scene updates during canvas interaction
      // must not reopen the chooser.
      startupChoiceMadeRef.current = true;
      setStartupChooserOpen(false);
      return;
    }
    if (!startupChoiceMadeRef.current) setStartupChooserOpen(true);
  }, [cloudDiagramId, collaborationCanEdit, savedSketch]);

  useEffect(() => {
    if (!sketchReady || !apiReady || cloudDiagramId || !collaborationCanEdit) return;
    syncStartupChooser(apiRef.current?.getSceneElements?.() || [], true);
  }, [apiReady, cloudDiagramId, collaborationCanEdit, savedSketch, sketchReady, syncStartupChooser]);

  // Save the live background with the scene instead of forcing a theme color.
  const handleThemeAwareExcalidrawChange = useCallback((elements, appState) => {
    // Loading a cloud document calls updateScene while the editor is still
    // reconciling the restored scene. Ignore those restoration callbacks:
    // running the normal scene/state pipeline against an intermediate scene
    // can feed React updates back into Excalidraw and trigger update-depth
    // error #185. Normal edits resume as soon as the cloud scene is ready.
    if (isCloudSceneRestoring({ restoringTabId: cloudRestoringTabIdRef.current, activeTabId: activeCanvasIdRef.current, sceneReady: cloudSceneReadyRef.current })) return;

    // Excalidraw emits intermediate onChange snapshots for every freehand
    // pointer sample. Defer scene analysis, collaboration broadcasts, minimap
    // updates and persistence until the completed stroke callback arrives.
    // Keeping that work out of the pointer stream reduces pen latency.
    if (appState?.newElement?.type === "freedraw") return;
    syncStartupChooser(elements, false, appState);
    handleExcalidrawChange(elements, appState);
    persistActiveCanvasSnapshot(elements, appState);
    if (cloudSessionRef.current.active && !cloudDetachedRef.current) queueSketchSave(elements, appState);
  }, [handleExcalidrawChange, persistActiveCanvasSnapshot, queueSketchSave, syncStartupChooser]);

  const chooseStartupCanvas = useCallback((mode) => {
    startupChoiceMadeRef.current = true;
    // Closing the final tab leaves the workspace empty. Create a fresh canvas
    // when the user makes their next startup-canvas choice.
    if (canvasTabsRef.current.length === 0) createCanvasTab();
    setStartupChooserOpen(false);
    if (mode === "todo") {
      openTodoTab();
      return;
    }
    window.dispatchEvent(new CustomEvent("sketchizi:choose-canvas-mode", { detail: { mode } }));
  }, [createCanvasTab, openTodoTab]);

  // "Open Local File" from the welcome screen: make sure a canvas exists, then
  // hand off to the normal file-open flow once its editor is mounted.
  const openLocalFileFromStartup = useCallback(() => {
    startupChoiceMadeRef.current = true;
    if (canvasTabsRef.current.length === 0) createCanvasTab();
    setStartupChooserOpen(false);
    const startedAt = Date.now();
    const attempt = () => {
      if (apiRef.current) { fileActionsRef.current.openDrawingFromDisk?.(); return; }
      if (Date.now() - startedAt < 3000) window.requestAnimationFrame(attempt);
    };
    window.requestAnimationFrame(attempt);
  }, [createCanvasTab, fileActionsRef]);

  useEffect(() => {
    const handleWorkspaceCanvasChoice = (event) => {
      const mode = event.detail?.mode;
      if (mode === "infinite" || mode === "pages" || mode === "todo") chooseStartupCanvas(mode);
    };
    window.addEventListener("sketchizi:workspace-canvas-choice", handleWorkspaceCanvasChoice);
    return () => window.removeEventListener("sketchizi:workspace-canvas-choice", handleWorkspaceCanvasChoice);
  }, [chooseStartupCanvas]);



  const moreToolsToggle = collaborationCanEdit ? (
    <MoreTools
      open={moreToolsOpen}
      anchor={moreToolsAnchor}
      position={positionMoreToolsButton}
      activateTool={activateMoreTool}
      openPanel={openPanel}
      toggle={togglePanel}
      canEdit={collaborationCanEdit}
      placement="header"
    />
  ) : null;

  isZenModeRef.current = isZenMode;
  const toggleZenMode = useCallback(() => setIsZenMode((value) => !value), []);

  // The startup chooser and full-screen design catalog are canvas-free
  // surfaces even while an existing canvas remains mounted underneath them.
  const isWelcomeOrDashboardOpen = Boolean(
    startupChooserOpen ||
    designStudioOpen ||
    (canvasTabsReady && canvasTabs.length === 0) ||
    !hasMountableCanvas({ tabs: canvasTabs, activeCanvasId })
  );

  useEffect(() => {
    if (!isWelcomeOrDashboardOpen) return undefined;

    // Tear down transient canvas UI before the welcome surface takes focus.
    closeNativeMenu();
    closeCommandPalette();
    closeLeftPanel();
    closePanel("properties");
    closePanel("shortcuts");
    setMinimapOpen(false);
    apiRef.current?.setActiveTool?.({ type: "selection" });
    window.dispatchEvent(new CustomEvent("sketchizi:clear-custom-tool"));
    return undefined;
  }, [isWelcomeOrDashboardOpen, closeNativeMenu, closeCommandPalette, closeLeftPanel, closePanel]);

  useEffect(() => {
    if (!isWelcomeOrDashboardOpen) return undefined;

    // Excalidraw listens globally for single-key tool shortcuts. Stop those
    // shortcuts at the window capture phase while the welcome UI is active,
    // without interfering with typing or Tab navigation inside the UI.
    const toolShortcuts = new Set([
      "r", "v", "p", "o", "d", "t", "a", "l", "h", "i", "f", "e", "k",
      "1", "2", "3", "4", "5", "6", "7", "8", "9",
    ]);
    const getWelcomeSurface = () => document.querySelector(".startup-canvas-chooser, .design-studio-screen");
    const focusableSelector = "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1'])";
    const handleWelcomeKeyDown = (event) => {
      const target = event.target;
      const isEditingText = target instanceof Element && target.closest("input, textarea, select, [contenteditable='true'], [role='textbox'], .monaco-editor, .cm-editor");

      if (event.key === "Tab") {
        const surface = getWelcomeSurface();
        if (!surface) return;
        const focusable = Array.from(surface.querySelectorAll(focusableSelector))
          .filter((element) => element.getClientRects().length > 0 && !element.hasAttribute("inert"));
        if (!focusable.length) {
          event.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && (!surface.contains(active) || active === first)) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && (!surface.contains(active) || active === last)) {
          event.preventDefault();
          first.focus();
        }
        return;
      }

      if (event.altKey || event.ctrlKey || event.metaKey || event.isComposing || isEditingText) return;
      if (!toolShortcuts.has(String(event.key || "").toLowerCase())) return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
    };
    const focusFrame = window.requestAnimationFrame(() => {
      const surface = getWelcomeSurface();
      surface?.querySelector(focusableSelector)?.focus({ preventScroll: true });
    });
    window.addEventListener("keydown", handleWelcomeKeyDown, true);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      window.removeEventListener("keydown", handleWelcomeKeyDown, true);
    };
  }, [isWelcomeOrDashboardOpen]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const isZenShortcut = event.altKey && !event.ctrlKey && !event.metaKey && (event.code === "KeyZ" || String(event.key).toLowerCase() === "z");
      if (isZenShortcut) {
        event.preventDefault();
        event.stopPropagation();
        event.stopImmediatePropagation?.();
        setIsZenMode((value) => !value);
        return;
      }
    };
    const onToggleRequest = () => setIsZenMode((value) => !value);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("sketchizi:toggle-zen", onToggleRequest);
    return () => {
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("sketchizi:toggle-zen", onToggleRequest);
    };
  }, []);
  useEffect(() => {
    // Keep Excalidraw's own chrome in step with the HUD Zen state.
    apiRef.current?.updateScene?.({ appState: { zenModeEnabled: isZenMode } });
  }, [isZenMode, activeCanvasId]);

  if (!sketchReady) {
    return (
      <div className={isDarkTheme ? "app theme-dark" : "app theme-light"}>
        <div className="sketch-restore-screen" aria-live="polite">
          <div className="sketch-restore-card">
            <div className="sketch-restore-mark"><img src="/sketchizi-logo.svg" alt="Sketchizi" /></div>
            <div className="sketch-restore-title">Sketchizi</div>
            <div className="sketch-restore-text">Restoring your sketch…</div>
          </div>
        </div>
      </div>
    );
  }


  // The floating icon drawer must escape the mobile workspace's z-index: 0
  // stacking context so header controls cannot intercept its menu or rows.
  const libraryOverlayHost = typeof document === "undefined" ? null : document.querySelector(".app");

  // No open tab means no canvas: the welcome chooser owns the screen.
  const canvasMounted = hasMountableCanvas({ tabs: canvasTabs, activeCanvasId });
  const noOpenCanvas = canvasTabsReady && canvasTabs.length === 0;

  return (
    <div className={`${isDarkTheme ? "app theme-dark" : "app theme-light"} ${legacyPanelClasses.join(" ")} ${nativeMenuOpen ? "native-menu-open" : ""} ${aiAskOpen ? "ai-ask-open" : ""} ${isZenMode ? "is-zen-mode" : ""} ${startupChooserOpen ? "startup-chooser-active" : ""} canvas-first-header`} data-theme={isDarkTheme ? "dark" : "light"} data-welcome-open={isWelcomeOrDashboardOpen ? "true" : "false"} data-open-panel={activeLeftPanel === "iconLibrary" ? "icon-library" : activeRightPanel === "properties" ? "properties" : activeTransientPanel || "none"} data-left-panel={activeLeftPanel || "none"} data-right-panel={activeRightPanel || "none"}>
      {cloudSessionRef.current.active && !cloudDetached && <div className={`cloud-editor-save-status cloud-editor-save-status-${cloudSaveState.state}`} hidden={cloudSaveState.state === "conflict" && cloudConflictDismissed} role={["error", "conflict"].includes(cloudSaveState.state) ? "alert" : "status"}>
        <span className="cloud-editor-save-status-text">{cloudSaveState.state === "loading" ? "Loading cloud diagram…" : cloudSaveState.state === "pending" || cloudSaveState.state === "saving" ? "Saving to Cloud Workspace…" : cloudSaveState.state === "saved" ? "Saved to Cloud Workspace" : ["error", "conflict"].includes(cloudSaveState.state) ? cloudSaveState.error : ""}</span>
        <span className="cloud-editor-save-status-actions">
          {cloudSaveState.state === "error" && <>
            <button type="button" className="is-primary" onClick={() => {
              const api = apiRef.current;
              if (!api) return;
              queueSketchSave(api.getSceneElementsIncludingDeleted?.() || api.getSceneElements?.() || [], api.getAppState?.() || {});
            }}>Retry save</button>
            <button type="button" onClick={downloadRecoveryBackup}>Download backup</button>
          </>}
          {cloudSaveState.state === "conflict" && <>
            <button type="button" className="is-primary" onClick={() => window.location.reload()}>Reload latest version</button>
            <button type="button" onClick={downloadRecoveryBackup}>Download backup</button>
            <button type="button" onClick={() => setCloudConflictDismissed(true)}>Dismiss</button>
          </>}
          <button type="button" onClick={openCloudWorkspace} aria-label="Return to Cloud Workspace">Cloud Workspace</button>
        </span>
      </div>}
      <DesktopAppHeader
        commands={commands}
        gridEnabled={gridEnabled}
        gridStyle={gridStyle}
        canvasAppearance={canvasAppearance}
        onCanvasAppearanceChange={handleCanvasAppearanceChange}
        onToggleGrid={toggleGrid}
        canvasMode={canvasPageContext.mode}
        spellcheckEnabled={spellcheckEnabled}
        onToggleSpellcheck={toggleSpellcheck}
        onGridStyleChange={setGridStyle}
        openCommandPalette={commandPalette.openCommandPalette}
        onOpenFullWorkspace={openCloudWorkspace}
        onOpenWorkspaceDiagram={openWorkspaceDiagram}
        onCreateWorkspaceChapter={createWorkspaceChapter}
        activeCloudProjectId={cloudSessionRef.current.active && !cloudDetached ? (cloudSessionRef.current.projectId || cloudProjectId || "") : ""}
        activeCloudDiagramId={cloudSessionRef.current.active && !cloudDetached ? (cloudSessionRef.current.diagramId || cloudDiagramId || "") : ""}
        onBeforeOpenPanel={closeNativeMenu}
        startCollaboration={startCollaboration}
        collaborationActive={Boolean(collaborationRoom && collaborationStatus !== "disconnected")}
        collaborationCreationState={collaboration.collaborationCreationState}
        collaborationCreationError={collaborationError}
        nativeMenuOpen={nativeMenuOpen}
        toggleNativeMenu={toggleNativeMenu}
        createCollaboration={createCollaboration}
        dismissCollaborationCreationFailure={collaboration.dismissCollaborationCreationFailure}
        setThemeMode={setThemeMode}
        themeMode={themeMode}
        canvasApi={apiRef.current}
        aiAskOpen={aiAskOpen}
        onPageContextChange={setCanvasPageContext}
        canEditCanvas={collaborationCanEdit}
        isDarkTheme={isDarkTheme}
        saveStatus={saveStatus}
        currentDocumentName={cloudSessionRef.current.active && !cloudDetached ? cloudDocumentName : (currentFile?.name || "Untitled drawing")}
        currentDocumentDirty={documentDirty}
        onRenameDocument={renameActiveDocument}
        currentDocumentFileBacked={Boolean(currentFile?.handle)}
        onSaveNow={retryLocalSave}
        onSaveToFile={() => fileActionsRef.current.saveCurrentDrawing?.()}
        onSaveAs={() => fileActionsRef.current.saveDrawingAs?.()}
        isCloudDocument={Boolean(cloudSessionRef.current.active && !cloudDetached)}
        onSaveToCloud={() => cloudSessionRef.current.active && !cloudDetachedRef.current ? saveCloudDiagramNow() : setCloudSaveDialogOpen(true)}
        cloudSaveState={cloudSaveState.state}
        chapterNav={chapterNav}
        onNavigateChapter={navigateToChapter}
        onDownloadRecoveryBackup={downloadRecoveryBackup}
        onOpenExport={() => setExportStudioOpen(true)}
        onOpenTemplates={() => setDesignStudioOpen(true)}
        onToggleMinimap={() => setMinimapOpen((o) => !o)}
        minimapOpen={minimapOpen}
        isZenMode={isZenMode}
        canvasTabs={canvasTabs.map((tab) => ({ ...tab, syncMeta: getTabCloudMeta(tab, tab.id === activeCanvasId ? { dirty: documentDirty, cloudSaveState } : null) })).flatMap((tab) => tab.todoTabOpen ? [tab, { id: `todo:${tab.id}`, name: "Todo", isTodoTab: true, canvasId: tab.id }] : [tab])}
        activeCanvasId={activeWorkspaceTabId}
        canvasId={activeCanvasId}
        canvasStartDate={canvasTabs.find((tab) => tab.id === activeCanvasId)?.startDate || getLocalDateString()}
        canvasOriginalDate={canvasTabs.find((tab) => tab.id === activeCanvasId)?.createdDate}
        canvasActivity={canvasTabs.find((tab) => tab.id === activeCanvasId)?.activity || []}
        onCanvasActivityChange={updateCanvasActivity}
        onCanvasStartDateChange={updateActiveCanvasStartDate}
        canvasDateDisabled={!collaborationCanEdit}
        onSelectCanvasTab={selectWorkspaceTab}
        onCloseTodoTab={closeTodoTab}
        onCreateCanvasTab={createCanvasTab}
        onReorderCanvasTabs={reorderCanvasTabs}
        onCloseCanvasTab={closeCanvasTab}
        closedTabs={closedTabs}
        onReopenClosedTab={reopenClosedTab}
        onDeleteClosedTab={deleteClosedTab}
        onClearClosedTabs={clearClosedTabs}
        moreToolsToggle={moreToolsToggle}
        libraryToggle={collaborationCanEdit ? (
          <button
            className={libraryOpen ? "library-toggle desktop-app-library-toggle active" : "library-toggle desktop-app-library-toggle"}
            onClick={() => {
              const nextOpen = !libraryOpen;
              togglePanel("icon-library");
              if (nextOpen) requestAnimationFrame(() => searchRef.current?.focus());
            }}
            type="button"
            aria-label={libraryOpen ? "Close icon library" : "Open icon library"}
            title={libraryOpen ? "Close Icon Library" : "Open Icon Library"}
            aria-expanded={libraryOpen}
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5V5.5Z" />
              <path d="M4 5.5v16" />
              <path d="M8 7h8" />
              <path d="M8 11h8" />
            </svg>
          </button>
        ) : null}
      >
        <button
          type="button"
          className={aiAskOpen ? "ai-ask-toggle active" : "ai-ask-toggle"}
          onClick={() => {
            toggleAiAsk();
          }}
          title="AI Ask"
          aria-label="AI Ask"
          aria-expanded={aiAskOpen}
        >
          <svg className="ai-ask-toggle-sparkle" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M12 3.5 13.9 9l5.6 1.9-5.6 1.9L12 18.3l-1.9-5.5-5.6-1.9L10.1 9 12 3.5Z" /></svg>
          <span className="ai-ask-toggle-label">AI</span>
        </button>



      </DesktopAppHeader>

      <div className={`desktop-workspace ${collaborationCanEdit ? "desktop-workspace-editable" : "desktop-workspace-viewer"} ${libraryOpen ? "desktop-workspace-library-open" : "desktop-workspace-library-closed"} ${propertiesOpen ? "desktop-workspace-context-open" : "desktop-workspace-context-closed"}`}>
        {libraryOverlayHost && createPortal(
          <aside className={`desktop-resources-region sk-icon-library-portal-host ${libraryPresence.present ? "mobile-resource-open" : "mobile-resource-closed"}`} data-edge="left" data-edge-motion={libraryPresence.phase} aria-label="Resources">
          {collaborationCanEdit && (
            <IconLibraryPanel
              searchRef={searchRef} search={search} setSearch={setSearch}
              activeCategory={activeCategory} setActiveCategory={setActiveCategory} activeAwsCategory={activeAwsCategory} setActiveAwsCategory={setActiveAwsCategory} activeKubernetesCategory={activeKubernetesCategory} setActiveKubernetesCategory={setActiveKubernetesCategory}
              favorites={favorites} recentIcons={recentIcons} eraserCatalog={eraserCatalog}
              eraserSyncing={eraserSyncing} eraserSyncProgress={eraserSyncProgress}
              eraserSyncError={eraserSyncError} syncEraserLibrary={syncEraserLibrary} eraserCachedCount={eraserCachedCount}
              connectionMode={connectionMode} activateArrowTool={activateArrowTool}
              activateSelectionTool={activateSelectionTool} remoteLoading={remoteLoading}
              visibleIcons={visibleIcons} umlIcons={umlIcons} mindMapIcons={mindMapIcons} networkingIcons={networkingIcons} awsIcons={awsIcons} awsCategories={awsCategories} awsCategoryCounts={awsCategoryCounts} awsCategoryRepresentatives={awsCategoryRepresentatives} awsCatalogLogo={AWS_CATALOG_LOGO} awsCatalogLogoDark={AWS_CATALOG_LOGO_DARK} kubernetesIcons={kubernetesIcons} kubernetesCategories={kubernetesCategories} kubernetesCategoryCounts={kubernetesCategoryCounts} kubernetesCategoryRepresentatives={kubernetesCategoryRepresentatives} iconDisplayLimit={iconDisplayLimit}
              setIconDisplayLimit={setIconDisplayLimit} iconListRef={iconListRef}
              draggingIcon={draggingIcon} handleIconClick={handleIconClick}
              handleIconPointerDown={handleIconPointerDown} handleIconMouseDown={handleIconMouseDown} handleDragStart={handleDragStart} createStarterMindMap={createStarterMindMap}
              isFavorite={isFavorite} toggleFavorite={toggleFavorite} remoteError={remoteError}
              iconLibraryPinned={isIconLibraryPinned} setIconLibraryPinned={setIconLibraryPinned}
              onClose={() => closePanel("icon-library")}
            />
          )}
          </aside>,
          libraryOverlayHost,
        )}

        <section className="desktop-canvas-region" aria-label="Canvas workspace">
          <div className={activeWorkspaceTabId.startsWith("todo:") ? "desktop-canvas-view-hidden" : "desktop-canvas-view"}>
          {canvasMounted && (
          <SketchiziCanvas
            hudSuppressed={isWelcomeOrDashboardOpen}
            nativeMenuOpen={nativeMenuOpen}
            savedSketch={savedSketch}
            isDarkTheme={isDarkTheme}
            pageContext={canvasPageContext}
            key={activeCanvasId}
            canvasId={activeCanvasId}
            onToolStyleChange={toolStyles.recordToolStyle}
            todoItems={canvasTabs.find((tab) => tab.id === activeCanvasId)?.todoItems || []}
            onTodoItemsChange={updateCanvasTodoItems}
            onOpenTodoTab={openTodoTab}
            handleExcalidrawAPI={handleExcalidrawAPI}
            handleChange={handleThemeAwareExcalidrawChange}
            handleDrop={handleDrop}
            minimapOpen={minimapOpen}
            minimapScene={minimapScene}
            apiRef={apiRef}
            minimapDragRef={minimapDragRef}
            centerOnMinimap={centerOnMinimap}
            closeShortcuts={() => closePanel("shortcuts")}
            shortcutHelpOpen={shortcutHelpOpen}
            setMinimapOpen={setMinimapOpen}
            collaborationParticipants={collaborationParticipants}
            collaborationSelfId={collaborationClientId}
            updateCollaborationCursor={updateCollaborationCursor}
            onViewportChange={markLocalViewportNavigation}
            propertiesOpen={propertiesOpen}
            selectedElements={selectedElements}
            onClearSelection={clearCanvasSelection}
            applyToSelected={applyToSelected}
            onOpenProperties={() => {
              const selectedIds = selectedElements.filter((element) => element && !element.isDeleted).map((element) => element.id);
              if (selectedIds.length && apiRef.current?.updateScene) {
                apiRef.current.updateScene({
                  appState: { selectedElementIds: Object.fromEntries(selectedIds.map((id) => [id, true])) },
                  captureUpdate: CaptureUpdateAction.NEVER,
                });
              }
              openPanel("properties");
            }}
            onToolActivated={() => closePanel("properties")}
            canEdit={collaborationCanEdit}
            viewModeEnabled={collaborationPermission === "viewer"}
            gridStyle={gridStyle}
            canvasAppearance={canvasAppearance}
             onGridVisibilityChange={setGridEnabled}
             gridEnabled={gridEnabled}
          />
          )}
          </div>
          {activeWorkspaceTabId.startsWith("todo:") && (
            <>
              <nav className={`sketchizi-primary-dock${isDarkTheme ? " is-dark" : ""}`} aria-label="Todo workspace dock">
                <div className="sketchizi-primary-dock-group">
                  <button type="button" className="sketchizi-primary-dock-tool sketchizi-todo-dock-trigger is-active"
                    aria-label="Return to canvas" title="Return to canvas"
                    onClick={() => selectWorkspaceTab(activeWorkspaceTabId.slice(5))}>
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="4" y="3.5" width="16" height="17" rx="2" />
                      <path d="m7.5 9 1.5 1.5L12 7.5M14 9h3M7.5 15l1.5 1.5 3-3M14 15h3" />
                    </svg>
                  </button>
                </div>
              </nav>
              <div className="sketchizi-todo-workspace">
                <TodoList items={canvasTabs.find((tab) => tab.id === activeWorkspaceTabId.slice(5))?.todoItems || []}
                  onChange={(items) => updateCanvasTodoItems(activeWorkspaceTabId.slice(5), items)}
                  canvasTabs={canvasTabs} onNavigateToCanvas={selectWorkspaceTab} isDarkTheme={isDarkTheme} fullPage />
              </div>
            </>
          )}

          {draggingIcon && (
            <div
              className="icon-drag-ghost"
              style={{ left: draggingIcon.x, top: draggingIcon.y }}
              aria-hidden="true"
            >
              <img src={draggingIcon.icon.src} alt="" draggable={false} />
              <span>{draggingIcon.icon.name}</span>
            </div>
          )}

        </section>


        <aside
          className={`desktop-context-region ${propertiesOpen ? "validation-state-open" : "validation-state-closed"}`}
          aria-label="Properties"
        >
          {rightRailPresence.present && (
            <div className="desktop-validation-host is-open" data-edge="right" data-edge-motion={rightRailPresence.phase}>
              {renderedRightRailPanel === "properties" && (
                <PropertiesPanel
                  selectedCount={selectedCount}
                  propertiesOpen={true}
                  setPropertiesOpen={(open) => { if (!open) closePanel("properties"); }}
                  firstSelected={firstSelected}
                  hasShapeSelection={hasShapeSelection}
                  hasArrowSelection={hasArrowSelection}
                  hasTextSelection={hasTextSelection}
                  applyToSelected={applyToSelected}
                  applyToSelectedArrow={applyToSelectedArrow}
                  updateSingleSelected={updateSingleSelected}
                  awsResource={selectedAwsResource}
                  awsResourceDefinition={selectedAwsResourceDefinition}
                  updateAwsResource={updateSelectedAwsResource}
                  kubernetesResource={selectedKubernetesResource}
                  kubernetesResourceDefinition={selectedKubernetesResourceDefinition}
                  updateKubernetesResource={updateSelectedKubernetesResource}
                  networkingResource={selectedNetworkingResource}
                  networkingResourceDefinition={selectedNetworkingResourceDefinition}
                  updateNetworkingResource={updateSelectedNetworkingResource}
                  architectureRelationship={selectedArchitectureRelationship}
                  architectureRelationshipTypes={["traffic-flow", "contains", "routes-to", "depends-on", "connects-to"]}
                  updateArchitectureRelationshipType={updateSelectedArchitectureRelationshipType}
                  awsRelationship={selectedAwsRelationship}
                  relationshipTypes={AWS_RELATIONSHIP_TYPES}
                  updateAwsRelationshipType={updateSelectedAwsRelationshipType}
                  kubernetesRelationship={selectedKubernetesRelationship}
                  kubernetesRelationshipTypes={KUBERNETES_RELATIONSHIP_TYPES}
                  updateKubernetesRelationshipType={updateSelectedKubernetesRelationshipType}
                  kubernetesRelationshipGuidance={selectedKubernetesRelationshipGuidance}
                  readOnly={!collaborationCanEdit}
                  hideDuplicateFormattingControls={true}
                />
              )}
            </div>
          )}
        </aside>
      </div>

      {startupChooserOpen && sketchReady && (apiReady || noOpenCanvas) && (!cloudDiagramId || noOpenCanvas) && collaborationCanEdit && (
        <div className="startup-canvas-backdrop" role="presentation">
          <section className="startup-canvas-chooser" role="dialog" aria-modal="true" aria-labelledby="startup-canvas-title">
            <h2 id="startup-canvas-title">Start with</h2>
            <div className="startup-canvas-options">
              <button type="button" className="startup-canvas-option" onClick={() => chooseStartupCanvas("infinite")}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 12c2.2-5.8 5.2-5.8 9 0s6.8 5.8 9 0c-2.2-5.8-5.2-5.8-9 0S5.2 17.8 3 12Z"/></svg>
                <span>Infinity</span>
              </button>
              <button type="button" className="startup-canvas-option" onClick={() => chooseStartupCanvas("pages")}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="3.5" width="12" height="15" rx="1.5"/><path d="M8 7.5h6M8 11h6M8 14.5h4"/><path d="M9 20.5h10a1 1 0 0 0 1-1v-13"/></svg>
                <span>Pages</span>
              </button>
              <button type="button" className="startup-canvas-option" onClick={() => chooseStartupCanvas("todo")}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="4" y="3.5" width="16" height="17" rx="2"/><path d="m7.5 9 1.5 1.5L12 7.5M14 9h3M7.5 15l1.5 1.5 3-3M14 15h3"/></svg>
                <span>Todo</span>
              </button>
            </div>
            {closedTabs.length > 0 && (
              <>
                <h3 className="startup-canvas-subtitle">Local drafts · recently closed</h3>
                <ul className="startup-canvas-drafts" aria-label="Local drafts">
                  {closedTabs.map((record) => (
                    <li className="startup-canvas-draft" key={record.closedId}>
                      <button type="button" className="startup-canvas-draft-open" onClick={() => reopenClosedTab(record.closedId)} title={`Reopen ${record.name}`}>
                        <strong>{record.name}</strong>
                        <small>{describeClosedAt(record)} · {countLiveElements(record)} elements · browser draft</small>
                      </button>
                      <button type="button" className="startup-canvas-draft-delete" aria-label={`Delete draft ${record.name}`} title="Delete this draft permanently" onClick={() => deleteClosedTab(record.closedId)}>×</button>
                    </li>
                  ))}
                </ul>
              </>
            )}
            <h3 className="startup-canvas-subtitle">Or open an existing file</h3>
            <div className="startup-canvas-options startup-canvas-options-open">
              <button type="button" className="startup-canvas-option startup-canvas-option-wide" onClick={openLocalFileFromStartup}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7a2 2 0 0 1 2-2h4l2 2.5h6a2 2 0 0 1 2 2V17a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7Z"/></svg>
                <span>Open Local File</span>
              </button>
              <button type="button" className="startup-canvas-option startup-canvas-option-wide" onClick={openCloudWorkspace}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 18h9.5a3.5 3.5 0 0 0 .6-6.95A5.5 5.5 0 0 0 6.4 9.6 4.2 4.2 0 0 0 7 18Z"/></svg>
                <span>Open Cloud File</span>
              </button>
            </div>
          </section>
        </div>
      )}

      <CommandPalette
        open={commandPaletteOpen}
        onClose={closeCommandPalette}
        commands={commands}
        onExecute={(command) => command.execute()}
      />

      <CollaborationUI
        open={collaborationOpen}
        setOpen={setCollaborationOpen}
        mode={collaborationMode}
        status={collaborationStatus}
        hostRecovery={collaborationHostRecovery}
        endedSession={collaborationEndedSession}
        onReturnToCanvas={() => setCollaborationEndedSession((current) => current ? { ...current, returned: true } : current)}
        onDismissEndedSession={() => setCollaborationEndedSession(null)}
        draftName={collaborationDraftName}
        setDraftName={setCollaborationDraftName}
        displayName={collaborationDisplayName}
        setDisplayName={setCollaborationDisplayName}
        sessionName={collaborationSessionName}
        link={collaborationLink}
        users={collaborationUsers}
        participants={collaborationParticipants}
        selfId={collaborationClientId}
        error={collaborationError}
        collaborationCreationState={collaboration.collaborationCreationState}
        collaborationJoinState={collaborationJoinState}
        createCollaboration={createCollaboration}
        connectCollaboration={connectCollaboration}
        roomId={collaborationRoomId}
        role={collaborationRole}
        permission={collaborationPermission}
        requestState={collaborationRequestState}
        requests={collaborationRequests}
        onRequestEditAccess={requestEditAccess}
        onDecideEditRequest={decideEditRequest}
        onRevokeEditAccess={revokeEditAccess}
        onLeaveOrEnd={leaveOrEndCollaboration}
        showToast={showToast}
        onOpenDetails={openCollaborationDetails}
        chatMessages={chatMessages}
        chatError={chatError}
        sendChatMessage={sendChatMessage}
      />

      {!isWelcomeOrDashboardOpen && (
        <ZenHud
          isZenMode={isZenMode}
          onToggleZen={toggleZenMode}
          aiOpen={aiAskOpen}
          onToggleAi={toggleAiAsk}
        />
      )}
      <AiAskPanel open={aiAskOpen} onClose={() => setAiAskOpen(false)} apiRef={apiRef} persistSketchNow={persistSketchNow} saveTimerRef={saveTimerRef} pageContext={canvasPageContext} />

      {closedTabToast && (
        <div className="sketchizi-toast closed-tab-toast" role="status" aria-live="polite" key={closedTabToast.id}>
          <span>Closed “{closedTabToast.name}” (saved in local drafts)</span>
          <button type="button" onClick={() => reopenClosedTab(closedTabToast.closedId)}>Reopen Tab</button>
        </div>
      )}

      {toast && (
        <div className={`sketchizi-toast ${toast.kind === "error" ? "error" : ""}`} role="status" aria-live="polite" key={toast.id}>
          {toast.text}
        </div>
      )}

      {storageError && (
        <div className={`storage-warning ${storageError.kind === "quota" ? "storage-warning-quota" : ""}`} role="alert" aria-live="assertive">
          <div className="storage-warning-icon">!</div>
          <div className="storage-warning-copy">
            <strong>{storageError.kind === "quota" ? "Browser storage is full" : "Local save is unavailable"}</strong>
            <span>{storageError.emergencySaved ? "Your latest changes are kept in an emergency browser backup, but IndexedDB is not saving normally." : "Your latest changes may not survive closing this tab. Download a backup before continuing."}</span>
          </div>
          <div className="storage-warning-actions">
            <button type="button" onClick={retryLocalSave}>Retry save</button>
            <button type="button" onClick={downloadRecoveryBackup}>Download backup</button>
          </div>
        </div>
      )}
      <Suspense fallback={<div className="sketchizi-toast" role="status" aria-live="polite">Opening tool…</div>}>
      {closeTabPrompt && (
        <div
          className="canvas-tab-close-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCloseTabPrompt(null);
          }}
        >
          <section
            className="canvas-tab-close-dialog"
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="canvas-tab-close-title"
            aria-describedby="canvas-tab-close-description"
          >
            <div className="canvas-tab-close-dialog-icon" aria-hidden="true">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 3.5 21 19a1 1 0 0 1-.87 1.5H3.87A1 1 0 0 1 3 19l9-15.5Z" />
                <path d="M12 9v4.5M12 17h.01" />
              </svg>
            </div>
            <div className="canvas-tab-close-dialog-copy">
              <span className="canvas-tab-close-eyebrow">{closeTabPrompt.cloudBacked || closeTabPrompt.fileBacked ? "UNSAVED CHANGES" : "BROWSER DRAFT · NOT SAVED TO A FILE"}</span>
              <h2 id="canvas-tab-close-title">Close this canvas?</h2>
              <p className="canvas-tab-close-name">{closeTabPrompt.name}</p>
              <p id="canvas-tab-close-description">
                {closeTabPrompt.cloudBacked
                  ? "This canvas has changes that haven’t synced to your Cloud Workspace yet."
                  : closeTabPrompt.fileBacked
                    ? "This canvas has changes that haven’t been saved to its file yet."
                    : "This canvas only exists as a draft in this browser. Save it to a file to keep a permanent copy."}
                {" "}Choose what happens to it:
              </p>
            </div>
            <div className="canvas-tab-close-choices">
              {!closeTabPrompt.cloudBacked && (
                <button type="button" className="canvas-tab-close-choice is-primary" autoFocus onClick={() => saveAndCloseTab(closeTabPrompt)}>
                  <strong>{closeTabPrompt.fileBacked ? "Save to file & close" : "Save to file… & close"}</strong>
                  <small>Permanent copy on disk</small>
                </button>
              )}
              {!closeTabPrompt.cloudBacked && !closeTabPrompt.fileBacked && (
                <button type="button" className="canvas-tab-close-choice" onClick={() => { setCloseTabPrompt(null); if (!closeTabPrompt.isActive) switchCanvasTab(closeTabPrompt.tabId); setCloudSaveDialogOpen(true); }}>
                  <strong>Save to cloud…</strong>
                  <small>Opens the Cloud Workspace save dialog; the tab stays open</small>
                </button>
              )}
              <button type="button" className={`canvas-tab-close-choice${closeTabPrompt.cloudBacked ? " is-primary" : ""}`} autoFocus={closeTabPrompt.cloudBacked} onClick={() => {
                if (dontAskDraftChecked) preferences.setSkipLocalDraftPrompt(true);
                performCloseCanvasTab(closeTabPrompt.tabId);
              }}>
                <strong>Close &amp; keep in Local Drafts</strong>
                <small>Recoverable from Recently closed (Ctrl/Cmd+Shift+T)</small>
              </button>
              <button type="button" className="canvas-tab-close-choice is-danger" onClick={() => performCloseCanvasTab(closeTabPrompt.tabId, { keepDraft: false })}>
                <strong>Discard</strong>
                <small>Close and delete this draft</small>
              </button>
            </div>
            <label className="canvas-tab-close-remember">
              <input type="checkbox" checked={dontAskDraftChecked} onChange={(event) => setDontAskDraftChecked(event.target.checked)} />
              <span>Don’t ask again for local drafts (always “Close &amp; keep”)</span>
            </label>
            <div className="canvas-tab-close-dialog-actions">
              <button type="button" className="canvas-tab-close-keep" onClick={() => setCloseTabPrompt(null)}>Keep editing</button>
            </div>
          </section>
        </div>
      )}
      {replacementPrompt && <div className="canvas-replacement-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) resolveReplacementPrompt(false); }}>
        <section className="canvas-replacement-dialog" role="alertdialog" aria-modal="true" aria-labelledby="canvas-replacement-title" aria-describedby="canvas-replacement-description">
          <div className="canvas-replacement-icon" aria-hidden="true">!</div>
          <div className="canvas-replacement-copy">
            <h2 id="canvas-replacement-title">Replace the current canvas?</h2>
            <p>{replacementPrompt.reason}</p>
            <p id="canvas-replacement-description">{replacementPrompt.recovery}</p>
          </div>
          <div className="canvas-replacement-actions">
            <button type="button" className="canvas-replacement-cancel" onClick={() => resolveReplacementPrompt(false)}>Cancel</button>
            <button type="button" className="canvas-replacement-continue" onClick={() => resolveReplacementPrompt(true)}>Continue</button>
          </div>
        </section>
      </div>}
      {cloudSaveDialogOpen && <CloudSaveDialog initialName={cloudSessionRef.current.active && !cloudDetached ? (cloudSessionRef.current.name || "Cloud diagram") : (currentFile?.name || "Untitled drawing")} onClose={() => setCloudSaveDialogOpen(false)} onSave={saveDrawingToCloud} />}
      {designStudioOpen && (
        <CreateDesignScreen
          isDarkTheme={isDarkTheme}
          onClose={() => setDesignStudioOpen(false)}
          onCreate={createDesignFromStudio}
        />
      )}
      {exportStudioOpen && (
        <ExportStudioModal
          isOpen={exportStudioOpen}
          onClose={() => setExportStudioOpen(false)}
          apiRef={apiRef}
        />
      )}
      {templatesModalOpen && (
        <ArchitectureTemplatesModal
          isOpen={templatesModalOpen}
          onClose={() => setTemplatesModalOpen(false)}
          apiRef={apiRef}
        />
      )}
      </Suspense>
    </div>
  );
}
export default App;
