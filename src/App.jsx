import { planComposeDiagram, composeCardDetails } from "./features/docker-compose/composeDiagramLayout.js";
import { describeKubernetesResource, getIngressBackendServiceNames, getIngressTlsSecretNames } from "./features/kubernetes-studio/kubernetesManifestModel.js";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import IconLibraryPanel from "./IconLibraryPanel";
import PropertiesPanel from "./PropertiesPanel";
import { CaptureUpdateAction, convertToExcalidrawElements, getCommonBounds, restoreElements } from "@excalidraw/excalidraw";
import { usePanelState } from "./features/navigation/usePanelState";
import { useNativeSketchiziMenu } from "./features/navigation/useNativeSketchiziMenu";
import { registerExportStudioShortcut } from "./features/navigation/exportStudioShortcut.js";
import { useMoreTools } from "./features/navigation/useMoreTools";
import { useSketchiziPreferences } from "./features/navigation/useSketchiziPreferences";
import { countLiveElements, describeClosedAt } from "./features/workspace/closedTabs.js";
import { getInitialThemeMode } from "./features/navigation/themePreference.js";
import { applyCanvasAppearance, getCanvasAppearanceFromBackground, getCanvasAppearanceRoughness } from "./features/navigation/canvasAppearance.js";
import { useSketchiziEscape, useSketchiziCanvasDismissal } from "./features/navigation/useSketchiziEscape";
import { useDrawerPresence } from "./features/navigation/useDrawerPresence";
import { useDocumentPersistence } from "./hooks/useDocumentPersistence";
import { useSystemDesignWorkspace } from "./features/system-design/useSystemDesignWorkspace.js"; import { useSystemDesignIconAssignment } from "./features/system-design/useSystemDesignIconAssignment.js";
import { useWorkspaceTabState } from "./hooks/useWorkspaceTabState";
import { useWorkspaceTabs } from "./hooks/useWorkspaceTabs";
import { useTabSwitcher } from "./hooks/useTabSwitcher";
import { getWorkspaceTabMode } from "./features/workspace/WorkspaceModeIcon.jsx";
import { useCollaboration } from "./features/collaboration/useCollaboration";
import { useFileManager } from "./features/files/useFileManager";
import { useIconCatalog } from "./features/icon-library/useIconCatalog";
import { umlIcons } from "./umlLibrary";
import { mindMapIcons } from "./mindMapLibrary";
import { awsIcons, awsCategories, awsCategoryCounts, awsCategoryRepresentatives, AWS_CATALOG_LOGO, AWS_CATALOG_LOGO_DARK } from "./awsArchitectureLibrary";
import { kubernetesIcons, kubernetesCategories, kubernetesCategoryCounts, kubernetesCategoryRepresentatives } from "./kubernetesArchitectureLibrary";
import { useCanvasTools } from "./features/canvas/useCanvasTools";
import { useToolStylePresets } from "./features/canvas/useToolStylePresets";
import { useExcalidrawScene } from "./features/canvas/useExcalidrawScene";
import SketchiziCanvas from "./components/app/SketchiziCanvas";
import TodoList from "./components/app/TodoList.jsx";
import "./styles/canvas-tab-close-dialog.css";
import CollaborationUI from "./components/app/CollaborationUI";
import MoreTools from "./components/app/MoreTools";
import { useIconInsertion } from "./features/icon-library/useIconInsertion";
import { useCommandPalette } from "./features/navigation/useCommandPalette";
import { createSketchiziCommandRegistry } from "./features/commands/commandRegistry";
import { insertArchitecturePack as insertArchitecturePackIntoScene } from "./features/templates/architecturePackInsertion";
const CreateDesignScreen = lazy(() => import("./features/design/ui/CreateDesignScreen.jsx"));
import { createProfileForTemplate, createTemplateElements } from "./features/design/templates/templateRegistry.js";
import { withDesignProfile } from "./features/design/model/designDocument.js";
import { getAwsResourceDefinitionById } from "./awsResourceDefinitions";
import { getKubernetesResourceDefinitionById } from "./kubernetesResourceDefinitions";
import { getNetworkingResourceDefinitionById } from "./networkingResourceDefinitions.js";
import { workspaceClient } from "./features/workspace/workspaceClient.js";
import { hasMountableCanvas } from "./features/workspace/tabClose.js";
import { findDuplicateTabName } from "./features/workspace/tabLabel.js";
import { resolveStorageMode } from "./features/canvas/imageImport/imageSizePolicy.js";
import CloudOptimizeModal from "./features/canvas/imageImport/CloudOptimizeModal.jsx";
const CloudSaveDialog = lazy(() => import("./features/workspace/CloudSaveDialog.jsx"));
import { isCloudSceneRestoring } from "./features/workspace/cloudSavePolicy.js";
import { getSelectedAwsResource, updateAwsResource } from "./features/aws-resources/awsResourceService";
import { getSelectedKubernetesResource, updateKubernetesResource } from "./features/kubernetes-resources/kubernetesResourceService";
import { getSelectedNetworkingResource, updateNetworkingResource } from "./features/networking/networkingResourceService.js";
import { AWS_RELATIONSHIP_TYPES, getAwsRelationship, updateRelationshipType } from "./features/aws-relationships/awsRelationshipService";
import { KUBERNETES_RELATIONSHIP_TYPES, getKubernetesRelationship, getKubernetesRelationshipGuidance, updateKubernetesRelationshipMetadata } from "./features/kubernetes-relationships/kubernetesRelationshipService";
import CommandPalette from "./components/app/CommandPalette";
import DesktopAppHeader from "./components/app/DesktopAppHeader";
const SystemDesignStudio = lazy(() => import("./features/system-design/SystemDesignStudio.jsx"));
const DockerComposeStudio = lazy(() => import("./features/docker-compose/ui/DockerComposeStudio.jsx"));
const KubernetesStudio = lazy(() => import("./features/kubernetes-studio/ui/KubernetesStudio.jsx"));
const ArchitectureTemplatesModal = lazy(() => import("./components/app/ArchitectureTemplatesModal"));
const ExportStudioModal = lazy(() => import("./components/app/ExportStudioModal"));
import AiAskPanel from "./features/ai/AiAskPanel.jsx";
import { getTabCloudMeta } from "./features/workspace/tabCloudState.js";
import ZenHud from "./components/app/ZenHud.jsx";
import { applyCanvasSpellcheck } from "./features/canvas/nativeSpellcheck.js";
import { startPeriodicBackendWarmup, wakeBackendOnPageLoad } from "./features/backend/backendWarmup.js";
import "./styles/ai-ask.css";
import "./features/design/design.css";
import "./features/workspace/workspace.css";
import "./styles/startup-canvas-chooser.css";
import { getLocalDateString } from "./features/canvas/canvasStartDate.js";
import { deleteDocument } from "./persistence.js";
import "./styles/canvas-tabs.css";
import "./styles/canvas-tabs-dock.css";
import "./styles/contextual-dock-polish.css";
import "./styles/todo-canvas-polish.css";
import "./styles/canvas-top-controls.css";
import "./styles/hud-capsules.css";
import "./styles/map-dock.css";
import "./styles/edge-drawer-motion.css";
import "./styles/smart-studio.css";
import "./styles/responsive-fluid.css"; // must stay the LAST stylesheet import

function App() {
  const iconCatalog = useIconCatalog();
  const [iconLibraryInitialSource, setIconLibraryInitialSource] = useState("all");
  const { activeCategory, setActiveCategory, activeAwsCategory, setActiveAwsCategory, activeKubernetesCategory, setActiveKubernetesCategory, search, setSearch, eraserCatalog, eraserSyncing, eraserSyncProgress, eraserSyncError, eraserCachedCount, remoteLoading, remoteError, favorites, recentIcons, searchRef, iconListRef, iconDisplayLimit, setIconDisplayLimit, visibleIcons, networkingIcons, syncEraserLibrary, isFavorite, toggleFavorite, markRecentlyUsed } = iconCatalog;
  const [connectionMode, setConnectionMode] = useState(false);
  const [isZenMode, setIsZenMode] = useState(false);
  const isZenModeRef = useRef(false);
  const exitZenMode = useCallback(() => setIsZenMode(false), []);
  const [canvasPageContext, setCanvasPageContext] = useState(() => {
    try {
      const restoredMode = localStorage.getItem("sketchizi.active-workspace-tab-mode") || localStorage.getItem("sketchizi.canvasView");
      return { mode: restoredMode === "pages" ? "pages" : "infinite", page: null, pageCount: 0 };
    } catch { return { mode: "infinite", page: null, pageCount: 0 }; }
  });
  const [startupChooserOpen, setStartupChooserOpen] = useState(false);
  const startupChoiceMadeRef = useRef(false);
  const [designStudioOpen, setDesignStudioOpen] = useState(false);
  const [dockerStudioOpen, setDockerStudioOpen] = useState(false);
  const [kubernetesStudioOpen, setKubernetesStudioOpen] = useState(false);
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
  const {
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
  } = useWorkspaceTabState();
  // toolPresetsByCanvasId: the last style chosen for each drawing tool, kept per
  // canvas tab (and saved in the tab snapshot), restored when that tool is re-picked.
  const toolStyles = useToolStylePresets({ apiRef, activeCanvasIdRef });
  const handleExcalidrawAPI = useCallback((api) => { apiRef.current = api || null; setApiReady(Boolean(api)); }, []);

  const [minimapOpen, setMinimapOpen] = useState(false);
  const [templatesModalOpen, setTemplatesModalOpen] = useState(false);
  const [exportStudioOpen, setExportStudioOpen] = useState(false);
  // `minimapOpen` is the Map's *pinned* state (M key, command palette, View
  // menu, Map pill click). Hover-peeking is local to MapDock.
  const toggleMapPinned = useCallback(() => setMinimapOpen((open) => !open), []);
  const closeMap = useCallback(() => setMinimapOpen(false), []);
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

  const {
    documentMetadataRef,
    savedSketch,
    setSavedSketch,
    sketchReady,
    storageError,
    setStorageError,
    saveStatus,
    saveTimerRef,
    persistSketchNow,
    retryLocalSave,
    resetLocalSketch,
    downloadRecoveryBackup,
    cloudDiagramId,
    cloudProjectId,
    cloudSessionRef,
    cloudSaveTimerRef,
    cloudSaveQueueRef,
    cloudLoadStartedRef,
    cloudHydrationPendingTabIdRef,
    cloudRestoringTabIdRef,
    cloudDetachedRef,
    cloudDetached,
    setCloudDetached,
    cloudSceneReadyRef,
    cloudSaveState,
    setCloudSaveState,
    cloudDocumentName,
    setCloudDocumentName,
    cloudRevisionRegistryRef,
    cloudFingerprintsRef,
    cloudConflictDismissed,
    setCloudConflictDismissed,
    cloudSaveStateRef,
    chapterNav,
    cloudSaveDialogOpen,
    setCloudSaveDialogOpen,
    cloudOptimizePrompt,
    confirmCloudOptimize,
    keepCloudLocalOnly,
    saveDrawingToCloud,
    queueSketchSave,
    saveCloudDiagramNow,
    navigateToChapter,
    fileManagerBridgeRef,
  } = useDocumentPersistence({
    activeCanvasIdRef,
    apiReady,
    apiRef,
    canvasTabsReady,
    canvasTabsRef,
    commitCanvasTabs,
    setCanvasTabs,
    setCurrentFileRef,
    showToast,
  });

  useEffect(() => {
    if (!nativeMenuOpen) return;
    // Keep the native hamburger menu mutually exclusive with modal and
    // floating tool surfaces that are opened outside usePanelState.
    if (
      minimapOpen ||
      templatesModalOpen ||
      exportStudioOpen ||
      designStudioOpen ||
      dockerStudioOpen ||
      kubernetesStudioOpen ||
      cloudSaveDialogOpen ||
      commandPaletteOpen
    ) {
      closeNativeMenu();
    }
  }, [
    nativeMenuOpen,
    minimapOpen,
    templatesModalOpen,
    exportStudioOpen,
    designStudioOpen,
    dockerStudioOpen,
    kubernetesStudioOpen,
    cloudSaveDialogOpen,
    commandPaletteOpen,
    closeNativeMenu,
  ]);

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

  // Filled by useWorkspaceTabs: lets Recent files focus/create editor tabs.
  const recentFileTabsRef = useRef(null);
  const fileManager = useFileManager({
    apiRef, closeNativeMenu, showToast, queueSketchSave, saveTimerRef, resetLocalSketch, setSavedSketch, documentMetadataRef,
    lastSelectionSignature, startCollaboration, recentFileTabsRef,
  });
  const { recentFiles, recentFolders, currentFolder, currentFolderFiles, currentFile, currentFileRef, getCurrentFileSceneSignature, setCurrentFile, documentDirty, markCurrentDocumentChanged, fileActionsRef, refreshCurrentFolderFiles, handleFileError, replacementPrompt, resolveReplacementPrompt } = fileManager;
  setCurrentFileRef.current = setCurrentFile;
  // Late-bind the file-manager values the persistence hook reads (see useDocumentPersistence).
  fileManagerBridgeRef.current = { currentFileRef, getCurrentFileSceneSignature };

  const systemDesignRef = useRef(null);

  const {
    persistCanvasTabs,
    persistSystemDesignState,
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
  } = useWorkspaceTabs({
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
    recentFileTabsRef,
  });

  const { switcher: tabSwitcher } = useTabSwitcher({
    canvasTabsRef,
    activeCanvasIdRef,
    canvasTabsRestoredRef,
    selectWorkspaceTab,
    blocked: Boolean(closeTabPrompt),
  });

  const handlePageContextChange = useCallback((context) => {
    setCanvasPageContext(context);
  }, []);

  const handleWorkspaceModeChange = useCallback((mode) => {
    const activeTab = canvasTabsRef.current.find(tab => tab.id === activeCanvasIdRef.current);
    if (mode === "pages" && activeTab?.type !== "pages") setActiveCanvasTabType("pages");
    else if (mode === "infinite" && (activeTab?.type === "pages" || activeTab?.type === "page")) setActiveCanvasTabType("canvas");
  }, [setActiveCanvasTabType]);

  const handleDeleteOnlyPagesNotebook = useCallback(async () => {
    const tabId = activeCanvasIdRef.current;
    const activeTab = canvasTabsRef.current.find(tab => tab.id === tabId);
    if (!tabId || !activeTab) return false;
    try {
      const tabsBeforeClose = canvasTabsRef.current;
      const tabIndex = tabsBeforeClose.findIndex(tab => tab.id === activeTab.id);
      const nextTab = tabsBeforeClose[tabIndex - 1] || tabsBeforeClose.find(tab => tab.id !== activeTab.id);
      const nextTabHasPages = Array.isArray(nextTab?.snapshot?.elements) &&
        nextTab.snapshot.elements.some(element => element?.type === "frame" && element.customData?.sketchiziPage && !element.isDeleted);
      const needsFreshCanvas = tabsBeforeClose.length <= 1;
      await deleteDocument(activeTab.id);
      if (needsFreshCanvas) createCanvasTab({ name: "Canvas 1" });
      performCloseCanvasTab(activeTab.id, { keepDraft: false });
      if (needsFreshCanvas || !nextTabHasPages) {
        window.dispatchEvent(new CustomEvent("sketchizi:choose-canvas-mode", { detail: { mode: "infinite" } }));
      }
      await commitCanvasTabs();
      return true;
    } catch (error) {
      showToast(error?.message || "Unable to delete this notebook.", "error");
      return false;
    }
  }, [commitCanvasTabs, createCanvasTab, performCloseCanvasTab, showToast]);

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
  const iconInsertion = useIconInsertion({ apiRef, gridEnabled, gridSize, markRecentlyUsed, canEdit: collaborationCanEdit, systemDesignRef });
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
    templatesModalOpen,
    setTemplatesModalOpen,
    exportStudioOpen,
    setExportStudioOpen,
    collaborationOpen,
    setCollaborationOpen,
    connectionMode,
    activateSelectionTool,
    searchRef,
    apiRef,
  });
  useSketchiziCanvasDismissal({ dismissUnpinnedDrawersFromCanvas });
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
  const systemDesign = useSystemDesignWorkspace({ apiRef, apiReady, activeCanvasId, gridEnabled, setGridEnabled, gridSize, canEdit: collaborationCanEdit, canvasTabsRef, activeCanvasIdRef, persistSystemDesignState });
  systemDesignRef.current = systemDesign; if (apiRef.current) apiRef.current.systemDesignWorkspace = systemDesign;
  const { target: iconAssignmentTarget, open: openSystemDesignIconLibrary, assign: assignSystemDesignNodeIcon, close: closeIconLibrary } = useSystemDesignIconAssignment({
    systemDesign, setInitialSource: setIconLibraryInitialSource, setSearch, searchRef, openPanel, closePanel, markRecentlyUsed,
  });
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
    openKubernetesStudio: () => setKubernetesStudioOpen(true),
    openDockerComposeStudio: () => setDockerStudioOpen(true),
    toggleSystemDesignStudio: systemDesign.toggle,
    systemDesignStudioOpen: systemDesign.enabled,
    openIconLibrary: () => { if (!libraryOpen) togglePanel("icon-library"); requestAnimationFrame(() => searchRef.current?.focus()); },
    insertCatalogIcon: insertCatalogIconAtViewportCenter,
    insertArchitecturePack: (pack) => insertArchitecturePackIntoScene(apiRef.current, pack, { captureUpdate: CaptureUpdateAction.IMMEDIATELY }),
    openArchitectureTemplates: () => setTemplatesModalOpen(true),
    openDesignTemplates: () => setDesignStudioOpen(true),
  });
  useNativeSketchiziMenu({ apiRef, fileActionsRef, openCloudWorkspace, closedTabs, reopenClosedTab, deleteClosedTab, clearClosedTabs, currentFolder, currentFolderFiles, recentFiles, recentFolders, refreshCurrentFolderFiles, handleFileError, useThemeDefaultBackground: preferences.useThemeDefaultBackground, markCanvasBackgroundCustom: preferences.markCanvasBackgroundCustom });
  const handleExcalidrawChange = useExcalidrawScene({
    apiRef, nativeMenuOpenRef, setNativeMenuOpen, onNativeMenuOpen: closeLeftPanel, lastSelectionSignature,
    setSelectedCount, setSelectedElements, setSelectedConnector, queueSketchSave,
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
    if (canvasTabsRef.current.length === 0) createCanvasTab({ type: mode === "pages" ? "pages" : "canvas" });
    else if (mode === "pages" || mode === "infinite") setActiveCanvasTabType(mode === "pages" ? "pages" : "canvas");
    setStartupChooserOpen(false);
    if (mode === "todo") {
      openTodoTab();
      return;
    }
    if (mode === "system-design") {
      systemDesign.open();
      return;
    }
    window.dispatchEvent(new CustomEvent("sketchizi:choose-canvas-mode", { detail: { mode } }));
  }, [createCanvasTab, openTodoTab, setActiveCanvasTabType, systemDesign.open]);

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
  }, [createCanvasTab, fileActionsRef, activeCanvasIdRef, canvasTabsRef, persistCanvasTabs, currentFileRef]);

  useEffect(() => {
    const handleWorkspaceCanvasChoice = (event) => {
      const mode = event.detail?.mode;
      if (mode === "infinite" || mode === "pages" || mode === "todo" || mode === "system-design") chooseStartupCanvas(mode);
    };
    window.addEventListener("sketchizi:workspace-canvas-choice", handleWorkspaceCanvasChoice);
    return () => window.removeEventListener("sketchizi:workspace-canvas-choice", handleWorkspaceCanvasChoice);
  }, [chooseStartupCanvas]);

  // Hamburger Workspace tiles create a fresh editor tab rather than changing
  // the mode or contents of the currently active tab. Cloud Files deliberately
  // keeps its existing navigation flow.
  useEffect(() => {
    const createWorkspaceTab = (event) => {
      const mode = event.detail?.mode;
      if (mode !== "infinite" && mode !== "pages") return;
      startupChoiceMadeRef.current = true;
      setStartupChooserOpen(false);
      const existingTabs = canvasTabsRef.current;
      const nextName = mode === "pages"
        ? `Page ${existingTabs.reduce((max, tab) => Math.max(max, Number(String(tab.name || "").match(/^Page (\\d+)$/)?.[1] || 0)), 0) + 1}`
        : null;
      createCanvasTab({ ...(nextName ? { name: nextName } : {}), type: mode === "pages" ? "pages" : "canvas" });
    };
    const openLocalFileInNewTab = () => {
      startupChoiceMadeRef.current = true;
      setStartupChooserOpen(false);
      createCanvasTab();
      const createdId = activeCanvasIdRef.current;
      persistCanvasTabs(canvasTabsRef.current.map((tab) => tab.id === createdId ? { ...tab, type: "canvas" } : tab));
      window.requestAnimationFrame(() => {
        Promise.resolve(fileActionsRef.current.openDrawingFromDisk?.()).then(() => {
          const openedName = currentFileRef.current?.name;
          if (!openedName) return;
          const cleanName = openedName.replace(/\.(sketchizi|excalidraw|json)$/i, "");
          persistCanvasTabs(canvasTabsRef.current.map((tab) => tab.id === createdId ? { ...tab, name: cleanName } : tab));
        });
      });
    };
    window.addEventListener("sketchizi:workspace-create-tab", createWorkspaceTab);
    window.addEventListener("sketchizi:workspace-open-local-file", openLocalFileInNewTab);
    return () => {
      window.removeEventListener("sketchizi:workspace-create-tab", createWorkspaceTab);
      window.removeEventListener("sketchizi:workspace-open-local-file", openLocalFileInNewTab);
    };
  }, [createCanvasTab, fileActionsRef, activeCanvasIdRef, canvasTabsRef, persistCanvasTabs, currentFileRef]);

  const applyKubernetesResourceYaml = useCallback((resource) => {
    const api = apiRef.current;
    if (!api?.updateScene || !collaborationCanEdit || !resource?.manifest) {
      throw new Error("The canvas is not ready for Kubernetes resource updates.");
    }
    const current = api.getSceneElementsIncludingDeleted?.() || api.getSceneElements?.() || [];
    const targetElements = current.filter((element) => {
      if (element.isDeleted) return false;
      const metadata = element.customData?.kubernetesManifestResource;
      return metadata?.properties?.manifestResourceId === resource.id;
    });
    if (!targetElements.length) {
      showToast("This resource is not on the canvas yet. Create the diagram first, then edit its YAML.", "warning");
      return;
    }
    const manifest = resource.manifest;
    const kind = String(manifest.kind || resource.kind);
    const name = String(manifest.metadata?.name || resource.name);
    const namespace = String(manifest.metadata?.namespace || (kind === "Namespace" ? name : "default"));
    const apiVersion = String(manifest.apiVersion || resource.apiVersion);
    const spec = manifest.spec || {};
    const workloadKinds = ["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Pod", "Job", "CronJob"];
    const podSpec = kind === "CronJob" ? spec.jobTemplate?.spec?.template?.spec
      : kind === "Job" ? spec.template?.spec
      : ["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet"].includes(kind) ? spec.template?.spec
      : spec;
    // Null-safe summaries (shared with diagram creation) so sparse manifests cannot throw here.
    const { images, ports, selector, hosts, dataKeys } = describeKubernetesResource({ kind, manifest });
    const details = [
      `Namespace: ${namespace}`,
      workloadKinds.includes(kind) ? `Replicas: ${spec.replicas ?? (kind === "DaemonSet" ? "node-managed" : 1)}` : "",
      images.length ? `Images: ${images.join(", ")}` : "",
      kind === "Service" ? `Type: ${spec.type || "ClusterIP"}` : "",
      ports.length ? `Ports: ${ports.join(", ")}` : "",
      selector.length ? `Selector: ${selector.join(", ")}` : "",
      kind === "Ingress" ? `Hosts: ${hosts.join(", ") || "default backend"}` : "",
      kind === "ConfigMap" ? `Keys: ${dataKeys.join(", ")}` : "",
      apiVersion,
    ].filter(Boolean).join("\n");
    // Remove generated connectors involving this resource before its metadata changes.
    // Their reciprocal card bindings must be removed too, otherwise Excalidraw can retain stale
    // boundElements references after the YAML is reapplied.
    const staleRelationshipIds = new Set(current
      .filter((element) => !element.isDeleted
        && element.type === "arrow"
        && (element.customData?.kubernetesRelationship?.fromResourceId === resource.id
          || element.customData?.kubernetesRelationship?.toResourceId === resource.id))
      .map((element) => element.id));
    const updated = current.map((element) => {
      if (element.isDeleted) return element;
      if (staleRelationshipIds.has(element.id)) return { ...element, isDeleted: true, version: (element.version || 0) + 1, versionNonce: Math.floor(Math.random() * 0x7fffffff), updated: Date.now() };
      const metadata = element.customData?.kubernetesManifestResource;
      if (metadata?.properties?.manifestResourceId !== resource.id) {
        if (!Array.isArray(element.boundElements) || !element.boundElements.some((bound) => staleRelationshipIds.has(bound.id))) return element;
        return { ...element, boundElements: element.boundElements.filter((bound) => !staleRelationshipIds.has(bound.id)), version: (element.version || 0) + 1, versionNonce: Math.floor(Math.random() * 0x7fffffff), updated: Date.now() };
      }
      const isTitle = element.type === "text" && String(element.text || "").startsWith(kind + "\n");
      const isDetails = element.type === "text" && String(element.text || "").startsWith("Namespace:");
      return {
        ...element,
        ...(isTitle ? { text: `${kind}\n${name}` } : {}),
        ...(isDetails ? { text: details } : {}),
        customData: {
          ...element.customData,
          kubernetesManifestResource: {
            ...metadata,
            resourceType: kind.toLowerCase(),
            properties: { ...metadata.properties, name, namespace, apiVersion, manifestResourceId: resource.id },
            manifest,
          },
        },
        version: (element.version || 0) + 1,
        versionNonce: Math.floor(Math.random() * 0x7fffffff),
        updated: Date.now(),
      };
    });
    // Rebuild the supported generated relationships from the current canvas manifests.
    // Keep card coordinates and authored connectors; only regenerate Kubernetes-tagged arrows.
    const liveElements = updated.filter((element) => !element.isDeleted);
    const cards = new Map();
    liveElements.forEach((element) => {
      const metadata = element.customData?.kubernetesManifestResource;
      const resourceId = metadata?.properties?.manifestResourceId;
      if (!resourceId || element.type !== "rectangle") return;
      cards.set(resourceId, {
        id: resourceId,
        kind: metadata.manifest?.kind || metadata.resourceType,
        name: metadata.manifest?.metadata?.name || metadata.properties?.name,
        namespace: metadata.manifest?.metadata?.namespace || metadata.properties?.namespace || "default",
        manifest: metadata.manifest || {},
        element,
      });
    });
    const allResources = [...cards.values()];
    const byName = (kind, name, namespace) => allResources.find((item) => item.kind === kind && item.name === name && item.namespace === (namespace || "default"));
    const matches = (selector, labels) => Boolean(selector && labels && Object.entries(selector).every(([key, value]) => labels[key] === value));
    const labelsFor = (item) => item.kind === "Pod" ? item.manifest.metadata?.labels
      : item.manifest.spec?.template?.metadata?.labels || item.manifest.spec?.selector?.matchLabels || {};
    const relationships = [];
    const addLink = (from, to, label, color = "#22a6b9") => {
      if (!from || !to || from.id === to.id || relationships.some((link) => link.from.id === from.id && link.to.id === to.id && link.label === label)) return;
      relationships.push({ from, to, label, color });
    };
    const workloads = allResources.filter((item) => ["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Pod", "Job", "CronJob"].includes(item.kind));
    const services = allResources.filter((item) => item.kind === "Service");
    services.forEach((service) => {
      const selector = service.manifest.spec?.selector;
      if (!selector || !Object.keys(selector).length) return;
      workloads.filter((workload) => workload.namespace === service.namespace && matches(selector, labelsFor(workload)))
        .forEach((workload) => addLink(service, workload, "routes to"));
    });
    allResources.filter((item) => item.kind === "Ingress").forEach((ingress) => {
      const names = new Set((ingress.manifest.spec?.rules || []).flatMap((rule) => (rule.http?.paths || []).map((path) => path.backend?.service?.name).filter(Boolean)));
      const defaultName = ingress.manifest.spec?.defaultBackend?.service?.name;
      if (defaultName) names.add(defaultName);
      names.forEach((serviceName) => addLink(ingress, byName("Service", serviceName, ingress.namespace), "routes to", "#9b78ef"));
    });
    allResources.filter((item) => item.kind === "Namespace").forEach((namespace) => {
      allResources.filter((item) => item.id !== namespace.id && item.namespace === namespace.name
        && ["Ingress", "Service", "Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Pod", "Job", "CronJob"].includes(item.kind))
        .forEach((item) => addLink(namespace, item, "contains", "#6e91c9"));
    });
    workloads.forEach((workload) => {
      const podSpec = workload.manifest.spec?.template?.spec || workload.manifest.spec || {};
      const refs = new Map();
      const remember = (resourceKind, resourceName) => { if (resourceName) refs.set(resourceKind + "/" + resourceName, resourceKind); };
      (podSpec.volumes || []).forEach((volume) => {
        remember("PersistentVolumeClaim", volume.persistentVolumeClaim?.claimName);
        remember("ConfigMap", volume.configMap?.name);
        remember("Secret", volume.secret?.secretName);
        (volume.projected?.sources || []).forEach((source) => { remember("ConfigMap", source.configMap?.name); remember("Secret", source.secret?.name); });
      });
      [...(podSpec.initContainers || []), ...(podSpec.containers || [])].forEach((container) => {
        (container.envFrom || []).forEach((entry) => { remember("ConfigMap", entry.configMapRef?.name); remember("Secret", entry.secretRef?.name); });
        (container.env || []).forEach((entry) => { remember("ConfigMap", entry.valueFrom?.configMapKeyRef?.name); remember("Secret", entry.valueFrom?.secretKeyRef?.name); });
      });
      refs.forEach((resourceKind, key) => {
        const resourceName = key.slice(resourceKind.length + 1);
        const target = byName(resourceKind, resourceName, workload.namespace);
        if (target) addLink(workload, target, resourceKind === "PersistentVolumeClaim" ? "mounts" : "uses", "#c59b4d");
      });
    });
    allResources.filter((item) => item.kind === "NetworkPolicy").forEach((policy) => {
      const selector = policy.manifest.spec?.podSelector?.matchLabels || {};
      workloads.filter((workload) => workload.namespace === policy.namespace && (!Object.keys(selector).length || matches(selector, labelsFor(workload))))
        .forEach((workload) => addLink(policy, workload, "applies to", "#b68bea"));
    });
    allResources.filter((item) => item.kind === "ServiceMonitor").forEach((monitor) => {
      const selector = monitor.manifest.spec?.selector?.matchLabels || {};
      services.filter((service) => service.namespace === monitor.namespace && (!Object.keys(selector).length || matches(selector, service.manifest.metadata?.labels || {})))
        .forEach((service) => addLink(monitor, service, "monitors", "#b68bea"));
    });
    allResources.filter((claim) => claim.kind === "PersistentVolumeClaim").forEach((claim) => {
      const volume = allResources.find((item) => item.kind === "PersistentVolume" && item.manifest.spec?.claimRef?.name === claim.name
        && (!item.manifest.spec.claimRef.namespace || item.manifest.spec.claimRef.namespace === claim.namespace));
      if (volume) addLink(claim, volume, "bound to", "#c59b4d");
    });
    workloads.forEach((workload) => {
      const podSpec = workload.manifest.spec?.template?.spec || workload.manifest.spec || {};
      const templateLabels = workload.manifest.spec?.template?.metadata?.labels || workload.manifest.metadata?.labels || {};
      const account = podSpec.serviceAccountName && byName("ServiceAccount", podSpec.serviceAccountName, workload.namespace);
      if (account) addLink(workload, account, "uses identity", "#b68bea");
      const hpa = allResources.find((item) => item.kind === "HorizontalPodAutoscaler" && item.namespace === workload.namespace
        && item.manifest.spec?.scaleTargetRef?.name === workload.name
        && (!item.manifest.spec.scaleTargetRef.kind || item.manifest.spec.scaleTargetRef.kind === workload.kind));
      if (hpa) addLink(hpa, workload, "scales", "#b68bea");
      const pdb = allResources.find((item) => item.kind === "PodDisruptionBudget" && item.namespace === workload.namespace
        && matches(item.manifest.spec?.selector?.matchLabels || {}, templateLabels));
      if (pdb) addLink(pdb, workload, "protects", "#b68bea");
      if (workload.kind === "CronJob") {
        const jobSpec = workload.manifest.spec?.jobTemplate?.spec?.template?.spec || {};
        const names = new Set([
          ...(jobSpec.volumes || []).flatMap((volume) => [volume.configMap?.name, volume.secret?.secretName, volume.persistentVolumeClaim?.claimName].filter(Boolean)),
          ...(jobSpec.containers || []).flatMap((container) => [
            ...(container.envFrom || []).flatMap((entry) => [entry.configMapRef?.name, entry.secretRef?.name].filter(Boolean)),
            ...(container.env || []).flatMap((entry) => [entry.valueFrom?.configMapKeyRef?.name, entry.valueFrom?.secretKeyRef?.name].filter(Boolean)),
          ]),
        ]);
        allResources.filter((item) => names.has(item.name) && item.namespace === workload.namespace && ["ConfigMap", "Secret", "PersistentVolumeClaim"].includes(item.kind))
          .forEach((item) => addLink(workload, item, item.kind === "PersistentVolumeClaim" ? "mounts" : "uses", "#c59b4d"));
      }
    });
    allResources.filter((binding) => ["RoleBinding", "ClusterRoleBinding"].includes(binding.kind)).forEach((binding) => {
      const roleRef = binding.manifest.roleRef;
      if (roleRef?.name) {
        const role = allResources.find((item) => item.kind === roleRef.kind && item.name === roleRef.name
          && (binding.kind === "ClusterRoleBinding" || item.namespace === binding.namespace));
        if (role) addLink(binding, role, "grants role", "#b68bea");
      }
      (binding.manifest.subjects || []).filter((subject) => subject.kind === "ServiceAccount").forEach((subject) => {
        const account = byName("ServiceAccount", subject.name, subject.namespace || binding.namespace);
        if (account) addLink(binding, account, "binds identity", "#b68bea");
      });
    });
    const relationshipArrows = relationships.map(({ from, to, label, color }) => {
      const source = from.element;
      const target = to.element;
      const sx = source.x + source.width / 2;
      const sy = source.y + source.height / 2;
      const tx = target.x + target.width / 2;
      const ty = target.y + target.height / 2;
      const dx = tx - sx;
      const dy = ty - sy;
      const sourceScale = 1 / Math.max(Math.abs(dx) / Math.max(source.width / 2, 1), Math.abs(dy) / Math.max(source.height / 2, 1), 1);
      const targetScale = 1 / Math.max(Math.abs(dx) / Math.max(target.width / 2, 1), Math.abs(dy) / Math.max(target.height / 2, 1), 1);
      const startPoint = { x: sx + dx * sourceScale, y: sy + dy * sourceScale };
      const endPoint = { x: tx - dx * targetScale, y: ty - dy * targetScale };
      const x = Math.min(startPoint.x, endPoint.x);
      const y = Math.min(startPoint.y, endPoint.y);
      const id = `k8s-link-${Math.random().toString(36).slice(2, 13)}`;
      source.boundElements = [...(source.boundElements || []), { id, type: "arrow" }];
      target.boundElements = [...(target.boundElements || []), { id, type: "arrow" }];
      return {
        id, type: "arrow", x, y, width: Math.abs(endPoint.x - startPoint.x), height: Math.abs(endPoint.y - startPoint.y),
        points: [[startPoint.x - x, startPoint.y - y], [endPoint.x - x, endPoint.y - y]],
        start: { id: source.id }, end: { id: target.id },
        startBinding: { elementId: source.id, focus: 0, gap: 8 }, endBinding: { elementId: target.id, focus: 0, gap: 8 },
        strokeColor: color, strokeWidth: 2, roughness: 0, endArrowhead: "triangle",
        customData: { kubernetesRelationship: { fromResourceId: from.id, toResourceId: to.id, label } },
        label: { text: label, fontSize: 11 },
        version: 1, versionNonce: Math.floor(Math.random() * 0x7fffffff), updated: Date.now(), isDeleted: false,
        fillStyle: "solid", strokeStyle: "solid", roundness: { type: 2 }, opacity: 100, angle: 0,
        groupIds: [], frameId: null, boundElements: null, link: null, locked: false,
      };
    });
    const finalElements = [...updated, ...relationshipArrows];
    api.updateScene({ elements: finalElements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    queueSketchSave(api.getSceneElementsIncludingDeleted?.() || api.getSceneElements?.() || finalElements, api.getAppState?.() || {});
    showToast(`Updated ${kind}/${name} and rebuilt ${relationshipArrows.length} generated Kubernetes relationships.`);
  }, [collaborationCanEdit, queueSketchSave, showToast]);

  const createKubernetesDiagram = useCallback(async (resources, { appendToCanvas = false } = {}) => {
    const api = apiRef.current;
    if (!api?.updateScene || !collaborationCanEdit) {
      showToast("The editor is not ready or you do not have permission to edit.", "error");
      return false;
    }
    if (!Array.isArray(resources) || !resources.length) {
      showToast("No Kubernetes resources were found in the YAML.", "error");
      return false;
    }

    const cardWidth = 284;
    const cardHeight = 132;
    const gapX = 92;
    const gapY = 78;
    const positions = new Map();
    const normalizedIconToken = (value) => String(value || "").toLowerCase().replace(/[^a-z0-9]/g, "");
    const iconAliases = {
      EndpointSlice: ["endpointslice", "endpoints"], PersistentVolumeClaim: ["persistentvolumeclaim", "pvc"],
      PersistentVolume: ["persistentvolume", "pv"], StorageClass: ["storageclass"], HorizontalPodAutoscaler: ["horizontalpodautoscaler", "hpa"],
      NetworkPolicy: ["networkpolicy"], ServiceAccount: ["serviceaccount"], ClusterRoleBinding: ["clusterrolebinding"],
      ClusterRole: ["clusterrole"], RoleBinding: ["rolebinding"], CustomResourceDefinition: ["customresourcedefinition", "crd"],
      PodSecurityPolicy: ["podsecuritypolicy"], ConfigMap: ["configmap"], CronJob: ["cronjob"],
      ResourceQuota: ["resourcequota"], LimitRange: ["limitrange"],
      ServiceMonitor: ["servicemonitor", "service"], PodDisruptionBudget: ["poddisruptionbudget", "pdb", "pod"], Deployment: ["deployment"], StatefulSet: ["statefulset"], DaemonSet: ["daemonset"],
      ReplicaSet: ["replicaset"], Service: ["service"], Ingress: ["ingress"], Pod: ["pod"], Namespace: ["namespace"],
      Secret: ["secret"], Job: ["job"], Node: ["node"], Role: ["role"],
    };
    const iconForKind = (kind) => {
      const tokens = new Set([normalizedIconToken(kind), ...(iconAliases[kind] || [])]);
      const candidates = kubernetesIcons.map((icon) => {
        const id = normalizedIconToken(String(icon.id || "").replace(/^k8s:/, ""));
        const name = normalizedIconToken(icon.name);
        const srcName = normalizedIconToken(String(icon.src || "").split(/[/?#]/).filter(Boolean).pop() || "");
        const category = normalizedIconToken(icon.category);
        const exact = tokens.has(id) || tokens.has(name) || tokens.has(srcName);
        const partial = [...tokens].some((token) => token.length >= 4 && (id.endsWith(token) || name === token || name.startsWith(token) || srcName === token || srcName.startsWith(token)));
        return { icon, score: exact ? 100 : partial ? 60 : category === "kubernetes" && [...tokens].some((token) => id.includes(token)) ? 30 : 0 };
      }).sort((a, b) => b.score - a.score);
      return candidates[0]?.score ? candidates[0].icon : null;
    };
    const layoutRank = (resource) => {
      const kind = resource.kind;
      if (kind === "Ingress" || kind === "Gateway" || kind === "HTTPRoute") return 0;
      if (kind === "Service") return 1;
      if (["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Pod", "Job", "CronJob"].includes(kind)) return 2;
      if (["PersistentVolumeClaim", "PersistentVolume", "StorageClass", "ConfigMap", "Secret", "ServiceAccount"].includes(kind)) return 3;
      if (["HorizontalPodAutoscaler", "PodDisruptionBudget", "NetworkPolicy"].includes(kind)) return 4;
      return 5;
    };
    const buckets = new Map();
    resources.forEach((resource) => {
      const rank = layoutRank(resource);
      if (!buckets.has(rank)) buckets.set(rank, []);
      buckets.get(rank).push(resource);
    });
    const resourcePositions = new Map();
    const maxPerRow = 4;
    let nextLayoutY = 90;
    [...buckets.entries()].sort((a, b) => a[0] - b[0]).forEach(([rank, items]) => {
      // Stable ordering makes regenerated diagrams easier to compare and groups
      // similarly named resources instead of following YAML document order.
      items.sort((a, b) => String(a.namespace || "default").localeCompare(String(b.namespace || "default"))
        || String(a.kind).localeCompare(String(b.kind))
        || String(a.name).localeCompare(String(b.name)));
      const rowCount = Math.ceil(items.length / maxPerRow);
      items.forEach((resource, index) => {
        const row = Math.floor(index / maxPerRow);
        const column = index % maxPerRow;
        const x = 120 + column * (cardWidth + gapX);
        const y = nextLayoutY + row * (cardHeight + 42);
        resourcePositions.set(resource.id, { x, y, rank, row, column });
        positions.set(resource.id, { x, y });
      });
      nextLayoutY += rowCount * (cardHeight + 42) + 84;
    });

    const iconAssets = await Promise.all(resources.map(async (resource) => {
      const { x, y } = positions.get(resource.id);
      const icon = iconForKind(resource.kind);
      if (!icon) return { resource, x, y, icon: null, fileId: null };
      try {
        const response = await fetch(icon.src, { cache: "force-cache" });
        if (!response.ok) throw new Error(`Kubernetes icon request failed (${response.status})`);
        const svg = await response.text();
        const dataURL = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
        const fileId = `k8s-import-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
        return { resource, x, y, icon, fileId, dataURL };
      } catch (error) {
        showToast(`Could not load the ${resource.kind} icon; using a labeled resource card instead.`, "warning");
        return { resource, x, y, icon, fileId: null };
      }
    }));

    const fileAssets = iconAssets.filter((asset) => asset.dataURL).map((asset) => ({
      id: asset.fileId, dataURL: asset.dataURL, mimeType: "image/svg+xml", created: Date.now(), lastRetrieved: Date.now(),
    }));
    if (fileAssets.length) api.addFiles(fileAssets);

    const nodes = [];
    const resourceRectangles = new Map();
    const resourceElementIds = new Map(resources.map((resource) => [resource.id, `k8s-resource-${Math.random().toString(36).slice(2, 13)}`]));
    const labelsMatch = (selector, labels) => selector && labels && Object.entries(selector).length > 0
      && Object.entries(selector).every(([key, value]) => labels[key] === value);
    iconAssets.forEach(({ resource, x, y, icon, fileId }) => {
      const manifest = resource.manifest || {};
      const spec = manifest.spec || {};
      const resourceElementId = resourceElementIds.get(resource.id);
      const resourceGroup = `k8s-import-${appendToCanvas ? resourceElementId : resource.id}`;
      const workloadKinds = ["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Pod", "Job", "CronJob"];
      const podSpec = resource.kind === "CronJob" ? spec.jobTemplate?.spec?.template?.spec
        : resource.kind === "Job" ? spec.template?.spec
        : ["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet"].includes(resource.kind) ? spec.template?.spec
        : spec;
      // Null-safe summaries: sparse manifests (empty containers, odd list shapes) must not crash diagram creation.
      const { images, ports, selector, hosts, dataKeys } = describeKubernetesResource(resource);
      const details = [
        `Namespace: ${resource.namespace || "default"}`,
        workloadKinds.includes(resource.kind) ? `Replicas: ${spec.replicas ?? (resource.kind === "DaemonSet" ? "node-managed" : 1)}` : "",
        images.length ? `Images: ${images.join(", ")}` : "",
        resource.kind === "Service" ? `Type: ${spec.type || "ClusterIP"}` : "",
        ports.length ? `Ports: ${ports.join(", ")}` : "",
        selector.length ? `Selector: ${selector.join(", ")}` : "",
        resource.kind === "Ingress" ? `Hosts: ${hosts.join(", ") || "default backend"}` : "",
        resource.kind === "ConfigMap" ? `Keys: ${dataKeys.join(", ")}` : "",
        resource.apiVersion || "",
      ].filter(Boolean).slice(0, 5).join("\n");
      const metadata = {
        provider: "kubernetes", resourceType: String(resource.kind || "resource").toLowerCase(),
        catalog: "kubernetes", importedFromYaml: !appendToCanvas,
        properties: { name: resource.name, namespace: resource.namespace || "default", apiVersion: resource.apiVersion, manifestResourceId: resource.id },
        manifest,
      };
      const resourceMetadata = appendToCanvas ? { kubernetesPracticeResource: metadata } : { kubernetesManifestResource: metadata };
      const resourceRectangle = {
        id: resourceElementId,
        type: "rectangle", x, y, width: cardWidth, height: cardHeight,
        boundElements: [],
        strokeColor: resource.kind === "Service" ? "#0891b2" : resource.kind === "Ingress" ? "#805ad5" : "#4779bf",
        backgroundColor: resource.kind === "Service" ? "#e6f8fb" : resource.kind === "Ingress" ? "#f1eaff" : "#eaf2ff",
        fillStyle: "solid", strokeWidth: 1.5, roughness: 0, roundness: { type: 3 },
        groupIds: [resourceGroup],
        customData: { diagramIcon: true, iconId: icon?.id || null, iconName: icon?.name || resource.kind, iconCategory: icon?.category || "Kubernetes", iconSource: "kubernetes", ...resourceMetadata },
      };
      resourceRectangles.set(resource.id, resourceRectangle);
      nodes.push(resourceRectangle);
      if (fileId) {
        nodes.push({
          type: "image", x: x + 16, y: y + 31, width: 52, height: 52, fileId,
          groupIds: [resourceGroup],
          customData: { diagramIcon: true, iconId: icon.id, iconName: icon.name, iconCategory: icon.category, iconSource: "kubernetes", ...resourceMetadata },
        });
      } else {
        nodes.push({
          type: "text", x: x + 16, y: y + 34, width: 66, height: 44, text: String(resource.kind).replace(/([a-z])([A-Z])/g, "$1 $2").split(/\s+/).map((part) => part.slice(0, 1)).join("").slice(0, 4).toUpperCase(),
          fontSize: 15, fontFamily: 2, textAlign: "center", verticalAlign: "middle", strokeColor: "#9fc5ff",
          groupIds: [resourceGroup], customData: { diagramIcon: true, iconSource: "kubernetes", ...resourceMetadata },
        });
      }
      nodes.push({
        type: "text", x: x + 82, y: y + 14, width: cardWidth - 98, height: 38,
        text: `${resource.kind}\n${resource.name}`, fontSize: 15, fontFamily: 2, textAlign: "left",
        verticalAlign: "top", strokeColor: "#182b45", backgroundColor: "transparent", autoResize: false,
        groupIds: [resourceGroup], customData: { diagramIcon: true, iconSource: "kubernetes", ...resourceMetadata },
      });
      nodes.push({
        type: "text", x: x + 82, y: y + 54, width: cardWidth - 98, height: 70,
        text: details, fontSize: 11, fontFamily: 2, textAlign: "left",
        verticalAlign: "top", strokeColor: "#475b73", backgroundColor: "transparent", autoResize: false,
        groupIds: [resourceGroup], customData: { diagramIcon: true, iconSource: "kubernetes", ...resourceMetadata },
      });
    });

    const edges = [];
    const edgePairs = new Set();
    const addRelationship = (fromResource, toResource, label, color = "#22a6b9") => {
      if (!fromResource || !toResource || fromResource.id === toResource.id) return;
      const pairKey = `${fromResource.id}->${toResource.id}:${label}`;
      if (edgePairs.has(pairKey)) return;
      edgePairs.add(pairKey);
      const from = positions.get(fromResource.id);
      const to = positions.get(toResource.id);
      const fromElementId = resourceElementIds.get(fromResource.id);
      const toElementId = resourceElementIds.get(toResource.id);
      const fromRectangle = resourceRectangles.get(fromResource.id);
      const toRectangle = resourceRectangles.get(toResource.id);
      if (!from || !to || !fromElementId || !toElementId || !fromRectangle || !toRectangle) return;
      const fromCenter = { x: from.x + cardWidth / 2, y: from.y + cardHeight / 2 };
      const toCenter = { x: to.x + cardWidth / 2, y: to.y + cardHeight / 2 };
      const dx = toCenter.x - fromCenter.x;
      const dy = toCenter.y - fromCenter.y;
      if (Math.abs(dx) + Math.abs(dy) < 1) return;
      const fromScale = 1 / Math.max(Math.abs(dx) / (cardWidth / 2), Math.abs(dy) / (cardHeight / 2));
      const toScale = 1 / Math.max(Math.abs(dx) / (cardWidth / 2), Math.abs(dy) / (cardHeight / 2));
      const startPoint = { x: fromCenter.x + dx * fromScale, y: fromCenter.y + dy * fromScale };
      const endPoint = { x: toCenter.x - dx * toScale, y: toCenter.y - dy * toScale };
      const left = Math.min(startPoint.x, endPoint.x);
      const top = Math.min(startPoint.y, endPoint.y);
      const arrowId = `k8s-link-${Math.random().toString(36).slice(2, 13)}`;
      // Excalidraw requires both arrow bindings and reciprocal boundElements
      // on the resource cards; without both, moving a card leaves a detached line.
      fromRectangle.boundElements.push({ id: arrowId, type: "arrow" });
      toRectangle.boundElements.push({ id: arrowId, type: "arrow" });
      edges.push({
        id: arrowId,
        type: "arrow", x: left, y: top,
        width: Math.abs(endPoint.x - startPoint.x), height: Math.abs(endPoint.y - startPoint.y),
        points: [[startPoint.x - left, startPoint.y - top], [endPoint.x - left, endPoint.y - top]],
        // Skeleton API uses start/end IDs to create real Excalidraw bindings.
        start: { id: fromElementId },
        end: { id: toElementId },
        startBinding: { elementId: fromElementId, focus: 0, gap: 8 },
        endBinding: { elementId: toElementId, focus: 0, gap: 8 },
        strokeColor: color, strokeWidth: 2, roughness: 0, endArrowhead: "triangle",
        customData: { [appendToCanvas ? "kubernetesPracticeRelationship" : "kubernetesRelationship"]: { fromResourceId: fromResource.id, toResourceId: toResource.id, label } },
        label: { text: label, fontSize: 11 },
      });
    };
    const workloads = resources.filter((resource) => ["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Pod", "Job", "CronJob"].includes(resource.kind));
    const services = resources.filter((resource) => resource.kind === "Service");
    const ingressResources = resources.filter((resource) => resource.kind === "Ingress");
    services.forEach((service) => {
      const selector = service.manifest?.spec?.selector;
      if (selector && Object.keys(selector).length) {
        workloads.forEach((workload) => {
          const labels = workload.kind === "Pod"
            ? workload.manifest?.metadata?.labels
            : workload.manifest?.spec?.template?.metadata?.labels || workload.manifest?.spec?.selector?.matchLabels;
          // A Service only selects pods in its own namespace.
          if (workload.namespace === service.namespace && labelsMatch(selector, labels)) addRelationship(service, workload, "routes to");
        });
      }
    });
    ingressResources.forEach((ingress) => {
      // Supports networking.k8s.io/v1 backends (backend.service.name) and legacy serviceName,
      // tolerating null rules/paths instead of crashing.
      getIngressBackendServiceNames(ingress.manifest).forEach((name) => addRelationship(ingress, services.find((service) => service.name === name && service.namespace === ingress.namespace), "routes to", "#9b78ef"));
      getIngressTlsSecretNames(ingress.manifest).forEach((secretName) => addRelationship(ingress, resources.find((resource) => resource.kind === "Secret" && resource.name === secretName && resource.namespace === ingress.namespace), "uses", "#9b78ef"));
    });
    resources.filter((resource) => resource.kind === "Namespace").forEach((namespace) => {
      // Namespace membership applies to every namespaced object, not just the
      // common networking and workload kinds. Omitted metadata.namespace means
      // the default namespace; cluster-scoped resources are deliberately excluded.
      const clusterScopedKinds = new Set([
        "Namespace", "Node", "PersistentVolume", "StorageClass", "ClusterRole",
        "ClusterRoleBinding", "CustomResourceDefinition",
      ]);
      resources.filter((resource) => resource.id !== namespace.id
        && !clusterScopedKinds.has(resource.kind)
        && (resource.manifest?.metadata?.namespace || "default") === namespace.name)
        .forEach((resource) => addRelationship(namespace, resource, "contains", "#6e91c9"));
    });
    resources.filter((resource) => resource.kind === "NetworkPolicy").forEach((policy) => {
      const selector = policy.manifest?.spec?.podSelector?.matchLabels || {};
      workloads.filter((workload) => workload.namespace === policy.namespace).forEach((workload) => {
        const labels = workload.kind === "Pod" ? workload.manifest?.metadata?.labels
          : workload.manifest?.spec?.template?.metadata?.labels || workload.manifest?.spec?.selector?.matchLabels;
        if (Object.keys(selector).length === 0 || labelsMatch(selector, labels)) addRelationship(policy, workload, "applies to", "#b68bea");
      });
    });
    resources.filter((resource) => resource.kind === "ServiceMonitor").forEach((monitor) => {
      const selector = monitor.manifest?.spec?.selector?.matchLabels || {};
      services.filter((service) => service.namespace === monitor.namespace).forEach((service) => {
        const labels = service.manifest?.metadata?.labels || {};
        if (Object.keys(selector).length === 0 || labelsMatch(selector, labels)) addRelationship(monitor, service, "monitors", "#b68bea");
      });
    });
    resources.filter((resource) => resource.kind === "PersistentVolumeClaim").forEach((claim) => {
      const volume = resources.find((resource) => resource.kind === "PersistentVolume"
        && resource.manifest?.spec?.claimRef?.name === claim.name
        && (!resource.manifest?.spec?.claimRef?.namespace || resource.manifest.spec.claimRef.namespace === claim.namespace));
      if (volume) addRelationship(claim, volume, "bound to", "#c59b4d");
      const storageClassName = claim.manifest?.spec?.storageClassName;
      if (storageClassName) {
        const storageClass = resources.find((resource) => resource.kind === "StorageClass" && resource.name === storageClassName);
        if (storageClass) addRelationship(claim, storageClass, "provisioned by", "#c59b4d");
      }
    });
    resources.filter((resource) => resource.kind === "StatefulSet").forEach((statefulSet) => {
      const serviceName = statefulSet.manifest?.spec?.serviceName;
      if (!serviceName) return;
      const service = services.find((candidate) => candidate.name === serviceName && candidate.namespace === statefulSet.namespace);
      if (service) addRelationship(statefulSet, service, "governed by", "#22a6b9");
    });
    resources.filter((resource) => resource.kind === "Pod" && resource.manifest?.spec?.nodeName).forEach((pod) => {
      const node = resources.find((candidate) => candidate.kind === "Node" && candidate.name === pod.manifest.spec.nodeName);
      if (node) addRelationship(pod, node, "runs on", "#6e91c9");
    });
    workloads.forEach((workload) => {
      const podSpec = workload.kind === "CronJob"
        ? workload.manifest?.spec?.jobTemplate?.spec?.template?.spec || {}
        : workload.manifest?.spec?.template?.spec || workload.manifest?.spec || {};
      const podTemplateLabels = workload.manifest?.spec?.template?.metadata?.labels || workload.manifest?.metadata?.labels || {};
      const referencedResources = new Map();
      const remember = (kind, name) => { if (name) referencedResources.set(kind + "/" + name, { kind, name }); };
      (podSpec.volumes || []).forEach((volume) => {
        remember("PersistentVolumeClaim", volume.persistentVolumeClaim?.claimName);
        remember("ConfigMap", volume.configMap?.name);
        remember("Secret", volume.secret?.secretName);
        (volume.projected?.sources || []).forEach((source) => {
          remember("ConfigMap", source.configMap?.name);
          remember("Secret", source.secret?.name);
        });
      });
      [...(podSpec.initContainers || []), ...(podSpec.containers || []), ...(podSpec.ephemeralContainers || [])].forEach((container) => {
        (container.envFrom || []).forEach((item) => {
          remember("ConfigMap", item.configMapRef?.name);
          remember("Secret", item.secretRef?.name);
        });
        (container.env || []).forEach((item) => {
          remember("ConfigMap", item.valueFrom?.configMapKeyRef?.name);
          remember("Secret", item.valueFrom?.secretKeyRef?.name);
        });
      });
      resources.filter((resource) => referencedResources.has(resource.kind + "/" + resource.name)
        && resource.namespace === workload.namespace
        && ["ConfigMap", "Secret", "PersistentVolumeClaim"].includes(resource.kind))
        .forEach((resource) => addRelationship(workload, resource, resource.kind === "PersistentVolumeClaim" ? "mounts" : "uses", "#c59b4d"));
      if (podSpec.serviceAccountName) {
        const account = resources.find((resource) => resource.kind === "ServiceAccount" && resource.name === podSpec.serviceAccountName && resource.namespace === workload.namespace);
        if (account) addRelationship(workload, account, "uses identity", "#b68bea");
      }
      const hpa = resources.find((resource) => resource.kind === "HorizontalPodAutoscaler"
        && resource.namespace === workload.namespace
        && resource.manifest?.spec?.scaleTargetRef?.name === workload.name
        && (!resource.manifest.spec.scaleTargetRef.kind || resource.manifest.spec.scaleTargetRef.kind === workload.kind));
      if (hpa) addRelationship(hpa, workload, "scales", "#b68bea");
      const pdb = resources.find((resource) => resource.kind === "PodDisruptionBudget"
        && resource.namespace === workload.namespace
        && labelsMatch(resource.manifest?.spec?.selector?.matchLabels, podTemplateLabels));
      if (pdb) addRelationship(pdb, workload, "protects", "#b68bea");
      if (workload.kind === "CronJob") {
        const jobTemplate = workload.manifest?.spec?.jobTemplate?.spec?.template?.spec || {};
        const cronReferences = new Set([
          ...(jobTemplate.volumes || []).flatMap((volume) => [volume.configMap?.name, volume.secret?.secretName, volume.persistentVolumeClaim?.claimName].filter(Boolean)),
          ...(jobTemplate.containers || []).flatMap((container) => [
            ...(container.envFrom || []).flatMap((item) => [item.configMapRef?.name, item.secretRef?.name].filter(Boolean)),
          ]),
        ]);
        resources.filter((resource) => cronReferences.has(resource.name) && resource.namespace === workload.namespace
          && ["ConfigMap", "Secret", "PersistentVolumeClaim"].includes(resource.kind))
          .forEach((resource) => addRelationship(workload, resource, "uses", "#c59b4d"));
      }
    });
    resources.filter((resource) => ["RoleBinding", "ClusterRoleBinding"].includes(resource.kind)).forEach((binding) => {
      const roleRef = binding.manifest?.roleRef;
      if (roleRef?.name) {
        const targetKind = roleRef.kind;
        const target = resources.find((resource) => resource.kind === targetKind && resource.name === roleRef.name
          && (binding.kind === "ClusterRoleBinding" || targetKind === "ClusterRole" || resource.namespace === binding.namespace));
        if (target) addRelationship(binding, target, "grants role", "#b68bea");
      }
      (binding.manifest?.subjects || []).filter((subject) => subject.kind === "ServiceAccount").forEach((subject) => {
        const account = resources.find((resource) => resource.kind === "ServiceAccount" && resource.name === subject.name
          && resource.namespace === (subject.namespace || binding.namespace));
        if (account) addRelationship(binding, account, "binds identity", "#b68bea");
      });
    });

    const existing = api.getSceneElementsIncludingDeleted?.() || api.getSceneElements?.() || [];
    if (appendToCanvas) {
      const drawings = existing.filter((element) => !element.isDeleted);
      if (drawings.length) {
        const [, top, right] = getCommonBounds(drawings);
        [...edges, ...nodes].forEach((element) => {
          element.x += right + gapX - 120;
          element.y += top - 90;
        });
      }
    }

    // Preserve authored element IDs so the arrow start/end references remain
    // valid when the skeletons are converted into fully qualified elements.
    const converted = convertToExcalidrawElements([...edges, ...nodes], { regenerateIds: false });
    const created = restoreElements(converted, null, { deleteInvisibleElements: true });

    // Reapply connector bindings after Excalidraw normalizes the imported
    // skeletons. This ensures the final restored elements reference the exact
    // IDs of the rectangle cards that are inserted into the scene.
    const createdById = new Map(created.map((element) => [element.id, element]));
    edges.forEach((edge) => {
      const arrow = createdById.get(edge.id);
      const startElement = createdById.get(edge.startBinding?.elementId);
      const endElement = createdById.get(edge.endBinding?.elementId);
      if (!arrow || !startElement || !endElement) return;
      arrow.startBinding = { elementId: startElement.id, focus: edge.startBinding?.focus ?? 0, gap: edge.startBinding?.gap ?? 8 };
      arrow.endBinding = { elementId: endElement.id, focus: edge.endBinding?.focus ?? 0, gap: edge.endBinding?.gap ?? 8 };
      startElement.boundElements = [
        ...(startElement.boundElements || []).filter((binding) => binding.id !== arrow.id),
        { id: arrow.id, type: "arrow" },
      ];
      endElement.boundElements = [
        ...(endElement.boundElements || []).filter((binding) => binding.id !== arrow.id),
        { id: arrow.id, type: "arrow" },
      ];
    });
    const importedResourceIds = new Set(appendToCanvas ? [] : existing.filter((element) => {
      const metadata = element.customData?.kubernetesManifestResource;
      return !element.isDeleted && Boolean(metadata?.importedFromYaml || metadata?.properties?.importedFromYaml);
    }).map((element) => element.customData?.kubernetesManifestResource?.properties?.manifestResourceId).filter(Boolean));
    const staleRelationshipIds = new Set(appendToCanvas ? [] : existing.filter((element) => {
      const relationship = element.customData?.kubernetesRelationship;
      return !element.isDeleted && element.type === "arrow" && relationship
        && (importedResourceIds.has(relationship.fromResourceId) || importedResourceIds.has(relationship.toResourceId));
    }).map((element) => element.id));
    const retained = appendToCanvas ? existing : existing.filter((element) => {
      if (element.isDeleted) return true;
      const metadata = element.customData?.kubernetesManifestResource;
      if (metadata?.importedFromYaml || metadata?.properties?.importedFromYaml) return false;
      if (staleRelationshipIds.has(element.id)) return false;
      return true;
    }).map((element) => {
      if (!Array.isArray(element.boundElements) || !element.boundElements.some((binding) => staleRelationshipIds.has(binding.id))) return element;
      return { ...element, boundElements: element.boundElements.filter((binding) => !staleRelationshipIds.has(binding.id)), version: (element.version || 0) + 1, versionNonce: Math.floor(Math.random() * 2147483647), updated: Date.now() };
    });
    api.updateScene({
      elements: [...retained, ...created],
      appState: { ...api.getAppState(), selectedElementIds: Object.fromEntries(created.map((element) => [element.id, true])) },
      captureUpdate: CaptureUpdateAction.IMMEDIATELY,
    });
    api.scrollToContent?.(created, { fitToContent: true, animate: true });
    queueSketchSave(api.getSceneElementsIncludingDeleted?.() || api.getSceneElements?.() || created, api.getAppState?.() || {});
    showToast(`Created Kubernetes diagram with ${resources.length} resources`);
    return true;
  }, [collaborationCanEdit, queueSketchSave, showToast]);

  const createComposeDiagram = useCallback(async (composeDocument) => {
    const api = apiRef.current;
    if (!api?.updateScene || !collaborationCanEdit) return;
    // Services declared without a body (`web:`) must not crash icon matching or card details.
    const services = Object.entries(composeDocument.services || {}).map(([name, service]) => [name, service && typeof service === "object" && !Array.isArray(service) ? service : {}]);
    if (!services.length) {
      showToast("Add at least one service before creating a diagram.", "error");
      return;
    }

    const layout = planComposeDiagram(composeDocument);
    const { positions, edges, resources, cardWidth, cardHeight, left, top, resourceWidth, resourceHeight } = layout;
    const skeleton = [];
    const projectName = composeDocument.name || "Docker Compose project";
    skeleton.push({
      type: "rectangle", x: left - 40, y: top - 90, width: layout.width, height: layout.height,
      strokeColor: "#64748b", backgroundColor: "transparent", fillStyle: "solid",
      strokeStyle: "dashed"
    });
    skeleton.push({ type: "text", x: left - 24, y: top - 68, text: "COMPOSE  /  " + projectName, fontSize: 18, fontFamily: 2, strokeColor: "#a7b6cb" });
    // Place arrows between card edges, not through their labels.
    edges.forEach(({ from, to }) => {
      const start = positions.get(from), end = positions.get(to);
      if (!start || !end) return;
      const rightward = end.x > start.x;
      const x1 = rightward ? start.x + cardWidth : start.x;
      const x2 = rightward ? end.x : end.x + cardWidth;
      const y1 = start.y + cardHeight / 2, y2 = end.y + cardHeight / 2;
      skeleton.push({
        type: "arrow", x: x1, y: y1, width: x2 - x1, height: y2 - y1,
        points: [[0, 0], [x2 - x1, y2 - y1]], strokeColor: "#8aa3c1", strokeWidth: 2,
        endArrowhead: "arrow"
      });
    });

    // Prefer recognizable artwork from Sketchizi's own icon catalogs. The
    // bundled service icons remain a fallback for services without a catalog match.
    const libraryIcons = [...eraserCatalog, ...awsIcons, ...kubernetesIcons, ...networkingIcons, ...umlIcons, ...mindMapIcons];
    const iconTermsForService = (name, service) => {
      const value = `${name} ${service.image || ""} ${service.build?.context || ""}`.toLowerCase();
      if (/postgres|postgresql/.test(value)) return ["postgres", "postgresql", "database", "sql"];
      if (/mysql|mariadb/.test(value)) return ["mysql", "mariadb", "database", "sql"];
      if (/mongo/.test(value)) return ["mongodb", "mongo", "document database"];
      if (/redis/.test(value)) return ["redis", "cache", "in-memory database"];
      if (/rabbitmq|kafka|queue|messaging/.test(value)) return ["rabbitmq", "message queue", "messaging", "kafka"];
      if (/prometheus|grafana|loki|monitor|observability/.test(value)) return ["prometheus", "grafana", "monitoring", "observability", "logging"];
      if (/traefik|nginx|haproxy|envoy|proxy|gateway|ingress/.test(value)) return ["nginx", "proxy", "load balancer", "gateway", "web server"];
      if (/node|frontend|web|ui/.test(value)) return ["node.js", "web application", "frontend", "web server", "application"];
      if (/docker|container/.test(value)) return ["docker", "container"];
      return [name.toLowerCase(), "server", "application", "container"];
    };
    const findLibraryIcon = (name, service) => {
      const terms = iconTermsForService(name, service);
      let best = null;
      let bestScore = 0;
      for (const icon of libraryIcons) {
        if (!icon?.src || typeof icon.src !== "string") continue;
        const haystack = [icon.name, icon.id, icon.category, icon.subtitle, ...(icon.tags || []), ...(icon.searchAliases || [])].filter(Boolean).join(" ").toLowerCase();
        let score = 0;
        for (const term of terms) {
          if (haystack === term) score += 12;
          else if (haystack.includes(term)) score += term.length > 5 ? 5 : 2;
        }
        if (score > bestScore) { best = icon; bestScore = score; }
      }
      return bestScore ? best : null;
    };
    const fallbackIconForService = (service) => {
      const image = String(service.image || service.build?.context || "").toLowerCase();
      if (image.includes("nginx")) return "/icons/web-server.svg";
      if (image.includes("node")) return "/icons/node.svg";
      if (image.includes("postgres")) return "/icons/postgres.svg";
      if (image.includes("redis")) return "/icons/redis.svg";
      if (image.includes("mysql")) return "/icons/mysql.svg";
      if (image.includes("mariadb")) return "/icons/mariadb.svg";
      if (image.includes("mongo")) return "/icons/mongodb.svg";
      if (image.includes("rabbitmq")) return "/icons/queue.svg";
      if (image.includes("traefik") || image.includes("haproxy") || image.includes("envoy")) return "/icons/proxy.svg";
      if (image.includes("prometheus") || image.includes("grafana")) return "/icons/monitoring.svg";
      if (image.includes("docker")) return "/icons/docker.svg";
      return "/icons/container.svg";
    };
    const serviceIconSources = new Map(services.map(([name, service]) => {
      const libraryIcon = findLibraryIcon(name, service);
      return [name, libraryIcon?.src || fallbackIconForService(service)];
    }));
    const iconAssets = new Map();
    await Promise.all(services.map(async ([name]) => {
      const source = serviceIconSources.get(name);
      if (iconAssets.has(source)) return;
      try {
        if (source.startsWith("data:image/")) {
          iconAssets.set(source, { fileId: `compose-icon-${iconAssets.size}`, dataURL: source, mimeType: source.match(/^data:([^;,]+)/)?.[1] || "image/svg+xml" });
          return;
        }
        const response = await fetch(source);
        if (!response.ok) return;
        const blob = await response.blob();
        const dataURL = await new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        });
        iconAssets.set(source, {
          fileId: "compose-icon-" + iconAssets.size,
          dataURL,
          mimeType: blob.type || "image/svg+xml"
        });
      } catch {
        // The diagram can still be generated if an optional icon fails to load.
      }
    }));
    if (iconAssets.size && typeof api.addFiles === "function") {
      api.addFiles(Array.from(iconAssets.values()).map((asset) => ({
        id: asset.fileId,
        dataURL: asset.dataURL,
        mimeType: asset.mimeType || "image/svg+xml",
        created: Date.now()
      })));
    }

    // Explicit text elements avoid Excalidraw label-theme overrides and allow reliable contrast.
    const addText = (x, y, text, fontSize, color, width = 240) => skeleton.push({
      type: "text", x, y, text, fontSize, fontFamily: 2, strokeColor: color,
      width, textAlign: "left"
    });
    services.forEach(([name, service]) => {
      const { x, y } = positions.get(name);
      const iconAsset = iconAssets.get(serviceIconSources.get(name));
      const details = composeCardDetails(service);
      skeleton.push({
        type: "rectangle", x, y, width: cardWidth, height: cardHeight,
        strokeColor: "#6685bd", backgroundColor: "#18263b", fillStyle: "solid",
        strokeWidth: 2, roundness: { type: 3 }
      });
      skeleton.push({ type: "line", x: x + 12, y: y + 41, width: cardWidth - 24, height: 0, points: [[0, 0], [cardWidth - 24, 0]], strokeColor: "#344b68", strokeWidth: 1 });
      addText(x + 16, y + 13, name, 20, "#f1f5ff", cardWidth - 76);
      details.forEach((detail, index) => addText(x + 16, y + 50 + index * 23, detail, 13, "#c1d1e9", cardWidth - 32));
      if (iconAsset) skeleton.push({
        type: "image", x: x + cardWidth - 43, y: y + 8,
        width: 28, height: 28, fileId: iconAsset.fileId, status: "saved", scale: [1, 1]
      });
    });
    // Resource membership is a real relationship: connect each network or named
    // volume to its members, with thin orthogonal paths behind the resource cards.
    resources.forEach((resource) => {
      const pos = layout.resourcePositions.get(resource.kind + ":" + resource.name);
      if (!pos) return;
      const resourceCenterX = pos.x + resourceWidth / 2;
      resource.members.forEach((member) => {
        const servicePos = positions.get(member);
        if (!servicePos) return;
        const startX = servicePos.x + cardWidth / 2;
        const startY = servicePos.y + cardHeight;
        const endY = pos.y;
        const midY = startY + Math.max(14, (endY - startY) / 2);
        skeleton.push({
          type: "line", x: startX, y: startY, width: resourceCenterX - startX, height: endY - startY,
          points: [[0, 0], [0, midY - startY], [resourceCenterX - startX, midY - startY], [resourceCenterX - startX, endY - startY]],
          strokeColor: resource.kind === "VOLUME" ? "#2dd4bf" : "#38bdf8", strokeWidth: 1.5, strokeStyle: resource.kind === "VOLUME" ? "solid" : "dashed"
        });
      });
    });
    resources.forEach((resource) => {
      const pos = layout.resourcePositions.get(resource.kind + ":" + resource.name);
      if (!pos) return;
      const { x, y } = pos;
      const accent = resource.kind === "VOLUME" ? "#2dd4bf" : "#38bdf8";
      skeleton.push({
        type: "rectangle", x, y, width: resourceWidth, height: resourceHeight,
        strokeColor: accent, backgroundColor: "#142b39",
        fillStyle: "solid", strokeWidth: 1, roundness: { type: 3 }
      });
      addText(x + 12, y + 9, resource.kind + " · " + resource.name, 13, "#e2f3ff", resourceWidth - 24);
      addText(x + 12, y + 35, resource.members.join(" · "), 12, "#a6c8da", resourceWidth - 24);
    });

    // Excalidraw inverts element colors in dark mode. Pre-invert our authored
    // palette so the visible diagram keeps its intended dark cards and light text.
    const invertHex = (value) => {
      if (typeof value !== "string" || !/^#[0-9a-f]{6}$/i.test(value)) return value;
      return "#" + [1, 3, 5].map((index) => (255 - parseInt(value.slice(index, index + 2), 16)).toString(16).padStart(2, "0")).join("");
    };
    if (api.getAppState?.().theme === "dark") {
      skeleton.forEach((element) => {
        if (element.type === "image") return;
        element.strokeColor = invertHex(element.strokeColor);
        element.backgroundColor = invertHex(element.backgroundColor);
      });
    }
    // Tag generated cards so the Smart Studio pill can recognise a Compose board.
    skeleton.forEach((element) => {
      element.customData = { ...(element.customData || {}), composeDiagram: true };
    });
    const elements = convertToExcalidrawElements(skeleton);
    api.updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    api.scrollToContent?.(elements, { fitToContent: true, animate: true });
    setDockerStudioOpen(false);
    showToast("Compose architecture diagram created. Select any element to edit it.");
  }, [collaborationCanEdit, showToast]);

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
      onOpenKubernetesStudio={() => { togglePanel("more-tools"); setKubernetesStudioOpen(true); }}
      onOpenDockerComposeStudio={() => { togglePanel("more-tools"); setDockerStudioOpen(true); }}
      onOpenIconLibrary={() => { togglePanel("more-tools"); if (!libraryOpen) togglePanel("icon-library"); requestAnimationFrame(() => searchRef.current?.focus()); }}
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

  useEffect(() => registerExportStudioShortcut({ openExportStudio: () => setExportStudioOpen(true) }), []);

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
    // The Map is hidden in Zen Mode: drop any pin, including one requested
    // while Zen is active (M key, command palette).
    if (isZenMode && minimapOpen) setMinimapOpen(false);
  }, [isZenMode, minimapOpen]);
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
        workspaceMode={canvasTabsReady ? getWorkspaceTabMode(canvasTabs.find(tab => tab.id === activeCanvasId)) : canvasPageContext.mode}
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
        onPageContextChange={handlePageContextChange}
        onWorkspaceModeChange={handleWorkspaceModeChange}
        onDeleteOnlyPage={handleDeleteOnlyPagesNotebook}
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
        onOpenExportStudio={() => setExportStudioOpen(true)}
        onOpenTemplates={() => setDesignStudioOpen(true)}
        onToggleMinimap={() => setMinimapOpen((o) => !o)}
        minimapOpen={minimapOpen}
        isZenMode={isZenMode}
        canvasTabs={canvasTabs.map((tab) => { const type = getWorkspaceTabMode(tab, activeCanvasId, canvasPageContext.mode); return { ...tab, type, syncMeta: getTabCloudMeta(tab, tab.id === activeCanvasId ? { dirty: documentDirty, cloudSaveState } : null) }; }).flatMap((tab) => tab.todoTabOpen ? [tab, { id: `todo:${tab.id}`, name: "Todo", isTodoTab: true, canvasId: tab.id, type: "canvas" }] : [tab])}
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
        onTogglePinCanvasTab={togglePinCanvasTab}
        tabSwitcher={tabSwitcher}
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
              searchRef={searchRef} search={search} setSearch={setSearch} initialSource={iconLibraryInitialSource}
              activeCategory={activeCategory} setActiveCategory={setActiveCategory} activeAwsCategory={activeAwsCategory} setActiveAwsCategory={setActiveAwsCategory} activeKubernetesCategory={activeKubernetesCategory} setActiveKubernetesCategory={setActiveKubernetesCategory}
              favorites={favorites} recentIcons={recentIcons} eraserCatalog={eraserCatalog}
              eraserSyncing={eraserSyncing} eraserSyncProgress={eraserSyncProgress}
              eraserSyncError={eraserSyncError} syncEraserLibrary={syncEraserLibrary} eraserCachedCount={eraserCachedCount}
              connectionMode={connectionMode} activateArrowTool={activateArrowTool}
              activateSelectionTool={activateSelectionTool} remoteLoading={remoteLoading}
              visibleIcons={visibleIcons} umlIcons={umlIcons} mindMapIcons={mindMapIcons} networkingIcons={networkingIcons} awsIcons={awsIcons} awsCategories={awsCategories} awsCategoryCounts={awsCategoryCounts} awsCategoryRepresentatives={awsCategoryRepresentatives} awsCatalogLogo={AWS_CATALOG_LOGO} awsCatalogLogoDark={AWS_CATALOG_LOGO_DARK} kubernetesIcons={kubernetesIcons} kubernetesCategories={kubernetesCategories} kubernetesCategoryCounts={kubernetesCategoryCounts} kubernetesCategoryRepresentatives={kubernetesCategoryRepresentatives} iconDisplayLimit={iconDisplayLimit}
              setIconDisplayLimit={setIconDisplayLimit} iconListRef={iconListRef}
              draggingIcon={draggingIcon} handleIconClick={iconAssignmentTarget ? assignSystemDesignNodeIcon : handleIconClick}
              assignmentMode={Boolean(iconAssignmentTarget)} assignmentTargetLabel={iconAssignmentTarget?.nodeLabel || ""} onCancelAssignment={closeIconLibrary}
              handleIconPointerDown={handleIconPointerDown} handleIconMouseDown={handleIconMouseDown} handleDragStart={handleDragStart} createStarterMindMap={createStarterMindMap}
              isFavorite={isFavorite} toggleFavorite={toggleFavorite} remoteError={remoteError}
              iconLibraryPinned={isIconLibraryPinned} setIconLibraryPinned={setIconLibraryPinned}
              onClose={closeIconLibrary}
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
            storageMode={resolveStorageMode({ cloudActive: cloudSessionRef.current.active, detached: cloudDetached })}
            nativeMenuOpen={nativeMenuOpen}
            savedSketch={savedSketch}
            isDarkTheme={isDarkTheme}
            pageContext={{ ...canvasPageContext, mode: (canvasTabsReady ? getWorkspaceTabMode(canvasTabs.find(tab => tab.id === activeCanvasId)) : canvasPageContext.mode) === "pages" ? "pages" : "infinite" }}
            key={activeCanvasId}
            canvasId={activeCanvasId}
            onToolStyleChange={toolStyles.recordToolStyle}
            todoItems={canvasTabs.find((tab) => tab.id === activeCanvasId)?.todoItems || []}
            onTodoItemsChange={updateCanvasTodoItems}
            onOpenTodoTab={openTodoTab}
            handleExcalidrawAPI={handleExcalidrawAPI}
            handleChange={handleThemeAwareExcalidrawChange}
            handleDrop={handleDrop}
            showToast={showToast}
            apiRef={apiRef}
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
          {systemDesign.enabled && <Suspense fallback={null}>
            <SystemDesignStudio workspace={systemDesign} onOpenIconLibrary={openSystemDesignIconLibrary} saveStatus={saveStatus} canvasTabs={canvasTabs} activeCanvasId={activeCanvasId} onSelectTab={selectWorkspaceTab} onCreateTab={createCanvasTab} isDarkTheme={isDarkTheme} />
          </Suspense>}
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
              <button type="button" className="startup-canvas-option startup-canvas-option-system-design" onClick={() => chooseStartupCanvas("system-design")}>
                <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="5" rx="1"/><rect x="3" y="16" width="6" height="5" rx="1"/><rect x="15" y="16" width="6" height="5" rx="1"/><path d="M12 8v4M6 16v-4h12v4"/></svg>
                <span>System Design</span>
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

      <Suspense fallback={null}>{exportStudioOpen && <ExportStudioModal isOpen={exportStudioOpen} onClose={() => setExportStudioOpen(false)} apiRef={apiRef} isDarkTheme={isDarkTheme} filename={(currentFile?.name || cloudDocumentName || "architecture-diagram").replace(/\.[^.]+$/, "")} />}</Suspense>

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

      {!isWelcomeOrDashboardOpen && canvasPageContext.mode !== "pages" && (
        <ZenHud
          isZenMode={isZenMode}
          onToggleZen={toggleZenMode}
          aiOpen={aiAskOpen}
          onToggleAi={toggleAiAsk}
          mapProps={{
            apiRef,
            pinned: minimapOpen,
            onTogglePinned: toggleMapPinned,
            onClose: closeMap,
            isDarkTheme,
            onViewportChange: markLocalViewportNavigation,
          }}
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
      {closeTabPrompt && createPortal(
        <div
          className={`canvas-tab-close-backdrop${isDarkTheme ? " theme-dark" : ""}`}
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
        </div>,
        document.body
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
      <CloudOptimizeModal prompt={cloudOptimizePrompt} isDarkTheme={isDarkTheme} onShrink={confirmCloudOptimize} onKeepLocal={keepCloudLocalOnly} />
      {cloudSaveDialogOpen && <CloudSaveDialog isDarkTheme={isDarkTheme} initialName={cloudSessionRef.current.active && !cloudDetached ? (cloudSessionRef.current.name || "Cloud diagram") : (currentFile?.name || "Untitled drawing")} onClose={() => setCloudSaveDialogOpen(false)} onSave={saveDrawingToCloud} />}
      {designStudioOpen && (
        <CreateDesignScreen
          isDarkTheme={isDarkTheme}
          onClose={() => setDesignStudioOpen(false)}
          onCreate={createDesignFromStudio}
        />
      )}
      {dockerStudioOpen && <DockerComposeStudio onClose={() => setDockerStudioOpen(false)} onCreateDiagram={createComposeDiagram} />}
      {kubernetesStudioOpen && <KubernetesStudio onClose={() => setKubernetesStudioOpen(false)} onCreateDiagram={createKubernetesDiagram} onApplyResourceYaml={applyKubernetesResourceYaml} />}
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
