import { useCallback, useState } from "react";
import { inferTechnologyIconQuery, toCustomNodeIcon } from "./techIconMapping.js";

/** Bridges System Design node metadata to the existing full-catalog Icon Library picker. */
export function useSystemDesignIconAssignment({
  systemDesign,
  setInitialSource,
  setSearch,
  searchRef,
  openPanel,
  closePanel,
  markRecentlyUsed,
}) {
  const [target, setTarget] = useState(null);

  const open = useCallback((node) => {
    if (node?.id) {
      setTarget({ nodeId: node.id, nodeLabel: node.label });
      setInitialSource("system-design");
      setSearch(inferTechnologyIconQuery(node.label, node.kind));
    } else {
      setTarget(null);
      setInitialSource("system-design");
    }
    openPanel("icon-library");
    requestAnimationFrame(() => {
      if (node?.id) setInitialSource("all");
      searchRef.current?.focus();
    });
  }, [setInitialSource, setSearch, searchRef, openPanel]);

  const assign = useCallback((icon) => {
    if (!target?.nodeId || !icon) return;
    const customIcon = toCustomNodeIcon(icon);
    if (!customIcon) return;
    systemDesign.actions.updateNodeMeta(target.nodeId, { customIcon });
    markRecentlyUsed(icon);
    setTarget(null);
    closePanel("icon-library");
  }, [target, systemDesign, markRecentlyUsed, closePanel]);

  const close = useCallback(() => {
    setTarget(null);
    closePanel("icon-library");
  }, [closePanel]);

  return { target, open, assign, close };
}
