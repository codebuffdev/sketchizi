import { useCallback, useEffect, useRef, useState } from "react";
import IconLibraryPanel from "./IconLibraryPanel";
import PropertiesPanel from "./PropertiesPanel";
import ArchitectureValidationPanel from "./components/app/ArchitectureValidationPanel";
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
    if (!api || !nativeMenuOpenRef.current) return;
    nativeMenuOpenRef.current = false;
    setNativeMenuOpen(false);
    api.updateScene({ appState: { openMenu: null }, captureUpdate: CaptureUpdateAction.NEVER });
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

  const { activePanel, setActivePanel, openPanel, togglePanel, closePanel, libraryOpen, propertiesOpen, moreToolsOpen, shortcutHelpOpen, architectureValidationOpen } = panelState;

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
  const { savedSketch, setSavedSketch, sketchReady, storageError, setStorageError, saveStatus, saveTimerRef, queueSketchSave, persistSketchNow, retryLocalSave, downloadRecoveryBackup } = persistence;

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
    handleExcalidrawChange(elements, appState);
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => {
        const activeTheme = document.querySelector(".app")?.dataset.theme;
        applyCanvasThemeBackground(apiRef.current, activeTheme === "dark");
      });
    });
  }, [apiRef, handleExcalidrawChange]);

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

    const cardWidth = 292;
    const cardHeight = 126;
    const gapX = 78;
    const gapY = 64;
    const columns = Math.max(1, Math.ceil(Math.sqrt(resources.length)));
    const positions = new Map();
    const iconForKind = (kind) => {
      const aliases = { EndpointSlice: "endpoints", PersistentVolumeClaim: "persistent-volume-claim", PersistentVolume: "persistent-volume", StorageClass: "storage-class", HorizontalPodAutoscaler: "horizontal-pod-autoscaler", NetworkPolicy: "network-policy", ServiceAccount: "service-account", ClusterRoleBinding: "cluster-role-binding", ClusterRole: "cluster-role", RoleBinding: "role-binding", CustomResourceDefinition: "custom-resource-definition", PodSecurityPolicy: "pod-security-policy", ConfigMap: "configmap", CronJob: "cronjob", ResourceQuota: "resourcequota", LimitRange: "limitrange" };
      const id = aliases[kind] || String(kind).replace(/([a-z0-9])([A-Z])/g, "$1-$2").toLowerCase();
      return kubernetesIcons.find((icon) => icon.id === `k8s:${id}`) || null;
    };

    const iconAssets = await Promise.all(resources.map(async (resource, index) => {
      const column = index % columns;
      const row = Math.floor(index / columns);
      const x = 180 + column * (cardWidth + gapX);
      const y = 150 + row * (cardHeight + gapY);
      positions.set(resource.id, { x, y });
      const icon = iconForKind(resource.kind);
      if (!icon) return { resource, x, y, icon: null, fileId: null };
      try {
        const response = await fetch(icon.src, { cache: "force-cache" });
        if (!response.ok) throw new Error(`Kubernetes icon request failed (${response.status})`);
        const svg = await response.text();
        const dataURL = `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svg)))}`;
        const fileId = `k8s-import-${Date.now()}-${index}-${Math.random().toString(36).slice(2, 7)}`;
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
    const labelsMatch = (selector, labels) => selector && labels && Object.entries(selector).length > 0
      && Object.entries(selector).every(([key, value]) => labels[key] === value);
    iconAssets.forEach(({ resource, x, y, icon, fileId }) => {
      const manifest = resource.manifest || {};
      const spec = manifest.spec || {};
      const resourceGroup = `k8s-import-${resource.id}`;
      const details = [
        `Namespace: ${resource.namespace || "default"}`,
        resource.kind === "Deployment" || resource.kind === "StatefulSet" || resource.kind === "DaemonSet" ? `Replicas: ${spec.replicas ?? (resource.kind === "DaemonSet" ? "node-managed" : 1)}` : "",
        resource.kind === "Service" ? `Type: ${spec.type || "ClusterIP"}` : "",
        resource.kind === "Pod" ? (spec.containers || []).map((container) => container.image).filter(Boolean).slice(0, 2).join(", ") : "",
        resource.apiVersion || "",
      ].filter(Boolean).join("\n");
      const metadata = {
        provider: "kubernetes", resourceType: String(resource.kind || "resource").toLowerCase(),
        catalog: "kubernetes", importedFromYaml: true,
        properties: { name: resource.name, namespace: resource.namespace || "default", apiVersion: resource.apiVersion },
        manifest,
      };
      nodes.push({
        type: "rectangle", x, y, width: cardWidth, height: cardHeight,
        strokeColor: resource.kind === "Service" ? "#0891b2" : resource.kind === "Ingress" ? "#8b5cf6" : "#4779bf",
        backgroundColor: resource.kind === "Service" ? "#102b32" : resource.kind === "Ingress" ? "#241c38" : "#172333",
        fillStyle: "solid", strokeWidth: 1.5, roughness: 0, roundness: { type: 3 },
        groupIds: [resourceGroup],
        customData: { diagramIcon: true, iconId: icon?.id || null, iconName: icon?.name || resource.kind, iconCategory: icon?.category || "Kubernetes", iconSource: "kubernetes", kubernetesManifestResource: metadata },
      });
      if (fileId) {
        nodes.push({
          type: "image", x: x + 15, y: y + 22, width: 64, height: 64, fileId,
          groupIds: [resourceGroup],
          customData: { diagramIcon: true, iconId: icon.id, iconName: icon.name, iconCategory: icon.category, iconSource: "kubernetes", kubernetesManifestResource: metadata },
        });
      } else {
        nodes.push({
          type: "text", x: x + 16, y: y + 30, width: 62, height: 46, text: String(resource.kind).slice(0, 3).toUpperCase(),
          fontSize: 18, fontFamily: 1, textAlign: "center", verticalAlign: "middle", strokeColor: "#9fc5ff",
          groupIds: [resourceGroup], customData: { diagramIcon: true, iconSource: "kubernetes", kubernetesManifestResource: metadata },
        });
      }
      nodes.push({
        type: "text", x: x + 91, y: y + 14, width: cardWidth - 105, height: 32,
        text: `${resource.kind}\n${resource.name}`, fontSize: 18, fontFamily: 1, textAlign: "left",
        verticalAlign: "middle", strokeColor: "#e6efff", backgroundColor: "transparent", autoResize: false,
        groupIds: [resourceGroup], customData: { diagramIcon: true, iconSource: "kubernetes", kubernetesManifestResource: metadata },
      });
      nodes.push({
        type: "text", x: x + 91, y: y + 51, width: cardWidth - 105, height: 62,
        text: details, fontSize: 12, fontFamily: 1, textAlign: "left",
        verticalAlign: "middle", strokeColor: "#a8bbd4", backgroundColor: "transparent", autoResize: false,
        groupIds: [resourceGroup], customData: { diagramIcon: true, iconSource: "kubernetes", kubernetesManifestResource: metadata },
      });
    });

    const edges = [];
    resources.forEach((resource) => {
      if (resource.kind !== "Service") return;
      const selector = resource.manifest?.spec?.selector;
      if (!selector) return;
      resources.forEach((candidate) => {
        if (!["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Pod"].includes(candidate.kind)) return;
        const labels = candidate.kind === "Pod"
          ? candidate.manifest?.metadata?.labels
          : candidate.manifest?.spec?.template?.metadata?.labels || candidate.manifest?.spec?.selector?.matchLabels;
        if (!labelsMatch(selector, labels)) return;
        const from = positions.get(candidate.id);
        const to = positions.get(resource.id);
        if (!from || !to) return;
        const fromCenter = { x: from.x + cardWidth / 2, y: from.y + cardHeight / 2 };
        const toCenter = { x: to.x + cardWidth / 2, y: to.y + cardHeight / 2 };
        const dx = toCenter.x - fromCenter.x;
        const dy = toCenter.y - fromCenter.y;
        if (dx === 0 && dy === 0) return;
        const fromScale = 1 / Math.max(Math.abs(dx) / (cardWidth / 2), Math.abs(dy) / (cardHeight / 2));
        const toScale = 1 / Math.max(Math.abs(dx) / (cardWidth / 2), Math.abs(dy) / (cardHeight / 2));
        const start = { x: fromCenter.x + dx * fromScale, y: fromCenter.y + dy * fromScale };
        const end = { x: toCenter.x - dx * toScale, y: toCenter.y - dy * toScale };
        const left = Math.min(start.x, end.x);
        const top = Math.min(start.y, end.y);
        edges.push({
          type: "arrow", x: left, y: top,
          width: Math.abs(end.x - start.x), height: Math.abs(end.y - start.y),
          points: [[start.x - left, start.y - top], [end.x - left, end.y - top]],
          strokeColor: "#22a6b9", strokeWidth: 2, endArrowhead: "triangle",
          label: { text: "selects", fontSize: 12 },
        });
      });
    });

    const created = restoreElements(convertToExcalidrawElements([...edges, ...nodes]), null, { deleteInvisibleElements: true });
    const existing = api.getSceneElementsIncludingDeleted?.() || api.getSceneElements?.() || [];
    api.updateScene({
      elements: [...existing, ...created],
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
        currentDocumentName={currentFile?.name || "Untitled drawing"}
        currentDocumentDirty={documentDirty}
        currentDocumentFileBacked={Boolean(currentFile?.handle)}
        onSaveNow={retryLocalSave}
        onDownloadRecoveryBackup={downloadRecoveryBackup}
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
        {collaborationCanEdit && selectedCount > 0 && (
          <button
            type="button"
            className={propertiesOpen ? "properties-toggle active" : "properties-toggle"}
            onClick={() => togglePanel("properties")}
            title="Properties and style"
            aria-label="Properties and style"
            aria-expanded={propertiesOpen}
          >
            <span className="properties-toggle-icon">◧</span>
            <span>Properties</span>
          </button>
        )}

        <button
          type="button"
          className="design-studio-header-toggle"
          onClick={() => setDesignStudioOpen(true)}
          title="Create a new design"
          aria-label="Create a new design"
        >
          <span aria-hidden="true">＋</span>
          <span>Create Design</span>
        </button>

        <div className="devops-studio-menu">
          <button
            type="button"
            className={devopsStudioMenuOpen ? "devops-studio-toggle active" : "devops-studio-toggle"}
            onClick={() => setDevopsStudioMenuOpen((open) => !open)}
            title="Open DevOps design studios"
            aria-label="DevOps Studio"
            aria-haspopup="menu"
            aria-expanded={devopsStudioMenuOpen}
          >
            <svg className="devops-studio-brand-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
              <circle cx="16" cy="16" r="4.2" fill="currentColor" />
              <circle cx="16" cy="16" r="9.3" fill="none" stroke="currentColor" strokeWidth="2.5" />
              <path d="M16 2.5v5M16 24.5v5M2.5 16h5M24.5 16h5M6.45 6.45l3.55 3.55M22 22l3.55 3.55M25.55 6.45L22 10M10 22l-3.55 3.55" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
            </svg>
            <span className="devops-studio-chevron" aria-hidden="true">⌄</span>
          </button>
          {devopsStudioMenuOpen && (
            <div className="devops-studio-dropdown" role="menu" aria-label="DevOps Studio">
              <button
                type="button"
                role="menuitem"
                className="kubernetes-studio-menu-item"
                onClick={() => { setDevopsStudioMenuOpen(false); setKubernetesStudioOpen(true); }}
                title="Design Kubernetes architectures and import YAML"
              >
                <svg className="devops-option-icon kubernetes-brand-icon" viewBox="0 0 32 32" aria-hidden="true" focusable="false">
                  <path fill="currentColor" d="M14.1 1.8a4 4 0 0 1 3.8 0l9.2 5.3a4 4 0 0 1 1.9 3.3v10.7a4 4 0 0 1-1.9 3.4l-9.2 5.2a4 4 0 0 1-3.8 0l-9.2-5.2A4 4 0 0 1 3 21.1V10.4a4 4 0 0 1 1.9-3.3z" opacity=".16"/>
                  <g fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
                    <path d="M16 7v18M7.8 11.2l16.4 9.6M7.8 20.8l16.4-9.6"/>
                    <circle cx="16" cy="16" r="5.4"/>
                    <circle cx="16" cy="16" r="2.1" fill="currentColor" stroke="none"/>
                    <path d="M16 3.8v3M16 25.2v3M5.3 10l2.6 1.5M24.1 20.5l2.6 1.5M5.3 22l2.6-1.5M24.1 11.5l2.6-1.5"/>
                  </g>
                </svg>
                <span>K8s Studio</span>
              </button>
              <button
                type="button"
                role="menuitem"
                className="docker-compose-studio-menu-item"
                onClick={() => { setDevopsStudioMenuOpen(false); setDockerStudioOpen(true); }}
                title="Design Docker Compose applications"
              >
                <svg className="devops-option-icon docker-brand-icon" viewBox="0 0 40 32" aria-hidden="true" focusable="false">
                  <g fill="currentColor">
                    <rect x="8" y="4" width="6" height="6" rx=".7"/><rect x="15" y="4" width="6" height="6" rx=".7"/><rect x="22" y="4" width="6" height="6" rx=".7"/>
                    <rect x="1" y="11" width="6" height="6" rx=".7"/><rect x="8" y="11" width="6" height="6" rx=".7"/><rect x="15" y="11" width="6" height="6" rx=".7"/><rect x="22" y="11" width="6" height="6" rx=".7"/>
                    <path d="M38 13.2c-2.2-1.5-4.6-1.6-6.8-.4-.5-3.1-2.3-5.2-5.2-6.5l-1.1 2.2c1.7 1.1 2.7 2.7 2.9 4.8H4.3c-.4 8.2 3.7 13 11.2 13h5.1c8.5 0 13.8-4.3 15.3-11.1l2.1-.1z"/>
                  </g>
                </svg>
                <span>Docker Studio</span>
              </button>
            </div>
          )}
        </div>


        <button
          type="button"
          className={aiAskOpen ? "ai-ask-toggle active" : "ai-ask-toggle"}
          onClick={() => setAiAskOpen((value) => !value)}
          title="Ask AI about this diagram"
          aria-label="AI Ask"
          aria-expanded={aiAskOpen}
        >
          <span className="ai-ask-toggle-icon" aria-hidden="true">✳</span>
          <span>AI Ask</span>
        </button>

        <button
          type="button"
          className={architectureValidationOpen ? "architecture-validation-toggle active" : "architecture-validation-toggle"}
          onClick={() => togglePanel("architecture-validation")}
          title="Architecture validation"
          aria-label="Architecture validation"
          aria-expanded={architectureValidationOpen}
        >
          <span className="architecture-validation-toggle-icon">✓</span>
          <span>Validation</span>
        </button>

        {collaborationCanEdit && (
          <MoreTools
            open={moreToolsOpen}
            anchor={moreToolsAnchor}
            position={positionMoreToolsButton}
            activateTool={activateMoreTool}
            toggle={togglePanel}
            canEdit={collaborationCanEdit}
            placement="header"
          />
        )}

      </DesktopAppHeader>

      <div className={`desktop-workspace ${collaborationCanEdit ? "desktop-workspace-editable" : "desktop-workspace-viewer"} ${libraryOpen ? "desktop-workspace-library-open" : "desktop-workspace-library-closed"} ${propertiesOpen || architectureValidationOpen ? "desktop-workspace-context-open" : "desktop-workspace-context-closed"}`}>
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

        <section className="desktop-canvas-region" aria-label="Canvas workspace">
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
            selectedElements={selectedElements}
            applyToSelected={applyToSelected}
            onOpenProperties={() => openPanel("properties")}
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
          className={`desktop-context-region ${propertiesOpen ? "properties-state-open" : "properties-state-closed"} ${architectureValidationOpen ? "validation-state-open" : "validation-state-closed"}`}
          aria-label="Properties and architecture validation"
        >
          {collaborationCanEdit && selectedCount > 0 && (propertiesOpen || architectureValidationOpen) && (
            <div className={`desktop-properties-host ${propertiesOpen ? "is-open" : "is-closed"}`}>
              <PropertiesPanel
                selectedCount={selectedCount} propertiesOpen={propertiesOpen}
                setPropertiesOpen={(next) => (next ? openPanel("properties") : closePanel("properties"))} firstSelected={firstSelected}
                hasShapeSelection={hasShapeSelection} hasArrowSelection={hasArrowSelection}
                hasTextSelection={hasTextSelection} applyToSelected={applyToSelected}
                applyToSelectedArrow={applyToSelectedArrow} updateSingleSelected={updateSingleSelected}
                awsResource={selectedAwsResource} awsResourceDefinition={selectedAwsResourceDefinition} updateAwsResource={updateSelectedAwsResource}
                kubernetesResource={selectedKubernetesResource} kubernetesResourceDefinition={selectedKubernetesResourceDefinition} updateKubernetesResource={updateSelectedKubernetesResource}
                networkingResource={selectedNetworkingResource} networkingResourceDefinition={selectedNetworkingResourceDefinition} updateNetworkingResource={updateSelectedNetworkingResource}
                architectureRelationship={selectedArchitectureRelationship} architectureRelationshipTypes={["traffic-flow", "contains", "routes-to", "depends-on", "connects-to"]} updateArchitectureRelationshipType={updateSelectedArchitectureRelationshipType}
                awsRelationship={selectedAwsRelationship} relationshipTypes={AWS_RELATIONSHIP_TYPES} updateAwsRelationshipType={updateSelectedAwsRelationshipType}
                kubernetesRelationship={selectedKubernetesRelationship} kubernetesRelationshipTypes={KUBERNETES_RELATIONSHIP_TYPES} updateKubernetesRelationshipType={updateSelectedKubernetesRelationshipType} kubernetesRelationshipGuidance={selectedKubernetesRelationshipGuidance}
                readOnly={!collaborationCanEdit} authorship={collaborationAuthorship} selfId={collaborationClientId} participants={collaborationParticipants}
              />
            </div>
          )}

          {(propertiesOpen || architectureValidationOpen) && (
            <div className={`desktop-validation-host ${architectureValidationOpen ? "is-open" : "is-closed"}`}>
              <ArchitectureValidationPanel
                validation={architectureValidation}
                sceneElements={apiRef.current?.getSceneElements?.() || []}
                onClose={() => closePanel("architecture-validation")}
                onSelectDiagnostic={selectArchitectureDiagnostic}
                onApplyKubernetesSuggestion={applyKubernetesSuggestion}
                canApplyCorrections={collaborationCanEdit}
              />
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
      {dockerStudioOpen && <DockerComposeStudio onClose={() => setDockerStudioOpen(false)} onCreateDiagram={createComposeDiagram} />}
      {kubernetesStudioOpen && <KubernetesStudio onClose={() => setKubernetesStudioOpen(false)} onCreateDiagram={createKubernetesDiagram} />}
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
