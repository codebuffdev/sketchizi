// Official Kubernetes Community Icons catalog for Sketchizi Phase 1.
// Runtime artwork is copied verbatim from the supplied official icon package.
export const KUBERNETES_CATALOG_ID = "kubernetes-architecture";
export const KUBERNETES_SOURCE = "kubernetes";
export const KUBERNETES_CATALOG_NAME = "Kubernetes";

export const kubernetesCategories = [
  "Kubernetes",
  "Control Plane",
  "Infrastructure",
  "Workloads",
  "Networking",
  "Configuration",
  "Storage",
  "Access Control",
];

const icon = (id, name, category, file, subtitle, searchAliases = []) => ({
  id: `k8s:${id}`,
  name,
  category,
  subtitle,
  src: `/kubernetes-icons/${file}`,
  source: KUBERNETES_SOURCE,
  catalog: KUBERNETES_CATALOG_ID,
  searchAliases: ["kubernetes", "k8s", ...searchAliases],
});

export const kubernetesIcons = [
  icon("api-server", "API Server", "Control Plane", "k8s--api-server.svg", "Control plane component", ["api server", "apiserver"]),
  icon("cloud-controller-manager", "Cloud Controller Manager", "Control Plane", "k8s--cloud-controller-manager.svg", "Control plane component", ["cloud controller manager", "cloud-controller-manager"]),
  icon("controller-manager", "Controller Manager", "Control Plane", "k8s--controller-manager.svg", "Control plane component", ["controller manager", "kube controller manager"]),
  icon("scheduler", "Scheduler", "Control Plane", "k8s--scheduler.svg", "Control plane component", ["scheduler", "kube scheduler"]),
  icon("etcd", "etcd", "Control Plane", "k8s--etcd-cluster.svg", "Cluster state store", ["etcd cluster"]),

  icon("node", "Node", "Infrastructure", "k8s--worker-node.svg", "Worker node", ["worker node", "worker-node"]),
  icon("kubelet", "Kubelet", "Infrastructure", "k8s--kubelet.svg", "Node agent", ["kubelet", "kubelet agent"]),
  icon("kube-proxy", "Kube Proxy", "Infrastructure", "k8s--kube-proxy.svg", "Node network proxy", ["kube proxy", "kube-proxy"]),
  icon("volume", "Volume", "Infrastructure", "k8s--volume.svg", "Storage volume", ["volume", "volumes"]),

  icon("namespace", "Namespace", "Kubernetes", "k8s--namespace.svg", "Cluster resource scope", ["namespace", "namespaces"]),
  icon("group", "Group", "Kubernetes", "k8s--group.svg", "Kubernetes icon group", ["group", "groups"]),

  icon("pod", "Pod", "Workloads", "k8s--pod.svg", "Workload unit", ["pod", "pods"]),
  icon("deployment", "Deployment", "Workloads", "k8s--deployment.svg", "Workload controller", ["deployment", "deployments"]),
  icon("replicaset", "ReplicaSet", "Workloads", "k8s--replicaset.svg", "Workload controller", ["replica set", "replicaset", "replicasets"]),
  icon("statefulset", "StatefulSet", "Workloads", "k8s--statefulset.svg", "Workload controller", ["statefulset", "stateful set", "statefulsets"]),
  icon("daemonset", "DaemonSet", "Workloads", "k8s--daemonset.svg", "Workload controller", ["daemonset", "daemon set", "daemonsets"]),
  icon("job", "Job", "Workloads", "k8s--job.svg", "Batch workload", ["job", "jobs"]),
  icon("cronjob", "CronJob", "Workloads", "k8s--cronjob.svg", "Scheduled workload", ["cron job", "cron jobs", "cronjobs"]),
  icon("horizontal-pod-autoscaler", "HorizontalPodAutoscaler", "Workloads", "k8s--horizontalpodautoscaler.svg", "Workload autoscaler", ["horizontal pod autoscaler", "horizontalpodautoscaler", "hpa"]),

  icon("service", "Service", "Networking", "k8s--service.svg", "Network endpoint", ["service", "services"]),
  icon("ingress", "Ingress", "Networking", "k8s--ingress.svg", "HTTP/HTTPS routing", ["ingress", "ingresses"]),
  icon("endpoints", "Endpoints", "Networking", "k8s--endpoints.svg", "Service endpoints", ["endpoint", "endpoints"]),
  icon("network-policy", "NetworkPolicy", "Networking", "k8s--networkpolicy.svg", "Network access policy", ["network policy", "networkpolicy"]),

  icon("configmap", "ConfigMap", "Configuration", "k8s--configmap.svg", "Configuration data", ["configmap", "config map", "config maps", "configmaps"]),
  icon("secret", "Secret", "Configuration", "k8s--secret.svg", "Sensitive configuration", ["secret", "secrets"]),
  icon("limitrange", "LimitRange", "Configuration", "k8s--limitrange.svg", "Namespace resource limits", ["limit range", "limitrange"]),
  icon("resourcequota", "ResourceQuota", "Configuration", "k8s--resourcequota.svg", "Namespace resource quota", ["resource quota", "resourcequota"]),

  icon("persistent-volume", "PersistentVolume", "Storage", "k8s--persistentvolume.svg", "Cluster storage", ["persistent volume", "persistentvolume", "pv"]),
  icon("persistent-volume-claim", "PersistentVolumeClaim", "Storage", "k8s--persistentvolumeclaim.svg", "Storage request", ["persistent volume claim", "persistentvolumeclaim", "pvc"]),
  icon("storage-class", "StorageClass", "Storage", "k8s--storageclass.svg", "Storage provisioning class", ["storage class", "storageclass"]),

  icon("cluster-role", "ClusterRole", "Access Control", "k8s--clusterrole.svg", "Cluster-scoped authorization role", ["cluster role", "clusterrole"]),
  icon("cluster-role-binding", "ClusterRoleBinding", "Access Control", "k8s--clusterrolebinding.svg", "Cluster-scoped role binding", ["cluster role binding", "clusterrolebinding"]),
  icon("role", "Role", "Access Control", "k8s--role.svg", "Namespace-scoped authorization role", ["role", "roles"]),
  icon("role-binding", "RoleBinding", "Access Control", "k8s--rolebinding.svg", "Namespace-scoped role binding", ["role binding", "rolebinding"]),
  icon("service-account", "ServiceAccount", "Access Control", "k8s--serviceaccount.svg", "Pod identity", ["service account", "serviceaccount", "sa"]),
  icon("user", "User", "Access Control", "k8s--user.svg", "Kubernetes user identity", ["user", "users"]),
  icon("pod-security-policy", "PodSecurityPolicy", "Access Control", "k8s--podsecuritypolicy.svg", "Pod security policy", ["pod security policy", "podsecuritypolicy"]),
  icon("custom-resource-definition", "CustomResourceDefinition", "Kubernetes", "k8s--customresourcedefinition.svg", "Custom Kubernetes resource definition", ["custom resource definition", "customresourcedefinition", "crd"]),
];

export const kubernetesCategoryCounts = Object.fromEntries(
  kubernetesCategories.map((category) => [
    category,
    kubernetesIcons.filter((entry) => entry.category === category).length,
  ]),
);

export const kubernetesCategoryRepresentatives = Object.fromEntries(
  kubernetesCategories.map((category) => [
    category,
    kubernetesIcons.find((entry) => entry.category === category)?.id,
  ]),
);
