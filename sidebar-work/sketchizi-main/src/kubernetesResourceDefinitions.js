// Definition-driven Kubernetes intelligent resources for K2.
// Only the eight resources defined here become intelligent in K2.

const KUBERNETES_ICON_IDS = {
  cluster: "k8s:group",
  namespace: "k8s:namespace",
  node: "k8s:node",
  pod: "k8s:pod",
  deployment: "k8s:deployment",
  statefulset: "k8s:statefulset",
  daemonset: "k8s:daemonset",
  service: "k8s:service",
};

export const kubernetesResourceDefinitions = [
  {
    id: "k8s:cluster",
    provider: "kubernetes",
    service: "Kubernetes",
    resourceType: "cluster",
    displayName: "Kubernetes Cluster",
    iconId: KUBERNETES_ICON_IDS.cluster,
    properties: [
      { key: "name", label: "Name", type: "text", defaultValue: "Kubernetes Cluster" },
      { key: "version", label: "Version", type: "text", defaultValue: "1.34" },
      { key: "environment", label: "Environment", type: "select", defaultValue: "development", options: ["development", "staging", "production"] },
    ],
  },
  {
    id: "k8s:namespace",
    provider: "kubernetes",
    service: "Kubernetes",
    resourceType: "namespace",
    displayName: "Namespace",
    iconId: KUBERNETES_ICON_IDS.namespace,
    properties: [
      { key: "name", label: "Name", type: "text", defaultValue: "default" },
      { key: "environment", label: "Environment", type: "select", defaultValue: "development", options: ["development", "staging", "production"] },
    ],
  },
  {
    id: "k8s:node",
    provider: "kubernetes",
    service: "Kubernetes",
    resourceType: "node",
    displayName: "Node",
    iconId: KUBERNETES_ICON_IDS.node,
    properties: [
      { key: "name", label: "Name", type: "text", defaultValue: "Node" },
      { key: "nodeType", label: "Node Type", type: "select", defaultValue: "Worker", options: ["Worker", "Control Plane"] },
      { key: "environment", label: "Environment", type: "select", defaultValue: "development", options: ["development", "staging", "production"] },
    ],
  },
  {
    id: "k8s:pod",
    provider: "kubernetes",
    service: "Kubernetes",
    resourceType: "pod",
    displayName: "Pod",
    iconId: KUBERNETES_ICON_IDS.pod,
    properties: [
      { key: "name", label: "Name", type: "text", defaultValue: "Pod" },
      { key: "namespace", label: "Namespace", type: "text", defaultValue: "default" },
      { key: "environment", label: "Environment", type: "select", defaultValue: "development", options: ["development", "staging", "production"] },
    ],
  },
  {
    id: "k8s:deployment",
    provider: "kubernetes",
    service: "Kubernetes",
    resourceType: "deployment",
    displayName: "Deployment",
    iconId: KUBERNETES_ICON_IDS.deployment,
    properties: [
      { key: "name", label: "Name", type: "text", defaultValue: "Deployment" },
      { key: "namespace", label: "Namespace", type: "text", defaultValue: "default" },
      { key: "replicas", label: "Replicas", type: "number", defaultValue: 1 },
      { key: "environment", label: "Environment", type: "select", defaultValue: "development", options: ["development", "staging", "production"] },
    ],
  },
  {
    id: "k8s:statefulset",
    provider: "kubernetes",
    service: "Kubernetes",
    resourceType: "statefulset",
    displayName: "StatefulSet",
    iconId: KUBERNETES_ICON_IDS.statefulset,
    properties: [
      { key: "name", label: "Name", type: "text", defaultValue: "StatefulSet" },
      { key: "namespace", label: "Namespace", type: "text", defaultValue: "default" },
      { key: "replicas", label: "Replicas", type: "number", defaultValue: 1 },
      { key: "environment", label: "Environment", type: "select", defaultValue: "development", options: ["development", "staging", "production"] },
    ],
  },
  {
    id: "k8s:daemonset",
    provider: "kubernetes",
    service: "Kubernetes",
    resourceType: "daemonset",
    displayName: "DaemonSet",
    iconId: KUBERNETES_ICON_IDS.daemonset,
    properties: [
      { key: "name", label: "Name", type: "text", defaultValue: "DaemonSet" },
      { key: "namespace", label: "Namespace", type: "text", defaultValue: "default" },
      { key: "environment", label: "Environment", type: "select", defaultValue: "development", options: ["development", "staging", "production"] },
    ],
  },
  {
    id: "k8s:service",
    provider: "kubernetes",
    service: "Kubernetes",
    resourceType: "service",
    displayName: "Service",
    iconId: KUBERNETES_ICON_IDS.service,
    properties: [
      { key: "name", label: "Name", type: "text", defaultValue: "Service" },
      { key: "namespace", label: "Namespace", type: "text", defaultValue: "default" },
      { key: "serviceType", label: "Service Type", type: "select", defaultValue: "ClusterIP", options: ["ClusterIP", "NodePort", "LoadBalancer"] },
      { key: "environment", label: "Environment", type: "select", defaultValue: "development", options: ["development", "staging", "production"] },
    ],
  },
];

export function getKubernetesResourceDefinitionById(definitionId) {
  return kubernetesResourceDefinitions.find((definition) => definition.id === definitionId) || null;
}

export function getKubernetesResourceDefinitionForIcon(icon) {
  if (!icon?.id) return null;
  return kubernetesResourceDefinitions.find((definition) => definition.iconId === icon.id) || null;
}

export function getKubernetesResourceDefaults(definition) {
  if (!definition) return {};
  return Object.fromEntries(definition.properties.map((property) => [property.key, property.defaultValue ?? ""]));
}

export function applyKubernetesResourcePatch(resource, patch = {}) {
  if (!resource?.kubernetesResourceId || !resource?.definitionId) return null;
  return { ...resource, properties: { ...resource.properties, ...patch } };
}
