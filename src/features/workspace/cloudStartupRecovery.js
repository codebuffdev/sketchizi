/** Mark a background refresh failure as a load failure, never a save failure. */
export function markCloudStartupLoadFailure(tab, error) {
  const message = error?.message || "Could not refresh this diagram from Cloud Workspace.";
  return {
    ...tab,
    snapshot: {
      ...tab?.snapshot,
      // Keep the cached document intact. A failed download must not offer a
      // save retry that could overwrite the newer authoritative cloud copy.
      cloudSaveState: {
        state: "load-error",
        error: `Could not refresh this diagram from Cloud Workspace. Showing the last cached copy. ${message}`,
      },
    },
  };
}
