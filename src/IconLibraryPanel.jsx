import { useEffect, useMemo, useState } from "react";
import {
  SEARCH_STORAGE_KEY,
  VIEW_MODE_STORAGE_KEY,
  getActiveCollectionTitle,
  getHighlightSegments,
  getSubcategoryOptions,
  iconSelectionKey,
  loadStoredViewMode,
  mixAllIcons,
  resolveDisplayedIcons,
  sourceLabel,
} from "./features/icon-library/iconPanelUtils";

function SourceCategoryIcon({ id }) {
  const common = {
    viewBox: "0 0 24 24",
    width: 14,
    height: 14,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.85,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": true,
    focusable: "false",
  };
  switch (id) {
    case "aws":
      return (
        <img
          className="sk-source-brand-icon sk-source-brand-icon-aws"
          src="/icons/aws.svg"
          alt=""
          aria-hidden="true"
        />
      );
    case "networking":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="2.8" fill="currentColor" />
          <circle cx="5" cy="5" r="2" />
          <circle cx="19" cy="5" r="2" />
          <circle cx="5" cy="19" r="2" />
          <circle cx="19" cy="19" r="2" />
          <path d="m9.8 9.8-3.2-3.2m7.6 3.2 3.2-3.2m-7.6 7.6-3.2 3.2m7.6-3.2 3.2 3.2" />
        </svg>
      );
    case "kubernetes":
      return (
        <img
          className="sk-source-brand-icon sk-source-brand-icon-k8s"
          src="/icons/k8s-kubernetes.svg"
          alt=""
          aria-hidden="true"
        />
      );
    case "mindmaps":
      return (
        <svg {...common}>
          <rect x="8.5" y="9" width="7" height="6" rx="1.6" />
          <circle cx="4" cy="5" r="1.6" />
          <circle cx="20" cy="5" r="1.6" />
          <circle cx="4" cy="19" r="1.6" />
          <circle cx="20" cy="19" r="1.6" />
          <path d="m5.3 6.1 3.4 3.2m9.9-3.2-3.3 3.2M5.3 17.9l3.4-3.2m9.9 3.2-3.3-3.2" />
        </svg>
      );
    case "uml":
      return (
        <svg {...common}>
          <rect x="8" y="3" width="8" height="5" rx="1" />
          <path d="M12 8v4M5 12h14M5 12v2M12 12v2M19 12v2" />
          <rect x="2.5" y="14" width="5.5" height="6.5" rx="1" />
          <rect x="9.25" y="14" width="5.5" height="6.5" rx="1" />
          <rect x="16" y="14" width="5.5" height="6.5" rx="1" />
        </svg>
      );
    case "eraser":
      return (
        <svg {...common}>
          <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
          <circle cx="17" cy="7" r="3.5" />
          <path d="M7 14.5 10.5 20.5h-7Z" />
          <rect x="13.5" y="14" width="7" height="6.5" rx="1.5" />
        </svg>
      );
    default:
      return null;
  }
}

function renderHighlightedText(text, query) {
  const segments = getHighlightSegments(text, query);
  if (segments.length === 1 && !segments[0].match) return segments[0].text;
  return segments.map((segment, index) =>
    segment.match ? (
      <mark key={index} className="library-search-highlight">
        {segment.text}
      </mark>
    ) : (
      <span key={index}>{segment.text}</span>
    ),
  );
}

export default function IconLibraryPanel({
  searchRef,
  search,
  setSearch,
  activeCategory,
  setActiveCategory,
  activeAwsCategory,
  setActiveAwsCategory,
  activeKubernetesCategory,
  setActiveKubernetesCategory,
  favorites,
  recentIcons,
  eraserCatalog,
  eraserSyncError,
  remoteLoading,
  visibleIcons,
  umlIcons,
  mindMapIcons,
  createStarterMindMap,
  awsIcons,
  awsCategories,
  awsCategoryCounts,
  kubernetesIcons,
  kubernetesCategories,
  kubernetesCategoryCounts,
  networkingIcons,
  iconDisplayLimit,
  setIconDisplayLimit,
  iconListRef,
  draggingIcon,
  handleIconClick,
  handleIconPointerDown,
  handleIconMouseDown,
  handleDragStart,
  isFavorite,
  toggleFavorite,
  remoteError,
  onClose,
}) {
  const [activeSource, setActiveSource] = useState("all");
  const [viewMode, setViewMode] = useState(loadStoredViewMode);
  const [selectedIconId, setSelectedIconId] = useState(null);
  const [recentSearches, setRecentSearches] = useState(() => {
    try {
      const stored = JSON.parse(localStorage.getItem(SEARCH_STORAGE_KEY) || "[]");
      return Array.isArray(stored) ? stored.filter((item) => typeof item === "string").slice(0, 4) : [];
    } catch {
      return [];
    }
  });

  const allIcons = useMemo(
    () => mixAllIcons([eraserCatalog, awsIcons, kubernetesIcons, mindMapIcons, umlIcons, networkingIcons]),
    [eraserCatalog, awsIcons, kubernetesIcons, mindMapIcons, umlIcons, networkingIcons],
  );

  useEffect(() => {
    try {
      localStorage.setItem(SEARCH_STORAGE_KEY, JSON.stringify(recentSearches));
    } catch {}
  }, [recentSearches]);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_MODE_STORAGE_KEY, viewMode);
    } catch {}
  }, [viewMode]);

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
      const isTyping =
        target instanceof HTMLElement &&
        (target.isContentEditable || /INPUT|TEXTAREA|SELECT/.test(target.tagName));
      if (!isTyping) {
        event.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", handleShortcut, true);
    return () => window.removeEventListener("keydown", handleShortcut, true);
  }, [searchRef, onClose]);

  const chooseSource = (source) => {
    setActiveSource(source);
    setIconDisplayLimit(120);
    if (source !== "kubernetes") setActiveKubernetesCategory("All");
    if (source !== "aws") setActiveAwsCategory("All");
    if (source === "all" || source === "eraser") {
      setActiveCategory("Eraser Icons");
      if (source === "all") {
        setActiveAwsCategory("All");
        setActiveKubernetesCategory("All");
      }
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
    } else if (source === "favorites") {
      setActiveCategory("Favorites");
      setActiveKubernetesCategory("All");
      setActiveAwsCategory("All");
    } else if (source === "recent") {
      setActiveCategory("Recently Used");
      setActiveKubernetesCategory("All");
      setActiveAwsCategory("All");
    }
  };

  const rememberSearch = (value = search) => {
    const normalized = value.trim();
    if (!normalized) return;
    setRecentSearches((current) =>
      [normalized, ...current.filter((item) => item.toLowerCase() !== normalized.toLowerCase())].slice(0, 4),
    );
  };

  const displayedIcons = useMemo(() => {
    const query = search.trim();
    if (activeSource === "all" || activeSource === "eraser" || activeSource === "favorites" || activeSource === "recent") {
      return resolveDisplayedIcons({
        activeSource,
        search: query,
        allIcons,
        eraserCatalog,
        visibleIcons,
        favorites,
        recentIcons,
      });
    }
    if (["aws", "kubernetes", "networking", "uml", "mindmaps"].includes(activeSource)) {
      return resolveDisplayedIcons({
        activeSource,
        search: query,
        allIcons,
        eraserCatalog,
        visibleIcons,
        favorites,
        recentIcons,
        awsIcons,
        activeAwsCategory,
        kubernetesIcons,
        activeKubernetesCategory,
        networkingIcons,
        umlIcons,
        mindMapIcons,
      });
    }
    return resolveDisplayedIcons({
      activeSource,
      search: query,
      allIcons,
      eraserCatalog,
      visibleIcons,
      favorites,
      recentIcons,
    });
  }, [
    activeSource,
    search,
    allIcons,
    eraserCatalog,
    visibleIcons,
    favorites,
    recentIcons,
    awsIcons,
    activeAwsCategory,
    kubernetesIcons,
    activeKubernetesCategory,
    networkingIcons,
    umlIcons,
    mindMapIcons,
  ]);

  const shownIcons = displayedIcons.slice(0, iconDisplayLimit);

  const sourceTabs = [
    { id: "aws", label: "AWS" },
    { id: "networking", label: "Networking" },
    { id: "kubernetes", label: "Kubernetes" },
    { id: "mindmaps", label: "Mind Maps" },
    { id: "uml", label: "UML" },
    { id: "eraser", label: "Essentials" },
    { id: "all", label: "All" },
  ];

  const collectionTitle = getActiveCollectionTitle(activeSource);
  return (
    <aside className="library-panel library-panel-redesign sk-icon-panel" aria-label="Icon Library" role="dialog" aria-modal="false">
      <header className="sk-icon-panel-header">
        <div className="sk-icon-panel-heading">
          <h2 className="sk-icon-panel-title">Icon Library</h2>
          <span className="sk-icon-panel-count" aria-label={`${allIcons.length.toLocaleString()} available icons`}>({allIcons.length.toLocaleString()})</span>
        </div>

        <div className="sk-icon-panel-header-controls">
          <div className="sk-view-toggle" role="group" aria-label="Icon view mode">
            <button
              type="button"
              className={`sk-view-toggle-btn ${viewMode === "grid" ? "is-active" : ""}`}
              onClick={() => setViewMode("grid")}
              aria-label="Grid view"
              aria-pressed={viewMode === "grid"}
              title="Grid view"
            >
              <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
                <rect x="2" y="2" width="4.8" height="4.8" rx="1" />
                <rect x="9.2" y="2" width="4.8" height="4.8" rx="1" />
                <rect x="2" y="9.2" width="4.8" height="4.8" rx="1" />
                <rect x="9.2" y="9.2" width="4.8" height="4.8" rx="1" />
              </svg>
            </button>
            <button
              type="button"
              className={`sk-view-toggle-btn ${viewMode === "list" ? "is-active" : ""}`}
              onClick={() => setViewMode("list")}
              aria-label="List view"
              aria-pressed={viewMode === "list"}
              title="List view"
            >
              <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" aria-hidden="true">
                <path d="M2.5 4h11M2.5 8h11M2.5 12h11" />
              </svg>
            </button>
          </div>

          <button
            type="button"
            className="sk-icon-panel-close"
            onClick={() => onClose?.()}
            aria-label="Close icon library"
            title="Close (Esc)"
          >
            <svg viewBox="0 0 16 16" width="13" height="13" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
              <path d="M3.5 3.5 12.5 12.5M12.5 3.5 3.5 12.5" />
            </svg>
          </button>
        </div>
      </header>

      <div className="library-panel-body library-panel-redesign-body sk-icon-panel-body">
        <div className="search-wrap library-search-wrap sk-search-wrap">
          <svg className="library-search-icon sk-search-icon" viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="10.8" cy="10.8" r="6.8" />
            <path d="m16 16 4.5 4.5" />
          </svg>
          <input
            ref={searchRef}
            className="search sk-search-input"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setIconDisplayLimit(120);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") rememberSearch();
              if (event.key === "Escape" && search) {
                event.preventDefault();
                event.stopPropagation();
                setSearch("");
                setIconDisplayLimit(120);
              }
            }}
            onBlur={() => rememberSearch()}
            placeholder="Search icons..."
            aria-label="Search icons, tags, or categories"
          />
          {search ? (
            <button
              type="button"
              className="library-search-clear sk-search-clear"
              onClick={() => {
                setSearch("");
                setIconDisplayLimit(120);
                searchRef.current?.focus();
              }}
              aria-label="Clear icon search"
              title="Clear search"
            >
              ×
            </button>
          ) : (
            <kbd className="sk-search-kbd" aria-hidden="true">/</kbd>
          )}
        </div>

        <nav className="sk-scope-tabs" aria-label="Icon quick filters">
          <button
            type="button"
            className={`sk-scope-tab ${activeSource === "all" ? "is-active" : ""}`}
            aria-pressed={activeSource === "all"}
            onClick={() => chooseSource("all")}
          >
            All icons
          </button>
          <button
            type="button"
            className={`sk-scope-tab ${activeSource === "favorites" ? "is-active" : ""}`}
            aria-pressed={activeSource === "favorites"}
            onClick={() => chooseSource("favorites")}
          >
            Saved{favorites.length > 0 ? ` (${favorites.length})` : ""}
          </button>
          <button
            type="button"
            className={`sk-scope-tab ${activeSource === "recent" ? "is-active" : ""}`}
            aria-pressed={activeSource === "recent"}
            onClick={() => chooseSource("recent")}
          >
            Recent{recentIcons.length > 0 ? ` (${recentIcons.length})` : ""}
          </button>
        </nav>

        <div className="sk-unified-category-bar">
          <label className="sk-unified-category-label" htmlFor="sk-icon-category">Category</label>
          <select
            id="sk-icon-category"
            className="sk-unified-category-select"
            aria-label="Icon category"
            value={activeSource === "aws" && activeAwsCategory !== "All"
              ? `aws:${activeAwsCategory}`
              : activeSource === "kubernetes" && activeKubernetesCategory !== "All"
                ? `kubernetes:${activeKubernetesCategory}`
                : activeSource}
            onChange={(event) => {
              const value = event.target.value;
              const separator = value.indexOf(":");
              if (separator < 0) {
                chooseSource(value);
                return;
              }
              const source = value.slice(0, separator);
              const category = value.slice(separator + 1);
              chooseSource(source);
              if (source === "aws") setActiveAwsCategory(category);
              if (source === "kubernetes") setActiveKubernetesCategory(category);
            }}
          >
            <option value="all">All icons ({allIcons.length.toLocaleString()})</option>
            <optgroup label="Collections">
              {sourceTabs.filter((tab) => tab.id !== "all").map((tab) => (
                <option key={tab.id} value={tab.id}>{tab.label}</option>
              ))}
            </optgroup>
            {["aws", "kubernetes"].map((source) => {
              const options = getSubcategoryOptions({
                activeSource: source,
                awsCategories, awsCategoryCounts,
                kubernetesCategories, kubernetesCategoryCounts,
              });
              return (
                <optgroup key={source} label={source === "aws" ? "AWS categories" : "Kubernetes categories"}>
                  {options.map((option) => (
                    <option key={`${source}:${option.value}`} value={`${source}:${option.value}`}>
                      {option.label} ({option.count})
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        </div>

        {activeSource === "mindmaps" && createStarterMindMap && !search.trim() && (
          <div className="sk-quick-starter-bar">
            <button
              type="button"
              className="sk-quick-starter-btn"
              onClick={() => createStarterMindMap()}
            >
              <SourceCategoryIcon id="mindmaps" />
              <span>Insert starter mind map</span>
            </button>
          </div>
        )}

        {recentSearches.length > 0 && !search.trim() && (
          <section className="library-recent-searches sk-recent-searches" aria-label="Recent searches">
            <div className="library-recent-chips sk-recent-chips">
              {recentSearches.map((term) => (
                <button
                  type="button"
                  key={term}
                  className="library-recent-chip sk-recent-chip"
                  onClick={() => {
                    setActiveSource("all");
                    setActiveCategory("Eraser Icons");
                    setSearch(term);
                    setIconDisplayLimit(120);
                  }}
                >
                  {term}
                </button>
              ))}
            </div>
            <button
              type="button"
              className="sk-recent-clear"
              onClick={() => setRecentSearches([])}
              aria-label="Clear recent searches"
            >
              Clear
            </button>
          </section>
        )}

        {activeSource === "eraser" && !search.trim() && eraserSyncError && (
          <div className="library-inline-status sk-inline-status" role="status">
            {eraserSyncError}
          </div>
        )}

        <div className="sk-icon-compact-results-meta" role="status" aria-live="polite">
          {displayedIcons.length.toLocaleString()} {search.trim() ? "results" : "icons"}{activeSource !== "all" ? ` · ${collectionTitle}` : ""}
        </div>
        <section className="icons library-results sk-icon-results" aria-label="Icon results">
          {remoteLoading && activeSource === "eraser" && displayedIcons.length === 0 ? (
            <div className="empty sk-icon-empty">Loading icons…</div>
          ) : shownIcons.length > 0 ? (
            <div
              ref={iconListRef}
              className={`icon-grid library-icon-grid sk-icon-grid ${viewMode === "list" ? "is-list-view" : "is-grid-view"}`}
              onScroll={(event) => {
                const el = event.currentTarget;
                if (el.scrollTop + el.clientHeight >= el.scrollHeight - 240) {
                  setIconDisplayLimit((limit) => Math.min(limit + 120, displayedIcons.length));
                }
              }}
            >
              {shownIcons.map((icon) => {
                const favorite = isFavorite(icon);
                const selectionKey = iconSelectionKey(icon);
                const isSelected = selectedIconId === selectionKey;
                const isDragging = draggingIcon?.icon?.id === icon.id;
                const collectionMeta = sourceLabel(icon);
                return (
                  <div
                    key={`${icon.category || icon.source}-${icon.id}`}
                    className={`icon-card library-icon-card sk-icon-card ${isDragging ? "is-drag-source" : ""} ${isSelected ? "is-selected" : ""} ${favorite ? "has-favorite" : ""}`}
                    onPointerDown={(event) => handleIconPointerDown(event, icon)}
                    onMouseDown={(event) => handleIconMouseDown(event, icon)}
                    onDragStart={(event) => handleDragStart(event, icon)}
                    draggable={true}
                  >
                    <button
                      type="button"
                      className="sk-icon-card-main"
                      onClick={() => {
                        setSelectedIconId(selectionKey);
                        handleIconClick(icon);
                      }}
                      title={`${icon.name} — Click or drag onto canvas`}
                      aria-label={`Add ${icon.name} to canvas`}
                      aria-pressed={isSelected}
                    >
                      <span className="icon-preview library-icon-preview sk-icon-stage">
                        <img src={icon.src} alt="" draggable={false} loading="lazy" />
                      </span>
                      <span className="library-icon-card-content sk-icon-card-text">
                        <span className="icon-name sk-icon-name">
                          {renderHighlightedText(icon.name, search)}
                        </span>
                        {viewMode === "list" && (
                          <span className="icon-subtitle sk-icon-subtitle">{collectionMeta}</span>
                        )}
                      </span>
                    </button>

                    <div className="library-icon-card-actions sk-icon-actions">
                      <button
                        type="button"
                        className={`favorite-button sk-fav-btn ${favorite ? "active is-favorite" : ""}`}
                        title={favorite ? `Remove ${icon.name} from saved` : `Save ${icon.name}`}
                        aria-label={favorite ? `Remove ${icon.name} from saved` : `Save ${icon.name}`}
                        aria-pressed={favorite}
                        onPointerDown={(event) => event.stopPropagation()}
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          toggleFavorite(icon);
                        }}
                      >
                        <svg viewBox="0 0 16 16" width="12" height="12" fill={favorite ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
                          <path d="m8 2 1.85 3.75 4.15.6-3 2.92.71 4.13L8 11.45 4.29 13.4 5 9.27 2 6.35l4.15-.6Z" />
                        </svg>
                      </button>

                      <button
                        type="button"
                        className="library-add-icon sk-add-btn"
                        title={`Insert ${icon.name} at canvas center`}
                        aria-label={`Insert ${icon.name}`}
                        onPointerDown={(event) => event.stopPropagation()}
                        onMouseDown={(event) => event.stopPropagation()}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setSelectedIconId(selectionKey);
                          handleIconClick(icon);
                        }}
                      >
                        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
                          <path d="M8 3.25v9.5M3.25 8h9.5" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="empty library-empty sk-icon-empty">
              <p className="sk-icon-empty-title">
                {activeSource === "favorites" || activeCategory === "Favorites"
                  ? "No saved icons yet"
                  : activeSource === "recent" || activeCategory === "Recently Used"
                    ? "No recently used icons yet"
                    : remoteError || (search.trim() ? `No icons match “${search.trim()}”` : "No icons available")}
              </p>
              <p className="sk-icon-empty-desc">
                {activeSource === "favorites" || activeCategory === "Favorites"
                  ? "Click the star on any icon to pin it here."
                  : activeSource === "recent" || activeCategory === "Recently Used"
                    ? "Icons you add to the canvas will appear here."
                    : "Try a different keyword or switch back to All."}
              </p>
              {(search.trim() || activeSource !== "all") && (
                <button
                  type="button"
                  className="sk-icon-empty-action"
                  onClick={() => {
                    setSearch("");
                    chooseSource("all");
                  }}
                >
                  {search.trim() ? "Clear search" : "Browse all icons"}
                </button>
              )}
            </div>
          )}
        </section>
        <p className="sk-icon-compact-hint">Click to insert <span aria-hidden="true">·</span> Drag to place</p>
      </div>
    </aside>
  );
}
