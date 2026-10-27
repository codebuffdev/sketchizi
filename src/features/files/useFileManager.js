import { useCallback, useEffect, useRef, useState } from "react";
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
  serializeDrawing, writeDrawingToHandle, ensureHandlePermission, getDrawingFormat,
} from "../../fileSystem";

function getLiveSceneSignature(elements) {
  const serialized = JSON.stringify((Array.isArray(elements) ? elements : []).filter((element) => element && !element.isDeleted));
  // A compact two-lane non-cryptographic hash keeps the persisted baseline small
  // even for large scenes; it is only used for UI dirty-state comparison.
  let first = 2166136261;
  let second = 5381;
  for (let index = 0; index < serialized.length; index += 1) {
    const code = serialized.charCodeAt(index);
    first = Math.imul(first ^ code, 16777619);
    second = Math.imul(second, 33) ^ code;
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

export function useFileManager({ apiRef, closeNativeMenu, showToast, queueSketchSave, saveTimerRef, setSavedSketch, documentMetadataRef, lastSelectionSignature, startCollaboration }) {
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
      // recentState is initialized below before this callback can be invoked.
      recentState.updateRecentFolderStatus?.(folder.id, "permission");
      const error = new Error("Folder permission was denied");
      error.name = "NotAllowedError";
      throw error;
    }
    try {
      const files = await listDrawingFiles(folder.handle);
      setCurrentFolderFiles(files);
      recentState.updateRecentFolderStatus?.(folder.id, "available");
      return files;
    } catch (error) {
      // Do not leave a stale file listing visible after the selected folder
      // becomes inaccessible or its permission is revoked.
      setCurrentFolderFiles([]);
      const normalized = normalizeFsError(error, "Unable to read the selected folder");
      if (normalized.kind === "permission") recentState.updateRecentFolderStatus?.(folder.id, "permission");
      else if (normalized.kind === "not-found") recentState.updateRecentFolderStatus?.(folder.id, "missing");
      throw error;
    }
  };
  // Current file association: null (unsaved/new) or { id, name, handle|null }.
  // `handle` is a FileSystemFileHandle where the browser supports it; without
  // one (Firefox/Safari fallback) saves download a copy instead.
  const [currentFile, setCurrentFileState] = useState(null);
  const currentFileRef = useRef(null);
  const currentFileSceneSignatureRef = useRef(null);
  const documentDirtyRef = useRef(false);
  const [documentDirty, setDocumentDirty] = useState(false);
  const updateDocumentDirty = useCallback((value) => {
    const nextValue = Boolean(value);
    documentDirtyRef.current = nextValue;
    setDocumentDirty((current) => current === nextValue ? current : nextValue);
  }, []);
  const markCurrentDocumentChanged = useCallback((elements) => {
    if (!currentFileRef.current) {
      updateDocumentDirty(false);
      return;
    }
    const signature = getLiveSceneSignature(elements);
    if (currentFileSceneSignatureRef.current == null) {
      // Older sessions may not have a stored baseline yet. Establish one on
      // first observation rather than falsely flagging every restored file as dirty.
      currentFileSceneSignatureRef.current = signature;
      try { localStorage.setItem("sketchizi-current-file-scene-signature", signature); } catch {}
      updateDocumentDirty(false);
      return;
    }
    updateDocumentDirty(signature !== currentFileSceneSignatureRef.current);
  }, [updateDocumentDirty]);
  const recentState = useRecentFiles({ currentFileRef, currentFolderRef });
  const { recentFiles, setRecentFiles, recentFolders, setRecentFolders, rememberRecentFile, updateRecentFileStatus, forgetRecentFile, clearRecentFiles, rememberRecentFolder, markRecentFolderOpened, updateRecentFolderStatus, forgetRecentFolder, clearRecentFolders } = recentState;
  const setCurrentFile = (file, baselineSignature = undefined) => {
    currentFileRef.current = file;
    const api = apiRef.current;
    const currentSignature = getLiveSceneSignature(api?.getSceneElementsIncludingDeleted?.() || api?.getSceneElements?.() || []);
    currentFileSceneSignatureRef.current = file
      ? (typeof baselineSignature === "string" ? baselineSignature : currentSignature)
      : null;
    updateDocumentDirty(Boolean(file && currentSignature !== currentFileSceneSignatureRef.current));
    setCurrentFileState(file);
    try {
      if (file?.id) localStorage.setItem("sketchizi-current-file-id", file.id);
      else localStorage.removeItem("sketchizi-current-file-id");
      if (file) {
        localStorage.setItem("sketchizi-current-file-meta", JSON.stringify({ name: file.name || "Untitled drawing", handleBacked: Boolean(file.handle), fallback: Boolean(file.fallback) }));
        if (typeof currentFileSceneSignatureRef.current === "string") {
          localStorage.setItem("sketchizi-current-file-scene-signature", currentFileSceneSignatureRef.current);
        }
      } else {
        localStorage.removeItem("sketchizi-current-file-meta");
        localStorage.removeItem("sketchizi-current-file-scene-signature");
      }
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

  const registerFile = async (handle, name, baselineSignature = undefined, lastOpenedAt = undefined) => {
    const id = (await findRecentIdForHandle(handle))
      || `file-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const handleStored = await saveFileHandle(id, handle);
    // A FileSystemFileHandle's name is the authoritative filename returned by
    // the picker. The suggestedName is only a default shown before selection.
    const actualName = handle?.name || name || "Untitled drawing";
    const file = { id, name: actualName, handle };
    setCurrentFile(file, baselineSignature);
    // Only list it in Recent files if the handle really was persisted;
    // otherwise the entry could never be reopened.
    if (handleStored) rememberRecentFile({ id, name: actualName, handle, savedAt: Date.now(), lastOpenedAt, availability: "available", kind: "file" });
    return file;
  };

  const currentSceneText = (nameOrFormat = currentFileRef.current?.name || "excalidraw") => {
    const api = apiRef.current;
    if (!api) return null;
    return serializeDrawing({
      format: getDrawingFormat(nameOrFormat),
      metadata: documentMetadataRef.current.metadata,
      extensions: documentMetadataRef.current.extensions,
      elements: api.getSceneElementsIncludingDeleted?.() || api.getSceneElements(),
      appState: api.getAppState(),
      files: api.getFiles?.() || {},
    });
  };

  const loadDrawingIntoCanvas = (text) => {
    const api = apiRef.current;
    if (!api) throw new Error("Editor is not ready");
    const drawing = parseDrawing(text); // validates
    documentMetadataRef.current = { metadata: drawing.metadata || {}, extensions: drawing.extensions || {}, format: drawing.format || getDrawingFormat("excalidraw") };
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
    return getLiveSceneSignature(elements);
  };

  const confirmCanvasReplacement = (actionLabel) => {
    const api = apiRef.current;
    const liveElements = (api?.getSceneElements?.() || []).filter((element) => element && !element.isDeleted);
    if (liveElements.length === 0) return true;

    const currentFile = currentFileRef.current;
    const isDirty = Boolean(currentFile && documentDirtyRef.current);
    if (currentFile && !isDirty) return true;

    const title = currentFile?.name || "Untitled drawing";
    const reason = isDirty
      ? `Changes to “${title}” have not been saved back to that file.`
      : `“${title}” is currently a browser-local canvas without an associated file.`;
    const recovery = "Continuing may replace the current browser-local autosave. Cancel and save/export the drawing or download a recovery backup to keep an extra copy.";
    return window.confirm(`${reason}\n\n${recovery}\n\nContinue to ${actionLabel}?`);
  };

  const handleFileError = (error, fallback) => {
    const err = normalizeFsError(error, fallback);
    if (err.kind === "cancelled") return;
    if (err.kind === "not-found" || err.kind === "permission" || err.kind === "invalid" || err.kind === "unsupported") showToast(err.message, "error");
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
          return relative.split("/").length === 2 && /\.(excalidraw|sketchizi)$/i.test(file.name);
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
        updateRecentFolderStatus(id, "missing");
        showToast("Unable to open this folder. It may have been moved or permission was revoked.", "error");
        return;
      }
      const permission = await ensureHandlePermission(handle, "readwrite");
      if (!permission) {
        updateRecentFolderStatus(id, "permission");
        showToast("Folder permission was denied. Reopen the folder to grant access.", "error");
        return;
      }
      const entry = recentFolders.find((item) => item.id === id);
      const updated = { id, name: entry?.name || handle.name || "Folder", openedAt: entry?.openedAt || Date.now(), handle };
      const folder = { ...updated, handle };
      setCurrentFolder(folder);
      await refreshCurrentFolderFiles(folder);
      markRecentFolderOpened(id);
      updateRecentFolderStatus(id, "available");
      logger.info("Recent folder opened", { category: "file", folderName: updated.name });
      showToast(`Folder selected: ${updated.name}`);
    } catch (error) {
      const normalized = normalizeFsError(error, "Unable to open folder");
      if (normalized.kind === "permission") updateRecentFolderStatus(id, "permission");
      else if (normalized.kind === "not-found") updateRecentFolderStatus(id, "missing");
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
        if (!confirmCanvasReplacement(`open “${name}”`)) return;
        const loadedSignature = loadDrawingIntoCanvas(text);
        await registerFile(handle, name, loadedSignature, Date.now());
        logger.info("Document opened", { category: "file", fileName: name, source: "browser-file-input" });
        showToast(`Opened ${name}`);
      } else {
        const { name, text } = await pickDrawingViaInput();
        if (!confirmCanvasReplacement(`open “${name}”`)) return;
        const loadedSignature = loadDrawingIntoCanvas(text);
        // No handle in this browser: keep a local copy so Recent files works.
        setCurrentFile({ id: null, name, handle: null }, loadedSignature);
        const record = await saveRecentSketch({
          id: `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name,
          format: getDrawingFormat(name),
          metadata: documentMetadataRef.current.metadata,
          extensions: documentMetadataRef.current.extensions,
          elements: apiRef.current.getSceneElements(),
          appState: apiRef.current.getAppState(),
          files: apiRef.current.getFiles?.() || {},
        }).catch(() => null);
        if (record) rememberRecentFile({ ...record, lastOpenedAt: Date.now(), availability: "available", kind: "snapshot" });
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
        // Folder input fallbacks provide File objects without write access. In
        // browsers that support the file picker, let the user reselect this
        // exact file to acquire a persistent handle for direct Ctrl+S saves.
        if (getFileSystemSupport().open) {
          showToast(`Select “${fileEntry.file.name}” in the file picker to enable saving to the original file.`);
          const handle = await pickDrawingToOpen();
          if (handle.name !== fileEntry.file.name) {
            showToast(`Please select “${fileEntry.file.name}” to open it with edit access.`, "error");
            return;
          }
          const { name, text } = await readDrawingFromHandle(handle);
          if (!confirmCanvasReplacement(`open “${name}”`)) return;
          const loadedSignature = loadDrawingIntoCanvas(text);
          await registerFile(handle, name, loadedSignature, Date.now());
          logger.info("Document opened with writable handle", { category: "file", fileName: name, source: "folder-fallback-reselect" });
          showToast(`Opened ${name}; changes can be saved to the original file`);
          return;
        }
        const text = await fileEntry.file.text();
        if (!confirmCanvasReplacement(`open “${fileEntry.file.name}”`)) return;
        const loadedSignature = loadDrawingIntoCanvas(text);
        setCurrentFile({ id: null, name: fileEntry.file.name, handle: null, fallback: true, readOnlySource: true }, loadedSignature);
        showToast(`Read-only copy opened: ${fileEntry.file.name}. Use Save to… to save an editable copy; the original will not be changed.`);
        const record = await saveRecentSketch({
          id: `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          name: fileEntry.file.name,
          format: getDrawingFormat(fileEntry.file.name),
          metadata: documentMetadataRef.current.metadata,
          extensions: documentMetadataRef.current.extensions,
          elements: apiRef.current?.getSceneElements?.() || [],
          appState: apiRef.current?.getAppState?.() || {},
          files: apiRef.current?.getFiles?.() || {},
        }).catch(() => null);
        if (record) rememberRecentFile({ ...record, lastOpenedAt: Date.now(), availability: "available", kind: "snapshot" });
        logger.info("Document opened", { category: "file", fileName: fileEntry.file.name, source: "folder" });
        showToast(`Opened ${fileEntry.file.name}`);
        return;
      }
      const fileHandle = fileEntry?.handle || fileEntry;
      if (!(await ensureHandlePermission(fileHandle, "read"))) { showToast("File permission was denied", "error"); return; }
      const { name, text } = await readDrawingFromHandle(fileHandle);
      if (!confirmCanvasReplacement(`open “${name}”`)) return;
      const loadedSignature = loadDrawingIntoCanvas(text);
      await registerFile(fileHandle, name, loadedSignature, Date.now());
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
    if (!confirmCanvasReplacement("create a new drawing")) return;
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
    documentMetadataRef.current = { metadata: {}, extensions: {}, format: "excalidraw" };
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
      const defaultSuggested = currentFileRef.current?.name || `drawing-${new Date().toISOString().slice(0, 10)}.sketchizi`;
      const suggested = defaultSuggested;
      if (!currentFileRef.current?.handle && currentFolderRef.current?.handle) {
        if (!(await ensureHandlePermission(currentFolderRef.current.handle, "readwrite"))) {
          showToast("Folder permission was denied", "error");
          return;
        }
        if (getFileSystemSupport().save) {
          const handle = await pickDrawingToSave(suggested, currentFolderRef.current.handle);
          const saveSignature = getLiveSceneSignature(apiRef.current?.getSceneElementsIncludingDeleted?.() || apiRef.current?.getSceneElements?.() || []);
          await writeDrawingToHandle(handle, currentSceneText(handle.name));
          await registerFile(handle, handle.name, saveSignature);
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
        const saveSignature = getLiveSceneSignature(apiRef.current?.getSceneElementsIncludingDeleted?.() || apiRef.current?.getSceneElements?.() || []);
        await writeDrawingToHandle(handle, currentSceneText(handle.name));
        await registerFile(handle, handle.name, saveSignature);
        if (currentFolderRef.current?.handle) refreshCurrentFolderFiles().catch(() => {});
        logger.info("Document saved", { category: "file", fileName: handle.name, operation: "saveAs" });
        showToast(`Saved as ${handle.name}`);
      } else {
        // Download fallbacks do not return the final filename chosen in the
        // browser's download UI. Ask the user for the filename in Sketchizi so
        // that the name persisted for currentFile/Recent files is authoritative.
        let name = chooseFallbackSaveName(suggested);
        const saveSignature = getLiveSceneSignature(apiRef.current?.getSceneElementsIncludingDeleted?.() || apiRef.current?.getSceneElements?.() || []);
        downloadDrawing(name, currentSceneText(name));
        const snapshotId = `snapshot-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const record = await saveRecentSketch({
          id: snapshotId,
          name,
          format: getDrawingFormat(name),
          metadata: documentMetadataRef.current.metadata,
          extensions: documentMetadataRef.current.extensions,
          elements: apiRef.current.getSceneElements(),
          appState: apiRef.current.getAppState(),
          files: apiRef.current.getFiles?.() || {},
        }).catch(() => null);
        if (record) {
          setCurrentFile({ id: snapshotId, name: record.name, handle: null, fallback: true }, saveSignature);
          rememberRecentFile({ ...record, lastOpenedAt: Date.now(), availability: "available", kind: "snapshot" });
        } else {
          setCurrentFile({ id: snapshotId, name, handle: null, fallback: true }, saveSignature);
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
      const saveSignature = getLiveSceneSignature(apiRef.current?.getSceneElementsIncludingDeleted?.() || apiRef.current?.getSceneElements?.() || []);
      await writeDrawingToHandle(file.handle, currentSceneText(file.name));
      const actualName = file.handle?.name || file.name || "Untitled drawing";
      currentFileSceneSignatureRef.current = saveSignature;
      try { localStorage.setItem("sketchizi-current-file-scene-signature", saveSignature); } catch {}
      const currentSignature = getLiveSceneSignature(apiRef.current?.getSceneElementsIncludingDeleted?.() || apiRef.current?.getSceneElements?.() || []);
      updateDocumentDirty(currentSignature !== saveSignature);
      if (file.name !== actualName) setCurrentFile({ ...file, name: actualName }, saveSignature);
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
          updateRecentFileStatus(id, "missing");
          showToast("Unable to open this file. It may have been moved, deleted, or permission was revoked.", "error");
          return;
        }
        if (!(await ensureHandlePermission(handle, "readwrite"))) {
          updateRecentFileStatus(id, "permission");
          showToast("File permission was denied. Select this recent file again to retry access.", "error");
          return;
        }
        const { name, text } = await readDrawingFromHandle(handle);
        if (!confirmCanvasReplacement(`open “${name}”`)) return;
        const loadedSignature = loadDrawingIntoCanvas(text);
        const actualName = handle?.name || name;
        setCurrentFile({ id, name: actualName, handle }, loadedSignature);
        rememberRecentFile({ id, name: actualName, handle, savedAt: Date.now(), lastOpenedAt: Date.now(), availability: "available", kind: "file" });
        logger.info("Recent document opened", { category: "file", fileName: name, source: "recent-file" });
        showToast(`Opened ${name}`);
        return;
      }

      // Snapshot entry (fallback browsers / entries created before 1.6.3).
      const record = await loadRecentSketch(id).catch(() => null);
      if (!record) {
        updateRecentFileStatus(id, "missing");
        showToast("This drawing is no longer available. You can remove it from Recent files or try again later.", "error");
        return;
      }
      if (!confirmCanvasReplacement(`open “${record.name}”`)) return;
      const loadedSignature = loadDrawingIntoCanvas(serializeDrawing({ elements: record.elements || [], appState: record.appState, files: record.files, format: record.format || getDrawingFormat(record.name), metadata: record.metadata, extensions: record.extensions }));
      setCurrentFile({ id: null, name: record.name, handle: null }, loadedSignature);
      rememberRecentFile({ ...record, lastOpenedAt: Date.now(), availability: "available", kind: "snapshot" });
      logger.info("Recent snapshot opened", { category: "file", fileName: record.name, source: "recent-snapshot" });
      showToast(`Opened ${record.name}`);
    } catch (error) {
      const err = normalizeFsError(error, "Unable to open drawing");
      if (err.kind === "not-found") {
        updateRecentFileStatus(id, "missing");
        showToast("Unable to open this file. It may have been moved or deleted.", "error");
      } else if (err.kind === "permission") {
        updateRecentFileStatus(id, "permission");
        handleFileError(error, "Unable to open drawing");
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
    let savedFileMeta = null;
    let savedSceneSignature = null;
    try {
      fileId = localStorage.getItem("sketchizi-current-file-id");
      folderId = localStorage.getItem("sketchizi-current-folder-id");
      savedFileMeta = JSON.parse(localStorage.getItem("sketchizi-current-file-meta") || "null");
      savedSceneSignature = localStorage.getItem("sketchizi-current-file-scene-signature");
    } catch {}
    if (fileId) {
      loadFileHandle(fileId).then((handle) => {
        if (cancelled || currentFileRef.current) return;
        if (handle) {
          currentFileRef.current = { id: fileId, name: handle.name || savedFileMeta?.name || "Untitled drawing", handle };
        } else if (savedFileMeta?.name) {
          currentFileRef.current = { id: null, name: savedFileMeta.name, handle: null, fallback: Boolean(savedFileMeta.fallback) };
          try {
            localStorage.removeItem("sketchizi-current-file-id");
            localStorage.setItem("sketchizi-current-file-meta", JSON.stringify({ name: savedFileMeta.name, handleBacked: false, fallback: Boolean(savedFileMeta.fallback) }));
          } catch {}
        } else {
          return;
        }
        currentFileSceneSignatureRef.current = savedSceneSignature;
        setCurrentFileState(currentFileRef.current);
        if (apiRef.current) {
          const liveSignature = getLiveSceneSignature(apiRef.current.getSceneElementsIncludingDeleted?.() || apiRef.current.getSceneElements?.() || []);
          if (currentFileSceneSignatureRef.current == null) currentFileSceneSignatureRef.current = liveSignature;
          try { localStorage.setItem("sketchizi-current-file-scene-signature", currentFileSceneSignatureRef.current); } catch {}
          updateDocumentDirty(liveSignature !== currentFileSceneSignatureRef.current);
        }
      });
    } else if (savedFileMeta?.name && !currentFileRef.current) {
      currentFileRef.current = { id: null, name: savedFileMeta.name, handle: null, fallback: Boolean(savedFileMeta.fallback) };
      currentFileSceneSignatureRef.current = savedSceneSignature;
      setCurrentFileState(currentFileRef.current);
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
  fileActionsRef.current = { openDrawingFromDisk, openFolderFromDisk, openRecentFolder, openDrawingFromCurrentFolder, saveDrawingAs, saveCurrentDrawing, createNewFile, closeCurrentFolder, openRecentFile, removeRecentFile: forgetRecentFile, updateRecentFileStatus, clearRecentFiles, removeRecentFolder: forgetRecentFolder, clearRecentFolders, updateRecentFolderStatus, markRecentFolderOpened, refreshCurrentFolderFiles, getCurrentFolder: () => currentFolderRef.current, clearFileAssociation: () => setCurrentFile(null), startCollaboration };
  return {
    recentFiles, setRecentFiles, recentFolders, setRecentFolders,
    currentFolder, currentFolderRef, currentFolderFiles, setCurrentFolder, setCurrentFolderFiles, refreshCurrentFolderFiles,
    currentFile, currentFileRef, setCurrentFile, documentDirty, markCurrentDocumentChanged, fileActionsRef,
    rememberRecentFile, forgetRecentFile, clearRecentFiles, rememberRecentFolder, markRecentFolderOpened, updateRecentFolderStatus, forgetRecentFolder, clearRecentFolders,
    handleFileError, currentSceneText, loadDrawingIntoCanvas, openFolderFromDisk, openRecentFolder, openDrawingFromDisk,
    openDrawingFromCurrentFolder, closeCurrentFolder, createNewFile, saveDrawingAs, saveCurrentDrawing, openRecentFile,
  };
}
