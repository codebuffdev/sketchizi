import React from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { ARCHITECTURE_PACKS } from "../../features/templates/architecturePacks.js";
import { insertArchitecturePack } from "../../features/templates/architecturePackInsertion.js";

export default function ArchitectureTemplatesModal({ isOpen, onClose, apiRef }) {
  if (!isOpen) return null;

  const handleInsertTemplate = (pack) => {
    if (!insertArchitecturePack(apiRef?.current, pack, { captureUpdate: CaptureUpdateAction.IMMEDIATELY })) return;
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
