import { planComposeDiagram, composeCardDetails } from "./features/docker-compose/composeDiagramLayout.js";
import { lazy, Suspense, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import IconLibraryPanel from "./IconLibraryPanel";
import PropertiesPanel from "./PropertiesPanel";
import ArchitectureValidationPanel from "./components/app/ArchitectureValidationPanel";
import { CaptureUpdateAction, convertToExcalidrawElements, getCommonBounds, restoreElements } from "@excalidraw/excalidraw";
import { usePanelState } from "./features/navigation/usePanelState";
import { useNativeSketchiziMenu } from "./features/navigation/useNativeSketchiziMenu";
import { useMoreTools } from "./features/navigation/useMoreTools";
import { useSketchiziPreferences } from "./features/navigation/useSketchiziPreferences";
import { getInitialThemeMode } from "./features/navigation/themePreference.js";
import { applyCanvasAppearance, getCanvasAppearanceFromBackground } from "./features/navigation/canvasAppearance.js";
import { useSketchiziEscape } from "./features/navigation/useSketchiziEscape";
import { useSketchPersistence } from "./features/persistence/useSketchPersistence";
import { useCollaboration } from "./features/collaboration/useCollaboration";
import { useFileManager } from "./features/files/useFileManager";
import { useIconCatalog } from "./features/icon-library/useIconCatalog";
import { umlIcons } from "./umlLibrary";
import { mindMapIcons } from "./mindMapLibrary";
import { awsIcons, awsCategories, awsCategoryCounts, awsCategoryRepresentatives, AWS_CATALOG_LOGO, AWS_CATALOG_LOGO_DARK } from "./awsArchitectureLibrary";
import { kubernetesIcons, kubernetesCategories, kubernetesCategoryCounts, kubernetesCategoryRepresentatives } from "./kubernetesArchitectureLibrary";
import { useCanvasTools } from "./features/canvas/useCanvasTools";
import { useMinimapController } from "./features/canvas/useMinimapController";
import { useExcalidrawScene } from "./features/canvas/useExcalidrawScene";
import SketchiziCanvas from "./components/app/SketchiziCanvas";
import "./styles/canvas-tab-close-dialog.css";
import CollaborationUI from "./components/app/CollaborationUI";
import MoreTools from "./components/app/MoreTools";
import { useIconInsertion } from "./features/icon-library/useIconInsertion";
import { useCommandPalette } from "./features/navigation/useCommandPalette";
import { useSketchiziExportLifecycle } from "./features/navigation/useSketchiziExportLifecycle";
import { createSketchiziCommandRegistry } from "./features/commands/commandRegistry";
const CreateDesignScreen = lazy(() => import("./features/design/ui/CreateDesignScreen.jsx"));
const DockerComposeStudio = lazy(() => import("./features/docker-compose/ui/DockerComposeStudio.jsx"));
const KubernetesStudio = lazy(() => import("./features/kubernetes-studio/ui/KubernetesStudio.jsx"));
import { createProfileForTemplate, createTemplateElements } from "./features/design/templates/templateRegistry.js";
import { withDesignProfile } from "./features/design/model/designDocument.js";
import { getAwsResourceDefinitionById } from "./awsResourceDefinitions";
import { getKubernetesResourceDefinitionById } from "./kubernetesResourceDefinitions";
import { applyKubernetesRelationshipSuggestion } from "./features/architecture/kubernetesDiagnosticFixService.js";
import { getNetworkingResourceDefinitionById } from "./networkingResourceDefinitions.js";
import { workspaceClient } from "./features/workspace/workspaceClient.js";
const CloudSaveDialog = lazy(() => import("./features/workspace/CloudSaveDialog.jsx"));
import { createCloudDocument, sanitizeCloudAppState } from "./features/workspace/cloudDocument.js";
import { hasCloudSceneChange, isActiveCloudSession } from "./features/workspace/cloudSavePolicy.js";
import { analyzeArchitectureGraph } from "./features/architecture/architectureGraphService";
import { validateArchitectureWithAwsRules } from "./features/architecture/architectureValidationComposition";
import { getSelectedAwsResource, updateAwsResource } from "./features/aws-resources/awsResourceService";
import { getSelectedKubernetesResource, updateKubernetesResource } from "./features/kubernetes-resources/kubernetesResourceService";
import { getSelectedNetworkingResource, updateNetworkingResource } from "./features/networking/networkingResourceService.js";
import { AWS_RELATIONSHIP_TYPES, getAwsRelationship, updateRelationshipType } from "./features/aws-relationships/awsRelationshipService";
import { KUBERNETES_RELATIONSHIP_TYPES, getKubernetesRelationship, getKubernetesRelationshipGuidance, updateKubernetesRelationshipMetadata } from "./features/kubernetes-relationships/kubernetesRelationshipService";
import CommandPalette from "./components/app/CommandPalette";
import DesktopAppHeader from "./components/app/DesktopAppHeader";
import CreateMenu from "./components/app/CreateMenu";
const ExportStudioModal = lazy(() => import("./components/app/ExportStudioModal"));
const ArchitectureTemplatesModal = lazy(() => import("./components/app/ArchitectureTemplatesModal"));
import AiAskPanel from "./features/ai/AiAskPanel.jsx";
import { startPeriodicBackendWarmup, wakeBackendOnPageLoad } from "./features/backend/backendWarmup.js";
import "./styles/ai-ask.css";
import "./features/design/design.css";
import "./features/workspace/workspace.css";
import "./styles/startup-canvas-chooser.css";
import { loadCanvasTabs, saveCanvasTabs } from "./persistence.js";
import "./styles/canvas-tabs.css";
import "./styles/canvas-tabs-dock.css";

function App() {
  const iconCatalog = useIconCatalog();
  const { activeCategory, setActiveCategory, activeAwsCategory, setActiveAwsCategory, activeKubernetesCategory, setActiveKubernetesCategory, search, setSearch, eraserCatalog, eraserSyncing, eraserSyncProgress, eraserSyncError, eraserCachedCount, remoteLoading, remoteError, favorites, recentIcons, searchRef, iconListRef, iconDisplayLimit, setIconDisplayLimit, visibleIcons, networkingIcons, syncEraserLibrary, isFavorite, toggleFavorite, markRecentlyUsed } = iconCatalog;
  const [connectionMode, setConnectionMode] = useState(false);
  const [aiAskOpen, setAiAskOpen] = useState(false);
  const [canvasPageContext, setCanvasPageContext] = useState({ mode: "infinite", page: null, pageCount: 0 });
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
  const [architectureValidation, setArchitectureValidation] = useState({ errors: [], warnings: [], info: [] });
  const architectureValidationSignatureRef = useRef("");
  const lastSelectionSignature = useRef("");
  const apiRef = useRef(null);
  const globalThemeRef = useRef(getInitialThemeMode() === "dark" ? "dark" : "light");
  const setCurrentFileRef = useRef(null);
  const [apiReady, setApiReady] = useState(false);
  const [canvasTabs, setCanvasTabs] = useState([{ id: "canvas-1", name: "Canvas 1", snapshot: null, dirty: false }]);
  const [closeTabPrompt, setCloseTabPrompt] = useState(null);
  const [activeCanvasId, setActiveCanvasId] = useState("canvas-1");
  const [canvasTabsReady, setCanvasTabsReady] = useState(false);
  const canvasTabsRef = useRef(canvasTabs);
  const activeCanvasIdRef = useRef("canvas-1");
  const canvasTabsRestoredRef = useRef(false);
  const canvasTabsSaveTimerRef = useRef(null);
  canvasTabsRef.current = canvasTabs;
  activeCanvasIdRef.current = activeCanvasId;
  const handleExcalidrawAPI = useCallback((api) => { apiRef.current = api || null; setApiReady(Boolean(api)); }, []);

  const [minimapOpen, setMinimapOpen] = useState(false);
  const [exportStudioOpen, setExportStudioOpen] = useState(false);
  const [templatesModalOpen, setTemplatesModalOpen] = useState(false);
  const [iconLibraryPinned, setIconLibraryPinned] = useState(false);
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

  const panelState = usePanelState({ apiRef, closeNativeMenu });
  const commandPalette = useCommandPalette({ closeNativeMenu });
  const { commandPaletteOpen, closeCommandPalette } = commandPalette;

  useEffect(() => {
    if (!nativeMenuOpen) return undefined;
    const closeOnEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      closeNativeMenu();
    };
    // Capture Escape before Excalidraw's own keyboard handlers so its native
    // menu closes without triggering a second canvas-level Escape action.
    window.addEventListener("keydown", closeOnEscape, true);
    return () => window.removeEventListener("keydown", closeOnEscape, true);
  }, [nativeMenuOpen, closeNativeMenu]);

  const { activePanel, setActivePanel, openPanel, togglePanel, closePanel, libraryOpen, propertiesOpen, moreToolsOpen, shortcutHelpOpen, architectureValidationOpen } = panelState;

  // The native hamburger menu and React-powered floating catalogs are mutually
  // exclusive. Opening the native menu dismisses any active catalog/panel.
  useEffect(() => {
    if (nativeMenuOpen && activePanel) setActivePanel(null);
  }, [nativeMenuOpen, activePanel, setActivePanel]);

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
  const persistence = useSketchPersistence({ apiRef, documentMetadataRef });
  const { savedSketch, setSavedSketch, sketchReady, storageError, setStorageError, saveStatus, saveTimerRef, queueSketchSave: queueLocalSketchSave, persistSketchNow, retryLocalSave, resetLocalSketch, downloadRecoveryBackup } = persistence;
  const cloudUrlParams = new URLSearchParams(window.location.search);
  const cloudDiagramId = cloudUrlParams.get("cloudDiagramId") || "";
  const cloudProjectId = cloudUrlParams.get("cloudProjectId") || "";
  const cloudSessionRef = useRef({ active: false, diagramId: "", projectId: "", revision: null, name: "" });
  const cloudSaveTimerRef = useRef(null);
  const cloudSaveQueueRef = useRef(Promise.resolve());
  const cloudFlushImmediatelyRef = useRef(false);
  const cloudLoadStartedRef = useRef(false);
  const cloudDetachedRef = useRef(false);
  const [cloudDetached, setCloudDetached] = useState(false);
  const cloudSceneReadyRef = useRef(false);
  const [cloudSaveState, setCloudSaveState] = useState({ state: cloudDiagramId ? "loading" : "inactive", error: "" });
  const cloudManualSaveRequestedRef = useRef(false);
  const [cloudDocumentName, setCloudDocumentName] = useState("Cloud diagram");
  const [cloudSaveDialogOpen, setCloudSaveDialogOpen] = useState(false);

  useEffect(() => {
    if (!nativeMenuOpen) return;
    // Keep the native hamburger menu mutually exclusive with modal and
    // floating tool surfaces that are opened outside usePanelState.
    if (
      aiAskOpen ||
      minimapOpen ||
      exportStudioOpen ||
      templatesModalOpen ||
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
    aiAskOpen,
    minimapOpen,
    exportStudioOpen,
    templatesModalOpen,
    designStudioOpen,
    dockerStudioOpen,
    kubernetesStudioOpen,
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
        const revision = session.revision;
        const result = await workspaceClient.saveDiagram(session.diagramId, revision, document);
        // An in-flight request can finish after detachment. Keep its result
        // from overwriting the status or revision of the new local drawing.
        if (!isActiveCloudSession(session, cloudSessionRef.current)) return;
        if (result && result.revision !== undefined && result.revision !== null) {
          session.revision = result.revision;
        } else if (typeof revision === "number") {
          session.revision = revision + 1;
        }
        setCloudSaveState({ state: "saved", error: "", lastSavedAt: Date.now() });
        if (cloudManualSaveRequestedRef.current) {
          cloudManualSaveRequestedRef.current = false;
          showToast("Saved to Cloud Workspace", "success");
        }
      }).catch((error) => {
        if (!isActiveCloudSession(session, cloudSessionRef.current)) return;
        const conflict = error?.status === 409 || error?.status === 412 || error?.code === "revision_conflict";
        cloudManualSaveRequestedRef.current = false;
        setCloudSaveState({
          state: conflict ? "conflict" : "error",
          error: conflict
            ? "This cloud diagram changed in another session. Reload the latest version before continuing; your current edits are still available to download as a backup."
            : error.message || "Could not save this cloud diagram.",
        });
      });
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

  useEffect(() => {
    if (!cloudDiagramId || !apiReady || !sketchReady || !canvasTabsReady || cloudLoadStartedRef.current || cloudSessionRef.current.active) return undefined;
    let cancelled = false;
    let readyFrame = 0;
    cloudLoadStartedRef.current = true;
    cloudSceneReadyRef.current = false;
    setCloudSaveState({ state: "loading", error: "" });
    workspaceClient.getDiagram(cloudDiagramId).then((result) => {
      if (cancelled) return;
      const diagram = result?.diagram || result;
      const document = diagram?.document || diagram?.content;
      if (!document || !Array.isArray(document.elements)) {
        throw new Error("The cloud diagram did not contain a valid Sketchizi document.");
      }
      const api = apiRef.current;
      if (!api?.updateScene) throw new Error("The editor is not ready to load this cloud diagram.");
      const elements = restoreElements(document.elements, null, { repairBindings: true });
      documentMetadataRef.current = {
        metadata: document.metadata || {},
        extensions: document.extensions || {},
        format: document.format || diagram.format || "excalidraw",
      };
      cloudDetachedRef.current = false;
      setCloudDetached(false);
      cloudSceneReadyRef.current = false;
      cloudSessionRef.current = {
        active: true,
        diagramId: diagram.id || cloudDiagramId,
        projectId: diagram.projectId || cloudProjectId,
        revision: diagram.revision ?? result?.revision ?? result?.version ?? 0,
        name: diagram.name || "Cloud diagram",
      };
      const loadedCloudName = diagram.name || "Cloud diagram";
      setCloudDocumentName(loadedCloudName);
      api.updateScene({
        elements,
        appState: { ...api.getAppState(), ...sanitizeCloudAppState(document.appState || {}), selectedElementIds: {}, selectedGroupIds: {}, selectedLinearElement: null },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      api.history?.clear?.();
      const files = Object.values(document.files || {});
      if (files.length) api.addFiles?.(files);
      setCurrentFileRef.current?.(null);
      setSavedSketch({ elements, appState: document.appState || {}, files: document.files || {}, metadata: document.metadata || {}, extensions: document.extensions || {}, format: document.format || diagram.format || "excalidraw" });
      const loadedSnapshot = {
        elements, appState: document.appState || {}, files: document.files || {},
        metadata: document.metadata || {}, extensions: document.extensions || {},
        format: document.format || diagram.format || "excalidraw", file: null,
        cloudSession: { ...cloudSessionRef.current }, cloudDetached: false,
        cloudSaveState: { state: "saved", error: "" }, cloudDocumentName: loadedCloudName,
      };
      const loadedTabs = canvasTabsRef.current.map((tab) => tab.id === activeCanvasIdRef.current
        ? { ...tab, name: loadedCloudName, snapshot: loadedSnapshot, dirty: false }
        : tab);
      canvasTabsRef.current = loadedTabs;
      setCanvasTabs(loadedTabs);
      saveCanvasTabs(loadedTabs).catch(() => {});
      if (elements.length) api.scrollToContent?.(elements, { fitToContent: true, animate: false });

      // Excalidraw can emit onChange callbacks after updateScene returns.
      // Keep the restoration guard active through the next paint so those
      // callbacks cannot start the normal React/persistence pipeline midway
      // through cloud hydration.
      readyFrame = window.requestAnimationFrame(() => {
        if (cancelled) return;
        cloudSceneReadyRef.current = true;
        setCloudSaveState({ state: "saved", error: "" });
      });
    }).catch((error) => {
      if (cancelled) return;
      cloudSessionRef.current.active = false;
      cloudSceneReadyRef.current = true;
      setCloudSaveState({ state: "error", error: error.message || "Could not load this cloud diagram." });
    });
    return () => {
      cancelled = true;
      if (readyFrame) window.cancelAnimationFrame(readyFrame);
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
      appState: appState || api?.getAppState?.() || {},
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
    };
  }, [apiRef, currentFileRef, getCurrentFileSceneSignature]);

  const persistCanvasTabs = useCallback((nextTabs) => {
    const normalizedTabs = nextTabs.map((tab) => ({ ...tab, active: tab.id === activeCanvasIdRef.current }));
    canvasTabsRef.current = normalizedTabs;
    setCanvasTabs(normalizedTabs);
    if (canvasTabsSaveTimerRef.current) window.clearTimeout(canvasTabsSaveTimerRef.current);
    canvasTabsSaveTimerRef.current = window.setTimeout(() => {
      canvasTabsSaveTimerRef.current = null;
      saveCanvasTabs(normalizedTabs).catch((error) => {
        logger.warn("Canvas tabs could not be saved", { category: "persistence", error });
      });
    }, 450);
  }, []);

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
      saveCanvasTabs(next).catch((error) => {
        logger.warn("Canvas tabs could not be saved", { category: "persistence", error });
      });
    }, 450);
  }, [captureCanvasTabSnapshot]);

  const applyCanvasTabSnapshot = useCallback((tab) => {
    const api = apiRef.current;
    if (!api?.updateScene) return;
    const snapshot = tab?.snapshot || {};
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
    api.updateScene({
      elements,
      appState: { ...api.getAppState(), ...(snapshot.appState || {}), theme: globalThemeRef.current, selectedElementIds: {}, selectedGroupIds: {}, selectedLinearElement: null },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    api.history?.clear?.();
    const files = Object.values(snapshot.files || {});
    if (files.length) api.addFiles?.(files);
    setSavedSketch(snapshot.elements ? { elements, appState: snapshot.appState || {}, files: snapshot.files || {}, metadata: snapshot.metadata || {}, extensions: snapshot.extensions || {}, format: snapshot.format || "excalidraw" } : null);
    setCurrentFile(snapshot.file || null, snapshot.fileSceneSignature || undefined);
    if (elements.length) api.scrollToContent?.(elements, { fitToContent: true, animate: false });
  }, [apiRef, setCurrentFile, setSavedSketch]);

  const switchCanvasTab = useCallback((nextId) => {
    if (!nextId || nextId === activeCanvasIdRef.current || !apiRef.current) return;
    const previousId = activeCanvasIdRef.current;
    const currentSnapshot = captureCanvasTabSnapshot();
    const currentTabs = canvasTabsRef.current.map((tab) => tab.id === previousId
      ? { ...tab, snapshot: currentSnapshot }
      : tab);
    const target = currentTabs.find((tab) => tab.id === nextId);
    if (!target) return;
    if (!cloudSessionRef.current.active || cloudDetachedRef.current) {
      retryLocalSave();
    } else {
      const session = cloudSessionRef.current;
      const api = apiRef.current;
      const cloudDocument = createCloudDocument({
        api,
        elements: currentSnapshot.elements,
        appState: currentSnapshot.appState,
        metadata: { metadata: currentSnapshot.metadata, extensions: currentSnapshot.extensions, format: currentSnapshot.format },
      });
      if (cloudSaveTimerRef.current) window.clearTimeout(cloudSaveTimerRef.current);
      cloudSaveTimerRef.current = null;
      cloudSaveQueueRef.current = cloudSaveQueueRef.current.catch(() => {}).then(async () => {
        const latest = await workspaceClient.getDiagram(session.diagramId);
        const latestDiagram = latest?.diagram || latest;
        const revision = latestDiagram?.revision ?? latest?.revision ?? latest?.version ?? session.revision;
        const result = await workspaceClient.saveDiagram(session.diagramId, revision, cloudDocument);
        session.revision = result?.revision ?? (typeof revision === "number" ? revision + 1 : revision);
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
    persistCanvasTabs(currentTabs);
    applyCanvasTabSnapshot(target);
  }, [apiRef, captureCanvasTabSnapshot, persistCanvasTabs, applyCanvasTabSnapshot, retryLocalSave, showToast]);

  const createCanvasTab = useCallback(() => {
    if (!apiRef.current) return;
    const currentSnapshot = captureCanvasTabSnapshot();
    const currentTabs = canvasTabsRef.current.map((tab) => tab.id === activeCanvasIdRef.current
      ? { ...tab, snapshot: currentSnapshot }
      : tab);
    const nextNumber = currentTabs.reduce((max, tab) => Math.max(max, Number(tab.name.match(/Canvas (\d+)/)?.[1] || 0)), 0) + 1;
    const id = `canvas-${Date.now()}`;
    const nextTab = {
      id, name: `Canvas ${nextNumber}`, dirty: false,
      snapshot: {
        elements: [], appState: { viewBackgroundColor: apiRef.current.getAppState?.().viewBackgroundColor },
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
      createCanvasTab();
    };
    window.addEventListener("keydown", createCanvasFromShortcut, true);
    return () => window.removeEventListener("keydown", createCanvasFromShortcut, true);
  }, [createCanvasTab]);

  const performCloseCanvasTab = useCallback((tabId) => {
    const currentTabs = canvasTabsRef.current;
    const tabIndex = currentTabs.findIndex((tab) => tab.id === tabId);
    if (tabIndex < 0 || currentTabs.length <= 1) return;
    const remainingTabs = currentTabs.filter((item) => item.id !== tabId);
    const isActive = tabId === activeCanvasIdRef.current;
    if (isActive) {
      const nextActive = currentTabs[tabIndex - 1] || remainingTabs[0];
      if (!nextActive) return;
      // Switching first captures and persists the live scene before removal.
      switchCanvasTab(nextActive.id);
    }
    persistCanvasTabs(remainingTabs);
    setCloseTabPrompt(null);
  }, [persistCanvasTabs, switchCanvasTab]);

  const closeCanvasTab = useCallback((tabId) => {
    const currentTabs = canvasTabsRef.current;
    const tab = currentTabs.find((item) => item.id === tabId);
    if (!tab || currentTabs.length <= 1) return;
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
    if (hasUnsavedChanges) {
      setCloseTabPrompt({ tabId, name: tab.name });
      return;
    }
    performCloseCanvasTab(tabId);
  }, [performCloseCanvasTab]);

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
        try {
          const result = await workspaceClient.getDiagram(session.diagramId);
          const diagram = result?.diagram || result;
          const document = diagram?.document || diagram?.content;
          if (!document || !Array.isArray(document.elements)) return tab;
          const name = diagram.name || session.name || tab.name;
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
          return tab;
        }
      }));
      if (cancelled) return;
      if (Array.isArray(stored) && stored.length) {
        const restoredTabs = refreshedTabs.length ? refreshedTabs : stored;
        const activeId = restoredTabs.find((tab) => tab.active)?.id || restoredTabs[0].id;
        const activeTab = restoredTabs.find((tab) => tab.id === activeId) || restoredTabs[0];
        canvasTabsRef.current = restoredTabs;
        setCanvasTabs(restoredTabs);
        activeCanvasIdRef.current = activeId;
        setActiveCanvasId(activeId);
        if (activeTab.snapshot) applyCanvasTabSnapshot(activeTab);
      } else {
        const initial = {
          id: "canvas-1", name: "Canvas 1", dirty: false,
          snapshot: captureCanvasTabSnapshot(),
        };
        canvasTabsRef.current = [initial];
        setCanvasTabs([initial]);
        saveCanvasTabs([initial]).catch(() => {});
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
          activeCanvasIdRef.current = existingCloudTab.id;
          setActiveCanvasId(existingCloudTab.id);
          cloudLoadStartedRef.current = true;
          applyCanvasTabSnapshot(existingCloudTab);
          saveCanvasTabs(focusedTabs).catch(() => {});
        } else {
          const api = apiRef.current;
          const nextCloudTab = {
          id: `cloud-${cloudDiagramId}-${Date.now()}`,
          name: "Cloud diagram",
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
        setActiveCanvasId(nextCloudTab.id);

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
      const initial = { id: "canvas-1", name: "Canvas 1", dirty: false, snapshot: captureCanvasTabSnapshot() };
      const nextTabs = cloudDiagramId ? [initial, {
        id: `cloud-${cloudDiagramId}-${Date.now()}`, name: "Cloud diagram", dirty: false,
        snapshot: { elements: [], appState: {}, files: {}, metadata: {}, extensions: {}, format: "excalidraw", file: null,
          cloudSession: { active: false, diagramId: "", projectId: "", revision: null, name: "" }, cloudDetached: true,
          cloudSaveState: { state: "inactive", error: "" }, cloudDocumentName: "Cloud diagram" },
      }] : [initial];
      canvasTabsRef.current = nextTabs;
      setCanvasTabs(nextTabs);
      if (cloudDiagramId) {
        activeCanvasIdRef.current = nextTabs[1].id;
        setActiveCanvasId(nextTabs[1].id);
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

  useEffect(() => {
    const flushCanvasTabs = () => {
      const snapshot = captureCanvasTabSnapshot();
      const latest = canvasTabsRef.current.map((tab) => tab.id === activeCanvasIdRef.current
        ? { ...tab, snapshot }
        : tab);
      canvasTabsRef.current = latest;
      saveCanvasTabs(latest).catch(() => {});
    };
    window.addEventListener("pagehide", flushCanvasTabs);
    return () => {
      window.removeEventListener("pagehide", flushCanvasTabs);
      if (canvasTabsSaveTimerRef.current) window.clearTimeout(canvasTabsSaveTimerRef.current);
    };
  }, [captureCanvasTabSnapshot]);

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

  const canvasTools = useCanvasTools({ apiRef, gridEnabled, setGridEnabled, gridSize, setGridSize, connectionMode, setConnectionMode, selectedConnector, setSelectedConnector, selectedElements, canEdit: collaborationCanEdit });
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
  const updateArchitectureValidation = useCallback((elements) => {
    const graph = analyzeArchitectureGraph(elements);
    const result = validateArchitectureWithAwsRules(graph);
    const signature = JSON.stringify(result);
    if (signature === architectureValidationSignatureRef.current) return;
    architectureValidationSignatureRef.current = signature;
    setArchitectureValidation(result);
  }, []);
  const applyKubernetesSuggestion = useCallback((diagnostic, relationshipType) => {
    if (!collaborationCanEdit) {
      showToast("You do not have permission to modify this diagram.", "error");
      return;
    }
    if (diagnostic?.provider !== "kubernetes") {
      showToast("Only Kubernetes relationship findings can be corrected here.", "error");
      return;
    }
    const api = apiRef.current;
    if (!api?.getSceneElements || !api?.updateScene) {
      showToast("The editor is not ready. Run validation again.", "error");
      return;
    }
    const confirmed = window.confirm(
      `Change this Kubernetes relationship to “${relationshipType}”? Only the relationship type will change. Resource IDs, endpoints and other metadata will be preserved.`,
    );
    if (!confirmed) return;

    const result = applyKubernetesRelationshipSuggestion(api.getSceneElements(), diagnostic, relationshipType);
    if (!result.changed) {
      showToast(result.error || "The correction could not be applied. Run validation again.", "error");
      return;
    }
    api.updateScene({ elements: result.elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    showToast(`Relationship updated to ${relationshipType}. Run validation again to verify the design.`);
  }, [collaborationCanEdit, showToast, eraserCatalog, networkingIcons]);

  const selectArchitectureDiagnostic = useCallback((diagnostic) => {
    const api = apiRef.current;
    if (!api || (!diagnostic?.relationshipId && !diagnostic?.resourceId)) return;

    const elements = api.getSceneElements();
    const target = elements.find((element) => {
      const metadata = diagnostic.relationshipId
        ? [
            { provider: "aws", entry: element.customData?.awsRelationship },
            { provider: "kubernetes", entry: element.customData?.kubernetesRelationship },
            { provider: "architecture", entry: element.customData?.architectureRelationship },
          ]
        : [
            { provider: "aws", entry: element.customData?.awsResource },
            { provider: "kubernetes", entry: element.customData?.kubernetesResource },
            { provider: "networking", entry: element.customData?.networkingResource },
          ];
      return metadata.some(({ provider, entry }) => {
        if (!entry) return false;
        if (diagnostic.provider && provider && provider !== diagnostic.provider) return false;
        return diagnostic.relationshipId
          ? entry.relationshipId === diagnostic.relationshipId
          : entry.awsResourceId === diagnostic.resourceId || entry.kubernetesResourceId === diagnostic.resourceId || entry.networkingResourceId === diagnostic.resourceId;
      });
    });

    if (!target) return;

    api.updateScene({
      appState: {
        ...api.getAppState(),
        selectedElementIds: { [target.id]: true },
        selectedGroupIds: {},
        selectedGroupForOperation: null,
      },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    api.scrollToContent?.([target], { fitToViewport: false, animate: true });
  }, []);
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
    activePanel,
    closePanel,
    commandPaletteOpen,
    closeCommandPalette,
    aiAskOpen,
    setAiAskOpen,
    minimapOpen,
    setMinimapOpen,
    nativeMenuOpen,
    closeNativeMenu,
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
  useSketchiziExportLifecycle({ apiRef, showToast, closeExportDialog });
  useEffect(() => {
    if (!collaborationCanEdit && libraryOpen) closePanel("icon-library");
  }, [closePanel, collaborationCanEdit, libraryOpen]);
  const preferences = useSketchiziPreferences({
    apiRef, apiReady, closePanel, openPanel, togglePanel, activePanel, connectionMode, selectedCount, toggleGrid,
    activateSelectionTool, setMinimapOpen, searchRef, saveTimerRef, fileActionsRef, setStorageError, sketchReady, savedSketch, canEdit: collaborationCanEdit,
    canvasAppearance, setCanvasAppearance,
  });
  const { themeMode, setThemeMode, isDarkTheme } = preferences;
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
    if (appearance === "clean") preferences.useThemeDefaultBackground();
    else applyCanvasAppearance(apiRef.current, appearance, isDarkTheme);
  }, [collaborationCanEdit, isDarkTheme, preferences.useThemeDefaultBackground]);
  const commands = createSketchiziCommandRegistry({
    apiRef,
    canEdit: collaborationCanEdit,
    selectedCount,
    themeMode,
    setThemeMode,
    gridEnabled,
    toggleGrid,
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
    openExportStudio: () => setExportStudioOpen(true),
  });
  useNativeSketchiziMenu({ apiRef, fileActionsRef, currentFolder, currentFolderFiles, recentFiles, recentFolders, refreshCurrentFolderFiles, handleFileError, useThemeDefaultBackground: preferences.useThemeDefaultBackground, markCanvasBackgroundCustom: preferences.markCanvasBackgroundCustom });
  const handleExcalidrawChange = useExcalidrawScene({
    apiRef, nativeMenuOpenRef, setNativeMenuOpen, setActivePanel, lastSelectionSignature,
    setSelectedCount, setSelectedElements, setSelectedConnector, updateMinimap, queueSketchSave,
    collaborationRemoteUpdateRef, collaborationRef, canEdit: collaborationCanEdit,
    onArchitectureSceneChange: updateArchitectureValidation,
    onDocumentSceneChange: markCurrentDocumentChanged,
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
    if (cloudDiagramId && !cloudSceneReadyRef.current) return;

    // Excalidraw emits intermediate onChange snapshots for every freehand
    // pointer sample. Defer scene analysis, collaboration broadcasts, minimap
    // updates and persistence until the completed stroke callback arrives.
    // Keeping that work out of the pointer stream reduces pen latency.
    if (appState?.newElement?.type === "freedraw") return;
    syncStartupChooser(elements, false, appState);
    handleExcalidrawChange(elements, appState);
    persistActiveCanvasSnapshot(elements, appState);
    if (cloudSessionRef.current.active && !cloudDetachedRef.current) queueSketchSave(elements, appState);
  }, [cloudDiagramId, handleExcalidrawChange, persistActiveCanvasSnapshot, queueSketchSave, syncStartupChooser]);

  const chooseStartupCanvas = useCallback((mode) => {
    startupChoiceMadeRef.current = true;
    setStartupChooserOpen(false);
    window.dispatchEvent(new CustomEvent("sketchizi:choose-canvas-mode", { detail: { mode } }));
  }, []);

  useEffect(() => {
    const handleWorkspaceCanvasChoice = (event) => {
      const mode = event.detail?.mode;
      if (mode === "infinite" || mode === "pages") chooseStartupCanvas(mode);
    };
    window.addEventListener("sketchizi:workspace-canvas-choice", handleWorkspaceCanvasChoice);
    return () => window.removeEventListener("sketchizi:workspace-canvas-choice", handleWorkspaceCanvasChoice);
  }, [chooseStartupCanvas]);

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
    const images = (podSpec?.containers || []).map((container) => container.image).filter(Boolean).slice(0, 2);
    const ports = (spec.ports || []).map((port) => `${port.port}${port.targetPort ? `→${port.targetPort}` : ""}/${port.protocol || "TCP"}`).slice(0, 3);
    const selector = Object.entries(spec.selector?.matchLabels || spec.selector || {}).map(([key, value]) => `${key}=${value}`).slice(0, 2);
    const details = [
      `Namespace: ${namespace}`,
      workloadKinds.includes(kind) ? `Replicas: ${spec.replicas ?? (kind === "DaemonSet" ? "node-managed" : 1)}` : "",
      images.length ? `Images: ${images.join(", ")}` : "",
      kind === "Service" ? `Type: ${spec.type || "ClusterIP"}` : "",
      ports.length ? `Ports: ${ports.join(", ")}` : "",
      selector.length ? `Selector: ${selector.join(", ")}` : "",
      kind === "Ingress" ? `Hosts: ${(spec.rules || []).map((rule) => rule.host).filter(Boolean).slice(0, 2).join(", ") || "default backend"}` : "",
      kind === "ConfigMap" ? `Keys: ${Object.keys(manifest.data || {}).slice(0, 3).join(", ")}` : "",
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
      const images = (podSpec?.containers || []).map((container) => container.image).filter(Boolean).slice(0, 2);
      const ports = (spec.ports || []).map((port) => `${port.port}${port.targetPort ? `→${port.targetPort}` : ""}/${port.protocol || "TCP"}`).slice(0, 3);
      const selector = Object.entries(spec.selector?.matchLabels || spec.selector || {}).map(([key, value]) => `${key}=${value}`).slice(0, 2);
      const details = [
        `Namespace: ${resource.namespace || "default"}`,
        workloadKinds.includes(resource.kind) ? `Replicas: ${spec.replicas ?? (resource.kind === "DaemonSet" ? "node-managed" : 1)}` : "",
        images.length ? `Images: ${images.join(", ")}` : "",
        resource.kind === "Service" ? `Type: ${spec.type || "ClusterIP"}` : "",
        ports.length ? `Ports: ${ports.join(", ")}` : "",
        selector.length ? `Selector: ${selector.join(", ")}` : "",
        resource.kind === "Ingress" ? `Hosts: ${(spec.rules || []).map((rule) => rule.host).filter(Boolean).slice(0, 2).join(", ") || "default backend"}` : "",
        resource.kind === "ConfigMap" ? `Keys: ${Object.keys(manifest.data || {}).slice(0, 3).join(", ")}` : "",
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
          if (labelsMatch(selector, labels)) addRelationship(service, workload, "routes to");
        });
      }
    });
    ingressResources.forEach((ingress) => {
      const rules = ingress.manifest?.spec?.rules || [];
      const serviceNames = new Set(rules.flatMap((rule) => (rule.http?.paths || []).map((path) => path.backend?.service?.name).filter(Boolean)));
      const defaultName = ingress.manifest?.spec?.defaultBackend?.service?.name;
      if (defaultName) serviceNames.add(defaultName);
      serviceNames.forEach((name) => addRelationship(ingress, services.find((service) => service.name === name && service.namespace === ingress.namespace), "routes to", "#9b78ef"));
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
    const services = Object.entries(composeDocument.services || {});
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
    const elements = convertToExcalidrawElements(skeleton);
    api.updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    api.scrollToContent?.(elements, { fitToContent: true, animate: true });
    setDockerStudioOpen(false);
    showToast("Compose architecture diagram created. Select any element to edit it.");
  }, [collaborationCanEdit, showToast]);

  const workspaceToggle = (
    <CreateMenu
      onKubernetesStudio={() => setKubernetesStudioOpen(true)}
      onDockerStudio={() => setDockerStudioOpen(true)}
      onBeforeOpen={() => {
        if (nativeMenuOpen) closeNativeMenu();
        if (activePanel) setActivePanel(null);
      }}
      dismissWhen={Boolean(nativeMenuOpen || activePanel || aiAskOpen || designStudioOpen || dockerStudioOpen || kubernetesStudioOpen)}
    />
  );

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

  return (
    <div className={`${isDarkTheme ? "app theme-dark" : "app theme-light"} ${activePanel ? `panel-open-${activePanel === "icon-library" ? "library" : activePanel}` : ""} ${nativeMenuOpen ? "native-menu-open" : ""} ${aiAskOpen ? "ai-ask-open" : ""} canvas-first-header`} data-theme={isDarkTheme ? "dark" : "light"} data-open-panel={activePanel || "none"}>
      {cloudSessionRef.current.active && !cloudDetached && <div className={`cloud-editor-save-status cloud-editor-save-status-${cloudSaveState.state}`} role={["error", "conflict"].includes(cloudSaveState.state) ? "alert" : "status"}>
        <span>{cloudSaveState.state === "loading" ? "Loading cloud diagram…" : cloudSaveState.state === "pending" || cloudSaveState.state === "saving" ? "Saving to Cloud Workspace…" : cloudSaveState.state === "saved" ? "Saved to Cloud Workspace" : ["error", "conflict"].includes(cloudSaveState.state) ? cloudSaveState.error : ""}</span>
        {cloudSaveState.state === "error" && <>
          <button type="button" onClick={() => {
            const api = apiRef.current;
            if (!api) return;
            queueSketchSave(api.getSceneElementsIncludingDeleted?.() || api.getSceneElements?.() || [], api.getAppState?.() || {});
          }}>Retry save</button>
          <button type="button" onClick={downloadRecoveryBackup}>Download backup</button>
        </>}
        {cloudSaveState.state === "conflict" && <>
          <button type="button" onClick={downloadRecoveryBackup}>Download backup</button>
          <button type="button" onClick={() => window.location.reload()}>Reload latest version</button>
        </>}
        <button type="button" onClick={() => window.location.assign("/workspace")} aria-label="Return to Cloud Workspace">Cloud Workspace</button>
      </div>}
      <DesktopAppHeader
        commands={commands}
        gridEnabled={gridEnabled}
        gridStyle={gridStyle}
        canvasAppearance={canvasAppearance}
        onCanvasAppearanceChange={handleCanvasAppearanceChange}
        onToggleGrid={toggleGrid}
        onGridStyleChange={setGridStyle}
        openCommandPalette={commandPalette.openCommandPalette}
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
        onDownloadRecoveryBackup={downloadRecoveryBackup}
        onOpenExport={() => setExportStudioOpen(true)}
        onOpenTemplates={() => setDesignStudioOpen(true)}
        onToggleMinimap={() => setMinimapOpen((o) => !o)}
        minimapOpen={minimapOpen}
        canvasTabs={canvasTabs}
        activeCanvasId={activeCanvasId}
        onSelectCanvasTab={switchCanvasTab}
        onCreateCanvasTab={createCanvasTab}
        onReorderCanvasTabs={reorderCanvasTabs}
        onCloseCanvasTab={closeCanvasTab}
        workspaceToggle={workspaceToggle}
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
          onClick={() => setAiAskOpen((value) => !value)}
          title="AI Ask"
          aria-label="AI Ask"
          aria-expanded={aiAskOpen}
        >
          <span className="ai-ask-toggle-label">AI</span>
        </button>



      </DesktopAppHeader>

      <div className={`desktop-workspace ${collaborationCanEdit ? "desktop-workspace-editable" : "desktop-workspace-viewer"} ${libraryOpen ? "desktop-workspace-library-open" : "desktop-workspace-library-closed"} ${propertiesOpen || architectureValidationOpen ? "desktop-workspace-context-open" : "desktop-workspace-context-closed"}`}>
        {libraryOverlayHost && createPortal(
          <aside className={`desktop-resources-region sk-icon-library-portal-host ${libraryOpen ? "mobile-resource-open" : "mobile-resource-closed"}`} aria-label="Resources">
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
              iconLibraryPinned={iconLibraryPinned} setIconLibraryPinned={setIconLibraryPinned}
              onClose={() => closePanel("icon-library")}
            />
          )}
          </aside>,
          libraryOverlayHost,
        )}

        <section className="desktop-canvas-region" aria-label="Canvas workspace">
          <SketchiziCanvas
            nativeMenuOpen={nativeMenuOpen}
            savedSketch={savedSketch}
            isDarkTheme={isDarkTheme}
            pageContext={canvasPageContext}
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
          className={`desktop-context-region ${propertiesOpen || architectureValidationOpen ? "validation-state-open" : "validation-state-closed"}`}
          aria-label="Properties and architecture validation"
        >
          {(propertiesOpen || architectureValidationOpen) && (
            <div className={`desktop-validation-host ${propertiesOpen || architectureValidationOpen ? "is-open" : "is-closed"}`}>
              {propertiesOpen && (
                <PropertiesPanel
                  selectedCount={selectedCount}
                  propertiesOpen={propertiesOpen}
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
              {architectureValidationOpen && (
                <ArchitectureValidationPanel
                  validation={architectureValidation}
                  sceneElements={apiRef.current?.getSceneElements?.() || []}
                  onClose={() => closePanel("architecture-validation")}
                  onSelectDiagnostic={selectArchitectureDiagnostic}
                  onApplyKubernetesSuggestion={applyKubernetesSuggestion}
                  canApplyCorrections={collaborationCanEdit}
                />
              )}
            </div>
          )}
        </aside>
      </div>

      {startupChooserOpen && sketchReady && apiReady && !cloudDiagramId && collaborationCanEdit && (
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

      <AiAskPanel open={aiAskOpen} onClose={() => setAiAskOpen(false)} apiRef={apiRef} persistSketchNow={persistSketchNow} saveTimerRef={saveTimerRef} pageContext={canvasPageContext} />

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
              <span className="canvas-tab-close-eyebrow">UNSAVED CHANGES</span>
              <h2 id="canvas-tab-close-title">Close this canvas?</h2>
              <p className="canvas-tab-close-name">{closeTabPrompt.name}</p>
              <p id="canvas-tab-close-description">This canvas has changes that haven’t been saved yet. If you close it now, those changes may be lost.</p>
            </div>
            <div className="canvas-tab-close-dialog-actions">
              <button type="button" className="canvas-tab-close-keep" autoFocus onClick={() => setCloseTabPrompt(null)}>Keep editing</button>
              <button type="button" className="canvas-tab-close-confirm" onClick={() => performCloseCanvasTab(closeTabPrompt.tabId)}>Close tab</button>
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
      {dockerStudioOpen && <DockerComposeStudio onClose={() => setDockerStudioOpen(false)} onCreateDiagram={createComposeDiagram} />}
      {kubernetesStudioOpen && <KubernetesStudio onClose={() => setKubernetesStudioOpen(false)} onCreateDiagram={createKubernetesDiagram} onApplyResourceYaml={applyKubernetesResourceYaml} />}
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
