import { useEffect, useMemo, useRef, useState } from "react";
import IconLibraryPanel from "./IconLibraryPanel";
import PropertiesPanel from "./PropertiesPanel";
import LayoutToolbar from "./LayoutToolbar";
import Minimap from "./Minimap";
import ShortcutHelp from "./ShortcutHelp";
import {
  Excalidraw,
  convertToExcalidrawElements,
} from "@excalidraw/excalidraw";
import { fetchEraserCatalog, cacheEraserIcons, registerEraserServiceWorker } from "./eraserLibrary";
import { loadSketch, saveSketch, saveRecentSketch, loadRecentSketch, saveEmergencyBackup, loadEmergencyBackup, clearEmergencyBackup, clearSketch } from "./persistence";

function App() {
  const [activeCategory, setActiveCategory] = useState("Eraser Icons");
  const [search, setSearch] = useState("");
  const [remoteIcons, setRemoteIcons] = useState([]);
  const [eraserCatalog, setEraserCatalog] = useState([]);
  const [eraserSyncing, setEraserSyncing] = useState(false);
  const [eraserSyncProgress, setEraserSyncProgress] = useState({ done: 0, total: 0 });
  const [eraserSyncError, setEraserSyncError] = useState("");
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState("");
  const [connectionMode, setConnectionMode] = useState(false);
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [selectedConnector, setSelectedConnector] = useState(null);
  const [layoutOpen, setLayoutOpen] = useState(false);
  const [gridEnabled, setGridEnabled] = useState(false);
  const [gridSize, setGridSize] = useState(20);
  const [selectedCount, setSelectedCount] = useState(0);
  const [selectedElements, setSelectedElements] = useState([]);
  const [propertiesOpen, setPropertiesOpen] = useState(false);
  const [propertiesAutoOpen, setPropertiesAutoOpen] = useState(() => {
    try {
      const saved = localStorage.getItem("sketchizi-properties-auto-open");
      return saved === null ? false : saved === "true";
    } catch {
      return false;
    }
  });
  const [favorites, setFavorites] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("diagram-app-favorites") || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });
  const [recentIcons, setRecentIcons] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("diagram-app-recent-icons") || "[]");
      return Array.isArray(saved) ? saved : [];
    } catch {
      return [];
    }
  });
  const lastSelectionSignature = useRef("");
  const searchRef = useRef(null);
  const iconListRef = useRef(null);
  const [iconDisplayLimit, setIconDisplayLimit] = useState(120);
  const apiRef = useRef(null);
  const minimapFrameRef = useRef(null);
  const minimapElementsRef = useRef([]);
  const [minimapOpen, setMinimapOpen] = useState(true);
  const [themeMode, setThemeMode] = useState(() => {
    try {
      const saved = localStorage.getItem("diagram-app-theme");
      return saved === "dark" || saved === "light" || saved === "system" ? saved : "light";
    } catch {
      return "light";
    }
  });
  const [systemDark, setSystemDark] = useState(() =>
    typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches
  );
  const [minimapScene, setMinimapScene] = useState({ elements: [], viewport: null });
  const minimapDragRef = useRef(null);
  const iconPointerDragRef = useRef(null);
  const suppressIconClickRef = useRef(false);
  const [draggingIcon, setDraggingIcon] = useState(null);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [savedSketch, setSavedSketch] = useState(null);
  const [sketchReady, setSketchReady] = useState(false);
  const [storageError, setStorageError] = useState(null);
  const [recentFiles, setRecentFiles] = useState(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("sketchizi-recent-files") || "[]");
      return Array.isArray(saved) ? saved.slice(0, 8) : [];
    } catch { return []; }
  });
  const saveTimerRef = useRef(null);
  const saveRequestRef = useRef(Promise.resolve());

  // Keep Diagramly overlays mutually exclusive with each other and with
  // Excalidraw's native menu. The native menu is owned by Excalidraw, so
  // Escape is the safest way to close it when opening a Diagramly panel.
  const closeNativeMenu = () => {
    if (typeof document === "undefined") return;
    document.dispatchEvent(new KeyboardEvent("keydown", {
      key: "Escape",
      code: "Escape",
      bubbles: true,
      cancelable: true,
    }));
  };

  const closeDiagramlyPanels = ({ except } = {}) => {
    if (except !== "library") setLibraryOpen(false);
    if (except !== "layout") setLayoutOpen(false);
    if (except !== "properties") setPropertiesOpen(false);
  };

  const openExclusivePanel = (panel) => {
    setLibraryOpen(panel === "library");
    setLayoutOpen(panel === "layout");
    setPropertiesOpen(panel === "properties");
  };

  const getOpenPanel = () => {
    if (libraryOpen) return "library";
    if (layoutOpen) return "layout";
    if (propertiesOpen) return "properties";
    return null;
  };

  useEffect(() => {
    try { localStorage.setItem("diagram-app-favorites", JSON.stringify(favorites)); } catch {}
  }, [favorites]);

  useEffect(() => {
    try { localStorage.setItem("diagram-app-recent-icons", JSON.stringify(recentIcons)); } catch {}
  }, [recentIcons]);

  useEffect(() => {
    // Protect the persistent canvas from accidental use of Excalidraw's
    // native "Reset the canvas" action. The native action clears the scene
    // immediately, so intercept it before Excalidraw receives the click and
    // ask for explicit confirmation first.
    const handleResetCanvas = (event) => {
      const target = event.target?.closest?.('button, [role="button"], a');
      if (!target) return;
      const text = target.textContent?.replace(/\s+/g, " ").trim().toLowerCase();
      if (text !== "reset the canvas") return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();

      const confirmed = window.confirm(
        "Clear this canvas? Your saved Sketchizi canvas will also be cleared. This action cannot be undone."
      );
      if (!confirmed) return;

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
        commitToHistory: true,
      });

      clearEmergencyBackup();
      clearSketch().catch(() => {
        setStorageError({
          kind: "write",
          message: "The canvas was cleared, but the saved local copy could not be removed.",
          emergencySaved: false,
        });
      });
    };

    document.addEventListener("click", handleResetCanvas, true);
    return () => document.removeEventListener("click", handleResetCanvas, true);
  }, []);

  const rememberRecentFile = (record) => {
    if (!record?.id) return;
    setRecentFiles((current) => {
      const next = [
        { id: record.id, name: record.name || "Untitled drawing", savedAt: record.savedAt || Date.now() },
        ...current.filter((item) => item.id !== record.id),
      ].slice(0, 8);
      try { localStorage.setItem("sketchizi-recent-files", JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const saveCurrentToRecentFiles = async () => {
    const api = apiRef.current;
    if (!api) return;
    const name = window.prompt("Name this drawing", `Untitled drawing ${new Date().toLocaleDateString()}`);
    if (name === null) return;
    const record = await saveRecentSketch({
      id: `drawing-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      elements: api.getSceneElements(),
      appState: api.getAppState(),
      files: api.getFiles?.() || {},
    }).catch((error) => {
      setStorageError({ kind: error?.kind || "write", message: error?.message || "Unable to save this recent file." });
      return null;
    });
    if (record) rememberRecentFile(record);
  };

  const openRecentFile = async (id) => {
    const api = apiRef.current;
    if (!api || !id) return;
    const record = await loadRecentSketch(id).catch(() => null);
    if (!record) {
      setRecentFiles((current) => current.filter((item) => item.id !== id));
      return;
    }
    api.updateScene({
      elements: record.elements || [],
      appState: record.appState ? { ...api.getAppState(), ...record.appState, zoom: { value: record.appState.zoom?.value ?? record.appState.zoom ?? 1 } } : api.getAppState(),
      commitToHistory: true,
    });
    if (record.files) api.addFiles?.(Object.values(record.files));
    setSavedSketch(record);
    rememberRecentFile(record);
    queueSketchSave(record.elements || [], record.appState || api.getAppState());
    closeNativeMenu();
  };

  useEffect(() => {
    // Keep Excalidraw's useful native menu, but make its community section
    // Diagramly-owned: GitHub only. Never render or preserve an in-app Install
    // control; installation belongs to the browser chrome.
    const githubUrl = "https://github.com/codebuffdev";
    let frame = 0;

    const cleanNativeMenu = () => {
      frame = 0;
      const anchors = document.querySelectorAll("body a");
      anchors.forEach((node) => {
        const text = node.textContent?.replace(/\s+/g, " ").trim();
        if (text === "GitHub") {
          node.href = githubUrl;
          node.target = "_blank";
          node.rel = "noreferrer noopener";
        } else if (text === "Follow us" || text === "Discord chat") {
          (node.closest("li, .dropdown-menu-item, .context-menu-item, .menu-item") || node).remove();
        }
      });

      document.querySelectorAll("body *").forEach((node) => {
        const text = node.textContent?.replace(/\s+/g, " ").trim();
        if (text === "Excalidraw links" && node.children.length === 0) node.remove();
        if ((node.tagName === "BUTTON" || node.getAttribute?.("role") === "button") && text === "Install") node.remove();
      });

      // Put Diagramly theme selection inside the native Excalidraw menu so the
      // theme control never competes with Library on compact/tablet layouts.
      if (!document.querySelector("[data-diagramly-theme-menu]")) {
        const backgroundLabel = [...document.querySelectorAll("body *")].find(
          (node) => node.children.length === 0 && node.textContent?.replace(/\s+/g, " ").trim() === "Canvas background"
        );
        if (backgroundLabel) {
          const host = backgroundLabel.parentElement || backgroundLabel;
          const menuParent = host.parentElement || host;

          if (!document.querySelector("[data-sketchizi-properties-menu]")) {
            const propertiesSection = document.createElement("div");
            propertiesSection.dataset.sketchiziPropertiesMenu = "true";
            propertiesSection.className = "sketchizi-native-settings-section";
            propertiesSection.innerHTML = `
              <div class="sketchizi-native-settings-title">Properties</div>
              <button type="button" class="sketchizi-property-setting" data-properties-auto-open>
                <span>Auto-open on selection</span>
                <span class="sketchizi-switch" aria-hidden="true"><span></span></span>
              </button>
            `;
            menuParent.parentElement?.insertBefore(propertiesSection, menuParent);
          }

          if (!document.querySelector("[data-sketchizi-recent-files-menu]")) {
            const recentSection = document.createElement("div");
            recentSection.dataset.sketchiziRecentFilesMenu = "true";
            recentSection.className = "sketchizi-native-settings-section sketchizi-recent-files-section";
            recentSection.innerHTML = `
              <div class="sketchizi-native-settings-title">Recent files</div>
              <button type="button" class="sketchizi-recent-save" data-recent-save>Save current drawing</button>
              <div class="sketchizi-recent-list" data-recent-list></div>
            `;
            menuParent.parentElement?.insertBefore(recentSection, menuParent);
          }

          const themeSection = document.createElement("div");
          themeSection.dataset.diagramlyThemeMenu = "true";
          themeSection.className = "diagramly-native-theme-section";
          themeSection.innerHTML = `
            <div class="diagramly-native-theme-title">Theme</div>
            <div class="diagramly-native-theme-options" role="group" aria-label="Theme selection">
              <button type="button" data-theme-mode="dark">☾ Dark</button>
              <button type="button" data-theme-mode="light">☀ Light</button>
              <button type="button" data-theme-mode="system">▣ System</button>
            </div>
          `;
          menuParent.parentElement?.insertBefore(themeSection, menuParent);
        }
      }

      const recentMenu = document.querySelector("[data-sketchizi-recent-files-menu]");
      const recentSaveButton = recentMenu?.querySelector("[data-recent-save]");
      if (recentSaveButton && recentSaveButton.dataset.bound !== "true") {
        recentSaveButton.dataset.bound = "true";
        recentSaveButton.addEventListener("click", saveCurrentToRecentFiles);
      }
      const recentList = recentMenu?.querySelector("[data-recent-list]");
      if (recentList) {
        recentList.innerHTML = recentFiles.length
          ? recentFiles.map((item) => `<button type="button" class="sketchizi-recent-item" data-recent-id="${item.id}"><span>${item.name.replace(/[&<>\"]/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;"}[c]))}</span><small>${new Date(item.savedAt).toLocaleDateString()}</small></button>`).join("")
          : `<div class="sketchizi-recent-empty">No saved drawings yet</div>`;
        recentList.querySelectorAll("[data-recent-id]").forEach((button) => {
          button.addEventListener("click", () => openRecentFile(button.dataset.recentId));
        });
      }

      const themeMenu = document.querySelector("[data-diagramly-theme-menu]");
      themeMenu?.querySelectorAll("[data-theme-mode]").forEach((button) => {
        if (button.dataset.bound === "true") return;
        button.dataset.bound = "true";
        button.addEventListener("click", () => setThemeMode(button.dataset.themeMode));
      });
      themeMenu?.querySelectorAll("[data-theme-mode]").forEach((button) => {
        button.classList.toggle("selected", button.dataset.themeMode === themeMode);
      });

      const propertiesMenu = document.querySelector("[data-sketchizi-properties-menu]");
      const propertiesButton = propertiesMenu?.querySelector("[data-properties-auto-open]");
      if (propertiesButton && propertiesButton.dataset.bound !== "true") {
        propertiesButton.dataset.bound = "true";
        propertiesButton.addEventListener("click", () => {
          setPropertiesAutoOpen((value) => !value);
        });
      }
      propertiesButton?.classList.toggle("enabled", propertiesAutoOpen);
      propertiesButton?.setAttribute("aria-pressed", String(propertiesAutoOpen));
    };

    const scheduleCleanup = () => {
      if (frame) return;
      frame = requestAnimationFrame(cleanNativeMenu);
    };

    scheduleCleanup();
    const observer = new MutationObserver(scheduleCleanup);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => { observer.disconnect(); if (frame) cancelAnimationFrame(frame); };
  }, [themeMode, propertiesAutoOpen, recentFiles]);

  const isDarkTheme = themeMode === "dark" || (themeMode === "system" && systemDark);

  // Restore the last local sketch before mounting Excalidraw. IndexedDB is
  // used instead of localStorage so larger diagrams and embedded image files
  // can survive browser restarts without hitting the small localStorage quota.
  useEffect(() => {
    let cancelled = false;
    loadSketch()
      .then((record) => {
        if (!cancelled) {
          setSavedSketch(record);
          setStorageError(null);
          setSketchReady(true);
        }
      })
      .catch((error) => {
        if (!cancelled) {
          // If IndexedDB cannot be opened/read, try the small emergency
          // localStorage snapshot before giving up on restoration.
          const emergency = loadEmergencyBackup();
          setSavedSketch(emergency || null);
          setStorageError({
            kind: error?.kind || "unavailable",
            message: error?.message || "Local storage is unavailable.",
          });
          setSketchReady(true);
        }
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
        clearEmergencyBackup();
        setStorageError(null);
        return true;
      })
      .catch((error) => {
        // Keep the newest complete snapshot in a second, smaller storage
        // mechanism. This can recover work when IndexedDB is unavailable,
        // while the visible warning makes it clear when even that fails.
        const emergencySaved = saveEmergencyBackup(payload);
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
    const payload = {
      elements: api.getSceneElements(),
      appState: api.getAppState(),
      files: api.getFiles?.() || {},
    };
    persistSketchNow(payload);
  };

  const downloadRecoveryBackup = () => {
    const api = apiRef.current;
    if (!api) return;
    const data = {
      type: "excalidraw",
      version: 2,
      source: "https://sketchizi.pages.dev",
      elements: api.getSceneElements(),
      appState: api.getAppState(),
      files: api.getFiles?.() || {},
    };
    const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `sketchizi-recovery-${new Date().toISOString().replace(/[:.]/g, "-")}.excalidraw`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    try {
      localStorage.setItem("diagram-app-theme", themeMode);
    } catch {
      // Ignore storage failures (private browsing, blocked storage, etc.).
    }
  }, [themeMode]);

  useEffect(() => {
    try {
      localStorage.setItem("sketchizi-properties-auto-open", String(propertiesAutoOpen));
    } catch {
      // Ignore storage failures.
    }

    // When auto-open is disabled, Properties must disappear completely from
    // the canvas UI. This also closes an already-open panel immediately.
    if (!propertiesAutoOpen) {
      setPropertiesOpen(false);
    }
  }, [propertiesAutoOpen]);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) return undefined;
    const handleChange = (event) => setSystemDark(event.matches);
    media.addEventListener?.("change", handleChange);
    return () => media.removeEventListener?.("change", handleChange);
  }, []);

  const fitDiagram = () => {
    const api = apiRef.current;
    if (!api) return;
    const elements = api.getSceneElements().filter((element) => !element.isDeleted);
    if (!elements.length) return;
    api.scrollToContent?.(elements, { fitToViewport: true, animate: true });
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      const target = event.target;
      const isTyping =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target?.isContentEditable;
      const plainKey = !event.ctrlKey && !event.metaKey && !event.altKey;
      const key = event.key.toLowerCase();

      if (event.key === "Escape") {
        if (shortcutHelpOpen) setShortcutHelpOpen(false);
        else if (libraryOpen) { setLibraryOpen(false); searchRef.current?.blur(); }
        else if (layoutOpen) setLayoutOpen(false);
        else if (propertiesOpen) setPropertiesOpen(false);
        else if (connectionMode) activateSelectionTool();
        return;
      }

      if (isTyping) return;

      if (event.key === "?" || (event.shiftKey && event.key === "/")) {
        event.preventDefault();
        setShortcutHelpOpen(true);
        return;
      }
      if (event.key === "/") {
        event.preventDefault();
        openExclusivePanel("library");
        requestAnimationFrame(() => searchRef.current?.focus());
        return;
      }
      if (!plainKey) return;

      if (key === "l") {
        event.preventDefault();
        openExclusivePanel(layoutOpen ? null : "layout");
        return;
      }
      if (key === "d") { event.preventDefault(); setThemeMode((mode) => mode === "dark" ? "light" : "dark"); return; }
      if (event.shiftKey && key === "g") { event.preventDefault(); toggleGrid(); return; }
      if (key === "p" && propertiesAutoOpen && selectedCount > 0) {
        event.preventDefault();
        openExclusivePanel(propertiesOpen ? null : "properties");
        return;
      }
      if (key === "m") { event.preventDefault(); setMinimapOpen((open) => !open); return; }
      if (key === "f") { event.preventDefault(); fitDiagram(); return; }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [libraryOpen, layoutOpen, propertiesOpen, propertiesAutoOpen, connectionMode, shortcutHelpOpen, selectedCount, gridEnabled, gridSize]);

  useEffect(() => {
    // Excalidraw owns its native menu. If it opens, immediately close every
    // Diagramly panel. Do not use `.app` as the exclusion here because the
    // native Excalidraw menu itself lives inside the app root.
    const isCustomControl = (target) => Boolean(target?.closest(
      ".library-toggle, .library-panel, .layout-toolbar, .layout-popover, .properties-toggle, .properties-panel, .theme-control, .minimap, .minimap-toggle, .shortcut-overlay"
    ));

    const closeForNativeMenu = (target) => {
      if (!target || isCustomControl(target)) return;
      const nativeMenuButton = target.closest(
        ".excalidraw .ToolIcon__icon, .excalidraw .dropdown-menu-button, .excalidraw [aria-label*='menu' i], .excalidraw [title*='menu' i]"
      );
      if (nativeMenuButton) openExclusivePanel(null);
    };

    const handlePointerDown = (event) => closeForNativeMenu(event.target instanceof Element ? event.target : null);
    document.addEventListener("pointerdown", handlePointerDown, true);

    const isVisible = (node) => {
      if (!(node instanceof HTMLElement)) return false;
      const style = window.getComputedStyle(node);
      return style.display !== "none" && style.visibility !== "hidden" && node.getAttribute("aria-hidden") !== "true";
    };

    const closeIfNativeMenuVisible = () => {
      if (!getOpenPanel()) return;
      const nativeMenu = document.querySelector(
        ".excalidraw .dropdown-menu, .excalidraw .context-menu, .excalidraw .Island__menu"
      );
      if (nativeMenu && isVisible(nativeMenu)) openExclusivePanel(null);
    };

    const observer = new MutationObserver(closeIfNativeMenuVisible);
    observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["class", "style", "aria-hidden"] });
    closeIfNativeMenuVisible();

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown, true);
      observer.disconnect();
    };
  }, [libraryOpen, layoutOpen, propertiesOpen]);

  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/service-worker.js").catch(() => {});
    }
    registerEraserServiceWorker();
    let cancelled = false;
    setRemoteLoading(true);
    const controller = new AbortController();
    fetchEraserCatalog(controller.signal)
      .then((icons) => { if (!cancelled) { setEraserCatalog(icons); setRemoteLoading(false); } })
      .catch((error) => { if (!cancelled) { setRemoteLoading(false); if (error.name !== "AbortError") setRemoteError(error.message || "Unable to load Eraser icons."); } });
    return () => { cancelled = true; controller.abort(); };
  }, []);

  useEffect(() => {
    const query = search.trim().toLowerCase();
    if (!query) { setRemoteIcons(eraserCatalog); return; }
    setRemoteIcons(eraserCatalog.filter((icon) => icon.name.toLowerCase().includes(query) || icon.id.toLowerCase().includes(query)));
  }, [eraserCatalog, search]);

  const syncEraserLibrary = async () => {
    if (!eraserCatalog.length || eraserSyncing) return;
    setEraserSyncing(true);
    setEraserSyncError("");
    setEraserSyncProgress({ done: 0, total: eraserCatalog.length });
    try {
      await cacheEraserIcons(eraserCatalog, (done, total) => setEraserSyncProgress({ done, total }));
    } catch (error) {
      if (error?.name !== "AbortError") setEraserSyncError(error.message || "Icon sync failed.");
    } finally {
      setEraserSyncing(false);
    }
  };

  const visibleIcons = useMemo(() => {
    if (!search.trim() && activeCategory === "Favorites") return favorites.filter((icon) => icon.source === "eraser");
    if (!search.trim() && activeCategory === "Recently Used") return recentIcons.filter((icon) => icon.source === "eraser");
    return remoteIcons;
  }, [activeCategory, remoteIcons, search, favorites, recentIcons]);

  useEffect(() => { setIconDisplayLimit(120); }, [search, activeCategory]);

  const iconKey = (icon) => `${icon.source || "local"}:${icon.id}`;

  const isFavorite = (icon) => favorites.some((item) => iconKey(item) === iconKey(icon));

  const toggleFavorite = (icon) => {
    setFavorites((current) => {
      const key = iconKey(icon);
      if (current.some((item) => iconKey(item) === key)) {
        return current.filter((item) => iconKey(item) !== key);
      }
      return [icon, ...current];
    });
  };

  const markRecentlyUsed = (icon) => {
    setRecentIcons((current) => {
      const key = iconKey(icon);
      return [icon, ...current.filter((item) => iconKey(item) !== key)].slice(0, 18);
    });
  };

  const updateMinimap = (elements, appState) => {
    minimapElementsRef.current = elements;

    if (!minimapOpen) return;
    if (minimapFrameRef.current) return;

    minimapFrameRef.current = requestAnimationFrame(() => {
      minimapFrameRef.current = null;
      const scene = minimapElementsRef.current.filter(
        (element) => !element.isDeleted && element.width > 0 && element.height > 0,
      );

      if (!scene.length) {
        setMinimapScene({ elements: [], viewport: null });
        return;
      }

      const bounds = scene.reduce(
        (acc, element) => ({
          minX: Math.min(acc.minX, element.x),
          minY: Math.min(acc.minY, element.y),
          maxX: Math.max(acc.maxX, element.x + element.width),
          maxY: Math.max(acc.maxY, element.y + element.height),
        }),
        { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
      );

      // Keep the minimap cheap even for very large diagrams. Tiny elements are
      // sampled when there are more than 1,500 scene objects; larger objects
      // are always retained so architecture diagrams remain readable.
      const simplified = scene.length > 1500
        ? scene.filter((element, index) => {
            const area = element.width * element.height;
            return area >= 1600 || index % Math.ceil(scene.length / 1500) === 0;
          })
        : scene;

      const zoom = appState.zoom?.value || 1;
      const canvas = document.querySelector('.excalidraw');
      const rect = canvas?.getBoundingClientRect();
      const viewport = rect
        ? {
            x: -(appState.scrollX || 0),
            y: -(appState.scrollY || 0),
            width: rect.width / zoom,
            height: rect.height / zoom,
          }
        : null;

      const selectedIds = appState.selectedElementIds || {};
      setMinimapScene({
        elements: simplified.map((element) => ({
          ...element,
          isSelected: !!selectedIds[element.id],
        })),
        bounds,
        viewport,
        sceneCount: scene.length,
      });
    });
  };

  useEffect(() => {
    if (!minimapOpen || !apiRef.current) return;
    const api = apiRef.current;
    updateMinimap(api.getSceneElements(), api.getAppState());
  }, [minimapOpen]);

  const centerOnMinimap = (sceneX, sceneY) => {
    const api = apiRef.current;
    if (!api) return;

    const appState = api.getAppState();
    const zoom = appState.zoom?.value || 1;
    const canvas = document.querySelector('.excalidraw');
    const rect = canvas?.getBoundingClientRect();
    if (!rect) return;

    api.updateScene({
      appState: {
        ...appState,
        scrollX: -(sceneX - rect.width / zoom / 2),
        scrollY: -(sceneY - rect.height / zoom / 2),
      },
      commitToHistory: false,
    });
  };

  const addIconToCanvas = (icon, clientX, clientY) => {
    const api = apiRef.current;
    if (!api) return;

    const canvas = document.querySelector(".excalidraw");
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const appState = api.getAppState();
    const zoom = appState.zoom?.value || 1;
    const scrollX = appState.scrollX || 0;
    const scrollY = appState.scrollY || 0;

    const width = 120;
    const height = 120;

    // Click-to-place should not put every icon at exactly the same
    // coordinates. Start at the requested point, then look for the first
    // nearby position that does not overlap an existing diagram icon.
    let baseX = (clientX - rect.left) / zoom - scrollX - width / 2;
    let baseY = (clientY - rect.top) / zoom - scrollY - height / 2;

    if (gridEnabled) {
      baseX = Math.round(baseX / gridSize) * gridSize;
      baseY = Math.round(baseY / gridSize) * gridSize;
    }

    const existingIcons = api
      .getSceneElements()
      .filter(
        (element) =>
          element.type === "image" && element.customData?.diagramIcon
      );

    // Always place a new icon beside an existing icon instead of stacking
    // multiple clicked icons at the same position. We first try the requested
    // position, then move horizontally in fixed steps until the slot is free.
    const gap = 24;
    const stepX = width + gap;

    const overlaps = (x, y) =>
      existingIcons.some((element) => {
        return (
          x < element.x + element.width &&
          x + width > element.x &&
          y < element.y + element.height &&
          y + height > element.y
        );
      });

    let x = baseX;
    let y = baseY;

    if (overlaps(x, y)) {
      // Prefer the right-hand side so icons form a clean horizontal row.
      let found = false;
      for (let i = 1; i <= existingIcons.length + 20; i += 1) {
        const candidateX = baseX + i * stepX;
        if (!overlaps(candidateX, baseY)) {
          x = candidateX;
          found = true;
          break;
        }
      }

      // If the right side is crowded, search left.
      if (!found) {
        for (let i = 1; i <= existingIcons.length + 20; i += 1) {
          const candidateX = baseX - i * stepX;
          if (!overlaps(candidateX, baseY)) {
            x = candidateX;
            found = true;
            break;
          }
        }
      }

      // Finally search vertically if the whole row is occupied.
      if (!found) {
        for (let row = 1; row <= existingIcons.length + 20 && !found; row += 1) {
          for (const direction of [1, -1]) {
            const candidateY = baseY + direction * row * (height + gap);
            if (!overlaps(baseX, candidateY)) {
              x = baseX;
              y = candidateY;
              found = true;
              break;
            }
          }
        }
      }
    }

    const fileId = `icon-${icon.id}-${Date.now()}-${Math.random()
      .toString(36)
      .slice(2, 7)}`;

    // Use the Eraser SVG URL itself as the Excalidraw file source.
    // The previous version wrapped the remote SVG inside a data: SVG. Browsers
    // block that nested cross-origin resource in many contexts, which caused
    // the broken-image placeholder on the canvas. Excalidraw ultimately loads
    // the file source through an <img>, so keeping the original SVG URL is the
    // correct path and preserves the real Eraser artwork.
    const imageSource = icon.src;

    const addImage = (dataURL) => {
      api.addFiles([
        {
          id: fileId,
          dataURL,
          mimeType: "image/svg+xml",
          created: Date.now(),
          lastRetrieved: Date.now(),
        },
      ]);

      const elements = convertToExcalidrawElements([
        {
          type: "image",
          x,
          y,
          width,
          height,
          fileId,
          customData: {
            diagramIcon: true,
            iconId: icon.id,
            iconName: icon.name,
            iconCategory: icon.category,
          },
        },
      ]);

      api.updateScene({
        elements: [...api.getSceneElements(), ...elements],
        commitToHistory: true,
      });
      markRecentlyUsed(icon);
    };

    // Do not fetch or transform the SVG here. The browser can render the
    // original Eraser SVG URL directly, avoiding the broken nested-data-SVG
    // placeholder while keeping insertion synchronous.
    addImage(imageSource);
  };

  const handleDragStart = (event, icon) => {
    event.dataTransfer.setData(
      "application/x-diagram-icon",
      JSON.stringify(icon)
    );
    event.dataTransfer.effectAllowed = "copy";
  };

  // Use a pointer-based drag path as the primary interaction. Native HTML5
  // drag/drop is unreliable for controls rendered inside the scrollable
  // library panel and can be intercepted by Excalidraw's canvas.
  const handleIconPointerDown = (event, icon) => {
    if (event.button !== 0 || event.target.closest?.(".favorite-button")) return;

    const isTouch = event.pointerType === "touch";
    const source = event.currentTarget;
    const startX = event.clientX;
    const startY = event.clientY;
    const pointerId = event.pointerId;
    const drag = {
      icon,
      startX,
      startY,
      pointerId,
      source,
      moved: false,
      armed: !isTouch,
      longPressTimer: null,
    };
    iconPointerDragRef.current = drag;

    const removeListeners = () => {
      window.removeEventListener("pointermove", move, true);
      window.removeEventListener("pointerup", up, true);
      window.removeEventListener("pointercancel", cancel, true);
    };

    const finish = (finishEvent, cancelled = false) => {
      const current = iconPointerDragRef.current;
      if (!current || finishEvent.pointerId !== current.pointerId) return;

      iconPointerDragRef.current = null;
      removeListeners();
      if (current.longPressTimer) window.clearTimeout(current.longPressTimer);

      if (current.armed) {
        try {
          current.source.releasePointerCapture?.(current.pointerId);
        } catch (_) {}
      }

      if (!cancelled && current.moved) {
        finishEvent.preventDefault();
        finishEvent.stopPropagation();
        addIconToCanvas(current.icon, finishEvent.clientX, finishEvent.clientY);
      }

      setDraggingIcon(null);
      window.setTimeout(() => {
        suppressIconClickRef.current = false;
      }, 0);
    };

    const cancel = (cancelEvent) => finish(cancelEvent, true);
    const up = (upEvent) => finish(upEvent, false);

    const move = (moveEvent) => {
      const current = iconPointerDragRef.current;
      if (!current || moveEvent.pointerId !== current.pointerId) return;

      const dx = moveEvent.clientX - current.startX;
      const dy = moveEvent.clientY - current.startY;

      // On touch, a normal vertical swipe should scroll the icon grid. A
      // deliberate long-press arms dragging so touch scrolling and icon drag
      // no longer compete for the same gesture.
      if (isTouch && !current.armed) {
        if (Math.hypot(dx, dy) >= 8) {
          if (current.longPressTimer) window.clearTimeout(current.longPressTimer);
          iconPointerDragRef.current = null;
          removeListeners();
        }
        return;
      }

      if (!current.armed || (!current.moved && Math.hypot(dx, dy) < 5)) return;

      current.moved = true;
      suppressIconClickRef.current = true;
      moveEvent.preventDefault();
      moveEvent.stopPropagation();
      setDraggingIcon({
        icon: current.icon,
        x: moveEvent.clientX,
        y: moveEvent.clientY,
      });
    };

    window.addEventListener("pointermove", move, { capture: true, passive: false });
    window.addEventListener("pointerup", up, { capture: true });
    window.addEventListener("pointercancel", cancel, { capture: true });

    if (isTouch) {
      // Let the browser own the initial touch gesture. If the finger stays
      // still long enough, switch to an intentional drag interaction.
      drag.longPressTimer = window.setTimeout(() => {
        const current = iconPointerDragRef.current;
        if (!current || current.pointerId !== pointerId) return;
        current.armed = true;
        try {
          source.setPointerCapture?.(pointerId);
        } catch (_) {}
        event.preventDefault();
        event.stopPropagation();
      }, 350);
    } else {
      // Mouse/pen keeps the immediate drag behavior used by desktop users.
      event.preventDefault();
      event.stopPropagation();
      try {
        source.setPointerCapture?.(pointerId);
      } catch (_) {}
    }
  };

  const handleIconClick = (icon) => {
    if (suppressIconClickRef.current) return;
    // Keep click-to-place behavior for users who prefer a single click.
    const canvas = document.querySelector(".excalidraw");
    const rect = canvas?.getBoundingClientRect();
    if (!rect) return;
    handleIconInsertAtCenter(icon);
  };

  const handleIconInsertAtCenter = (icon) => {
    const canvas = document.querySelector(".excalidraw");
    const rect = canvas?.getBoundingClientRect();
    if (!rect) return;
    addIconToCanvas(icon, rect.left + rect.width / 2, rect.top + rect.height / 2);
  };

  const handleDragOver = (event) => {
    if (event.dataTransfer?.types?.includes("application/x-diagram-icon")) {
      // Excalidraw has its own drag/drop handlers. Use the capture phase on
      // the app canvas so an icon dragged from the library cannot be swallowed
      // by Excalidraw before it reaches our drop handler.
      event.preventDefault();
      event.stopPropagation();
      event.dataTransfer.dropEffect = "copy";
    }
  };

  const handleDrop = (event) => {
    const raw = event.dataTransfer?.getData("application/x-diagram-icon");
    if (!raw) return;

    event.preventDefault();
    event.stopPropagation();

    try {
      addIconToCanvas(JSON.parse(raw), event.clientX, event.clientY);
    } catch (error) {
      console.error("Could not add icon:", error);
    }
  };

  const getSelectedElements = () => {
    const api = apiRef.current;
    if (!api) return [];
    const appState = api.getAppState();
    const selectedIds = Object.keys(appState.selectedElementIds || {});
    return api
      .getSceneElements()
      .filter((element) => selectedIds.includes(element.id) && !element.isDeleted);
  };


  const applyLayout = (operation) => {
    const api = apiRef.current;
    if (!api) return;

    const selected = getSelectedElements();
    if (selected.length < 2) return;

    const bounds = selected.map((element) => ({
      element,
      left: element.x,
      right: element.x + element.width,
      top: element.y,
      bottom: element.y + element.height,
      centerX: element.x + element.width / 2,
      centerY: element.y + element.height / 2,
    }));

    const next = new Map();
    const setXY = (element, x, y) => {
      next.set(element.id, {
        ...element,
        x,
        y,
        version: element.version + 1,
        versionNonce: Math.floor(Math.random() * 2147483647),
        updated: Date.now(),
      });
    };

    if (operation === "left") {
      const x = Math.min(...bounds.map((b) => b.left));
      bounds.forEach((b) => setXY(b.element, x, b.element.y));
    } else if (operation === "center") {
      const left = Math.min(...bounds.map((b) => b.left));
      const right = Math.max(...bounds.map((b) => b.right));
      const center = (left + right) / 2;
      bounds.forEach((b) => setXY(b.element, center - b.element.width / 2, b.element.y));
    } else if (operation === "right") {
      const right = Math.max(...bounds.map((b) => b.right));
      bounds.forEach((b) => setXY(b.element, right - b.element.width, b.element.y));
    } else if (operation === "top") {
      const y = Math.min(...bounds.map((b) => b.top));
      bounds.forEach((b) => setXY(b.element, b.element.x, y));
    } else if (operation === "middle") {
      const top = Math.min(...bounds.map((b) => b.top));
      const bottom = Math.max(...bounds.map((b) => b.bottom));
      const center = (top + bottom) / 2;
      bounds.forEach((b) => setXY(b.element, b.element.x, center - b.element.height / 2));
    } else if (operation === "bottom") {
      const bottom = Math.max(...bounds.map((b) => b.bottom));
      bounds.forEach((b) => setXY(b.element, b.element.x, bottom - b.element.height));
    } else if (operation === "distribute-horizontal" && selected.length >= 3) {
      const sorted = [...bounds].sort((a, b) => a.centerX - b.centerX);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const totalWidth = sorted.reduce((sum, b) => sum + b.element.width, 0);
      const gap = (last.right - first.left - totalWidth) / (sorted.length - 1);
      let x = first.left;
      sorted.forEach((b, index) => {
        if (index === 0) x = first.left;
        else x += sorted[index - 1].element.width + gap;
        setXY(b.element, x, b.element.y);
      });
    } else if (operation === "distribute-vertical" && selected.length >= 3) {
      const sorted = [...bounds].sort((a, b) => a.centerY - b.centerY);
      const first = sorted[0];
      const last = sorted[sorted.length - 1];
      const totalHeight = sorted.reduce((sum, b) => sum + b.element.height, 0);
      const gap = (last.bottom - first.top - totalHeight) / (sorted.length - 1);
      let y = first.top;
      sorted.forEach((b, index) => {
        if (index === 0) y = first.top;
        else y += sorted[index - 1].element.height + gap;
        setXY(b.element, b.element.x, y);
      });
    }

    if (!next.size) return;
    api.updateScene({
      elements: api.getSceneElements().map((element) => next.get(element.id) || element),
      commitToHistory: true,
    });
  };

  const setGrid = (enabled, size = gridSize) => {
    const api = apiRef.current;
    if (!api) return;
    const safeSize = Math.max(5, Math.min(100, Number(size) || 20));
    setGridSize(safeSize);
    setGridEnabled(enabled);
    api.updateScene({
      appState: {
        ...api.getAppState(),
        gridModeEnabled: enabled,
        gridSize: safeSize,
        gridStep: safeSize,
      },
      commitToHistory: false,
    });
  };

  const toggleGrid = () => setGrid(!gridEnabled, gridSize);

  const activateArrowTool = () => {
    const api = apiRef.current;
    if (!api) return;

    api.setActiveTool({ type: "arrow" });
    setConnectionMode(true);
  };

  const activateSelectionTool = () => {
    const api = apiRef.current;
    if (!api) return;

    api.setActiveTool({ type: "selection" });
    setConnectionMode(false);
  };


  const updateSelectedConnector = (patch) => {
    const api = apiRef.current;
    if (!api || !selectedConnector) return;

    const selected = api.getSceneElements().find((element) => element.id === selectedConnector.id);
    if (!selected || selected.type !== "arrow") return;

    const updated = { ...selected, ...patch, version: selected.version + 1 };
    api.updateScene({
      elements: api.getSceneElements().map((element) =>
        element.id === selected.id ? updated : element
      ),
      commitToHistory: true,
    });
    setSelectedConnector(updated);
  };

  const connectorPreset = (name) => {
    if (name === "straight") {
      updateSelectedConnector({ elbowed: false, startArrowhead: null, endArrowhead: "arrow" });
    }
    if (name === "elbow") {
      updateSelectedConnector({ elbowed: true, startArrowhead: null, endArrowhead: "arrow" });
    }
    if (name === "bidirectional") {
      updateSelectedConnector({ elbowed: false, startArrowhead: "arrow", endArrowhead: "arrow" });
    }
  };

  const applyToSelected = (patch) => {
    const api = apiRef.current;
    if (!api) return;

    const selected = getSelectedElements();
    if (!selected.length) return;

    const now = Date.now();
    const updatedIds = new Set(selected.map((element) => element.id));
    api.updateScene({
      elements: api.getSceneElements().map((element) => {
        if (!updatedIds.has(element.id)) return element;
        return {
          ...element,
          ...patch,
          version: element.version + 1,
          versionNonce: Math.floor(Math.random() * 2147483647),
          updated: now,
        };
      }),
      commitToHistory: true,
    });
  };

  const applyToSelectedArrow = (patch) => {
    const api = apiRef.current;
    if (!api) return;

    const selected = getSelectedElements().filter((element) => element.type === "arrow");
    if (!selected.length) return;

    const ids = new Set(selected.map((element) => element.id));
    const now = Date.now();
    api.updateScene({
      elements: api.getSceneElements().map((element) => {
        if (!ids.has(element.id)) return element;
        return {
          ...element,
          ...patch,
          version: element.version + 1,
          versionNonce: Math.floor(Math.random() * 2147483647),
          updated: now,
        };
      }),
      commitToHistory: true,
    });
  };

  const updateSingleSelected = (patch) => {
    if (selectedElements.length !== 1) return;
    applyToSelected(patch);
  };

  const firstSelected = selectedElements[0] || null;
  const hasTextSelection = selectedElements.some((element) => element.type === "text");
  const hasArrowSelection = selectedElements.some((element) => element.type === "arrow");
  const hasShapeSelection = selectedElements.some((element) =>
    ["rectangle", "diamond", "ellipse", "line", "arrow"].includes(element.type)
  );


  if (!sketchReady) {
    return (
      <div className={isDarkTheme ? "app theme-dark" : "app theme-light"}>
        <div className="sketch-restore-screen" aria-live="polite">
          <div className="sketch-restore-card">
            <div className="sketch-restore-mark">✦</div>
            <div className="sketch-restore-title">Sketchizi</div>
            <div className="sketch-restore-text">Restoring your sketch…</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`${isDarkTheme ? "app theme-dark" : "app theme-light"} ${getOpenPanel() ? `panel-open-${getOpenPanel()}` : ""}`} data-theme={isDarkTheme ? "dark" : "light"} data-open-panel={getOpenPanel() || "none"}>
      <button
        className={libraryOpen ? "library-toggle active" : "library-toggle"}
        onClick={() => {
          const nextOpen = !libraryOpen;
          closeNativeMenu();
          openExclusivePanel(nextOpen ? "library" : null);
          if (nextOpen) requestAnimationFrame(() => searchRef.current?.focus());
        }}
        type="button"
        aria-label={libraryOpen ? "Close icon library" : "Open icon library"}
        aria-expanded={libraryOpen}
      >
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v16H6.5A2.5 2.5 0 0 0 4 21.5V5.5Z" />
          <path d="M4 5.5v16" />
          <path d="M8 7h8" />
          <path d="M8 11h8" />
        </svg>
      </button>

      {libraryOpen && (
        <IconLibraryPanel
          searchRef={searchRef} search={search} setSearch={setSearch}
          activeCategory={activeCategory} setActiveCategory={setActiveCategory}
          favorites={favorites} recentIcons={recentIcons} eraserCatalog={eraserCatalog}
          eraserSyncing={eraserSyncing} eraserSyncProgress={eraserSyncProgress}
          eraserSyncError={eraserSyncError} syncEraserLibrary={syncEraserLibrary}
          connectionMode={connectionMode} activateArrowTool={activateArrowTool}
          activateSelectionTool={activateSelectionTool} remoteLoading={remoteLoading}
          visibleIcons={visibleIcons} iconDisplayLimit={iconDisplayLimit}
          setIconDisplayLimit={setIconDisplayLimit} iconListRef={iconListRef}
          draggingIcon={draggingIcon} handleIconClick={handleIconClick}
          handleIconPointerDown={handleIconPointerDown} handleDragStart={handleDragStart}
          isFavorite={isFavorite} toggleFavorite={toggleFavorite} remoteError={remoteError}
        />
      )}

      {selectedCount > 0 && propertiesOpen && (
        <PropertiesPanel
          selectedCount={selectedCount} propertiesOpen={propertiesOpen}
          setPropertiesOpen={setPropertiesOpen} firstSelected={firstSelected}
          hasShapeSelection={hasShapeSelection} hasArrowSelection={hasArrowSelection}
          hasTextSelection={hasTextSelection} applyToSelected={applyToSelected}
          applyToSelectedArrow={applyToSelectedArrow} updateSingleSelected={updateSingleSelected}
        />
      )}

      {propertiesAutoOpen && selectedCount > 0 && (
        <button
          type="button"
          className={propertiesOpen ? "properties-toggle active" : "properties-toggle"}
          onClick={() => {
            const nextOpen = !propertiesOpen;
            openExclusivePanel(nextOpen ? "properties" : null);
          }}
          title="Properties and style"
          aria-label="Properties and style"
          aria-expanded={propertiesOpen}
        >
          <span className="properties-toggle-icon">◧</span>
          <span>Properties</span>
        </button>
      )}

      <LayoutToolbar
        layoutOpen={layoutOpen}
        setLayoutOpen={(next) => {
          const resolved = typeof next === "function" ? next(layoutOpen) : next;
          openExclusivePanel(resolved ? "layout" : null);
        }}
        propertiesOpen={propertiesOpen} selectedCount={selectedCount}
        applyLayout={applyLayout} gridEnabled={gridEnabled} toggleGrid={toggleGrid}
        setGrid={setGrid} gridSize={gridSize}
      />


      {draggingIcon && (
        <div
          className="icon-drag-ghost"
          style={{ left: draggingIcon.x, top: draggingIcon.y }}
          aria-hidden="true"
        >
          <img src={draggingIcon.icon.src} alt="" draggable={false} />
          <span>{draggingIcon.icon.name}</span>
        </div>
      )}

      {storageError && (
        <div className={`storage-warning ${storageError.kind === "quota" ? "storage-warning-quota" : ""}`} role="alert" aria-live="assertive">
          <div className="storage-warning-icon">!</div>
          <div className="storage-warning-copy">
            <strong>{storageError.kind === "quota" ? "Browser storage is full" : "Local save is unavailable"}</strong>
            <span>{storageError.emergencySaved ? "Your latest changes are kept in an emergency browser backup, but IndexedDB is not saving normally." : "Your latest changes may not survive closing this tab. Download a backup before continuing."}</span>
          </div>
          <div className="storage-warning-actions">
            <button type="button" onClick={retryLocalSave}>Retry save</button>
            <button type="button" onClick={downloadRecoveryBackup}>Download backup</button>
          </div>
        </div>
      )}

      <main
        className="canvas"
        onDragOverCapture={handleDragOver}
        onDropCapture={handleDrop}
      >
        <div className="canvas-hint">
          Drag an icon from the library onto the canvas
        </div>

        <Excalidraw
          initialData={savedSketch ? {
            elements: savedSketch.elements || [],
            appState: savedSketch.appState ? {
              ...savedSketch.appState,
              zoom: { value: savedSketch.appState.zoom?.value ?? savedSketch.appState.zoom ?? 1 },
            } : {},
            files: savedSketch.files || {},
          } : undefined}
          excalidrawAPI={(api) => {
            apiRef.current = api;
          }}
          theme={isDarkTheme ? "dark" : "light"}
          onChange={(elements, appState) => {
            const selectedIds = Object.keys(appState.selectedElementIds || {});
            const elementById = selectedIds.length
              ? new Map(elements.map((element) => [element.id, element]))
              : null;
            const selected = selectedIds
              .map((id) => elementById?.get(id))
              .filter(Boolean);

            // Keep React work limited to meaningful selection changes. This is
            // important for large diagrams because Excalidraw can emit many
            // onChange events while an object is being dragged or resized.
            const signature = selected
              .map((element) => `${element.id}:${element.version}:${element.versionNonce}`)
              .sort()
              .join(",");

            if (signature !== lastSelectionSignature.current) {
              lastSelectionSignature.current = signature;
              setSelectedCount(selected.length);
              setSelectedElements(selected);
              setSelectedConnector(selected.length === 1 && selected[0]?.type === "arrow" ? selected[0] : null);
              if (propertiesAutoOpen) setPropertiesOpen(selected.length > 0);
            }

            updateMinimap(elements, appState);
            queueSketchSave(elements, appState);

            if (gridEnabled && appState.gridModeEnabled !== true) {
              apiRef.current?.updateScene({
                appState: {
                  ...appState,
                  gridModeEnabled: true,
                  gridSize,
                  gridStep: gridSize,
                },
                commitToHistory: false,
              });
            }
          }}
        />

        <Minimap
          minimapOpen={minimapOpen} minimapScene={minimapScene} apiRef={apiRef}
          minimapDragRef={minimapDragRef} centerOnMinimap={centerOnMinimap}
        />

        <button
          type="button"
          className={minimapOpen ? "minimap-toggle active" : "minimap-toggle"}
          onClick={() => setMinimapOpen((open) => !open)}
          aria-label={minimapOpen ? "Hide minimap" : "Show minimap"}
          title={minimapOpen ? "Hide minimap" : "Show minimap"}
        >
          {minimapOpen ? "▦" : "▧"}
        </button>

        <ShortcutHelp open={shortcutHelpOpen} onClose={() => setShortcutHelpOpen(false)} />
      </main>
    </div>
  );
}

export default App;
