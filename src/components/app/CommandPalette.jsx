import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";


const CATEGORY_ORDER = [
  "Collaboration",
  "Files",
  "View",
  "Tools",
  "Export",
  "Application",
];

const CATEGORY_RANK = new Map(CATEGORY_ORDER.map((category, index) => [category, index]));

function normalize(value) {
  return String(value || "").toLocaleLowerCase().trim();
}

function CommandPalette({ open, onClose, commands, onExecute }) {
  const inputRef = useRef(null);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);

  const visibleCommands = useMemo(() => {
    const available = commands.filter((command) => {
      try { return command.available?.() !== false; } catch { return false; }
    });
    const needle = normalize(query);
    const filtered = needle
      ? available.filter((command) => normalize([
        command.label,
        command.description,
        ...(command.keywords || []),
      ].join(" ")).includes(needle))
      : available;

    return filtered
      .map((command, index) => ({ command, index }))
      .sort((a, b) => {
        const categoryDifference = (CATEGORY_RANK.get(a.command.category) ?? Number.MAX_SAFE_INTEGER)
          - (CATEGORY_RANK.get(b.command.category) ?? Number.MAX_SAFE_INTEGER);
        return categoryDifference || a.index - b.index;
      })
      .map(({ command }) => command);
  }, [commands, query]);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    setSelectedIndex((current) => Math.min(current, Math.max(visibleCommands.length - 1, 0)));
  }, [visibleCommands.length]);

  if (!open || typeof document === "undefined") return null;

  const executeSelected = (command) => {
    if (!command) return;
    onClose();
    onExecute(command);
  };

  const categories = [];
  for (const command of visibleCommands) {
    let group = categories.find((item) => item.category === command.category);
    if (!group) {
      group = { category: command.category, commands: [] };
      categories.push(group);
    }
    group.commands.push(command);
  }

  let flattenedIndex = 0;

  const palette = (
    <div className="sketchizi-command-palette-overlay" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section
        className="sketchizi-command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Sketchizi command palette"
      >
        <label className="sketchizi-command-search-wrap">
          <span className="sketchizi-command-search-icon" aria-hidden="true">⌕</span>
          <input
            ref={inputRef}
            className="sketchizi-command-search"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setSelectedIndex(0); }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setSelectedIndex((current) => visibleCommands.length ? (current + 1) % visibleCommands.length : 0);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setSelectedIndex((current) => visibleCommands.length ? (current - 1 + visibleCommands.length) % visibleCommands.length : 0);
              } else if (event.key === "Enter") {
                event.preventDefault();
                executeSelected(visibleCommands[selectedIndex]);
              }
            }}
            type="search"
            placeholder="Search commands..."
            aria-label="Search commands"
            autoComplete="off"
            spellCheck="false"
          />
          <span className="sketchizi-command-search-hints" aria-hidden="true">
            <kbd>Ctrl+Shift+P</kbd>
            <kbd>Esc</kbd>
          </span>
        </label>

        <div className="sketchizi-command-results" role="listbox" aria-label="Commands">
          {visibleCommands.length === 0 ? (
            <div className="sketchizi-command-empty">No commands found</div>
          ) : (
            categories.map((group) => (
              <div className="sketchizi-command-group" key={group.category} data-category={group.category}>
                <div className="sketchizi-command-group-title">{group.category}</div>
                {group.commands.map((command) => {
                  const index = flattenedIndex++;
                  const selected = index === selectedIndex;
                  return (
                    <button
                      key={command.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className={selected ? "sketchizi-command-item selected" : "sketchizi-command-item"}
                      onMouseMove={() => setSelectedIndex(index)}
                      onClick={() => executeSelected(command)}
                    >
                      <span className="sketchizi-command-icon" aria-hidden="true">{command.icon || "•"}</span>
                      <span className="sketchizi-command-copy">
                        <strong>{command.label}</strong>
                        {command.description && <small>{command.description}</small>}
                      </span>
                      {command.shortcut && <kbd>{command.shortcut}</kbd>}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>

        <footer className="sketchizi-command-palette-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>Enter</kbd> execute</span>
          <span><kbd>Esc</kbd> close</span>
        </footer>
      </section>
    </div>
  );

  return createPortal(palette, document.body);
}

export default CommandPalette;
