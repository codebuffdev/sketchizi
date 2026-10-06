import { useCallback, useState } from "react";

export function usePanelState({ apiRef, closeNativeMenu }) {
  const [activePanel, setActivePanel] = useState(null);
  const openPanel = useCallback((panel) => {
    if (panel) closeNativeMenu();
    setActivePanel(panel);
  }, [closeNativeMenu]);
  const togglePanel = useCallback((panel) => {
    if (panel) closeNativeMenu();
    setActivePanel((current) => current === panel ? null : panel);
  }, [closeNativeMenu]);
  const closePanel = useCallback((panel) => {
    setActivePanel((current) => current === panel ? null : current);
  }, []);
  return {
    activePanel,
    setActivePanel,
    openPanel,
    togglePanel,
    closePanel,
    libraryOpen: activePanel === "icon-library",
    layoutOpen: activePanel === "layout",
    propertiesOpen: activePanel === "properties",
    moreToolsOpen: activePanel === "more-tools",
    shortcutHelpOpen: activePanel === "shortcuts",
  };
}
