/**
 * Insert a curated architecture pack into the live Excalidraw scene.
 *
 * Shared by the Architecture Templates modal and the command palette so both
 * entry points place templates identically (beside existing work, never on top
 * of it). `captureUpdate` is supplied by the caller so this module stays free
 * of the Excalidraw runtime import and is testable in Node.
 */
export function buildArchitecturePackElements(pack, existingElements = [], { now = Date.now(), random = Math.random } = {}) {
  const live = (Array.isArray(existingElements) ? existingElements : []).filter((el) => el && !el.isDeleted && !el.deleted);

  let offsetX = 100;
  let offsetY = 100;
  if (live.length > 0) {
    let maxX = -Infinity;
    let minY = Infinity;
    for (const el of live) {
      maxX = Math.max(maxX, (Number(el.x) || 0) + (Number(el.width) || 0));
      minY = Math.min(minY, Number(el.y) || 0);
    }
    offsetX = maxX + 80;
    offsetY = Math.max(100, minY);
  }

  return (pack?.elements || []).map((el, idx) => ({
    ...el,
    id: `tpl-${pack.id}-${now}-${idx}`,
    x: el.x + (offsetX - 100),
    y: el.y + (offsetY - 100),
    seed: Math.floor(random() * 100000),
    version: 1,
    versionNonce: 1,
    isDeleted: false,
  }));
}

export function insertArchitecturePack(api, pack, { captureUpdate } = {}) {
  if (!api || !pack) return false;
  const existing = (api.getSceneElements?.() || []).filter((el) => !el.isDeleted && !el.deleted);
  const added = buildArchitecturePackElements(pack, existing);
  if (!added.length) return false;
  const update = { elements: [...existing, ...added] };
  if (captureUpdate !== undefined) update.captureUpdate = captureUpdate;
  else update.commitToHistory = true;
  api.updateScene?.(update);
  api.scrollToContent?.(added, { fitToContent: true, animate: true });
  return true;
}
