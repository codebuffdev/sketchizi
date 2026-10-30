import { useCallback, useEffect, useRef, useState } from "react";
import IconLibraryPanel from "./IconLibraryPanel";
import ArchitectureValidationPanel from "./components/app/ArchitectureValidationPanel";
import LayersPanel from "./components/app/LayersPanel";
import { CaptureUpdateAction, convertToExcalidrawElements, restoreElements } from "@excalidraw/excalidraw";
import { usePanelState } from "./features/navigation/usePanelState";
import { useNativeSketchiziMenu } from "./features/navigation/useNativeSketchiziMenu";
import { useMoreTools } from "./features/navigation/useMoreTools";
import { useSketchiziPreferences } from "./features/navigation/useSketchiziPreferences";
import { applyCanvasThemeBackground } from "./features/navigation/canvasTheme.js";
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
import CollaborationUI from "./components/app/CollaborationUI";
import MoreTools from "./components/app/MoreTools";
import { useIconInsertion } from "./features/icon-library/useIconInsertion";
import { useCommandPalette } from "./features/navigation/useCommandPalette";
import { useSketchiziExportLifecycle } from "./features/navigation/useSketchiziExportLifecycle";
import { createSketchiziCommandRegistry } from "./features/commands/commandRegistry";
import CreateDesignScreen from "./features/design/ui/CreateDesignScreen.jsx";
import DockerComposeStudio from "./features/docker-compose/ui/DockerComposeStudio.jsx";
import KubernetesStudio from "./features/kubernetes-studio/ui/KubernetesStudio.jsx";
import { createProfileForTemplate, createTemplateElements } from "./features/design/templates/templateRegistry.js";
import { withDesignProfile } from "./features/design/model/designDocument.js";
import { getAwsResourceDefinitionById } from "./awsResourceDefinitions";
import { getKubernetesResourceDefinitionById } from "./kubernetesResourceDefinitions";
import { applyKubernetesRelationshipSuggestion } from "./features/architecture/kubernetesDiagnosticFixService.js";
import { getNetworkingResourceDefinitionById } from "./networkingResourceDefinitions.js";
import { workspaceClient } from "./features/workspace/workspaceClient.js";
import CloudSaveDialog from "./features/workspace/CloudSaveDialog.jsx";
import { createCloudDocument, sanitizeCloudAppState } from "./features/workspace/cloudDocument.js";
import { analyzeArchitectureGraph } from "./features/architecture/architectureGraphService";
import { validateArchitectureWithAwsRules } from "./features/architecture/architectureValidationComposition";
import { getSelectedAwsResource, updateAwsResource } from "./features/aws-resources/awsResourceService";
import { getSelectedKubernetesResource, updateKubernetesResource } from "./features/kubernetes-resources/kubernetesResourceService";
import { getSelectedNetworkingResource, updateNetworkingResource } from "./features/networking/networkingResourceService.js";
import { AWS_RELATIONSHIP_TYPES, getAwsRelationship, updateRelationshipType } from "./features/aws-relationships/awsRelationshipService";
import { KUBERNETES_RELATIONSHIP_TYPES, getKubernetesRelationship, getKubernetesRelationshipGuidance, updateKubernetesRelationshipMetadata } from "./features/kubernetes-relationships/kubernetesRelationshipService";
import CommandPalette from "./components/app/CommandPalette";
import DesktopAppHeader from "./components/app/DesktopAppHeader";
import AiAskPanel from "./features/ai/AiAskPanel.jsx";
import { startPeriodicBackendWarmup, wakeBackendOnPageLoad } from "./features/backend/backendWarmup.js";
import "./styles/ai-ask.css";
import "./features/design/design.css";
import "./features/workspace/workspace.css";

function App() {
  const iconCatalog = useIconCatalog();
  const { activeCategory, setActiveCategory, activeAwsCategory, setActiveAwsCategory, activeKubernetesCategory, setActiveKubernetesCategory, search, setSearch, eraserCatalog, eraserSyncing, eraserSyncProgress, eraserSyncError, eraserCachedCount, remoteLoading, remoteError, favorites, recentIcons, searchRef, iconListRef, iconDisplayLimit, setIconDisplayLimit, visibleIcons, networkingIcons, syncEraserLibrary, isFavorite, toggleFavorite, markRecentlyUsed } = iconCatalog;
  const [connectionMode, setConnectionMode] = useState(false);
  const [aiAskOpen, setAiAskOpen] = useState(false);
  const [designStudioOpen, setDesignStudioOpen] = useState(false);
  const [dockerStudioOpen, setDockerStudioOpen] = useState(false);
  const [kubernetesStudioOpen, setKubernetesStudioOpen] = useState(false);
  const [devopsStudioMenuOpen, setDevopsStudioMenuOpen] = useState(false);
  const [selectedConnector, setSelectedConnector] = useState(null);
  const [gridEnabled, setGridEnabled] = useState(false);
  const [gridVisible, setGridVisible] = useState(false);
  const [gridSize, setGridSize] = useState(20);
  const [selectedCount, setSelectedCount] = useState(0);
  const [selectedElements, setSelectedElements] = useState([]);
  const [autoOpenLayers, setAutoOpenLayers] = useState(() => { try { return localStorage.getItem("sketchizi:auto-open-layers") !== "false"; } catch { return true; } });
  const knownLayerElementIdsRef = useRef(null);
  const [architectureValidation, setArchitectureValidation] = useState({ errors: [], warnings: [], info: [] });
  const architectureValidationSignatureRef = useRef("");
  const lastSelectionSignature = useRef("");
  const apiRef = useRef(null);
  const [apiReady, setApiReady] = useState(false);
  const handleExcalidrawAPI = useCallback((api) => { apiRef.current = api || null; setApiReady(Boolean(api)); }, []);

  const [minimapOpen, setMinimapOpen] = useState(false);
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

  const { activePanel, setActivePanel, openPanel, togglePanel, closePanel, libraryOpen, propertiesOpen, moreToolsOpen, shortcutHelpOpen, architectureValidationOpen, layersOpen } = panelState;

  // The native hamburger menu and React-powered floating catalogs are mutually
  // exclusive. Opening the native menu dismisses any active catalog/panel.
  useEffect(() => {
    if (nativeMenuOpen && activePanel) setActivePanel(null);
  }, [nativeMenuOpen, activePanel, setActivePanel]);

  // Workspace menu is transient navigation: Escape and any other open panel/dialog dismiss it.
  useEffect(() => {
    // The Workspaces dropdown is mutually exclusive with every other
    // floating panel, including Excalidraw's native hamburger menu.
    if (nativeMenuOpen || activePanel || aiAskOpen || designStudioOpen || dockerStudioOpen || kubernetesStudioOpen) {
      setDevopsStudioMenuOpen(false);
    }
  }, [nativeMenuOpen, activePanel, aiAskOpen, designStudioOpen, dockerStudioOpen, kubernetesStudioOpen]);

  useEffect(() => {
    if (!devopsStudioMenuOpen) return undefined;
    const closeWorkspaceMenuOnEscape = (event) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      setDevopsStudioMenuOpen(false);
    };
    window.addEventListener("keydown", closeWorkspaceMenuOnEscape, true);
    return () => window.removeEventListener("keydown", closeWorkspaceMenuOnEscape, true);
  }, [devopsStudioMenuOpen]);

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
  const { savedSketch, setSavedSketch, sketchReady, storageError, setStorageError, saveStatus, saveTimerRef, queueSketchSave: queueLocalSketchSave, persistSketchNow, retryLocalSave, downloadRecoveryBackup } = persistence;
  const cloudUrlParams = new URLSearchParams(window.location.search);
  const cloudDiagramId = cloudUrlParams.get("cloudDiagramId") || "";
  const cloudProjectId = cloudUrlParams.get("cloudProjectId") || "";
  const cloudSessionRef = useRef({ active: false, diagramId: "", projectId: "", revision: null, name: "" });
  const cloudSaveTimerRef = useRef(null);
  const cloudSaveQueueRef = useRef(Promise.resolve());
  const cloudFlushImmediatelyRef = useRef(false);
  const cloudLoadStartedRef = useRef(false);
  const [cloudSaveState, setCloudSaveState] = useState({ state: cloudDiagramId ? "loading" : "inactive", error: "" });
  useEffect(() => {
    try { localStorage.setItem("sketchizi:auto-open-layers", String(autoOpenLayers)); } catch {}
  }, [autoOpenLayers]);

  useEffect(() => {
    if (!apiReady || !sketchReady || (cloudDiagramId && cloudSaveState.state === "loading")) return;
    const initialElements = apiRef.current?.getSceneElementsIncludingDeleted?.() || apiRef.current?.getSceneElements?.() || [];
    knownLayerElementIdsRef.current = new Set(initialElements.filter((element) => element && !element.isDeleted && element.type !== "selection").map((element) => element.id));
  }, [apiReady, sketchReady, cloudDiagramId, cloudSaveState.state]);
  const [cloudSaveDialogOpen, setCloudSaveDialogOpen] = useState(false);

  useEffect(() => {
    const detachCloudDocument = () => {
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
    window.location.assign(`/?editor=1&cloudDiagramId=${encodeURIComponent(diagram.id)}&cloudProjectId=${encodeURIComponent(projectId)}`);
  }, [showToast]);

  const queueSketchSave = useCallback((elements, appState) => {
    if (!cloudDiagramId) {
      queueLocalSketchSave(elements, appState);
      return;
    }
    // A cloud session must never overwrite the browser-local sketch while its
    // document is loading or after a failed load.
    if (!cloudSessionRef.current.active || !apiRef.current) return;
    // Excalidraw can emit a transient empty scene while restoring/updating a
    // scene. Never let that snapshot replace a non-empty cloud document.
    // Keep any already queued non-empty save intact when an empty callback
    // arrives during restoration.
    if (!Array.isArray(elements) || !elements.some((element) => element && !element.isDeleted)) return;
    setCloudSaveState((current) => ({ ...current, state: "pending", error: "" }));
    if (cloudSaveTimerRef.current) window.clearTimeout(cloudSaveTimerRef.current);
    cloudSaveTimerRef.current = window.setTimeout(() => {
      cloudSaveTimerRef.current = null;
      const session = cloudSessionRef.current;
      const api = apiRef.current;
      if (!session.active || !api || !Array.isArray(elements)) return;
      const document = createCloudDocument({
        api,
        elements,
        appState: appState || api.getAppState?.() || {},
        metadata: documentMetadataRef.current,
      });
      setCloudSaveState((current) => ({ ...current, state: "saving", error: "" }));
      cloudSaveQueueRef.current = cloudSaveQueueRef.current.catch(() => {}).then(async () => {
        const revision = cloudSessionRef.current.revision;
        const result = await workspaceClient.saveDiagram(session.diagramId, revision, document);
        if (result && result.revision !== undefined && result.revision !== null) {
          cloudSessionRef.current.revision = result.revision;
        } else if (typeof revision === "number") {
          cloudSessionRef.current.revision = revision + 1;
        }
        setCloudSaveState({ state: "saved", error: "", lastSavedAt: Date.now() });
      }).catch((error) => {
        const conflict = error?.status === 409 || error?.status === 412 || error?.code === "revision_conflict";
        setCloudSaveState({
          state: conflict ? "conflict" : "error",
          error: conflict
            ? "This cloud diagram changed in another session. Reload the latest version before continuing; your current edits are still available to download as a backup."
            : error.message || "Could not save this cloud diagram.",
        });
      });
    }, cloudFlushImmediatelyRef.current ? 0 : 700);
  }, [apiRef, cloudDiagramId, documentMetadataRef, queueLocalSketchSave]);

  const saveCloudDiagramNow = useCallback(() => {
    const api = apiRef.current;
    if (!cloudDiagramId || !cloudSessionRef.current.active || !api) return;
    cloudFlushImmediatelyRef.current = true;
    queueSketchSave(api.getSceneElements?.() || [], api.getAppState?.() || {});
    cloudFlushImmediatelyRef.current = false;
  }, [apiRef, cloudDiagramId, queueSketchSave]);

  useEffect(() => {
    if (!cloudDiagramId || !apiReady || !sketchReady || cloudLoadStartedRef.current) return undefined;
    let cancelled = false;
    cloudLoadStartedRef.current = true;
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
      cloudSessionRef.current = {
        active: true,
        diagramId: diagram.id || cloudDiagramId,
        projectId: diagram.projectId || cloudProjectId,
        revision: diagram.revision ?? result?.revision ?? result?.version ?? 0,
        name: diagram.name || "Cloud diagram",
      };
      api.updateScene({
        elements,
        appState: { ...api.getAppState(), ...sanitizeCloudAppState(document.appState || {}), selectedElementIds: {}, selectedGroupIds: {}, selectedLinearElement: null },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      api.history?.clear?.();
      const files = Object.values(document.files || {});
      if (files.length) api.addFiles?.(files);
      setSavedSketch({ elements, appState: document.appState || {}, files: document.files || {}, metadata: document.metadata || {}, extensions: document.extensions || {}, format: document.format || diagram.format || "excalidraw" });
      if (elements.length) api.scrollToContent?.(elements, { fitToContent: true, animate: false });
      setCloudSaveState({ state: "saved", error: "" });
      document.title = `${diagram.name || "Cloud diagram"} · Sketchizi`;
    }).catch((error) => {
      if (cancelled) return;
      cloudSessionRef.current.active = false;
      setCloudSaveState({ state: "error", error: error.message || "Could not load this cloud diagram." });
    });
    return () => { cancelled = true; };
  }, [apiReady, cloudDiagramId, cloudProjectId, documentMetadataRef, setSavedSketch, sketchReady]);

  useEffect(() => {
    const flushPendingCloudSave = () => {
      if (!cloudDiagramId || !cloudSessionRef.current.active || !apiRef.current) return;
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
    apiRef, closeNativeMenu, showToast, queueSketchSave, saveTimerRef, setSavedSketch, documentMetadataRef,
    lastSelectionSignature, startCollaboration,
  });
  const { recentFiles, recentFolders, currentFolder, currentFolderFiles, currentFile, documentDirty, markCurrentDocumentChanged, fileActionsRef, refreshCurrentFolderFiles, handleFileError } = fileManager;

  useEffect(() => {
    if (!apiReady || !currentFile) return;
    markCurrentDocumentChanged(apiRef.current?.getSceneElementsIncludingDeleted?.() || apiRef.current?.getSceneElements?.() || []);
  }, [apiReady, currentFile, markCurrentDocumentChanged]);

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
  const toggleCanvasGrid = useCallback(() => setGridVisible((visible) => !visible), []);
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

  useSketchiziEscape({ activePanel, closePanel, iconLibraryPinned, commandPaletteOpen, closeCommandPalette, collaborationOpen, setCollaborationOpen, connectionMode, activateSelectionTool, searchRef, apiRef, closeExportDialog });
  useSketchiziExportLifecycle({ apiRef, showToast, closeExportDialog });
  useEffect(() => {
    if (!collaborationCanEdit && libraryOpen) closePanel("icon-library");
  }, [closePanel, collaborationCanEdit, libraryOpen]);
  const preferences = useSketchiziPreferences({
    apiRef, apiReady, closePanel, openPanel, togglePanel, activePanel, connectionMode, selectedCount, toggleGrid, toggleCanvasGrid,
    activateSelectionTool, setMinimapOpen, searchRef, saveTimerRef, fileActionsRef, setStorageError, sketchReady, savedSketch, canEdit: collaborationCanEdit,
  });
  const { themeMode, setThemeMode, isDarkTheme } = preferences;
  const commands = createSketchiziCommandRegistry({
    apiRef,
    canEdit: collaborationCanEdit,
    selectedCount,
    themeMode,
    setThemeMode,
    gridEnabled,
    toggleGrid,
    gridVisible,
    toggleCanvasGrid,
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
  });
  useNativeSketchiziMenu({ apiRef, fileActionsRef, currentFolder, currentFolderFiles, recentFiles, recentFolders, refreshCurrentFolderFiles, handleFileError, useThemeDefaultBackground: preferences.useThemeDefaultBackground, markCanvasBackgroundCustom: preferences.markCanvasBackgroundCustom });
  const handleExcalidrawChange = useExcalidrawScene({
    apiRef, nativeMenuOpenRef, setNativeMenuOpen, setActivePanel, lastSelectionSignature,
    setSelectedCount, setSelectedElements, setSelectedConnector, updateMinimap, queueSketchSave,
    collaborationRemoteUpdateRef, collaborationRef, canEdit: collaborationCanEdit,
    onArchitectureSceneChange: updateArchitectureValidation,
    onDocumentSceneChange: markCurrentDocumentChanged,
  });
  // Reconcile against the live Excalidraw API after its onChange/theme cycle.
  // Never apply a color from the callback's appState argument: that snapshot can
  // predate scene restoration or Excalidraw's internal theme update.
  const handleThemeAwareExcalidrawChange = useCallback((elements, appState) => {
    const liveIds = new Set((elements || []).filter((element) => element && !element.isDeleted && element.type !== "selection").map((element) => element.id));
    if (knownLayerElementIdsRef.current === null) {
      knownLayerElementIdsRef.current = liveIds;
    } else {
      const addedElement = [...liveIds].some((id) => !knownLayerElementIdsRef.current.has(id));
      knownLayerElementIdsRef.current = liveIds;
      if (addedElement && autoOpenLayers && collaborationCanEdit && !collaborationRemoteUpdateRef.current) {
        openPanel("layers");
      }
    }
    handleExcalidrawChange(elements, appState);
    if (cloudDiagramId && cloudSessionRef.current.active) queueSketchSave(elements, appState);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const activeTheme = document.querySelector(".app")?.dataset.theme;
        applyCanvasThemeBackground(apiRef.current, activeTheme === "dark");
      });
    });
  }, [apiRef, autoOpenLayers, collaborationCanEdit, cloudDiagramId, handleExcalidrawChange, openPanel, queueSketchSave]);

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

  const createKubernetesDiagram = useCallback(async (resources) => {
    const api = apiRef.current;
    if (!api?.updateScene || !collaborationCanEdit) {
      showToast("The editor is not ready or you do not have permission to edit.", "error");
      return;
    }
    if (!Array.isArray(resources) || !resources.length) {
      showToast("No Kubernetes resources were found in the YAML.", "error");
      return;
    }

    const cardWidth = 320;
    const cardHeight = 164;
    const gapX = 76;
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
    const maxPerRow = 3;
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
        const y = nextLayoutY + row * (cardHeight + 34);
        resourcePositions.set(resource.id, { x, y, rank, row, column });
        positions.set(resource.id, { x, y });
      });
      nextLayoutY += rowCount * (cardHeight + 34) + 84;
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
      const resourceGroup = `k8s-import-${resource.id}`;
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
      ].filter(Boolean).join("\n");
      const metadata = {
        provider: "kubernetes", resourceType: String(resource.kind || "resource").toLowerCase(),
        catalog: "kubernetes", importedFromYaml: true,
        properties: { name: resource.name, namespace: resource.namespace || "default", apiVersion: resource.apiVersion, manifestResourceId: resource.id },
        manifest,
      };
      const resourceElementId = resourceElementIds.get(resource.id);
      const resourceRectangle = {
        id: resourceElementId,
        type: "rectangle", x, y, width: cardWidth, height: cardHeight,
        boundElements: [],
        strokeColor: resource.kind === "Service" ? "#0891b2" : resource.kind === "Ingress" ? "#8b5cf6" : ["ConfigMap", "Secret", "PersistentVolumeClaim", "PersistentVolume", "StorageClass"].includes(resource.kind) ? "#b28b43" : "#4779bf",
        backgroundColor: resource.kind === "Service" ? "#102b32" : resource.kind === "Ingress" ? "#241c38" : ["ConfigMap", "Secret", "PersistentVolumeClaim", "PersistentVolume", "StorageClass"].includes(resource.kind) ? "#28251d" : "#172333",
        fillStyle: "solid", strokeWidth: 1.5, roughness: 0, roundness: { type: 3 },
        groupIds: [resourceGroup],
        customData: { diagramIcon: true, iconId: icon?.id || null, iconName: icon?.name || resource.kind, iconCategory: icon?.category || "Kubernetes", iconSource: "kubernetes", kubernetesManifestResource: metadata },
      };
      resourceRectangles.set(resource.id, resourceRectangle);
      nodes.push(resourceRectangle);
      if (fileId) {
        nodes.push({
          type: "image", x: x + 18, y: y + 30, width: 62, height: 62, fileId,
          groupIds: [resourceGroup],
          customData: { diagramIcon: true, iconId: icon.id, iconName: icon.name, iconCategory: icon.category, iconSource: "kubernetes", kubernetesManifestResource: metadata },
        });
      } else {
        nodes.push({
          type: "text", x: x + 16, y: y + 34, width: 66, height: 44, text: String(resource.kind).replace(/([a-z])([A-Z])/g, "$1 $2").split(/\s+/).map((part) => part.slice(0, 1)).join("").slice(0, 4).toUpperCase(),
          fontSize: 15, fontFamily: 2, textAlign: "center", verticalAlign: "middle", strokeColor: "#9fc5ff",
          groupIds: [resourceGroup], customData: { diagramIcon: true, iconSource: "kubernetes", kubernetesManifestResource: metadata },
        });
      }
      nodes.push({
        type: "text", x: x + 98, y: y + 16, width: cardWidth - 116, height: 44,
        text: `${resource.kind}\n${resource.name}`, fontSize: 16, fontFamily: 2, textAlign: "left",
        verticalAlign: "top", strokeColor: "#e6efff", backgroundColor: "transparent", autoResize: false,
        groupIds: [resourceGroup], customData: { diagramIcon: true, iconSource: "kubernetes", kubernetesManifestResource: metadata },
      });
      nodes.push({
        type: "text", x: x + 98, y: y + 64, width: cardWidth - 116, height: 84,
        text: details, fontSize: 11, fontFamily: 2, textAlign: "left",
        verticalAlign: "top", strokeColor: "#a8bbd4", backgroundColor: "transparent", autoResize: false,
        groupIds: [resourceGroup], customData: { diagramIcon: true, iconSource: "kubernetes", kubernetesManifestResource: metadata },
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
        customData: { kubernetesRelationship: { fromResourceId: fromResource.id, toResourceId: toResource.id, label } },
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
    const existing = api.getSceneElementsIncludingDeleted?.() || api.getSceneElements?.() || [];
    const importedResourceIds = new Set(existing.filter((element) => {
      const metadata = element.customData?.kubernetesManifestResource;
      return !element.isDeleted && Boolean(metadata?.importedFromYaml || metadata?.properties?.importedFromYaml);
    }).map((element) => element.customData?.kubernetesManifestResource?.properties?.manifestResourceId).filter(Boolean));
    const staleRelationshipIds = new Set(existing.filter((element) => {
      const relationship = element.customData?.kubernetesRelationship;
      return !element.isDeleted && element.type === "arrow" && relationship
        && (importedResourceIds.has(relationship.fromResourceId) || importedResourceIds.has(relationship.toResourceId));
    }).map((element) => element.id));
    const retained = existing.filter((element) => {
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
  }, [collaborationCanEdit, queueSketchSave, showToast]);
  const createComposeDiagram = useCallback(async (composeDocument) => {
    const api = apiRef.current;
    if (!api?.updateScene || !collaborationCanEdit) return;
    const services = Object.entries(composeDocument.services || {});
    if (!services.length) {
      showToast("Add at least one service before creating a diagram.", "error");
      return;
    }

    // Create a readable architecture overview: project boundary, service cards,
    // dependency connectors, and explicit shared-resource nodes.
    const cardWidth = 360;
    const cardHeight = 240;
    const gapX = 100;
    const gapY = 72;
    const dependenciesOf = (service) => Array.isArray(service.depends_on)
      ? service.depends_on
      : Object.keys(service.depends_on || {});
    const serviceNames = new Set(services.map(([name]) => name));
    const levels = new Map();
    const resolving = new Set();
    const getLevel = (name) => {
      if (levels.has(name)) return levels.get(name);
      if (resolving.has(name)) return 0; // Break dependency cycles safely.
      resolving.add(name);
      const service = composeDocument.services[name] || {};
      const dependencyLevels = dependenciesOf(service)
        .filter((dependency) => serviceNames.has(dependency))
        .map((dependency) => getLevel(dependency) + 1);
      resolving.delete(name);
      const level = dependencyLevels.length ? Math.max(...dependencyLevels) : 0;
      levels.set(name, level);
      return level;
    };
    services.forEach(([name]) => getLevel(name));
    const layerGroups = new Map();
    services.forEach(([name]) => {
      const level = levels.get(name) || 0;
      if (!layerGroups.has(level)) layerGroups.set(level, []);
      layerGroups.get(level).push(name);
    });
    const layerKeys = [...layerGroups.keys()].sort((a, b) => a - b);
    const columns = layerKeys.length;
    const rows = Math.max(1, ...[...layerGroups.values()].map((group) => group.length));
    const left = 180;
    const top = 210;
    const positions = new Map();
    const skeleton = [];
    const projectName = composeDocument.name || "Docker Compose project";
    const volumeNames = Object.keys(composeDocument.volumes || {});
    const networkNames = Object.keys(composeDocument.networks || {});

    const maxServiceX = left + Math.max(0, columns - 1) * (cardWidth + gapX);
    const maxServiceY = top + Math.max(0, rows - 1) * (cardHeight + gapY);
    const resourceTop = maxServiceY + cardHeight + 200;
    const resourceCount = volumeNames.length + networkNames.length;
    const resourceWidth = 230;
    const resourceHeight = 86;
    const resourceGap = 34;
    const resourceTotalWidth = resourceCount ? resourceCount * resourceWidth + (resourceCount - 1) * resourceGap : 0;
    const projectWidth = Math.max(maxServiceX - left + cardWidth + 120, resourceTotalWidth + 120);
    const projectHeight = resourceCount
      ? resourceTop - top + resourceHeight + 95
      : maxServiceY - top + cardHeight + 100;

    // The background is first so all generated elements remain visually inside it.
    skeleton.push({
      type: "rectangle",
      x: left - 60,
      y: top - 120,
      width: projectWidth,
      height: projectHeight,
      strokeColor: "#64748b",
      backgroundColor: "transparent",
      fillStyle: "solid",
      strokeStyle: "dashed",
      label: { text: `▦  COMPOSE PROJECT  ·  ${projectName}`, fontSize: 18, textAlign: "left", verticalAlign: "top" }
    });

    layerKeys.forEach((level, columnIndex) => {
      const names = layerGroups.get(level);
      names.forEach((name, rowIndex) => {
        const x = left + columnIndex * (cardWidth + gapX);
        const y = top + rowIndex * (cardHeight + gapY);
        positions.set(name, { x, y });
      });
    });

    // Dependency connectors are emitted before cards so they never cross card text.
    services.forEach(([name, service]) => {
      const from = positions.get(name);
      const dependencies = Array.isArray(service.depends_on) ? service.depends_on : Object.keys(service.depends_on || {});
      dependencies.forEach((dependency) => {
        const to = positions.get(dependency);
        if (!to) return;
        const startX = from.x + cardWidth / 2;
        const startY = from.y + cardHeight / 2;
        const endX = to.x + cardWidth / 2;
        const endY = to.y + cardHeight / 2;
        skeleton.push({
          type: "arrow",
          x: startX,
          y: startY,
          width: endX - startX,
          height: endY - startY,
          points: [[0, 0], [endX - startX, endY - startY]],
          strokeColor: "#64748b",
          strokeWidth: 2,
          endArrowhead: "arrow",
          label: { text: "depends on", fontSize: 13 }
        });
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

    services.forEach(([name, service]) => {
      const { x, y } = positions.get(name);
      const iconAsset = iconAssets.get(serviceIconSources.get(name));
      const ports = (service.ports || []).map((port) => typeof port === "string" ? port : [port.published, port.target].filter(Boolean).join(":")).filter(Boolean);
      const environment = service.environment
        ? (Array.isArray(service.environment) ? service.environment.map((entry) => typeof entry === "string" ? entry.split("=")[0] : Object.keys(entry || {})[0]) : Object.keys(service.environment))
        : [];
      const dependencies = Array.isArray(service.depends_on) ? service.depends_on : Object.keys(service.depends_on || {});
      const details = [
        service.image ? `Image  ·  ${service.image}` : service.build?.context ? `Build  ·  ${service.build.context}` : "Image not specified",
        ports.length ? `↔  Ports  ·  ${ports.slice(0, 3).join(", ")}` : "",
        dependencies.length ? `⇢  Depends on  ·  ${dependencies.join(", ")}` : "",
        environment.length ? `⚙  Environment  ·  ${environment.slice(0, 3).join(", ")}` : "",
        service.restart ? `↻  Restart  ·  ${service.restart}` : ""
      ].filter(Boolean);
      skeleton.push({
        type: "rectangle",
        x,
        y,
        width: cardWidth,
        height: cardHeight,
        strokeColor: "#7c3aed",
        backgroundColor: "#f5f3ff",
        fillStyle: "solid",
        strokeWidth: 2,
        roundness: { type: 3 },
        label: {
          text: `▣  CONTAINER  ·  ${name.toUpperCase()}\n\n${details.join("\n")}`,
          fontSize: 13,
          textAlign: "left",
          verticalAlign: "middle"
        }
      });
      // Add the image after its card so it is rendered above the card background.
      if (iconAsset) {
        skeleton.push({
          type: "image",
          x: x + cardWidth - 66,
          y: y + 12,
          width: 54,
          height: 54,
          fileId: iconAsset.fileId,
          status: "saved",
          scale: [1, 1]
        });
      }
    });

    // Keep resource relationships legible: show volume mounts and network
    // membership as compact badges inside each service card instead of long
    // cross-canvas connector lines. Keep resource definitions as a small legend.
    services.forEach(([serviceName, service]) => {
      const servicePosition = positions.get(serviceName);
      const declaredVolumes = (service.volumes || []).map((mount) => {
        if (typeof mount === "string") return mount.split(":")[0];
        return mount?.source || "";
      }).filter(Boolean);
      const declaredNetworks = Array.isArray(service.networks) ? service.networks : Object.keys(service.networks || {});
      const badges = [
        ...declaredVolumes.map((name) => ({ text: `● ${name}`, kind: "VOLUME" })),
        ...declaredNetworks.map((name) => ({ text: `◇ ${name}`, kind: "NETWORK" }))
      ];
      if (!badges.length) return;
      const maxBadgesPerRow = 2;
      const badgeWidth = 138;
      const badgeHeight = 25;
      badges.forEach((badge, index) => {
        const column = index % maxBadgesPerRow;
        const row = Math.floor(index / maxBadgesPerRow);
        const badgeX = servicePosition.x + 14 + column * (badgeWidth + 8);
        const badgeY = servicePosition.y + cardHeight - 32 - row * (badgeHeight + 4);
        skeleton.push({
          type: "rectangle",
          x: badgeX,
          y: badgeY,
          width: badgeWidth,
          height: badgeHeight,
          strokeColor: badge.kind === "VOLUME" ? "#0f766e" : "#0369a1",
          backgroundColor: badge.kind === "VOLUME" ? "#ccfbf1" : "#e0f2fe",
          fillStyle: "solid",
          strokeWidth: 1,
          roundness: { type: 3 },
          label: { text: badge.text, fontSize: 11, textAlign: "center", verticalAlign: "middle" }
        });
      });
    });

    const resources = [
      ...volumeNames.map((name) => ({ name, kind: "VOLUME", color: "#0f766e", background: "#ccfbf1" })),
      ...networkNames.map((name) => ({ name, kind: "NETWORK", color: "#0369a1", background: "#e0f2fe" }))
    ];
    if (resources.length) {
      const legendY = resourceTop;
      const legendWidth = 230;
      const legendHeight = 56;
      const legendGap = 20;
      const legendColumns = Math.min(4, resources.length);
      const legendRows = Math.ceil(resources.length / legendColumns);
      resources.forEach((resource, index) => {
        const column = index % legendColumns;
        const row = Math.floor(index / legendColumns);
        skeleton.push({
          type: "rectangle",
          x: left + column * (legendWidth + legendGap),
          y: legendY + row * (legendHeight + 12),
          width: legendWidth,
          height: legendHeight,
          strokeColor: resource.color,
          backgroundColor: resource.background,
          fillStyle: "solid",
          strokeWidth: 1,
          roundness: { type: 3 },
          label: { text: `${resource.kind === "VOLUME" ? "● STORAGE" : "◇ NETWORK"}\n${resource.name}`, fontSize: 13, textAlign: "center", verticalAlign: "middle" }
        });
      });
    }

    const elements = convertToExcalidrawElements(skeleton);
    api.updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    api.scrollToContent?.(elements, { fitToContent: true, animate: true });
    setDockerStudioOpen(false);
    showToast("Compose architecture diagram created. Select any element to edit it.");
  }, [collaborationCanEdit, showToast]);

  const workspaceToggle = (
<div className="devops-studio-menu create-design-menu">
  <button
    type="button"
    className={devopsStudioMenuOpen ? "design-studio-header-toggle active" : "design-studio-header-toggle"}
    onClick={() => setDevopsStudioMenuOpen((open) => !open)}
    title="Workspaces"
    aria-label="Design Workspaces"
    aria-haspopup="menu"
    aria-expanded={devopsStudioMenuOpen}
  >
    <svg className="workspaces-menu-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M3.5 7.5h6l2 2h9v9.25a1.75 1.75 0 0 1-1.75 1.75H5.25a1.75 1.75 0 0 1-1.75-1.75Z"/><path d="M3.5 7.5V5.75A1.75 1.75 0 0 1 5.25 4h4l2 2h4.25"/></svg>
    <span>Workspaces</span>
    <svg className="devops-studio-chevron" viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m4.5 6 3.5 3.5L11.5 6" /></svg>
  </button>
  {devopsStudioMenuOpen && (
    <div className="devops-studio-dropdown create-design-dropdown" role="menu" aria-label="Design Workspaces">
      <button type="button" role="menuitem" className="cloud-workspace-menu-item" onClick={() => { setDevopsStudioMenuOpen(false); window.location.assign("/workspace"); }} title="Open your private cloud projects and diagrams">
        <span className="create-design-menu-icon" aria-hidden="true">☁</span>
        <span><strong>Cloud Workspace</strong><small>Your saved projects and diagrams</small></span>
      </button>
      <button type="button" role="menuitem" className="design-studio-menu-item" onClick={() => { setDevopsStudioMenuOpen(false); setDesignStudioOpen(true); }} title="Create an architecture or diagram from a template">
        <span className="create-design-menu-icon" aria-hidden="true">◇</span>
        <span><strong>Design Studio</strong><small>Architecture and diagram templates</small></span>
      </button>
      <button type="button" role="menuitem" className="kubernetes-studio-menu-item" onClick={() => { setDevopsStudioMenuOpen(false); setKubernetesStudioOpen(true); }} title="Design Kubernetes architectures and import YAML">
        <span className="create-design-menu-icon" aria-hidden="true"><img src="/icons/kubernetes.svg" alt="" width="22" height="22" /></span>
        <span><strong>K8s Studio</strong><small>Kubernetes manifests and diagrams</small></span>
      </button>
      <button type="button" role="menuitem" className="docker-compose-studio-menu-item" onClick={() => { setDevopsStudioMenuOpen(false); setDockerStudioOpen(true); }} title="Design Docker Compose applications">
        <span className="create-design-menu-icon" aria-hidden="true"><img src="/icons/docker.svg" alt="" width="22" height="22" /></span>
        <span><strong>Docker Studio</strong><small>Compose files and service diagrams</small></span>
      </button>
    </div>
  )}
</div>
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


  return (
    <div className={`${isDarkTheme ? "app theme-dark" : "app theme-light"} ${activePanel ? `panel-open-${activePanel === "icon-library" ? "library" : activePanel}` : ""} ${nativeMenuOpen ? "native-menu-open" : ""}`} data-theme={isDarkTheme ? "dark" : "light"} data-open-panel={activePanel || "none"}>
      {cloudDiagramId && <div className={`cloud-editor-save-status cloud-editor-save-status-${cloudSaveState.state}`} role={["error", "conflict"].includes(cloudSaveState.state) ? "alert" : "status"}>
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
        openCommandPalette={commandPalette.openCommandPalette}
        startCollaboration={startCollaboration}
        collaborationActive={Boolean(collaborationRoom && collaborationStatus !== "disconnected")}
        collaborationCreationState={collaboration.collaborationCreationState}
        collaborationCreationError={collaborationError}
        nativeMenuOpen={nativeMenuOpen}
        toggleNativeMenu={toggleNativeMenu}
        createCollaboration={createCollaboration}
        dismissCollaborationCreationFailure={collaboration.dismissCollaborationCreationFailure}
        setThemeMode={setThemeMode}
        isDarkTheme={isDarkTheme}
        saveStatus={saveStatus}
        currentDocumentName={cloudDiagramId ? (cloudSessionRef.current.name || "Cloud diagram") : (currentFile?.name || "Untitled drawing")}
        currentDocumentDirty={documentDirty}
        currentDocumentFileBacked={Boolean(currentFile?.handle)}
        onSaveNow={retryLocalSave}
        onSaveToFile={() => fileActionsRef.current.saveCurrentDrawing?.()}
        isCloudDocument={Boolean(cloudDiagramId)}
        onSaveToCloud={() => cloudDiagramId ? saveCloudDiagramNow() : setCloudSaveDialogOpen(true)}
        cloudSaveState={cloudSaveState.state}
        onDownloadRecoveryBackup={downloadRecoveryBackup}
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
          className={aiAskOpen ? "ai-ask-toggle is-icon-only active" : "ai-ask-toggle is-icon-only"}
          onClick={() => setAiAskOpen((value) => !value)}
          title="AI Ask"
          aria-label="AI Ask"
          aria-expanded={aiAskOpen}
        >
          <svg className="ai-ask-toggle-icon" viewBox="0 0 512 512" width="18" height="18" fill="currentColor" fillRule="evenodd" aria-hidden="true">
            <path d="M204 21 L185 25 L173 29 L156 37 L134 52 L112 75 L101 92 L95 104 L89 121 L85 140 L85 148 L84 149 L84 179 L83 180 L42 180 L37 181 L23 187 L11 199 L7 207 L4 218 L4 325 L7 336 L11 344 L18 352 L31 360 L42 363 L84 363 L86 366 L87 376 L92 392 L102 411 L112 424 L120 432 L133 442 L150 451 L161 455 L182 459 L197 459 L204 473 L214 483 L225 489 L234 491 L277 491 L288 488 L301 480 L308 472 L314 458 L315 442 L312 431 L308 423 L296 411 L288 407 L277 404 L234 404 L225 406 L214 412 L204 422 L197 436 L176 435 L157 429 L146 423 L138 417 L122 400 L112 381 L107 360 L107 149 L108 148 L109 136 L115 116 L123 100 L133 86 L150 69 L164 59 L178 52 L192 47 L213 43 L298 43 L299 44 L306 44 L331 51 L347 59 L361 69 L378 86 L388 100 L396 116 L402 136 L403 149 L404 150 L404 354 L405 357 L410 362 L413 363 L469 363 L480 360 L488 356 L500 344 L504 336 L507 325 L507 218 L504 207 L496 194 L488 187 L478 182 L469 180 L428 180 L427 179 L426 140 L422 121 L416 104 L404 82 L395 70 L377 52 L365 43 L338 29 L326 25 L307 21 L299 21 L298 20 L213 20 L212 21Z M218 165 L213 170 L208 185 L208 188 L172 301 L173 309 L178 314 L181 315 L189 314 L194 309 L201 285 L203 283 L260 283 L262 285 L269 309 L274 314 L277 315 L285 314 L290 309 L291 301 L250 170 L245 165 L242 164 L221 164Z M428 203 L467 203 L476 207 L483 216 L484 220 L484 323 L480 332 L471 339 L467 340 L428 340 L427 339 L427 204Z M40 204 L44 203 L83 203 L84 204 L84 339 L83 340 L44 340 L35 336 L28 327 L27 323 L27 220 L31 211Z M325 164 L322 165 L317 170 L316 173 L316 306 L317 309 L322 314 L330 315 L333 314 L338 309 L339 306 L339 173 L338 170 L333 165Z M219 444 L223 435 L232 428 L236 427 L275 427 L281 429 L288 435 L291 440 L292 451 L288 460 L279 467 L275 468 L236 468 L230 466 L223 460 L220 455Z M231 191 L233 192 L234 198 L254 259 L253 260 L210 260 L209 259Z" />
          </svg>
        </button>



      </DesktopAppHeader>

      <div className={`desktop-workspace ${collaborationCanEdit ? "desktop-workspace-editable" : "desktop-workspace-viewer"} ${libraryOpen ? "desktop-workspace-library-open" : "desktop-workspace-library-closed"} ${propertiesOpen || architectureValidationOpen || layersOpen ? "desktop-workspace-context-open" : "desktop-workspace-context-closed"}`}>
        <aside className={`desktop-resources-region ${libraryOpen ? "mobile-resource-open" : "mobile-resource-closed"}`} aria-label="Resources">
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
        </aside>

        <section className="desktop-canvas-region" aria-label="Canvas workspace" onPointerDownCapture={() => { if (devopsStudioMenuOpen) setDevopsStudioMenuOpen(false); }} onClickCapture={() => { if (devopsStudioMenuOpen) setDevopsStudioMenuOpen(false); }}>
          <SketchiziCanvas
            savedSketch={savedSketch}
            isDarkTheme={isDarkTheme}
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
            onToolActivated={() => closePanel("properties")}
            canEdit={collaborationCanEdit}
            viewModeEnabled={collaborationPermission === "viewer"}
            gridVisible={gridVisible}
            gridSize={gridSize}
            gridSnappingEnabled={gridEnabled}
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
          className={`desktop-context-region ${architectureValidationOpen || layersOpen ? "validation-state-open" : "validation-state-closed"}`}
          aria-label="Properties, layers, and architecture validation"
        >
          {(propertiesOpen || architectureValidationOpen || layersOpen) && (
            <div className={`desktop-validation-host ${architectureValidationOpen || layersOpen ? "is-open" : "is-closed"}`}>
              {layersOpen && <LayersPanel apiRef={apiRef} sceneElements={apiRef.current?.getSceneElementsIncludingDeleted?.() || apiRef.current?.getSceneElements?.() || []} selectedElements={selectedElements} canEdit={collaborationCanEdit} autoOpen={autoOpenLayers} onAutoOpenChange={setAutoOpenLayers} onClose={() => closePanel("layers")} />}
              {!layersOpen && <ArchitectureValidationPanel
                validation={architectureValidation}
                sceneElements={apiRef.current?.getSceneElements?.() || []}
                onClose={() => closePanel("architecture-validation")}
                onSelectDiagnostic={selectArchitectureDiagnostic}
                onApplyKubernetesSuggestion={applyKubernetesSuggestion}
                canApplyCorrections={collaborationCanEdit}
              />}
            </div>
          )}
        </aside>
      </div>

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

      <AiAskPanel open={aiAskOpen} onClose={() => setAiAskOpen(false)} apiRef={apiRef} persistSketchNow={persistSketchNow} saveTimerRef={saveTimerRef} />

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
      {cloudSaveDialogOpen && <CloudSaveDialog initialName={cloudDiagramId ? (cloudSessionRef.current.name || "Cloud diagram") : (currentFile?.name || "Untitled drawing")} onClose={() => setCloudSaveDialogOpen(false)} onSave={saveDrawingToCloud} />}
      {dockerStudioOpen && <DockerComposeStudio onClose={() => setDockerStudioOpen(false)} onCreateDiagram={createComposeDiagram} />}
      {kubernetesStudioOpen && <KubernetesStudio onClose={() => setKubernetesStudioOpen(false)} onCreateDiagram={createKubernetesDiagram} onApplyResourceYaml={applyKubernetesResourceYaml} />}
      {designStudioOpen && (
        <CreateDesignScreen
          isDarkTheme={isDarkTheme}
          onClose={() => setDesignStudioOpen(false)}
          onCreate={createDesignFromStudio}
        />
      )}
    </div>
  );
}
export default App;
