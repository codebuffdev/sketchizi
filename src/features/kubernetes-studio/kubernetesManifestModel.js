import { parseAllDocuments, stringify } from "yaml";
import { validateKubernetesResources } from "./validation/validateKubernetesResources.js";
import { matchesKubernetesSelector } from "./validation/kubernetesSelector.js";
import { formatYamlError } from "../studio-validation/yamlErrors.js";

export { formatYamlError };

/**
 * Pure (React-free, Excalidraw-free) model for the Kubernetes Studio pipeline:
 *
 *   YAML text -> parseKubernetesManifests -> resources
 *             -> planKubernetesCanvas     -> canvas state (nodes + edges)
 *             -> exportKubernetesFromCanvasState -> YAML text
 *
 * Keeping this logic out of the JSX lets it be unit-tested and gives the UI one
 * place to produce actionable, user-facing error messages.
 */

export const KUBERNETES_KIND_LABELS = Object.freeze({
  Pod: "Pod", Deployment: "Deployment", StatefulSet: "StatefulSet", DaemonSet: "DaemonSet",
  Service: "Service", Ingress: "Ingress", ConfigMap: "ConfigMap", Secret: "Secret",
  Namespace: "Namespace", Node: "Node", PersistentVolume: "PersistentVolume",
  PersistentVolumeClaim: "PersistentVolumeClaim", StorageClass: "StorageClass",
  Job: "Job", CronJob: "CronJob", ReplicaSet: "ReplicaSet", ServiceAccount: "ServiceAccount",
  Role: "Role", ClusterRole: "ClusterRole", RoleBinding: "RoleBinding",
  ClusterRoleBinding: "ClusterRoleBinding", NetworkPolicy: "NetworkPolicy",
  HorizontalPodAutoscaler: "HorizontalPodAutoscaler", LimitRange: "LimitRange",
  ResourceQuota: "ResourceQuota", EndpointSlice: "EndpointSlice",
});

export const WORKLOAD_KINDS = Object.freeze(["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Pod", "Job", "CronJob"]);
export const CLUSTER_SCOPED_KINDS = Object.freeze([
  "Namespace", "Node", "PersistentVolume", "StorageClass", "ClusterRole",
  "ClusterRoleBinding", "CustomResourceDefinition",
]);

const KIND_PATTERN = /^[A-Za-z][A-Za-z0-9]*$/;
const MAX_REPORTED_ERRORS = 10;

export const isMapping = (value) => Boolean(value && typeof value === "object" && !Array.isArray(value));
const describeType = (value) => value === null ? "null" : Array.isArray(value) ? "a list" : typeof value === "object" ? "a mapping" : `a ${typeof value}`;

/* ------------------------------------------------------------------ */
/* Error formatting                                                    */
/* ------------------------------------------------------------------ */

function failure(base, code, message) {
  return { ...base, parseError: message, errors: [{ code, message, line: null, column: null }] };
}

/* ------------------------------------------------------------------ */
/* Manifest sanitising (crash protection for optional / empty fields)  */
/* ------------------------------------------------------------------ */

const POD_SPEC_PATHS = {
  Pod: ["spec"],
  Deployment: ["spec", "template", "spec"], StatefulSet: ["spec", "template", "spec"],
  DaemonSet: ["spec", "template", "spec"], ReplicaSet: ["spec", "template", "spec"],
  Job: ["spec", "template", "spec"],
  CronJob: ["spec", "jobTemplate", "spec", "template", "spec"],
};

const getAt = (root, path) => path.reduce((node, key) => (isMapping(node) ? node[key] : undefined), root);

/**
 * Return a copy of the manifest in which list fields that downstream code
 * iterates (containers, volumes, ports, Ingress rules/paths, ...) contain only
 * usable entries. Null items such as `containers:\n  -` and wrongly-typed values
 * are removed and reported instead of crashing the diagram or validator.
 */
export function sanitizeKubernetesManifest(manifest, kind = manifest?.kind) {
  const copy = structuredClone(manifest);
  const notes = [];
  const clean = (parent, key, path, { allowScalars = false } = {}) => {
    if (!isMapping(parent) || parent[key] == null) return;
    const value = parent[key];
    if (!Array.isArray(value)) {
      notes.push(`${path} must be a list but is ${describeType(value)}; it was ignored`);
      delete parent[key];
      return;
    }
    const kept = value.filter((entry) => entry != null && (allowScalars || isMapping(entry)));
    if (kept.length !== value.length) {
      const removed = value.length - kept.length;
      notes.push(`${path} contains ${removed} empty or non-mapping ${removed === 1 ? "entry" : "entries"}; ${removed === 1 ? "it was" : "they were"} ignored`);
      parent[key] = kept;
    }
  };

  const podSpecPath = POD_SPEC_PATHS[kind];
  if (podSpecPath) {
    const podSpec = getAt(copy, podSpecPath);
    const prefix = podSpecPath.join(".");
    if (isMapping(podSpec)) {
      for (const field of ["containers", "initContainers", "ephemeralContainers", "volumes"]) clean(podSpec, field, `${prefix}.${field}`);
      for (const field of ["containers", "initContainers", "ephemeralContainers"]) {
        (Array.isArray(podSpec[field]) ? podSpec[field] : []).forEach((container, index) => {
          const base = `${prefix}.${field}[${index}]`;
          for (const sub of ["ports", "env", "envFrom", "volumeMounts"]) clean(container, sub, `${base}.${sub}`);
        });
      }
    }
  }
  if (kind === "Service") clean(copy.spec, "ports", "spec.ports");
  if (kind === "Ingress" && isMapping(copy.spec)) {
    clean(copy.spec, "rules", "spec.rules");
    clean(copy.spec, "tls", "spec.tls");
    (Array.isArray(copy.spec.rules) ? copy.spec.rules : []).forEach((rule, index) => clean(rule.http, "paths", `spec.rules[${index}].http.paths`));
  }
  if (kind === "RoleBinding" || kind === "ClusterRoleBinding") clean(copy, "subjects", "subjects");
  if (kind === "Role" || kind === "ClusterRole") clean(copy, "rules", "rules");
  return { manifest: copy, notes };
}

/* ------------------------------------------------------------------ */
/* Resource normalisation                                              */
/* ------------------------------------------------------------------ */

function normalizeResource(value, ordinal, origin = {}) {
  const kind = typeof value.kind === "string" ? value.kind.trim() : "";
  const metadata = isMapping(value.metadata) ? value.metadata : {};
  const rawName = metadata.name;
  const name = typeof rawName === "string" ? rawName.trim() : typeof rawName === "number" ? String(rawName) : "";
  return { kind, name, metadata, ordinal, origin };
}

function buildResource(value, { kind, name, metadata }, ordinal, origin) {
  const namespace = String(metadata.namespace || (kind === "Namespace" ? name : "default"));
  return {
    id: `${kind.toLowerCase()}-${namespace}-${name}-${ordinal}`,
    documentIndex: origin.documentIndex,
    ...(origin.listItemIndex != null ? { listItemIndex: origin.listItemIndex } : {}),
    kind, name, namespace,
    apiVersion: String(value.apiVersion || "unknown"),
    manifest: value,
    supported: Object.hasOwn(KUBERNETES_KIND_LABELS, kind),
  };
}

/** Normalise one edited manifest (used by the resource inspector). Returns null when kind or metadata.name is unusable. */
export function normalizeKubernetesManifest(value, ordinal) {
  if (!isMapping(value)) return null;
  const normalized = normalizeResource(value, ordinal, {});
  if (!normalized.kind || !KIND_PATTERN.test(normalized.kind) || !normalized.name) return null;
  return buildResource(value, normalized, ordinal, { documentIndex: ordinal - 1 });
}

const looksLikeCompose = (value) => isMapping(value) && !("kind" in value) && !("apiVersion" in value)
  && (isMapping(value.services) || (value.services === null && "services" in value));

/**
 * Parse (multi-document) Kubernetes YAML into studio resources.
 *
 * Never throws. On failure `parseError` is a single actionable sentence and
 * `errors` carries structured detail (code, line, column).
 */
export function parseKubernetesManifests(yamlText, { locateServiceSelector = false } = {}) {
  const empty = { resources: [], unsupported: [], issues: [], parseError: "", errors: [], skippedDocuments: 0, selectorLine: null };
  if (yamlText == null) return empty;
  if (typeof yamlText !== "string") {
    return failure(empty, "K8S_INPUT_NOT_TEXT", "Kubernetes YAML must be provided as text. Re-import the file or paste the manifest into the editor.");
  }
  const text = yamlText.replace(/^\uFEFF/, "");
  if (!text.trim()) return empty;

  let documents;
  try {
    documents = parseAllDocuments(text, { prettyErrors: true, uniqueKeys: true, merge: true });
  } catch (cause) {
    return failure(empty, "K8S_YAML_UNREADABLE", `The YAML could not be read: ${cause?.message || "unknown error"}. Check that the file is plain-text YAML.`);
  }

  const syntaxErrors = [];
  documents.forEach((document, index) => {
    for (const error of document.errors) {
      const formatted = formatYamlError(error, documents.length > 1 ? `Document ${index + 1} YAML` : "YAML");
      syntaxErrors.push(formatted);
    }
  });
  if (syntaxErrors.length) {
    return { ...empty, parseError: syntaxErrors[0].message, errors: syntaxErrors.slice(0, MAX_REPORTED_ERRORS) };
  }

  const resources = [];
  const unsupported = [];
  const sanitizeIssues = [];
  const errors = [];
  let skippedDocuments = 0;
  let composeLikeDocument = null;

  const skip = (code, message) => { unsupported.push(message); errors.push({ code, message, line: null, column: null }); skippedDocuments++; };

  const accept = (value, ordinal, origin, label) => {
    if (!isMapping(value)) {
      skip("K8S_NOT_A_MAPPING", `${label}: expected a Kubernetes resource (a mapping with apiVersion, kind and metadata) but found ${describeType(value)}.`);
      return;
    }
    if (looksLikeCompose(value)) {
      composeLikeDocument ??= label;
      skip("K8S_LOOKS_LIKE_COMPOSE", `${label}: this looks like a Docker Compose file (top-level "services" and no "kind"). Open it in Docker Compose Studio, or use Compose → Kubernetes to convert it.`);
      return;
    }
    const normalized = normalizeResource(value, ordinal, origin);
    if (!normalized.kind) {
      skip("K8S_MISSING_KIND", `${label}: missing kind. Add a kind such as Deployment, Service or ConfigMap.`);
      return;
    }
    if (!KIND_PATTERN.test(normalized.kind)) {
      skip("K8S_INVALID_KIND", `${label}: "${normalized.kind}" is not a valid resource kind. Kinds are single words such as Deployment or Service.`);
      return;
    }
    if (!normalized.name) {
      const hint = isMapping(value.metadata) && value.metadata.generateName
        ? " metadata.generateName is only valid for objects created by the API server; give this manifest an explicit name."
        : " Add metadata.name.";
      skip("K8S_MISSING_NAME", `${label}: ${normalized.kind} is missing metadata.name.${hint}`);
      return;
    }
    const { manifest, notes } = sanitizeKubernetesManifest(value, normalized.kind);
    const resource = buildResource(manifest, normalized, ordinal, origin);
    for (const note of notes) {
      sanitizeIssues.push({ id: `${resource.id}:warning:${note}`, resource: resource.name, kind: resource.kind, severity: "warning", message: `${note}.` });
    }
    if (!resource.supported) {
      unsupported.push(`${resource.kind}/${resource.name}: valid Kubernetes kind, rendered as a generic resource`);
    }
    resources.push(resource);
  };

  for (const [index, document] of documents.entries()) {
    const label = `Document ${index + 1}`;
    let value;
    try {
      value = document.toJSON();
    } catch (cause) {
      return failure(empty, "K8S_DOCUMENT_UNREADABLE", `${label} could not be read: ${cause?.message || "unknown error"}. Check anchors (&name), aliases (*name) and merge keys (<<): an anchor can only be used inside the document that defines it, not across \"---\" separators.`);
    }
    if (value == null) continue;

    const listLike = isMapping(value) && typeof value.kind === "string" && /List$/.test(value.kind) && Array.isArray(value.items);
    if (listLike) {
      value.items.forEach((item, itemIndex) => {
        accept(item, `${index + 1}.${itemIndex + 1}`, { documentIndex: index, listItemIndex: itemIndex }, `${label}, item ${itemIndex + 1} of ${value.kind}`);
      });
      continue;
    }
    accept(value, index + 1, { documentIndex: index }, label);
  }

  let parseError = "";
  if (!resources.length && skippedDocuments) {
    parseError = composeLikeDocument
      ? unsupported.find((message) => message.includes("Docker Compose")) || ""
      : `No Kubernetes resources could be loaded. ${unsupported[0] || ""}`.trim();
  }

  let issues;
  try {
    issues = [...sanitizeIssues, ...validateKubernetesResources(resources)];
  } catch (cause) {
    issues = [...sanitizeIssues, {
      id: `validation-crash:${cause?.message}`, resource: "manifest set", kind: "Validation", severity: "error",
      message: `Validation could not finish because a manifest has an unexpected structure (${cause?.message || "unknown error"}). Check list fields such as containers, volumes, ports and rules.`,
    }];
  }

  let selectorLine = null;
  if (locateServiceSelector) {
    const offset = documents[0]?.getIn?.(["spec", "selector", "app"], true)?.range?.[0];
    if (typeof offset === "number") selectorLine = text.slice(0, offset).split("\n").length - 1;
  }

  return { resources, unsupported, issues, parseError, errors: errors.slice(0, MAX_REPORTED_ERRORS), skippedDocuments, selectorLine };
}

/* ------------------------------------------------------------------ */
/* Relationships (Service selectors, Ingress paths, config references) */
/* ------------------------------------------------------------------ */

const stringEquals = (a, b) => a != null && b != null && String(a) === String(b);

export function labelsSatisfySelector(selector, labels) {
  if (!isMapping(selector) || !isMapping(labels) || !Object.keys(selector).length) return false;
  return Object.entries(selector).every(([key, value]) => Object.hasOwn(labels, key) && stringEquals(labels[key], value));
}

/** Labels carried by the pods a workload creates. */
export function workloadPodLabels(resource) {
  const manifest = resource?.manifest || {};
  if (resource.kind === "Pod") return manifest.metadata?.labels;
  if (resource.kind === "CronJob") return manifest.spec?.jobTemplate?.spec?.template?.metadata?.labels;
  return manifest.spec?.template?.metadata?.labels || manifest.spec?.selector?.matchLabels;
}

export function workloadPodSpec(resource) {
  const spec = resource?.manifest?.spec;
  if (!isMapping(spec)) return {};
  if (resource.kind === "Pod") return spec;
  if (resource.kind === "CronJob") return spec.jobTemplate?.spec?.template?.spec || {};
  return spec.template?.spec || {};
}

/** Service names referenced by an Ingress, supporting networking.k8s.io/v1 and legacy v1beta1 shapes. */
export function getIngressBackendServiceNames(ingressManifest) {
  const names = new Set();
  const spec = isMapping(ingressManifest?.spec) ? ingressManifest.spec : {};
  const read = (backend) => {
    if (!isMapping(backend)) return;
    const name = backend.service?.name ?? backend.serviceName;
    if (typeof name === "string" && name) names.add(name);
  };
  for (const rule of Array.isArray(spec.rules) ? spec.rules : []) {
    for (const path of Array.isArray(rule?.http?.paths) ? rule.http.paths : []) read(path?.backend);
  }
  read(spec.defaultBackend);
  read(spec.backend);
  return [...names];
}

export function getIngressTlsSecretNames(ingressManifest) {
  const tls = Array.isArray(ingressManifest?.spec?.tls) ? ingressManifest.spec.tls : [];
  return [...new Set(tls.map((entry) => entry?.secretName).filter((name) => typeof name === "string" && name))];
}

function referencedConfig(podSpec) {
  const refs = new Map();
  const remember = (kind, name) => { if (typeof name === "string" && name) refs.set(`${kind}/${name}`, { kind, name }); };
  for (const volume of Array.isArray(podSpec.volumes) ? podSpec.volumes : []) {
    remember("PersistentVolumeClaim", volume.persistentVolumeClaim?.claimName);
    remember("ConfigMap", volume.configMap?.name);
    remember("Secret", volume.secret?.secretName);
    for (const source of Array.isArray(volume.projected?.sources) ? volume.projected.sources : []) {
      remember("ConfigMap", source?.configMap?.name);
      remember("Secret", source?.secret?.name);
    }
  }
  for (const container of [...(podSpec.initContainers || []), ...(podSpec.containers || []), ...(podSpec.ephemeralContainers || [])]) {
    if (!isMapping(container)) continue;
    for (const item of Array.isArray(container.envFrom) ? container.envFrom : []) {
      remember("ConfigMap", item?.configMapRef?.name);
      remember("Secret", item?.secretRef?.name);
    }
    for (const item of Array.isArray(container.env) ? container.env : []) {
      remember("ConfigMap", item?.valueFrom?.configMapKeyRef?.name);
      remember("Secret", item?.valueFrom?.secretKeyRef?.name);
    }
  }
  return [...refs.values()];
}

/**
 * Derive relationship edges between resources. Edges are `{ from, to, label }`
 * where from/to are resource ids. Namespaces are respected: a Service only
 * selects workloads in its own namespace, an Ingress only routes to Services in
 * its own namespace, and config references never cross namespaces.
 */
export function deriveKubernetesRelationships(resources) {
  const edges = [];
  const seen = new Set();
  const add = (from, to, label) => {
    if (!from || !to || from.id === to.id) return;
    const key = `${from.id}->${to.id}:${label}`;
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ from: from.id, to: to.id, label });
  };
  const list = Array.isArray(resources) ? resources : [];
  const workloads = list.filter((resource) => WORKLOAD_KINDS.includes(resource.kind));
  const services = list.filter((resource) => resource.kind === "Service");

  for (const service of services) {
    const selector = service.manifest?.spec?.selector;
    for (const workload of workloads) {
      if (workload.namespace === service.namespace && labelsSatisfySelector(selector, workloadPodLabels(workload))) add(service, workload, "routes to");
    }
  }

  for (const ingress of list.filter((resource) => resource.kind === "Ingress")) {
    for (const name of getIngressBackendServiceNames(ingress.manifest)) {
      add(ingress, services.find((service) => service.name === name && service.namespace === ingress.namespace), "routes to");
    }
    for (const secretName of getIngressTlsSecretNames(ingress.manifest)) {
      add(ingress, list.find((resource) => resource.kind === "Secret" && resource.name === secretName && resource.namespace === ingress.namespace), "uses");
    }
  }

  for (const policy of list.filter((resource) => resource.kind === "NetworkPolicy")) {
    const selector = policy.manifest?.spec?.podSelector;
    for (const workload of workloads.filter((candidate) => candidate.namespace === policy.namespace)) {
      const labels = workloadPodLabels(workload) || {};
      const selectsAll = !isMapping(selector) || (!Object.keys(selector.matchLabels || {}).length && !(selector.matchExpressions || []).length);
      if (selectsAll || matchesKubernetesSelector(selector, labels)) add(policy, workload, "applies to");
    }
  }

  for (const statefulSet of list.filter((resource) => resource.kind === "StatefulSet")) {
    const serviceName = statefulSet.manifest?.spec?.serviceName;
    if (serviceName) add(statefulSet, services.find((service) => service.name === serviceName && service.namespace === statefulSet.namespace), "governed by");
  }

  for (const workload of workloads) {
    for (const { kind, name } of referencedConfig(workloadPodSpec(workload))) {
      const target = list.find((resource) => resource.kind === kind && resource.name === name && resource.namespace === workload.namespace);
      add(workload, target, kind === "PersistentVolumeClaim" ? "mounts" : "uses");
    }
  }
  return edges;
}

/** Unresolved references that would break a deployed manifest set. */
export function findDanglingReferences(resources) {
  const list = Array.isArray(resources) ? resources : [];
  const problems = [];
  const edges = deriveKubernetesRelationships(list);
  const byId = new Map(list.map((resource) => [resource.id, resource]));
  const routedServices = new Set(edges.filter((edge) => edge.label === "routes to" && byId.get(edge.from)?.kind === "Ingress").map((edge) => `${edge.from}>${byId.get(edge.to)?.name}`));
  for (const ingress of list.filter((resource) => resource.kind === "Ingress")) {
    for (const name of getIngressBackendServiceNames(ingress.manifest)) {
      if (!routedServices.has(`${ingress.id}>${name}`)) {
        problems.push({ code: "K8S_INGRESS_BACKEND_MISSING", resource: `${ingress.kind}/${ingress.name}`, message: `Ingress "${ingress.name}" routes to Service "${name}", which is not defined in namespace "${ingress.namespace}" in this manifest set.` });
      }
    }
  }
  for (const service of list.filter((resource) => resource.kind === "Service" && isMapping(resource.manifest?.spec?.selector) && Object.keys(resource.manifest.spec.selector).length)) {
    if (!edges.some((edge) => edge.from === service.id && edge.label === "routes to")) {
      problems.push({ code: "K8S_SERVICE_SELECTOR_UNMATCHED", resource: `${service.kind}/${service.name}`, message: `Service "${service.name}" selects pods that no workload in namespace "${service.namespace}" provides.` });
    }
  }
  return problems;
}

/* ------------------------------------------------------------------ */
/* Safe card descriptions                                              */
/* ------------------------------------------------------------------ */

/** Null-safe summary lines for a resource card; never throws on sparse manifests. */
export function describeKubernetesResource(resource) {
  const manifest = isMapping(resource?.manifest) ? resource.manifest : {};
  const spec = isMapping(manifest.spec) ? manifest.spec : {};
  const podSpec = workloadPodSpec(resource);
  const containers = Array.isArray(podSpec.containers) ? podSpec.containers.filter(isMapping) : [];
  const ports = (Array.isArray(spec.ports) ? spec.ports.filter(isMapping) : [])
    .map((port) => `${port.port}${port.targetPort ? `→${port.targetPort}` : ""}/${port.protocol || "TCP"}`);
  const selectorSource = isMapping(spec.selector?.matchLabels) ? spec.selector.matchLabels : isMapping(spec.selector) ? spec.selector : {};
  const rules = Array.isArray(spec.rules) ? spec.rules.filter(isMapping) : [];
  return {
    images: containers.map((container) => container.image).filter(Boolean).slice(0, 2),
    ports: ports.slice(0, 3),
    selector: Object.entries(selectorSource).map(([key, value]) => `${key}=${value}`).slice(0, 2),
    hosts: rules.map((rule) => rule.host).filter(Boolean).slice(0, 2),
    dataKeys: Object.keys(isMapping(manifest.data) ? manifest.data : {}).slice(0, 3),
  };
}

/* ------------------------------------------------------------------ */
/* Canvas state                                                        */
/* ------------------------------------------------------------------ */

const layoutRank = (kind) => {
  if (kind === "Ingress" || kind === "Gateway" || kind === "HTTPRoute") return 0;
  if (kind === "Service") return 1;
  if (WORKLOAD_KINDS.includes(kind)) return 2;
  if (["PersistentVolumeClaim", "PersistentVolume", "StorageClass", "ConfigMap", "Secret", "ServiceAccount"].includes(kind)) return 3;
  if (["HorizontalPodAutoscaler", "PodDisruptionBudget", "NetworkPolicy"].includes(kind)) return 4;
  return 5;
};

/**
 * Plan the canvas for a resource set: every node keeps its full manifest so the
 * diagram is lossless, and edges are the derived relationships.
 */
export function planKubernetesCanvas(resources) {
  const list = Array.isArray(resources) ? resources : [];
  const cardWidth = 284, cardHeight = 132, gapX = 92, maxPerRow = 4;
  const buckets = new Map();
  for (const resource of list) {
    const rank = layoutRank(resource.kind);
    if (!buckets.has(rank)) buckets.set(rank, []);
    buckets.get(rank).push(resource);
  }
  const order = new Map(list.map((resource, index) => [resource.id, index]));
  const nodes = [];
  let y = 90;
  for (const [, items] of [...buckets.entries()].sort((a, b) => a[0] - b[0])) {
    items.sort((a, b) => a.namespace.localeCompare(b.namespace) || a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
    items.forEach((resource, index) => {
      nodes.push({
        id: resource.id, kind: resource.kind, name: resource.name, namespace: resource.namespace,
        apiVersion: resource.apiVersion, documentIndex: resource.documentIndex, order: order.get(resource.id),
        x: 120 + (index % maxPerRow) * (cardWidth + gapX),
        y: y + Math.floor(index / maxPerRow) * (cardHeight + 42),
        manifest: structuredClone(resource.manifest),
      });
    });
    y += Math.ceil(items.length / maxPerRow) * (cardHeight + 42) + 84;
  }
  return { nodes, edges: deriveKubernetesRelationships(list), cardWidth, cardHeight };
}

/** Convert the canvas state to the minimal Excalidraw-like element records the app persists. */
export function canvasStateToSceneElements(state) {
  return (state?.nodes || []).map((node) => ({
    id: `k8s-resource-${node.id}`, type: "rectangle", x: node.x, y: node.y,
    width: state.cardWidth, height: state.cardHeight, isDeleted: false,
    customData: {
      kubernetesManifestResource: {
        provider: "kubernetes", resourceType: node.kind.toLowerCase(), catalog: "kubernetes",
        properties: { name: node.name, namespace: node.namespace, apiVersion: node.apiVersion, manifestResourceId: node.id },
        order: node.order, manifest: node.manifest,
      },
    },
  }));
}

/** Rebuild YAML text from the canvas (scene elements or planned state). */
export function exportKubernetesFromScene(elements) {
  const seen = new Set();
  const manifests = [];
  for (const element of Array.isArray(elements) ? elements : []) {
    if (element?.isDeleted) continue;
    const resource = element?.customData?.kubernetesManifestResource;
    const id = resource?.properties?.manifestResourceId;
    if (!isMapping(resource?.manifest) || seen.has(id)) continue;
    if (id) seen.add(id);
    manifests.push({ manifest: resource.manifest, order: Number.isInteger(resource.order) ? resource.order : manifests.length });
  }
  manifests.sort((a, b) => a.order - b.order);
  return serializeKubernetesManifests(manifests.map((entry) => entry.manifest));
}

export function exportKubernetesFromCanvasState(state) {
  const ordered = [...(state?.nodes || [])].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return serializeKubernetesManifests(ordered.map((node) => node.manifest));
}

export function serializeKubernetesManifests(manifests) {
  const docs = (Array.isArray(manifests) ? manifests : []).filter(isMapping);
  if (!docs.length) return "";
  return docs.map((manifest) => stringify(manifest, { lineWidth: 0 }).trimEnd()).join("\n---\n") + "\n";
}
