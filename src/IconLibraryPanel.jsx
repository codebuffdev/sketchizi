export default function IconLibraryPanel({
  searchRef, search, setSearch, activeCategory, setActiveCategory, favorites, recentIcons,
  eraserCatalog, eraserSyncing, eraserSyncProgress, eraserSyncError, syncEraserLibrary,
  remoteLoading, visibleIcons,
  iconDisplayLimit, setIconDisplayLimit, iconListRef, draggingIcon, handleIconClick,
  handleIconPointerDown, handleDragStart, isFavorite, toggleFavorite, remoteError,
}) {
  return (
  <aside className="library-panel">
    <div className="label">ICON LIBRARY</div>

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
        ["Favorites", favorites.filter((item) => item.source === "eraser").length, "★"],
        ["Recently Used", recentIcons.filter((item) => item.source === "eraser").length, "◷"],
      ].map(([category, count, icon]) => (
        <button
          key={category}
          className={activeCategory === category && !search.trim() ? "category quick-category active" : "category quick-category"}
          onClick={() => { setActiveCategory(category); setSearch(""); requestAnimationFrame(() => searchRef.current?.focus()); }}
          type="button"
        >
          <span className="quick-category-label"><span className="quick-category-icon">{icon}</span>{category}</span>
          <span className="category-count">{count}</span>
        </button>
      ))}
    </nav>

    <div className="eraser-library-status">
      <div><strong>Eraser Icons</strong><span>{eraserCatalog.length || "…"} icons</span></div>
      <button type="button" className="connection-button secondary" onClick={syncEraserLibrary} disabled={eraserSyncing || !eraserCatalog.length}>
        {eraserSyncing ? `Syncing ${eraserSyncProgress.done}/${eraserSyncProgress.total}` : "Make available offline"}
      </button>
      {eraserSyncError && <div className="connection-help">{eraserSyncError}</div>}
    </div>

    <section className="icons">
      <div className="section-heading">
        <div className="section-title">
          {search.trim() ? "Search results" : "Eraser Icons"}
        </div>
        <div className="icon-total">
          {search.trim()
            ? `${visibleIcons.length} found`
            : activeCategory === "Favorites"
              ? `${favorites.length} saved`
              : activeCategory === "Recently Used"
                ? `${recentIcons.length} icons`
                : `${eraserCatalog.length || "…"} icons`}
        </div>
      </div>

      {remoteLoading && visibleIcons.length === 0 ? (
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
              : remoteError || "No matching icons."}
        </div>
      )}
    </section>

    <div className="version">Sketchizi 1.0 · Eraser icon library</div>
  </aside>
  );
}
