export default function IconLibraryPanel({
  searchRef, search, setSearch, activeCategory, setActiveCategory, favorites, recentIcons,
  eraserCatalog, eraserSyncing, eraserSyncProgress, eraserSyncError, syncEraserLibrary, eraserCachedCount,
  remoteLoading, visibleIcons, umlIcons, mindMapIcons, createStarterMindMap,
  iconDisplayLimit, setIconDisplayLimit, iconListRef, draggingIcon, handleIconClick,
  handleIconPointerDown, handleIconMouseDown, handleDragStart, isFavorite, toggleFavorite, remoteError,
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
        ["Eraser Icons", eraserCatalog.length, "◆"],
        ["UML Diagrams", umlIcons.length, "◇"],
        ["Mind Maps", mindMapIcons.length, "●"],
        ["Favorites", favorites.length, "★"],
        ["Recently Used", recentIcons.length, "◷"],
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
                  : remoteError || "No matching icons."}
        </div>
      )}
    </section>

  </aside>
  );
}
