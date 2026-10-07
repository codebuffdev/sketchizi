import { useCallback } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { syncAwsRelationshipMetadata } from "../aws-relationships/awsRelationshipService";
import { syncKubernetesRelationshipMetadata } from "../kubernetes-relationships/kubernetesRelationshipService";

export function useExcalidrawScene({
  apiRef, nativeMenuOpenRef, setNativeMenuOpen, setActivePanel,
  lastSelectionSignature, setSelectedCount, setSelectedElements, setSelectedConnector,
  propertiesAutoOpen, updateMinimap, queueSketchSave, collaborationRemoteUpdateRef,
  collaborationRef, gridEnabled, gridSize, canEdit = true, onArchitectureSceneChange = () => {},
}) {
  return useCallback((elements, appState) => {
    const awsRelationshipSync = canEdit ? syncAwsRelationshipMetadata(elements) : { elements, changed: false };
    const kubernetesRelationshipSync = canEdit
      ? syncKubernetesRelationshipMetadata(awsRelationshipSync.elements)
      : { elements: awsRelationshipSync.elements, changed: false };
    const effectiveElements = kubernetesRelationshipSync.elements;
    const relationshipSyncChanged = awsRelationshipSync.changed || kubernetesRelationshipSync.changed;
    onArchitectureSceneChange(effectiveElements);
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
      if (propertiesAutoOpen && canEdit) {
        if (selected.length > 0) {
          if (!nativeOpen) setActivePanel((current) => current === null ? "properties" : current);
        } else setActivePanel((current) => current === "properties" ? null : current);
      }
    }
    updateMinimap(effectiveElements, appState);
    queueSketchSave(effectiveElements, appState);
    if (!collaborationRemoteUpdateRef.current) {
      collaborationRef.current?.setSelection(selectedIds);
      collaborationRef.current?.broadcastLocalChange(effectiveElements, apiRef.current?.getFiles?.() || {}, appState);
    }
    if (gridEnabled && appState.gridModeEnabled !== true) {
      apiRef.current?.updateScene({ appState: { ...appState, gridModeEnabled: true, gridSize, gridStep: gridSize }, captureUpdate: CaptureUpdateAction.NEVER });
    }
  }, [apiRef, canEdit, collaborationRef, collaborationRemoteUpdateRef, gridEnabled, gridSize, lastSelectionSignature, nativeMenuOpenRef, propertiesAutoOpen, queueSketchSave, setActivePanel, setNativeMenuOpen, setSelectedConnector, setSelectedCount, setSelectedElements, updateMinimap, onArchitectureSceneChange]);
}
