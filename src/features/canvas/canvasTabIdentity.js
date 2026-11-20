/** Generate a stable, collision-resistant ID for a newly opened canvas tab. */
export function createCanvasTabId(existingTabs = [], now = Date.now(), random = Math.random) {
  const used = new Set((Array.isArray(existingTabs) ? existingTabs : []).map((tab) => tab?.id).filter(Boolean));
  const base = `canvas-${now}`;
  if (!used.has(base)) return base;
  const entropy = Math.floor(random() * Number.MAX_SAFE_INTEGER).toString(36);
  let candidate = `${base}-${entropy}`;
  let suffix = 1;
  while (used.has(candidate)) candidate = `${base}-${entropy}-${suffix++}`;
  return candidate;
}
