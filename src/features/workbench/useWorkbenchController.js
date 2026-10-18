import { useCallback, useEffect, useState } from "react";
import { CaptureUpdateAction, convertToExcalidrawElements, viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import {
  activateWorkbenchView,
  createWorkbenchExtension,
  readWorkbenchDocument,
  withWorkbenchExtension,
} from "./workbenchDocument.js";
import { WORKBENCH_COMPONENTS, WORKBENCH_RELATIONS, WORKBENCH_VIEWS } from "./workbenchRegistry.js";
import { createWorkbenchRelation, getComponentDefinition, validateRelationEndpoints, updateWorkbenchEntity } from "./workbenchModel.js";
import { attachWorkbenchRelationToArrow, findReusableVisualArrow } from "./typedRelationScene.js";
import { addMissingReactRestPostgresPocArtifacts, buildReactRestPostgresArtifactScaffoldingSceneDescriptors, buildReactRestPostgresPocSceneDescriptors, createReactRestPostgresPoc } from "./workbenchPocTemplate.js";

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

export function useWorkbenchController({ apiRef, documentMetadataRef, sketchReady, savedSketch, selectedElements = [], canEdit, persistSketchNow, showToast }) {
  const [workbench, setWorkbench] = useState(null);
  const [isOpen, setIsOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [inspectorError, setInspectorError] = useState("");

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

  const createPoc = useCallback(() => {
    if (!canEdit || busy) return false;
    const api = apiRef.current;
    if (!api) {
      showToast?.("Canvas is still starting. Try creating the POC again in a moment.", "error");
      return false;
    }
    if (!workbench) {
      showToast?.("Enable the Engineering Workbench before creating a POC.", "error");
      return false;
    }
    setBusy(true);
    try {
      // Build the complete semantic model and all scene descriptors before making
      // a single canvas/document update. Existing visual-only drawing is retained.
      const next = createReactRestPostgresPoc({ workbench, idFactory: makeId });
      const live = currentScene(api);
      const canvas = document.querySelector(".excalidraw");
      const rect = canvas?.getBoundingClientRect?.() || {
        left: 0, top: 0,
        width: globalThis.window?.innerWidth || 1280,
        height: globalThis.window?.innerHeight || 800,
      };
      const appStateBefore = api.getAppState?.() || live.appState || {};
      const center = viewportCoordsToSceneCoords({
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
      }, appStateBefore);
      const descriptors = buildReactRestPostgresPocSceneDescriptors({
        workbench: next,
        x: center.x - 560,
        y: center.y - 60,
        idFactory: makeId,
      });
      const inserted = convertToExcalidrawElements(descriptors).map((element, index) => ({
        ...element,
        customData: {
          ...(element.customData || {}),
          workbench: structuredClone(descriptors[index]?.customData?.workbench || {}),
        },
      }));
      const elements = [...live.elements, ...inserted];
      const clientId = next.entities.find((entity) => entity.kind === "frontend.react-app")?.id;
      const clientContainer = inserted.find((element) => element.customData?.workbench?.role === "container"
        && element.customData?.workbench?.entityId === clientId);
      if (!clientContainer) throw new Error("The POC canvas could not resolve its React application placement.");
      const selectedAppState = {
        ...appStateBefore,
        selectedElementIds: { [clientContainer.id]: true },
        selectedGroupIds: {},
        selectedGroupForOperation: null,
      };
      // Preflight extension validation before applying the scene update.
      withWorkbenchExtension(documentMetadataRef.current?.extensions, next);
      api.updateScene({
        elements,
        appState: selectedAppState,
        captureUpdate: CaptureUpdateAction.IMMEDIATELY,
      });
      saveDocument(next, { ...live, elements, appState: selectedAppState });
      try { api.scrollToContent?.(inserted, { fitToContent: true, fitToViewport: true, animate: true }); } catch { /* Canvas framing is best-effort; model creation has already succeeded. */ }
      setInspectorError("");
      setIsOpen(true);
      showToast?.("POC created with a typed request path, one API contract, and one PostgreSQL table. Review the synthetic assumptions before running experiments.");
      return true;
    } catch (error) {
      setInspectorError(error.message || "Could not create the POC.");
      showToast?.(`Could not create POC: ${error.message}`, "error");
      return false;
    } finally {
      setBusy(false);
    }
  }, [apiRef, busy, canEdit, documentMetadataRef, saveDocument, showToast, workbench]);


  const completePocArtifacts = useCallback(() => {
    if (!canEdit || busy) return false;
    const api = apiRef.current;
    if (!api) {
      showToast?.("Canvas is still starting. Try again in a moment.", "error");
      return false;
    }
    if (!workbench?.pocTemplate || workbench.pocTemplate.id !== "react-rest-postgresql") {
      showToast?.("Starter artifacts can only be added to the React + REST + PostgreSQL POC template.", "error");
      return false;
    }
    if (workbench.activeViewId !== "system") {
      showToast?.("Switch to the System view before adding starter artifacts.", "error");
      return false;
    }
    setBusy(true);
    try {
      const upgrade = addMissingReactRestPostgresPocArtifacts({ workbench, idFactory: makeId });
      if (!upgrade.changed) {
        showToast?.("The POC already has a starter API contract and SQL table.");
        return true;
      }
      const live = currentScene(api);
      const existingPlacements = {};
      const existingRelationIds = [];
      for (const element of live.elements) {
        if (element.isDeleted) continue;
        const semantic = element.customData?.workbench;
        if (!semantic) continue;
        if (semantic.role === "container" && semantic.entityId && Number.isFinite(element.x) && Number.isFinite(element.y)) {
          existingPlacements[semantic.entityId] = { x: element.x, y: element.y, width: element.width || 280, height: element.height || 120 };
        }
        if (semantic.role === "relation" && semantic.relationId) existingRelationIds.push(semantic.relationId);
      }
      const descriptors = buildReactRestPostgresArtifactScaffoldingSceneDescriptors({
        workbench: upgrade.workbench,
        existingPlacements,
        existingRelationIds,
        idFactory: makeId,
      });
      const inserted = convertToExcalidrawElements(descriptors).map((element, index) => ({
        ...element,
        customData: {
          ...(element.customData || {}),
          workbench: structuredClone(descriptors[index]?.customData?.workbench || {}),
        },
      }));
      const elements = [...live.elements, ...inserted];
      const firstNewContainer = inserted.find((element) => element.customData?.workbench?.role === "container");
      const appStateBefore = api.getAppState?.() || live.appState || {};
      const selectedAppState = {
        ...appStateBefore,
        selectedElementIds: firstNewContainer ? { [firstNewContainer.id]: true } : {},
        selectedGroupIds: {},
        selectedGroupForOperation: null,
      };
      withWorkbenchExtension(documentMetadataRef.current?.extensions, upgrade.workbench);
      api.updateScene({ elements, appState: selectedAppState, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
      saveDocument(upgrade.workbench, { ...live, elements, appState: selectedAppState });
      try { api.scrollToContent?.(inserted, { fitToViewport: false, animate: true }); } catch { /* Placement is committed; framing is best-effort. */ }
      setInspectorError("");
      setIsOpen(true);
      showToast?.("Starter API contract and PostgreSQL table added. Generate OpenAPI and SQL previews from ARTIFACTS.");
      return true;
    } catch (error) {
      setInspectorError(error.message || "Could not add starter artifacts.");
      showToast?.(`Could not add starter artifacts: ${error.message}`, "error");
      return false;
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
      const entity = { id: entityId, kind: definition.kind, name: definition.label, properties: Object.fromEntries((definition.properties || []).map((property) => [property.key, property.defaultValue])), createdAt: new Date().toISOString() };
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

  const selectedEntityIds = [...new Set((selectedElements || [])
    .map((element) => element?.customData?.workbench?.entityId)
    .filter(Boolean))];
  const selectedEntity = selectedEntityIds.length === 1
    ? workbench?.entities?.find((entity) => entity.id === selectedEntityIds[0]) || null
    : null;
  const visibleEntityIds = [...new Set((apiRef.current?.getSceneElements?.() || [])
    .filter((element) => !element.isDeleted && element?.customData?.workbench?.role === "container" && element.customData.workbench.viewId === workbench?.activeViewId)
    .map((element) => element.customData.workbench.entityId))];

  const updateEntity = useCallback((entityId, patch) => {
    if (!canEdit || !workbench) return;
    try {
      const entities = updateWorkbenchEntity(workbench.entities, entityId, patch);
      const next = { ...structuredClone(workbench), modelRevision: workbench.modelRevision + 1, entities };
      const target = entities.find((entity) => entity.id === entityId);
      const api = apiRef.current;
      const scene = currentScene(api);
      const elements = scene.elements.map((element) => {
        if (element?.customData?.workbench?.entityId !== entityId) return element;
        if (element.customData.workbench.role === "label") {
          return { ...element, text: target.name, width: Math.max(100, Math.min(400, target.name.length * 12)), originalText: target.name };
        }
        return element;
      });
      api.updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
      saveDocument(next, { ...scene, elements });
      setInspectorError("");
    } catch (error) {
      setInspectorError(error.message);
      showToast?.(`Could not update component: ${error.message}`, "error");
    }
  }, [apiRef, canEdit, saveDocument, showToast, workbench]);

  const createRelationBetween = useCallback(({ sourceId, kind, targetId }) => {
    if (!canEdit || !workbench) return false;
    try {
      const sourceEntity = workbench.entities.find((entity) => entity.id === sourceId);
      const targetEntity = workbench.entities.find((entity) => entity.id === targetId);
      if (!sourceEntity || !targetEntity) throw new Error("Choose two existing Workbench components before connecting them.");
      const validation = validateRelationEndpoints(kind, sourceEntity, targetEntity);
      if (!validation.valid) throw new Error(validation.reason);
      const duplicate = workbench.relations.some((relation) => relation.kind === kind && relation.sourceId === sourceEntity.id && relation.targetId === targetEntity.id);
      if (duplicate) throw new Error("This typed relationship already exists.");
      const api = apiRef.current;
      if (!api) throw new Error("The drawing canvas is not ready.");
      const scene = currentScene(api);
      const containers = new Map();
      for (const element of scene.elements) {
        const metadata = element?.customData?.workbench;
        if (metadata?.role === "container" && metadata.viewId === workbench.activeViewId && !element.isDeleted) containers.set(metadata.entityId, element);
      }
      const sourceShape = containers.get(sourceEntity.id);
      const targetShape = containers.get(targetEntity.id);
      if (!sourceShape || !targetShape) throw new Error("Both components must be placed in the active view before connecting them.");
      const relationId = makeId("relation");
      const relation = createWorkbenchRelation({ id: relationId, kind, sourceEntity, targetEntity, viewId: workbench.activeViewId });

      // If the user already drew and bound an ordinary arrow in the intended
      // direction, promote it instead of drawing a visually duplicate connector.
      const reusableArrowIndex = findReusableVisualArrow(scene.elements, sourceShape, targetShape, workbench.activeViewId);
      let elements;
      if (reusableArrowIndex >= 0) {
        elements = scene.elements.map((element, index) => index === reusableArrowIndex
          ? attachWorkbenchRelationToArrow(element, { relationId, viewId: workbench.activeViewId, kind })
          : element);
      } else {
        const sx = sourceShape.x + sourceShape.width / 2;
        const sy = sourceShape.y + sourceShape.height / 2;
        const tx = targetShape.x + targetShape.width / 2;
        const ty = targetShape.y + targetShape.height / 2;
        const dx = tx - sx; const dy = ty - sy;
        const width = Math.max(1, Math.abs(dx)); const height = Math.max(1, Math.abs(dy));
        const rawArrow = {
          type: "arrow", x: Math.min(sx, tx), y: Math.min(sy, ty), width, height,
          points: [[dx < 0 ? width : 0, dy < 0 ? height : 0], [dx < 0 ? 0 : width, dy < 0 ? 0 : height]],
          strokeWidth: 2, roughness: 0, endArrowhead: "arrow",
          customData: { workbench: { relationId, viewId: workbench.activeViewId, role: "relation", kind } },
        };
        const arrow = convertToExcalidrawElements([rawArrow]).map((element) => ({
          ...element,
          customData: { ...(element.customData || {}), workbench: { relationId, viewId: workbench.activeViewId, role: "relation", kind } },
        }));
        elements = [...scene.elements, ...arrow];
      }
      const next = { ...structuredClone(workbench), modelRevision: workbench.modelRevision + 1, relations: [...workbench.relations, relation] };
      api.updateScene({ elements, appState: { ...api.getAppState(), selectedElementIds: {}, selectedGroupIds: {}, selectedGroupForOperation: null }, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
      saveDocument(next, { ...scene, elements });
      setInspectorError("");
      return true;
    } catch (error) {
      setInspectorError(error.message);
      showToast?.(`Could not create typed relationship: ${error.message}`, "error");
      return false;
    }
  }, [apiRef, canEdit, saveDocument, showToast, workbench]);

  const createRelation = useCallback(({ kind, targetId }) => {
    if (!selectedEntity) {
      setInspectorError("Select a Workbench component on the canvas before creating a relationship.");
      return false;
    }
    return createRelationBetween({ sourceId: selectedEntity.id, kind, targetId });
  }, [createRelationBetween, selectedEntity]);

  const focusFinding = useCallback((finding) => {
    if (!workbench || !finding?.entityIds?.length) return;
    const entityIds = new Set(finding.entityIds);
    const findContainer = (scene) => (scene?.elements || []).find((element) => !element.isDeleted
      && element?.customData?.workbench?.role === "container"
      && entityIds.has(element.customData.workbench.entityId));
    const api = apiRef.current;
    if (!api) return;
    const focus = () => {
      const container = findContainer(currentScene(api));
      if (!container) {
        showToast?.("This finding's component is not placed in the active view yet.", "info");
        return;
      }
      api.updateScene({ appState: { ...api.getAppState(), selectedElementIds: { [container.id]: true }, selectedGroupIds: {}, selectedGroupForOperation: null } });
      api.scrollToContent?.([container], { fitToViewport: false, animate: true });
    };
    if (findContainer(currentScene(api))) {
      focus();
      return;
    }
    const destination = (workbench.views || []).find((view) => findContainer(workbench.viewScenes?.[view.id]));
    if (!destination || destination.id === workbench.activeViewId) {
      showToast?.("This component has no canvas placement yet.", "info");
      return;
    }
    switchView(destination.id);
    globalThis.requestAnimationFrame?.(() => globalThis.requestAnimationFrame?.(focus));
  }, [apiRef, showToast, switchView, workbench]);

  const updateSimulationProfile = useCallback((profile) => {
    if (!canEdit || !workbench) return;
    try {
      const next = { ...structuredClone(workbench), simulationProfile: structuredClone(profile) };
      saveDocument(next);
      setInspectorError("");
    } catch (error) {
      setInspectorError(error.message);
      showToast?.(`Could not save simulation profile: ${error.message}`, "error");
    }
  }, [canEdit, saveDocument, showToast, workbench]);

  const updateSimulationHistory = useCallback((history) => {
    if (!canEdit || !workbench) return;
    try {
      const next = { ...structuredClone(workbench), simulationHistory: structuredClone(history) };
      saveDocument(next);
      setInspectorError("");
    } catch (error) {
      setInspectorError(error.message);
      showToast?.(`Could not save simulation history: ${error.message}`, "error");
    }
  }, [canEdit, saveDocument, showToast, workbench]);

  const activeView = workbench?.views?.find((view) => view.id === workbench.activeViewId) || null;
  return { workbench, isOpen, setIsOpen, busy, activeView, selectedEntity, visibleEntityIds, inspectorError, clearInspectorError: () => setInspectorError(""), updateEntity, createRelation, createRelationBetween, updateSimulationProfile, updateSimulationHistory, focusFinding, initialize, switchView, addComponent, createPoc, completePocArtifacts };
}
