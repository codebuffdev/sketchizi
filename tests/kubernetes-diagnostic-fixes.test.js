import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { analyzeArchitectureGraph } from "../src/features/architecture/architectureGraphService.js";
import { validateArchitectureWithProviderRules } from "../src/features/architecture/architectureValidationComposition.js";
import { applyKubernetesRelationshipSuggestion } from "../src/features/architecture/kubernetesDiagnosticFixService.js";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function resource(id, resourceType, provider = "kubernetes") {
  const idKey = provider === "aws" ? "awsResourceId" : provider === "networking" ? "networkingResourceId" : "kubernetesResourceId";
  const key = provider === "aws" ? "awsResource" : provider === "networking" ? "networkingResource" : "kubernetesResource";
  return {
    id: `element-${id}`, type: "rectangle", x: 4, y: 5, width: 100, height: 70,
    customData: { retained: "metadata", [key]: {
      [idKey]: id, definitionId: `${provider}:${resourceType}`, provider,
      resourceType, properties: { name: id },
    } },
  };
}

function connector(id, source, target, relationshipType, provider = "kubernetes") {
  const key = provider === "aws" ? "awsRelationship" : provider === "networking" ? "networkingRelationship" : "kubernetesRelationship";
  return {
    id: `connector-${id}`, type: "arrow", startBinding: { elementId: `element-${source}` }, endBinding: { elementId: `element-${target}` },
    customData: { callerMetadata: { keep: true }, [key]: {
      relationshipId: id, sourceResourceId: source, targetResourceId: target, relationshipType,
      extendedMetadata: "preserve me",
    } },
  };
}

function diagnosticFor(scene, relationshipId, code = "KUBERNETES_INVALID_RELATIONSHIP") {
  const result = validateArchitectureWithProviderRules(analyzeArchitectureGraph(scene));
  return [...result.errors, ...result.warnings, ...result.info].find((item) => item.relationshipId === relationshipId && item.code === code);
}

test("explicit Kubernetes correction changes only relationship type and preserves IDs/endpoints/metadata", () => {
  const scene = [resource("service-1", "service"), resource("pod-1", "pod"), connector("edge-1", "service-1", "pod-1", "contains")];
  const original = structuredClone(scene);
  const diagnostic = diagnosticFor(scene, "edge-1");
  assert.ok(diagnostic);
  const result = applyKubernetesRelationshipSuggestion(scene, diagnostic, "exposes");
  assert.equal(result.changed, true);
  const updated = result.elements.find((element) => element.id === "connector-edge-1");
  assert.deepEqual(updated.customData.kubernetesRelationship, {
    relationshipId: "edge-1", sourceResourceId: "service-1", targetResourceId: "pod-1", relationshipType: "exposes", extendedMetadata: "preserve me",
  });
  assert.deepEqual(updated.customData.callerMetadata, { keep: true });
  assert.deepEqual(result.elements.find((element) => element.id === "element-service-1").customData, original[0].customData);
  assert.deepEqual(scene, original, "suggestion service must not mutate the original scene");
});

test("unsupported suggestions are rejected without changing the scene", () => {
  const scene = [resource("service-1", "service"), resource("pod-1", "pod"), connector("edge-1", "service-1", "pod-1", "contains")];
  const diagnostic = diagnosticFor(scene, "edge-1");
  const result = applyKubernetesRelationshipSuggestion(scene, diagnostic, "runs-on");
  assert.equal(result.changed, false);
  assert.match(result.error, /not suggested|no longer compatible/);
  assert.equal(scene[2].customData.kubernetesRelationship.relationshipType, "contains");
});

test("unknown types are offered only compatible corrections for their endpoints", () => {
  const scene = [resource("service-1", "service"), resource("pod-1", "pod"), connector("edge-unknown", "service-1", "pod-1", "route-now")];
  const diagnostic = diagnosticFor(scene, "edge-unknown", "KUBERNETES_UNKNOWN_RELATIONSHIP_TYPE");
  assert.deepEqual(diagnostic.suggestedRelationshipTypes, ["connects-to", "exposes"]);
  const result = applyKubernetesRelationshipSuggestion(scene, diagnostic, "exposes");
  assert.equal(result.changed, true);
});

test("stale diagnostic cannot change a relationship that has already become compatible", () => {
  const initial = [resource("pod-1", "pod"), resource("node-1", "node"), connector("edge-stale", "pod-1", "node-1", "contains")];
  const staleDiagnostic = diagnosticFor(initial, "edge-stale");
  const changedElsewhere = initial.map((element) => element.id === "connector-edge-stale" ? {
    ...element,
    customData: { ...element.customData, kubernetesRelationship: { ...element.customData.kubernetesRelationship, relationshipType: "runs-on" } },
  } : element);
  const result = applyKubernetesRelationshipSuggestion(changedElsewhere, staleDiagnostic, "connects-to");
  assert.equal(result.changed, false);
  assert.match(result.error, /already compatible|Run validation again/);
  assert.equal(changedElsewhere[2].customData.kubernetesRelationship.relationshipType, "runs-on");
});

test("stale endpoint changes and duplicate relationship IDs are rejected", () => {
  const initial = [resource("pod-1", "pod"), resource("node-1", "node"), connector("edge-stale-endpoint", "pod-1", "node-1", "contains")];
  const staleDiagnostic = diagnosticFor(initial, "edge-stale-endpoint");
  const retargeted = initial.map((element) => element.id === "connector-edge-stale-endpoint" ? {
    ...element,
    customData: { ...element.customData, kubernetesRelationship: { ...element.customData.kubernetesRelationship, targetResourceId: "pod-1" } },
  } : element);
  const stale = applyKubernetesRelationshipSuggestion(retargeted, staleDiagnostic, "connects-to");
  assert.equal(stale.changed, false);
  assert.match(stale.error, /changed after this finding/);

  const duplicated = [...initial, { ...initial[2], id: "connector-duplicate-edge" }];
  const duplicateResult = applyKubernetesRelationshipSuggestion(duplicated, staleDiagnostic, "runs-on");
  assert.equal(duplicateResult.changed, false);
  assert.match(duplicateResult.error, /duplicated/);
});

test("missing endpoints and non-Kubernetes diagnostics cannot be auto-corrected", () => {
  const scene = [resource("service-1", "service"), connector("edge-missing", "service-1", "missing", "route-now")];
  const missing = applyKubernetesRelationshipSuggestion(scene, {
    provider: "kubernetes", code: "KUBERNETES_UNKNOWN_RELATIONSHIP_TYPE", relationshipId: "edge-missing", suggestedRelationshipTypes: ["connects-to"],
  }, "connects-to");
  assert.equal(missing.changed, false);
  assert.match(missing.error, /endpoints/);
  const aws = applyKubernetesRelationshipSuggestion(scene, {
    provider: "aws", code: "KUBERNETES_INVALID_RELATIONSHIP", relationshipId: "edge-missing", suggestedRelationshipTypes: ["connects-to"],
  }, "connects-to");
  assert.equal(aws.changed, false);
});

test("apply actions are separate buttons, edit access gated, and confirmation is explicit", async () => {
  const [panel, app] = await Promise.all([
    readFile(resolve(root, "src/components/app/ArchitectureValidationPanel.jsx"), "utf8"),
    readFile(resolve(root, "src/App.jsx"), "utf8"),
  ]);
  assert.match(panel, /onApplyKubernetesSuggestion/);
  assert.match(panel, /canApplyCorrections/);
  assert.match(panel, /architecture-validation-fix-button/);
  assert.match(panel, /You’ll be asked to confirm/);
  assert.match(app, /window\.confirm/);
  assert.match(app, /Only the relationship type will change/);
  assert.match(app, /canApplyCorrections=\{collaborationCanEdit\}/);
  assert.match(app, /\{ provider: "kubernetes", entry: element\.customData\?\.kubernetesRelationship \}/);
  assert.match(app, /diagnostic\.provider && provider && provider !== diagnostic\.provider/);
});

test("the correction service has no provider-generic mutation path", async () => {
  const service = await readFile(resolve(root, "src/features/architecture/kubernetesDiagnosticFixService.js"), "utf8");
  assert.match(service, /diagnostic\?\.provider !== "kubernetes"/);
  assert.match(service, /compatibleTypes\.includes\(relationshipType\)/);
  assert.match(service, /updateKubernetesRelationshipMetadata/);
});


test("K8s Studio validates StatefulSet, HPA, CronJob and NetworkPolicy invariants", async () => {
  const studio = await readFile(resolve(root, "src/features/kubernetes-studio/ui/KubernetesStudio.jsx"), "utf8");
  assert.match(studio, /StatefulSet must define spec\.serviceName/);
  assert.match(studio, /HPA minReplicas cannot exceed maxReplicas/);
  assert.match(studio, /CronJob concurrencyPolicy must be Allow, Forbid, or Replace/);
  assert.match(studio, /NetworkPolicy must define spec\.podSelector/);
  assert.match(studio, /NetworkPolicy policyTypes entries must be Ingress or Egress/);
  assert.match(studio, /NetworkPolicy .* ports must be a list/);
});


test("K8s Studio validates Service routing against matching workload ports", async () => {
  const studio = await readFile(resolve(root, "src/features/kubernetes-studio/ui/KubernetesStudio.jsx"), "utf8");
  assert.match(studio, /duplicate port\/protocol pair/);
  assert.match(studio, /Named targetPort .* is not declared by a matching workload container/);
  assert.match(studio, /Service port name .* must be a lowercase alphanumeric name/);
  assert.match(studio, /matchingWorkloads = workloads\.filter/);
});


test("cross-resource validation resolves cluster-scoped dependencies independent of namespace", async () => {
  const studio = await readFile(resolve(root, "src/features/kubernetes-studio/ui/KubernetesStudio.jsx"), "utf8");
  assert.match(studio, /const CLUSTER_SCOPED_KINDS = new Set/);
  assert.match(studio, /CLUSTER_SCOPED_KINDS\.has\(kind\) \|\| namespace == null \|\| candidate\.namespace === namespace/);
  assert.match(studio, /Role binding references .* which is not present in this manifest set/);
});
