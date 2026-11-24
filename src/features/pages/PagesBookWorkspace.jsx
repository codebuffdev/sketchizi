import React from 'react';

export default function PagesBookWorkspace({
  pages = [], active, index = 0, canEdit = true, onToggleRead, onPatch,
}) {
  const meta = active && active.customData || {};
  const title = meta.chapterTitle || active?.name || ('Chapter ' + (index + 1));
  const tagline = meta.tagline || 'A working space for ideas, systems, and sketches';
  const texture = meta.paperTexture || 'Dots';
  return (
    <div className="pages-book-workspace">
      <div className="pages-book-sheet" aria-hidden="true">
        <div className={'pages-book-canvas-zone texture-' + String(texture).toLowerCase()} />
      </div>
      <section className="pages-book-ui" role="region" aria-label={'Chapter ' + (index + 1) + ': ' + title}>
        <header className="pages-editorial-header">
          <div className="pages-editorial-copy">
            <span className="pages-chapter-eyebrow">CHAPTER {String(index + 1).padStart(2, '0')}</span>
            <input className="pages-chapter-heading" aria-label="Chapter title" value={title} disabled={!canEdit} onChange={e => onPatch({ chapterTitle: e.target.value })} />
            <input className="pages-chapter-tagline" aria-label="Chapter subtitle" value={tagline} disabled={!canEdit} onChange={e => onPatch({ tagline: e.target.value })} />
          </div>
          <div className="pages-editorial-actions">
            <div className="pages-key-note"><span className="pages-key-badge">RULE OF THUMB</span><input aria-label="Key formula or rule of thumb" value={meta.keyNote || ''} placeholder="Add a key formula or rule of thumb…" disabled={!canEdit} onChange={e => onPatch({ keyNote: e.target.value })} /></div>
            <div className="pages-paper-switcher" aria-label="Paper texture">{['Dots', 'Ruled', 'Clean'].map(value => <button type="button" key={value} aria-pressed={texture === value} onClick={() => onPatch({ paperTexture: value })}>{value}</button>)}</div>
<button type="button" className="pages-mark-read" aria-pressed={Boolean(meta.completed)} onClick={() => onToggleRead(active)}>{meta.completed ? '✓ Read' : '✓ Mark Read'}</button>
          </div>
        </header>
        <footer className="pages-book-folio"><span>SKETCHIZI · ENGINEERING HANDBOOK</span><span>CHAPTER {String(index + 1).padStart(2, '0')} OF {String(pages.length).padStart(2, '0')}</span></footer>
      </section>
    </div>
  );
}
