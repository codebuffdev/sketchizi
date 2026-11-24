const finite = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const live = (element) => element && !element.isDeleted && !element.deleted;

function boundsFor(elements) {
  return elements.reduce((bounds, element) => {
    const x1 = finite(element.x);
    const y1 = finite(element.y);
    const x2 = x1 + finite(element.width);
    const y2 = y1 + finite(element.height);
    bounds.minX = Math.min(bounds.minX, x1, x2);
    bounds.maxX = Math.max(bounds.maxX, x1, x2);
    bounds.minY = Math.min(bounds.minY, y1, y2);
    bounds.maxY = Math.max(bounds.maxY, y1, y2);
    return bounds;
  }, { minX: Infinity, maxX: -Infinity, minY: Infinity, maxY: -Infinity });
}

function logicalUnits(elements, selectedIds) {
  const liveElements = elements.filter(live);
  const byId = new Map(liveElements.map((element) => [element.id, element]));
  const parent = new Map(liveElements.map((element) => [element.id, element.id]));
  const find = (id) => {
    const current = parent.get(id);
    if (current == null || current === id) return current;
    const root = find(current);
    parent.set(id, root);
    return root;
  };
  const union = (a, b) => {
    if (!parent.has(a) || !parent.has(b)) return;
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootB, rootA);
  };

  const groups = new Map();
  for (const element of liveElements) {
    for (const groupId of element.groupIds || []) {
      if (!groups.has(groupId)) groups.set(groupId, []);
      groups.get(groupId).push(element.id);
    }
    if (element.containerId) union(element.id, element.containerId);
    for (const bound of element.boundElements || []) {
      if (bound?.id && String(bound.type || "").toLowerCase() === "text") union(element.id, bound.id);
    }
  }
  for (const ids of groups.values()) {
    for (let index = 1; index < ids.length; index += 1) union(ids[0], ids[index]);
  }

  const selectedRoots = new Set([...selectedIds].filter((id) => byId.has(id)).map(find));
  const grouped = new Map();
  for (const element of liveElements) {
    const root = find(element.id);
    if (!selectedRoots.has(root)) continue;
    if (!grouped.has(root)) grouped.set(root, []);
    grouped.get(root).push(element);
  }
  return [...grouped.values()].map((members) => ({
    elements: members,
    bounds: boundsFor(members),
    first: members[0],
  })).filter((unit) => Number.isFinite(unit.bounds.minX));
}

const byX = (a, b) => a.bounds.minX - b.bounds.minX || a.bounds.minY - b.bounds.minY || String(a.first.id).localeCompare(String(b.first.id));
const byY = (a, b) => a.bounds.minY - b.bounds.minY || a.bounds.minX - b.bounds.minX || String(a.first.id).localeCompare(String(b.first.id));

/**
 * Arrange selected Excalidraw elements as logical units. Grouped elements and
 * bound shape/text pairs are translated together, preserving their offsets.
 * Returns a complete scene array suitable for one undoable updateScene call.
 */
export function arrangeElements(elements, selectedIds, layout, gap = 24) {
  const scene = Array.isArray(elements) ? elements : [];
  const ids = selectedIds instanceof Set ? selectedIds : new Set(selectedIds || []);
  const units = logicalUnits(scene, ids);
  if (units.length < 2) return scene;

  const safeGap = Math.max(0, finite(gap));
  const allBounds = boundsFor(units.map((unit) => ({
    x: unit.bounds.minX, y: unit.bounds.minY,
    width: unit.bounds.maxX - unit.bounds.minX,
    height: unit.bounds.maxY - unit.bounds.minY,
  })));
  const moves = new Map();
  const place = (unit, x, y) => {
    const dx = x - unit.bounds.minX;
    const dy = y - unit.bounds.minY;
    if (Math.abs(dx) < 0.0001 && Math.abs(dy) < 0.0001) return;
    for (const element of unit.elements) moves.set(element.id, { dx, dy });
  };

  if (layout === "horizontal") {
    const ordered = [...units].sort(byX);
    const avgY = units.reduce((sum, unit) => sum + (unit.bounds.minY + unit.bounds.maxY) / 2, 0) / units.length;
    let x = allBounds.minX;
    for (const unit of ordered) {
      const height = unit.bounds.maxY - unit.bounds.minY;
      place(unit, x, avgY - height / 2);
      x += unit.bounds.maxX - unit.bounds.minX + safeGap;
    }
  } else if (layout === "vertical") {
    const ordered = [...units].sort(byY);
    const avgX = units.reduce((sum, unit) => sum + (unit.bounds.minX + unit.bounds.maxX) / 2, 0) / units.length;
    let y = allBounds.minY;
    for (const unit of ordered) {
      const width = unit.bounds.maxX - unit.bounds.minX;
      place(unit, avgX - width / 2, y);
      y += unit.bounds.maxY - unit.bounds.minY + safeGap;
    }
  } else if (layout === "square" || layout === "rectangle") {
    const columns = layout === "square" ? Math.ceil(Math.sqrt(units.length)) : Math.ceil(units.length / 2);
    const rows = Math.ceil(units.length / columns);
    const ordered = [...units].sort(byY);
    const columnWidths = Array.from({ length: columns }, (_, column) =>
      Math.max(0, ...ordered.filter((_, index) => index % columns === column).map((unit) => unit.bounds.maxX - unit.bounds.minX)),
    );
    const rowHeights = Array.from({ length: rows }, (_, row) =>
      Math.max(0, ...ordered.slice(row * columns, (row + 1) * columns).map((unit) => unit.bounds.maxY - unit.bounds.minY)),
    );
    const columnX = [];
    const rowY = [];
    for (let column = 0, x = allBounds.minX; column < columns; column += 1) {
      columnX[column] = x;
      x += columnWidths[column] + safeGap;
    }
    for (let row = 0, y = allBounds.minY; row < rows; row += 1) {
      rowY[row] = y;
      y += rowHeights[row] + safeGap;
    }
    ordered.forEach((unit, index) => {
      const row = Math.floor(index / columns);
      const column = index % columns;
      place(unit, columnX[column], rowY[row]);
    });
  } else {
    const minX = allBounds.minX;
    const maxX = allBounds.maxX;
    const minY = allBounds.minY;
    const maxY = allBounds.maxY;
    for (const unit of units) {
      let x = unit.bounds.minX;
      let y = unit.bounds.minY;
      if (layout === "left") x = minX;
      else if (layout === "centerHorizontal") x = (minX + maxX) / 2 - (unit.bounds.maxX - unit.bounds.minX) / 2;
      else if (layout === "right") x = maxX - (unit.bounds.maxX - unit.bounds.minX);
      else if (layout === "top") y = minY;
      else if (layout === "centerVertical") y = (minY + maxY) / 2 - (unit.bounds.maxY - unit.bounds.minY) / 2;
      else if (layout === "bottom") y = maxY - (unit.bounds.maxY - unit.bounds.minY);
      else return scene;
      place(unit, x, y);
    }
  }

  if (!moves.size) return scene;
  const now = Date.now();
  return scene.map((element) => {
    const move = moves.get(element.id);
    if (!move) return element;
    return {
      ...element,
      x: finite(element.x) + move.dx,
      y: finite(element.y) + move.dy,
      version: (Number(element.version) || 0) + 1,
      versionNonce: Math.floor(Math.random() * 2147483647),
      updated: now,
    };
  });
}


/**
 * Apply a layout using the current Excalidraw selection and scene at click time.
 * This intentionally avoids React selection props, which may be one render stale.
 */
export function applyAlignmentToSelection(api, layout) {
  if (!api?.getAppState || !api?.getSceneElements || !api?.updateScene) return false;
  const selectedIds = Object.entries(api.getAppState()?.selectedElementIds || {})
    .filter(([, selected]) => selected)
    .map(([id]) => id);
  if (selectedIds.length < 2) return false;
  const scene = api.getSceneElements() || [];
  const updatedElements = arrangeElements(scene, selectedIds, layout, 24);
  if (updatedElements === scene) return false;
  api.updateScene({ elements: updatedElements, commitToHistory: true });
  return true;
}
