import { useState } from "react";
import { deleteDirectoryHandle, deleteFileHandle, deleteRecentSketch, loadAllDirectoryHandles, saveDirectoryHandle } from "../../persistence";

export function useRecentFiles({ currentFileRef, currentFolderRef }) {
  const [recentFiles, setRecentFiles] = useState(() => { try { const saved = JSON.parse(localStorage.getItem("sketchizi-recent-files") || "[]"); return Array.isArray(saved) ? saved.slice(0, 10) : []; } catch { return []; } });
  const [recentFolders, setRecentFolders] = useState(() => { try { const saved = JSON.parse(localStorage.getItem("sketchizi-recent-folders") || "[]"); return Array.isArray(saved) ? saved.slice(0, 5) : []; } catch { return []; } });

  const rememberRecentFile = (record) => {
    if (!record?.id) return;
    const actualName = record.handle?.name || record.name || "Untitled drawing";
    setRecentFiles((current) => {
      const next = [{ id: record.id, name: actualName, savedAt: record.savedAt || Date.now(), kind: record.kind || "snapshot" }, ...current.filter((item) => item.id !== record.id)].slice(0, 10);
      try { localStorage.setItem("sketchizi-recent-files", JSON.stringify(next)); } catch {}
      current.filter((item) => !next.some((n) => n.id === item.id) && item.id !== currentFileRef.current?.id).forEach((item) => { deleteFileHandle(item.id); if (item.kind === "snapshot") deleteRecentSketch(item.id).catch(() => {}); });
      return next;
    });
  };
  const forgetRecentFile = (id) => {
    setRecentFiles((current) => { const next = current.filter((item) => item.id !== id); try { localStorage.setItem("sketchizi-recent-files", JSON.stringify(next)); } catch {} return next; });
    if (currentFileRef.current?.id !== id) deleteFileHandle(id); deleteRecentSketch(id).catch(() => {});
  };
  const clearRecentFiles = () => {
    const ids = recentFiles.map((item) => item.id); setRecentFiles([]); try { localStorage.setItem("sketchizi-recent-files", "[]"); } catch {}
    ids.forEach((id) => { if (id !== currentFileRef.current?.id) { deleteFileHandle(id); deleteRecentSketch(id).catch(() => {}); } });
  };
  const rememberRecentFolder = async (handle, name) => {
    if (!handle) return null;
    const stored = await loadAllDirectoryHandles(); let id = null;
    if (handle.isSameEntry) for (const entry of stored) { try { if (await handle.isSameEntry(entry.handle)) { id = entry.id; break; } } catch {} }
    id ||= `folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const persisted = await saveDirectoryHandle(id, handle); const entry = { id, name: String(name || handle.name || "Folder"), openedAt: Date.now() };
    if (persisted) setRecentFolders((current) => {
      const next = [entry, ...current.filter((item) => item.id !== id)].slice(0, 5);
      try { localStorage.setItem("sketchizi-recent-folders", JSON.stringify(next)); } catch {}
      current.filter((item) => !next.some((n) => n.id === item.id) && item.id !== currentFolderRef.current?.id).forEach((item) => deleteDirectoryHandle(item.id));
      return next;
    });
    return { ...entry, persisted };
  };
  const forgetRecentFolder = (id) => {
    setRecentFolders((current) => { const next = current.filter((item) => item.id !== id); try { localStorage.setItem("sketchizi-recent-folders", JSON.stringify(next)); } catch {} return next; });
    if (currentFolderRef.current?.id !== id) deleteDirectoryHandle(id);
  };
  const clearRecentFolders = () => {
    const ids = recentFolders.map((item) => item.id); setRecentFolders([]); try { localStorage.setItem("sketchizi-recent-folders", "[]"); } catch {}
    ids.forEach((id) => { if (id !== currentFolderRef.current?.id) deleteDirectoryHandle(id); });
  };
  return { recentFiles, setRecentFiles, recentFolders, setRecentFolders, rememberRecentFile, forgetRecentFile, clearRecentFiles, rememberRecentFolder, forgetRecentFolder, clearRecentFolders };
}
