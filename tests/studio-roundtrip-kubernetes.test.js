import test from "node:test";
import assert from "node:assert/strict";
import { parseAllDocuments } from "yaml";
import {
  canvasStateToSceneElements,
  deriveKubernetesRelationships,
  describeKubernetesResource,
  exportKubernetesFromCanvasState,
  exportKubernetesFromScene,
  findDanglingReferences,
  getIngressBackendServiceNames,
  parseKubernetesManifests,
  planKubernetesCanvas,
} from "../src/features/kubernetes-studio/kubernetesManifestModel.js";

const FULL_STACK = `# Web tier
apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: shop
  labels:
    app: web
  annotations:
    team: platform
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: web
          image: nginx:1.27
          ports:
            - containerPort: 80
          envFrom:
            - configMapRef:
                name: web-config
          env:
            - name: TOKEN
              valueFrom:
                secretKeyRef:
                  name: web-secret
                  key: token
      volumes:
        - name: cfg
          configMap:
            name: web-config
---
apiVersion: v1
kind: Service
metadata:
  name: web
  namespace: shop
spec:
  type: ClusterIP
  selector:
    app: web
  ports:
    - name: http
      port: 80
      targetPort: 80
      protocol: TCP
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: web-config
  namespace: shop
data:
  LOG_LEVEL: debug
  multiline: |
    line one
    line two
---
apiVersion: v1
kind: Secret
metadata:
  name: web-secret
  namespace: shop
  type: Opaque
stringData:
  token: abc123
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: web
  namespace: shop
  annotations:
    nginx.ingress.kubernetes.io/rewrite-target: /
spec:
  ingressClassName: nginx
  tls:
    - hosts: [shop.example.com]
      secretName: web-secret
  rules:
    - host: shop.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: web
                port:
                  number: 80
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: api
                port:
                  name: http
`;

const manifestsOf = (yaml) => parseAllDocuments(yaml, { merge: true }).map((doc) => doc.toJSON());
const byKind = (resources, kind) => resources.find((resource) => resource.kind === kind);

test("parses a multi-resource manifest (Deployment + Service + ConfigMap + Secret + Ingress)", () => {
  const result = parseKubernetesManifests(FULL_STACK);
  assert.equal(result.parseError, "");
  assert.deepEqual(result.resources.map((r) => `${r.kind}/${r.name}`), ["Deployment/web", "Service/web", "ConfigMap/web-config", "Secret/web-secret", "Ingress/web"]);
  assert.ok(result.resources.every((resource) => resource.namespace === "shop" && resource.supported));
  assert.equal(result.skippedDocuments, 0);
});

test("round trip YAML -> canvas state -> YAML preserves every manifest field", () => {
  const parsed = parseKubernetesManifests(FULL_STACK);
  const state = planKubernetesCanvas(parsed.resources);
  const exported = exportKubernetesFromCanvasState(state);
  assert.deepEqual(manifestsOf(exported), manifestsOf(FULL_STACK));
  // Multi-line ConfigMap data and annotations with special characters survive.
  assert.equal(byKind(parseKubernetesManifests(exported).resources, "ConfigMap").manifest.data.multiline, "line one\nline two\n");
  assert.equal(byKind(parseKubernetesManifests(exported).resources, "Ingress").manifest.metadata.annotations["nginx.ingress.kubernetes.io/rewrite-target"], "/");
});

test("round trip through persisted scene elements keeps order and drops deleted nodes", () => {
  const parsed = parseKubernetesManifests(FULL_STACK);
  const elements = canvasStateToSceneElements(planKubernetesCanvas(parsed.resources));
  // Simulate scene shuffling plus a user-deleted ConfigMap.
  const shuffled = [...elements].reverse();
  shuffled.find((element) => element.customData.kubernetesManifestResource.manifest.kind === "ConfigMap").isDeleted = true;
  const kinds = manifestsOf(exportKubernetesFromScene(shuffled)).map((manifest) => manifest.kind);
  assert.deepEqual(kinds, ["Deployment", "Service", "Secret", "Ingress"]);
});

test("canvas export is deterministic: re-importing the export yields the same canvas", () => {
  const first = exportKubernetesFromCanvasState(planKubernetesCanvas(parseKubernetesManifests(FULL_STACK).resources));
  const second = exportKubernetesFromCanvasState(planKubernetesCanvas(parseKubernetesManifests(first).resources));
  assert.equal(second, first);
});

test("planning the canvas does not mutate parsed resources", () => {
  const parsed = parseKubernetesManifests(FULL_STACK);
  const before = structuredClone(parsed.resources);
  const state = planKubernetesCanvas(parsed.resources);
  state.nodes[0].manifest.metadata.name = "mutated";
  assert.deepEqual(parsed.resources, before);
});

test("Service selector -> workload relationship is derived and stays namespace-scoped", () => {
  const parsed = parseKubernetesManifests(FULL_STACK);
  const edges = deriveKubernetesRelationships(parsed.resources);
  const id = (kind) => byKind(parsed.resources, kind).id;
  assert.ok(edges.some((edge) => edge.from === id("Service") && edge.to === id("Deployment") && edge.label === "routes to"));

  const crossNamespace = parseKubernetesManifests(`
apiVersion: apps/v1
kind: Deployment
metadata: { name: api, namespace: team-a }
spec:
  selector: { matchLabels: { app: api } }
  template:
    metadata: { labels: { app: api } }
    spec: { containers: [{ name: api, image: "api:1" }] }
---
apiVersion: v1
kind: Service
metadata: { name: api, namespace: team-b }
spec:
  selector: { app: api }
  ports: [{ port: 80 }]
`);
  assert.deepEqual(deriveKubernetesRelationships(crossNamespace.resources), [], "a Service must not select pods in another namespace");
  assert.ok(findDanglingReferences(crossNamespace.resources).some((problem) => problem.code === "K8S_SERVICE_SELECTOR_UNMATCHED"));
});

test("Ingress paths link to Services, including TLS secrets, and flag missing backends", () => {
  const parsed = parseKubernetesManifests(FULL_STACK);
  const edges = deriveKubernetesRelationships(parsed.resources);
  const ingress = byKind(parsed.resources, "Ingress");
  const toService = edges.filter((edge) => edge.from === ingress.id && edge.label === "routes to");
  assert.deepEqual(toService.map((edge) => edge.to), [byKind(parsed.resources, "Service").id]);
  assert.ok(edges.some((edge) => edge.from === ingress.id && edge.to === byKind(parsed.resources, "Secret").id && edge.label === "uses"));
  // /api points at Service "api", which is not in the set.
  const dangling = findDanglingReferences(parsed.resources);
  assert.ok(dangling.some((problem) => problem.code === "K8S_INGRESS_BACKEND_MISSING" && /api/.test(problem.message)));
});

test("Ingress backend extraction supports legacy shapes and tolerates malformed rules", () => {
  assert.deepEqual(getIngressBackendServiceNames({ spec: { backend: { serviceName: "legacy", servicePort: 80 }, rules: [{ http: { paths: [{ backend: { serviceName: "old-style" } }] } }] } }).sort(), ["legacy", "old-style"]);
  assert.deepEqual(getIngressBackendServiceNames({ spec: { defaultBackend: { service: { name: "fallback" } } } }), ["fallback"]);
  assert.deepEqual(getIngressBackendServiceNames({ spec: { rules: [null, { host: "x" }, { http: null }, { http: { paths: "nope" } }, { http: { paths: [null, {}] } }] } }), []);
  assert.deepEqual(getIngressBackendServiceNames(null), []);
});

test("workloads link to the ConfigMaps, Secrets and PVCs they reference", () => {
  const parsed = parseKubernetesManifests(FULL_STACK);
  const edges = deriveKubernetesRelationships(parsed.resources);
  const deployment = byKind(parsed.resources, "Deployment");
  assert.deepEqual(
    edges.filter((edge) => edge.from === deployment.id).map((edge) => edge.to).sort(),
    [byKind(parsed.resources, "ConfigMap").id, byKind(parsed.resources, "Secret").id].sort(),
  );
});

test("matchExpressions NetworkPolicy selectors and StatefulSet serviceName are honoured", () => {
  const parsed = parseKubernetesManifests(`
apiVersion: apps/v1
kind: StatefulSet
metadata: { name: db }
spec:
  serviceName: db-headless
  selector: { matchLabels: { app: db, tier: data } }
  template:
    metadata: { labels: { app: db, tier: data } }
    spec: { containers: [{ name: db, image: "postgres:17" }] }
---
apiVersion: v1
kind: Service
metadata: { name: db-headless }
spec: { clusterIP: None, selector: { app: db }, ports: [{ port: 5432 }] }
---
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata: { name: data-only }
spec:
  podSelector:
    matchExpressions:
      - { key: tier, operator: In, values: [data] }
`);
  const labels = deriveKubernetesRelationships(parsed.resources).map((edge) => edge.label).sort();
  assert.deepEqual(labels, ["applies to", "governed by", "routes to"]);
});

test("optional and empty fields never crash parsing, validation, relationships or card details", () => {
  const sparse = `
apiVersion: apps/v1
kind: Deployment
metadata:
  name: sparse
spec:
  template:
    spec:
      containers:
        -
        - name: app
          image: "app:1"
          ports:
            -
      volumes:
        -
---
apiVersion: v1
kind: Service
metadata:
  name: svc
spec:
  ports:
    -
    - port: 80
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: ing
spec:
  rules:
    -
    - http:
        paths:
          -
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: empty
`;
  const result = parseKubernetesManifests(sparse);
  assert.equal(result.parseError, "");
  assert.equal(result.resources.length, 4);
  assert.ok(result.issues.some((issue) => issue.severity === "warning" && /empty or non-mapping/.test(issue.message)), "dropped entries are reported, not silent");
  assert.doesNotThrow(() => deriveKubernetesRelationships(result.resources));
  assert.doesNotThrow(() => planKubernetesCanvas(result.resources));
  assert.doesNotThrow(() => result.resources.forEach(describeKubernetesResource));
  assert.deepEqual(describeKubernetesResource(byKind(result.resources, "ConfigMap")), { images: [], ports: [], selector: [], hosts: [], dataKeys: [] });
});

test("wrongly-typed list fields are reported instead of crashing", () => {
  const result = parseKubernetesManifests(`
apiVersion: v1
kind: Service
metadata: { name: bad }
spec:
  ports: { port: 80 }
`);
  assert.equal(result.parseError, "");
  assert.ok(result.issues.some((issue) => /spec\.ports must be a list but is a mapping/.test(issue.message)));
});

test("kubectl-style List documents are flattened and remain individually addressable", () => {
  const result = parseKubernetesManifests(`
apiVersion: v1
kind: List
items:
  - apiVersion: v1
    kind: ConfigMap
    metadata: { name: one }
  - apiVersion: v1
    kind: ConfigMap
    metadata: { name: two }
`);
  assert.deepEqual(result.resources.map((resource) => resource.name), ["one", "two"]);
  assert.deepEqual(result.resources.map((resource) => resource.listItemIndex), [0, 1]);
  assert.equal(new Set(result.resources.map((resource) => resource.id)).size, 2);
});

test("anchors and merge keys are expanded, not exported as literal << keys", () => {
  const result = parseKubernetesManifests(`
apiVersion: v1
kind: List
items:
  - apiVersion: v1
    kind: ConfigMap
    metadata: &meta
      name: base
      labels: { app: demo }
  - apiVersion: v1
    kind: ConfigMap
    metadata:
      <<: *meta
      name: derived
`);
  assert.equal(result.parseError, "");
  assert.deepEqual(result.resources[1].manifest.metadata, { name: "derived", labels: { app: "demo" } });
});

test("an anchor shared across --- documents produces an actionable error, not a crash", () => {
  const result = parseKubernetesManifests("metadata: &meta\n  name: a\n---\nmetadata:\n  <<: *meta\n");
  assert.match(result.parseError, /Document 2/);
  assert.match(result.parseError, /anchor can only be used inside the document that defines it/);
  assert.deepEqual(result.resources, []);
});

test("empty documents and BOM-prefixed files are handled", () => {
  assert.deepEqual(parseKubernetesManifests("").resources, []);
  assert.deepEqual(parseKubernetesManifests("   \n").resources, []);
  assert.equal(parseKubernetesManifests(null).parseError, "");
  const withBom = parseKubernetesManifests("\uFEFFapiVersion: v1\nkind: Namespace\nmetadata:\n  name: ops\n---\n---\n");
  assert.equal(withBom.parseError, "");
  assert.equal(withBom.resources[0].namespace, "ops");
});

test("unsupported-but-valid kinds (CRDs) are kept as generic resources and round trip intact", () => {
  const crd = `apiVersion: monitoring.coreos.com/v1
kind: ServiceMonitor
metadata:
  name: web
spec:
  selector:
    matchLabels:
      app: web
  endpoints:
    - port: http
`;
  const parsed = parseKubernetesManifests(crd);
  assert.equal(parsed.resources[0].supported, false);
  assert.ok(parsed.unsupported.some((message) => /ServiceMonitor\/web.*generic resource/.test(message)));
  assert.deepEqual(manifestsOf(exportKubernetesFromCanvasState(planKubernetesCanvas(parsed.resources))), manifestsOf(crd));
});
