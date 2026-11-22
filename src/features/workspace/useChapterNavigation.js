import { useEffect, useMemo, useState } from "react";
import { workspaceClient } from "./workspaceClient.js";
import { readDiagramRows } from "./diagramNames.js";
import { getChapterNeighbors, readChapterLayout, resolveChapterSequence } from "./chapterSequence.js";

export const buildChapterEditorUrl = (projectId, diagramId) =>
  `/?editor=1&cloudDiagramId=${encodeURIComponent(diagramId)}&cloudProjectId=${encodeURIComponent(projectId)}`;

/**
 * Position of the open cloud diagram inside its project's chapter sequence.
 * Returns `{ index, total, current, previous, next }`, or null when the project
 * has fewer than two chapters (nothing to navigate between).
 */
export function useChapterNavigation({ enabled, projectId, diagramId }) {
  const [chapters, setChapters] = useState([]);
  useEffect(() => {
    if (!enabled || !projectId || !diagramId) { setChapters([]); return undefined; }
    let cancelled = false;
    workspaceClient.listDiagrams(projectId)
      .then((result) => { if (!cancelled) setChapters(resolveChapterSequence(readDiagramRows(result), readChapterLayout(projectId))); })
      .catch(() => { if (!cancelled) setChapters([]); });
    return () => { cancelled = true; };
  }, [enabled, projectId, diagramId]);
  return useMemo(() => {
    const neighbors = getChapterNeighbors(chapters, diagramId);
    return neighbors && neighbors.total > 1 ? neighbors : null;
  }, [chapters, diagramId]);
}
