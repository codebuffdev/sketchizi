import { useState } from "react";
import { deleteDirectoryHandle, deleteFileHandle, deleteRecentSketch, loadAllDirectoryHandles, saveDirectoryHandle } from "../../persistence";

export function useRecentFiles({ currentFileRef, currentFolderRef }) {
  const [recentFiles, setRecentFiles] = useState(() => { try { const saved = JSON.parse(localStorage.getItem("sketchizi-recent-files") || "[]"); return Array.isArray(saved) ? saved.slice(0, 10) : []; } catch { return []; } });
  const [recentFolders, setRecentFolders] = useState(() => { try { const saved = JSON.parse(localStorage.getItem("sketchizi-recent-folders") || "[]"); return Array.isArray(saved) ? saved.slice(0, 5) : []; } catch { return []; } });

  const rememberRecentFile = (record) => {
    if (!record?.id) return;
    const actualName = record.handle?.name || record.name || "Untitled drawing";
    setRecentFiles((current) => {
      const previous = current.find((item) => item.id === record.id);
      const availability = record.availability === "available" ? undefined : (record.availability ?? previous?.availability);
      const next = [{
        id: record.id,
        name: actualName,
        savedAt: record.savedAt || previous?.savedAt || Date.now(),
        lastOpenedAt: record.lastOpenedAt ?? previous?.lastOpenedAt,
        kind: record.kind || previous?.kind || "snapshot",
        availability,
      }, ...current.filter((item) => item.id !== record.id)].slice(0, 10);
      try { localStorage.setItem("sketchizi-recent-files", JSON.stringify(next)); } catch {}
      current.filter((item) => !next.some((n) => n.id === item.id) && item.id !== currentFileRef.current?.id).forEach((item) => { deleteFileHandle(item.id); if (item.kind === "snapshot") deleteRecentSketch(item.id).catch(() => {}); });
      return next;
    });
  };
  const updateRecentFileStatus = (id, status) => {
    if (!id) return;
    setRecentFiles((current) => {
      const next = current.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item };
        if (!status || status === "available") delete updated.availability;
        else updated.availability = status;
        return updated;
      });
      try { localStorage.setItem("sketchizi-recent-files", JSON.stringify(next)); } catch {}
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
  const persistRecentFolders = (next) => {
    try { localStorage.setItem("sketchizi-recent-folders", JSON.stringify(next)); } catch {}
  };
  const updateRecentFolderStatus = (id, status) => {
    if (!id) return;
    setRecentFolders((current) => {
      const next = current.map((item) => {
        if (item.id !== id) return item;
        const updated = { ...item };
        if (!status || status === "available") delete updated.availability;
        else updated.availability = status;
        if (status === "available") updated.lastCheckedAt = Date.now();
        return updated;
      });
      persistRecentFolders(next);
      return next;
    });
  };
  const markRecentFolderOpened = (id) => {
    if (!id) return;
    setRecentFolders((current) => {
      const existing = current.find((item) => item.id === id);
      if (!existing) return current;
      const updated = { ...existing, openedAt: Date.now(), lastCheckedAt: Date.now() };
      delete updated.availability;
      const next = [updated, ...current.filter((item) => item.id !== id)].slice(0, 5);
      persistRecentFolders(next);
      return next;
    });
  };
  const rememberRecentFolder = async (handle, name) => {
    if (!handle) return null;
    const stored = await loadAllDirectoryHandles(); let id = null;
    if (handle.isSameEntry) for (const entry of stored) { try { if (await handle.isSameEntry(entry.handle)) { id = entry.id; break; } } catch {} }
    id ||= `folder-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const persisted = await saveDirectoryHandle(id, handle); const now = Date.now();
    const entry = { id, name: String(name || handle.name || "Folder"), openedAt: now, lastCheckedAt: now, kind: "directory" };
    if (persisted) setRecentFolders((current) => {
      const next = [entry, ...current.filter((item) => item.id !== id)].slice(0, 5);
      persistRecentFolders(next);
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
  return { recentFiles, setRecentFiles, recentFolders, setRecentFolders, rememberRecentFile, updateRecentFileStatus, forgetRecentFile, clearRecentFiles, rememberRecentFolder, markRecentFolderOpened, updateRecentFolderStatus, forgetRecentFolder, clearRecentFolders };
}
