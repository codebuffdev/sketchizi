import { useEffect, useRef, useState } from "react";
import {
  clearEmergencyBackup,
  loadEmergencyBackup,
  loadSketch,
  saveEmergencyBackup,
  saveSketch,
} from "../../persistence";
import { logger } from "../../logging/logger";

export function useSketchPersistence({ apiRef }) {
  const [savedSketch, setSavedSketch] = useState(null);
  const [sketchReady, setSketchReady] = useState(false);
  const [storageError, setStorageError] = useState(null);
  const saveTimerRef = useRef(null);
  const saveRequestRef = useRef(Promise.resolve());

  useEffect(() => {
    let cancelled = false;
    loadSketch().then((record) => {
      if (cancelled) return;
      logger.debug("Local sketch restored", { category: "persistence", hasSavedSketch: Boolean(record) });
      setSavedSketch(record);
      setStorageError(null);
      setSketchReady(true);
    }).catch((error) => {
      if (cancelled) return;
      const emergency = loadEmergencyBackup();
      logger.warn("Local sketch restore failed", { category: "persistence", errorKind: error?.kind || "unavailable", emergencyBackupAvailable: Boolean(emergency) });
      setSavedSketch(emergency || null);
      setStorageError({ kind: error?.kind || "unavailable", message: error?.message || "Local storage is unavailable." });
      setSketchReady(true);
    });
    return () => {
      cancelled = true;
      if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    };
  }, []);

  const persistSketchNow = (payload) => {
    if (!payload) return Promise.resolve(false);
    saveRequestRef.current = saveRequestRef.current
      .catch(() => {})
      .then(() => saveSketch(payload))
      .then(() => {
        logger.debug("Local sketch saved", { category: "persistence" });
        clearEmergencyBackup();
        setStorageError(null);
        return true;
      })
      .catch((error) => {
        const emergencySaved = saveEmergencyBackup(payload);
        logger.error("Local sketch save failed", error, { category: "persistence", errorKind: error?.kind || "write", emergencyBackupSaved: emergencySaved });
        setStorageError({
          kind: error?.kind || "write",
          message: error?.message || "Unable to save the sketch locally.",
          emergencySaved,
        });
        return false;
      });
    return saveRequestRef.current;
  };

  const queueSketchSave = (elements, appState) => {
    if (!sketchReady || !apiRef.current) return;
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      const files = apiRef.current?.getFiles?.() || {};
      persistSketchNow({ elements, appState, files });
    }, 350);
  };

  const retryLocalSave = () => {
    const api = apiRef.current;
    if (!api) return;
    persistSketchNow({
      elements: api.getSceneElements(),
      appState: api.getAppState(),
      files: api.getFiles?.() || {},
    });
  };

  const downloadRecoveryBackup = () => {
    const api = apiRef.current;
    if (!api) return;
    const blob = new Blob([JSON.stringify({
      type: "excalidraw",
      version: 2,
      source: "https://sketchizi.pages.dev",
      elements: api.getSceneElements(),
      appState: api.getAppState(),
      files: api.getFiles?.() || {},
    })], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `sketchizi-recovery-${new Date().toISOString().replace(/[:.]/g, "-")}.excalidraw`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  return {
    savedSketch,
    setSavedSketch,
    sketchReady,
    storageError,
    setStorageError,
    saveTimerRef,
    queueSketchSave,
    persistSketchNow,
    retryLocalSave,
    downloadRecoveryBackup,
  };
}
