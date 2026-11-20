/**
 * Refresh persisted cloud tabs without making workspace restoration wait for
 * every network request. Each tab reports its own result as soon as it settles.
 */
export function refreshCloudTabsIndependently(tabs, {
  getDiagram,
  skipDiagramId = "",
  onRefreshed,
  onFailed,
} = {}) {
  let cancelled = false;
  for (const tab of Array.isArray(tabs) ? tabs : []) {
    const session = tab?.snapshot?.cloudSession;
    if (!session?.active || !session.diagramId || session.diagramId === skipDiagramId) continue;
    Promise.resolve()
      .then(() => getDiagram(session.diagramId))
      .then((result) => {
        if (!cancelled) onRefreshed?.(tab, result);
      })
      .catch((error) => {
        if (!cancelled) onFailed?.(tab, error);
      });
  }
  return () => { cancelled = true; };
}
