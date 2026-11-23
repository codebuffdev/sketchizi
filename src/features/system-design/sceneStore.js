// Tiny external store so scene snapshots (every pointer move while dragging) re-render only the
// system design overlay, never `App`. Compatible with React's useSyncExternalStore.

export function createSceneStore() {
  let snapshot = { elements: [], selectedIds: [], scrollX: 0, scrollY: 0, zoom: 1, revision: 0 };
  const listeners = new Set();
  return {
    getSnapshot: () => snapshot,
    set(next) {
      snapshot = { ...next, revision: snapshot.revision + 1 };
      listeners.forEach((listener) => listener());
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}
