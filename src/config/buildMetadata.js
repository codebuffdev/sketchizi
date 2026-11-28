// Build metadata (git commit, branch, timestamp). Values are resolved at build
// time by vite.config.js from the environment and injected as __SKETCHIZI_BUILD__.
// Lookup order for the commit: VITE_GIT_COMMIT_HASH, NEXT_PUBLIC_GIT_COMMIT_HASH,
// CF_PAGES_COMMIT_SHA, VERCEL_GIT_COMMIT_SHA, then "dev-local".

export const DEV_LOCAL_HASH = "dev-local";
const SHORT_HASH_LENGTH = 7;

const firstNonEmpty = (...values) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
};

/** Pure resolver: works in Node (vite.config.js, tests) and in the browser. */
export function resolveBuildMetadata(env = {}, now = new Date()) {
  const fullHash = firstNonEmpty(
    env.VITE_GIT_COMMIT_HASH,
    env.NEXT_PUBLIC_GIT_COMMIT_HASH,
    env.CF_PAGES_COMMIT_SHA,
    env.VERCEL_GIT_COMMIT_SHA,
  ) || DEV_LOCAL_HASH;
  const branch = firstNonEmpty(env.VITE_GIT_BRANCH, env.CF_PAGES_BRANCH, env.VERCEL_GIT_COMMIT_REF);
  const builtAt = firstNonEmpty(env.VITE_BUILD_TIMESTAMP) || now.toISOString();
  return {
    shortHash: fullHash === DEV_LOCAL_HASH ? DEV_LOCAL_HASH : fullHash.slice(0, SHORT_HASH_LENGTH),
    fullHash,
    branch,
    builtAt,
  };
}

/** Returns { shortHash, fullHash, branch, builtAt } for the running bundle. */
export function getBuildMetadata() {
  /* global __SKETCHIZI_BUILD__ */
  if (typeof __SKETCHIZI_BUILD__ !== "undefined" && __SKETCHIZI_BUILD__) {
    return resolveBuildMetadata({
      VITE_GIT_COMMIT_HASH: __SKETCHIZI_BUILD__.fullHash,
      VITE_GIT_BRANCH: __SKETCHIZI_BUILD__.branch,
      VITE_BUILD_TIMESTAMP: __SKETCHIZI_BUILD__.builtAt,
    });
  }
  return resolveBuildMetadata(import.meta.env || {});
}
