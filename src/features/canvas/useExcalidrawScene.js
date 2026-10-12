import { useCallback, useEffect, useRef } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import {
  DEFAULT_FONT_FAMILY_ID,
  detectFontFamilyPreferenceChange,
  getTextFontFamilyMap,
  normalizeFontFamilyId,
} from "./fontFamilyDefaults.js";
import { syncAwsRelationshipMetadata } from "../aws-relationships/awsRelationshipService";
import { syncKubernetesRelationshipMetadata } from "../kubernetes-relationships/kubernetesRelationshipService";
import {
  measureSyncDiagnostic,
  recordSyncDiagnostic,
  summarizeSyncRecords,
  syncDiagnosticNow,
  syncDiagnosticsEnabled,
} from "../collaboration/syncDiagnostics";

export function useExcalidrawScene({
  apiRef, nativeMenuOpenRef, setNativeMenuOpen, setActivePanel,
  lastSelectionSignature, setSelectedCount, setSelectedElements, setSelectedConnector,
  updateMinimap, queueSketchSave, collaborationRemoteUpdateRef,
  collaborationRef, gridEnabled, gridSize, canEdit = true, onArchitectureSceneChange = () => {},
}) {
  const architectureFrameRef = useRef(null);
  const latestArchitectureElementsRef = useRef(null);
  const previousFontAppStateRef = useRef(null);
  const previousTextFontFamiliesRef = useRef(new Map());
  const preferredFontFamilyRef = useRef(null);

  const scheduleArchitectureSceneChange = useCallback((elements) => {
    latestArchitectureElementsRef.current = elements;
    if (architectureFrameRef.current !== null) return;

    const flush = () => {
      architectureFrameRef.current = null;
      const latestElements = latestArchitectureElementsRef.current;
      latestArchitectureElementsRef.current = null;
      if (latestElements) {
        measureSyncDiagnostic("client.architectureAnalysis", { elementCount: latestElements.length }, () => onArchitectureSceneChange(latestElements));
      }
    };

    if (typeof requestAnimationFrame === "function") {
      architectureFrameRef.current = requestAnimationFrame(flush);
    } else {
      architectureFrameRef.current = setTimeout(flush, 16);
    }
  }, [onArchitectureSceneChange]);

  useEffect(() => () => {
    if (architectureFrameRef.current === null) return;
    if (typeof cancelAnimationFrame === "function") cancelAnimationFrame(architectureFrameRef.current);
    else clearTimeout(architectureFrameRef.current);
    architectureFrameRef.current = null;
  }, []);

  return useCallback((elements, appState) => {
    const diagnosticsEnabled = syncDiagnosticsEnabled();
    const callbackStartedAt = diagnosticsEnabled ? syncDiagnosticNow() : 0;
    const inputSummary = diagnosticsEnabled ? summarizeSyncRecords(elements) : null;
    const remoteUpdate = collaborationRemoteUpdateRef.current;
    const intermediateFreeDraw = appState?.newElement?.type === "freedraw";
    if (diagnosticsEnabled) {
      if (syncDiagnosticsEnabled()) recordSyncDiagnostic("client.sceneCallback.started", {
        elementsExamined: elements?.length || 0,
        deletedElements: inputSummary?.deletedCount || 0,
        elementTypeCounts: inputSummary?.typeCounts || {},
        remoteUpdate,
        intermediateFreeDraw,
        selectedCount: Object.keys(appState?.selectedElementIds || {}).length,
      });
    }

    try {
      const skipRelationshipSync = remoteUpdate || intermediateFreeDraw;

      const awsRelationshipSync = canEdit && !skipRelationshipSync
        ? measureSyncDiagnostic("client.awsRelationshipSync", { elementCount: elements?.length || 0 }, () => syncAwsRelationshipMetadata(elements))
        : { elements, changed: false };
      const kubernetesRelationshipSync = canEdit && !skipRelationshipSync
        ? measureSyncDiagnostic("client.kubernetesRelationshipSync", { elementCount: awsRelationshipSync.elements?.length || 0 }, () => syncKubernetesRelationshipMetadata(awsRelationshipSync.elements))
        : { elements: awsRelationshipSync.elements, changed: false };
      const effectiveElements = kubernetesRelationshipSync.elements;
      const relationshipSyncChanged = awsRelationshipSync.changed || kubernetesRelationshipSync.changed;
      scheduleArchitectureSceneChange(effectiveElements);
      if (relationshipSyncChanged) {
        apiRef.current?.updateScene({ elements: effectiveElements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
      }
      const selectedIds = Object.keys(appState.selectedElementIds || {});
      const effectiveElementsById = new Map(effectiveElements.map((element) => [element.id, element]));
      const elementById = selectedIds.length ? effectiveElementsById : null;
      const selected = selectedIds.map((id) => elementById?.get(id)).filter(Boolean);

      const selectedConnector = selected.length === 1 && (selected[0]?.type === "arrow" || selected[0]?.type === "line")
        ? selected[0]
        : null;
      const signature = selected.map((element) => `${element.id}:${element.version}:${element.versionNonce}`).sort().join(",");
      const nativeOpen = appState.openMenu === "canvas";
      if (nativeOpen !== nativeMenuOpenRef.current) {
        nativeMenuOpenRef.current = nativeOpen;
        setNativeMenuOpen(nativeOpen);
        if (nativeOpen) setActivePanel(null);
      }
      if (signature !== lastSelectionSignature.current) {
        lastSelectionSignature.current = signature;
        setSelectedCount(selected.length);
        setSelectedElements(selected);
        setSelectedConnector(selected.length === 1 && selected[0]?.type === "arrow" ? selected[0] : null);
      }
      measureSyncDiagnostic("client.minimapUpdate", { elementCount: effectiveElements.length }, () => updateMinimap(effectiveElements, appState));
      // Prefer Excalidraw's live app state over the possibly stale onChange
      // snapshot when saving. This matters for currentItemFontFamily because it
      // is the default for text elements created after the current one.
      if (!collaborationRemoteUpdateRef.current) {
        collaborationRef.current?.setSelection(selectedIds);
        const files = apiRef.current?.getFiles?.() || {};
        measureSyncDiagnostic("client.broadcastLocalChange", {
          elementCount: effectiveElements.length,
          fileCount: Object.keys(files).length,
        }, () => collaborationRef.current?.broadcastLocalChange(effectiveElements, files, appState));
      }
      if (gridEnabled && appState.gridModeEnabled !== true) {
        // Update only the grid fields. Spreading a stale onChange appState here
        // can roll back currentItemFontFamily immediately after font selection.
        apiRef.current?.updateScene({
          appState: { gridModeEnabled: true, gridSize, gridStep: gridSize },
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      }

      // currentItemFontFamily is Excalidraw's default for new text, separate
      // from the fontFamily on the currently selected text element. Capture a
      // pick while the popup is open and preserve it across subsequent changes.
      const api = apiRef.current;
      const liveAppState = api?.getAppState?.() || appState || {};
      const detectedFontChoice = detectFontFamilyPreferenceChange({
        previousAppState: previousFontAppStateRef.current,
        appState: liveAppState,
        previousTextFontFamilies: previousTextFontFamiliesRef.current,
        elements: effectiveElements,
        ignoreElementChanges: Boolean(remoteUpdate),
      });
      if (detectedFontChoice !== null) {
        preferredFontFamilyRef.current = detectedFontChoice;
      } else if (preferredFontFamilyRef.current === null) {
        preferredFontFamilyRef.current = normalizeFontFamilyId(liveAppState.currentItemFontFamily)
          ?? DEFAULT_FONT_FAMILY_ID;
      }

      const preferredFontFamily = preferredFontFamilyRef.current;
      const actualFontFamily = normalizeFontFamilyId(api?.getAppState?.()?.currentItemFontFamily);
      if (
        api?.updateScene &&
        preferredFontFamily !== null &&
        preferredFontFamily !== undefined &&
        liveAppState.openPopup !== "fontFamily" &&
        actualFontFamily !== preferredFontFamily
      ) {
        api.updateScene({
          appState: { currentItemFontFamily: preferredFontFamily },
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      }

      const reconciledAppState = api?.getAppState?.() || liveAppState;
      previousFontAppStateRef.current = {
        openPopup: reconciledAppState.openPopup,
        currentItemFontFamily: normalizeFontFamilyId(reconciledAppState.currentItemFontFamily),
      };
      previousTextFontFamiliesRef.current = getTextFontFamilyMap(effectiveElements);

      // Queue persistence after font-default reconciliation so a stale callback
      // snapshot cannot save the default family immediately after a font pick.
      const persistenceAppState = api?.getAppState?.() || reconciledAppState;
      measureSyncDiagnostic("client.persistenceQueue", { elementCount: effectiveElements.length }, () => queueSketchSave(effectiveElements, persistenceAppState));
    } finally {
      if (diagnosticsEnabled) {
        if (syncDiagnosticsEnabled()) recordSyncDiagnostic("client.sceneCallback.completed", {
          durationMs: Math.max(0, syncDiagnosticNow() - callbackStartedAt),
          elementsExamined: elements?.length || 0,
          remoteUpdate,
          intermediateFreeDraw,
        });
      }
    }
  }, [apiRef, collaborationRef, collaborationRemoteUpdateRef, gridEnabled, gridSize, lastSelectionSignature, nativeMenuOpenRef, queueSketchSave, scheduleArchitectureSceneChange, setActivePanel, setNativeMenuOpen, setSelectedConnector, setSelectedCount, setSelectedElements, updateMinimap]);
}
