/**
 * Read-only Kubernetes environment snapshot normalizer.
 * This module never connects to a cluster or executes kubectl.
 * The caller must supply data obtained through an authorized read-only path.
 */
const allowedKinds = new Set(["Pod", "Deployment", "Service", "StatefulSet", "DaemonSet"]);
export function summarizeKubernetesSnapshot(resources) {
  if (!Array.isArray(resources)) throw new TypeError("Expected a Kubernetes resource list.");
  return resources.map((resource) => {
    if (!resource || typeof resource !== "object" || !allowedKinds.has(resource.kind)) return null;
    const name = resource.metadata?.name;
    if (typeof name !== "string" || !name.trim()) return null;
    const namespace = typeof resource.metadata?.namespace === "string" ? resource.metadata.namespace : "default";
    const result = { kind: resource.kind, name, namespace };
    if (resource.kind === "Pod") result.phase = resource.status?.phase || "Unknown";
    if (["Deployment", "StatefulSet", "DaemonSet"].includes(resource.kind)) {
      result.desired = resource.spec?.replicas ?? (resource.kind === "DaemonSet" ? resource.status?.desiredNumberScheduled ?? 0 : 1);
      result.ready = resource.kind === "DaemonSet" ? resource.status?.numberReady ?? 0 : resource.status?.readyReplicas ?? 0;
    }
    if (resource.kind === "Service") result.type = resource.spec?.type || "ClusterIP";
    return result;
  }).filter(Boolean);
}
