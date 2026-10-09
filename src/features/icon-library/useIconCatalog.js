import { useEffect, useMemo, useRef, useState } from "react";
import { fetchEraserCatalog, cacheEraserIcons, registerEraserServiceWorker, loadStoredEraserCatalog, storeEraserCatalog, getCachedIconCount } from "../../eraserLibrary";
import { umlIcons } from "../../umlLibrary";
import { mindMapIcons } from "../../mindMapLibrary";
import { logger } from "../../logging/logger";
import { awsIcons } from "../../awsArchitectureLibrary";
import { kubernetesIcons } from "../../kubernetesArchitectureLibrary";
import { networkingResourceDefinitions } from "../../networkingResourceDefinitions.js";
import { networkingIconSvg } from "../networking/networkingIconArtwork.js";

export function useIconCatalog() {
  const [activeCategory, setActiveCategory] = useState("Eraser Icons");
  const [activeAwsCategory, setActiveAwsCategory] = useState("All");
  const [activeKubernetesCategory, setActiveKubernetesCategory] = useState("All");
  const networkingIcons = useMemo(() => networkingResourceDefinitions.map((definition) => ({ id: definition.iconId, name: definition.displayName, subtitle: "Networking resource · editable metadata", category: "Networking", source: "networking", src: `data:image/svg+xml,${encodeURIComponent(networkingIconSvg(definition.resourceType))}` })), []);
  const [search, setSearch] = useState("");
  const [remoteIcons, setRemoteIcons] = useState([]);
  const [eraserCatalog, setEraserCatalog] = useState([]);
  const [eraserSyncing, setEraserSyncing] = useState(false);
  const [eraserSyncProgress, setEraserSyncProgress] = useState({ done: 0, total: 0 });
  const [eraserSyncError, setEraserSyncError] = useState("");
  const [eraserCachedCount, setEraserCachedCount] = useState(0);
  const [remoteLoading, setRemoteLoading] = useState(false);
  const [remoteError, setRemoteError] = useState("");
  const [favorites, setFavorites] = useState(() => {
    try { const saved = JSON.parse(localStorage.getItem("diagram-app-favorites") || "[]"); return Array.isArray(saved) ? saved : []; }
    catch { return []; }
  });
  const [recentIcons, setRecentIcons] = useState(() => {
    try { const saved = JSON.parse(localStorage.getItem("diagram-app-recent-icons") || "[]"); return Array.isArray(saved) ? saved : []; }
    catch { return []; }
  });
  const searchRef = useRef(null);
  const iconListRef = useRef(null);
  const [iconDisplayLimit, setIconDisplayLimit] = useState(120);

  useEffect(() => {
    try { localStorage.setItem("diagram-app-favorites", JSON.stringify(favorites)); } catch {}
  }, [favorites]);
  useEffect(() => {
    try { localStorage.setItem("diagram-app-recent-icons", JSON.stringify(recentIcons)); } catch {}
  }, [recentIcons]);

  useEffect(() => {
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/service-worker.js").catch((error) => {
      logger.warn("Service worker registration failed", { category: "ui", operation: "service-worker", errorMessage: error?.message });
    });
    registerEraserServiceWorker();
    const stored = loadStoredEraserCatalog();
    if (stored.length) {
      setEraserCatalog(stored); setRemoteIcons(stored); setRemoteLoading(false);
      getCachedIconCount(stored).then(setEraserCachedCount).catch(() => {});
    }
    let cancelled = false;
    if (!stored.length) setRemoteLoading(true);
    const controller = new AbortController();
    fetchEraserCatalog(controller.signal).then((icons) => {
      if (cancelled) return;
      setEraserCatalog(icons); setRemoteIcons(icons); storeEraserCatalog(icons);
      setRemoteLoading(false); setRemoteError("");
      getCachedIconCount(icons).then(setEraserCachedCount).catch(() => {});
    }).catch((error) => {
      if (cancelled) return;
      setRemoteLoading(false);
      if (error.name !== "AbortError") logger.warn("Eraser catalog load failed", { category: "api", operation: "eraser-catalog", errorMessage: error?.message });
      if (error.name !== "AbortError" && !stored.length) setRemoteError(error.message || "Unable to load Eraser icons.");
    });
    return () => { cancelled = true; controller.abort(); };
  }, []);

  useEffect(() => {
    const query = search.trim().toLowerCase();
    let base;
    if (activeCategory === "UML Diagrams") {
      base = umlIcons;
    } else if (activeCategory === "Mind Maps") {
      base = mindMapIcons;
    } else if (activeCategory === "AWS Architecture") {
      base = activeAwsCategory === "All"
        ? awsIcons
        : awsIcons.filter((icon) => icon.category === activeAwsCategory);
    } else if (activeCategory === "Kubernetes") {
      base = activeKubernetesCategory === "All"
        ? kubernetesIcons
        : kubernetesIcons.filter((icon) => icon.category === activeKubernetesCategory);
    } else if (activeCategory === "Networking") {
      base = networkingIcons;
    } else {
      base = eraserCatalog;
    }

    if (!query) {
      setRemoteIcons(base);
      return;
    }

    setRemoteIcons(base.filter((icon) => {
      const haystack = [
        icon.name,
        icon.id,
        icon.subtitle,
        ...(Array.isArray(icon.searchAliases) ? icon.searchAliases : []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    }));
  }, [eraserCatalog, search, activeCategory, activeAwsCategory, activeKubernetesCategory, networkingIcons]);

  const syncEraserLibrary = async () => {
    if (!eraserCatalog.length || eraserSyncing) return;
    setEraserSyncing(true); setEraserSyncError(""); setEraserSyncProgress({ done: 0, total: eraserCatalog.length });
    try {
      await cacheEraserIcons(eraserCatalog, (done, total) => setEraserSyncProgress({ done, total }));
      setEraserCachedCount(await getCachedIconCount(eraserCatalog));
    } catch (error) {
      if (error?.name !== "AbortError") {
        logger.error("Eraser icon synchronization failed", error, { category: "api", operation: "eraser-icon-sync" });
        setEraserSyncError(error.message || "Icon sync failed.");
      }
    } finally { setEraserSyncing(false); }
  };

  const visibleIcons = useMemo(() => {
    if (!search.trim() && activeCategory === "Favorites") return favorites;
    if (!search.trim() && activeCategory === "Recently Used") return recentIcons;
    return remoteIcons;
  }, [activeCategory, remoteIcons, search, favorites, recentIcons]);

  useEffect(() => { setIconDisplayLimit(120); }, [search, activeCategory]);

  const iconKey = (icon) => `${icon.source || "local"}:${icon.id}`;
  const isFavorite = (icon) => favorites.some((item) => iconKey(item) === iconKey(icon));
  const toggleFavorite = (icon) => setFavorites((current) => {
    const key = iconKey(icon);
    return current.some((item) => iconKey(item) === key) ? current.filter((item) => iconKey(item) !== key) : [icon, ...current];
  });
  const markRecentlyUsed = (icon) => setRecentIcons((current) => {
    const key = iconKey(icon);
    return [icon, ...current.filter((item) => iconKey(item) !== key)].slice(0, 18);
  });

  return {
    activeCategory, setActiveCategory, activeAwsCategory, setActiveAwsCategory, activeKubernetesCategory, setActiveKubernetesCategory, search, setSearch, remoteIcons, eraserCatalog, networkingIcons,
    eraserSyncing, eraserSyncProgress, eraserSyncError, eraserCachedCount, remoteLoading, remoteError,
    favorites, recentIcons, searchRef, iconListRef, iconDisplayLimit, setIconDisplayLimit,
    visibleIcons, syncEraserLibrary, isFavorite, toggleFavorite, markRecentlyUsed,
  };
}
