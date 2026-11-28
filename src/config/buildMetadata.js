// Build metadata (git commit, branch, timestamp). Values are resolved at build
// time by vite.config.js from the environment and injected as __SKETCHIZI_BUILD__.
// Lookup order for the commit: VITE_GIT_COMMIT_HASH, NEXT_PUBLIC_GIT_COMMIT_HASH,
// CF_PAGES_COMMIT_SHA, VERCEL_GIT_COMMIT_SHA, then "dev-local".
// Commit subject: VITE_GIT_COMMIT_MESSAGE, CF_PAGES_COMMIT_MESSAGE, VERCEL_GIT_COMMIT_MESSAGE
// (vite.config.js falls back to `git log -1 --pretty=%s` when none is set).

export const DEV_LOCAL_HASH = "dev-local";
const SHORT_HASH_LENGTH = 7;

const firstNonEmpty = (...values) => {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return "";
};

const COMMIT_MESSAGE_MAX_CHARS = 200;

/** Single-line commit subject, whitespace-collapsed and length-capped ("" when unknown). */
export const normalizeCommitMessage = (value) => {
  if (typeof value !== "string") return "";
  const line = value.trim().split(/\r?\n/, 1)[0].replace(/\s+/g, " ").trim();
  return line.length > COMMIT_MESSAGE_MAX_CHARS ? `${line.slice(0, COMMIT_MESSAGE_MAX_CHARS - 1)}…` : line;
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
  const commitMessage = normalizeCommitMessage(firstNonEmpty(
    env.VITE_GIT_COMMIT_MESSAGE,
    env.CF_PAGES_COMMIT_MESSAGE,
    env.VERCEL_GIT_COMMIT_MESSAGE,
  ));
  return {
    shortHash: fullHash === DEV_LOCAL_HASH ? DEV_LOCAL_HASH : fullHash.slice(0, SHORT_HASH_LENGTH),
    fullHash,
    branch,
    commitMessage,
    builtAt,
  };
}

/** Returns { shortHash, fullHash, branch, commitMessage, builtAt } for the running bundle. */
export function getBuildMetadata() {
  /* global __SKETCHIZI_BUILD__ */
  if (typeof __SKETCHIZI_BUILD__ !== "undefined" && __SKETCHIZI_BUILD__) {
    return resolveBuildMetadata({
      VITE_GIT_COMMIT_HASH: __SKETCHIZI_BUILD__.fullHash,
      VITE_GIT_BRANCH: __SKETCHIZI_BUILD__.branch,
      VITE_GIT_COMMIT_MESSAGE: __SKETCHIZI_BUILD__.commitMessage,
      VITE_BUILD_TIMESTAMP: __SKETCHIZI_BUILD__.builtAt,
    });
  }
  return resolveBuildMetadata(import.meta.env || {});
}
