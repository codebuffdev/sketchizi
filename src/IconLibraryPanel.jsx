import { useEffect, useMemo, useState } from "react";

const SEARCH_STORAGE_KEY = "sketchizi:icon-library-recent-searches:v1";

function sourceLabel(icon) {
  if (icon?.source === "aws" || icon?.catalog === "aws-architecture") return "AWS Architecture";
  if (icon?.source === "kubernetes" || icon?.category === "Kubernetes") return "Kubernetes";
  if (icon?.source === "networking" || icon?.category === "Networking") return "Networking";
  if (icon?.category === "Mind Maps") return "Mind Maps";
  if (icon?.category === "UML Diagrams") return "Architecture";
  return icon?.subtitle && icon.subtitle !== "Eraser" && icon.subtitle !== "Eraser Icons" ? icon.subtitle : "Essentials";
}

function iconTags(icon) {
  const candidates = [
    ...(Array.isArray(icon?.tags) ? icon.tags : []),
    ...(Array.isArray(icon?.searchAliases) ? icon.searchAliases.slice(0, 2) : []),
    icon?.category,
  ];
  const tags = [...new Set(candidates.filter((value) => typeof value === "string" && value.trim()).map((value) => value.trim()))];
  return (tags.length ? tags : ["icon"]).slice(0, 3).map((tag) => tag === "Eraser Icons" || tag === "Eraser" ? "Essentials" : tag);
}

function iconSearchText(icon) {
  return [icon?.name, icon?.id, icon?.subtitle, icon?.category, icon?.source, icon?.catalog,
    ...(Array.isArray(icon?.searchAliases) ? icon.searchAliases : []),
    ...(Array.isArray(icon?.tags) ? icon.tags : [])]
    .filter(Boolean).join(" ").toLowerCase();
}

function iconSelectionKey(icon) {
  return `${icon?.source || icon?.catalog || "local"}:${icon?.category || ""}:${icon?.id || icon?.name || ""}`;
}

function SourceCategoryIcon({ id }) {
  const common = { viewBox: "0 0 20 20", width: 18, height: 18, fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: "false" };
  switch (id) {
    case "all":
      return <svg {...common}><rect x="3" y="3" width="5" height="5" rx="1" /><rect x="12" y="3" width="5" height="5" rx="1" /><rect x="3" y="12" width="5" height="5" rx="1" /><rect x="12" y="12" width="5" height="5" rx="1" /></svg>;
    case "eraser":
      return <svg {...common}><path d="m10 2 2.1 5.1L17 9l-4.9 1.9L10 16l-2.1-5.1L3 9l4.9-1.9L10 2Z" /><path d="m16.5 12.5.9 2.1 2.1.9-2.1.9-.9 2.1-.9-2.1-2.1-.9 2.1-.9.9-2.1Z" /></svg>;
    case "aws":
      return <img className="library-source-brand-icon library-source-brand-icon-aws" src="/icons/aws.svg" alt="" aria-hidden="true" />;
    case "kubernetes":
      return <img className="library-source-brand-icon library-source-brand-icon-kubernetes" src="/icons/k8s-kubernetes.svg" alt="" aria-hidden="true" />;
    case "networking":
      return <img className="library-source-brand-icon library-source-brand-icon-networking" src="/icons/net-internet.svg" alt="" aria-hidden="true" />;
    case "uml":
      return <svg {...common}><path d="m10 2.5 7.5 7.5-7.5 7.5L2.5 10 10 2.5Z" /><path d="M7 8h6v4H7zM8.5 6v2M11.5 6v2M8.5 12v2M11.5 12v2" /></svg>;
    case "mindmaps":
      return <svg {...common}><circle cx="10" cy="10" r="2.3" /><circle cx="4" cy="4" r="1.7" /><circle cx="16" cy="4" r="1.7" /><circle cx="4" cy="16" r="1.7" /><circle cx="16" cy="16" r="1.7" /><path d="m8.4 8.4-3-3M11.6 8.4l3-3M8.4 11.6l-3 3M11.6 11.6l3 3" /></svg>;
    default:
      return null;
  }
}

export default function IconLibraryPanel({
  searchRef, search, setSearch, activeCategory, setActiveCategory, activeAwsCategory, setActiveAwsCategory, activeKubernetesCategory, setActiveKubernetesCategory, favorites, recentIcons,
  eraserCatalog, eraserSyncing, eraserSyncProgress, eraserSyncError, syncEraserLibrary, eraserCachedCount,
  remoteLoading, visibleIcons, umlIcons, mindMapIcons, createStarterMindMap, awsIcons, awsCategories, awsCategoryCounts, awsCategoryRepresentatives, awsCatalogLogo, awsCatalogLogoDark, kubernetesIcons, kubernetesCategories, kubernetesCategoryCounts, kubernetesCategoryRepresentatives, networkingIcons,
  iconDisplayLimit, setIconDisplayLimit, iconListRef, draggingIcon, handleIconClick,
  handleIconPointerDown, handleIconMouseDown, handleDragStart, isFavorite, toggleFavorite, remoteError,
  onClose,
}) {
  const [activeSource, setActiveSource] = useState("all");
  const [viewMode, setViewMode] = useState("cards");
  const [cardLayout, setCardLayout] = useState("two-column");
  const [selectedIconId, setSelectedIconId] = useState(null);
  const [recentSearches, setRecentSearches] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(SEARCH_STORAGE_KEY) || "[]");
      return Array.isArray(stored) ? stored.filter((item) => typeof item === "string").slice(0, 5) : [];
    } catch { return []; }
  });

  const allIcons = useMemo(() => {
    const sources = [eraserCatalog, awsIcons, kubernetesIcons, mindMapIcons, umlIcons, networkingIcons];
    const seen = new Set();
    const mixed = [];
    const longest = Math.max(0, ...sources.map((source) => source.length));
    for (let index = 0; index < longest; index += 1) {
      for (const source of sources) {
        const icon = source[index];
        if (!icon?.src) continue;
        const key = `${icon?.source || icon?.category || "local"}:${icon?.id || icon?.name}`;
        if (seen.has(key)) continue;
        seen.add(key);
        mixed.push(icon);
      }
    }
    return mixed;
  }, [eraserCatalog, awsIcons, kubernetesIcons, mindMapIcons, umlIcons, networkingIcons]);

  useEffect(() => {
    try { localStorage.setItem(SEARCH_STORAGE_KEY, JSON.stringify(recentSearches)); } catch {}
  }, [recentSearches]);

  useEffect(() => {
    const handleShortcut = (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onClose?.();
        return;
      }
      if (event.key !== "/" || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target;
      const isTyping = target instanceof HTMLElement && (target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(target.tagName));
      if (!isTyping) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleShortcut, true);
    return () => window.removeEventListener("keydown", handleShortcut, true);
  }, [searchRef, onClose]);

  const rememberSearch = (value = search) => {
    const normalized = value.trim();
    if (!normalized) return;
    setRecentSearches((current) => [normalized, ...current.filter((item) => item.toLowerCase() !== normalized.toLowerCase())].slice(0, 5));
  };

  const chooseSource = (source) => {
    setActiveSource(source);
    setIconDisplayLimit(120);
    if (source !== "kubernetes") setActiveKubernetesCategory("All");
    if (source !== "aws") setActiveAwsCategory("All");
    if (source === "all" || source === "eraser") {
      setActiveCategory("Eraser Icons");
      if (source === "all") { setActiveAwsCategory("All"); setActiveKubernetesCategory("All"); }
    } else if (source === "aws") {
      setActiveCategory("AWS Architecture");
      setActiveAwsCategory("All");
      setActiveKubernetesCategory("All");
    } else if (source === "kubernetes") {
      setActiveCategory("Kubernetes");
      setActiveKubernetesCategory("All");
      setActiveAwsCategory("All");
    } else if (source === "networking") {
      setActiveCategory("Networking");
      setActiveKubernetesCategory("All");
      setActiveAwsCategory("All");
    } else if (source === "uml") {
      setActiveCategory("UML Diagrams");
      setActiveKubernetesCategory("All");
      setActiveAwsCategory("All");
    } else if (source === "mindmaps") {
      setActiveCategory("Mind Maps");
      setActiveKubernetesCategory("All");
      setActiveAwsCategory("All");
    }
  };


  const displayedIcons = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (activeSource === "all") {
      return allIcons.filter((icon) => !query || iconSearchText(icon).includes(query));
    }
    if (activeSource === "eraser") {
      return eraserCatalog.filter((icon) => !query || iconSearchText(icon).includes(query));
    }
    if (["aws", "kubernetes", "networking", "uml", "mindmaps"].includes(activeSource)) return visibleIcons;
    return visibleIcons;
  }, [activeSource, activeCategory, allIcons, eraserCatalog, favorites, recentIcons, search, visibleIcons]);

  const shownIcons = displayedIcons.slice(0, iconDisplayLimit);
  const effectiveViewMode = search.trim() ? "list" : viewMode;
  // Keep the selected asset available while the user browses other sources or searches.
  // Resolve from the full catalog first so changing filters does not hide the add action.
  const selectedIcon = allIcons.find((icon) => iconSelectionKey(icon) === selectedIconId)
    || favorites.find((icon) => iconSelectionKey(icon) === selectedIconId)
    || recentIcons.find((icon) => iconSelectionKey(icon) === selectedIconId)
    || displayedIcons.find((icon) => iconSelectionKey(icon) === selectedIconId)
    || null;
  const activeChip = activeSource;
  const sourceTabs = [
    { id: "all", label: "All" },
    { id: "eraser", label: "Essentials" },
    { id: "aws", label: "AWS" },
    { id: "kubernetes", label: "Kubernetes" },
    { id: "networking", label: "Networking" },
    { id: "uml", label: "UML" },
    { id: "mindmaps", label: "Mind Maps" },
  ];

  const getIconSubtitle = (icon) => sourceLabel(icon);

  return (
    <aside className="library-panel library-panel-redesign" aria-label="Icon Library" role="dialog" aria-modal="false">
      <div className="library-scroll-hint"><span className="library-escape-hint"><kbd>Esc</kbd> to close</span></div>
      <div className="library-panel-body library-panel-redesign-body">
        <div className="search-wrap library-search-wrap">
          <svg className="library-search-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 4.5 4.5"/></svg>
          <input ref={searchRef} className="search" value={search} onChange={(event) => { setSearch(event.target.value); setIconDisplayLimit(120); }} onKeyDown={(event) => { if (event.key === "Enter") rememberSearch(); if (event.key === "Escape") { if (search) { setSearch(""); setIconDisplayLimit(120); } } }} onBlur={() => rememberSearch()} placeholder="Search icons, tags, or categories..." aria-label="Search icons, tags, or categories" />
          {search && <button type="button" className="library-search-clear" onClick={() => { setSearch(""); setIconDisplayLimit(120); searchRef.current?.focus(); }} aria-label="Clear icon search" title="Clear search">×</button>}
          <kbd>/</kbd>
        </div>

        <div className="library-filter-row">
          <nav className="library-source-tabs" aria-label="Icon collections">
            {sourceTabs.map((tab) => <button key={tab.id} type="button" className={`library-source-chip library-source-chip-${tab.id}${activeChip === tab.id ? " active" : ""}`} aria-label={tab.label} title={tab.label} aria-pressed={activeChip === tab.id} onClick={() => chooseSource(tab.id)}><SourceCategoryIcon id={tab.id} /><span className="library-source-chip-label">{tab.label}</span></button>)}</nav>
        </div>
        {recentSearches.length > 0 && !search.trim() && <section className="library-recent-searches" aria-label="Recent searches">
          <div className="library-recent-heading"><span>Recent searches</span><button type="button" onClick={() => setRecentSearches([])}>Clear all</button></div>
          <div className="library-recent-chips">{recentSearches.map((term) => <button type="button" key={term} className="library-recent-chip" onClick={() => { setActiveSource("all"); setActiveCategory("Eraser Icons"); setSearch(term); setIconDisplayLimit(120); }}><span aria-hidden="true">◷</span>{term}</button>)}</div>
        </section>}

        {activeSource === "eraser" && !search.trim() && eraserSyncError && <div className="library-inline-status" role="status">{eraserSyncError}</div>}


        <section className="icons library-results" aria-label="Icon results">
          {remoteLoading && activeSource === "eraser" && displayedIcons.length === 0 ? <div className="empty">Loading icons…</div> : shownIcons.length > 0 ? <div ref={iconListRef} className={`icon-grid library-icon-grid ${effectiveViewMode === "list" ? "is-list-view" : ""} ${cardLayout === "compact" ? "is-compact-layout" : ""}`} onScroll={(event) => {
            const el = event.currentTarget;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 240) setIconDisplayLimit((limit) => Math.min(limit + 120, displayedIcons.length));
          }}>
            {shownIcons.map((icon) => {
              const favorite = isFavorite(icon);
              return <div key={`${icon.category || icon.source}-${icon.id}`} role="button" tabIndex={0} className={`icon-card library-icon-card ${draggingIcon?.icon?.id === icon.id ? "is-drag-source" : ""} ${selectedIconId === iconSelectionKey(icon) ? "is-selected" : ""} ${favorite ? "has-favorite" : ""}`} aria-pressed={selectedIconId === iconSelectionKey(icon)} onClick={() => { setSelectedIconId(iconSelectionKey(icon)); handleIconClick(icon); }} onKeyDown={(event) => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setSelectedIconId(iconSelectionKey(icon)); handleIconClick(icon); } }} onPointerDown={(event) => handleIconPointerDown(event, icon)} onMouseDown={(event) => handleIconMouseDown(event, icon)} onDragStart={(event) => handleDragStart(event, icon)} title={`Add ${icon.name} to the canvas; drag to position precisely`} aria-label={`Add ${icon.name} to the canvas; drag to position precisely`}>
                <span className="icon-preview library-icon-preview"><img src={icon.src} alt="" draggable={false} /></span>
                <span className="library-icon-card-content"><span className="icon-name">{icon.name}</span><span className="icon-subtitle">{getIconSubtitle(icon)}</span></span>
                <span className="library-icon-card-actions">
                  <span className={favorite ? "favorite-button active" : "favorite-button"} role="button" tabIndex={0} title={favorite ? "Remove from favorites" : "Add to favorites"} aria-label={favorite ? "Remove from favorites" : "Add to favorites"} onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.preventDefault(); event.stopPropagation(); toggleFavorite(icon); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); toggleFavorite(icon); } }}>{favorite ? "★" : "☆"}</span>
                  <span className="library-add-icon" role="button" tabIndex={0} title={`Add ${icon.name} to the canvas center`} aria-label={`Add ${icon.name} to the canvas center`} onPointerDown={(event) => event.stopPropagation()} onMouseDown={(event) => event.stopPropagation()} onClick={(event) => { event.preventDefault(); event.stopPropagation(); handleIconClick(icon); }} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); handleIconClick(icon); } }}>+</span>
                </span>
              </div>;
            })}
          </div> : <div className="empty library-empty">{activeCategory === "Favorites" ? "No favorite icons yet. Click ☆ on an icon to save it." : activeCategory === "Recently Used" ? "No recently used icons yet." : remoteError || "No matching icons."}</div>}
        </section>
      </div>
    </aside>
  );
}
