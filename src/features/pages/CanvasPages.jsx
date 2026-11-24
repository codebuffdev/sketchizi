import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CaptureUpdateAction, convertToExcalidrawElements } from '@excalidraw/excalidraw';
import { getPages, pageSkeleton, validSize, duplicatePage, getPageViewportMask, getPageFitViewport, isElementWithinPage, PAGE_MARKER } from './pageModel.js';
import './pages.css';
import PagesBookWorkspace from './PagesBookWorkspace.jsx';

function getPagePaperBackground(appState, isPagesMode = false) {
  if (isPagesMode) {
    // The paper is CSS-painted beneath Excalidraw's native drawing canvas.
    return 'transparent';
  }
  // Restore a normal native paper fill when the user returns to Infinite mode.
  return appState?.theme === 'dark' ? '#111827' : '#ffffff';
}

function requestExcalidrawCanvasRefresh() {
  window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
    window.dispatchEvent(new Event('resize'));
  }));
}

function getFullBleedPageSize() {
  return {
    width: Math.max(320, Math.round(window.innerWidth)),
    height: Math.max(320, Math.round(window.innerHeight)),
  };
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

export default function CanvasPages({ api, workspaceMode = "infinite", canEdit = true, aiPanelOpen = false, onPageContextChange, bookTitle, onRenameBookTitle, onDeleteOnlyPage }) {
  const [mode, setMode] = useState(() => workspaceMode === "pages" ? "pages" : "infinite");
  const [pages, setPages] = useState([]);
  const [canvasTheme, setCanvasTheme] = useState(() => api?.getAppState?.()?.theme || "light");
  const [activeId, setActiveId] = useState(null);
  const [error, setError] = useState('');
  const [pageMask, setPageMask] = useState(null);
  const [inlineName, setInlineName] = useState(null);
  const [chapterIndexOpen, setChapterIndexOpen] = useState(false);
  const chapterIndexRef = useRef(null);
  const inlineNameInputRef = useRef(null);
  const cancelInlineNameRef = useRef(false);
  const activeIdRef = useRef(null);
  const initialFitRef = useRef(false);
  const previousViewBackgroundRef = useRef(null);
  const previousViewportRef = useRef(null);
  const panelViewportRef = useRef(null);
  const panelPageBoundsRef = useRef(null);
  const panelWasOpenRef = useRef(false);
  const panelViewportInteractionRef = useRef(false);
  const spacePanHeldRef = useRef(false);
  const signature = useRef('');
  const sceneSnapshot = useRef(null);
  const fallbackPage = mode === "pages" && pages.length === 0 ? {
    id: "pages-loading-placeholder",
    type: "frame",
    name: "Untitled Page",
    x: 0,
    y: 0,
    width: Math.max(320, Math.round(window.innerWidth || DEFAULT_PAGE_SIZE.width)),
    height: Math.max(320, Math.round(window.innerHeight || DEFAULT_PAGE_SIZE.height)),
    customData: { [PAGE_MARKER]: true, pageOrder: 1, chapterTitle: "Untitled Page", paperTexture: "dots" },
  } : null;
  const displayPages = pages.length ? pages : (fallbackPage ? [fallbackPage] : []);
  const active = pages.find(p => p.id === activeId) || pages[0] || fallbackPage;
  const activePageRef = useRef(active);
  activePageRef.current = active;
  const index = Math.max(0, pages.findIndex(p => p.id === active?.id));
  const host = document.querySelector('.app');
  const pageMaskForRender = pageMask || (fallbackPage ? {
    backgroundColor: canvasTheme === "dark" ? "#111820" : "#f7f9fc",
    pageRect: { left: 0, top: 0, width: fallbackPage.width, height: fallbackPage.height },
    panels: [],
  } : null);

  useEffect(() => {
    if (!api) return;
    sceneSnapshot.current = api.getSceneElementsIncludingDeleted();
    const sync = (elements, appState) => {
      const next = getPages(elements);
      const nextTheme = appState?.theme || api.getAppState?.()?.theme || "light";
      setCanvasTheme(current => current === nextTheme ? current : nextTheme);
      const pagePaperBackground = getPagePaperBackground(appState || api.getAppState?.(), mode === 'pages');
      // Native frame dragging/resizing must carry its paper surface too.
      const repairs = new Map();
      for (const e of elements) {
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
      const persistedActiveId = next.find(page => page.customData?.activeChapterId)?.customData?.activeChapterId;
      const selected = next.find(p => p.id === activeIdRef.current) || next.find(p => p.id === persistedActiveId) || next[0];
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
          const changedKeys = [...new Set([...Object.keys(before), ...Object.keys(element)])]
            .filter(key => !['version','versionNonce','updated','index'].includes(key))
            .filter(key => JSON.stringify(before[key]) !== JSON.stringify(element[key]));
          if (!changedKeys.length) return element;
          // Moving an inactive chapter to its parking coordinate is a layout
          // operation, not an edit to that chapter's isolated scene.
          if (before.frameId && next.some(page => page.id === before.frameId) &&
              before.frameId === element.frameId &&
              changedKeys.every(key => key === 'x' || key === 'y')) return element;
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
    sync(api.getSceneElements(), api.getAppState?.());
    const unsubscribe = api.onChange(sync);
    return () => { unsubscribe(); signature.current = ''; sceneSnapshot.current = null; };
  }, [api, canEdit, mode]);

  useEffect(() => { try { localStorage.setItem('sketchizi.canvasView', mode); } catch { /* View preferences are optional. */ } }, [mode]);

  // Let the paper sheet show through Excalidraw's drawing canvas. Restore the
  // user's normal canvas background when leaving Pages mode.
  useEffect(() => {
    if (!api || mode !== 'pages') return undefined;
    const appState = api.getAppState?.() || {};
    const sceneElements = api.getSceneElementsIncludingDeleted();
    const savedBackground = sceneElements.find(element =>
      element.type === 'frame' && element.customData?.[PAGE_MARKER] &&
      typeof element.customData?.pagesPreviousViewBackgroundColor === 'string'
    )?.customData?.pagesPreviousViewBackgroundColor;
    const fallbackBackground = appState.theme === 'dark' ? '#121212' : '#ffffff';
    const previousBackground = appState.viewBackgroundColor && appState.viewBackgroundColor !== 'transparent'
      ? appState.viewBackgroundColor
      : (savedBackground || fallbackBackground);
    previousViewBackgroundRef.current = { color: previousBackground, theme: appState.theme };
    const nextElements = sceneElements.map(element => {
      if (element.type !== 'frame' || !element.customData?.[PAGE_MARKER] ||
          element.customData.pagesPreviousViewBackgroundColor === previousBackground) return element;
      return {
        ...element,
        customData: { ...element.customData, pagesPreviousViewBackgroundColor: previousBackground },
        version: (element.version || 0) + 1,
        versionNonce: Math.floor(Math.random() * 2147483647),
        updated: Date.now(),
      };
    });
    if (nextElements.some((element, index) => element !== sceneElements[index])) {
      api.updateScene({ elements: nextElements, captureUpdate: CaptureUpdateAction.NEVER });
    }
    api.updateScene({
      appState: { viewBackgroundColor: 'transparent' },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    requestExcalidrawCanvasRefresh();
    return () => {
      const previous = previousViewBackgroundRef.current;
      if (previous) {
        const currentTheme = api.getAppState?.()?.theme;
        const restoreBackground = currentTheme && previous.theme && currentTheme !== previous.theme
          ? (currentTheme === 'dark' ? '#121212' : '#ffffff')
          : previous.color;
        api.updateScene({
          appState: { viewBackgroundColor: restoreBackground },
          captureUpdate: CaptureUpdateAction.NEVER,
        });
        previousViewBackgroundRef.current = null;
      }
    };
  }, [api, mode]);

  // Reassert a transparent Excalidraw paper after chapter or theme changes.
  useEffect(() => {
    if (!api || mode !== "pages") return;
    if (api.getAppState?.()?.viewBackgroundColor !== "transparent") {
      api.updateScene({
        appState: { viewBackgroundColor: "transparent" },
        captureUpdate: CaptureUpdateAction.NEVER,
      });
    }
  }, [api, mode, active?.id, canvasTheme]);

  useEffect(() => {
    const page = mode === 'pages' && active ? {
      id: active.id,
      name: active.name || `Page ${index + 1}`,
      order: active.customData?.pageOrder ?? index + 1,
    } : null;
    onPageContextChange?.({ mode, page, pageCount: pages.length });
  }, [active?.id, active?.name, active?.customData?.pageOrder, index, mode, onPageContextChange, pages.length]);
  useEffect(() => {
    if (!chapterIndexOpen) return undefined;
    const closeOnOutsideMouseDown = event => {
      if (chapterIndexRef.current && !chapterIndexRef.current.contains(event.target)) setChapterIndexOpen(false);
    };
    document.addEventListener('mousedown', closeOnOutsideMouseDown);
    return () => document.removeEventListener('mousedown', closeOnOutsideMouseDown);
  }, [chapterIndexOpen]);

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
    const previousChapterId = activeIdRef.current;
    let elements = api.getSceneElementsIncludingDeleted();
    const currentPage = getPages(elements).find(item => item.id === previousChapterId);
    const moveChapter = (sourcePage, targetX, targetY) => {
      const dx = targetX - sourcePage.x;
      const dy = targetY - sourcePage.y;
      if (!dx && !dy) return;
      elements = elements.map(element => {
        const belongsToChapter = element.id === sourcePage.id ||
          element.customData?.sketchiziPagePaper === sourcePage.id ||
          element.frameId === sourcePage.id;
        if (!belongsToChapter || element.isDeleted) return element;
        return {
          ...element, x: element.x + dx, y: element.y + dy,
          version: (element.version || 0) + 1,
          versionNonce: Math.floor(Math.random() * 2147483647), updated: Date.now(),
        };
      });
    };

    // Pages mode uses a fixed (0, 0) camera. Park the outgoing chapter to the
    // right of the document and move the incoming chapter to the viewport
    // origin, preserving every element's relative geometry and frame binding.
    if (currentPage && currentPage.id !== page.id &&
        Math.abs(currentPage.x) < 0.5 && Math.abs(currentPage.y) < 0.5) {
      const right = elements.filter(element => !element.isDeleted).reduce(
        (maximum, element) => Math.max(maximum, Number(element.x || 0) + Math.abs(Number(element.width || 0))),
        0,
      );
      moveChapter(currentPage, right + 10000, 0);
    }
    const targetPage = getPages(elements).find(item => item.id === page.id) || page;
    moveChapter(targetPage, 0, 0);
    const nextPages = getPages(elements);
    const firstChapter = nextPages[0];
    elements = elements.map(element => {
      if (element.id !== firstChapter?.id || element.customData?.activeChapterId === page.id) return element;
      return { ...element, customData: { ...element.customData, activeChapterId: page.id },
        version: (element.version || 0) + 1, versionNonce: Math.floor(Math.random() * 2147483647), updated: Date.now() };
    });

    const activePage = getPages(elements).find(item => item.id === page.id) || { ...page, x: 0, y: 0 };
    activeIdRef.current = page.id;
    initialFitRef.current = true;
    setActiveId(page.id);
    api.updateScene({
      elements,
      appState: { scrollX: 0, scrollY: 0, zoom: { value: 1 }, selectedElementIds: {}, selectedGroupIds: {} },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    window.requestAnimationFrame(() => {
      if (activeIdRef.current !== page.id) return;
      const lockedState = { ...api.getAppState(), scrollX: 0, scrollY: 0, zoom: { value: 1 } };
      setPageMask(getPageViewportMask(activePage, lockedState));
    });
  };
  const fitViewportToPage = page => {
    if (!page || !api) return;
    api.updateScene({
      appState: { scrollX: 0, scrollY: 0, zoom: { value: 1 } },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
    setPageMask(getPageViewportMask({ ...page, x: 0, y: 0 }, {
      ...api.getAppState(), scrollX: 0, scrollY: 0, zoom: { value: 1 },
    }));
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
    const refresh = () => {
      const page = activePageRef.current;
      if (page) fit(page);
    };
    refresh();
    requestExcalidrawCanvasRefresh();
    window.addEventListener('resize', refresh);
    return () => window.removeEventListener('resize', refresh);
  }, [api, mode, active?.id]);

  // Every chapter is a viewport-sized artboard. Keep its native Excalidraw
  // frame and transparent paper companion in lockstep with browser resizes.
  useEffect(() => {
    if (mode !== 'pages' || !active || !api) return undefined;
    const resizeChapter = () => {
      const page = activePageRef.current;
      if (!page) return;
      const size = getFullBleedPageSize();
      if (page.width === size.width && page.height === size.height) return;
      const elements = api.getSceneElementsIncludingDeleted().map(element => {
        if (element.id !== page.id && element.customData?.sketchiziPagePaper !== page.id) return element;
        return { ...element, width: size.width, height: size.height,
          version: (element.version || 0) + 1,
          versionNonce: Math.floor(Math.random() * 2147483647), updated: Date.now() };
      });
      api.updateScene({ elements, captureUpdate: CaptureUpdateAction.NEVER });
      const resizedPage = { ...page, ...size };
      setPages(current => current.map(item => item.id === page.id ? resizedPage : item));
      window.requestAnimationFrame(() => {
        if (activeIdRef.current === page.id) fitViewportToPage(resizedPage);
      });
    };
    resizeChapter();
    window.addEventListener('resize', resizeChapter);
    return () => window.removeEventListener('resize', resizeChapter);
  }, [api, mode, active?.id]);

  const blockOutsidePage = event => { event.preventDefault(); event.stopPropagation(); };
  const update = elements => api.updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  const createPage = () => {
    if (!api || !canEdit) return;
    const elements = api.getSceneElementsIncludingDeleted();
    const responsiveSize = getFullBleedPageSize();
    if (!validSize(responsiveSize.width, responsiveSize.height)) { setError('The available canvas area is too small to create a page.'); return; }
    const nextOrder = getPages(elements).reduce((n, page) => Math.max(n, page.customData?.pageOrder || 0), 0) + 1;
    const paperBackground = getPagePaperBackground(api.getAppState?.(), true);
    const created = convertToExcalidrawElements(pageSkeleton(elements, responsiveSize, crypto.randomUUID(), paperBackground), { regenerateIds: false });
    const frame = created.find(e => e.type === 'frame');
    if (frame) frame.name = 'Untitled Page';
    if (frame && previousViewBackgroundRef.current?.color) {
      frame.customData = {
        ...frame.customData,
        pagesPreviousViewBackgroundColor: previousViewBackgroundRef.current.color,
      };
    }
    update([...elements, ...created]);
    const currentView = api.getAppState?.();
    previousViewportRef.current = currentView ? { scrollX: currentView.scrollX, scrollY: currentView.scrollY, zoom: currentView.zoom } : null;
    setError(''); setMode('pages'); fit(frame);
  };
  const add = () => { createPage(); };
  useEffect(() => {
    const nextMode = workspaceMode === "pages" ? "pages" : "infinite";
    if (mode !== nextMode) changeMode(nextMode);
  }, [workspaceMode, mode, api, pages, active?.id]);

  const patchChapter = patch => {
    if (!active || !canEdit || !api) return;
    update(api.getSceneElementsIncludingDeleted().map(element => element.id === active.id
      ? { ...element, ...(typeof patch.chapterTitle === 'string' ? { name: patch.chapterTitle } : {}),
          customData: { ...element.customData, ...patch }, version: (element.version || 0) + 1,
          versionNonce: Math.floor(Math.random() * 2147483647), updated: Date.now() }
      : element));
  };
  const toggleChapterRead = page => {
    if (!page || !canEdit || !api) return;
    const completed = !Boolean(page.customData?.completed);
    update(api.getSceneElementsIncludingDeleted().map(element => element.id === page.id
      ? { ...element, customData: { ...element.customData, completed }, version: (element.version || 0) + 1, versionNonce: Math.floor(Math.random() * 2147483647), updated: Date.now() }
      : element));
  };
  const changeMode = value => {
    const livePages = api?.getSceneElementsIncludingDeleted?.() || [];
    if (value === 'pages' && getPages(livePages).length === 0) { add(); return; }
    if (value === 'pages' && mode !== 'pages') {
      const currentView = api?.getAppState?.();
      previousViewportRef.current = currentView ? { scrollX: currentView.scrollX, scrollY: currentView.scrollY, zoom: currentView.zoom } : null;
    }
    setMode(value);
    if (value === 'infinite') {
      setPageMask(null);
      activeIdRef.current = null;
      api?.updateScene({ appState: { selectedElementIds: {}, selectedGroupIds: {}, ...(previousViewportRef.current || {}) }, captureUpdate: CaptureUpdateAction.NEVER });
      previousViewportRef.current = null;
    }
    if (value === 'pages') fit(active);
  };
  useEffect(() => {
    const chooseMode = event => {
      const nextMode = event.detail?.mode;
      if (nextMode === 'infinite' || nextMode === 'pages') changeMode(nextMode);
    };
    window.addEventListener('sketchizi:choose-canvas-mode', chooseMode);
    return () => window.removeEventListener('sketchizi:choose-canvas-mode', chooseMode);
  }, [api, mode, pages, active?.id]);

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
    {mode === 'pages' && pageMaskForRender && host && createPortal(
      <PagesBookWorkspace pages={displayPages} active={active} index={index}
        canEdit={canEdit && pages.length > 0} onToggleRead={toggleChapterRead} onPatch={patchChapter}
        bookTitle={bookTitle} onRenameBookTitle={onRenameBookTitle}
        chapterIndexOpen={chapterIndexOpen} chapterIndexRef={chapterIndexRef}
        onToggleChapterIndex={() => setChapterIndexOpen(value => !value)}
        onSelectChapter={page => { if (page) fit(page); setChapterIndexOpen(false); }}
        onDeleteChapter={page => { deletePage(page); setChapterIndexOpen(false); }}
        onDeleteOnlyPage={onDeleteOnlyPage}
        onAddChapter={() => { add(); setChapterIndexOpen(false); }} />, host)}
    {mode === 'pages' && pageMaskForRender && host && createPortal(
      <div className="canvas-pages-mask">
        {pageMaskForRender.panels.map((panel, i) => <div className="canvas-pages-mask-panel" key={i} style={panel} onPointerDown={blockOutsidePage} onMouseDown={blockOutsidePage} onTouchStart={blockOutsidePage} onWheel={blockOutsidePage} onDragOver={blockOutsidePage} onDrop={blockOutsidePage} onContextMenu={blockOutsidePage} onDoubleClick={blockOutsidePage} />)}
        <div className="canvas-pages-page-surface" style={pageMaskForRender.pageRect} aria-hidden="true" />
        <div className="canvas-pages-page-outline" style={pageMaskForRender.pageRect} aria-hidden="true" />
      </div>, host)}
    {mode === 'pages' && pageMaskForRender && host && createPortal(
      inlineName && inlineName.pageId === active?.id ? <input
        ref={inlineNameInputRef}
        className="canvas-pages-page-name-input"
        style={{ left: pageMaskForRender.pageRect.left, top: Math.max(8, pageMaskForRender.pageRect.top - 31) }}
        aria-label="Edit page name"
        autoFocus
        maxLength={80}
        value={inlineName.value}
        onChange={event => setInlineName(current => ({ ...current, value: event.target.value }))}
        onBlur={saveInlineName}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } if (event.key === 'Escape') { event.preventDefault(); cancelInlineNameRef.current = true; setInlineName(null); } }}
      /> : <button type="button" className="canvas-pages-page-name" style={{ left: pageMaskForRender.pageRect.left, top: Math.max(8, pageMaskForRender.pageRect.top - 25) }} disabled={!active || !canEdit} onClick={() => active && rename(active)} title={canEdit ? 'Click to rename page' : active?.name}>{active?.name || `Page ${index + 1}`}</button>,
      host,
    )}

  </>;
}
