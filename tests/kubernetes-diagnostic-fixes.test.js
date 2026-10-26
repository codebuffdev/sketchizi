import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { analyzeArchitectureGraph } from "../src/features/architecture/architectureGraphService.js";
import { validateArchitectureWithProviderRules } from "../src/features/architecture/architectureValidationComposition.js";
import { applyKubernetesRelationshipSuggestion } from "../src/features/architecture/kubernetesDiagnosticFixService.js";
import { validateKubernetesResources } from "../src/features/kubernetes-studio/validation/validateKubernetesResources.js";

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


test("K8s Studio security checks cover host namespaces, service-account tokens and container hardening", async () => {
  const studio = (await Promise.all([readFile(resolve(root, "src/features/kubernetes-studio/ui/KubernetesStudio.jsx"), "utf8"), readFile(resolve(root, "src/features/kubernetes-studio/validation/validateKubernetesResources.js"), "utf8")])).join("\n");
  assert.match(studio, /Pod uses hostNetwork/);
  assert.match(studio, /Pod uses hostPID/);
  assert.match(studio, /Pod uses hostIPC/);
  assert.match(studio, /explicitly automounts its ServiceAccount token/);
  assert.match(studio, /does not declare a seccomp profile/);
  assert.match(studio, /does not explicitly disable privilege escalation/);
  assert.match(studio, /adds high-risk Linux capability/);
  assert.match(studio, /does not drop all Linux capabilities/);
});

test("K8s Studio validates image policies, probes, Service types, Ingress routes and PVC access modes", async () => {
  const studio = (await Promise.all([readFile(resolve(root, "src/features/kubernetes-studio/ui/KubernetesStudio.jsx"), "utf8"), readFile(resolve(root, "src/features/kubernetes-studio/validation/validateKubernetesResources.js"), "utf8")])).join("\n");
  assert.match(studio, /invalid imagePullPolicy/);
  assert.match(studio, /references named port/);
  assert.match(studio, /HTTP probe does not declare a path/);
  assert.match(studio, /probeName.*timingField/s);
  assert.match(studio, /Service type must be ClusterIP, NodePort, LoadBalancer, or ExternalName/);
  assert.match(studio, /ExternalName Service must define spec\.externalName/);
  assert.match(studio, /Ingress repeats host\/path route/);
  assert.match(studio, /PersistentVolumeClaim must define at least one spec\.accessModes entry/);
  assert.match(studio, /contains an unsupported access mode/);
});

test("K8s Studio validates StatefulSet, HPA, CronJob and NetworkPolicy invariants", async () => {
  const studio = (await Promise.all([readFile(resolve(root, "src/features/kubernetes-studio/ui/KubernetesStudio.jsx"), "utf8"), readFile(resolve(root, "src/features/kubernetes-studio/validation/validateKubernetesResources.js"), "utf8")])).join("\n");
  assert.match(studio, /StatefulSet must define spec\.serviceName/);
  assert.match(studio, /HPA minReplicas cannot exceed maxReplicas/);
  assert.match(studio, /CronJob concurrencyPolicy must be Allow, Forbid, or Replace/);
  assert.match(studio, /NetworkPolicy must define spec\.podSelector/);
  assert.match(studio, /NetworkPolicy policyTypes entries must be Ingress or Egress/);
  assert.match(studio, /ports must be a list/);
});


test("K8s Studio validates Service routing against matching workload ports", async () => {
  const studio = (await Promise.all([readFile(resolve(root, "src/features/kubernetes-studio/ui/KubernetesStudio.jsx"), "utf8"), readFile(resolve(root, "src/features/kubernetes-studio/validation/validateKubernetesResources.js"), "utf8")])).join("\n");
  assert.match(studio, /duplicate port\/protocol pair/);
  assert.match(studio, /Named targetPort .* is not declared by a matching workload container/);
  assert.match(studio, /Service port name .* must be a lowercase alphanumeric name/);
  assert.match(studio, /matchingWorkloads = workloads\.filter/);
});


test("cross-resource validation resolves cluster-scoped dependencies independent of namespace", async () => {
  const studio = (await Promise.all([readFile(resolve(root, "src/features/kubernetes-studio/ui/KubernetesStudio.jsx"), "utf8"), readFile(resolve(root, "src/features/kubernetes-studio/validation/validateKubernetesResources.js"), "utf8")])).join("\n");
  assert.match(studio, /const CLUSTER_SCOPED_KINDS = new Set/);
  assert.match(studio, /CLUSTER_SCOPED_KINDS\.has\(kind\) \|\| namespace == null \|\| candidate\.namespace === namespace/);
  assert.match(studio, /Role binding references .* which is not present in this manifest set/);
});

test("K8s Studio detects Kustomize and Helm source bundles before treating files as Kubernetes manifests", async () => {
  const studio = (await Promise.all([readFile(resolve(root, "src/features/kubernetes-studio/ui/KubernetesStudio.jsx"), "utf8"), readFile(resolve(root, "src/features/kubernetes-studio/validation/validateKubernetesResources.js"), "utf8")])).join("\n");
  assert.match(studio, /kustomization\\\.ya\?ml\|Kustomization/);
  assert.match(studio, /Chart\\\.yaml/);
  assert.match(studio, /kubectl kustomize .*rendered-kustomize\.yaml/);
  assert.match(studio, /helm template .*rendered-helm\.yaml/);
  assert.match(studio, /K8s Studio does not silently approximate Kustomize rendering/);
  assert.match(studio, /K8s Studio does not pretend raw templates are deployable manifests/);
  assert.match(studio, /webkitdirectory/);
  assert.match(studio, /This keeps patches, generators, and transformations accurate/);
});

test("K8s Studio validates direct env references, optional dependencies, storage classes and mount paths", async () => {
  const studio = (await Promise.all([readFile(resolve(root, "src/features/kubernetes-studio/ui/KubernetesStudio.jsx"), "utf8"), readFile(resolve(root, "src/features/kubernetes-studio/validation/validateKubernetesResources.js"), "utf8")])).join("\n");
  assert.match(studio, /has configMapKeyRef without a ConfigMap name/);
  assert.match(studio, /has secretKeyRef without a Secret name/);
  assert.match(studio, /the reference is optional/);
  assert.match(studio, /PersistentVolumeClaim references StorageClass/);
  assert.match(studio, /PersistentVolume references StorageClass/);
  assert.match(studio, /PersistentVolume claimRef references PersistentVolumeClaim/);
  assert.match(studio, /volumeMount must define mountPath/);
  assert.match(studio, /mounts more than one volume at path/);
  assert.match(studio, /defines both subPath and subPathExpr/);
});


test("K8s Studio validates rollout strategy and PodDisruptionBudget availability rules", async () => {
  const studio = await readFile(resolve(root, "src/features/kubernetes-studio/validation/validateKubernetesResources.js"), "utf8");
  assert.match(studio, /Deployment strategy\.type must be Recreate or RollingUpdate/);
  assert.match(studio, /rollingUpdate\." \+ field \+ " must be a non-negative integer or a percentage/);
  assert.match(studio, /cannot set both maxSurge and maxUnavailable to zero/);
  assert.match(studio, /PodDisruptionBudget must define exactly one of spec\.minAvailable or spec\.maxUnavailable/);
  assert.match(studio, /PodDisruptionBudget.*must be a non-negative integer or a percentage/);
  assert.match(studio, /PodDisruptionBudget selector does not match a workload/);
  assert.match(studio, /maxUnavailable is zero and may block voluntary disruptions/);
  assert.match(studio, /PodDisruptionBudget: "policy\/v1"/);
});


test("K8s Studio checks resource request/limit quantities and quota policies", async () => {
  const studio = await readFile(resolve(root, "src/features/kubernetes-studio/validation/validateKubernetesResources.js"), "utf8");
  assert.match(studio, /has an invalid /);
  assert.match(studio, /quantity/);
  assert.match(studio, /above its configured limit/);
  assert.match(studio, /ResourceQuota should define spec\.hard limits/);
  assert.match(studio, /ResourceQuota hard limit .* cannot be empty/);
  assert.match(studio, /LimitRange should define at least one spec\.limits entry/);
  assert.match(studio, /has an unsupported type/);
  assert.match(studio, /minimum for .* exceeds its maximum/);
});


test("K8s Studio checks Ingress TLS, StatefulSet services, NetworkPolicy selectors and HPA CPU readiness", async () => {
  const studio = await readFile(resolve(root, "src/features/kubernetes-studio/validation/validateKubernetesResources.js"), "utf8");
  assert.match(studio, /Ingress TLS entry .* does not list any hosts/);
  assert.match(studio, /does not define a TLS Secret name/);
  assert.match(studio, /is not listed in this Ingress TLS configuration/);
  assert.match(studio, /StatefulSet governing Service .* is not present in this manifest set/);
  assert.match(studio, /NetworkPolicy selector does not match a workload/);
  assert.match(studio, /HPA uses CPU utilization, but at least one target container has no CPU request/);
});


test("K8s Studio evaluates Kubernetes matchExpressions for PDB and NetworkPolicy selectors", async () => {
  const studio = await readFile(resolve(root, "src/features/kubernetes-studio/validation/validateKubernetesResources.js"), "utf8");
  assert.match(studio, /const matchesKubernetesSelector = \(selector, labels\) =>/);
  assert.match(studio, /expression\.operator === "In"/);
  assert.match(studio, /expression\.operator === "NotIn"/);
  assert.match(studio, /expression\.operator === "Exists"/);
  assert.match(studio, /expression\.operator === "DoesNotExist"/);
  assert.match(studio, /matchesKubernetesSelector\(spec\.selector, workloadLabels\(workload\)\)/);
  assert.match(studio, /matchesKubernetesSelector\(spec\.podSelector, workloadLabels\(workload\)\)/);
});


test("K8s Studio validates HPA metrics and scaling behavior policies", async () => {
  const studio = await readFile(resolve(root, "src/features/kubernetes-studio/validation/validateKubernetesResources.js"), "utf8");
  assert.match(studio, /HPA should define at least one spec\.metrics target/);
  assert.match(studio, /is missing its metric source/);
  assert.match(studio, /must define metric\.name/);
  assert.match(studio, /must define a supported target type/);
  assert.match(studio, /stabilizationWindowSeconds must be an integer from 0 to 3600/);
  assert.match(studio, /selectPolicy must be Max, Min, or Disabled/);
  assert.match(studio, /policies must be a list/);
  assert.match(studio, /periodSeconds must be an integer from 1 to 1800/);
});


test("K8s Studio integration: a complete multi-resource application has no broken core references", () => {
  const resources = [
    { id: "ns", kind: "Namespace", name: "production", namespace: "default", manifest: { apiVersion: "v1", kind: "Namespace", metadata: { name: "production" } } },
    { id: "config", kind: "ConfigMap", name: "web-config", namespace: "production", manifest: { apiVersion: "v1", kind: "ConfigMap", metadata: { name: "web-config", namespace: "production" }, data: { MODE: "production" } } },
    { id: "secret", kind: "Secret", name: "web-tls", namespace: "production", manifest: { apiVersion: "v1", kind: "Secret", metadata: { name: "web-tls", namespace: "production" }, type: "kubernetes.io/tls", data: {} } },
    { id: "pvc", kind: "PersistentVolumeClaim", name: "web-data", namespace: "production", manifest: { apiVersion: "v1", kind: "PersistentVolumeClaim", metadata: { name: "web-data", namespace: "production" }, spec: { accessModes: ["ReadWriteOnce"], resources: { requests: { storage: "2Gi" } } } } },
    { id: "deployment", kind: "Deployment", name: "web", namespace: "production", manifest: { apiVersion: "apps/v1", kind: "Deployment", metadata: { name: "web", namespace: "production" }, spec: { replicas: 2, selector: { matchLabels: { app: "web" } }, template: { metadata: { labels: { app: "web", tier: "frontend" } }, spec: { containers: [{ name: "web", image: "nginx:1.27", ports: [{ name: "http", containerPort: 8080 }], resources: { requests: { cpu: "100m", memory: "64Mi" }, limits: { cpu: "500m", memory: "256Mi" } }, envFrom: [{ configMapRef: { name: "web-config" } }] }] } } } } },
    { id: "service", kind: "Service", name: "web", namespace: "production", manifest: { apiVersion: "v1", kind: "Service", metadata: { name: "web", namespace: "production" }, spec: { selector: { app: "web" }, ports: [{ name: "http", port: 80, targetPort: "http" }] } } },
    { id: "ingress", kind: "Ingress", name: "web", namespace: "production", manifest: { apiVersion: "networking.k8s.io/v1", kind: "Ingress", metadata: { name: "web", namespace: "production" }, spec: { tls: [{ hosts: ["app.example.com"], secretName: "web-tls" }], rules: [{ host: "app.example.com", http: { paths: [{ path: "/", pathType: "Prefix", backend: { service: { name: "web", port: { number: 80 } } } }] } }] } } },
    { id: "hpa", kind: "HorizontalPodAutoscaler", name: "web", namespace: "production", manifest: { apiVersion: "autoscaling/v2", kind: "HorizontalPodAutoscaler", metadata: { name: "web", namespace: "production" }, spec: { minReplicas: 2, maxReplicas: 8, scaleTargetRef: { apiVersion: "apps/v1", kind: "Deployment", name: "web" }, metrics: [{ type: "Resource", resource: { name: "cpu", target: { type: "Utilization", averageUtilization: 70 } } }] } } },
    { id: "pdb", kind: "PodDisruptionBudget", name: "web", namespace: "production", manifest: { apiVersion: "policy/v1", kind: "PodDisruptionBudget", metadata: { name: "web", namespace: "production" }, spec: { minAvailable: 1, selector: { matchExpressions: [{ key: "app", operator: "In", values: ["web"] }] } } } },
    { id: "network-policy", kind: "NetworkPolicy", name: "web", namespace: "production", manifest: { apiVersion: "networking.k8s.io/v1", kind: "NetworkPolicy", metadata: { name: "web", namespace: "production" }, spec: { podSelector: { matchExpressions: [{ key: "tier", operator: "In", values: ["frontend"] }] }, policyTypes: ["Ingress"], ingress: [{}] } } },
    { id: "quota", kind: "ResourceQuota", name: "production", namespace: "production", manifest: { apiVersion: "v1", kind: "ResourceQuota", metadata: { name: "production", namespace: "production" }, spec: { hard: { pods: "20", "requests.cpu": "4", "requests.memory": "8Gi" } } } },
    { id: "limits", kind: "LimitRange", name: "production", namespace: "production", manifest: { apiVersion: "v1", kind: "LimitRange", metadata: { name: "production", namespace: "production" }, spec: { limits: [{ type: "Container", min: { cpu: "50m", memory: "32Mi" }, max: { cpu: "1", memory: "512Mi" }, defaultRequest: { cpu: "100m", memory: "64Mi" } }] } } },
  ];
  const issues = validateKubernetesResources(resources.map((item) => ({ ...item, apiVersion: item.manifest.apiVersion })));
  const brokenReferences = issues.filter((issue) => /not present in this manifest set|does not match a workload|No workload in this manifest set|not declared by Service|not declared by a matching workload container|is not listed in this Ingress TLS configuration|may be undefined/.test(issue.message));
  assert.deepEqual(brokenReferences, []);
  assert.equal(issues.some((issue) => issue.severity === "error"), false, JSON.stringify(issues, null, 2));
});

test("K8s Studio integration: missing service, ingress backend, config and HPA target are reported together", () => {
  const resources = [
    { id: "deployment", kind: "Deployment", name: "api", namespace: "default", manifest: { apiVersion: "apps/v1", kind: "Deployment", metadata: { name: "api" }, spec: { selector: { matchLabels: { app: "api" } }, template: { metadata: { labels: { app: "api" } }, spec: { containers: [{ name: "api", image: "example/api:1", envFrom: [{ configMapRef: { name: "missing-config" } }] }] } } } } },
    { id: "ingress", kind: "Ingress", name: "api", namespace: "default", manifest: { apiVersion: "networking.k8s.io/v1", kind: "Ingress", metadata: { name: "api" }, spec: { rules: [{ host: "api.example.com", http: { paths: [{ path: "/", pathType: "Prefix", backend: { service: { name: "missing-service", port: { number: 80 } } } }] } }] } } },
    { id: "hpa", kind: "HorizontalPodAutoscaler", name: "api", namespace: "default", manifest: { apiVersion: "autoscaling/v2", kind: "HorizontalPodAutoscaler", metadata: { name: "api" }, spec: { minReplicas: 1, maxReplicas: 3, scaleTargetRef: { apiVersion: "apps/v1", kind: "Deployment", name: "missing-deployment" }, metrics: [{ type: "Resource", resource: { name: "cpu", target: { type: "Utilization", averageUtilization: 70 } } }] } } },
  ];
  const issues = validateKubernetesResources(resources);
  assert.ok(issues.some((issue) => issue.message.includes("missing-service") && issue.message.includes("Ingress backend Service")));
  assert.ok(issues.some((issue) => issue.message.includes("missing-config") && issue.message.includes("ConfigMap")));
  assert.ok(issues.some((issue) => issue.message.includes("missing-deployment") && issue.message.includes("HPA target")));
});


test("K8s Studio integration: storage and RBAC dependencies resolve across a valid manifest set", () => {
  const resources = [
    { id: "sc", kind: "StorageClass", name: "fast", namespace: "", apiVersion: "storage.k8s.io/v1", manifest: { apiVersion: "storage.k8s.io/v1", kind: "StorageClass", metadata: { name: "fast" }, provisioner: "kubernetes.io/no-provisioner" } },
    { id: "pvc", kind: "PersistentVolumeClaim", name: "data", namespace: "production", apiVersion: "v1", manifest: { apiVersion: "v1", kind: "PersistentVolumeClaim", metadata: { name: "data", namespace: "production" }, spec: { storageClassName: "fast", accessModes: ["ReadWriteOnce"], resources: { requests: { storage: "1Gi" } } } } },
    { id: "pv", kind: "PersistentVolume", name: "data-pv", namespace: "", apiVersion: "v1", manifest: { apiVersion: "v1", kind: "PersistentVolume", metadata: { name: "data-pv" }, spec: { storageClassName: "fast", capacity: { storage: "1Gi" }, accessModes: ["ReadWriteOnce"], claimRef: { name: "data", namespace: "production" }, persistentVolumeReclaimPolicy: "Retain" } } },
    { id: "sa", kind: "ServiceAccount", name: "app", namespace: "production", apiVersion: "v1", manifest: { apiVersion: "v1", kind: "ServiceAccount", metadata: { name: "app", namespace: "production" } } },
    { id: "role", kind: "Role", name: "read-config", namespace: "production", apiVersion: "rbac.authorization.k8s.io/v1", manifest: { apiVersion: "rbac.authorization.k8s.io/v1", kind: "Role", metadata: { name: "read-config", namespace: "production" }, rules: [{ apiGroups: [""], resources: ["configmaps"], verbs: ["get"] }] } },
    { id: "binding", kind: "RoleBinding", name: "app-read-config", namespace: "production", apiVersion: "rbac.authorization.k8s.io/v1", manifest: { apiVersion: "rbac.authorization.k8s.io/v1", kind: "RoleBinding", metadata: { name: "app-read-config", namespace: "production" }, spec: { roleRef: { apiGroup: "rbac.authorization.k8s.io", kind: "Role", name: "read-config" }, subjects: [{ kind: "ServiceAccount", name: "app", namespace: "production" }] } } },
  ];
  const issues = validateKubernetesResources(resources);
  assert.equal(issues.some((issue) => /StorageClass|claimRef references PersistentVolumeClaim|Role binding references/.test(issue.message)), false, JSON.stringify(issues, null, 2));
});

test("K8s Studio integration: reports unresolved storage and RBAC dependencies", () => {
  const resources = [
    { id: "pvc", kind: "PersistentVolumeClaim", name: "data", namespace: "production", apiVersion: "v1", manifest: { apiVersion: "v1", kind: "PersistentVolumeClaim", metadata: { name: "data", namespace: "production" }, spec: { storageClassName: "missing-fast", accessModes: ["ReadWriteOnce"], resources: { requests: { storage: "1Gi" } } } } },
    { id: "pv", kind: "PersistentVolume", name: "data-pv", namespace: "", apiVersion: "v1", manifest: { apiVersion: "v1", kind: "PersistentVolume", metadata: { name: "data-pv" }, spec: { storageClassName: "missing-fast", capacity: { storage: "1Gi" }, accessModes: ["ReadWriteOnce"], claimRef: { name: "missing-data", namespace: "production" } } } },
    { id: "binding", kind: "RoleBinding", name: "broken-binding", namespace: "production", apiVersion: "rbac.authorization.k8s.io/v1", manifest: { apiVersion: "rbac.authorization.k8s.io/v1", kind: "RoleBinding", metadata: { name: "broken-binding", namespace: "production" }, spec: { roleRef: { apiGroup: "rbac.authorization.k8s.io", kind: "Role", name: "missing-role" }, subjects: [{ kind: "ServiceAccount", name: "missing-app", namespace: "production" }] } } },
  ];
  const issues = validateKubernetesResources(resources);
  assert.ok(issues.some((issue) => issue.message.includes("StorageClass 'missing-fast'")));
  assert.ok(issues.some((issue) => issue.message.includes("PersistentVolumeClaim 'missing-data'")));
  assert.ok(issues.some((issue) => issue.message.includes("Role/missing-role")));
  assert.ok(issues.some((issue) => issue.message.includes("ServiceAccount 'missing-app'")));
});


test("K8s Studio integration: malformed HPA metrics and scaling policies are diagnosed", () => {
  const resources = [{
    id: "hpa-bad", kind: "HorizontalPodAutoscaler", name: "web", namespace: "production", apiVersion: "autoscaling/v2",
    manifest: { apiVersion: "autoscaling/v2", kind: "HorizontalPodAutoscaler", metadata: { name: "web", namespace: "production" }, spec: {
      scaleTargetRef: { apiVersion: "apps/v1", kind: "Deployment", name: "web" },
      minReplicas: 8, maxReplicas: 2,
      metrics: [{ type: "Resource", resource: { name: "cpu", target: { type: "Utilization", averageUtilization: 0 } } }, { type: "External", external: { metric: {}, target: { type: "Value" } } }],
      behavior: { scaleUp: { stabilizationWindowSeconds: 4000, selectPolicy: "Fastest", policies: [{ type: "Percent", value: 0, periodSeconds: 2000 }] } },
    } },
  }];
  const messages = validateKubernetesResources(resources).map((issue) => issue.message);
  assert.ok(messages.some((message) => message.includes("minReplicas cannot exceed maxReplicas")));
  assert.ok(messages.some((message) => message.includes("positive averageUtilization")));
  assert.ok(messages.some((message) => message.includes("must define metric.name")));
  assert.ok(messages.some((message) => message.includes("must define an averageValue or value quantity")));
  assert.ok(messages.some((message) => message.includes("stabilizationWindowSeconds")));
  assert.ok(messages.some((message) => message.includes("selectPolicy must be Max, Min, or Disabled")));
  assert.ok(messages.some((message) => message.includes("value must be a positive integer")));
  assert.ok(messages.some((message) => message.includes("periodSeconds must be an integer from 1 to 1800")));
});

test("K8s Studio integration: selector expressions distinguish matching and non-matching workloads", () => {
  const workload = {
    id: "deployment-web", kind: "Deployment", name: "web", namespace: "production", apiVersion: "apps/v1",
    manifest: { apiVersion: "apps/v1", kind: "Deployment", metadata: { name: "web", namespace: "production" }, spec: {
      selector: { matchLabels: { app: "web" } },
      template: { metadata: { labels: { app: "web", tier: "frontend" } }, spec: { containers: [{ name: "web", image: "nginx:1.27" }] } },
    } },
  };
  const pdb = {
    id: "pdb-web", kind: "PodDisruptionBudget", name: "web", namespace: "production", apiVersion: "policy/v1",
    manifest: { apiVersion: "policy/v1", kind: "PodDisruptionBudget", metadata: { name: "web", namespace: "production" }, spec: {
      minAvailable: 1,
      selector: { matchExpressions: [{ key: "tier", operator: "In", values: ["frontend"] }, { key: "app", operator: "NotIn", values: ["worker"] }] },
    } },
  };
  const validMessages = validateKubernetesResources([workload, pdb]).map((issue) => issue.message);
  assert.equal(validMessages.some((message) => message.includes("PodDisruptionBudget selector does not match a workload")), false);
  const invalidPdb = { ...pdb, manifest: { ...pdb.manifest, spec: { ...pdb.manifest.spec, selector: { matchExpressions: [{ key: "tier", operator: "In", values: ["backend"] }] } } } };
  const invalidMessages = validateKubernetesResources([workload, invalidPdb]).map((issue) => issue.message);
  assert.ok(invalidMessages.some((message) => message.includes("PodDisruptionBudget selector does not match a workload")));
});


test("K8s Studio reports malformed RBAC rules, role references and subjects", () => {
  const resources = [
    { id: "role-bad", kind: "Role", name: "broken", namespace: "production", apiVersion: "rbac.authorization.k8s.io/v1", manifest: { apiVersion: "rbac.authorization.k8s.io/v1", kind: "Role", metadata: { name: "broken", namespace: "production" }, rules: [{ verbs: [], resources: [] }] } },
    { id: "cluster-binding-bad", kind: "ClusterRoleBinding", name: "broken-binding", namespace: "", apiVersion: "rbac.authorization.k8s.io/v1", manifest: { apiVersion: "rbac.authorization.k8s.io/v1", kind: "ClusterRoleBinding", metadata: { name: "broken-binding" }, roleRef: { kind: "Role", name: "broken" }, subjects: [{ kind: "Pod", name: "" }] } },
    { id: "role-binding-empty", kind: "RoleBinding", name: "empty-binding", namespace: "production", apiVersion: "rbac.authorization.k8s.io/v1", manifest: { apiVersion: "rbac.authorization.k8s.io/v1", kind: "RoleBinding", metadata: { name: "empty-binding", namespace: "production" }, roleRef: { kind: "Role", name: "broken" }, subjects: [] } },
  ];
  const issues = validateKubernetesResources(resources);
  const messages = issues.map((issue) => issue.message);
  assert.ok(messages.some((message) => message.includes("must define a non-empty verbs list")));
  assert.ok(messages.some((message) => message.includes("must define resources or nonResourceURLs")));
  assert.ok(messages.some((message) => message.includes("ClusterRoleBinding roleRef.kind must be ClusterRole")));
  assert.ok(messages.some((message) => message.includes("subject 1 must define a supported kind and name")));
  assert.ok(messages.some((message) => message.includes("must define at least one subject")));
});


test("K8s Studio validates Ingress path types, backend port values and duplicate TLS hosts", () => {
  const resources = [
    { id: "service", kind: "Service", name: "web", namespace: "production", apiVersion: "v1", manifest: { apiVersion: "v1", kind: "Service", metadata: { name: "web", namespace: "production" }, spec: { ports: [{ port: 80, name: "http" }] } } },
    { id: "ingress", kind: "Ingress", name: "web", namespace: "production", apiVersion: "networking.k8s.io/v1", manifest: { apiVersion: "networking.k8s.io/v1", kind: "Ingress", metadata: { name: "web", namespace: "production" }, spec: {
      tls: [{ hosts: ["example.test"] }, { hosts: ["EXAMPLE.TEST"] }],
      rules: [{ host: "example.test", http: { paths: [
        { path: "/", pathType: "Bogus", backend: { service: { name: "web", port: { number: 70000 } } } },
        { path: "/named", pathType: "Prefix", backend: { service: { name: "web", port: { number: 80, name: "http" } } } },
      ] } }],
    } } },
  ];
  const messages = validateKubernetesResources(resources).map((issue) => issue.message);
  assert.ok(messages.some((message) => message.includes("Ingress pathType must be Exact, Prefix, or ImplementationSpecific")));
  assert.ok(messages.some((message) => message.includes("port number must be an integer from 1 to 65535")));
  assert.ok(messages.some((message) => message.includes("must specify either number or name, not both")));
  assert.ok(messages.some((message) => message.includes("TLS host 'EXAMPLE.TEST' is declared more than once")));
});


test("K8s Studio validates NetworkPolicy peers, protocols and port ranges", () => {
  const resources = [{
    id: "network-policy-bad", kind: "NetworkPolicy", name: "restricted", namespace: "production", apiVersion: "networking.k8s.io/v1",
    manifest: { apiVersion: "networking.k8s.io/v1", kind: "NetworkPolicy", metadata: { name: "restricted", namespace: "production" }, spec: {
      podSelector: {},
      policyTypes: ["Ingress", "Ingress", "Sideways"],
      ingress: [{
        from: [{}, { ipBlock: { except: [""] } }],
        ports: [{ protocol: "ICMP", port: 70000 }, { protocol: "TCP", port: 8080, endPort: 80 }, { port: "Bad_Name" }],
      }],
      egress: [{ to: "not-a-list", ports: [{ port: 80, endPort: 90 }] }],
    } },
  }];
  const messages = validateKubernetesResources(resources).map((issue) => issue.message);
  assert.ok(messages.some((message) => message.includes("policyTypes entries must be Ingress or Egress")));
  assert.ok(messages.some((message) => message.includes("policyTypes must not contain duplicates")));
  assert.ok(messages.some((message) => message.includes("peer 1 must define a valid")));
  assert.ok(messages.some((message) => message.includes("ipBlock.except must be a list")));
  assert.ok(messages.some((message) => message.includes("protocol must be TCP, UDP, or SCTP")));
  assert.ok(messages.some((message) => message.includes("numeric port must be an integer from 1 to 65535")));
  assert.ok(messages.some((message) => message.includes("endPort requires a numeric port")));
  assert.ok(messages.some((message) => message.includes("named port must be a valid lowercase port name")));
  assert.ok(messages.some((message) => message.includes("egress rule 1 to must be a list")));
});
