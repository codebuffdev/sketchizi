import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const app = readFileSync(new URL("../src/App.jsx", import.meta.url), "utf8");

const OPTIONAL_COMPONENTS = [
  ["CreateDesignScreen", "./features/design/ui/CreateDesignScreen.jsx"],
  ["DockerComposeStudio", "./features/docker-compose/ui/DockerComposeStudio.jsx"],
  ["KubernetesStudio", "./features/kubernetes-studio/ui/KubernetesStudio.jsx"],
  ["CloudSaveDialog", "./features/workspace/CloudSaveDialog.jsx"],
  ["ExportStudioModal", "./components/app/ExportStudioModal"],
  ["ArchitectureTemplatesModal", "./components/app/ArchitectureTemplatesModal"],
];

test("optional studios load on demand, while core Excalidraw remains eagerly available", () => {
  assert.match(app, /import \{ lazy, Suspense, useCallback/);
  assert.match(app, /import SketchiziCanvas from "\.\/components\/app\/SketchiziCanvas"/);
  for (const [name, path] of OPTIONAL_COMPONENTS) {
    assert.ok(app.includes("const " + name + ' = lazy(() => import("' + path + '"));'), name + " should use React.lazy");
    assert.doesNotMatch(app, new RegExp("import " + name + " from"), name + " should not be eager");
  }
  assert.match(app, /<Suspense fallback=\{<div className="sketchizi-toast" role="status" aria-live="polite">Opening tool…<\/div>\}>/);
});

test("each lazy studio retains its original open gate and creation callbacks", () => {
  assert.match(app, /\{dockerStudioOpen && <DockerComposeStudio onClose=\{\(\) => setDockerStudioOpen\(false\)\} onCreateDiagram=\{createComposeDiagram\}/);
  assert.match(app, /\{kubernetesStudioOpen && <KubernetesStudio onClose=\{\(\) => setKubernetesStudioOpen\(false\)\} onCreateDiagram=\{createKubernetesDiagram\} onApplyResourceYaml=\{applyKubernetesResourceYaml\}/);
  assert.match(app, /\{designStudioOpen && \(\s*<CreateDesignScreen/);
  assert.match(app, /onCreate=\{createDesignFromStudio\}/);
  assert.match(app, /\{exportStudioOpen && \(\s*<ExportStudioModal/);
  assert.match(app, /\{templatesModalOpen && \(\s*<ArchitectureTemplatesModal/);
  assert.match(app, /\{cloudSaveDialogOpen && <CloudSaveDialog/);
});
