import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { rankCommands } from "../../features/commands/commandPaletteSearch.js";

const CATEGORY_ORDER = [
  "Collaboration",
  "Files",
  "View",
  "Layout",
  "Tools",
  "Export",
  "Application",
];
const CATEGORY_RANK = new Map(CATEGORY_ORDER.map((category, index) => [category, index]));
const RECENT_STORAGE_KEY = "sketchizi.command-palette.recent.v1";
const MAX_RECENT_COMMANDS = 5;

function isContextual(command) {
  try {
    return typeof command.contextual === "function"
      ? command.contextual() === true
      : command.contextual === true;
  } catch {
    return false;
  }
}

function groupByCategory(commands) {
  const groups = [];
  for (const command of commands) {
    const category = command.category || "Other";
    let group = groups.find((item) => item.category === category);
    if (!group) {
      group = { category, commands: [] };
      groups.push(group);
    }
    group.commands.push(command);
  }
  return groups.sort((a, b) =>
    (CATEGORY_RANK.get(a.category) ?? Number.MAX_SAFE_INTEGER)
      - (CATEGORY_RANK.get(b.category) ?? Number.MAX_SAFE_INTEGER)
  );
}

function CommandPalette({ open, onClose, commands, onExecute }) {
  const inputRef = useRef(null);
  const [query, setQuery] = useState("");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [recentCommandIds, setRecentCommandIds] = useState([]);

  useEffect(() => {
    try {
      const stored = JSON.parse(window.localStorage.getItem(RECENT_STORAGE_KEY) || "[]");
      if (Array.isArray(stored)) setRecentCommandIds(stored.filter((id) => typeof id === "string").slice(0, MAX_RECENT_COMMANDS));
    } catch {
      setRecentCommandIds([]);
    }
  }, []);

  const availableCommands = useMemo(() => commands.filter((command) => {
    try { return command.available?.() !== false; } catch { return false; }
  }), [commands]);

  const visibleCommands = useMemo(
    () => rankCommands(availableCommands, query),
    [availableCommands, query],
  );

  const sections = useMemo(() => {
    if (query.trim()) return groupByCategory(visibleCommands);

    const byId = new Map(availableCommands.map((command) => [command.id, command]));
    const contextual = availableCommands.filter(isContextual);
    const contextualIds = new Set(contextual.map((command) => command.id));
    const recent = recentCommandIds
      .map((id) => byId.get(id))
      .filter((command) => command && !contextualIds.has(command.id));
    const featuredIds = new Set([...contextual, ...recent].map((command) => command.id));
    const remaining = availableCommands.filter((command) => !featuredIds.has(command.id));
    const result = [];

    if (contextual.length) result.push({ category: "Relevant now", commands: contextual, featured: true });
    if (recent.length) result.push({ category: "Recently used", commands: recent, featured: true });
    result.push(...groupByCategory(remaining));
    return result;
  }, [availableCommands, query, recentCommandIds, visibleCommands]);

  const displayedCommands = useMemo(
    () => sections.flatMap((section) => section.commands),
    [sections],
  );

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setSelectedIndex(0);
    requestAnimationFrame(() => inputRef.current?.focus());
  }, [open]);

  useEffect(() => {
    setSelectedIndex((current) => Math.min(current, Math.max(displayedCommands.length - 1, 0)));
  }, [displayedCommands.length]);

  if (!open || typeof document === "undefined") return null;

  const executeSelected = (command) => {
    if (!command) return;
    const nextRecentIds = [command.id, ...recentCommandIds.filter((id) => id !== command.id)]
      .slice(0, MAX_RECENT_COMMANDS);
    setRecentCommandIds(nextRecentIds);
    try {
      window.localStorage.setItem(RECENT_STORAGE_KEY, JSON.stringify(nextRecentIds));
    } catch {
      // Recent commands are a convenience; execution must still work if storage is unavailable.
    }
    onClose();
    onExecute(command);
  };

  let flattenedIndex = 0;
  const palette = (
    <div className="sketchizi-command-palette-overlay" role="presentation" onPointerDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section
        className="sketchizi-command-palette"
        role="dialog"
        aria-modal="true"
        aria-label="Sketchizi command palette"
      >
        <div className="sketchizi-command-heading">
          <div className="sketchizi-command-heading-mark" aria-hidden="true">⌘</div>
          <div>
            <strong>Command Palette</strong>
            <small>Find actions and navigate your workspace</small>
          </div>
          <button type="button" className="sketchizi-command-close" onClick={onClose} aria-label="Close command palette">×</button>
        </div>

        <label className="sketchizi-command-search-wrap">
          <span className="sketchizi-command-search-icon" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" />
            </svg>
          </span>
          <input
            ref={inputRef}
            className="sketchizi-command-search"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setSelectedIndex(0); }}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown") {
                event.preventDefault();
                setSelectedIndex((current) => displayedCommands.length ? (current + 1) % displayedCommands.length : 0);
              } else if (event.key === "ArrowUp") {
                event.preventDefault();
                setSelectedIndex((current) => displayedCommands.length ? (current - 1 + displayedCommands.length) % displayedCommands.length : 0);
              } else if (event.key === "Enter") {
                event.preventDefault();
                executeSelected(displayedCommands[selectedIndex]);
              }
            }}
            type="search"
            placeholder="Search actions, tools, or shortcuts..."
            aria-label="Search commands"
            autoComplete="off"
            spellCheck="false"
          />
          <span className="sketchizi-command-search-hints" aria-hidden="true">
            <kbd>Ctrl+Shift+P</kbd>
            <kbd>Esc</kbd>
          </span>
        </label>

        <div className="sketchizi-command-results-heading">
          <span>{query.trim() ? "Matching commands" : "Explore commands"}</span>
          <span>{visibleCommands.length} available</span>
        </div>
        <div className="sketchizi-command-results" role="listbox" aria-label="Commands">
          {visibleCommands.length === 0 ? (
            <div className="sketchizi-command-empty">
              <strong>No matching commands</strong>
              <span>Try a different term, category, or shortcut.</span>
            </div>
          ) : sections.map((group) => (
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
          ))}
        </div>

        <footer className="sketchizi-command-palette-footer">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate</span>
          <span><kbd>Enter</kbd> execute</span>
          <span><kbd>Esc</kbd> close</span>
          <span className="sketchizi-command-footer-count">Shortcuts shown when available</span>
        </footer>
      </section>
    </div>
  );

  return createPortal(palette, document.body);
}

export default CommandPalette;
