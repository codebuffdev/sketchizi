import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

test("Tool menu is the single quiet launcher for Cloud icons and both studios", () => {
  const menu = read("src/components/app/MoreTools.jsx");
  for (const id of ["cloud-icons", "kubernetes", "docker"]) assert.ok(menu.includes(`"${id}"`), id);
  assert.match(menu, /data-more-tools-studio=\{id\}/);
  assert.match(menu, /onOpenKubernetesStudio[\s\S]*onOpenDockerComposeStudio[\s\S]*onOpenIconLibrary/);
});

test("App mounts both studios lazily and only while open, and wires launcher + palette", () => {
  const app = read("src/App.jsx");
  assert.match(app, /const KubernetesStudio = lazy\(/);
  assert.match(app, /const DockerComposeStudio = lazy\(/);
  assert.match(app, /\{kubernetesStudioOpen && <KubernetesStudio /);
  assert.match(app, /\{dockerStudioOpen && <DockerComposeStudio /);
  assert.match(app, /openKubernetesStudio: \(\) => setKubernetesStudioOpen\(true\)/);
  assert.match(app, /openDockerComposeStudio: \(\) => setDockerStudioOpen\(true\)/);
  assert.match(app, /onOpenKubernetesStudio=\{\(\) =>/);
  assert.match(app, /onOpenDockerComposeStudio=\{\(\) =>/);
  assert.match(app, /onOpenIconLibrary=\{\(\) =>/);
});

test("no persistent studio chrome or validation pill returns to the header", () => {
  const header = read("src/components/app/DesktopAppHeader.jsx");
  assert.ok(!/SmartStudioPill|Validate Arch|onOpenKubernetesStudio|onOpenDockerComposeStudio/.test(header));
});

test("Ctrl/Cmd+K can find the icon library by 'cloud icons'", () => {
  const registry = read("src/features/commands/commandRegistry.js");
  assert.match(registry, /"cloud icons"/);
});

test("browser smoke test is present and wired to npm run test:e2e", () => {
  const pkg = JSON.parse(read("package.json"));
  assert.equal(pkg.scripts["test:e2e"], "playwright test");
  assert.ok(pkg.devDependencies["@playwright/test"]);
  assert.match(read("e2e/smoke.spec.js"), /Ctrl\+K|Control\+K/);
});
