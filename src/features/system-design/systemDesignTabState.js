export const DEFAULT_SYSTEM_DESIGN_TAB_STATE = Object.freeze({
  active: false,
  studioMode: "canvas",
  simRunning: false,
  baseRps: 10000,
  inspectorOpen: false,
});

export function normalizeSystemDesignTabState(value) {
  const state = value && typeof value === "object" ? value : {};
  return {
    active: state.active === true,
    studioMode: ["canvas", "k8s", "compose"].includes(state.studioMode) ? state.studioMode : "canvas",
    simRunning: state.simRunning === true,
    baseRps: [1000, 10000, 50000].includes(Number(state.baseRps)) ? Number(state.baseRps) : DEFAULT_SYSTEM_DESIGN_TAB_STATE.baseRps,
    inspectorOpen: state.inspectorOpen === true,
  };
}

export function readSystemDesignTabState(tabs, tabId) {
  const tab = (Array.isArray(tabs) ? tabs : []).find((item) => item?.id === tabId);
  return normalizeSystemDesignTabState(tab?.snapshot?.systemDesign);
}

export function createSystemDesignWorkspaceByTabId(tabs, activeTabId) {
  const result = {};
  for (const tab of Array.isArray(tabs) ? tabs : []) {
    if (tab?.id) result[tab.id] = normalizeSystemDesignTabState(tab.snapshot?.systemDesign);
  }
  if (activeTabId && !result[activeTabId]) result[activeTabId] = { ...DEFAULT_SYSTEM_DESIGN_TAB_STATE };
  return result;
}

export function updateSystemDesignWorkspaceTab(map, tabId, patch) {
  if (!tabId) return map || {};
  const current = normalizeSystemDesignTabState(map?.[tabId]);
  const next = normalizeSystemDesignTabState({ ...current, ...(typeof patch === "function" ? patch(current) : patch) });
  return { ...(map || {}), [tabId]: next };
}
