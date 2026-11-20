/**
 * Reset the in-flight guard after a failed cloud fetch so an explicit retry
 * can start a fresh request.
 */
export function resetCloudLoadAttempt(loadStartedRef) {
  if (!loadStartedRef || typeof loadStartedRef !== "object") return false;
  loadStartedRef.current = false;
  return true;
}

/** A failed fetch remains visible even though there is no active save session. */
export function shouldShowCloudLoadFailure({ loadFailed, cloudDetached }) {
  return Boolean(loadFailed && !cloudDetached);
}
