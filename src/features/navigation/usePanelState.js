import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";

/**
 * Edge-scoped layout controller.
 *
 * Drawers are partitioned by the viewport edge they are anchored to, and each
 * edge owns exactly one slot:
 *
 *   left  : "menu" | "iconLibrary" | null
 *   right : "aiAsk" | "rightRail" | "properties" | null
 *
 * Mutual exclusion applies only WITHIN an edge. Opening a left drawer never
 * mutates the right slot and vice versa, so the hamburger menu / icon library
 * can stay open next to the AI Ask panel.
 *
 * "menu" is Excalidraw's native hamburger menu. Its open state is owned by
 * Excalidraw, so it is mirrored in through `nativeMenuOpen` instead of stored.
 *
 * Small floating surfaces (More Tools popover, shortcut help) are not edge
 * drawers; they live in a separate transient slot that never touches either
 * edge.
 */

export const LEFT_PANELS = Object.freeze({ MENU: "menu", ICON_LIBRARY: "iconLibrary" });
export const RIGHT_PANELS = Object.freeze({ AI_ASK: "aiAsk", RIGHT_RAIL: "rightRail", PROPERTIES: "properties" });

// Accepts both the new edge ids and the legacy panel ids used across the app.
const PANEL_ALIASES = {
  menu: { edge: "left", panel: "menu" },
  iconLibrary: { edge: "left", panel: "iconLibrary" },
  "icon-library": { edge: "left", panel: "iconLibrary" },
  aiAsk: { edge: "right", panel: "aiAsk" },
  "ai-ask": { edge: "right", panel: "aiAsk" },
  rightRail: { edge: "right", panel: "rightRail" },
  "architecture-validation": { edge: "right", panel: "rightRail" },
  properties: { edge: "right", panel: "properties" },
  "more-tools": { edge: "transient", panel: "more-tools" },
  shortcuts: { edge: "transient", panel: "shortcuts" },
};

export function resolvePanel(name) {
  return (name && PANEL_ALIASES[name]) || null;
}

const initialState = {
  left: null,
  right: null,
  transient: null,
  isRightRailPinned: false,
  isIconLibraryPinned: false,
  // Most recently opened edge is last. Used for layered Escape.
  order: [],
};

const touch = (order, edge) => [...order.filter((item) => item !== edge), edge];
const forget = (order, edge) => order.filter((item) => item !== edge);

// When a right drawer closes, a pinned rail that was displaced by it returns.
function rightAfterClose(state, closed) {
  return state.isRightRailPinned && closed !== "rightRail" ? "rightRail" : null;
}

function reducer(state, action) {
  switch (action.type) {
    case "open-left":
      return { ...state, left: action.panel, transient: null, order: touch(state.order, "left") };
    case "open-right":
      return { ...state, right: action.panel, transient: null, order: touch(state.order, "right") };
    case "open-transient":
      return { ...state, transient: action.panel };
    case "close-left":
      if (state.left !== action.panel) return state;
      return { ...state, left: null, order: forget(state.order, "left") };
    case "close-right": {
      if (state.right !== action.panel) return state;
      // Closing the rail explicitly also releases its pin.
      const isRightRailPinned = action.panel === "rightRail" ? false : state.isRightRailPinned;
      const next = { ...state, isRightRailPinned };
      const right = rightAfterClose(next, action.panel);
      return { ...next, right, order: right ? next.order : forget(next.order, "right") };
    }
    case "close-transient":
      return state.transient === action.panel ? { ...state, transient: null } : state;
    case "set-right-pinned":
      return { ...state, isRightRailPinned: Boolean(action.value) };
    case "set-left-pinned":
      return { ...state, isIconLibraryPinned: Boolean(action.value) };
    case "native-menu-opened":
      // The hamburger replaces the icon library on the left edge only.
      return { ...state, left: state.left === "iconLibrary" ? null : state.left, order: touch(state.order, "left") };
    case "native-menu-closed":
      return state.left ? state : { ...state, order: forget(state.order, "left") };
    default:
      return state;
  }
}

export function usePanelState({ apiRef, nativeMenuOpen = false, closeNativeMenu }) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const stateRef = useRef(state);
  stateRef.current = state;
  const nativeMenuOpenRef = useRef(nativeMenuOpen);
  nativeMenuOpenRef.current = nativeMenuOpen;

  useEffect(() => {
    dispatch({ type: nativeMenuOpen ? "native-menu-opened" : "native-menu-closed" });
  }, [nativeMenuOpen]);

  const activeLeftPanel = nativeMenuOpen ? "menu" : state.left;
  const activeRightPanel = state.right;
  const { isRightRailPinned, isIconLibraryPinned, transient: activeTransientPanel } = state;

  const openPanel = useCallback((name) => {
    const target = resolvePanel(name);
    if (!target) return;
    if (target.edge === "left") {
      // Same-edge exclusion: the native menu and icon library swap places.
      if (target.panel === "iconLibrary") closeNativeMenu?.();
      if (target.panel === "menu") return;
      dispatch({ type: "open-left", panel: target.panel });
    } else if (target.edge === "right") {
      dispatch({ type: "open-right", panel: target.panel });
    } else {
      dispatch({ type: "open-transient", panel: target.panel });
    }
  }, [closeNativeMenu]);

  const closePanel = useCallback((name) => {
    const target = resolvePanel(name);
    if (!target) return;
    if (target.edge === "left") {
      if (target.panel === "menu") closeNativeMenu?.();
      else dispatch({ type: "close-left", panel: target.panel });
    } else if (target.edge === "right") dispatch({ type: "close-right", panel: target.panel });
    else dispatch({ type: "close-transient", panel: target.panel });
  }, [closeNativeMenu]);

  const isPanelOpen = useCallback((name) => {
    const target = resolvePanel(name);
    const current = stateRef.current;
    if (!target) return false;
    if (target.edge === "left") return target.panel === "menu" ? nativeMenuOpenRef.current : current.left === target.panel;
    if (target.edge === "right") return current.right === target.panel;
    return current.transient === target.panel;
  }, []);

  const togglePanel = useCallback((name) => {
    if (isPanelOpen(name)) closePanel(name);
    else openPanel(name);
  }, [closePanel, isPanelOpen, openPanel]);

  const closeLeftPanel = useCallback(() => {
    if (nativeMenuOpenRef.current) closeNativeMenu?.();
    if (stateRef.current.left) dispatch({ type: "close-left", panel: stateRef.current.left });
  }, [closeNativeMenu]);

  const closeRightPanel = useCallback(() => {
    if (stateRef.current.right) dispatch({ type: "close-right", panel: stateRef.current.right });
  }, []);

  const setIsRightRailPinned = useCallback((value) => dispatch({ type: "set-right-pinned", value }), []);
  const setIconLibraryPinned = useCallback((value) => dispatch({ type: "set-left-pinned", value }), []);

  // AI Ask lives in the right slot; these keep the old boolean-style API.
  const aiAskOpen = activeRightPanel === "aiAsk";
  const setAiAskOpen = useCallback((value) => {
    const current = stateRef.current.right === "aiAsk";
    const next = typeof value === "function" ? Boolean(value(current)) : Boolean(value);
    if (next === current) return;
    if (next) dispatch({ type: "open-right", panel: "aiAsk" });
    else dispatch({ type: "close-right", panel: "aiAsk" });
  }, []);
  const toggleAiAsk = useCallback(() => setAiAskOpen((value) => !value), [setAiAskOpen]);

  /**
   * Layered Escape support: close the most recently opened *unpinned* drawer.
   * Returns the id of the drawer closed, or null if none was closable.
   */
  const closeMostRecentDrawer = useCallback(() => {
    const current = stateRef.current;
    const left = nativeMenuOpenRef.current ? "menu" : current.left;
    const order = nativeMenuOpenRef.current ? touch(current.order, "left") : current.order;
    for (let index = order.length - 1; index >= 0; index -= 1) {
      if (order[index] === "left" && left) {
        if (left === "iconLibrary" && current.isIconLibraryPinned) continue;
        if (left === "menu") closeNativeMenu?.();
        else dispatch({ type: "close-left", panel: left });
        return left;
      }
      if (order[index] === "right" && current.right) {
        if (current.right === "rightRail" && current.isRightRailPinned) continue;
        dispatch({ type: "close-right", panel: current.right });
        return current.right;
      }
    }
    return null;
  }, [closeNativeMenu]);

  /**
   * Bare-canvas pointer-down: dismiss only unpinned drawers that are meant to
   * be transient. AI Ask is a conversation surface and stays open until its
   * close button / Escape; properties follows the selection.
   */
  const dismissUnpinnedDrawersFromCanvas = useCallback(() => {
    const current = stateRef.current;
    if (nativeMenuOpenRef.current) closeNativeMenu?.();
    if (current.left === "iconLibrary" && !current.isIconLibraryPinned) {
      dispatch({ type: "close-left", panel: "iconLibrary" });
    }
    if (current.right === "rightRail" && !current.isRightRailPinned) {
      dispatch({ type: "close-right", panel: "rightRail" });
    }
  }, [closeNativeMenu]);

  const legacyPanelClasses = useMemo(() => {
    const classes = [];
    if (activeLeftPanel === "iconLibrary") classes.push("panel-open-library");
    if (activeRightPanel === "properties") classes.push("panel-open-properties");
    if (activeRightPanel === "rightRail") classes.push("panel-open-architecture-validation");
    if (activeTransientPanel) classes.push(`panel-open-${activeTransientPanel}`);
    return classes;
  }, [activeLeftPanel, activeRightPanel, activeTransientPanel]);

  return {
    activeLeftPanel,
    activeRightPanel,
    activeTransientPanel,
    isRightRailPinned,
    setIsRightRailPinned,
    isIconLibraryPinned,
    setIconLibraryPinned,
    openPanel,
    togglePanel,
    closePanel,
    closeLeftPanel,
    closeRightPanel,
    closeMostRecentDrawer,
    dismissUnpinnedDrawersFromCanvas,
    aiAskOpen,
    setAiAskOpen,
    toggleAiAsk,
    legacyPanelClasses,
    anyPanelOpen: Boolean(activeLeftPanel || activeRightPanel || activeTransientPanel),
    libraryOpen: activeLeftPanel === "iconLibrary",
    propertiesOpen: activeRightPanel === "properties",
    moreToolsOpen: activeTransientPanel === "more-tools",
    shortcutHelpOpen: activeTransientPanel === "shortcuts",
    architectureValidationOpen: activeRightPanel === "rightRail",
  };
}
