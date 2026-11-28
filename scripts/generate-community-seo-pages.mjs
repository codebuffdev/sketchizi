import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COMMUNITY_SEO, INDEXABLE_ROBOTS } from "../src/features/community/communitySeo.js";

const DEFAULT_OUT_DIR = fileURLToPath(new URL("../dist/", import.meta.url));

export const COMMUNITY_PAGES = Object.fromEntries(
  Object.values(COMMUNITY_SEO).map(({ slug, title, description, canonical, robots }) => [slug, { title, description, canonical, robots }]),
);

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
  // The homepage-only crawlable summary must not leak into community routes.
  let output = html.replace(/<noscript id="sketchizi-home-summary">[\s\S]*?<\/noscript>\s*/i, "");
  output = output.replace(/<title>[\s\S]*?<\/title>/i, "<title>" + escapeAttribute(page.title) + "</title>");
  output = setMeta(output, "name", "description", page.description);
  output = setMeta(output, "name", "robots", page.robots || INDEXABLE_ROBOTS);
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
