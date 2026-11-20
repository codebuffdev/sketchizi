import { useCallback, useState } from "react";

export function usePanelState({ apiRef, closeNativeMenu, setAiAskOpen }) {
  const [activePanel, setActivePanel] = useState(null);
  const openPanel = useCallback((panel) => {
    if (panel) {
      closeNativeMenu();
      setAiAskOpen?.(false);
    }
    setActivePanel(panel);
  }, [closeNativeMenu, setAiAskOpen]);
  const togglePanel = useCallback((panel) => {
    if (panel) {
      closeNativeMenu();
      setAiAskOpen?.(false);
    }
    setActivePanel((current) => current === panel ? null : panel);
  }, [closeNativeMenu, setAiAskOpen]);
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
    propertiesOpen: activePanel === "properties",
    moreToolsOpen: activePanel === "more-tools",
    shortcutHelpOpen: activePanel === "shortcuts",
    architectureValidationOpen: activePanel === "architecture-validation",
  };
}
