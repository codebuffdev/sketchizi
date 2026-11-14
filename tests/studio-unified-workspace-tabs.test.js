import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const read = (path) => readFile(new URL("../" + path, import.meta.url), "utf8");

test("Compose Studio preserves YAML editor and uses focused navigation", async () => {
  const source = await read("src/features/docker-compose/ui/DockerComposeStudio.jsx");
  for (const label of ["Services", "Dependencies", "Validation", "Convert to K8s", "Docker Compose YAML", "Create diagram"]) assert.ok(source.includes(label), "Missing " + label);
  assert.match(source, /studio-tab-" \+ workspaceTab/);
  assert.match(source, /setShowConversion\(true\)/);
});
test("Kubernetes Studio provides focused resources, validation and insights views", async () => {
  const source = await read("src/features/kubernetes-studio/ui/KubernetesStudio.jsx");
  for (const label of ["Resources", "Validation (", "Insights", "Manifest overview", "Kubernetes YAML manifest"]) assert.ok(source.includes(label), "Missing " + label);
  assert.match(source, /studio-tab-" \+ workspaceTab/);
});
test("Both Studios retain keyboard-visible navigation and contextual panels", async () => {
  for (const path of ["src/features/docker-compose/ui/docker-compose-studio.css", "src/features/kubernetes-studio/ui/kubernetes-studio.css"]) {
    const css = await read(path);
    assert.match(css, /\.studio-workspace-tabs button:focus-visible/);
    assert.match(css, /\.studio-workspace-tabs button\.active/);
  }
});

test("Kubernetes mock implementation places resources before YAML and keeps validation contextual", async () => {
  const source = await read("src/features/kubernetes-studio/ui/KubernetesStudio.jsx");
  const css = await read("src/features/kubernetes-studio/ui/kubernetes-studio.css");
  assert.match(source, /k8s-studio-validation-summary/);
  assert.match(source, /setWorkspaceTab\("validation"\)/);
  assert.match(source, /aria-label="Parsed Kubernetes resources"/);
  assert.match(css, /\.k8s-studio \.k8s-studio-preview\{grid-column:1/);
  assert.match(css, /\.k8s-studio \.k8s-studio-editor\{grid-column:3/);
});

test("Kubernetes redesign keeps snapshot inside Insights and groups validation by resource", async () => {
  const source = await read("src/features/kubernetes-studio/ui/KubernetesStudio.jsx");
  const css = await read("src/features/kubernetes-studio/ui/kubernetes-studio.css");
  assert.match(source, /workspaceTab === "insights" && <details className="k8s-studio-snapshot-card"/);
  assert.equal((source.match(/Inspect read-only Kubernetes snapshot/g) || []).length, 1);
  assert.match(source, /k8s-studio-diagnostic-groups/);
  assert.match(source, /k8s-studio-diagnostic-fix/);
  assert.match(source, /k8s-studio-header-actions/);
  assert.match(css, /\.k8s-studio \.k8s-studio-snapshot-card textarea/);
  assert.match(css, /\.k8s-studio \.k8s-studio-diagnostic-inspect:focus-visible/);
});

test("Compose redesign renders contextual validation and conversion inside left workspace", async () => {
  const source = await read("src/features/docker-compose/ui/DockerComposeStudio.jsx");
  const css = await read("src/features/docker-compose/ui/docker-compose-studio.css");
  const aside = source.indexOf('aria-label="Compose workspace details"');
  const conversion = source.indexOf('aria-label="Kubernetes conversion preview"');
  const validation = source.indexOf('aria-label="Compose validation"');
  const asideEnd = source.indexOf("</aside>", aside);
  assert.ok(aside > 0 && conversion > aside && validation > conversion && asideEnd > validation, "Contextual panels must remain inside left workspace");
  assert.match(css, /\.docker-studio \.docker-studio-resource-pane\{grid-column:1/);
  assert.match(css, /\.docker-studio \.docker-studio-yaml-pane\{grid-column:2/);
  assert.match(css, /\.docker-studio \.docker-studio-resource-pane \.docker-studio-container-list\{max-height:none/);
});
