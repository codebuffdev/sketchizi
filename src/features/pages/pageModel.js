export const PAGE_MARKER = 'sketchiziPage';
// Default artboard proportions are 55 cm × 27 cm. Pixel dimensions are
// calculated from the available canvas viewport whenever a page is created.
export const DEFAULT_PAGE_SIZE = { width: 1600, height: Math.round(1600 * 27 / 55) };
export const PAGE_ASPECT_RATIO = 55 / 27;

export function getResponsivePageSize(appState, margin = 0.96) {
  const zoom = Number(appState?.zoom?.value ?? appState?.zoom ?? 1);
  const viewportWidth = Number(appState?.width || 0);
  const viewportHeight = Number(appState?.height || 0);
  if (!Number.isFinite(zoom) || zoom <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
    return { ...DEFAULT_PAGE_SIZE };
  }
  // Convert available screen space into Excalidraw world units, preserving
  // the requested physical-page aspect ratio at every viewport size.
  const width = Math.min(viewportWidth * margin / zoom, viewportHeight * margin / zoom * PAGE_ASPECT_RATIO, 10000);
  const safeWidth = Math.max(80, width);
  return { width: Math.round(safeWidth), height: Math.round(safeWidth / PAGE_ASPECT_RATIO) };
}
export const PAGE_PRESETS = { Wide: DEFAULT_PAGE_SIZE, A4: { width: 1123, height: 1587 }, Letter: { width: 1275, height: 1650 } };
export const getPages = (elements) => elements.filter(e => !e.isDeleted && e.type === 'frame' && e.customData?.[PAGE_MARKER]).sort((a,b) => (a.customData.pageOrder ?? 0) - (b.customData.pageOrder ?? 0));
export function validSize(width, height) {
  return [width, height].every(n => Number.isFinite(n) && n >= 80 && n <= 10000);
}
// Fit the active artboard with a consistent workspace gutter instead of
// scaling it edge-to-edge. Recenter after reducing zoom so the page stays put.
export function getPageFitViewport(page, appState, scale = 0.82) {
  if (!page || !appState || !Number.isFinite(scale) || scale <= 0 || scale >= 1) return null;
  const currentZoom = Number(appState.zoom?.value ?? appState.zoom ?? 1);
  const width = Number(appState.width || 0);
  const height = Number(appState.height || 0);
  if (!Number.isFinite(currentZoom) || currentZoom <= 0 || width <= 0 || height <= 0) return null;
  const zoom = currentZoom * scale;
  return {
    zoom: { value: zoom },
    scrollX: width / (2 * zoom) - page.x - page.width / 2,
    scrollY: height / (2 * zoom) - page.y - page.height / 2,
  };
}

export function getPageViewportMask(page, appState) {
  if (!page || !appState) return null;
  const zoom = Number(appState.zoom?.value ?? appState.zoom ?? 1);
  const viewport = {
    left: Number(appState.offsetLeft || 0),
    top: Number(appState.offsetTop || 0),
    right: Number(appState.offsetLeft || 0) + Number(appState.width || 0),
    bottom: Number(appState.offsetTop || 0) + Number(appState.height || 0),
  };
  if (!Number.isFinite(zoom) || zoom <= 0 || viewport.right <= viewport.left || viewport.bottom <= viewport.top) return null;

  const pageLeft = viewport.left + (page.x + Number(appState.scrollX || 0)) * zoom;
  const pageTop = viewport.top + (page.y + Number(appState.scrollY || 0)) * zoom;
  const left = Math.max(viewport.left, Math.min(viewport.right, pageLeft));
  const top = Math.max(viewport.top, Math.min(viewport.bottom, pageTop));
  const right = Math.max(viewport.left, Math.min(viewport.right, pageLeft + page.width * zoom));
  const bottom = Math.max(viewport.top, Math.min(viewport.bottom, pageTop + page.height * zoom));
  if (right <= left || bottom <= top) return null;

  return {
    // Match the workspace gutters to the active Excalidraw theme.
    backgroundColor: appState.theme === 'dark' ? '#111820' : '#f7f9fc',
    pageRect: { left, top, width: right - left, height: bottom - top },
    panels: [
      { left: viewport.left, top: viewport.top, width: viewport.right - viewport.left, height: top - viewport.top },
      { left: viewport.left, top: bottom, width: viewport.right - viewport.left, height: viewport.bottom - bottom },
      { left: viewport.left, top, width: left - viewport.left, height: bottom - top },
      { left: right, top, width: viewport.right - right, height: bottom - top },
    ].filter(panel => panel.width > 0 && panel.height > 0),
  };
}
export function nextPagePosition(elements) {
  const live = elements.filter(e => !e.isDeleted);
  // Keep sheets far enough apart that fitting one page cannot expose a
  // neighboring sheet at the edge of a wide or portrait viewport.
  const right = live.length ? Math.max(...live.map(e => e.x + Math.abs(e.width || 0))) : 0;
  const pageWidth = Math.max(DEFAULT_PAGE_SIZE.width, ...getPages(live).map(page => page.width || 0));
  const isolationGap = Math.max(10000, pageWidth * 4);
  return { x: live.length ? right + isolationGap : 0, y: 0 };
}
export function pageSkeleton(elements, size, id) {
  if (!validSize(size.width, size.height)) throw new Error('Use dimensions between 320 and 10,000 pixels.');
  const position = nextPagePosition(elements);
  const order = getPages(elements).reduce((n,p) => Math.max(n, p.customData.pageOrder || 0), 0) + 1;
  return [
    { type: 'rectangle', id: `${id}-paper`, ...position, ...size, backgroundColor: 'transparent', strokeColor: 'transparent', fillStyle: 'solid', roughness: 0, strokeWidth: 1, locked: true, customData: { sketchiziPagePaper: id } },
    { type: 'frame', id, ...position, ...size, children: [`${id}-paper`], name: `Page ${order}`, locked: false, customData: { [PAGE_MARKER]: true, pageOrder: order } },
  ];
}

export function duplicatePage(elements, pageId, newId) {
  const page = getPages(elements).find(p => p.id === pageId);
  if (!page) return [];
  const source = elements.filter(e => !e.isDeleted && (e.id === page.id || e.frameId === page.id));
  const ids = new Map(source.map((e,i) => [e.id, e.id === pageId ? newId : `${newId}-${i}`]));
  const groups = new Map();
  const target = nextPagePosition(elements);
  const order = Math.max(...getPages(elements).map(p => p.customData.pageOrder || 0)) + 1;
  return source.map(original => {
    const e = structuredClone(original);
    e.id = ids.get(original.id);
    e.x += target.x - page.x; e.y += target.y - page.y;
    e.frameId = original.frameId === pageId ? newId : null;
    e.containerId = ids.get(original.containerId) || null;
    e.boundElements = original.boundElements?.filter(b => ids.has(b.id)).map(b => ({...b,id:ids.get(b.id)})) || null;
    for (const key of ['startBinding','endBinding']) if (e[key]) e[key] = ids.has(e[key].elementId) ? {...e[key],elementId:ids.get(e[key].elementId)} : null;
    e.groupIds = (original.groupIds || []).map(id => { if (!groups.has(id)) groups.set(id,`${newId}-group-${groups.size}`); return groups.get(id); });
    if (e.customData?.sketchiziPagePaper) e.customData.sketchiziPagePaper = newId;
    if (original.id === pageId) { e.name = `${page.name || 'Page'} copy`; e.customData.pageOrder = order; }
    e.version = 1; e.versionNonce = 0; e.updated = Date.now(); e.index = null;
    return e;
  });
}
