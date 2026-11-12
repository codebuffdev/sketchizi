import React from "react";
import { ARCHITECTURE_PACKS } from "../../features/templates/architecturePacks.js";

export default function ArchitectureTemplatesModal({ isOpen, onClose, apiRef }) {
  if (!isOpen) return null;

  const handleInsertTemplate = (pack) => {
    const api = apiRef?.current;
    if (!api) return;

    const existingElements = (api.getSceneElements?.() || []).filter((el) => !el.isDeleted && !el.deleted);

    // Compute bounding offset so template does not collide with existing work
    let offsetX = 100;
    let offsetY = 100;

    if (existingElements.length > 0) {
      let maxX = -Infinity;
      let minY = Infinity;
      for (const el of existingElements) {
        maxX = Math.max(maxX, (Number(el.x) || 0) + (Number(el.width) || 0));
        minY = Math.min(minY, Number(el.y) || 0);
      }
      offsetX = maxX + 80;
      offsetY = Math.max(100, minY);
    }

    const timestamp = Date.now();
    const newElements = pack.elements.map((el, idx) => ({
      ...el,
      id: `tpl-${pack.id}-${timestamp}-${idx}`,
      x: el.x + (offsetX - 100),
      y: el.y + (offsetY - 100),
      seed: Math.floor(Math.random() * 100000),
      version: 1,
      versionNonce: 1,
      isDeleted: false,
    }));

    api.updateScene?.({
      elements: [...existingElements, ...newElements],
      commitToHistory: true,
    });

    onClose();
  };

  return (
    <div className="sketchizi-export-backdrop" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="sketchizi-templates-modal" role="dialog" aria-modal="true" aria-labelledby="templates-modal-title">
        <div className="sketchizi-export-header">
          <div>
            <h2 id="templates-modal-title">Architecture Starter Packs</h2>
            <p>1-Click production system designs, cloud topologies, and interview frameworks.</p>
          </div>
          <button type="button" className="sketchizi-modal-close" onClick={onClose} aria-label="Close templates modal">×</button>
        </div>

        <div className="sketchizi-templates-grid">
          {ARCHITECTURE_PACKS.map((pack) => (
            <div key={pack.id} className="sketchizi-template-card">
              <div className="sketchizi-template-card-top">
                <span className="sketchizi-template-badge">{pack.badge}</span>
                <span className="sketchizi-template-cat">{pack.category}</span>
              </div>
              <h3 className="sketchizi-template-title">{pack.title}</h3>
              <p className="sketchizi-template-desc">{pack.description}</p>
              <div className="sketchizi-template-footer">
                <span className="sketchizi-template-count">{pack.elements.length} components</span>
                <button
                  type="button"
                  className="sketchizi-template-insert-btn"
                  onClick={() => handleInsertTemplate(pack)}
                >
                  Insert into Canvas
                </button>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
