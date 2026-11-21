/**
 * Platform-aware keyboard shortcut helpers for the command palette.
 */

export function isMacPlatform(nav = typeof navigator === "undefined" ? undefined : navigator) {
  if (!nav) return false;
  const platform = nav.userAgentData?.platform || nav.platform || "";
  if (platform) return /mac|iphone|ipad|ipod/i.test(platform);
  return /mac|iphone|ipad|ipod/i.test(nav.userAgent || "");
}

/** `⌘K` on macOS, `Ctrl+K` everywhere else. */
export function getCommandPaletteShortcut(nav) {
  const mac = isMacPlatform(nav);
  return {
    mac,
    label: mac ? "⌘K" : "Ctrl+K",
    ariaLabel: mac ? "Command K" : "Control K",
    secondaryLabel: mac ? "⌘⇧P" : "Ctrl+Shift+P",
  };
}

/** True for Ctrl+K / Cmd+K (no Shift or Alt). */
export function isCommandPaletteShortcut(event) {
  if (!event || event.altKey || event.shiftKey) return false;
  if (!(event.ctrlKey || event.metaKey)) return false;
  return String(event.key || "").toLowerCase() === "k";
}
