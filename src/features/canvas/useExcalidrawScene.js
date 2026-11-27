import { useCallback, useEffect, useRef } from "react";
import { toCanvasArrowhead } from "./arrowheads.js";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { getActiveSelectedElementIds } from "./selectedElementIds.js";
import { stripLegacyTextRuns } from "./legacyTextRuns.js";
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

// Stable default so omitted callbacks don't change identity every render
// (a fresh `() => {}` default re-created handleExcalidrawChange each render).
const NOOP_SCENE_CHANGE = () => {};

export function useExcalidrawScene({
  apiRef, nativeMenuOpenRef, setNativeMenuOpen, onNativeMenuOpen,
  lastSelectionSignature, setSelectedCount, setSelectedElements, setSelectedConnector,
  queueSketchSave, collaborationRemoteUpdateRef,
  collaborationRef, canEdit = true, onArchitectureSceneChange = NOOP_SCENE_CHANGE, onDocumentSceneChange = NOOP_SCENE_CHANGE,
  toolStylePresets = null,
}) {
  const architectureFrameRef = useRef(null);
  const latestArchitectureElementsRef = useRef(null);
  const previousFontAppStateRef = useRef(null);
  const previousTextFontFamiliesRef = useRef(new Map());
  const preferredFontFamilyRef = useRef(null);
  const defaultArrowRoutingAppliedRef = useRef(false);

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
      onDocumentSceneChange(effectiveElements);
      // Legacy per-run text colors are gone: flatten any saved/remote `runs` back to single-color text.
      const legacyRuns = canEdit && !remoteUpdate ? stripLegacyTextRuns(apiRef.current?.getSceneElementsIncludingDeleted?.() || effectiveElements) : { changed: false };
      if (legacyRuns.changed) apiRef.current?.updateScene({ elements: legacyRuns.elements, captureUpdate: CaptureUpdateAction.NEVER });
      const relationshipSyncChanged = awsRelationshipSync.changed || kubernetesRelationshipSync.changed;
      scheduleArchitectureSceneChange(effectiveElements);
      if (relationshipSyncChanged) {
        apiRef.current?.updateScene({ elements: effectiveElements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
      }
      const selectedIds = getActiveSelectedElementIds(appState.selectedElementIds);
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
        if (nativeOpen) onNativeMenuOpen?.();
      }
      if (signature !== lastSelectionSignature.current) {
        lastSelectionSignature.current = signature;
        setSelectedCount(selected.length);
        setSelectedElements(selected);
        setSelectedConnector(selected.length === 1 && selected[0]?.type === "arrow" ? selected[0] : null);
      }
      // Tool activation (dock, radial wheel, shortcuts L/A/R/P/T, API) restores the
      // style last used with that tool on this canvas. Selection and other
      // non-drawing tools never touch the stored presets.
      toolStylePresets?.handleSceneChange?.(appState, { canEdit });
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
      // A font restored from (or saved to) the Text tool preset is a deliberate
      // choice: adopt it so the reconciliation below does not revert it.
      const presetFontChoice = toolStylePresets?.consumeFontOverride?.();
      const normalizedPresetFont = presetFontChoice === null || presetFontChoice === undefined
        ? null
        : normalizeFontFamilyId(presetFontChoice);
      if (normalizedPresetFont !== null) {
        preferredFontFamilyRef.current = normalizedPresetFont;
      } else if (detectedFontChoice !== null) {
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

      // Legacy "dot" arrowheads (saved files, older presets) are not drawn as a
      // circle by this Excalidraw build and fall back to the V-chevron. Convert
      // them to the supported circle value once; nothing matches afterwards, so
      // this cannot loop.
      if (canEdit && !remoteUpdate && api?.updateScene) {
        const legacyDot = effectiveElements.some((element) =>
          !element.isDeleted && (element.startArrowhead === "dot" || element.endArrowhead === "dot"));
        const stateStart = reconciledAppState.currentItemStartArrowhead;
        const stateEnd = reconciledAppState.currentItemEndArrowhead;
        if (legacyDot || stateStart === "dot" || stateEnd === "dot") {
          const now = Date.now();
          api.updateScene({
            ...(legacyDot ? {
              elements: (api.getSceneElementsIncludingDeleted?.() || effectiveElements).map((element) =>
                element.startArrowhead === "dot" || element.endArrowhead === "dot"
                  ? {
                    ...element,
                    startArrowhead: toCanvasArrowhead(element.startArrowhead),
                    endArrowhead: toCanvasArrowhead(element.endArrowhead),
                    version: (Number(element.version) || 0) + 1,
                    versionNonce: Math.floor(Math.random() * 2147483647),
                    updated: now,
                  }
                  : element),
            } : {}),
            appState: {
              ...(stateStart === "dot" ? { currentItemStartArrowhead: toCanvasArrowhead(stateStart) } : {}),
              ...(stateEnd === "dot" ? { currentItemEndArrowhead: toCanvasArrowhead(stateEnd) } : {}),
            },
            captureUpdate: CaptureUpdateAction.NEVER,
          });
        }
      }

      // Free Polyline is the default routing for newly drawn arrows. Excalidraw's
      // own default ("round") turns every extra waypoint into a smooth curve,
      // which reads as crooked bends. Apply the sharp default once per session;
      // Curve / 90° Elbow stay one click away in the contextual toolbar.
      if (canEdit && !remoteUpdate && !defaultArrowRoutingAppliedRef.current && api?.updateScene) {
        defaultArrowRoutingAppliedRef.current = true;
        if (reconciledAppState.currentItemArrowType === "round" && !reconciledAppState.currentItemLineGeometry) {
          api.updateScene({ appState: { currentItemArrowType: "sharp" }, captureUpdate: CaptureUpdateAction.NEVER });
        }
      }

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
  }, [apiRef, collaborationRef, collaborationRemoteUpdateRef, lastSelectionSignature, nativeMenuOpenRef, queueSketchSave, scheduleArchitectureSceneChange, onNativeMenuOpen, setNativeMenuOpen, setSelectedConnector, setSelectedCount, setSelectedElements, onDocumentSceneChange, toolStylePresets, canEdit]);
}
