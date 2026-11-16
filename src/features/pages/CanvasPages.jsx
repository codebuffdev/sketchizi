import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CaptureUpdateAction, convertToExcalidrawElements } from '@excalidraw/excalidraw';
import { getPages, pageSkeleton, validSize, duplicatePage, getPageViewportMask, getPageFitViewport, getResponsivePageSize, isElementWithinPage, PAGE_MARKER } from './pageModel.js';
import './pages.css';

export default function CanvasPages({ api, canEdit = true }) {
  const [open, setOpen] = useState(false);
  const [headerHost, setHeaderHost] = useState(null);
  const [mode, setMode] = useState(() => { try { return localStorage.getItem('sketchizi.canvasView') === 'pages' ? 'pages' : 'infinite'; } catch { return 'infinite'; } });
  const [pages, setPages] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [error, setError] = useState('');
  const [pageMask, setPageMask] = useState(null);
  const [resizeMode, setResizeMode] = useState(false);
  const activeIdRef = useRef(null);
  const initialFitRef = useRef(false);
  const previousViewportRef = useRef(null);
  const root = useRef(null);
  const signature = useRef('');
  const sceneSnapshot = useRef(null);
  const active = pages.find(p => p.id === activeId) || pages[0];
  const activePageRef = useRef(active);
  activePageRef.current = active;
  const index = pages.findIndex(p => p.id === active?.id);
  const host = document.querySelector('.app');

  useEffect(() => {
    setHeaderHost(document.querySelector('.desktop-app-header-island-center'));
  }, []);

  useEffect(() => {
    if (!api) return;
    sceneSnapshot.current = api.getSceneElementsIncludingDeleted();
    const sync = (elements, appState) => {
      const next = getPages(elements);
      // Native frame dragging/resizing must carry its paper surface too.
      const repairs = new Map();
      if (canEdit) for (const e of elements) {
        if (e.isDeleted || !e.customData?.sketchiziPagePaper) continue;
        const frame = next.find(p => p.id === e.customData.sketchiziPagePaper);
        if (frame && (['x','y','width','height'].some(k => frame[k] !== e[k]) || e.backgroundColor !== 'transparent' || e.strokeColor !== 'transparent')) {
          repairs.set(e.id, {...e, x:frame.x,y:frame.y,width:frame.width,height:frame.height,backgroundColor:'transparent',strokeColor:'transparent',version:e.version+1,versionNonce:Math.floor(Math.random()*2147483647),updated:Date.now()});
        }
      }
      if (repairs.size) {
        api.updateScene({elements:api.getSceneElementsIncludingDeleted().map(e => repairs.get(e.id) || e),captureUpdate:CaptureUpdateAction.NEVER});
        return;
      }
      const selected = next.find(p => p.id === activeIdRef.current) || next[0];
      if (mode === 'pages' && selected) {
        const previous = new Map((sceneSnapshot.current || []).map(element => [element.id, element]));
        let rejected = false;
        const guarded = api.getSceneElementsIncludingDeleted().map(element => {
          if (element.isDeleted || element.id === selected.id ||
              element.customData?.sketchiziPagePaper ||
              (element.type === 'frame' && element.customData?.[PAGE_MARKER])) return element;
          const before = previous.get(element.id);
          if (!before) {
            if (isElementWithinPage(element, selected)) {
              return element.frameId === selected.id ? element : { ...element, frameId: selected.id };
            }
            rejected = true;
            return { ...element, isDeleted: true, version: (element.version || 0) + 1,
              versionNonce: Math.floor(Math.random() * 2147483647), updated: Date.now() };
          }
          const changed = [...new Set([...Object.keys(before), ...Object.keys(element)])]
            .filter(key => !['version','versionNonce','updated','index'].includes(key))
            .some(key => JSON.stringify(before[key]) !== JSON.stringify(element[key]));
          if (!changed) return element;
          if (before.frameId !== selected.id && element.frameId !== selected.id) {
            rejected = true;
            return before;
          }
          if (!isElementWithinPage(element, selected)) {
            rejected = true;
            return before;
          }
          return element;
        });
        if (rejected) {
          sceneSnapshot.current = guarded;
          api.updateScene({ elements: guarded, captureUpdate: CaptureUpdateAction.NEVER });
          return;
        }
      }
      if (selected && !activeIdRef.current) {
        activeIdRef.current = selected.id;
        setActiveId(selected.id);
      }
      setPageMask(mode === 'pages' ? getPageViewportMask(selected, appState || api.getAppState()) : null);
      sceneSnapshot.current = api.getSceneElementsIncludingDeleted();
      const key = JSON.stringify(next.map(p => [p.id,p.version,p.name,p.width,p.height,p.customData.pageOrder]));
      if (signature.current !== key) { signature.current = key; setPages(next); }

    };
    sync(api.getSceneElements());
    const unsubscribe = api.onChange(sync);
    return () => { unsubscribe(); signature.current = ''; sceneSnapshot.current = null; };
  }, [api, canEdit, mode]);

  useEffect(() => {
    if (!open) return;
    const close = e => { if (e.type === 'keydown' ? e.key === 'Escape' : !root.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close, true);
    document.addEventListener('keydown', close, true);
    return () => { document.removeEventListener('pointerdown', close, true); document.removeEventListener('keydown', close, true); };
  }, [open]);

  useEffect(() => { try { localStorage.setItem('sketchizi.canvasView', mode); } catch { /* View preferences are optional. */ } }, [mode]);

  const fit = page => {
    if (!page || !api) return;
    activeIdRef.current = page.id;
    initialFitRef.current = true;
    setActiveId(page.id);
    // Keep the frame unselected: selecting the frame can capture pointer
    // interactions in Excalidraw and prevent the normal drawing/text tools
    // from starting strokes inside the page. The page boundary and resize
    // affordances are provided by the Pages overlay instead.
    api.updateScene({
      appState: { selectedElementIds: {}, selectedGroupIds: {} },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    api.scrollToContent?.([page], { fitToContent: true, animate: false });
    // Excalidraw's fit-to-content uses nearly all available canvas space.
    // Scale the fitted view down slightly and recenter it to retain a visible
    // workspace gutter around the page on every page switch and Fit page.
    window.requestAnimationFrame(() => {
      if (activeIdRef.current !== page.id) return;
      const fittedState = api.getAppState();
      const pageViewport = getPageFitViewport(page, fittedState, 0.82);
      if (pageViewport) {
        api.updateScene({
          appState: pageViewport,
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      }
    });
  };
  useEffect(() => {
    if (mode !== 'pages') { initialFitRef.current = false; return; }
    if (!active || !api || initialFitRef.current) return;
    fit(active);
  }, [api, mode, active?.id]);

  useEffect(() => {
    if (mode !== 'pages' || !activePageRef.current || !api) { setPageMask(null); return; }
    // Fit only when entering Pages mode or switching pages. Resizing updates
    // the active page dimensions on every pointer move; fitting on those
    // updates changes the zoom under the pointer and makes the page appear
    // to shrink while it is being dragged.
    const refresh = () => {
      const page = activePageRef.current;
      if (page) fit(page);
    };
    refresh();
    window.addEventListener('resize', refresh);
    return () => window.removeEventListener('resize', refresh);
  }, [api, mode, active?.id]);

  const startResize = (event, edge) => {
    if (!canEdit || !active || !api) return;
    event.preventDefault();
    event.stopPropagation();
    const start = { x: event.clientX, y: event.clientY };
    const original = { x: active.x, y: active.y, width: active.width, height: active.height };
    const pointerId = event.pointerId;
    const move = e => {
      if (e.pointerId !== pointerId) return;
      const zoom = Math.max(0.01, Number(api.getAppState()?.zoom?.value || 1));
      const dx = (e.clientX - start.x) / zoom;
      const dy = (e.clientY - start.y) / zoom;
      const horizontal = edge.includes('w') || edge.includes('e');
      const vertical = edge.includes('n') || edge.includes('s');
      const width = horizontal ? Math.max(320, Math.min(10000, original.width + (edge.includes('w') ? -dx : dx))) : original.width;
      const height = vertical ? Math.max(320, Math.min(10000, original.height + (edge.includes('n') ? -dy : dy))) : original.height;
      const x = edge.includes('w') ? original.x + original.width - width : original.x;
      const y = edge.includes('n') ? original.y + original.height - height : original.y;
      const elements = api.getSceneElementsIncludingDeleted().map(element => {
        if (element.id !== active.id && element.customData?.sketchiziPagePaper !== active.id) return element;
        return { ...element, x, y, width, height, version: (element.version || 0) + 1,
          versionNonce: Math.floor(Math.random() * 2147483647), updated: Date.now() };
      });
      api.updateScene({ elements, captureUpdate: CaptureUpdateAction.EVENTUALLY });
      const nextPage = { ...active, x, y, width, height };
      setPageMask(getPageViewportMask(nextPage, api.getAppState()));
      setPages(current => current.map(page => page.id === active.id ? nextPage : page));
    };
    const finish = e => {
      if (e.pointerId !== pointerId) return;
      window.removeEventListener('pointermove', move, true);
      window.removeEventListener('pointerup', finish, true);
      window.removeEventListener('pointercancel', finish, true);
      setResizeMode(false);
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', finish, true);
    window.addEventListener('pointercancel', finish, true);
  };

  const blockOutsidePage = event => { event.preventDefault(); event.stopPropagation(); };
  const update = elements => api.updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  const add = () => {
    if (!api || !canEdit) return;
    const elements = api.getSceneElementsIncludingDeleted();
    const responsiveSize = getResponsivePageSize(api.getAppState());
    if (!validSize(responsiveSize.width, responsiveSize.height)) { setError('The available canvas area is too small to create a page.'); return; }
    const nextOrder = getPages(elements).reduce((n, page) => Math.max(n, page.customData?.pageOrder || 0), 0) + 1;
    const name = window.prompt('Name your new page', `Page ${nextOrder}`);
    if (name === null) return;
    const pageName = name.trim().slice(0, 80) || `Page ${nextOrder}`;
    const created = convertToExcalidrawElements(pageSkeleton(elements, responsiveSize, crypto.randomUUID()), { regenerateIds: false });
    const frame = created.find(e => e.type === 'frame');
    if (frame) frame.name = pageName;
    update([...elements, ...created]);
    const currentView = api.getAppState?.();
    previousViewportRef.current = currentView ? { scrollX: currentView.scrollX, scrollY: currentView.scrollY, zoom: currentView.zoom } : null;
    setError(''); setMode('pages'); setOpen(false); fit(frame);
  };
  const changeMode = value => {
    if (value === 'pages' && !pages.length) { add(); return; }
    if (value === 'pages' && mode !== 'pages') {
      const currentView = api?.getAppState?.();
      previousViewportRef.current = currentView ? { scrollX: currentView.scrollX, scrollY: currentView.scrollY, zoom: currentView.zoom } : null;
    }
    setMode(value); setOpen(false);
    if (value === 'infinite') {
      setPageMask(null);
      activeIdRef.current = null;
      api?.updateScene({ appState: { selectedElementIds: {}, selectedGroupIds: {}, ...(previousViewportRef.current || {}) }, captureUpdate: CaptureUpdateAction.NEVER });
      previousViewportRef.current = null;
    }
    if (value === 'pages') fit(active);
  };
  const rename = page => {
    const name = window.prompt('Page name', page.name || 'Page');
    if (!name?.trim() || !canEdit) return;
    update(api.getSceneElementsIncludingDeleted().map(e => e.id === page.id ? { ...e, name: name.trim().slice(0,80), version: e.version + 1, versionNonce: Math.floor(Math.random()*2147483647), updated: Date.now() } : e));
  };
  const duplicate = page => {
    if (!canEdit) return;
    const elements = api.getSceneElementsIncludingDeleted();
    const copied = duplicatePage(elements, page.id, crypto.randomUUID());
    update([...elements,...copied]); fit(copied.find(e => e.type === 'frame'));
  };
  const move = (page, direction) => {
    if (!canEdit) return;
    const from = pages.findIndex(p => p.id === page.id), to = from + direction;
    if (to < 0 || to >= pages.length) return;
    const order = [...pages]; [order[from],order[to]] = [order[to],order[from]];
    update(api.getSceneElementsIncludingDeleted().map(e => {
      const i = order.findIndex(p => p.id === e.id);
      return i < 0 ? e : {...e, customData:{...e.customData,pageOrder:i+1}, version:e.version+1,versionNonce:Math.floor(Math.random()*2147483647),updated:Date.now()};
    }));
  };
  return <>
    {headerHost && createPortal(<div className="canvas-pages-control" ref={root}>
      <button type="button" className="canvas-pages-trigger" aria-label="Canvas options" title="Canvas options" aria-haspopup="dialog" aria-expanded={open} onClick={() => { setOpen(!open); setError(''); }}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6"/></svg>
      </button>
      {open && <div className="canvas-pages-menu" role="dialog" aria-label="Canvas options">
        <strong>Canvas</strong>
        <button type="button" aria-pressed={mode === 'infinite'} onClick={() => changeMode('infinite')}>∞ Infinite canvas<small>Draw without boundaries</small></button>
        <button type="button" disabled={!api || (!canEdit && !pages.length)} aria-pressed={mode === 'pages'} onClick={() => changeMode('pages')}>▧ Pages<small>Organize into separate pages</small></button>
        <small>Use the Resize control in the page toolbar to show page handles. New pages use the default page size.</small>
        {error && <p role="alert">{error}</p>}
      </div>}
    </div>, headerHost)}
    {mode === 'pages' && pageMask && host && createPortal(
      <div className="canvas-pages-mask">
        {pageMask.panels.map((panel, i) => <div className="canvas-pages-mask-panel" key={i} style={panel} onPointerDown={blockOutsidePage} onMouseDown={blockOutsidePage} onTouchStart={blockOutsidePage} onWheel={blockOutsidePage} onDragOver={blockOutsidePage} onDrop={blockOutsidePage} onContextMenu={blockOutsidePage} onDoubleClick={blockOutsidePage} />)}
        <div className="canvas-pages-page-surface" style={pageMask.pageRect} aria-hidden="true" />
        <div className="canvas-pages-page-outline" style={pageMask.pageRect} aria-hidden="true" />
        <div className="canvas-pages-page-name" style={{ left: pageMask.pageRect.left, top: Math.max(8, pageMask.pageRect.top - 25) }}>{active?.name || `Page ${index + 1}`}</div>
      </div>, host)}
    {mode === 'pages' && resizeMode && pageMask && host && createPortal(<>
      {['nw','n','ne','e','se','s','sw','w'].map(edge => {
        const rect = pageMask.pageRect;
        const positions = {
          nw: [rect.left, rect.top], n: [rect.left + rect.width / 2, rect.top],
          ne: [rect.left + rect.width, rect.top], e: [rect.left + rect.width, rect.top + rect.height / 2],
          se: [rect.left + rect.width, rect.top + rect.height], s: [rect.left + rect.width / 2, rect.top + rect.height],
          sw: [rect.left, rect.top + rect.height], w: [rect.left, rect.top + rect.height / 2],
        };
        const [left, top] = positions[edge];
        return <button key={edge} type="button" className={`canvas-pages-resize-handle is-${edge}`}
          style={{ left, top }} aria-label={`Resize page from ${edge.toUpperCase()} ${edge.length === 1 ? 'edge' : 'corner'}`}
          title="Drag to resize page" onPointerDown={event => startResize(event, edge)} />;
      })}
    </>,host)}
    {mode === 'pages' && host && createPortal(<>
      <nav className="canvas-pages-navigation" aria-label="Page navigation"><button type="button" disabled={index <= 0} onClick={() => fit(pages[index-1])}>‹</button><span>{index+1} / {pages.length}</span><button type="button" disabled={index < 0 || index >= pages.length-1} onClick={() => fit(pages[index+1])}>›</button><button type="button" disabled={!active || !canEdit} aria-pressed={resizeMode} onClick={() => setResizeMode(value => !value)}>{resizeMode ? 'Done' : 'Resize'}</button><button type="button" disabled={!active} onClick={() => { setResizeMode(false); fit(active); }}>Fit page</button><button type="button" disabled={!active || !canEdit} onClick={() => rename(active)}>Rename</button><button type="button" className="canvas-pages-add" aria-label="Add page" title="Add page" disabled={!canEdit} onClick={add}>＋</button></nav>
    </>,host)}
  </>;
}
