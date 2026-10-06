export default function MoreTools({ open, anchor, position, activateTool, toggle, canEdit = true }) {
  const items = [
    ["image", "▧", "Insert image", "9"], ["frame", "⌗", "Frame tool", "F"], ["embeddable", "◇", "Web Embed", ""],
    ["autoshape", "◌", "Draw to shape", "⇧X"], ["laser", "✧", "Laser pointer", "K"], ["bucketfill", "◒", "Bucket fill", "B"], ["lasso", "◌", "Lasso selection", ""],
  ];
  return (
    <div className={`sketchizi-more-tools ${open ? "open" : ""}`} style={{ "--sketchizi-more-tools-left": `${anchor.left}px`, "--sketchizi-more-tools-top": `${anchor.top}px` }}>
      <button type="button" className="sketchizi-more-tools-trigger" aria-label="More tools" aria-haspopup="menu" aria-expanded={open} onClick={(event) => { event.preventDefault(); event.stopPropagation(); position(); toggle("more-tools"); }}><span aria-hidden="true">⋮</span></button>
      {open && <div className="sketchizi-more-tools-menu" role="menu" aria-label="More tools">
        {items.map(([tool, icon, label, key]) => <button key={tool} type="button" role="menuitem" disabled={!canEdit} onClick={() => activateTool(tool)}><span className="more-tools-icon">{icon}</span><span>{label}</span><kbd>{key}</kbd></button>)}
        <div className="more-tools-section-title">Generate</div>
        <button type="button" role="menuitem" disabled={!canEdit} onClick={() => activateTool("text-to-diagram")}><span className="more-tools-icon">✿</span><span>Text to diagram</span><em>AI</em></button>
        <button type="button" role="menuitem" disabled={!canEdit} onClick={() => activateTool("mermaid")}><span className="more-tools-icon">Y</span><span>Mermaid to Excalidraw</span><kbd></kbd></button>
        <button type="button" role="menuitem" disabled={!canEdit} onClick={() => activateTool("magicframe")}><span className="more-tools-icon">✣</span><span>Wireframe to code</span><em>AI</em></button>
      </div>}
    </div>
  );
}
