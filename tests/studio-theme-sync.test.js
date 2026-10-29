import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const app = await readFile(resolve(root, "src/App.jsx"), "utf8");
const k8s = await readFile(resolve(root, "src/features/kubernetes-studio/ui/KubernetesStudio.jsx"), "utf8");
const k8sCss = await readFile(resolve(root, "src/features/kubernetes-studio/ui/kubernetes-studio.css"), "utf8");
const docker = await readFile(resolve(root, "src/features/docker-compose/ui/DockerComposeStudio.jsx"), "utf8");
const dockerCss = await readFile(resolve(root, "src/features/docker-compose/ui/docker-compose-studio.css"), "utf8");

test("application passes the active theme to both infrastructure studios", () => {
  assert.match(app, /<DockerComposeStudio isDarkTheme=\{isDarkTheme\}/);
  assert.match(app, /<KubernetesStudio isDarkTheme=\{isDarkTheme\}/);
});

test("Kubernetes Studio uses the active theme and preserves dark mode as the default", () => {
  assert.match(k8s, /isDarkTheme = true/);
  assert.match(k8s, /k8s-studio-overlay \$\{isDarkTheme \? "theme-dark" : "theme-light"\}/);
  assert.match(k8s, /data-theme=\{isDarkTheme \? "dark" : "light"\}/);
  assert.match(k8sCss, /\.k8s-studio-overlay\.theme-light/);
  assert.match(k8sCss, /\.k8s-studio-overlay\.theme-light \.k8s-yaml-highlight \.yaml-token-key/);
  assert.match(k8sCss, /\.k8s-studio-overlay\.theme-light \.k8s-studio-inspector/);
});

test("Docker Compose Studio uses the active theme and preserves dark mode as the default", () => {
  assert.match(docker, /isDarkTheme = true/);
  assert.match(docker, /docker-studio-overlay docker-studio-k8s-layout \$\{isDarkTheme \? "theme-dark" : "theme-light"\}/);
  assert.match(docker, /data-theme=\{isDarkTheme \? "dark" : "light"\}/);
  assert.match(dockerCss, /\.docker-studio-overlay\.theme-light/);
  assert.match(dockerCss, /\.docker-studio-overlay\.theme-light \.docker-studio input/);
  assert.match(dockerCss, /\.docker-studio-overlay\.theme-light \.docker-studio-topology-node/);
});
