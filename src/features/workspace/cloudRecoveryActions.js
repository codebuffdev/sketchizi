/** Derive safe recovery actions from the current cloud operation state. */
export function getCloudRecoveryActions({ state, loadFailed = false } = {}) {
  const retryLoad = Boolean(loadFailed || state === "load-error");
  const retrySave = state === "error" && !loadFailed;
  const conflict = state === "conflict";

  return {
    retryLoad,
    retrySave,
    downloadBackup: retrySave || conflict,
    reloadLatest: conflict,
  };
}
