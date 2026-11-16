import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CaptureUpdateAction, convertToExcalidrawElements } from '@excalidraw/excalidraw';
import { getPages, pageSkeleton, validSize, duplicatePage, getPageViewportMask, getPageFitViewport, getResponsivePageSize, isElementWithinPage, PAGE_MARKER } from './pageModel.js';
import { canvasColorForDisplay, canvasColorForScene } from '../navigation/canvasColors.js';
import { getCanvasBackground } from '../navigation/canvasTheme.js';
import './pages.css';

const PAGE_WORKSPACE_TINT = 0.25;

function mixHexColors(baseColor, tintColor, tintAmount) {
  const base = baseColor.match(/^#([\da-f]{6})$/i)?.[1];
  const tint = tintColor.match(/^#([\da-f]{6})$/i)?.[1];
  if (!base || !tint) return baseColor;
  const channels = [0, 2, 4].map(offset => {
    const baseChannel = Number.parseInt(base.slice(offset, offset + 2), 16);
    const tintChannel = Number.parseInt(tint.slice(offset, offset + 2), 16);
    return Math.round(baseChannel * (1 - tintAmount) + tintChannel * tintAmount)
      .toString(16)
      .padStart(2, '0');
  });
  return `#${channels.join('')}`;
}

function getPagePaperBackground(appState) {
  const isDarkTheme = appState?.theme === 'dark';
  const savedCanvasColor = String(appState?.viewBackgroundColor || getCanvasBackground(isDarkTheme)).toLowerCase();
  const visibleCanvasColor = canvasColorForDisplay(savedCanvasColor, isDarkTheme);
  const workspaceColor = isDarkTheme ? '#111820' : '#f7f9fc';
  const tintedColor = mixHexColors(visibleCanvasColor, workspaceColor, PAGE_WORKSPACE_TINT);
  return canvasColorForScene(tintedColor, isDarkTheme);
}

function runAfterCanvasLayoutSettles(api, callback) {
  let frame = 0;
  let attempts = 0;
  let stableFrames = 0;
  let previousSize = '';

  const measure = () => {
    attempts += 1;
    const appState = api.getAppState?.() || {};
    const canvasBounds = document.querySelector('.desktop-canvas-region')?.getBoundingClientRect();
    const size = [
      appState.width,
      appState.height,
      canvasBounds?.width,
      canvasBounds?.height,
    ].map(value => Number(value || 0).toFixed(2)).join(':');
    stableFrames = size === previousSize ? stableFrames + 1 : 0;
    previousSize = size;

    if (stableFrames >= 2 || attempts >= 12) {
      callback(appState);
      return;
    }
    frame = window.requestAnimationFrame(measure);
  };

  frame = window.requestAnimationFrame(measure);
  return () => window.cancelAnimationFrame(frame);
}

export default function CanvasPages({ api, canEdit = true, aiPanelOpen = false, onPageContextChange }) {
  const [open, setOpen] = useState(false);
  const [headerHost, setHeaderHost] = useState(null);
  const [mode, setMode] = useState(() => { try { return localStorage.getItem('sketchizi.canvasView') === 'pages' ? 'pages' : 'infinite'; } catch { return 'infinite'; } });
  const [pages, setPages] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [error, setError] = useState('');
  const [pageMask, setPageMask] = useState(null);
  const [revealedResizeEdge, setRevealedResizeEdge] = useState(null);
  const [inlineName, setInlineName] = useState(null);
  const inlineNameInputRef = useRef(null);
  const cancelInlineNameRef = useRef(false);
  const touchResizeTimerRef = useRef(null);
  const activeIdRef = useRef(null);
  const initialFitRef = useRef(false);
  const previousViewportRef = useRef(null);
  const panelViewportRef = useRef(null);
  const panelPageBoundsRef = useRef(null);
  const panelWasOpenRef = useRef(false);
  const panelViewportInteractionRef = useRef(false);
  const spacePanHeldRef = useRef(false);
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
      const pagePaperBackground = getPagePaperBackground(appState || api.getAppState?.());
      // Native frame dragging/resizing must carry its paper surface too.
      const repairs = new Map();
      if (canEdit) for (const e of elements) {
        if (e.isDeleted || !e.customData?.sketchiziPagePaper) continue;
        const frame = next.find(p => p.id === e.customData.sketchiziPagePaper);
        const paperColorChanged = String(e.backgroundColor || '').toLowerCase() !== pagePaperBackground;
        if (frame && (['x','y','width','height'].some(k => frame[k] !== e[k]) || paperColorChanged || e.strokeColor !== 'transparent')) {
          repairs.set(e.id, {...e, x:frame.x,y:frame.y,width:frame.width,height:frame.height,backgroundColor:pagePaperBackground,strokeColor:'transparent',version:e.version+1,versionNonce:Math.floor(Math.random()*2147483647),updated:Date.now()});
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
    const close = e => {
      if (e.type === 'keydown') {
        if (e.key !== 'Escape') return;
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation?.();
        setOpen(false);
        return;
      }
      if (!root.current?.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', close, true);
    window.addEventListener('keydown', close, true);
    return () => { document.removeEventListener('pointerdown', close, true); window.removeEventListener('keydown', close, true); };
  }, [open]);

  useEffect(() => { try { localStorage.setItem('sketchizi.canvasView', mode); } catch { /* View preferences are optional. */ } }, [mode]);
  useEffect(() => {
    const page = mode === 'pages' && active ? {
      id: active.id,
      name: active.name || `Page ${index + 1}`,
      order: active.customData?.pageOrder ?? index + 1,
    } : null;
    onPageContextChange?.({ mode, page, pageCount: pages.length });
  }, [active?.id, active?.name, active?.customData?.pageOrder, index, mode, onPageContextChange, pages.length]);
  useEffect(() => {
    setRevealedResizeEdge(null);
    window.clearTimeout(touchResizeTimerRef.current);
  }, [mode, active?.id]);
  useEffect(() => () => window.clearTimeout(touchResizeTimerRef.current), []);

  // Keep the canvas mode available to CSS so navigation controls can adopt
  // the visual treatment chosen for Pages or the infinite canvas.
  useEffect(() => {
    if (host) host.dataset.canvasView = mode;
  }, [host, mode]);
  useEffect(() => () => {
    if (host?.dataset.canvasView) delete host.dataset.canvasView;
  }, [host]);

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
      const pageViewport = getPageFitViewport(page, fittedState, 1);
      if (pageViewport) {
        api.updateScene({
          appState: pageViewport,
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      }
    });
  };
  const fitViewportToPage = page => {
    if (!page || !api) return;
    api.scrollToContent?.([page], { fitToContent: true, animate: false });
    window.requestAnimationFrame(() => {
      const fittedState = api.getAppState();
      const pageViewport = getPageFitViewport(page, fittedState, 1);
      if (pageViewport) api.updateScene({ appState: pageViewport, captureUpdate: CaptureUpdateAction.NEVER });
    });
  };

  useEffect(() => {
    const wasOpen = panelWasOpenRef.current;
    panelWasOpenRef.current = aiPanelOpen;
    if (!api || wasOpen === aiPanelOpen) return undefined;

    if (aiPanelOpen) {
      if (mode !== 'pages' || !activePageRef.current) return undefined;
      const state = api.getAppState?.();
      const page = activePageRef.current;
      panelViewportRef.current = state ? {
        scrollX: state.scrollX,
        scrollY: state.scrollY,
        zoom: state.zoom,
      } : null;
      panelPageBoundsRef.current = { id: page.id, x: page.x, y: page.y, width: page.width, height: page.height };
      panelViewportInteractionRef.current = false;

      const canvasRegion = document.querySelector('.desktop-canvas-region');
      const isCanvasTarget = target => target instanceof Element && canvasRegion?.contains(target);
      const markWheelNavigation = event => {
        if (isCanvasTarget(event.target)) panelViewportInteractionRef.current = true;
      };
      const markPointerNavigation = event => {
        if (!isCanvasTarget(event.target)) return;
        const stateAtPointer = api.getAppState?.();
        const target = event.target instanceof Element ? event.target : null;
        const zoomControl = target?.closest('.zoom-actions, .zoom-in, .zoom-out, .reset-zoom');
        if (zoomControl || event.pointerType === 'touch' || event.button === 1 ||
            spacePanHeldRef.current || stateAtPointer?.activeTool?.type === 'hand') {
          panelViewportInteractionRef.current = true;
        }
      };
      const markPageNavigation = event => {
        const target = event.target instanceof Element ? event.target : null;
        if (target?.closest('.canvas-pages-navigation')) panelViewportInteractionRef.current = true;
      };
      const markKeyboardNavigation = event => {
        if (event.code === 'Space') spacePanHeldRef.current = true;
        if (['+', '=', '-', '_', '0'].includes(event.key) && (event.ctrlKey || event.metaKey || event.shiftKey)) {
          panelViewportInteractionRef.current = true;
        }
      };
      const releaseSpacePan = event => {
        if (event.code === 'Space') spacePanHeldRef.current = false;
      };
      const releaseSpaceOnBlur = () => { spacePanHeldRef.current = false; };
      canvasRegion?.addEventListener('wheel', markWheelNavigation, { capture: true, passive: true });
      canvasRegion?.addEventListener('pointerdown', markPointerNavigation, true);
      document.addEventListener('pointerdown', markPageNavigation, true);
      window.addEventListener('keydown', markKeyboardNavigation, true);
      window.addEventListener('keyup', releaseSpacePan, true);
      window.addEventListener('blur', releaseSpaceOnBlur);
      const cancelOpenFit = runAfterCanvasLayoutSettles(api, () => fitViewportToPage(activePageRef.current));
      return () => {
        cancelOpenFit();
        canvasRegion?.removeEventListener('wheel', markWheelNavigation, true);
        canvasRegion?.removeEventListener('pointerdown', markPointerNavigation, true);
        document.removeEventListener('pointerdown', markPageNavigation, true);
        window.removeEventListener('keydown', markKeyboardNavigation, true);
        window.removeEventListener('keyup', releaseSpacePan, true);
        window.removeEventListener('blur', releaseSpaceOnBlur);
      };
    }

    const previousViewport = panelViewportRef.current;
    const previousPageBounds = panelPageBoundsRef.current;
    const userChangedViewport = panelViewportInteractionRef.current;
    panelViewportRef.current = null;
    panelPageBoundsRef.current = null;
    panelViewportInteractionRef.current = false;
    spacePanHeldRef.current = false;
    if (mode !== 'pages' || !previousViewport) return undefined;
    return runAfterCanvasLayoutSettles(api, currentState => {
      const currentPage = activePageRef.current;
      const pageUnchanged = currentPage && previousPageBounds && currentPage.id === previousPageBounds.id &&
        ['x', 'y', 'width', 'height'].every(key => currentPage[key] === previousPageBounds[key]);
      const previousZoom = Number(previousViewport.zoom?.value ?? previousViewport.zoom ?? 1);
      const centeredViewport = !userChangedViewport && pageUnchanged
        ? getPageFitViewport(currentPage, currentState, previousZoom)
        : null;

      if (centeredViewport) {
        const nextViewport = {
          zoom: { value: previousZoom },
          scrollX: centeredViewport.scrollX,
          scrollY: centeredViewport.scrollY,
        };
        api.updateScene({ appState: nextViewport, captureUpdate: CaptureUpdateAction.NEVER });
        setPageMask(getPageViewportMask(currentPage, { ...currentState, ...nextViewport }));
        return;
      }
      setPageMask(getPageViewportMask(currentPage, currentState));
    });
  }, [aiPanelOpen, api, mode]);

  useEffect(() => {
    if (mode !== 'pages') {
      panelViewportRef.current = null;
      panelPageBoundsRef.current = null;
    }
  }, [mode]);

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
    };
    window.addEventListener('pointermove', move, true);
    window.addEventListener('pointerup', finish, true);
    window.addEventListener('pointercancel', finish, true);
  };

  const handleResizePointerDown = (event, edge) => {
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (event.pointerType === 'touch' && revealedResizeEdge !== edge) {
      event.preventDefault();
      event.stopPropagation();
      setRevealedResizeEdge(edge);
      window.clearTimeout(touchResizeTimerRef.current);
      touchResizeTimerRef.current = window.setTimeout(() => setRevealedResizeEdge(null), 3000);
      return;
    }
    window.clearTimeout(touchResizeTimerRef.current);
    setRevealedResizeEdge(null);
    startResize(event, edge);
  };

  const blockOutsidePage = event => { event.preventDefault(); event.stopPropagation(); };
  const update = elements => api.updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  const createPage = () => {
    if (!api || !canEdit) return;
    const elements = api.getSceneElementsIncludingDeleted();
    const appState = api.getAppState();
    const responsiveSize = getResponsivePageSize(appState);
    if (!validSize(responsiveSize.width, responsiveSize.height)) { setError('The available canvas area is too small to create a page.'); return; }
    const nextOrder = getPages(elements).reduce((n, page) => Math.max(n, page.customData?.pageOrder || 0), 0) + 1;
    const paperBackground = getPagePaperBackground(appState);
    const created = convertToExcalidrawElements(pageSkeleton(elements, responsiveSize, crypto.randomUUID(), paperBackground), { regenerateIds: false });
    const frame = created.find(e => e.type === 'frame');
    if (frame) frame.name = `Page ${nextOrder}`;
    update([...elements, ...created]);
    const currentView = api.getAppState?.();
    previousViewportRef.current = currentView ? { scrollX: currentView.scrollX, scrollY: currentView.scrollY, zoom: currentView.zoom } : null;
    setError(''); setMode('pages'); setOpen(false); fit(frame);
  };
  const add = () => {
    setOpen(false);
    createPage();
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
    if (!page || !canEdit) return;
    setInlineName({ pageId: page.id, value: page.name || 'Page' });
  };
  const saveInlineName = () => {
    if (cancelInlineNameRef.current) { cancelInlineNameRef.current = false; return; }
    if (!inlineName || !canEdit) return setInlineName(null);
    const value = inlineName.value.trim().slice(0, 80);
    if (value && value !== (pages.find(page => page.id === inlineName.pageId)?.name || 'Page')) {
      update(api.getSceneElementsIncludingDeleted().map(e => e.id === inlineName.pageId ? { ...e, name: value, version: e.version + 1, versionNonce: Math.floor(Math.random()*2147483647), updated: Date.now() } : e));
    }
    setInlineName(null);
  };
  useEffect(() => {
    if (!inlineName?.pageId) return undefined;
    const finishRenameOnOutsideClick = (event) => {
      const input = inlineNameInputRef.current;
      if (!input || input.contains(event.target)) return;
      // Canvas clicks do not necessarily move focus, so explicitly blur the
      // editor to commit the name before the outside action continues.
      input.blur();
    };
    document.addEventListener('pointerdown', finishRenameOnOutsideClick, true);
    return () => document.removeEventListener('pointerdown', finishRenameOnOutsideClick, true);
  }, [inlineName?.pageId]);
  const duplicate = page => {
    if (!canEdit) return;
    const elements = api.getSceneElementsIncludingDeleted();
    const copied = duplicatePage(elements, page.id, crypto.randomUUID());
    update([...elements,...copied]); fit(copied.find(e => e.type === 'frame'));
  };
  const deletePage = page => {
    if (!page || !canEdit || !api) return;
    const remainingPages = pages.filter(item => item.id !== page.id);
    const nextPage = remainingPages[Math.min(Math.max(index, 0), remainingPages.length - 1)];
    const elements = api.getSceneElementsIncludingDeleted().map(element => {
      if (element.id === page.id || element.frameId === page.id ||
          element.customData?.sketchiziPagePaper === page.id) {
        if (element.isDeleted) return element;
        return { ...element, isDeleted: true, version: (element.version || 0) + 1,
          versionNonce: Math.floor(Math.random() * 2147483647), updated: Date.now() };
      }
      const orderIndex = remainingPages.findIndex(item => item.id === element.id);
      if (orderIndex >= 0 && element.customData?.pageOrder !== orderIndex + 1) {
        return { ...element, customData: { ...element.customData, pageOrder: orderIndex + 1 },
          version: (element.version || 0) + 1, versionNonce: Math.floor(Math.random() * 2147483647), updated: Date.now() };
      }
      return element;
    });
    setInlineName(null);
    update(elements);
    if (nextPage) {
      fit(nextPage);
    } else {
      setPageMask(null);
      activeIdRef.current = null;
      setActiveId(null);
      setMode('infinite');
      api.updateScene({
        appState: { selectedElementIds: {}, selectedGroupIds: {}, ...(previousViewportRef.current || {}) },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
      previousViewportRef.current = null;
    }
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
      <button
        type="button"
        className="canvas-pages-trigger"
        aria-label={`Canvas mode: ${mode === 'pages' ? 'Pages' : 'Infinite canvas'}. Open canvas options`}
        title={`Canvas mode: ${mode === 'pages' ? 'Pages' : 'Infinite canvas'}`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => { setOpen(!open); setError(''); }}
      >
        <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          {mode === 'pages'
            ? <><path d="M7.5 7.5h9v9h-9z"/><path d="M8 5H5v3M16 5h3v3M19 16v3h-3M8 19H5v-3"/></>
            : <path d="M6.5 16.5c4.5 0 7-9 11-9a4.5 4.5 0 0 1 0 9c-4 0-6.5-9-11-9a4.5 4.5 0 0 0 0 9Z"/>}
        </svg>
      </button>
      {open && <div className="canvas-pages-menu" role="dialog" aria-label="Canvas options">
        <strong>Canvas</strong>
        <button type="button" aria-pressed={mode === 'infinite'} onClick={() => changeMode('infinite')}>∞ Infinite canvas<small>Draw without boundaries</small></button>
        <button type="button" disabled={!api || (!canEdit && !pages.length)} aria-pressed={mode === 'pages'} onClick={() => changeMode('pages')}>▧ Pages<small>Organize into separate pages</small></button>
        <small>Hover near a page edge to reveal its grip and drag to extend. On touch, tap near an edge to reveal its grip. Drag a corner to adjust both dimensions.</small>
        {error && <p role="alert">{error}</p>}
      </div>}
    </div>, headerHost)}
    {mode === 'pages' && pageMask && host && createPortal(
      <div className="canvas-pages-mask">
        {pageMask.panels.map((panel, i) => <div className="canvas-pages-mask-panel" key={i} style={panel} onPointerDown={blockOutsidePage} onMouseDown={blockOutsidePage} onTouchStart={blockOutsidePage} onWheel={blockOutsidePage} onDragOver={blockOutsidePage} onDrop={blockOutsidePage} onContextMenu={blockOutsidePage} onDoubleClick={blockOutsidePage} />)}
        <div className="canvas-pages-page-surface" style={pageMask.pageRect} aria-hidden="true" />
        <div className="canvas-pages-page-outline" style={pageMask.pageRect} aria-hidden="true" />
      </div>, host)}
    {mode === 'pages' && pageMask && host && createPortal(
      inlineName?.pageId === active?.id ? <input
        ref={inlineNameInputRef}
        className="canvas-pages-page-name-input"
        style={{ left: pageMask.pageRect.left, top: Math.max(8, pageMask.pageRect.top - 31) }}
        aria-label="Edit page name"
        autoFocus
        maxLength={80}
        value={inlineName.value}
        onChange={event => setInlineName(current => ({ ...current, value: event.target.value }))}
        onBlur={saveInlineName}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } if (event.key === 'Escape') { event.preventDefault(); cancelInlineNameRef.current = true; setInlineName(null); } }}
      /> : <button type="button" className="canvas-pages-page-name" style={{ left: pageMask.pageRect.left, top: Math.max(8, pageMask.pageRect.top - 25) }} disabled={!active || !canEdit} onClick={() => active && rename(active)} title={canEdit ? 'Click to rename page' : active?.name}>{active?.name || `Page ${index + 1}`}</button>,
      host,
    )}
    {mode === 'pages' && canEdit && active && pageMask && host && createPortal(<>
      {['nw','n','ne','e','se','s','sw','w'].map(edge => {
        const rect = pageMask.pageRect;
        const reach = 28;
        const inset = reach / 2;
        const positions = {
          nw: { left: rect.left - reach, top: rect.top - reach, width: reach, height: reach },
          n: { left: rect.left + inset, top: rect.top - reach, width: Math.max(0, rect.width - reach), height: reach },
          ne: { left: rect.left + rect.width, top: rect.top - reach, width: reach, height: reach },
          e: { left: rect.left + rect.width, top: rect.top + inset, width: reach, height: Math.max(0, rect.height - reach) },
          se: { left: rect.left + rect.width, top: rect.top + rect.height, width: reach, height: reach },
          s: { left: rect.left + inset, top: rect.top + rect.height, width: Math.max(0, rect.width - reach), height: reach },
          sw: { left: rect.left - reach, top: rect.top + rect.height, width: reach, height: reach },
          w: { left: rect.left - reach, top: rect.top + inset, width: reach, height: Math.max(0, rect.height - reach) },
        };
        const isCorner = edge.length === 2;
        const label = isCorner
          ? `Drag page from ${edge.toUpperCase()} corner to adjust width and height`
          : `Drag page ${edge === 'n' || edge === 's' ? 'edge to adjust height' : 'edge to adjust width'}`;
        return <button
          key={edge}
          type="button"
          className={`canvas-pages-resize-hit is-${edge}${revealedResizeEdge === edge ? ' is-revealed' : ''}`}
          style={positions[edge]}
          aria-label={label}
          title={label}
          onPointerDown={event => handleResizePointerDown(event, edge)}
          onContextMenu={event => event.preventDefault()}
        />;
      })}
    </>,host)}
    {mode === 'pages' && host && createPortal(<>
      <nav className="canvas-pages-navigation" aria-label="Page navigation"><button type="button" disabled={index <= 0} onClick={() => fit(pages[index-1])}>‹</button><span>{index+1} / {pages.length}</span><button type="button" disabled={index < 0 || index >= pages.length-1} onClick={() => fit(pages[index+1])}>›</button><button type="button" disabled={!active} onClick={() => fit(active)}>Fit page</button><button type="button" className="canvas-pages-delete" disabled={!active || !canEdit} onClick={() => deletePage(active)}>Delete</button><button type="button" className="canvas-pages-add" aria-label="Add page" title="Add page" disabled={!canEdit} onClick={add}>＋</button></nav>
    </>,host)}
  </>;
}
