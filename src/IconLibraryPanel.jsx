export default function IconLibraryPanel({
  searchRef, search, setSearch, activeCategory, setActiveCategory, activeAwsCategory, setActiveAwsCategory, activeKubernetesCategory, setActiveKubernetesCategory, favorites, recentIcons,
  eraserCatalog, eraserSyncing, eraserSyncProgress, eraserSyncError, syncEraserLibrary, eraserCachedCount,
  remoteLoading, visibleIcons, umlIcons, mindMapIcons, createStarterMindMap, awsIcons, awsCategories, awsCategoryCounts, awsCategoryRepresentatives, awsCatalogLogo, awsCatalogLogoDark, kubernetesIcons, kubernetesCategories, kubernetesCategoryCounts, kubernetesCategoryRepresentatives,
  iconDisplayLimit, setIconDisplayLimit, iconListRef, draggingIcon, handleIconClick,
  handleIconPointerDown, handleIconMouseDown, handleDragStart, isFavorite, toggleFavorite, remoteError, onClose,
}) {
  return (
  <aside className="library-panel">
    <div className="library-panel-header">
      <div className="label">
        <span className="library-panel-label-desktop">ICON LIBRARY</span>
        <span className="library-panel-label-mobile">Resources</span>
      </div>
      <button
        type="button"
        className="mobile-panel-close"
        onClick={onClose}
        aria-label="Close resources"
      >×</button>
    </div>

    <div className="search-wrap">
      <input
        ref={searchRef}
        className="search"
        value={search}
        onChange={(event) => setSearch(event.target.value)}
        placeholder="Search icons..."
        aria-label="Search icons"
      />
      <kbd>/</kbd>
    </div>

    <nav className="quick-categories">
      {[
        ["Eraser Icons", eraserCatalog.length, "◆"],
        ["UML Diagrams", umlIcons.length, "◇"],
        ["Mind Maps", mindMapIcons.length, "●"],
        ["AWS Architecture", awsIcons.length, null],
        ["Kubernetes", kubernetesIcons.length, "⬡"],
        ["Favorites", favorites.length, "★"],
        ["Recently Used", recentIcons.length, "◷"],
      ].map(([category, count, icon]) => (
        <button
          key={category}
          className={activeCategory === category && !search.trim() ? "category quick-category active" : "category quick-category"}
          onClick={() => {
            setActiveCategory(category);
            if (category === "AWS Architecture") setActiveAwsCategory("All");
            if (category === "Kubernetes") setActiveKubernetesCategory("All");
            setSearch("");
            requestAnimationFrame(() => searchRef.current?.focus());
          }}
          type="button"
        >
          <span className="quick-category-label">
            <span className="quick-category-icon">
              {category === "AWS Architecture" ? (
                <span className="aws-catalog-logo-wrap" aria-hidden="true">
                  <img className="aws-catalog-logo aws-catalog-logo-light" src={awsCatalogLogo} alt="" draggable={false} />
                  <img className="aws-catalog-logo aws-catalog-logo-dark" src={awsCatalogLogoDark} alt="" draggable={false} />
                </span>
              ) : icon}
            </span>
            {category}
          </span>
          <span className="category-count">{count}</span>
        </button>
      ))}
    </nav>

    {activeCategory === "Eraser Icons" && !search.trim() && (
      <div className="eraser-library-status">
        <div><strong>Eraser Icons</strong><span>{eraserCatalog.length ? `${eraserCatalog.length} icons` : "Loading…"}</span></div>
        <button type="button" className="connection-button secondary" onClick={syncEraserLibrary} disabled={eraserSyncing || !eraserCatalog.length}>
          {eraserSyncing ? `Syncing ${eraserSyncProgress.done}/${eraserSyncProgress.total}` : eraserCachedCount > 0 ? `Available offline (${eraserCachedCount}/${eraserCatalog.length})` : "Make available offline"}
        </button>
        {eraserSyncError && <div className="connection-help">{eraserSyncError}</div>}
      </div>
    )}

    {activeCategory === "UML Diagrams" && !search.trim() && (
      <div className="uml-library-status">
        <div><strong>Built-in UML elements</strong><span>{umlIcons.length} elements</span></div>
        <div className="connection-help">Classes, interfaces, actors, components, notes and relationships are built into Sketchizi and available offline.</div>
      </div>
    )}

    {activeCategory === "Mind Maps" && !search.trim() && (
      <div className="mindmap-library-status">
        <div><strong>Mind Map tools</strong><span>{mindMapIcons.length} elements</span></div>
        <button type="button" className="connection-button secondary" onClick={createStarterMindMap}>Create starter mind map</button>
        <div className="connection-help">Drag a central topic, main topic, subtopic or relationship onto the canvas, or start with a ready-made six-branch mind map.</div>
      </div>
    )}

    {activeCategory === "Kubernetes" && !search.trim() && (
      <div className="kubernetes-library-status">
        <div><strong>Kubernetes</strong><span>{kubernetesIcons.length} official SVG icons</span></div>
        <div className="kubernetes-category-list" role="navigation" aria-label="Kubernetes icon categories">
          {["All", ...kubernetesCategories].map((category) => (
            <button
              key={category}
              type="button"
              className={activeKubernetesCategory === category ? "category kubernetes-category active" : "category kubernetes-category"}
              onClick={() => { setActiveKubernetesCategory(category); setSearch(""); }}
            >
              <span className="kubernetes-category-label">
                {category !== "All" && (
                  <img
                    className="kubernetes-category-icon"
                    src={kubernetesIcons.find((entry) => entry.id === kubernetesCategoryRepresentatives[category])?.src}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                  />
                )}
                <span>{category}</span>
              </span>
              <span className="category-count">{category === "All" ? kubernetesIcons.length : (kubernetesCategoryCounts[category] || 0)}</span>
            </button>
          ))}
        </div>
      </div>
    )}

    {activeCategory === "AWS Architecture" && !search.trim() && (
      <div className="aws-library-status">
        <div><strong>AWS Architecture</strong><span>{awsIcons.length} official SVG icons</span></div>
        <div className="aws-category-list" role="navigation" aria-label="AWS icon categories">
          {["All", ...awsCategories].map((category) => (
            <button
              key={category}
              type="button"
              className={activeAwsCategory === category ? "category aws-category active" : "category aws-category"}
              onClick={() => { setActiveAwsCategory(category); setSearch(""); }}
            >
              <span className="aws-category-label">
                {category !== "All" && (
                  <img
                    className="aws-category-icon"
                    src={awsIcons.find((icon) => icon.id === awsCategoryRepresentatives[category])?.src}
                    alt=""
                    aria-hidden="true"
                    draggable={false}
                  />
                )}
                <span>{category}</span>
              </span>
              <span className="category-count">{category === "All" ? awsIcons.length : (awsCategoryCounts[category] || 0)}</span>
            </button>
          ))}
        </div>
      </div>
    )}

    <section className="icons">
      <div className="section-heading">
        <div className="section-title">
          {search.trim() ? "Search results" : activeCategory}
        </div>
        <div className="icon-total">
          {search.trim()
            ? `${visibleIcons.length} found`
            : activeCategory === "Favorites"
              ? `${favorites.length} saved`
              : activeCategory === "Recently Used"
                ? `${recentIcons.length} icons`
                : activeCategory === "UML Diagrams"
                  ? `${umlIcons.length} elements`
                  : activeCategory === "Mind Maps"
                    ? `${mindMapIcons.length} elements`
                    : activeCategory === "Kubernetes"
                      ? `${kubernetesIcons.length} icons`
                      : `${eraserCatalog.length || "…"} icons`}
        </div>
      </div>

      {remoteLoading && activeCategory === "Eraser Icons" && visibleIcons.length === 0 ? (
        <div className="empty">Loading icons...</div>
      ) : visibleIcons.length > 0 ? (
        <>
        <div
          className="icon-grid"
          ref={iconListRef}
          onScroll={(event) => {
            const el = event.currentTarget;
            if (el.scrollTop + el.clientHeight >= el.scrollHeight - 240) {
              setIconDisplayLimit((limit) => Math.min(limit + 120, visibleIcons.length));
            }
          }}
        >
          {visibleIcons.slice(0, iconDisplayLimit).map((icon) => ( 
            <button
              key={`${icon.category}-${icon.id}`}
              className={draggingIcon?.icon?.id === icon.id ? "icon-card is-drag-source" : "icon-card"}
              draggable={false}
              onClick={() => handleIconClick(icon)}
              onPointerDown={(event) => handleIconPointerDown(event, icon)}
              onMouseDown={(event) => handleIconMouseDown(event, icon)}
              onDragStart={(event) => handleDragStart(event, icon)}
              title={`Drag ${icon.name} onto the canvas`}
            >
              <div className="icon-preview">
                <img
                  src={icon.src}
                  alt={icon.name}
                  draggable={false}
                />
                <span
                  className={isFavorite(icon) ? "favorite-button active" : "favorite-button"}
                  role="button"
                  tabIndex={0}
                  title={isFavorite(icon) ? "Remove from favorites" : "Add to favorites"}
                  aria-label={isFavorite(icon) ? "Remove from favorites" : "Add to favorites"}
                  onClick={(event) => {
                    event.preventDefault();
                    event.stopPropagation();
                    toggleFavorite(icon);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      event.stopPropagation();
                      toggleFavorite(icon);
                    }
                  }}
                >
                  {isFavorite(icon) ? "★" : "☆"}
                </span>
              </div>
              <div className="icon-name">{icon.name}</div>
              <div className="icon-subtitle">{icon.subtitle}</div>

            </button>
          ))}
        </div>
        {visibleIcons.length > iconDisplayLimit && (
          <div className="library-scroll-hint">Showing {Math.min(iconDisplayLimit, visibleIcons.length)} of {visibleIcons.length} · scroll for more</div>
        )}
        </>
      ) : (
        <div className="empty">
          {activeCategory === "Favorites"
            ? "No favorite icons yet. Click ★ on an icon to save it."
            : activeCategory === "Recently Used"
              ? "No recently used icons yet."
              : activeCategory === "UML Diagrams"
                ? "No matching UML elements."
                : activeCategory === "Mind Maps"
                  ? "No matching mind-map elements."
                  : activeCategory === "Kubernetes"
                    ? "No matching Kubernetes icons."
                    : remoteError || "No matching icons."}
        </div>
      )}
    </section>

  </aside>
  );
}
