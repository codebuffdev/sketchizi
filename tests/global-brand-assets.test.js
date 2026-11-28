import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

test("document metadata uses the unified Sketchizi brand", () => {
  const html = read("../index.html");
  assert.match(html, /<title>Sketchizi — Free Online Diagram &amp; Architecture Designer<\/title>/);
  assert.match(html, /href="\/sketchizi-icon\.svg"/);
  assert.match(html, /content="#0b0f17"/);
  assert.match(html, /sketchizi-icon\.svg/);
});

test("PWA manifest uses the unified dark brand theme and scalable icon", () => {
  const manifest = JSON.parse(read("../public/manifest.webmanifest"));
  assert.equal(manifest.theme_color, "#0b0f17");
  assert.equal(manifest.background_color, "#0b0f17");
  assert.ok(manifest.icons.some((icon) => icon.src === "/sketchizi-icon.svg" && icon.type === "image/svg+xml"));
});

test("canvas menu retains its hamburger while both studios use the Sketchizi brand mark", () => {
  const header = read("../src/components/app/DesktopAppHeader.jsx");
  assert.match(header, /M4 6h16M4 12h16M4 18h16/);
  assert.doesNotMatch(header, /sketchizi-icon\.svg/);
  assert.match(read("../src/features/kubernetes-studio/ui/KubernetesStudio.jsx"), /src="\/sketchizi-icon\.svg"/);
  assert.match(read("../src/features/docker-compose/ui/DockerComposeStudio.jsx"), /src="\/sketchizi-icon\.svg"/);
});

test("logo and favicon SVGs contain the Sketchizi artwork", () => {
  assert.match(read("../public/sketchizi-logo.svg"), /Sketchizi/);
  assert.match(read("../public/sketchizi-icon.svg"), /fill-rule="evenodd"/);
});
