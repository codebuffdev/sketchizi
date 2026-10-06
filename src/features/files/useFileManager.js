import { useEffect, useRef, useState } from "react";
import { CaptureUpdateAction, restoreElements } from "@excalidraw/excalidraw";
import {
  deleteDirectoryHandle, deleteFileHandle, deleteRecentSketch, clearEmergencyBackup, clearSketch,
  loadAllDirectoryHandles, loadAllFileHandles, loadDirectoryHandle, loadFileHandle,
  loadRecentSketch, saveDirectoryHandle, saveFileHandle, saveRecentSketch,
} from "../../persistence";
import { useRecentFiles } from "./useRecentFiles";
import { logger } from "../../logging/logger";
import {
  chooseFallbackSaveName, downloadDrawing, ensureExtension, getFileSystemSupport,
  listDrawingFiles, normalizeFsError, parseDrawing, pickDirectoryToOpen, pickDirectoryViaInput,
  pickDrawingToOpen, pickDrawingToSave, pickDrawingViaInput, readDrawingFromHandle,
  serializeDrawing, writeDrawingToHandle, ensureHandlePermission,
} from "../../fileSystem";

export function useFileManager({ apiRef, closeNativeMenu, showToast, queueSketchSave, saveTimerRef, setSavedSketch, lastSelectionSignature, startCollaboration }) {
  const [currentFolder, setCurrentFolderState] = useState(null);
  const [currentFolderFiles, setCurrentFolderFiles] = useState([]);
  const currentFolderRef = useRef(null);
  const setCurrentFolder = (folder) => {
    currentFolderRef.current = folder;
    setCurrentFolderState(folder);
    try {
      if (folder?.id) localStorage.setItem("sketchizi-current-folder-id", folder.id);
      else localStorage.removeItem("sketchizi-current-folder-id");
    } catch {}
  };

  const refreshCurrentFolderFiles = async (folder = currentFolderRef.current) => {
    if (!folder?.handle) { setCurrentFolderFiles([]); return []; }
    if (!(await ensureHandlePermission(folder.handle, "read"))) {
      setCurrentFolderFiles([]);
      throw new Error("Folder permission was denied");
    }
    const files = await listDrawingFiles(folder.handle);
    setCurrentFolderFiles(files);
    return files;
  };
  // Current file association: null (unsaved/new) or { id, name, handle|null }.
  // `handle` is a FileSystemFileHandle where the browser supports it; without
  // one (Firefox/Safari fallback) saves download a copy instead.
  const [currentFile, setCurrentFileState] = useState(null);
  const currentFileRef = useRef(null);
  const recentState = useRecentFiles({ currentFileRef, currentFolderRef });
  const { recentFiles, setRecentFiles, recentFolders, setRecentFolders, rememberRecentFile, forgetRecentFile, clearRecentFiles, rememberRecentFolder, forgetRecentFolder, clearRecentFolders } = recentState;
  const setCurrentFile = (file) => {
    currentFileRef.current = file;
    setCurrentFileState(file);
    try {
      if (file?.id) localStorage.setItem("sketchizi-current-file-id", file.id);
      else localStorage.removeItem("sketchizi-current-file-id");
    } catch {}
  };
  const fileActionsRef = useRef({});
  // Reuse the recent entry when the same file is opened/saved again.
  const findRecentIdForHandle = async (handle) => {
    if (!handle?.isSameEntry) return null;
    const stored = await loadAllFileHandles();
    for (const entry of stored) {
      try { if (await handle.isSameEntry(entry.handle)) return entry.id; } catch {}
    }
    return null;
  };

  const registerFile = async (handle, name) => {
    const id = (await findRecentIdForHandle(handle))
      || `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const handleStored = await saveFileHandle(id, handle);
    // A FileSystemFileHandle's name is the authoritative filename returned by
    // the picker. The suggestedName is only a default shown before selection.
    const actualName = handle?.name || name || "Untitled drawing";
    const file = { id, name: actualName, handle };
    setCurrentFile(file);
    // Only list it in Recent files if the handle really was persisted;
    // otherwise the entry could never be reopened.
    if (handleStored) rememberRecentFile({ id, name: actualName, handle, savedAt: Date.now(), kind: "file" });
    return file;
  };

  const currentSceneText = () => {
    const api = apiRef.current;
    if (!api) return null;
    return serializeDrawing({
      elements: api.getSceneElementsIncludingDeleted?.() || api.getSceneElements(),
      appState: api.getAppState(),
      files: api.getFiles?.() || {},
    });
  };

  const loadDrawingIntoCanvas = (text) => {
    const api = apiRef.current;
    if (!api) throw new Error("Editor is not ready");
    const drawing = parseDrawing(text); // validates
    const elements = restoreElements(drawing.elements, null, { repairBindings: true });
    api.updateScene({
      elements,
      appState: { ...api.getAppState(), ...drawing.appState, selectedElementIds: {}, selectedGroupForOperation: null },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    api.history?.clear?.();
    // Binary image data goes in AFTER the image elements exist: Excalidraw
    // builds its image cache from the elements present in the scene.
    const files = Object.values(drawing.files);
    if (files.length) api.addFiles?.(files);
    lastSelectionSignature.current = "";
    const record = { elements, files: drawing.files, appState: drawing.appState };
    setSavedSketch(record);
    queueSketchSave(elements, { ...api.getAppState(), ...drawing.appState });
  };

  const handleFileError = (error, fallback) => {
    const err = normalizeFsError(error, fallback);
    if (err.kind === "cancelled") return;
    if (err.kind === "not-found" || err.kind === "permission" || err.kind === "invalid") showToast(err.message, "error");
    else showToast(fallback, "error");
    const logContext = { category: "file", errorKind: err.kind };
    if (err.kind === "unknown") logger.error(fallback, error, logContext);
    else logger.warn(err.message, logContext);
  };

  const openFolderFromDisk = async () => {
    closeNativeMenu();
    const support = getFileSystemSupport();
    try {
      if (support.directory) {
        const handle = await pickDirectoryToOpen();
        const entry = await rememberRecentFolder(handle, handle.name);
        if (!entry) throw new Error("Unable to create folder association");
        const folder = { id: entry.id, name: entry.name, handle, fallback: false };
        setCurrentFolder(folder);
        await refreshCurrentFolderFiles(folder);
        logger.info("Folder opened", { category: "file", folderName: entry.name, persisted: entry.persisted });
        showToast(entry.persisted ? `Folder selected: ${entry.name}` : `Folder selected: ${entry.name} (Recent folders unavailable)`);
        return;
      }

      // Practical fallback for contexts that do not expose showDirectoryPicker
      // (for example an embedded/insecure browser context). webkitdirectory
      // gives us real File objects for the selected directory, allowing the
      // folder to remain useful for browsing/opening drawings without inventing
      // filesystem paths. It cannot provide a writable directory handle.
      const fallback = await pickDirectoryViaInput();
      const drawingFiles = fallback.files
        .filter((file) => {
          const relative = file.webkitRelativePath || file.name;
          return relative.split("/").length === 2 && /\.excalidraw$/i.test(file.name);
        })
        .map((file) => ({ name: file.name, file, handle: null }));
      const folder = { id: `fallback-folder-${Date.now()}`, name: fallback.name, handle: null, fallback: true };
      setCurrentFolder(folder);
      setCurrentFolderFiles(drawingFiles);
      logger.info("Folder opened with browser fallback", { category: "file", folderName: fallback.name });
      showToast(`Folder selected: ${fallback.name} (read-only folder fallback)`);
    } catch (error) {
      handleFileError(error, "Unable to open folder");
    }
  };

  const openRecentFolder = async (id) => {
    if (!id) return;
    closeNativeMenu();
    try {
      const handle = await loadDirectoryHandle(id);
      if (!handle) {
        showToast("Unable to open this folder. It may have been moved or permission was revoked.", "error");
        return;
      }
      const permission = await ensureHandlePermission(handle, "readwrite");
      if (!permission) {
        showToast("Folder permission was denied", "error");
        return;
      }
      const entry = recentFolders.find((item) => item.id === id);
      const updated = { id, name: entry?.name || handle.name || "Folder", openedAt: Date.now() };
      const folder = { ...updated, handle };
      setCurrentFolder(folder);
      await refreshCurrentFolderFiles(folder);
      setRecentFolders((current) => {
        const next = [updated, ...current.filter((item) => item.id !== id)].slice(0, 5);
        try { localStorage.setItem("sketchizi-recent-folders", JSON.stringify(next)); } catch {}
        return next;
      });
      logger.info("Recent folder opened", { category: "file", folderName: updated.name });
      showToast(`Folder selected: ${updated.name}`);
    } catch (error) {
      handleFileError(error, "Unable to open folder");
    }
  };

  // OPEN: native picker (browse folders) -> read -> validate -> load.
  const openDrawingFromDisk = async () => {
    closeNativeMenu();
    if (!apiRef.current) return;
    try {
      if (getFileSystemSupport().open) {
        const handle = await pickDrawingToOpen();
        const { name, text } = await readDrawingFromHandle(handle);
        loadDrawingIntoCanvas(text);
        await registerFile(handle, name);
        logger.info("Document opened", { category: "file", fileName: name, source: "browser-file-input" });
        showToast(`Opened ${name}`);
      } else {
        const { name, text } = await pickDrawingViaInput();
        loadDrawingIntoCanvas(text);
        // No handle in this browser: keep a local copy so Recent files works.
        setCurrentFile({ id: null, name, handle: null });
        const record = await saveRecentSketch({
          id: `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name,
          elements: apiRef.current.getSceneElements(),
          appState: apiRef.current.getAppState(),
          files: apiRef.current.getFiles?.() || {},
        }).catch(() => null);
        if (record) rememberRecentFile({ ...record, kind: "snapshot" });
        showToast(`Opened ${name}`);
      }
    } catch (error) {
      handleFileError(error, "Unable to open drawing");
    }
  };

  const openDrawingFromCurrentFolder = async (fileEntry) => {
    closeNativeMenu();
    try {
      if (fileEntry?.file) {
        loadDrawingIntoCanvas(await fileEntry.file.text());
        setCurrentFile({ id: null, name: fileEntry.file.name, handle: null });
        const record = await saveRecentSketch({
          id: `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: fileEntry.file.name,
          elements: apiRef.current?.getSceneElements?.() || [],
          appState: apiRef.current?.getAppState?.() || {},
          files: apiRef.current?.getFiles?.() || {},
        }).catch(() => null);
        if (record) rememberRecentFile({ ...record, kind: "snapshot" });
        logger.info("Document opened", { category: "file", fileName: fileEntry.file.name, source: "folder" });
        showToast(`Opened ${fileEntry.file.name}`);
        return;
      }
      const fileHandle = fileEntry?.handle || fileEntry;
      if (!(await ensureHandlePermission(fileHandle, "read"))) { showToast("File permission was denied", "error"); return; }
      const { name, text } = await readDrawingFromHandle(fileHandle);
      loadDrawingIntoCanvas(text);
      await registerFile(fileHandle, name);
      logger.info("Document opened", { category: "file", fileName: name, source: "folder-handle" });
      showToast(`Opened ${name}`);
    } catch (error) { handleFileError(error, "Unable to open drawing"); }
  };

  const closeCurrentFolder = () => {
    closeNativeMenu();
    setCurrentFolder(null);
    setCurrentFolderFiles([]);
    logger.info("Folder closed", { category: "file" });
    showToast("Folder closed");
  };

  const createNewFile = () => {
    closeNativeMenu();
    const api = apiRef.current;
    if (!api) return;
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    api.updateScene({
      elements: [],
      appState: {
        ...api.getAppState(),
        selectedElementIds: {},
        selectedGroupForOperation: null,
      },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    api.history?.clear?.();
    setSavedSketch(null);
    setCurrentFile(null);
    clearEmergencyBackup();
    clearSketch().catch(() => {});
    logger.info("New document created", { category: "file" });
    showToast("New drawing");
  };

  // SAVE TO...: always asks for folder + filename, then re-associates.
  const saveDrawingAs = async () => {
    closeNativeMenu();
    if (!apiRef.current) return;
    try {
      const text = currentSceneText();
      const suggested = currentFileRef.current?.name || `drawing-${new Date().toISOString().slice(0, 10)}.excalidraw`;
      if (!currentFileRef.current?.handle && currentFolderRef.current?.handle) {
        if (!(await ensureHandlePermission(currentFolderRef.current.handle, "readwrite"))) {
          showToast("Folder permission was denied", "error");
          return;
        }
        if (getFileSystemSupport().save) {
          const handle = await pickDrawingToSave(suggested, currentFolderRef.current.handle);
          await writeDrawingToHandle(handle, text);
          await registerFile(handle, handle.name);
          await refreshCurrentFolderFiles().catch(() => {});
          logger.info("Document saved", { category: "file", fileName: handle.name, operation: "saveAs" });
          showToast(`Saved as ${handle.name}`);
          return;
        }
        // If Save Picker is unavailable, a directory handle alone cannot be
        // used to ask the user for a filename without inventing a path.
        // Fall through to the normal download fallback instead.
      }
      if (getFileSystemSupport().save) {
        let startIn = currentFolderRef.current?.handle || null;
        if (startIn && !(await ensureHandlePermission(startIn, "readwrite"))) startIn = null;
        const handle = await pickDrawingToSave(suggested, startIn);
        await writeDrawingToHandle(handle, text);
        await registerFile(handle, handle.name);
        if (currentFolderRef.current?.handle) refreshCurrentFolderFiles().catch(() => {});
        logger.info("Document saved", { category: "file", fileName: handle.name, operation: "saveAs" });
        showToast(`Saved as ${handle.name}`);
      } else {
        // Download fallbacks do not return the final filename chosen in the
        // browser's download UI. Ask the user for the filename in Sketchizi so
        // that the name persisted for currentFile/Recent files is authoritative.
        const name = chooseFallbackSaveName(suggested);
        downloadDrawing(name, text);
        const snapshotId = `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const record = await saveRecentSketch({
          id: snapshotId,
          name,
          elements: apiRef.current.getSceneElements(),
          appState: apiRef.current.getAppState(),
          files: apiRef.current.getFiles?.() || {},
        }).catch(() => null);
        if (record) {
          setCurrentFile({ id: snapshotId, name: record.name, handle: null, fallback: true });
          rememberRecentFile({ ...record, kind: "snapshot" });
        } else {
          setCurrentFile({ id: snapshotId, name, handle: null, fallback: true });
        }
        logger.info("Document saved", { category: "file", fileName: name, operation: "download-fallback" });
        showToast(`Downloaded ${name}`);
      }
    } catch (error) {
      handleFileError(error, "Unable to save drawing");
    }
  };

  // SAVE CURRENT DRAWING: overwrite the associated file, or behave like Save to...
  const saveCurrentDrawing = async () => {
    const file = currentFileRef.current;
    if (!file?.handle) {
      // Never saved (or no handle in this browser): Save to... flow.
      return saveDrawingAs();
    }
    closeNativeMenu();
    try {
      // Must be requested while the click's user activation is still valid.
      if (!(await ensureHandlePermission(file.handle, "readwrite"))) {
        showToast("File permission was denied", "error");
        return;
      }
      await writeDrawingToHandle(file.handle, currentSceneText());
      const actualName = file.handle?.name || file.name || "Untitled drawing";
      if (file.name !== actualName) setCurrentFile({ ...file, name: actualName });
      rememberRecentFile({ id: file.id, name: actualName, handle: file.handle, savedAt: Date.now(), kind: "file" });
      if (currentFolderRef.current?.handle) refreshCurrentFolderFiles().catch(() => {});
      logger.info("Document saved", { category: "file", fileName: actualName, operation: "save" });
      showToast("Drawing saved");
    } catch (error) {
      const err = normalizeFsError(error, "Unable to save drawing");
      if (err.kind === "not-found") {
        // The file was deleted/moved outside the app: drop the stale
        // association and let the user pick a new location.
        forgetRecentFile(file.id);
        setCurrentFile(null);
        showToast("The original file is gone - choose where to save it", "error");
        return saveDrawingAs();
      }
      handleFileError(error, "Unable to save drawing");
    }
  };

  const openRecentFile = async (id) => {
    const api = apiRef.current;
    if (!api || !id) return;
    closeNativeMenu();
    const entry = recentFiles.find((item) => item.id === id);
    try {
      if (entry?.kind === "file") {
        const handle = await loadFileHandle(id);
        if (!handle) {
          showToast("Unable to open this file. It may have been moved, deleted, or permission was revoked.", "error");
          return;
        }
        if (!(await ensureHandlePermission(handle, "readwrite"))) {
          showToast("File permission was denied", "error");
          return;
        }
        const { name, text } = await readDrawingFromHandle(handle);
        loadDrawingIntoCanvas(text);
        const actualName = handle?.name || name;
        setCurrentFile({ id, name: actualName, handle });
        rememberRecentFile({ id, name: actualName, handle, savedAt: Date.now(), kind: "file" });
        logger.info("Recent document opened", { category: "file", fileName: name, source: "recent-file" });
        showToast(`Opened ${name}`);
        return;
      }

      // Snapshot entry (fallback browsers / entries created before 1.6.3).
      const record = await loadRecentSketch(id).catch(() => null);
      if (!record) {
        forgetRecentFile(id);
        showToast("This drawing is no longer available", "error");
        return;
      }
      loadDrawingIntoCanvas(serializeDrawing({ elements: record.elements || [], appState: record.appState, files: record.files }));
      setCurrentFile({ id: null, name: record.name, handle: null });
      rememberRecentFile({ ...record, kind: "snapshot" });
      logger.info("Recent snapshot opened", { category: "file", fileName: record.name, source: "recent-snapshot" });
      showToast(`Opened ${record.name}`);
    } catch (error) {
      const err = normalizeFsError(error, "Unable to open drawing");
      if (err.kind === "not-found") {
        showToast("Unable to open this file. It may have been moved, deleted, or permission was revoked.", "error");
      } else {
        handleFileError(error, "Unable to open drawing");
      }
    }
  };

  useEffect(() => {
    let cancelled = false;
    loadAllFileHandles().then((stored) => {
      if (cancelled || !Array.isArray(stored) || stored.length === 0) return;
      const namesById = new Map();
      stored.forEach((entry) => {
        if (entry?.id && entry.handle?.name) namesById.set(entry.id, entry.handle.name);
      });
      if (namesById.size === 0) return;
      setRecentFiles((current) => {
        let changed = false;
        const next = current.map((item) => {
          const actualName = namesById.get(item.id);
          if (!actualName || actualName === item.name) return item;
          changed = true;
          return { ...item, name: actualName };
        });
        if (changed) {
          try { localStorage.setItem("sketchizi-recent-files", JSON.stringify(next)); } catch {}
        }
        return changed ? next : current;
      });
    }).catch(() => {});

    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let fileId = null;
    let folderId = null;
    try {
      fileId = localStorage.getItem("sketchizi-current-file-id");
      folderId = localStorage.getItem("sketchizi-current-folder-id");
    } catch {}
    if (fileId) {
      loadFileHandle(fileId).then((handle) => {
        if (cancelled || !handle || currentFileRef.current) return;
        currentFileRef.current = { id: fileId, name: handle.name, handle };
        setCurrentFileState(currentFileRef.current);
      });
    }
    if (folderId) {
      loadDirectoryHandle(folderId).then((handle) => {
        if (cancelled || !handle || currentFolderRef.current) return;
        const entry = recentFolders.find((item) => item.id === folderId);
        const folder = { id: folderId, name: entry?.name || handle.name || "Folder", handle };
        currentFolderRef.current = folder;
        setCurrentFolderState(folder);
        refreshCurrentFolderFiles(folder).catch((error) => handleFileError(error, "Unable to read the selected folder"));
      });
    }
    return () => { cancelled = true; };
  }, []);

  // Intercept Excalidraw's native Open / Save to... (and Ctrl+O / Ctrl+S) so
  // they use the file-handle based implementation above.

  // Keep stable entry points for the DOM-injected menu and global listeners.
  fileActionsRef.current = { openDrawingFromDisk, openFolderFromDisk, openRecentFolder, openDrawingFromCurrentFolder, saveDrawingAs, saveCurrentDrawing, createNewFile, closeCurrentFolder, openRecentFile, removeRecentFile: forgetRecentFile, clearRecentFiles, removeRecentFolder: forgetRecentFolder, clearRecentFolders, clearFileAssociation: () => setCurrentFile(null), startCollaboration };
  return {
    recentFiles, setRecentFiles, recentFolders, setRecentFolders,
    currentFolder, currentFolderRef, currentFolderFiles, setCurrentFolder, setCurrentFolderFiles, refreshCurrentFolderFiles,
    currentFile, currentFileRef, setCurrentFile, fileActionsRef,
    rememberRecentFile, forgetRecentFile, clearRecentFiles, rememberRecentFolder, forgetRecentFolder, clearRecentFolders,
    handleFileError, currentSceneText, loadDrawingIntoCanvas, openFolderFromDisk, openRecentFolder, openDrawingFromDisk,
    openDrawingFromCurrentFolder, closeCurrentFolder, createNewFile, saveDrawingAs, saveCurrentDrawing, openRecentFile,
  };
}
