import React from 'react';

export default function PagesBookWorkspace({
  pages = [], active, index = 0, canEdit = true, onToggleRead, onPatch,
}) {
  const meta = active && active.customData || {};
  const title = meta.chapterTitle ?? active?.name ?? ('Chapter ' + (index + 1));
  const summary = meta.tagline || '';
  const texture = meta.paperTexture || 'Dots';

  return (
    <div className="pages-book-workspace">
      <div className="pages-book-sheet" aria-hidden="true">
        <div className={'pages-book-canvas-zone texture-' + String(texture).toLowerCase()} />
      </div>
      <section className="pages-book-ui" role="region" aria-label={'Chapter ' + (index + 1) + ': ' + title}>
        <header className="pages-editorial-header">
          <div className="pages-editorial-copy">
            <div className="pages-editorial-title-row">
              <span className="pages-chapter-eyebrow">{String(index + 1).padStart(2, '0')}</span>
              <input
                className="pages-chapter-heading"
                aria-label="Chapter title"
                value={title}
                disabled={!canEdit}
                onPointerDown={e => e.stopPropagation()}
                onMouseDown={e => e.stopPropagation()}
                onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); }}
                onKeyUp={e => e.stopPropagation()}
                onChange={e => onPatch({ chapterTitle: e.target.value })}
                onBlur={() => { if (!title.trim()) onPatch({ chapterTitle: 'Untitled Chapter' }); }}
              />
            </div>
            <input
              className="pages-chapter-tagline"
              aria-label="Chapter subtitle"
              value={summary}
              placeholder="Add a chapter summary or focus..."
              disabled={!canEdit}
              onPointerDown={e => e.stopPropagation()}
              onMouseDown={e => e.stopPropagation()}
              onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); }}
              onKeyUp={e => e.stopPropagation()}
              onChange={e => onPatch({ tagline: e.target.value })}
            />
          </div>
          <div className="pages-editorial-actions">
            <div className="pages-paper-switcher" aria-label="Paper texture">
              {['Dots', 'Ruled', 'Clean'].map(value => (
                <button type="button" key={value} aria-pressed={texture === value}
                  disabled={!canEdit} onClick={() => onPatch({ paperTexture: value })}>{value}</button>
              ))}
            </div>
            <button type="button" className="pages-mark-read"
              aria-pressed={Boolean(meta.completed)} disabled={!canEdit}
              onClick={() => onToggleRead(active)}>
              {meta.completed ? '✓ Read' : '○ Read'}
            </button>
          </div>
        </header>
      </section>
    </div>
  );
}
