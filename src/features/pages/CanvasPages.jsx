import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CaptureUpdateAction, convertToExcalidrawElements } from '@excalidraw/excalidraw';
import { DEFAULT_PAGE_SIZE, PAGE_PRESETS, getPages, pageSkeleton, validSize, duplicatePage, getPageViewportMask, getPageFitViewport } from './pageModel.js';
import './pages.css';

export default function CanvasPages({ api, canEdit = true }) {
  const [open, setOpen] = useState(false);
  const [headerHost, setHeaderHost] = useState(null);
  const [mode, setMode] = useState(() => { try { return localStorage.getItem('sketchizi.canvasView') === 'pages' ? 'pages' : 'infinite'; } catch { return 'infinite'; } });
  const [pages, setPages] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [size, setSize] = useState(DEFAULT_PAGE_SIZE);
  const [error, setError] = useState('');
  const [pageMask, setPageMask] = useState(null);
  const activeIdRef = useRef(null);
  const initialFitRef = useRef(false);
  const previousViewportRef = useRef(null);
  const root = useRef(null);
  const signature = useRef('');
  const active = pages.find(p => p.id === activeId) || pages[0];
  const index = pages.findIndex(p => p.id === active?.id);
  const host = document.querySelector('.app');

  useEffect(() => {
    setHeaderHost(document.querySelector('.desktop-app-header-island-center'));
  }, []);

  useEffect(() => {
    if (!api) return;
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
      }
      const selected = next.find(p => p.id === activeIdRef.current) || next[0];
      if (selected && !activeIdRef.current) {
        activeIdRef.current = selected.id;
        setActiveId(selected.id);
      }
      setPageMask(mode === 'pages' ? getPageViewportMask(selected, appState || api.getAppState()) : null);
      const key = JSON.stringify(next.map(p => [p.id,p.version,p.name,p.width,p.height,p.customData.pageOrder]));
      if (signature.current !== key) { signature.current = key; setPages(next); }

    };
    sync(api.getSceneElements());
    const unsubscribe = api.onChange(sync);
    return () => { unsubscribe(); signature.current = ''; };
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
    if (mode !== 'pages' || !active || !api) { setPageMask(null); return; }
    const refresh = () => setPageMask(getPageViewportMask(active, api.getAppState()));
    refresh();
    window.addEventListener('resize', refresh);
    return () => window.removeEventListener('resize', refresh);
  }, [api, mode, active?.id, active?.x, active?.y, active?.width, active?.height]);

  const startResize = (event, corner) => {
    if (!canEdit || !active || !api) return;
    event.preventDefault();
    event.stopPropagation();
    const start = { x: event.clientX, y: event.clientY };
    const original = { x: active.x, y: active.y, width: active.width, height: active.height };
    const zoom = Math.max(0.01, Number(api.getAppState()?.zoom?.value || 1));
    const pointerId = event.pointerId;
    const move = e => {
      if (e.pointerId !== pointerId) return;
      const dx = (e.clientX - start.x) / zoom;
      const dy = (e.clientY - start.y) / zoom;
      const width = Math.max(320, Math.min(10000, original.width + (corner.includes('e') ? dx : -dx)));
      const height = Math.max(320, Math.min(10000, original.height + (corner.includes('s') ? dy : -dy)));
      const x = corner.includes('w') ? original.x + original.width - width : original.x;
      const y = corner.includes('n') ? original.y + original.height - height : original.y;
      const elements = api.getSceneElementsIncludingDeleted().map(e =>
        e.id === active.id || e.customData?.sketchiziPagePaper === active.id
          ? { ...e, x, y, width, height, version: e.version + 1, versionNonce: Math.floor(Math.random() * 2147483647), updated: Date.now() }
          : e
      );
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
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', finish, true);
    window.addEventListener('pointercancel', finish, true);
  };

  const update = elements => api.updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  const add = () => {
    if (!api || !canEdit) return;
    if (!validSize(Number(size.width), Number(size.height))) { setError('Use dimensions between 320 and 10,000 pixels.'); return; }
    const elements = api.getSceneElementsIncludingDeleted();
    const nextOrder = getPages(elements).reduce((n, page) => Math.max(n, page.customData?.pageOrder || 0), 0) + 1;
    const name = window.prompt('Name your new page', `Page ${nextOrder}`);
    if (name === null) return;
    const pageName = name.trim().slice(0, 80) || `Page ${nextOrder}`;
    const created = convertToExcalidrawElements(pageSkeleton(elements, { width: Number(size.width), height: Number(size.height) }, crypto.randomUUID()), { regenerateIds: false });
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
  const resize = () => {
    const width = Number(size.width), height = Number(size.height);
    if (!canEdit || !active) return;
    if (!validSize(width,height)) { setError('Use dimensions between 320 and 10,000 pixels.'); return; }
    const elements = api.getSceneElementsIncludingDeleted();
    const outside = elements.some(e => !e.isDeleted && e.frameId === active.id && !e.customData?.sketchiziPagePaper && (e.x < active.x || e.y < active.y || e.x + e.width > active.x + width || e.y + e.height > active.y + height));
    const overlaps = pages.some(p => p.id !== active.id && active.x < p.x+p.width && active.x+width > p.x && active.y < p.y+p.height && active.y+height > p.y);
    if (overlaps) { setError('This size would overlap another page. Move that page first or choose a smaller size.'); return; }
    if (outside) { setError('This size would clip artwork. Choose a larger page.'); return; }
    update(elements.map(e => e.id === active.id || e.customData?.sketchiziPagePaper === active.id ? { ...e, width, height, version: e.version + 1, versionNonce: Math.floor(Math.random()*2147483647), updated: Date.now() } : e));
    setError(''); fit({ ...active,width,height });
  };
  return <>
    {headerHost && createPortal(<div className="canvas-pages-control" ref={root}>
      <button type="button" className="canvas-pages-trigger" aria-label="Canvas options" title="Canvas options" aria-haspopup="dialog" aria-expanded={open} onClick={() => { setOpen(!open); setError(''); if (active) setSize({width:active.width,height:active.height}); }}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><path d="M6 3h8l4 4v14H6zM14 3v5h4M9 12h6M9 16h6"/></svg>
      </button>
      {open && <div className="canvas-pages-menu" role="dialog" aria-label="Canvas options">
        <strong>Canvas</strong>
        <button type="button" aria-pressed={mode === 'infinite'} onClick={() => changeMode('infinite')}>∞ Infinite canvas<small>Draw without boundaries</small></button>
        <button type="button" disabled={!api || (!canEdit && !pages.length)} aria-pressed={mode === 'pages'} onClick={() => changeMode('pages')}>▧ Pages<small>Organize into separate pages</small></button>
        <label>Page size<select aria-label="Page size" onChange={e => { if (PAGE_PRESETS[e.target.value]) setSize(PAGE_PRESETS[e.target.value]); }} value={Object.keys(PAGE_PRESETS).find(k => PAGE_PRESETS[k].width === Number(size.width) && PAGE_PRESETS[k].height === Number(size.height)) || 'Custom'}>{[...Object.keys(PAGE_PRESETS),'Custom'].map(k => <option key={k}>{k}</option>)}</select></label>
        {['width','height'].map(key => <label key={key}>{key === 'width' ? 'Width (px)' : 'Height (px)'}<input aria-label={`Page ${key}`} type="number" min="320" max="10000" value={size[key]} onChange={e => setSize({...size,[key]:e.target.value})}/></label>)}
        {mode === 'pages' && active && <button type="button" disabled={!canEdit} onClick={resize}>Apply size to current page</button>}
        <small>Existing artwork stays intact. New pages are added beside it.</small>
        {error && <p role="alert">{error}</p>}
      </div>}
    </div>, headerHost)}
    {mode === 'pages' && pageMask && host && createPortal(
      <div className="canvas-pages-mask">
        {pageMask.panels.map((panel, i) => <div className="canvas-pages-mask-panel" key={i} style={panel} />)}
        <div className="canvas-pages-page-grid" style={pageMask.pageRect} aria-hidden="true" />
        <div className="canvas-pages-page-outline" style={pageMask.pageRect} aria-hidden="true" />
        <div className="canvas-pages-page-name" style={{ left: pageMask.pageRect.left, top: Math.max(8, pageMask.pageRect.top - 25) }}>{active?.name || `Page ${index + 1}`}</div>
        {['nw','ne','sw','se'].map(corner => <button key={corner} type="button" className={`canvas-pages-resize-handle is-${corner}`} style={{
          left: corner.includes('w') ? pageMask.pageRect.left : pageMask.pageRect.left + pageMask.pageRect.width,
          top: corner.includes('n') ? pageMask.pageRect.top : pageMask.pageRect.top + pageMask.pageRect.height,
        }} aria-label={`Resize page from ${corner.toUpperCase()} corner`} title="Drag to resize page" onPointerDown={event => startResize(event, corner)} />)}
      </div>, host)}
    {mode === 'pages' && host && createPortal(<>
      <nav className="canvas-pages-navigation" aria-label="Page navigation"><button type="button" disabled={index <= 0} onClick={() => fit(pages[index-1])}>‹</button><span>{index+1} / {pages.length}</span><button type="button" disabled={index < 0 || index >= pages.length-1} onClick={() => fit(pages[index+1])}>›</button><button type="button" disabled={!active} onClick={() => fit(active)}>Fit page</button><button type="button" className="canvas-pages-add" aria-label="Add page" title="Add page" disabled={!canEdit} onClick={add}>＋</button></nav>
    </>,host)}
  </>;
}
