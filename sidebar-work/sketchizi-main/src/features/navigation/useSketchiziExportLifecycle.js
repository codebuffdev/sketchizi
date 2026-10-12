import { useEffect } from "react";

const SUCCESS_MESSAGES = [
  /^file saved\.?$/i,
  /^saved to .+/i,
  /^copied .* to clipboard(?: as (?:png|svg))?\.?/i,
];

const FAILURE_MESSAGES = [
  /^couldn'?t copy to clipboard\.?$/i,
  /^couldn'?t export/i,
  /^error exporting/i,
  /^unable to export/i,
  /^cannot export/i,
];

function matchesAny(message, patterns) {
  return patterns.some((pattern) => pattern.test(message));
}

export function useSketchiziExportLifecycle({ apiRef, showToast, closeExportDialog }) {
  useEffect(() => {
    const observer = new MutationObserver((mutations) => {
      const api = apiRef.current;
      if (api?.getAppState?.().openDialog?.name !== "imageExport") return;

      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof Element)) continue;
          const message = (node.textContent || "").replace(/\s+/g, " ").trim();
          if (!message) continue;

          if (matchesAny(message, SUCCESS_MESSAGES)) {
            showToast("Image exported successfully");
            closeExportDialog();
            return;
          }

          if (matchesAny(message, FAILURE_MESSAGES)) {
            showToast("Image export failed. Please try again.", "error");
            return;
          }
        }
      }
    });

    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [apiRef, closeExportDialog, showToast]);
}
