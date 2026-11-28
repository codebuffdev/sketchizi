import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { readFileSync } from "node:fs";
import { getCommunitySeo, isPrivateCommunityRoute, normalizeCommunityRoute } from "../src/features/community/communitySeo.js";
import { applyCommunityMetadata, generateCommunitySeoPages } from "../scripts/generate-community-seo-pages.mjs";

const entryHtml = [
  "<!doctype html>",
  '<html lang="en"><head>',
  "<title>Sketchizi home</title>",
  '<meta name="description" content="Home description" />',
  '<link rel="canonical" href="https://sketchizi.pages.dev/" />',
  '<meta name="robots" content="index, follow" />',
  '<meta property="og:type" content="website" />',
  '<meta property="og:site_name" content="Sketchizi" />',
  '<meta property="og:title" content="Sketchizi home" />',
  '<meta property="og:description" content="Home description" />',
  '<meta property="og:url" content="https://sketchizi.pages.dev/" />',
  '<meta name="twitter:card" content="summary_large_image" />',
  '<meta name="twitter:title" content="Sketchizi home" />',
  '<meta name="twitter:description" content="Home description" />',
  '</head><body><div id="root"></div><script type="module" src="/assets/app.js"></script></body></html>',
].join("\n");

test("community route metadata replaces homepage metadata without changing the app entry", () => {
  const html = applyCommunityMetadata(entryHtml, {
    title: "Sketchizi Reviews — Community Feedback",
    description: "Read community reviews of Sketchizi.",
    canonical: "https://sketchizi.pages.dev/reviews/",
  });

  assert.ok(html.includes("<title>Sketchizi Reviews — Community Feedback</title>"));
  assert.ok(html.includes('name="description" content="Read community reviews of Sketchizi."'));
  assert.ok(html.includes('rel="canonical" href="https://sketchizi.pages.dev/reviews/"'));
  assert.ok(html.includes('property="og:url" content="https://sketchizi.pages.dev/reviews/"'));
  assert.ok(html.includes('name="twitter:title" content="Sketchizi Reviews — Community Feedback"'));
  assert.ok(html.includes('<div id="root"></div>'));
  assert.ok(html.includes('src="/assets/app.js"'));
});

test("build output receives separate HTML entry points for both public community routes", async () => {
  const outDir = await mkdtemp(path.join(os.tmpdir(), "sketchizi-seo-"));
  try {
    await mkdir(outDir, { recursive: true });
    await writeFile(path.join(outDir, "index.html"), entryHtml);
    await generateCommunitySeoPages(outDir);

    const reviews = await readFile(path.join(outDir, "reviews", "index.html"), "utf8");
    const joinTeam = await readFile(path.join(outDir, "join-team", "index.html"), "utf8");

    assert.ok(reviews.includes("<title>Sketchizi Reviews — Community Feedback</title>"));
    assert.ok(reviews.includes('rel="canonical" href="https://sketchizi.pages.dev/reviews/"'));
    assert.ok(reviews.includes('name="robots" content="index, follow, max-image-preview:large"'));
    assert.ok(joinTeam.includes("<title>Join the Sketchizi Team</title>"));
    assert.ok(joinTeam.includes('rel="canonical" href="https://sketchizi.pages.dev/join-team/"'));
    assert.ok(joinTeam.includes('name="robots" content="noindex, nofollow"'));
    assert.ok(joinTeam.includes('src="/assets/app.js"'));
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

const readProject = (relative) => readFileSync(new URL(relative, import.meta.url), "utf8");
const HOME = "https://sketchizi.pages.dev/";

test("community route lookup treats trailing-slash and bare variants identically", () => {
  for (const route of ["/reviews", "/reviews/", "/reviews//"]) {
    const page = getCommunitySeo(route);
    assert.equal(page.title, "Sketchizi Reviews — Community Feedback", route);
    assert.equal(page.canonical, "https://sketchizi.pages.dev/reviews/", route);
    assert.notEqual(page.canonical, HOME, route);
    assert.match(page.robots, /^index, follow/, route);
  }
  for (const route of ["/join-team", "/join-team/"]) {
    const page = getCommunitySeo(route);
    assert.equal(page.title, "Join the Sketchizi Team", route);
    assert.equal(page.canonical, "https://sketchizi.pages.dev/join-team/", route);
    assert.equal(page.robots, "noindex, nofollow", route);
  }
  assert.equal(normalizeCommunityRoute("/"), "/");
  assert.equal(normalizeCommunityRoute("/reviews/?x=1#y"), "/reviews");
});

test("private and nested private routes stay noindex with and without trailing slashes", () => {
  const privateRoutes = [
    "/reviews/write", "/reviews/write/", "/reviews/write/step/2",
    "/reviews/mine", "/reviews/mine/", "/reviews/mine/edit/",
    "/feedback", "/feedback/", "/feedback/new", "/feedback/123/",
    "/admin", "/admin/", "/admin/reviews", "/workspace", "/workspace/",
  ];
  for (const route of privateRoutes) {
    assert.equal(isPrivateCommunityRoute(route), true, route);
    assert.equal(getCommunitySeo(route).robots, "noindex, nofollow", route);
  }
  assert.equal(isPrivateCommunityRoute("/reviews"), false);
  assert.equal(isPrivateCommunityRoute("/reviews/"), false);
  assert.equal(isPrivateCommunityRoute("/reviewsx"), false);
});

test("sitemap lists the final canonical review URL and excludes noindex pages", () => {
  const locs = [...readProject("../public/sitemap.xml").matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  assert.ok(locs.includes("https://sketchizi.pages.dev/reviews/"));
  assert.ok(!locs.includes("https://sketchizi.pages.dev/reviews"));
  assert.ok(!locs.some((loc) => loc.includes("join-team")));
  assert.equal(new Set(locs).size, locs.length);
  const headers = readProject("../public/_headers");
  assert.match(headers, /\/join-team\*\s+X-Robots-Tag: noindex, nofollow/);
});

test("homepage has a static crawlable Resources link and keeps the app mount intact", () => {
  const html = readProject("../index.html");
  assert.match(html, /<noscript id="sketchizi-home-summary">[\s\S]*<a href="\/resources\/">[\s\S]*<\/noscript>/);
  assert.match(html, /<div id="root"><\/div>/);
  assert.match(html, /<script type="module" src="\/src\/main\.jsx"><\/script>/);
});

test("community pages do not inherit the homepage-only noscript summary", () => {
  const withSummary = entryHtml.replace("<div id=\"root\"></div>", '<div id="root"></div><noscript id="sketchizi-home-summary"><a href="/resources/">r</a></noscript>');
  const out = applyCommunityMetadata(withSummary, getCommunitySeo("/reviews/"));
  assert.ok(!out.includes("sketchizi-home-summary"));
  assert.ok(out.includes('<div id="root"></div>'));
});

test("six static content pages keep their metadata and reference an existing absolute og:image", () => {
  for (const dir of ["resources", "flowchart-maker", "uml-diagram-maker", "architecture-diagrams", "kubernetes-visualizer", "docker-compose-visualizer"]) {
    const html = readProject(`../public/${dir}/index.html`);
    assert.match(html, /<title>[^<]+<\/title>/, dir);
    assert.match(html, new RegExp(`rel="canonical" href="https://sketchizi\\.pages\\.dev/${dir}/"`), dir);
    assert.match(html, /name="robots" content="index,follow/, dir);
    const image = html.match(/property="og:image" content="(https:\/\/sketchizi\.pages\.dev\/[^"]+)"/);
    assert.ok(image, `${dir} og:image`);
    const file = new URL("../public/" + image[1].replace("https://sketchizi.pages.dev/", ""), import.meta.url);
    assert.ok(readFileSync(file).length > 0, `${dir} og:image file exists`);
    assert.ok(html.includes(`name="twitter:image" content="${image[1]}"`), dir);
  }
});
