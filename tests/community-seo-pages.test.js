import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, rm, mkdir, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
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
  "</head><body><div id=\\"root\\"></div><script type=\\"module\\" src=\\"/assets/app.js\\"></script></body></html>",
].join("\n");

test("community route metadata replaces homepage metadata without changing the app entry", () => {
  const html = applyCommunityMetadata(entryHtml, {
    title: "Sketchizi Reviews — Community Feedback",
    description: "Read community reviews of Sketchizi.",
    canonical: "https://sketchizi.pages.dev/reviews",
  });

  assert.ok(html.includes("<title>Sketchizi Reviews — Community Feedback</title>"));
  assert.ok(html.includes('name="description" content="Read community reviews of Sketchizi."'));
  assert.ok(html.includes('rel="canonical" href="https://sketchizi.pages.dev/reviews"'));
  assert.ok(html.includes('property="og:url" content="https://sketchizi.pages.dev/reviews"'));
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
    assert.ok(reviews.includes("https://sketchizi.pages.dev/reviews"));
    assert.ok(joinTeam.includes("<title>Join the Sketchizi Team</title>"));
    assert.ok(joinTeam.includes("https://sketchizi.pages.dev/join-team"));
    assert.ok(joinTeam.includes('src="/assets/app.js"'));
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
