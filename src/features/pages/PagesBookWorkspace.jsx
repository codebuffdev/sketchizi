import React, { useState } from 'react';

export default function PagesBookWorkspace({
  pages = [], active, index = 0, pageRect, canEdit = true,
  onSelect, onAdd, onDelete, onToggleRead, onPatch,
}) {
  const [collapsed, setCollapsed] = useState(false);
  const meta = active && active.customData || {};
  const title = meta.chapterTitle || active?.name || ('Chapter ' + (index + 1));
  const tagline = meta.tagline || 'A working space for ideas, systems, and sketches';
  const texture = meta.paperTexture || 'Dots';
  return (
    <div className={'pages-book-workspace' + (collapsed ? ' rail-collapsed' : '')}>
      <aside className="pages-chapters-rail" aria-label="Chapters">
        <div className="pages-rail-heading"><strong>Chapters</strong><button type="button" aria-label={collapsed ? 'Expand Chapters' : 'Collapse Chapters'} onClick={() => setCollapsed(v => !v)}>{collapsed ? '›' : '‹'}</button></div>
        {!collapsed && <>
          <div className="pages-chapter-list">
            {pages.map((page, i) => <div className={'pages-chapter-row' + (page.id === active?.id ? ' is-active' : '')} key={page.id}>
              <button type="button" className="pages-chapter-select" aria-current={page.id === active?.id ? 'page' : undefined} onClick={() => onSelect(page)}>
                <span className="pages-chapter-number">{String(i + 1).padStart(2, '0')}</span><span className="pages-chapter-title">{page.customData?.chapterTitle || page.name || ('Chapter ' + (i + 1))}</span>
              </button>
              <button type="button" className="pages-chapter-complete" aria-label="Toggle chapter read status" aria-pressed={Boolean(page.customData?.completed)} onClick={() => onToggleRead(page)}>{page.customData?.completed ? '✓' : '○'}</button>
              {canEdit && <button type="button" className="pages-chapter-delete" aria-label={'Delete ' + (page.name || 'chapter')} onClick={() => onDelete(page)}>×</button>}
            </div>)}
          </div>
          <button type="button" className="pages-new-chapter" onClick={onAdd} disabled={!canEdit}>＋ New Chapter</button>
        </>}
      </aside>
      <section className="pages-book-sheet" style={pageRect} aria-label={'Chapter ' + (index + 1) + ': ' + title}>
        <div className="pages-book-edge pages-book-edge-one" /><div className="pages-book-edge pages-book-edge-two" /><div className="pages-book-spine" />
        <header className="pages-editorial-header">
          <div className="pages-editorial-topline"><span className="pages-chapter-eyebrow">CHAPTER {String(index + 1).padStart(2, '0')}</span>
            <div className="pages-editorial-actions">
              <div className="pages-paper-switcher" aria-label="Paper texture">{['Dots', 'Ruled', 'Clean'].map(value => <button type="button" key={value} aria-pressed={texture === value} onClick={() => onPatch({ paperTexture: value })}>{value}</button>)}</div>
              <button type="button" className="pages-mark-read" aria-pressed={Boolean(meta.completed)} onClick={() => onToggleRead(active)}>{meta.completed ? '✓ Read' : '✓ Mark Read'}</button>
            </div>
          </div>
          <input className="pages-chapter-heading" aria-label="Chapter title" value={title} disabled={!canEdit} onChange={e => onPatch({ chapterTitle: e.target.value })} />
          <input className="pages-chapter-tagline" aria-label="Chapter subtitle" value={tagline} disabled={!canEdit} onChange={e => onPatch({ tagline: e.target.value })} />
          <div className="pages-key-note"><span className="pages-key-badge">RULE OF THUMB</span><input aria-label="Key formula or rule of thumb" value={meta.keyNote || ''} placeholder="Add a key formula or rule of thumb…" disabled={!canEdit} onChange={e => onPatch({ keyNote: e.target.value })} /></div>
        </header>
        <div className={'pages-book-canvas-zone texture-' + String(texture).toLowerCase()} aria-hidden="true" />
        <footer className="pages-book-folio"><span>SKETCHIZI · ENGINEERING HANDBOOK</span><span>CHAPTER {String(index + 1).padStart(2, '0')} OF {String(pages.length).padStart(2, '0')}</span></footer>
      </section>
    </div>
  );
}
