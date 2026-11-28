// SEO metadata for the public community routes. Kept as plain data/functions so
// the client-side metadata updater (CommunityApp.jsx) and the build-time static
// HTML generator (scripts/generate-community-seo-pages.mjs) share one source of
// truth and cannot drift apart.

export const SITE_ORIGIN = "https://sketchizi.pages.dev";

export const INDEXABLE_ROBOTS = "index, follow, max-image-preview:large";
export const NOINDEX_ROBOTS = "noindex, nofollow";

export const HOME_SEO = {
  title: "Sketchizi",
  description: "Create diagrams and visualize ideas with Sketchizi.",
  canonical: SITE_ORIGIN + "/",
};

// Keys are normalized routes (no trailing slash). Canonical URLs use the final
// public URL, which is the trailing-slash form because /reviews redirects to /reviews/.
export const COMMUNITY_SEO = {
  "/reviews": {
    slug: "reviews",
    title: "Sketchizi Reviews — Community Feedback",
    description: "Read community reviews of Sketchizi, the online diagram and architecture editor.",
    canonical: SITE_ORIGIN + "/reviews/",
    robots: INDEXABLE_ROBOTS,
  },
  // Thin content (a CV-upload form): deliberately noindex and kept out of the sitemap.
  "/join-team": {
    slug: "join-team",
    title: "Join the Sketchizi Team",
    description: "Explore opportunities to contribute to Sketchizi and help build an online diagramming and architecture design tool.",
    canonical: SITE_ORIGIN + "/join-team/",
    robots: NOINDEX_ROBOTS,
  },
};

const PRIVATE_PREFIXES = ["/workspace", "/feedback", "/reviews/write", "/reviews/mine", "/admin"];

export function normalizeCommunityRoute(pathname) {
  const clean = String(pathname || "/").split(/[?#]/)[0].replace(/\/{2,}/g, "/");
  return clean.length > 1 ? clean.replace(/\/+$/, "") : "/";
}

export function isPrivateCommunityRoute(pathname) {
  const route = normalizeCommunityRoute(pathname);
  return PRIVATE_PREFIXES.some((prefix) => route === prefix || route.startsWith(prefix + "/"));
}

export function getCommunitySeo(pathname) {
  const route = normalizeCommunityRoute(pathname);
  const page = COMMUNITY_SEO[route] || HOME_SEO;
  const robots = isPrivateCommunityRoute(route) ? NOINDEX_ROBOTS : (page.robots || INDEXABLE_ROBOTS);
  return { ...page, robots };
}
