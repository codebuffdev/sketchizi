import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearEmergencyBackup,
  loadEmergencyBackup,
  loadSketch,
  saveEmergencyBackup,
  saveSketch,
  withDocumentMetadata,
} from "../../persistence";
import { logger } from "../../logging/logger";
import { serializeDrawing } from "../../fileSystem.js";

export function useSketchPersistence({ apiRef, documentMetadataRef }) {
  const [savedSketch, setSavedSketch] = useState(null);
  const [sketchReady, setSketchReady] = useState(false);
  const [storageError, setStorageError] = useState(null);
  const [saveStatus, setSaveStatus] = useState({ state: "restoring", lastSavedAt: null, error: null, emergencySaved: false });
  const saveTimerRef = useRef(null);
  const saveRequestRef = useRef(Promise.resolve());
  const saveRevisionRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    loadSketch().then((record) => {
      if (cancelled) return;
      logger.debug("Local sketch restored", { category: "persistence", hasSavedSketch: Boolean(record) });
      if (documentMetadataRef) {
        documentMetadataRef.current = {
          metadata: record?.metadata || {},
          extensions: record?.extensions || {},
          format: record?.format || "excalidraw",
        };
      }
      setSavedSketch(record);
      setStorageError(null);
      setSaveStatus(record
        ? { state: "saved", lastSavedAt: Number(record.savedAt) || null, error: null, emergencySaved: false }
        : { state: "ready", lastSavedAt: null, error: null, emergencySaved: false });
      setSketchReady(true);
    }).catch((error) => {
      if (cancelled) return;
      const emergency = loadEmergencyBackup();
      if (documentMetadataRef) {
        documentMetadataRef.current = {
          metadata: emergency?.metadata || {},
          extensions: emergency?.extensions || {},
          format: emergency?.format || "excalidraw",
        };
      }
      logger.warn("Local sketch restore failed", { category: "persistence", errorKind: error?.kind || "unavailable", emergencyBackupAvailable: Boolean(emergency) });
      setSavedSketch(emergency || null);
      const restoreError = { kind: error?.kind || "unavailable", message: error?.message || "Local storage is unavailable.", emergencySaved: Boolean(emergency) };
      setStorageError(restoreError);
      setSaveStatus({ state: "error", lastSavedAt: Number(emergency?.savedAt) || null, error: restoreError.message, emergencySaved: Boolean(emergency) });
      setSketchReady(true);
    });
    return () => {
      cancelled = true;
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, []);

  const persistSketchNow = useCallback((payload, revision = saveRevisionRef.current) => {
    if (!payload) return Promise.resolve(false);
    if (revision === saveRevisionRef.current) {
      setSaveStatus((current) => ({ ...current, state: "saving", error: null }));
    }
    const durablePayload = withDocumentMetadata(payload, documentMetadataRef?.current || {});
    saveRequestRef.current = saveRequestRef.current
      .catch(() => {})
      .then(() => saveSketch(durablePayload))
      .then(() => {
        logger.debug("Local sketch saved", { category: "persistence" });
        clearEmergencyBackup();
        setStorageError(null);
        const savedAt = Date.now();
        if (revision === saveRevisionRef.current && !saveTimerRef.current) {
          setSaveStatus({ state: "saved", lastSavedAt: savedAt, error: null, emergencySaved: false });
        } else if (revision < saveRevisionRef.current) {
          setSaveStatus((current) => ({ ...current, state: "pending", error: null }));
        }
        return true;
      })
      .catch((error) => {
        const emergencySaved = saveEmergencyBackup(durablePayload);
        logger.error("Local sketch save failed", error, { category: "persistence", errorKind: error?.kind || "write", emergencyBackupSaved: emergencySaved });
        const message = error?.message || "Unable to save the sketch locally.";
        // Don't let a failed older snapshot briefly override the status of a
        // newer queued save. The latest revision owns the visible error state.
        if (revision === saveRevisionRef.current) {
          setStorageError({
            kind: error?.kind || "write",
            message,
            emergencySaved,
          });
          setSaveStatus((current) => ({ ...current, state: "error", error: message, emergencySaved }));
        }
        return false;
      });
    return saveRequestRef.current;
  }, [documentMetadataRef]);

  const queueSketchSave = useCallback((elements, appState) => {
    if (!sketchReady || !apiRef.current) return;
    const revision = ++saveRevisionRef.current;
    setSaveStatus((current) => ({ ...current, state: "pending", error: null }));
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      const files = apiRef.current?.getFiles?.() || {};
      persistSketchNow({
        elements, appState, files,
        metadata: documentMetadataRef?.current?.metadata || {},
        extensions: documentMetadataRef?.current?.extensions || {},
        format: documentMetadataRef?.current?.format || "excalidraw",
      }, revision);
    }, 350);
  }, [apiRef, documentMetadataRef, persistSketchNow, sketchReady]);

  const retryLocalSave = useCallback(() => {
    const api = apiRef.current;
    if (!api) return Promise.resolve(false);
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    const revision = ++saveRevisionRef.current;
    const result = persistSketchNow({
      elements: api.getSceneElements(),
      appState: api.getAppState(),
      files: api.getFiles?.() || {},
      metadata: documentMetadataRef?.current?.metadata || {},
      extensions: documentMetadataRef?.current?.extensions || {},
      format: documentMetadataRef?.current?.format || "excalidraw",
    }, revision);
    return result;
  }, [apiRef, documentMetadataRef, persistSketchNow]);

  const downloadRecoveryBackup = useCallback(() => {
    const api = apiRef.current;
    if (!api) return;
    const metadata = documentMetadataRef?.current || {};
    const extensions = metadata.extensions || {};
    const format = metadata.format === "sketchizi" ? "sketchizi" : "excalidraw";
    const text = serializeDrawing({
      format,
      metadata: metadata.metadata || {},
      extensions,
      elements: api.getSceneElementsIncludingDeleted?.() || api.getSceneElements(),
      appState: api.getAppState(),
      files: api.getFiles?.() || {},
    });
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `sketchizi-recovery-${new Date().toISOString().replace(/[:.]/g, "-")}.${format === "sketchizi" ? "sketchizi" : "excalidraw"}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }, [apiRef, documentMetadataRef]);

  return {
    savedSketch,
    setSavedSketch,
    sketchReady,
    storageError,
    setStorageError,
    saveStatus,
    saveTimerRef,
    queueSketchSave,
    persistSketchNow,
    retryLocalSave,
    downloadRecoveryBackup,
  };
}
