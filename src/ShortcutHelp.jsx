import React from "react";
import { DOCK_SLOTS } from "./components/app/primaryDockModel.js";
import { detectPlatform, formatShortcut, getShortcutsForTool } from "./features/commands/keyboardShortcutRegistry.js";

const SHORTCUTS = [
  ["Ctrl+Shift+P", "Open command palette"],
  ["/", "Open icon library & focus search"],
  ["Shift+P", "Toggle Properties (when selected)"],
  ["D", "Toggle Dark / Light theme"],
  ["G", "Toggle canvas pattern"],
  ["M", "Pin / unpin the Map"],
  ["1", "Fit all content (while the Map is open)"],
  ["F", "Fit diagram to viewport"],
  ["C", "Code Block: click the canvas to place a syntax-highlighted code card"],
  ["Enter / double-click", "Finish an arrow or line while drawing"],
  ["Alt", "Arrow drawing / handle drag: skip angle snap"],
  ["Alt + click", "Delete a bend on a selected arrow"],
  ["Ctrl+Tab / Ctrl+Shift+Tab", "Next / previous tab (Ctrl+] / Ctrl+[ also work)"],
  ["Right-click a tab", "Pin tab / Unpin tab (up to 2 pinned)"],
  ["Esc", "Close panels / exit modes"],
  ["?", "Show keyboard shortcuts"],
];

/** Tool shortcuts grouped by dock slot, straight from the central registry. */
function toolShortcutGroups(platform) {
  return DOCK_SLOTS.map((slot) => ({
    label: slot.label,
    rows: slot.tools.map((tool) => ({
      id: tool.id,
      label: tool.label,
      keys: getShortcutsForTool(tool.id).map((definition) => formatShortcut(definition, platform)),
    })).filter((row) => row.keys.length),
  })).filter((group) => group.rows.length);
}

export default function ShortcutHelp({ open, onClose }) {
  if (!open) return null;
  const groups = toolShortcutGroups(detectPlatform());
  return (
    <div className="shortcut-overlay" role="presentation" onPointerDown={onClose}>
      <section className="shortcut-dialog" role="dialog" aria-modal="true" aria-labelledby="shortcut-title" onPointerDown={(event) => event.stopPropagation()}>
        <header className="shortcut-header">
          <div>
            <div className="shortcut-eyebrow">SKETCHIZI</div>
            <h2 id="shortcut-title">Keyboard shortcuts</h2>
          </div>
          <button type="button" className="shortcut-close" onClick={onClose} aria-label="Close shortcuts">×</button>
        </header>
        <div className="shortcut-list">
          {SHORTCUTS.map(([key, label]) => (
            <div className="shortcut-row" key={key}>
              <kbd>{key}</kbd><span>{label}</span>
            </div>
          ))}
        </div>
        <div className="shortcut-list shortcut-tool-list" aria-label="Tool shortcuts">
          {groups.map((group) => (
            <React.Fragment key={group.label}>
              <div className="shortcut-eyebrow">{group.label}</div>
              {group.rows.map((row) => (
                <div className="shortcut-row" key={row.id}>
                  <kbd>{row.keys.join("  ·  ")}</kbd><span>{row.label}</span>
                </div>
              ))}
            </React.Fragment>
          ))}
        </div>
        <div className="shortcut-footer">Shortcuts are disabled while typing in a field.</div>
      </section>
    </div>
  );
}
