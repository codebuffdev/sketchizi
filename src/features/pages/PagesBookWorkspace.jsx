import React, { useEffect, useRef, useState } from 'react';

export default function PagesBookWorkspace({
  pages = [], active, index = 0, canEdit = true, onToggleRead, onPatch,
  bookTitle = 'Untitled drawing', onRenameBookTitle,
  chapterIndexOpen = false, chapterIndexRef, onToggleChapterIndex,
  onSelectChapter, onDeleteChapter, onDeleteOnlyPage, onAddChapter,
}) {
  const meta = active && active.customData || {};
  const title = meta.chapterTitle ?? active?.name ?? 'Untitled Page';
  const [bookTitleDraft, setBookTitleDraft] = useState(bookTitle);
  const [deleteOnlyPageOpen, setDeleteOnlyPageOpen] = useState(false);
  const [deleteOnlyPagePending, setDeleteOnlyPagePending] = useState(false);
  const deleteOnlyPageConfirmRef = useRef(null);
  const deleteChapterButtonRef = useRef(null);
  useEffect(() => setBookTitleDraft(bookTitle), [bookTitle]);
  const confirmDeleteOnlyPage = async () => {
    if (deleteOnlyPagePending) return;
    setDeleteOnlyPagePending(true);
    try {
      const deleted = await onDeleteOnlyPage?.(active);
      if (deleted !== false) setDeleteOnlyPageOpen(false);
    } finally {
      setDeleteOnlyPagePending(false);
    }
  };
  useEffect(() => {
    if (!deleteOnlyPageOpen) return undefined;
    deleteOnlyPageConfirmRef.current?.focus();
    const handleDialogKeys = event => {
      if (event.key !== 'Escape' && event.key !== 'Enter') return;
      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation?.();
      if (event.key === 'Escape') {
        setDeleteOnlyPageOpen(false);
        setDeleteOnlyPagePending(false);
        requestAnimationFrame(() => deleteChapterButtonRef.current?.focus());
      } else {
        confirmDeleteOnlyPage();
      }
    };
    window.addEventListener('keydown', handleDialogKeys, true);
    return () => window.removeEventListener('keydown', handleDialogKeys, true);
  }, [deleteOnlyPageOpen, deleteOnlyPagePending]);
  const requestDeleteChapter = page => {
    if (!page) return;
    if (pages.length === 1) {
      if (chapterIndexOpen) onToggleChapterIndex?.();
      setDeleteOnlyPageOpen(true);
      return;
    }
    onDeleteChapter?.(page);
  };
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
            <nav className="canvas-pages-navigation pages-header-chapter-controller" aria-label="Chapter navigation">
              <button type="button" aria-label="Previous chapter" disabled={index <= 0}
                onClick={() => onSelectChapter(pages[index - 1])}>‹</button>
              <div className="canvas-pages-chapter-index" ref={chapterIndexRef}>
                <button type="button" className="canvas-pages-chapter-trigger"
                  aria-label={`Chapter ${index + 1} of ${pages.length}: ${title}`}
                  aria-expanded={chapterIndexOpen} aria-haspopup="true"
                  onClick={onToggleChapterIndex}>
                  {String(index + 1).padStart(2, '0')} / {String(pages.length).padStart(2, '0')} · {title}
                  <span aria-hidden="true">▾</span>
                </button>
                {chapterIndexOpen && <div className="canvas-pages-chapter-popover" role="dialog"
                  aria-label="Chapters Index" onMouseDown={event => event.stopPropagation()}>
                  <strong className="canvas-pages-chapter-popover-title">Chapters</strong>
                  <div className="canvas-pages-chapter-popover-list">
                    {pages.map((page, pageIndex) => <div className={'canvas-pages-chapter-option' + (page.id === active?.id ? ' is-active' : '')} key={page.id}>
                      <button type="button" className="canvas-pages-chapter-jump"
                        aria-current={page.id === active?.id ? 'page' : undefined}
                        onClick={() => onSelectChapter(page)}>
                        <span className="canvas-pages-chapter-option-number">{String(pageIndex + 1).padStart(2, '0')}</span>
                        <span className="canvas-pages-chapter-option-name">{page.customData?.chapterTitle || page.name || ('Page ' + (pageIndex + 1))}</span>
                      </button>
                      <button type="button" className="canvas-pages-chapter-complete"
                        aria-label={'Toggle completion for ' + (page.customData?.chapterTitle || page.name || 'page')}
                        aria-pressed={Boolean(page.customData?.completed)} disabled={!canEdit}
                        onClick={() => onToggleRead(page)}>{page.customData?.completed ? '✓' : '○'}</button>
                      <button type="button" className="canvas-pages-chapter-remove"
                        aria-label={'Delete ' + (page.customData?.chapterTitle || page.name || 'page')}
                        disabled={!canEdit} onClick={() => requestDeleteChapter(page)}>×</button>
                    </div>)}
                  </div>
                  <button type="button" className="canvas-pages-chapter-new" disabled={!canEdit}
                    onClick={onAddChapter}>＋ New Chapter</button>
                </div>}
              </div>
              <button type="button" aria-label="Next chapter" disabled={index < 0 || index >= pages.length - 1}
                onClick={() => onSelectChapter(pages[index + 1])}>›</button>
              <button ref={deleteChapterButtonRef} type="button" className="canvas-pages-delete" disabled={!active || !canEdit}
                onClick={() => {
                  if (pages.length <= 1) {
                    if (chapterIndexOpen) onToggleChapterIndex?.();
                    setDeleteOnlyPageOpen(true);
                  } else {
                    requestDeleteChapter(active);
                  }
                }}>Delete</button>
              <button type="button" className="canvas-pages-add" aria-label="Add Chapter" title="Add Chapter"
                disabled={!canEdit} onClick={onAddChapter}>
                <svg className="canvas-pages-add-icon" width="15" height="15" viewBox="0 0 24 24"
                  fill="none" stroke="currentColor" strokeWidth="1.85" strokeLinecap="round"
                  strokeLinejoin="round" aria-hidden="true">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="12" y1="12" x2="12" y2="18" />
                  <line x1="9" y1="15" x2="15" y2="15" />
                </svg>
                <span>+ Chapter</span>
              </button>
            </nav>
          </div>
        </header>
      </section>
      {deleteOnlyPageOpen && (
        <div className="pages-delete-confirm-backdrop" onMouseDown={event => {
          if (event.target === event.currentTarget && !deleteOnlyPagePending) {
            setDeleteOnlyPageOpen(false);
            requestAnimationFrame(() => deleteChapterButtonRef.current?.focus());
          }
        }}>
          <section className="pages-delete-confirm-dialog" role="dialog" aria-modal="true"
            aria-labelledby="pages-delete-confirm-title" aria-describedby="pages-delete-confirm-description">
            <div className="pages-delete-confirm-icon" aria-hidden="true">!</div>
            <h2 id="pages-delete-confirm-title">Delete &quot;{bookTitle || 'Untitled drawing'}&quot;?</h2>
            <p id="pages-delete-confirm-description">This is the only page remaining. Deleting it will permanently remove this notebook and close its tab.</p>
            <div className="pages-delete-confirm-actions">
              <button type="button" className="pages-delete-confirm-cancel" disabled={deleteOnlyPagePending}
                onClick={() => { setDeleteOnlyPageOpen(false); requestAnimationFrame(() => deleteChapterButtonRef.current?.focus()); }}>Cancel</button>
              <button ref={deleteOnlyPageConfirmRef} type="button" className="pages-delete-confirm-submit"
                disabled={deleteOnlyPagePending} onClick={confirmDeleteOnlyPage}>
                {deleteOnlyPagePending ? 'Deleting…' : 'Delete & Close'}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
