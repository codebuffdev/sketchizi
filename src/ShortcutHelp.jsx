const SHORTCUTS = [
  ["Ctrl+Shift+P", "Open command palette"],
  ["/", "Open icon library & focus search"],
  ["P", "Toggle Properties (when selected)"],
  ["D", "Toggle Dark / Light theme"],
  ["G", "Toggle canvas pattern"],
  ["M", "Pin / unpin the Map"],
  ["1", "Fit all content (while the Map is open)"],
  ["F", "Fit diagram to viewport"],
  ["C", "Code Block: click the canvas to place a syntax-highlighted code card"],
  ["A / L", "Arrow / Line: click points, double-click or Enter to finish"],
  ["Alt", "Arrow drawing / handle drag: skip angle snap"],
  ["Alt + click", "Delete a bend on a selected arrow"],
  ["Ctrl+Tab / Ctrl+Shift+Tab", "Next / previous tab (Ctrl+] / Ctrl+[ also work)"],
  ["Right-click a tab", "Pin tab / Unpin tab (up to 2 pinned)"],
  ["Esc", "Close panels / exit modes"],
  ["?", "Show keyboard shortcuts"],
];

export default function ShortcutHelp({ open, onClose }) {
  if (!open) return null;
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
        <div className="shortcut-footer">Shortcuts are disabled while typing in a field.</div>
      </section>
    </div>
  );
}
