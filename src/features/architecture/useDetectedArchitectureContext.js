import { useCallback, useEffect, useRef, useState } from "react";
import {
  architectureDetectionSignature,
  detectArchitectureContext,
  getEmptyArchitectureDetection,
} from "./architectureContextDetection.js";

export const ARCHITECTURE_CONTEXT_DEBOUNCE_MS = 250;

/**
 * Debounced scene-aware context detection.
 *
 * The scene pipeline (useExcalidrawScene -> onArchitectureSceneChange) calls
 * `notifySceneChange(elements)` on every change. Detection runs at most once
 * per `debounceMs` of quiet and only triggers a React update when the detected
 * context or node counts actually change, so drawing never re-renders the
 * header per pointer sample.
 */
export function useDetectedArchitectureContext({ debounceMs = ARCHITECTURE_CONTEXT_DEBOUNCE_MS } = {}) {
  const [detection, setDetection] = useState(getEmptyArchitectureDetection);
  const timerRef = useRef(null);
  const latestElementsRef = useRef(null);
  const signatureRef = useRef("none");

  const notifySceneChange = useCallback((elements) => {
    latestElementsRef.current = elements;
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      const next = detectArchitectureContext(latestElementsRef.current);
      const signature = architectureDetectionSignature(next);
      if (signature === signatureRef.current) return;
      signatureRef.current = signature;
      setDetection(next);
    }, debounceMs);
  }, [debounceMs]);

  useEffect(() => () => {
    if (timerRef.current !== null) clearTimeout(timerRef.current);
    timerRef.current = null;
  }, []);

  return { ...detection, detection, notifySceneChange };
}
