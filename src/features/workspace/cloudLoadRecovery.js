/**
 * Reset the in-flight guard after a failed cloud fetch so an explicit retry
 * can start a fresh request.
 */
export function resetCloudLoadAttempt(loadStartedRef) {
  if (!loadStartedRef || typeof loadStartedRef !== "object") return false;
  loadStartedRef.current = false;
  return true;
}

/** Keep failed and in-progress cloud loads visible without an active save session. */
export function shouldShowCloudLoadStatus({ loadFailed, loadInProgress, cloudDetached }) {
  return Boolean((loadFailed || loadInProgress) && !cloudDetached);
}
