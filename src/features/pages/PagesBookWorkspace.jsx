import React, { useEffect, useState } from 'react';

export default function PagesBookWorkspace({
  pages = [], active, index = 0, canEdit = true, onToggleRead, onPatch,
  bookTitle = 'Untitled drawing', onRenameBookTitle,
}) {
  const meta = active && active.customData || {};
  const title = meta.chapterTitle ?? active?.name ?? 'Untitled Page';
  const [bookTitleDraft, setBookTitleDraft] = useState(bookTitle);
  useEffect(() => setBookTitleDraft(bookTitle), [bookTitle]);
  const saveBookTitle = async () => {
    const nextTitle = bookTitleDraft.trim().slice(0, 120);
    if (nextTitle && nextTitle !== bookTitle && onRenameBookTitle) {
      try {
        await onRenameBookTitle(nextTitle);
      } catch {
        setBookTitleDraft(bookTitle);
      }
    } else {
      setBookTitleDraft(bookTitle);
    }
  };
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
              <span className="pages-chapter-eyebrow"><span>{String(index + 1).padStart(2, '0')}</span><span className="pages-eyebrow-separator">·</span><input
                className="pages-book-title-input"
                aria-label="Book / notebook title"
                value={bookTitleDraft}
                maxLength={120}
                disabled={!canEdit}
                onPointerDown={e => e.stopPropagation()}
                onMouseDown={e => e.stopPropagation()}
                onKeyDown={e => { e.stopPropagation(); if (e.key === 'Enter') e.currentTarget.blur(); if (e.key === 'Escape') { e.preventDefault(); setBookTitleDraft(bookTitle); e.currentTarget.blur(); } }}
                onKeyUp={e => e.stopPropagation()}
                onChange={e => setBookTitleDraft(e.target.value)}
                onBlur={saveBookTitle}
              /></span>
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
                onBlur={() => { if (!title.trim()) onPatch({ chapterTitle: 'Untitled Page' }); }}
              />
            </div>
            <input
              className="pages-chapter-tagline"
              aria-label="Chapter subtitle"
              value={summary}
              placeholder="Add a page summary or focus..."
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
                <button type="button" key={value} className="pages-paper-icon"
                  title={value} aria-label={value} aria-pressed={texture === value}
                  disabled={!canEdit} onClick={() => onPatch({ paperTexture: value })}>
                  <svg viewBox="0 0 16 16" width="15" height="15" fill="none"
                    stroke="currentColor" strokeWidth="1.85" strokeLinecap="round" strokeLinejoin="round"
                    aria-hidden="true">
                    {value === 'Dots' ? (
                      <><circle cx="3" cy="3" r=".65" fill="currentColor" stroke="none" />
                        <circle cx="8" cy="3" r=".65" fill="currentColor" stroke="none" />
                        <circle cx="13" cy="3" r=".65" fill="currentColor" stroke="none" />
                        <circle cx="3" cy="8" r=".65" fill="currentColor" stroke="none" />
                        <circle cx="8" cy="8" r=".65" fill="currentColor" stroke="none" />
                        <circle cx="13" cy="8" r=".65" fill="currentColor" stroke="none" />
                        <circle cx="3" cy="13" r=".65" fill="currentColor" stroke="none" />
                        <circle cx="8" cy="13" r=".65" fill="currentColor" stroke="none" />
                        <circle cx="13" cy="13" r=".65" fill="currentColor" stroke="none" /></>
                    ) : value === 'Ruled' ? (
                      <><path d="M2 3.5h12M2 7.5h12M2 11.5h12" /></>
                    ) : (
                      <><path d="M3 1.75h7l3 3v9.5H3z" /><path d="M10 1.75v3h3" /></>
                    )}
                  </svg>
                </button>
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
