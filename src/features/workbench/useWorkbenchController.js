import { useCallback, useEffect, useState } from "react";
import { CaptureUpdateAction, convertToExcalidrawElements, viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import {
  activateWorkbenchView,
  createWorkbenchExtension,
  readWorkbenchDocument,
  withWorkbenchExtension,
} from "./workbenchDocument.js";
import { WORKBENCH_COMPONENTS, WORKBENCH_VIEWS } from "./workbenchRegistry.js";

function makeId(prefix) {
  const uuid = globalThis.crypto?.randomUUID?.();
  return `${prefix}-${uuid || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`}`;
}

function emptyScene(appState = {}) {
  return { elements: [], appState: structuredClone(appState || {}), files: {} };
}

function currentScene(api) {
  const elements = api.getSceneElementsIncludingDeleted?.() || api.getSceneElements() || [];
  const sourceFiles = api.getFiles?.() || {};
  // Excalidraw's in-memory file cache can be a union of images visited in other
  // views. Keep only files referenced by this scene so inactive layouts remain
  // self-contained without accumulating unrelated binary payloads.
  const referencedFileIds = new Set(elements.filter((element) => !element.isDeleted && element.type === "image" && element.fileId).map((element) => element.fileId));
  const files = Object.fromEntries(Object.entries(sourceFiles).filter(([id, file]) => referencedFileIds.has(id) || referencedFileIds.has(file?.id)));
  return { elements, appState: api.getAppState?.() || {}, files };
}

export function useWorkbenchController({ apiRef, documentMetadataRef, sketchReady, savedSketch, canEdit, persistSketchNow, showToast }) {
  const [workbench, setWorkbench] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!sketchReady) return;
    try {
      const drawing = {
        ...(savedSketch || {}),
        extensions: documentMetadataRef.current?.extensions || savedSketch?.extensions || {},
      };
      const parsed = readWorkbenchDocument({
        elements: savedSketch?.elements || [],
        appState: savedSketch?.appState || {},
        files: savedSketch?.files || {},
        extensions: drawing.extensions,
      });
      setWorkbench(parsed.workbench);
    } catch (error) {
      setWorkbench(null);
      showToast?.(`Workbench metadata could not be loaded: ${error.message}`, "error");
    }
  }, [sketchReady, savedSketch, documentMetadataRef, showToast]);

  const saveDocument = useCallback((nextWorkbench, scene = null) => {
    const api = apiRef.current;
    if (!api) throw new Error("The drawing canvas is not ready.");
    const metadata = documentMetadataRef.current || { metadata: {}, extensions: {}, format: "excalidraw" };
    documentMetadataRef.current = {
      ...metadata,
      format: "sketchizi",
      extensions: withWorkbenchExtension(metadata.extensions, nextWorkbench),
    };
    setWorkbench(structuredClone(nextWorkbench));
    const liveScene = scene || currentScene(api);
    const payload = {
      ...liveScene,
      metadata: documentMetadataRef.current.metadata || {},
      extensions: documentMetadataRef.current.extensions,
      format: "sketchizi",
    };
    Promise.resolve(persistSketchNow?.(payload)).then((ok) => {
      if (ok === false) showToast?.("Workbench changes are in emergency recovery; local save failed.", "error");
    });
  }, [apiRef, documentMetadataRef, persistSketchNow, showToast]);

  const initialize = useCallback(() => {
    if (!canEdit) return;
    const api = apiRef.current;
    if (!api) { showToast?.("Canvas is still starting. Try again in a moment.", "error"); return; }
    if (workbench) { setIsOpen(true); return; }
    const savedExtension = documentMetadataRef.current?.extensions?.["com.sketchizi.workbench"];
    if (savedExtension) {
      try {
        const parsed = readWorkbenchDocument({ ...currentScene(api), extensions: documentMetadataRef.current.extensions });
        setWorkbench(parsed.workbench);
        setIsOpen(true);
        return;
      } catch (error) {
        showToast?.(`Saved Workbench data is invalid: ${error.message}`, "error");
        return;
      }
    }
    const live = currentScene(api);
    const views = WORKBENCH_VIEWS.map(({ id, label, description }) => ({ id, label, description }));
    const viewScenes = Object.fromEntries(views.filter((view) => view.id !== "system").map((view) => [view.id, emptyScene(live.appState)]));
    const next = createWorkbenchExtension({ activeViewId: "system", views, entities: [], relations: [], viewScenes, modelRevision: 0 });
    documentMetadataRef.current = {
      ...(documentMetadataRef.current || {}), format: "sketchizi",
      extensions: withWorkbenchExtension(documentMetadataRef.current?.extensions, next),
    };
    setWorkbench(next);
    setIsOpen(true);
    saveDocument(next, live);
    showToast?.("Engineering Workbench enabled for this document.");
  }, [apiRef, canEdit, documentMetadataRef, saveDocument, showToast, workbench]);

  const switchView = useCallback((targetViewId) => {
    if (!canEdit || busy || !workbench) return;
    const api = apiRef.current;
    if (!api || targetViewId === workbench.activeViewId) return;
    setBusy(true);
    try {
      const seeded = structuredClone(workbench);
      for (const view of seeded.views) {
        if (view.id !== seeded.activeViewId && !seeded.viewScenes[view.id]) {
          seeded.viewScenes[view.id] = emptyScene(api.getAppState?.() || {});
        }
      }
      const result = activateWorkbenchView({ workbench: seeded, currentScene: currentScene(api), targetViewId });
      documentMetadataRef.current = {
        ...(documentMetadataRef.current || {}), format: "sketchizi",
        extensions: withWorkbenchExtension(documentMetadataRef.current?.extensions, result.workbench),
      };
      api.updateScene({
        elements: result.scene.elements,
        appState: { ...api.getAppState(), ...result.scene.appState, selectedElementIds: {}, selectedGroupIds: {}, selectedGroupForOperation: null },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      const files = Object.values(result.scene.files || {});
      if (files.length) api.addFiles?.(files);
      saveDocument(result.workbench, currentScene(api));
    } catch (error) {
      showToast?.(`Could not switch Workbench view: ${error.message}`, "error");
    } finally {
      setBusy(false);
    }
  }, [apiRef, busy, canEdit, documentMetadataRef, saveDocument, showToast, workbench]);

  const addComponent = useCallback((componentKind) => {
    if (!canEdit || busy) return;
    const api = apiRef.current;
    if (!api) return;
    const definition = WORKBENCH_COMPONENTS.find((item) => item.kind === componentKind);
    if (!definition) return;
    setBusy(true);
    try {
      let next = workbench;
      if (!next) {
        const live = currentScene(api);
        const views = WORKBENCH_VIEWS.map(({ id, label, description }) => ({ id, label, description }));
        const viewScenes = Object.fromEntries(views.filter((view) => view.id !== "system").map((view) => [view.id, emptyScene(live.appState)]));
        next = createWorkbenchExtension({ activeViewId: "system", views, entities: [], relations: [], viewScenes, modelRevision: 0 });
      }
      const entityId = makeId("entity");
      const entity = { id: entityId, kind: definition.kind, name: definition.label, properties: {}, createdAt: new Date().toISOString() };
      const canvas = document.querySelector(".excalidraw");
      const rect = canvas?.getBoundingClientRect?.() || { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
      const appState = api.getAppState();
      const center = viewportCoordsToSceneCoords({ clientX: rect.left + rect.width / 2, clientY: rect.top + rect.height / 2 }, appState);
      const existing = api.getSceneElementsIncludingDeleted?.() || api.getSceneElements?.() || [];
      const offset = (next.entities.length % 6) * 34;
      const x = center.x - 110 + offset;
      const y = center.y - 48 + offset;
      const groupId = makeId("workbench-group");
      const raw = [
        { type: "rectangle", x, y, width: 240, height: 96, strokeColor: definition.stroke, backgroundColor: definition.fill, fillStyle: "solid", strokeWidth: 2, roughness: 0, roundness: { type: 3 }, groupIds: [groupId], customData: { workbench: { entityId, viewId: next.activeViewId, role: "container" } } },
        { type: "text", x: x + 16, y: y + 18, width: 208, text: definition.label, fontSize: 19, fontFamily: 1, strokeColor: "#20232a", groupIds: [groupId], customData: { workbench: { entityId, viewId: next.activeViewId, role: "label" } } },
      ];
      const inserted = convertToExcalidrawElements(raw).map((element, index) => ({
        ...element,
        customData: { ...(element.customData || {}), workbench: { entityId, viewId: next.activeViewId, role: index === 0 ? "container" : "label" } },
      }));
      next = { ...structuredClone(next), modelRevision: next.modelRevision + 1, entities: [...next.entities, entity] };
      documentMetadataRef.current = {
        ...(documentMetadataRef.current || {}), format: "sketchizi",
        extensions: withWorkbenchExtension(documentMetadataRef.current?.extensions, next),
      };
      const ids = inserted.map((element) => element.id);
      api.updateScene({
        elements: [...existing, ...inserted],
        appState: { ...appState, selectedElementIds: Object.fromEntries(ids.map((id) => [id, true])), selectedGroupIds: {}, selectedGroupForOperation: null },
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      api.scrollToContent?.(inserted, { fitToViewport: false, animate: true });
      saveDocument(next, currentScene(api));
      setIsOpen(true);
    } catch (error) {
      showToast?.(`Could not add component: ${error.message}`, "error");
    } finally {
      setBusy(false);
    }
  }, [apiRef, busy, canEdit, documentMetadataRef, saveDocument, showToast, workbench]);

  const activeView = workbench?.views?.find((view) => view.id === workbench.activeViewId) || null;
  const selectedEntity = null; // Inspector editing is deliberately a later slice.
  return { workbench, isOpen, setIsOpen, busy, activeView, selectedEntity, initialize, switchView, addComponent };
}
