import { useEffect, useRef } from "react";
import { CaptureUpdateAction } from "@excalidraw/excalidraw";
import { createToolStyleController } from "./toolStyleController.js";

/**
 * Owns `toolPresetsByCanvasId`: the last style chosen for each drawing tool,
 * kept separately for every canvas tab. The returned controller has a stable
 * identity, so it is safe to use in dependency arrays.
 */
export function useToolStylePresets({ apiRef, activeCanvasIdRef }) {
  const controllerRef = useRef(null);
  if (!controllerRef.current) controllerRef.current = createToolStyleController({ apiRef, activeCanvasIdRef, captureNever: CaptureUpdateAction.NEVER });
  useEffect(() => controllerRef.current.attach(), []);
  return controllerRef.current;
}
