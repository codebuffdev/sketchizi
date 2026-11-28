import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DEFAULT_OUT_DIR = fileURLToPath(new URL("../dist/", import.meta.url));
const SITE_ORIGIN = "https://sketchizi.pages.dev";

export const COMMUNITY_PAGES = {
  reviews: {
    title: "Sketchizi Reviews — Community Feedback",
    description: "Read community reviews of Sketchizi, the online diagram and architecture editor.",
    canonical: SITE_ORIGIN + "/reviews",
  },
  "join-team": {
    title: "Join the Sketchizi Team",
    description: "Explore opportunities to contribute to Sketchizi and help build an online diagramming and architecture design tool.",
    canonical: SITE_ORIGIN + "/join-team",
  },
};

function escapeAttribute(value) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;");
}

function setMeta(html, attribute, key, content) {
  const escaped = escapeAttribute(content);
  const marker = '<meta ' + attribute + '="' + key + '"';
  const tag = '<meta ' + attribute + '="' + key + '" content="' + escaped + '" />';
  const start = html.indexOf(marker);
  if (start < 0) return html;
  const end = html.indexOf(">", start);
  return end < 0 ? html : html.slice(0, start) + tag + html.slice(end + 1);
}

function setCanonical(html, canonical) {
  const tag = '<link rel="canonical" href="' + escapeAttribute(canonical) + '" />';
  const selector = /<link\s+rel=["']canonical["'][^>]*>/i;
  return selector.test(html) ? html.replace(selector, tag) : html;
}

export function applyCommunityMetadata(html, page) {
  let output = html.replace(/<title>[\s\S]*?<\/title>/i, "<title>" + escapeAttribute(page.title) + "</title>");
  output = setMeta(output, "name", "description", page.description);
  output = setMeta(output, "name", "robots", "index, follow, max-image-preview:large");
  output = setMeta(output, "property", "og:type", "website");
  output = setMeta(output, "property", "og:site_name", "Sketchizi");
  output = setMeta(output, "property", "og:title", page.title);
  output = setMeta(output, "property", "og:description", page.description);
  output = setMeta(output, "property", "og:url", page.canonical);
  output = setMeta(output, "name", "twitter:card", "summary_large_image");
  output = setMeta(output, "name", "twitter:title", page.title);
  output = setMeta(output, "name", "twitter:description", page.description);
  output = setCanonical(output, page.canonical);
  return output;
}

export async function generateCommunitySeoPages(outDir = DEFAULT_OUT_DIR) {
  const entryHtml = await readFile(path.join(outDir, "index.html"), "utf8");

  for (const [slug, page] of Object.entries(COMMUNITY_PAGES)) {
    const pageDir = path.join(outDir, slug);
    await mkdir(pageDir, { recursive: true });
    await writeFile(path.join(pageDir, "index.html"), applyCommunityMetadata(entryHtml, page), "utf8");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await generateCommunitySeoPages();
}
