import { useCallback, useEffect, useRef, useState } from "react";
import { workspaceClient } from "./workspaceClient.js";

const DEBOUNCE_MS = 700;

function visibleElementCount(elements) {
  return (elements || []).filter((element) => element && !element.isDeleted && !element.deleted).length;
}

export function useCloudWorkspaceSync({ apiRef, documentMetadataRef }) {
  const params = new URLSearchParams(typeof window === "undefined" ? "" : window.location.search);
  const diagramId = params.get("workspace") === "editor" ? params.get("diagramId") : null;
  const revisionRef = useRef(null);
  const loadedDiagramRef = useRef(null);
  const baselineVisibleCountRef = useRef(0);
  const loadedAtRef = useRef(0);
  const latestSnapshotRef = useRef(null);
  const sequenceRef = useRef(0);
  const timerRef = useRef(null);
  const savingRef = useRef(false);
  const blockedRef = useRef(false);
  const readyRef = useRef(false);
  const [state, setState] = useState({
    enabled: Boolean(diagramId), status: diagramId ? "loading" : "local",
    revision: null, name: "", error: "", lastSavedAt: null,
  });

  const clearTimer = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  const flush = useCallback(async () => {
    if (!diagramId || !readyRef.current || savingRef.current || !latestSnapshotRef.current) return;
    const snapshot = latestSnapshotRef.current;
    latestSnapshotRef.current = null;
    const startedSequence = snapshot.sequence;
    savingRef.current = true;
    setState((current) => ({ ...current, status: "saving", error: "" }));
    const metadata = documentMetadataRef?.current || {};
    const format = metadata.format === "sketchizi" ? "sketchizi" : "excalidraw";
    const document = {
      type: format === "sketchizi" ? "sketchizi" : "excalidraw",
      version: 2,
      source: "https://sketchizi.pages.dev",
      elements: snapshot.elements,
      appState: snapshot.appState,
      files: snapshot.files,
      metadata: metadata.metadata || {},
      extensions: metadata.extensions || {},
      format,
    };
    try {
      const saved = await workspaceClient.saveDiagram(diagramId, {
        name: loadedDiagramRef.current.name || "Untitled diagram",
        format,
        document,
        revision: revisionRef.current,
      });
      revisionRef.current = saved.revision;
      const savedAt = saved.updatedAt ? Date.parse(saved.updatedAt) : Date.now();
      if (latestSnapshotRef.current || sequenceRef.current !== startedSequence) {
        setState((current) => ({ ...current, revision: saved.revision, status: "pending", error: "" }));
      } else {
        setState((current) => ({ ...current, revision: saved.revision, status: "saved", lastSavedAt: savedAt, error: "" }));
      }
    } catch (error) {
      latestSnapshotRef.current = latestSnapshotRef.current || snapshot;
      blockedRef.current = true;
      setState((current) => ({
        ...current,
        status: error.code === "revision_conflict" ? "conflict" : "error",
        error: error.message || "Cloud save failed. Your local recovery copy is still available.",
      }));
    } finally {
      savingRef.current = false;
      if (latestSnapshotRef.current && readyRef.current && !blockedRef.current) {
        clearTimer();
        timerRef.current = window.setTimeout(() => { timerRef.current = null; flush(); }, DEBOUNCE_MS);
      }
    }
  }, [clearTimer, diagramId, documentMetadataRef]);

  useEffect(() => {
    if (!diagramId) {
      setState({ enabled: false, status: "local", revision: null, name: "", error: "", lastSavedAt: null });
      return undefined;
    }
    let cancelled = false;
    readyRef.current = false;
    setState({ enabled: true, status: "loading", revision: null, name: "", error: "", lastSavedAt: null });
    workspaceClient.getDiagram(diagramId).then((diagram) => {
      if (cancelled) return;
      revisionRef.current = diagram.revision;
      loadedDiagramRef.current = diagram;
      baselineVisibleCountRef.current = visibleElementCount(diagram.document?.elements);
      loadedAtRef.current = Date.now();
      readyRef.current = true;
      setState({ enabled: true, status: "saved", revision: diagram.revision, name: diagram.name, error: "", lastSavedAt: diagram.updatedAt ? Date.parse(diagram.updatedAt) : null });
      if (latestSnapshotRef.current) {
        clearTimer();
        timerRef.current = window.setTimeout(() => { timerRef.current = null; flush(); }, DEBOUNCE_MS);
      }
    }).catch((error) => {
      if (cancelled) return;
      setState({ enabled: true, status: "error", revision: null, name: "", error: error.message || "Could not connect to Cloud Workspace.", lastSavedAt: null });
    });
    return () => {
      cancelled = true;
      readyRef.current = false;
      clearTimer();
    };
  }, [clearTimer, diagramId, flush]);

  const queueCloudSave = useCallback((elements, appState) => {
    if (!diagramId || !Array.isArray(elements)) return;
    const api = apiRef.current;
    if (!api) return;
    const visibleCount = visibleElementCount(elements);
    // Excalidraw can emit a transient empty scene during initialization. Keep a
    // previously non-empty cloud document intact during the initial restore window.
    if (baselineVisibleCountRef.current > 0 && visibleCount === 0 && Date.now() - loadedAtRef.current < 2000) return;
    blockedRef.current = false;
    sequenceRef.current += 1;
    latestSnapshotRef.current = {
      sequence: sequenceRef.current,
      elements: structuredClone(elements),
      appState: {
        viewBackgroundColor: appState?.viewBackgroundColor,
        scrollX: appState?.scrollX || 0,
        scrollY: appState?.scrollY || 0,
        zoom: appState?.zoom?.value ? { value: appState.zoom.value } : { value: appState?.zoom || 1 },
        gridModeEnabled: Boolean(appState?.gridModeEnabled),
        currentItemFontFamily: appState?.currentItemFontFamily,
        gridSize: appState?.gridSize,
        gridStep: appState?.gridStep,
      },
      files: structuredClone(api.getFiles?.() || {}),
    };
    if (!readyRef.current || savingRef.current) {
      setState((current) => ({ ...current, status: current.status === "error" ? "error" : "pending" }));
      return;
    }
    setState((current) => ({ ...current, status: "pending", error: "" }));
    clearTimer();
    timerRef.current = window.setTimeout(() => { timerRef.current = null; flush(); }, DEBOUNCE_MS);
  }, [apiRef, clearTimer, diagramId, flush]);

  const retryCloudSave = useCallback(() => {
    if (!diagramId || !latestSnapshotRef.current || !readyRef.current) return;
    blockedRef.current = false;
    clearTimer();
    timerRef.current = window.setTimeout(() => { timerRef.current = null; flush(); }, 0);
  }, [clearTimer, diagramId, flush]);

  return { state, queueCloudSave, retryCloudSave, diagramId };
}
