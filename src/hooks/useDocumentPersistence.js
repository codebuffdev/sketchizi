import { useCallback, useEffect, useRef, useState } from "react";
import { useSketchPersistence } from "../features/persistence/useSketchPersistence";
import { createRevisionRegistry, sceneFingerprint, isRevisionConflict, classifyConflict } from "../features/workspace/cloudSaveGuard.js";
import { useChapterNavigation, buildChapterEditorUrl } from "../features/workspace/useChapterNavigation.js";
import { workspaceClient } from "../features/workspace/workspaceClient.js";
import { createCloudDocument, sanitizeCloudAppState } from "../features/workspace/cloudDocument.js";
import { saveCanvasTabs } from "../persistence.js";
import { getPages } from "../features/pages/pageModel.js";
import { hasCloudSceneChange, allowsEmptyCloudSave, isActiveCloudSession, resolveCloudLoadTarget } from "../features/workspace/cloudSavePolicy.js";
import { normalizeCloudDiagramResponse } from "../features/workspace/cloudDiagramPayload.js";
import { restoreElements, CaptureUpdateAction } from "@excalidraw/excalidraw";
import { measureCloudPayloadBytes } from "../features/workspace/cloudDocument.js";
import { inspectCloudPayload } from "../features/workspace/cloudPayloadPolicy.js";
import { optimizeEmbeddedImages } from "../features/workspace/cloudImageOptimizer.js";
import { formatBytes, resolveCloudLimitBytes } from "../features/canvas/imageImport/imageSizePolicy.js";
import { hydrateFilesSync, hydrateMissingFromCache } from "../features/workspace/binaryFileCache.js";
import { recordWorkspaceItemOpened } from "../features/workspace/workspacePresentation.js";

/**
 * Document persistence & recovery: IndexedDB/local autosave (useSketchPersistence),
 * cloud save queue, revision/conflict bookkeeping, cloud load + page-hide flush,
 * and chapter navigation for the open cloud diagram.
 *
 * Moved verbatim out of App.jsx; declaration order (and therefore effect order) is unchanged.
 */
export function useDocumentPersistence({
  activeCanvasIdRef,
  apiReady,
  apiRef,
  canvasTabsReady,
  canvasTabsRef,
  commitCanvasTabs,
  setCanvasTabs,
  setCurrentFileRef,
  showToast,
} = {}) {
  // useFileManager is declared after this hook (it consumes queueSketchSave, resetLocalSketch
  // and setSavedSketch from here). App assigns this ref right after calling useFileManager;
  // both values are referentially stable (a useRef and a useCallback with []), so reading
  // them through the ref is equivalent to the original late-bound closure capture.
  const fileManagerBridgeRef = useRef({ currentFileRef: { current: null }, getCurrentFileSceneSignature: null });

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
  // Deferred compression prompt for local -> cloud migration (see saveDrawingToCloud).
  const [cloudOptimizePrompt, setCloudOptimizePrompt] = useState(null);
  const cloudOptimizeResolverRef = useRef(null);
  const cloudOptimizeAbortRef = useRef(null);
  const askCloudOptimize = useCallback((details) => new Promise((resolve) => {
    cloudOptimizeResolverRef.current = resolve;
    setCloudOptimizePrompt({ ...details, busy: false });
  }), []);
  const closeCloudOptimize = useCallback(() => {
    cloudOptimizeResolverRef.current = null;
    cloudOptimizeAbortRef.current = null;
    setCloudOptimizePrompt(null);
  }, []);
  const confirmCloudOptimize = useCallback(() => {
    setCloudOptimizePrompt((current) => (current ? { ...current, busy: true } : current));
    cloudOptimizeResolverRef.current?.("shrink");
  }, []);
  const keepCloudLocalOnly = useCallback(() => {
    if (cloudOptimizeAbortRef.current) { cloudOptimizeAbortRef.current.abort(); return; }
    cloudOptimizeResolverRef.current?.("local");
    closeCloudOptimize();
  }, [closeCloudOptimize]);

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
    let document = createCloudDocument({
      api,
      metadata: documentMetadataRef.current,
    });
    // Pre-upload inspection: local canvases hold full-resolution images, so the role limit
    // (4 MB admin / 2 MB standard, plan-configurable) is checked here, once, before the upload.
    const maxBytes = resolveCloudLimitBytes(limits);
    const report = inspectCloudPayload({ document, totalBytes: measureCloudPayloadBytes(document), maxBytes });
    if (report.exceeds) {
      const names = new Map(report.images.map((image) => [image.id, image]));
      const decision = await askCloudOptimize({
        totalBytes: report.totalBytes,
        maxBytes,
        isAdmin: Boolean(limits?.admin),
        feasible: report.plan.feasible,
        images: (report.plan.feasible ? report.plan.targets : report.images.slice(0, 5)).map((item) => names.get(item.id) || item),
      });
      if (decision !== "shrink") {
        // Keep Local Only: nothing was uploaded and the full-resolution diagram stays in local storage.
        closeCloudOptimize();
        setCloudSaveDialogOpen(false);
        showToast("Kept local only — the full-resolution diagram was not uploaded", "info");
        return;
      }
      const controller = new AbortController();
      cloudOptimizeAbortRef.current = controller;
      try {
        await optimizeEmbeddedImages({
          api,
          targets: report.plan.targets,
          signal: controller.signal,
          onProgress: (index, total) => setCloudOptimizePrompt((current) => (current ? { ...current, progress: `${index + 1}/${total}` } : current)),
        });
      } catch (cause) {
        closeCloudOptimize();
        if (cause?.name === "AbortError") {
          setCloudSaveDialogOpen(false);
          showToast("Kept local only — the full-resolution diagram was not uploaded", "info");
          return;
        }
        throw cause;
      }
      closeCloudOptimize();
      document = createCloudDocument({ api, metadata: documentMetadataRef.current });
      const optimizedBytes = measureCloudPayloadBytes(document);
      if (optimizedBytes > maxBytes) {
        throw new Error(`After optimizing, this drawing is still ${formatBytes(optimizedBytes)}, above the ${formatBytes(maxBytes)} Cloud Workspace limit. Remove some content or keep it local only.`);
      }
      showToast(`Optimized images: ${formatBytes(report.totalBytes)} → ${formatBytes(optimizedBytes)}`, "success");
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
    const sceneElements = activeApi?.getSceneElementsIncludingDeleted?.() || activeApi?.getSceneElements?.() || [];
    const sceneAppState = activeApi?.getAppState?.() || {};
    const chapterFrames = getPages(sceneElements);
    const chapters = chapterFrames.map((frame, index) => ({
      id: frame.id,
      num: frame.customData?.pageOrder ?? index + 1,
      title: frame.customData?.chapterTitle || frame.name || `Chapter ${index + 1}`,
      tagline: frame.customData?.tagline || "",
      badge: frame.customData?.badge || "RULE OF THUMB",
      keyNote: frame.customData?.keyNote || "",
      completed: Boolean(frame.customData?.completed),
      paperTexture: frame.customData?.paperTexture || "Dots",
      elements: sceneElements.filter(element => element.id === frame.id || element.frameId === frame.id || element.customData?.sketchiziPagePaper === frame.id),
      appState: frame.customData?.chapterAppState || { zoom: sceneAppState.zoom, scrollX: sceneAppState.scrollX, scrollY: sceneAppState.scrollY },
    }));
    const activeChapterId = chapterFrames.find(frame => frame.customData?.activeChapterId)?.customData?.activeChapterId || null;
    const activeSnapshot = {
      elements: sceneElements,
      appState: sceneAppState, files: activeApi?.getFiles?.() || {},
      chapters, activeChapterId,
      metadata: documentMetadataRef.current?.metadata || {}, extensions: documentMetadataRef.current?.extensions || {},
      format: documentMetadataRef.current?.format || "excalidraw", file: fileManagerBridgeRef.current.currentFileRef.current || null,
      fileSceneSignature: fileManagerBridgeRef.current.getCurrentFileSceneSignature?.() || null,
      cloudSession: { ...cloudSessionRef.current }, cloudDetached: false,
      cloudSaveState: { state: "saved", error: "" }, cloudDocumentName: diagram.name || name.trim(),
    };
    const updatedTabs = canvasTabsRef.current.map((tab) => tab.id === activeCanvasIdRef.current ? { ...tab, snapshot: activeSnapshot, dirty: false } : tab);
    canvasTabsRef.current = updatedTabs;
    setCanvasTabs(updatedTabs);
    saveCanvasTabs(updatedTabs).catch(() => {});
  }, [showToast, askCloudOptimize, closeCloudOptimize]);

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

  return {
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
  };
}
