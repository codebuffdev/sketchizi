export function validateKubernetesResources(resources) {
  const issues = [];
  const expectedApiVersions = { Pod: "v1", Service: "v1", Namespace: "v1", ConfigMap: "v1", Secret: "v1", PersistentVolume: "v1", PersistentVolumeClaim: "v1", ServiceAccount: "v1", Deployment: "apps/v1", StatefulSet: "apps/v1", DaemonSet: "apps/v1", ReplicaSet: "apps/v1", Job: "batch/v1", CronJob: "batch/v1", Ingress: "networking.k8s.io/v1", NetworkPolicy: "networking.k8s.io/v1", Role: "rbac.authorization.k8s.io/v1", RoleBinding: "rbac.authorization.k8s.io/v1", ClusterRole: "rbac.authorization.k8s.io/v1", ClusterRoleBinding: "rbac.authorization.k8s.io/v1", HorizontalPodAutoscaler: "autoscaling/v2", PodDisruptionBudget: "policy/v1", StorageClass: "storage.k8s.io/v1", ResourceQuota: "v1", LimitRange: "v1" };
  const add = (resource, severity, message) => issues.push({ id: resource.id + ":" + severity + ":" + message, resource: resource.name, kind: resource.kind, severity, message });
  const matches = (selector, labels) => Boolean(selector && labels && Object.keys(selector).length && Object.entries(selector).every(([key, value]) => labels[key] === value));
  const matchesKubernetesSelector = (selector, labels) => {
    if (!selector || typeof selector !== "object" || !labels || typeof labels !== "object") return false;
    if (!Object.entries(selector.matchLabels || {}).every(([key, value]) => labels[key] === value)) return false;
    for (const expression of selector.matchExpressions || []) {
      const values = Array.isArray(expression.values) ? expression.values : [];
      const exists = Object.prototype.hasOwnProperty.call(labels, expression.key);
      if (expression.operator === "In" && (!exists || !values.includes(labels[expression.key]))) return false;
      if (expression.operator === "NotIn" && exists && values.includes(labels[expression.key])) return false;
      if (expression.operator === "Exists" && !exists) return false;
      if (expression.operator === "DoesNotExist" && exists) return false;
      if (!["In", "NotIn", "Exists", "DoesNotExist"].includes(expression.operator)) return false;
    }
    return true;
  };
  const workloadLabels = (workload) => workload.kind === "Pod"
    ? workload.manifest?.metadata?.labels
    : workload.manifest?.spec?.template?.metadata?.labels;
  const workloads = resources.filter((resource) => ["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet", "Pod"].includes(resource.kind));
  const seen = new Set();
  for (const resource of resources) {
    const manifest = resource.manifest || {};
    const spec = manifest.spec || {};
    const expected = expectedApiVersions[resource.kind];
    if (expected && resource.apiVersion !== expected) add(resource, "error", "Expected apiVersion " + expected + ", found " + resource.apiVersion + ".");
    if (["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet"].includes(resource.kind)) {
      const selector = spec.selector?.matchLabels;
      const labels = spec.template?.metadata?.labels;
      if (!selector || !Object.keys(selector).length) add(resource, "error", "spec.selector.matchLabels is required.");
      else if (!matches(selector, labels)) add(resource, "error", "Selector labels must match spec.template.metadata.labels.");
      const containers = spec.template?.spec?.containers;
      if (!Array.isArray(containers) || !containers.length) add(resource, "error", "At least one container is required in the pod template.");
      else containers.forEach((container, index) => { if (!container.image) add(resource, "error", "Container " + (container.name || index + 1) + " is missing an image."); });
    }
    if (resource.kind === "Pod") {
      const containers = spec.containers;
      if (!Array.isArray(containers) || !containers.length) add(resource, "error", "At least one container is required.");
      else containers.forEach((container, index) => { if (!container.image) add(resource, "error", "Container " + (container.name || index + 1) + " is missing an image."); });
    }
    const key = resource.namespace + "/" + resource.kind + "/" + resource.name;
    if (seen.has(key)) add(resource, "error", "Duplicate resource name and kind in the same namespace.");
    seen.add(key);

    const podSpec = resource.kind === "Pod" ? spec : spec.template?.spec;
    const containers = [...(podSpec?.initContainers || []), ...(podSpec?.containers || []), ...(podSpec?.ephemeralContainers || [])];
    const containerNames = new Set();
    for (const container of containers) {
      if (container.name && containerNames.has(container.name)) add(resource, "error", "Container name '" + container.name + "' is duplicated.");
      if (container.name) containerNames.add(container.name);
      if (container.image && /:latest$/.test(container.image)) add(resource, "warning", "Image '" + container.image + "' uses the mutable latest tag; pin a version or digest for repeatable deployments.");
      if (container.image && !container.image.includes(":") && !container.image.includes("@")) add(resource, "warning", "Image '" + container.image + "' has no explicit tag or digest.");
      if (container.imagePullPolicy != null && !["Always", "IfNotPresent", "Never"].includes(container.imagePullPolicy)) add(resource, "error", "Container '" + (container.name || "unnamed") + "' has invalid imagePullPolicy '" + container.imagePullPolicy + "'.");
      const declaredContainerPortNames = new Set((container.ports || []).map((port) => port.name).filter(Boolean));
      for (const probeName of ["readinessProbe", "livenessProbe", "startupProbe"]) {
        const probe = container[probeName];
        if (!probe) continue;
        const probePort = probe.httpGet?.port ?? probe.tcpSocket?.port;
        if (typeof probePort === "number" && (!Number.isInteger(probePort) || probePort < 1 || probePort > 65535)) add(resource, "error", "Container '" + (container.name || "unnamed") + "' " + probeName + " port must be an integer between 1 and 65535.");
        if (typeof probePort === "string" && !declaredContainerPortNames.has(probePort)) add(resource, "warning", "Container '" + (container.name || "unnamed") + "' " + probeName + " references named port '" + probePort + "', which is not declared on that container.");
        if (probe.httpGet && !probe.httpGet.path) add(resource, "warning", "Container '" + (container.name || "unnamed") + "' " + probeName + " HTTP probe does not declare a path.");
        for (const timingField of ["initialDelaySeconds", "periodSeconds", "timeoutSeconds", "failureThreshold", "successThreshold"]) {
          if (probe[timingField] != null && (!Number.isInteger(probe[timingField]) || probe[timingField] < (timingField === "initialDelaySeconds" ? 0 : 1))) add(resource, "error", "Container '" + (container.name || "unnamed") + "' " + probeName + " " + timingField + " has an invalid value.");
        }
      }
      if (container.securityContext?.privileged === true) add(resource, "warning", "Container '" + (container.name || "unnamed") + "' runs in privileged mode.");
      const requests = container.resources?.requests || {};
      const limits = container.resources?.limits || {};
      if (!requests.cpu && !requests.memory) add(resource, "warning", "Container '" + (container.name || "unnamed") + "' has no CPU or memory requests.");
      if (!limits.cpu && !limits.memory) add(resource, "warning", "Container '" + (container.name || "unnamed") + "' has no CPU or memory limits.");
      const parseQuantity = (value, resourceName) => {
        if (typeof value === "number") return Number.isFinite(value) && value >= 0 ? value : null;
        if (typeof value !== "string" || !value.trim()) return null;
        const match = value.trim().match(/^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?)(m|Ki|Mi|Gi|Ti|Pi|Ei|k|K|M|G|T|P|E)?$/);
        if (!match) return null;
        const amount = Number(match[1]);
        if (!Number.isFinite(amount) || amount < 0) return null;
        const suffix = match[2] || "";
        if (resourceName === "cpu") {
          if (suffix === "m") return amount / 1000;
          if (["Ki", "Mi", "Gi", "Ti", "Pi", "Ei"].includes(suffix)) return null;
          const factors = { k: 1e3, K: 1e3, M: 1e6, G: 1e9, T: 1e12, P: 1e15, E: 1e18 };
          return amount * (factors[suffix] || 1);
        }
        const factors = { m: 0.001, Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4, Pi: 1024 ** 5, Ei: 1024 ** 6, k: 1e3, K: 1e3, M: 1e6, G: 1e9, T: 1e12, P: 1e15, E: 1e18 };
        return amount * (factors[suffix] || 1);
      };
      for (const resourceName of ["cpu", "memory"]) {
        for (const [field, values] of [["requests", requests], ["limits", limits]]) {
          if (values[resourceName] != null && parseQuantity(values[resourceName], resourceName) == null) add(resource, "error", "Container '" + (container.name || "unnamed") + "' has an invalid " + field + "." + resourceName + " quantity '" + values[resourceName] + "'.");
        }
        if (requests[resourceName] != null && limits[resourceName] != null) {
          const requestValue = parseQuantity(requests[resourceName], resourceName);
          const limitValue = parseQuantity(limits[resourceName], resourceName);
          if (requestValue != null && limitValue != null && requestValue > limitValue) add(resource, "error", "Container '" + (container.name || "unnamed") + "' requests " + resourceName + " above its configured limit.");
        }
      }
      if (!container.readinessProbe) add(resource, "warning", "Container '" + (container.name || "unnamed") + "' has no readiness probe.");
    }

    if (podSpec) {
      const podSecurityContext = podSpec.securityContext || {};
      if (podSecurityContext.runAsUser === 0) add(resource, "warning", "Pod securityContext explicitly runs as root (runAsUser: 0). Use a non-root user where possible.");
      if (podSpec.hostNetwork === true) add(resource, "warning", "Pod uses hostNetwork, reducing network isolation from the node.");
      if (podSpec.hostPID === true) add(resource, "warning", "Pod uses hostPID, exposing the node process namespace to the workload.");
      if (podSpec.hostIPC === true) add(resource, "warning", "Pod uses hostIPC, exposing the node IPC namespace to the workload.");
      if (podSpec.automountServiceAccountToken === true) add(resource, "warning", "Pod explicitly automounts its ServiceAccount token; disable it when Kubernetes API access is not required.");
      if (!podSecurityContext.seccompProfile?.type) add(resource, "info", "Pod does not declare a seccomp profile; consider RuntimeDefault or a tailored profile.");
      const volumeNames = new Set();
      for (const volume of podSpec.volumes || []) {
        if (volume.name && volumeNames.has(volume.name)) add(resource, "error", "Pod volume name '" + volume.name + "' is duplicated.");
        if (volume.name) volumeNames.add(volume.name);
      }
      for (const container of containers) {
        const mountedNames = new Set();
        const mountPaths = new Set();
        for (const mount of container.volumeMounts || []) {
          if (!mount.name || !volumeNames.has(mount.name)) add(resource, "error", "Container '" + (container.name || "unnamed") + "' mounts volume '" + (mount.name || "(missing name)") + "', but that volume is not declared in the pod spec.");
          if (mount.name && mountedNames.has(mount.name)) add(resource, "warning", "Container '" + (container.name || "unnamed") + "' mounts volume '" + mount.name + "' more than once.");
          if (!mount.mountPath || typeof mount.mountPath !== "string") add(resource, "error", "Container '" + (container.name || "unnamed") + "' volumeMount must define mountPath.");
          else if (mountPaths.has(mount.mountPath)) add(resource, "error", "Container '" + (container.name || "unnamed") + "' mounts more than one volume at path '" + mount.mountPath + "'.");
          if (mount.mountPath) mountPaths.add(mount.mountPath);
          if (mount.subPathExpr && mount.subPath) add(resource, "warning", "Container '" + (container.name || "unnamed") + "' volumeMount defines both subPath and subPathExpr; use only one.");
          if (mount.name) mountedNames.add(mount.name);
        }
        const declaredPorts = new Set();
        for (const port of container.ports || []) {
          if (!Number.isInteger(port.containerPort) || port.containerPort < 1 || port.containerPort > 65535) add(resource, "error", "Container '" + (container.name || "unnamed") + "' has a containerPort outside the valid 1–65535 range.");
          const portKey = String(port.containerPort) + "/" + String(port.protocol || "TCP");
          if (declaredPorts.has(portKey)) add(resource, "warning", "Container '" + (container.name || "unnamed") + "' declares container port " + portKey + " more than once.");
          declaredPorts.add(portKey);
        }
      }
      for (const volume of podSpec.volumes || []) {
        if (volume.hostPath) add(resource, "warning", "Volume '" + (volume.name || "unnamed") + "' uses hostPath, which exposes node filesystem paths to the workload.");
      }
      for (const container of containers) {
        const containerSecurityContext = container.securityContext || {};
        if (containerSecurityContext.allowPrivilegeEscalation === true) add(resource, "warning", "Container '" + (container.name || "unnamed") + "' allows privilege escalation.");
        else if (containerSecurityContext.allowPrivilegeEscalation !== false) add(resource, "info", "Container '" + (container.name || "unnamed") + "' does not explicitly disable privilege escalation.");
        if (containerSecurityContext.runAsUser === 0) add(resource, "warning", "Container '" + (container.name || "unnamed") + "' explicitly runs as root (runAsUser: 0).");
        if (containerSecurityContext.runAsNonRoot !== true) add(resource, "info", "Container '" + (container.name || "unnamed") + "' does not enforce runAsNonRoot.");
        if (containerSecurityContext.readOnlyRootFilesystem !== true) add(resource, "info", "Container '" + (container.name || "unnamed") + "' does not use a read-only root filesystem.");
        const addedCapabilities = containerSecurityContext.capabilities?.add || [];
        const droppedCapabilities = containerSecurityContext.capabilities?.drop || [];
        for (const capability of addedCapabilities) {
          if (["SYS_ADMIN", "NET_ADMIN", "SYS_PTRACE", "DAC_OVERRIDE"].includes(capability)) add(resource, "warning", "Container '" + (container.name || "unnamed") + "' adds high-risk Linux capability " + capability + ".");
        }
        if (!droppedCapabilities.some((capability) => String(capability).toUpperCase() === "ALL")) add(resource, "info", "Container '" + (container.name || "unnamed") + "' does not drop all Linux capabilities.");
        if (!containerSecurityContext.seccompProfile?.type && !podSecurityContext.seccompProfile?.type) add(resource, "info", "Container '" + (container.name || "unnamed") + "' has no seccomp profile at pod or container level.");
      }
    }

    if (["Role", "ClusterRole"].includes(resource.kind)) {
      if (!Array.isArray(manifest.rules) || !manifest.rules.length) add(resource, "warning", resource.kind + " should define a non-empty rules list.");
      for (const [index, rule] of (Array.isArray(manifest.rules) ? manifest.rules : []).entries()) {
        if (!rule || typeof rule !== "object") {
          add(resource, "error", "RBAC rule " + (index + 1) + " must be an object.");
          continue;
        }
        if (!Array.isArray(rule.verbs) || !rule.verbs.length || rule.verbs.some((verb) => typeof verb !== "string" || !verb.trim())) add(resource, "error", "RBAC rule " + (index + 1) + " must define a non-empty verbs list.");
        if ((!Array.isArray(rule.resources) || !rule.resources.length) && (!Array.isArray(rule.nonResourceURLs) || !rule.nonResourceURLs.length)) add(resource, "error", "RBAC rule " + (index + 1) + " must define resources or nonResourceURLs.");
        if (rule.apiGroups != null && (!Array.isArray(rule.apiGroups) || rule.apiGroups.some((group) => typeof group !== "string"))) add(resource, "error", "RBAC rule " + (index + 1) + " apiGroups must be a list of strings.");
        if (rule.resources != null && (!Array.isArray(rule.resources) || rule.resources.some((item) => typeof item !== "string"))) add(resource, "error", "RBAC rule " + (index + 1) + " resources must be a list of strings.");
        if (rule.resourceNames != null && (!Array.isArray(rule.resourceNames) || rule.resourceNames.some((item) => typeof item !== "string" || !item.trim()))) add(resource, "error", "RBAC rule " + (index + 1) + " resourceNames must be a list of non-empty strings.");
        if (rule.nonResourceURLs != null && (!Array.isArray(rule.nonResourceURLs) || rule.nonResourceURLs.some((item) => typeof item !== "string" || !item.trim()))) add(resource, "error", "RBAC rule " + (index + 1) + " nonResourceURLs must be a list of non-empty strings.");
      }
    }
    if (["RoleBinding", "ClusterRoleBinding"].includes(resource.kind)) {
      const roleRef = manifest.roleRef;
      if (!roleRef || typeof roleRef !== "object" || !roleRef.name || !roleRef.kind) {
        add(resource, "error", "RBAC binding must define roleRef.kind and roleRef.name.");
      } else if (resource.kind === "ClusterRoleBinding" && roleRef.kind !== "ClusterRole") {
        add(resource, "error", "ClusterRoleBinding roleRef.kind must be ClusterRole.");
      } else if (resource.kind === "RoleBinding" && !["Role", "ClusterRole"].includes(roleRef.kind)) {
        add(resource, "error", "RoleBinding roleRef.kind must be Role or ClusterRole.");
      }
      if (!Array.isArray(manifest.subjects) || !manifest.subjects.length) add(resource, "error", "RBAC binding must define at least one subject.");
      for (const [index, subject] of (Array.isArray(manifest.subjects) ? manifest.subjects : []).entries()) {
        if (!subject || typeof subject !== "object" || !["User", "Group", "ServiceAccount"].includes(subject.kind) || !subject.name) {
          add(resource, "error", "RBAC binding subject " + (index + 1) + " must define a supported kind and name.");
        }
      }
    }
    if (["Role", "ClusterRole"].includes(resource.kind)) {
      const rules = Array.isArray(manifest.rules) ? manifest.rules : [];
      for (const rule of rules) {
        if ((rule.verbs || []).includes("*")) add(resource, "warning", "RBAC rule grants wildcard verbs (*); restrict permissions to the actions required.");
        if ((rule.resources || []).includes("*")) add(resource, "warning", "RBAC rule grants access to all resources (*); enumerate only the required resources.");
        if ((rule.apiGroups || []).includes("*")) add(resource, "warning", "RBAC rule spans all API groups (*); restrict it to the required API groups.");
        if ((rule.resources || []).includes("secrets") && (rule.verbs || []).some((verb) => ["*", "get", "list", "watch"].includes(verb))) {
          add(resource, "warning", "RBAC rule can read Secrets; grant this only when the workload explicitly requires it.");
        }
      }
    }
    if (resource.kind === "ClusterRoleBinding" && manifest.roleRef?.name === "cluster-admin") {
      add(resource, "warning", "This binding grants the cluster-admin ClusterRole; use a narrower role whenever possible.");
    }
    if (resource.kind === "RoleBinding" && manifest.roleRef?.name === "cluster-admin") {
      add(resource, "warning", "This binding references cluster-admin; verify that cluster-wide administrator permissions are truly required.");
    }

    if (resource.kind === "Service") {
      if (spec.type != null && !["ClusterIP", "NodePort", "LoadBalancer", "ExternalName"].includes(spec.type)) add(resource, "error", "Service type must be ClusterIP, NodePort, LoadBalancer, or ExternalName.");
      if (spec.type === "ExternalName" && (typeof spec.externalName !== "string" || !spec.externalName.trim())) add(resource, "error", "ExternalName Service must define spec.externalName.");
      if (spec.type !== "ExternalName" && spec.externalName != null) add(resource, "warning", "spec.externalName is only used by an ExternalName Service.");
      if (!Array.isArray(spec.ports) || !spec.ports.length) add(resource, "error", "A Service must define at least one port.");
      if (spec.selector && Object.keys(spec.selector).length) {
        const matchingWorkload = workloads.some((workload) => workload.namespace === resource.namespace && matches(spec.selector, workload.kind === "Pod" ? workload.manifest?.metadata?.labels : workload.manifest?.spec?.template?.metadata?.labels));
        if (!matchingWorkload) add(resource, "warning", "No workload in this manifest set matches the Service selector.");
      }
      const seenServicePorts = new Set();
      const matchingWorkloads = workloads.filter((workload) => workload.namespace === resource.namespace && matches(spec.selector, workload.kind === "Pod" ? workload.manifest?.metadata?.labels : workload.manifest?.spec?.template?.metadata?.labels));
      for (const port of spec.ports || []) {
        const protocol = String(port.protocol || "TCP").toUpperCase();
        const portKey = String(port.port) + "/" + protocol;
        if (seenServicePorts.has(portKey)) add(resource, "error", "Service contains a duplicate port/protocol pair for " + port.port + "/" + protocol + ".");
        seenServicePorts.add(portKey);
        if (!Number.isInteger(port.port) || port.port < 1 || port.port > 65535) add(resource, "error", "Service port must be an integer between 1 and 65535.");
        if (port.name && !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(port.name)) add(resource, "error", "Service port name '" + port.name + "' must be a lowercase alphanumeric name with optional internal hyphens.");
        if (typeof port.targetPort === "number" && (!Number.isInteger(port.targetPort) || port.targetPort < 1 || port.targetPort > 65535)) add(resource, "error", "Numeric targetPort must be an integer between 1 and 65535.");
        if (typeof port.targetPort === "string" && matchingWorkloads.length) {
          const namedPortExists = matchingWorkloads.some((workload) => {
            const workloadPodSpec = workload.kind === "Pod" ? workload.manifest?.spec : workload.manifest?.spec?.template?.spec;
            return [...(workloadPodSpec?.initContainers || []), ...(workloadPodSpec?.containers || [])].some((container) =>
              (container.ports || []).some((containerPort) => containerPort.name === port.targetPort && String(containerPort.protocol || "TCP").toUpperCase() === protocol)
            );
          });
          if (!namedPortExists) add(resource, "warning", "Named targetPort '" + port.targetPort + "' is not declared by a matching workload container for protocol " + protocol + ".");
        }
        if (port.nodePort != null && (!Number.isInteger(port.nodePort) || port.nodePort < 30000 || port.nodePort > 32767)) add(resource, "warning", "NodePort " + port.nodePort + " is outside the default 30000–32767 range.");
        if (port.targetPort == null) add(resource, "info", "Service port " + port.port + " omits targetPort; Kubernetes defaults it to port.");
      }
    }

    if (resource.kind === "Ingress") {
      const rules = Array.isArray(spec.rules) ? spec.rules : [];
      const backends = rules.flatMap((rule) => rule.http?.paths || []).map((path) => path.backend?.service).filter(Boolean);
      if (spec.defaultBackend?.service) backends.push(spec.defaultBackend.service);
      if (!backends.length && !spec.defaultBackend) add(resource, "warning", "Ingress has no HTTP service backend configured.");
      const tlsHosts = new Set();
      for (const [index, entry] of (Array.isArray(spec.tls) ? spec.tls : []).entries()) {
        if (!Array.isArray(entry.hosts) || !entry.hosts.length) add(resource, "warning", "Ingress TLS entry " + (index + 1) + " does not list any hosts.");
        for (const host of Array.isArray(entry.hosts) ? entry.hosts : []) {
          const normalizedHost = String(host).toLowerCase();
          if (tlsHosts.has(normalizedHost)) add(resource, "warning", "Ingress TLS host '" + host + "' is declared more than once.");
          tlsHosts.add(normalizedHost);
        }
        if (!entry.secretName || typeof entry.secretName !== "string") add(resource, "warning", "Ingress TLS entry " + (index + 1) + " does not define a TLS Secret name.");
        else if (!resources.some((candidate) => candidate.kind === "Secret" && candidate.name === entry.secretName && candidate.namespace === resource.namespace)) add(resource, "info", "Ingress TLS Secret '" + entry.secretName + "' is not in this manifest set; it may be provisioned separately.");
      }
      for (const rule of rules) {
        if (rule.host && tlsHosts.size && !tlsHosts.has(String(rule.host).toLowerCase())) add(resource, "info", "Ingress host '" + rule.host + "' is not listed in this Ingress TLS configuration.");
      }
      const seenIngressPaths = new Set();
      for (const rule of rules) {
        for (const path of rule.http?.paths || []) {
          const routeKey = String(rule.host || "*").toLowerCase() + "|" + String(path.path || "/") + "|" + String(path.pathType || "Prefix");
          if (seenIngressPaths.has(routeKey)) add(resource, "warning", "Ingress repeats host/path route '" + routeKey.replace(/\|/g, " / ") + "'.");
          seenIngressPaths.add(routeKey);
          if (!path.path || typeof path.path !== "string" || !path.path.startsWith("/")) add(resource, "error", "Ingress HTTP paths must specify a path beginning with '/'.");
          if (path.pathType != null && !["Exact", "Prefix", "ImplementationSpecific"].includes(path.pathType)) add(resource, "error", "Ingress pathType must be Exact, Prefix, or ImplementationSpecific.");
          if (!path.pathType) add(resource, "warning", "Ingress path '" + (path.path || "(missing)") + "' does not declare pathType.");
          if (!path.backend?.service?.name) add(resource, "error", "Each Ingress HTTP path must reference a backend Service name.");
          const backendPort = path.backend?.service?.port;
          if (path.backend?.service && backendPort?.number == null && !backendPort?.name) add(resource, "error", "Ingress backend Service '" + (path.backend.service.name || "(unnamed)") + "' must specify a port number or port name.");
          if (backendPort?.number != null && (!Number.isInteger(backendPort.number) || backendPort.number < 1 || backendPort.number > 65535)) add(resource, "error", "Ingress backend Service port number must be an integer from 1 to 65535.");
          if (backendPort?.number != null && backendPort?.name) add(resource, "error", "Ingress backend Service port must specify either number or name, not both.");
          if (backendPort?.name != null && (typeof backendPort.name !== "string" || !backendPort.name.trim())) add(resource, "error", "Ingress backend Service port name must be a non-empty string.");
        }
      }
      for (const backend of backends) {
        const service = resources.find((candidate) => candidate.kind === "Service" && candidate.name === backend.name && candidate.namespace === resource.namespace);
        if (!service) add(resource, "warning", "Ingress backend Service '" + backend.name + "' is not present in this manifest set.");
        else {
          const servicePorts = service.manifest?.spec?.ports || [];
          if (backend.port?.number != null && !servicePorts.some((port) => port.port === backend.port.number)) add(resource, "warning", "Ingress backend port " + backend.port.number + " is not declared by Service '" + backend.name + "'.");
          if (backend.port?.name && !servicePorts.some((port) => port.name === backend.port.name)) add(resource, "warning", "Ingress backend port name '" + backend.port.name + "' is not declared by Service '" + backend.name + "'.");
        }
      }
    }

    if (resource.kind === "PersistentVolumeClaim") {
      if (!spec.resources?.requests?.storage) add(resource, "error", "PersistentVolumeClaim must request storage in spec.resources.requests.storage.");
      if (!Array.isArray(spec.accessModes) || !spec.accessModes.length) add(resource, "error", "PersistentVolumeClaim must define at least one spec.accessModes entry.");
      else if (spec.accessModes.some((mode) => !["ReadWriteOnce", "ReadOnlyMany", "ReadWriteMany", "ReadWriteOncePod"].includes(mode))) add(resource, "error", "PersistentVolumeClaim contains an unsupported access mode.");
    }
    if (resource.kind === "PersistentVolume" && !spec.capacity?.storage) add(resource, "error", "PersistentVolume must define spec.capacity.storage.");
    if (resource.kind === "ResourceQuota") {
      if (!spec.hard || typeof spec.hard !== "object" || !Object.keys(spec.hard).length) add(resource, "warning", "ResourceQuota should define spec.hard limits.");
      for (const [quotaName, quotaValue] of Object.entries(spec.hard || {})) {
        if (typeof quotaValue !== "string" && typeof quotaValue !== "number") add(resource, "error", "ResourceQuota hard limit '" + quotaName + "' must be a quantity string or number.");
        else if (typeof quotaValue === "string" && !quotaValue.trim()) add(resource, "error", "ResourceQuota hard limit '" + quotaName + "' cannot be empty.");
      }
    }
    if (resource.kind === "LimitRange") {
      if (!Array.isArray(spec.limits) || !spec.limits.length) add(resource, "warning", "LimitRange should define at least one spec.limits entry.");
      for (const [index, limit] of (Array.isArray(spec.limits) ? spec.limits : []).entries()) {
        if (!limit || typeof limit !== "object") {
          add(resource, "error", "LimitRange spec.limits entry " + (index + 1) + " must be an object.");
          continue;
        }
        if (!["Container", "Pod", "PersistentVolumeClaim"].includes(limit.type)) add(resource, "error", "LimitRange entry " + (index + 1) + " has an unsupported type.");
        for (const resourceName of new Set([...Object.keys(limit.min || {}), ...Object.keys(limit.max || {})])) {
          const minValue = limit.min?.[resourceName];
          const maxValue = limit.max?.[resourceName];
          if (minValue != null && maxValue != null && typeof minValue === "number" && typeof maxValue === "number" && minValue > maxValue) {
            add(resource, "error", "LimitRange " + limit.type + " minimum for '" + resourceName + "' exceeds its maximum.");
          }
        }
        for (const field of ["default", "defaultRequest"]) {
          const defaults = limit[field] || {};
          const maximums = limit.max || {};
          for (const [resourceName, defaultValue] of Object.entries(defaults)) {
            const maxValue = maximums[resourceName];
            if (typeof defaultValue === "number" && typeof maxValue === "number" && defaultValue > maxValue) add(resource, "warning", "LimitRange " + field + " for '" + resourceName + "' exceeds the configured maximum.");
          }
        }
      }
    }
    if (resource.kind === "PersistentVolumeClaim" && spec.storageClassName && !resources.some((candidate) => candidate.kind === "StorageClass" && candidate.name === spec.storageClassName)) {
      add(resource, "warning", "PersistentVolumeClaim references StorageClass '" + spec.storageClassName + "', which is not present in this manifest set (it may be provided by the cluster).");
    }
    if (resource.kind === "PersistentVolume" && spec.storageClassName && !resources.some((candidate) => candidate.kind === "StorageClass" && candidate.name === spec.storageClassName)) {
      add(resource, "warning", "PersistentVolume references StorageClass '" + spec.storageClassName + "', which is not present in this manifest set (it may be provided by the cluster).");
    }
    if (resource.kind === "PersistentVolume" && spec.claimRef?.name && !resources.some((candidate) => candidate.kind === "PersistentVolumeClaim" && candidate.name === spec.claimRef.name && candidate.namespace === (spec.claimRef.namespace || "default"))) {
      add(resource, "warning", "PersistentVolume claimRef references PersistentVolumeClaim '" + spec.claimRef.name + "', which is not present in this manifest set.");
    }
    if (["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet"].includes(resource.kind) && spec.replicas != null && (!Number.isInteger(spec.replicas) || spec.replicas < 0)) add(resource, "error", "spec.replicas must be a non-negative integer.");
    if (resource.kind === "Deployment") {
      const strategy = spec.strategy || {};
      if (strategy.type != null && !["Recreate", "RollingUpdate"].includes(strategy.type)) add(resource, "error", "Deployment strategy.type must be Recreate or RollingUpdate.");
      if (strategy.type === "Recreate" && strategy.rollingUpdate != null) add(resource, "warning", "Deployment Recreate strategy should not define rollingUpdate settings.");
      if (strategy.type !== "Recreate" && strategy.rollingUpdate != null) {
        const rollingUpdate = strategy.rollingUpdate;
        const validRolloutValue = (value) => value == null
          || (Number.isInteger(value) && value >= 0)
          || (typeof value === "string" && /^(?:\d{1,2}|100)%$/.test(value));
        for (const field of ["maxSurge", "maxUnavailable"]) {
          if (!validRolloutValue(rollingUpdate[field])) add(resource, "error", "Deployment rollingUpdate." + field + " must be a non-negative integer or a percentage from 0% to 100%.");
        }
        if (rollingUpdate.maxSurge === 0 && rollingUpdate.maxUnavailable === 0) add(resource, "error", "Deployment rollingUpdate cannot set both maxSurge and maxUnavailable to zero.");
        if (rollingUpdate.maxSurge === "0%" && rollingUpdate.maxUnavailable === "0%") add(resource, "error", "Deployment rollingUpdate cannot set both maxSurge and maxUnavailable to zero.");
      }
    }
    if (resource.kind === "PodDisruptionBudget") {
      const hasMinAvailable = spec.minAvailable != null;
      const hasMaxUnavailable = spec.maxUnavailable != null;
      if (hasMinAvailable === hasMaxUnavailable) add(resource, "error", "PodDisruptionBudget must define exactly one of spec.minAvailable or spec.maxUnavailable.");
      const validDisruptionValue = (value) => (Number.isInteger(value) && value >= 0)
        || (typeof value === "string" && /^(?:\d{1,2}|100)%$/.test(value));
      for (const field of ["minAvailable", "maxUnavailable"]) {
        if (spec[field] != null && !validDisruptionValue(spec[field])) add(resource, "error", "PodDisruptionBudget " + field + " must be a non-negative integer or a percentage from 0% to 100%.");
      }
      if (!spec.selector || typeof spec.selector !== "object") add(resource, "warning", "PodDisruptionBudget has no selector and will not protect any workloads.");
      else {
        const selectedWorkload = workloads.some((workload) => workload.namespace === resource.namespace
          && matchesKubernetesSelector(spec.selector, workloadLabels(workload)));
        if (!selectedWorkload) add(resource, "warning", "PodDisruptionBudget selector does not match a workload in this manifest set.");
      }
      if (spec.maxUnavailable === 0 || spec.maxUnavailable === "0%") add(resource, "warning", "PodDisruptionBudget maxUnavailable is zero and may block voluntary disruptions.");
    }
    if (resource.kind === "StatefulSet" && !spec.serviceName) add(resource, "error", "StatefulSet must define spec.serviceName for its governing Service.");
    if (resource.kind === "StatefulSet" && spec.serviceName && !resources.some((candidate) => candidate.kind === "Service" && candidate.name === spec.serviceName && candidate.namespace === resource.namespace)) {
      add(resource, "warning", "StatefulSet governing Service '" + spec.serviceName + "' is not present in this manifest set.");
    }
    if (resource.kind === "CronJob" && !spec.schedule) add(resource, "error", "CronJob must define spec.schedule.");
    if (resource.kind === "CronJob" && spec.concurrencyPolicy != null && !["Allow", "Forbid", "Replace"].includes(spec.concurrencyPolicy)) add(resource, "error", "CronJob concurrencyPolicy must be Allow, Forbid, or Replace.");
    if (resource.kind === "HorizontalPodAutoscaler") {
      if (!spec.scaleTargetRef?.name || !spec.scaleTargetRef?.kind) add(resource, "error", "HPA must define scaleTargetRef.kind and scaleTargetRef.name.");
      if (spec.minReplicas != null && (!Number.isInteger(spec.minReplicas) || spec.minReplicas < 1)) add(resource, "error", "HPA minReplicas must be a positive integer.");
      if (spec.maxReplicas != null && (!Number.isInteger(spec.maxReplicas) || spec.maxReplicas < 1)) add(resource, "error", "HPA maxReplicas must be a positive integer.");
      if (Number.isInteger(spec.minReplicas) && Number.isInteger(spec.maxReplicas) && spec.minReplicas > spec.maxReplicas) add(resource, "error", "HPA minReplicas cannot exceed maxReplicas.");
      if (spec.scaleTargetRef?.kind && !["Deployment", "StatefulSet", "ReplicaSet"].includes(spec.scaleTargetRef.kind)) add(resource, "warning", "HPA scaleTargetRef.kind is not a commonly supported scalable workload kind.");
      if (!Array.isArray(spec.metrics) || !spec.metrics.length) add(resource, "warning", "HPA should define at least one spec.metrics target.");
      for (const [index, metric] of (Array.isArray(spec.metrics) ? spec.metrics : []).entries()) {
        if (!metric || typeof metric !== "object") {
          add(resource, "error", "HPA metric " + (index + 1) + " must be an object.");
          continue;
        }
        const metricTypes = ["Resource", "Pods", "Object", "External", "ContainerResource"];
        if (!metricTypes.includes(metric.type)) add(resource, "error", "HPA metric " + (index + 1) + " has an unsupported type.");
        const sourceByType = {
          Resource: metric.resource,
          Pods: metric.pods,
          Object: metric.object,
          External: metric.external,
          ContainerResource: metric.containerResource,
        };
        const source = sourceByType[metric.type];
        if (!source) add(resource, "error", "HPA " + (metric.type || "unknown") + " metric " + (index + 1) + " is missing its metric source.");
        if (["Resource", "ContainerResource"].includes(metric.type) && !source?.name) add(resource, "error", "HPA resource metric " + (index + 1) + " must define a resource name.");
        if (["Pods", "External"].includes(metric.type) && !source?.metric?.name) add(resource, "error", "HPA " + metric.type + " metric " + (index + 1) + " must define metric.name.");
        if (metric.type === "Object" && (!source?.describedObject?.kind || !source?.describedObject?.name || !source?.metric?.name)) add(resource, "error", "HPA Object metric " + (index + 1) + " must define describedObject and metric.name.");
        if (source && (!source.target || !["Utilization", "AverageValue", "Value"].includes(source.target.type))) add(resource, "error", "HPA metric " + (index + 1) + " must define a supported target type.");
        if (source?.target?.type === "Utilization" && (!Number.isInteger(source.target.averageUtilization) || source.target.averageUtilization < 1)) add(resource, "error", "HPA metric " + (index + 1) + " Utilization target must define a positive averageUtilization.");
        if (["AverageValue", "Value"].includes(source?.target?.type) && (source.target.averageValue == null && source.target.value == null)) add(resource, "error", "HPA metric " + (index + 1) + " target must define an averageValue or value quantity.");
      }
      for (const direction of ["scaleUp", "scaleDown"]) {
        const policy = spec.behavior?.[direction];
        if (!policy) continue;
        if (policy.stabilizationWindowSeconds != null && (!Number.isInteger(policy.stabilizationWindowSeconds) || policy.stabilizationWindowSeconds < 0 || policy.stabilizationWindowSeconds > 3600)) add(resource, "error", "HPA " + direction + " stabilizationWindowSeconds must be an integer from 0 to 3600.");
        if (policy.selectPolicy != null && !["Max", "Min", "Disabled"].includes(policy.selectPolicy)) add(resource, "error", "HPA " + direction + " selectPolicy must be Max, Min, or Disabled.");
        if (policy.policies != null && !Array.isArray(policy.policies)) add(resource, "error", "HPA " + direction + " policies must be a list.");
        for (const [index, item] of (Array.isArray(policy.policies) ? policy.policies : []).entries()) {
          if (!["Pods", "Percent"].includes(item?.type)) add(resource, "error", "HPA " + direction + " policy " + (index + 1) + " type must be Pods or Percent.");
          if (!Number.isInteger(item?.value) || item.value < 1) add(resource, "error", "HPA " + direction + " policy " + (index + 1) + " value must be a positive integer.");
          if (!Number.isInteger(item?.periodSeconds) || item.periodSeconds < 1 || item.periodSeconds > 1800) add(resource, "error", "HPA " + direction + " policy " + (index + 1) + " periodSeconds must be an integer from 1 to 1800.");
        }
      }
    }
    if (resource.kind === "NetworkPolicy") {
      if (!spec.podSelector || typeof spec.podSelector !== "object") add(resource, "error", "NetworkPolicy must define spec.podSelector (use an empty object to select all pods in the namespace).");
      else {
        const selectedWorkload = workloads.some((workload) => workload.namespace === resource.namespace
          && matchesKubernetesSelector(spec.podSelector, workloadLabels(workload)));
        if (!selectedWorkload) add(resource, "warning", "NetworkPolicy selector does not match a workload in this manifest set.");
      }
      if (spec.policyTypes != null && (!Array.isArray(spec.policyTypes) || spec.policyTypes.some((type) => !["Ingress", "Egress"].includes(type)))) add(resource, "error", "NetworkPolicy policyTypes entries must be Ingress or Egress.");
      if (Array.isArray(spec.policyTypes) && new Set(spec.policyTypes).size !== spec.policyTypes.length) add(resource, "error", "NetworkPolicy policyTypes must not contain duplicates.");
      for (const [direction, rules] of [["ingress", spec.ingress], ["egress", spec.egress]]) {
        if (rules != null && !Array.isArray(rules)) add(resource, "error", "NetworkPolicy spec." + direction + " must be a list.");
        for (const [index, rule] of (Array.isArray(rules) ? rules : []).entries()) {
          const ruleLabel = "NetworkPolicy " + direction + " rule " + (index + 1);
          if (!rule || typeof rule !== "object" || Array.isArray(rule)) {
            add(resource, "error", ruleLabel + " must be an object.");
            continue;
          }
          const peersKey = direction === "ingress" ? "from" : "to";
          if (rule[peersKey] != null && !Array.isArray(rule[peersKey])) add(resource, "error", ruleLabel + " " + peersKey + " must be a list.");
          for (const [peerIndex, peer] of (Array.isArray(rule[peersKey]) ? rule[peersKey] : []).entries()) {
            if (!peer || typeof peer !== "object" || Array.isArray(peer)) {
              add(resource, "error", ruleLabel + " peer " + (peerIndex + 1) + " must be an object.");
              continue;
            }
            const hasPodSelector = peer.podSelector != null;
            const hasNamespaceSelector = peer.namespaceSelector != null;
            const hasIpBlock = peer.ipBlock != null;
            if (Number(hasPodSelector) + Number(hasNamespaceSelector) + Number(hasIpBlock) !== 1 && !(hasPodSelector && hasNamespaceSelector && !hasIpBlock)) {
              add(resource, "error", ruleLabel + " peer " + (peerIndex + 1) + " must define a valid podSelector/namespaceSelector combination or ipBlock.");
            }
            if (hasIpBlock) {
              if (typeof peer.ipBlock !== "object" || !peer.ipBlock.cidr || typeof peer.ipBlock.cidr !== "string") add(resource, "error", ruleLabel + " peer " + (peerIndex + 1) + " ipBlock must define a CIDR string.");
              if (peer.ipBlock?.except != null && (!Array.isArray(peer.ipBlock.except) || peer.ipBlock.except.some((cidr) => typeof cidr !== "string" || !cidr.trim()))) add(resource, "error", ruleLabel + " ipBlock.except must be a list of non-empty CIDR strings.");
            }
          }
          if (rule.ports != null && !Array.isArray(rule.ports)) {
            add(resource, "error", ruleLabel + " ports must be a list.");
            continue;
          }
          for (const [portIndex, port] of (Array.isArray(rule.ports) ? rule.ports : []).entries()) {
            const portLabel = ruleLabel + " port " + (portIndex + 1);
            if (!port || typeof port !== "object" || Array.isArray(port)) {
              add(resource, "error", portLabel + " must be an object.");
              continue;
            }
            if (port.protocol != null && !["TCP", "UDP", "SCTP"].includes(port.protocol)) add(resource, "error", portLabel + " protocol must be TCP, UDP, or SCTP.");
            if (port.port != null && typeof port.port === "number" && (!Number.isInteger(port.port) || port.port < 1 || port.port > 65535)) add(resource, "error", portLabel + " numeric port must be an integer from 1 to 65535.");
            if (port.port != null && typeof port.port !== "number" && (typeof port.port !== "string" || !/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(port.port))) add(resource, "error", portLabel + " named port must be a valid lowercase port name.");
            if (port.endPort != null && (!Number.isInteger(port.endPort) || typeof port.port !== "number" || port.endPort < port.port || port.endPort > 65535)) add(resource, "error", portLabel + " endPort requires a numeric port and must be between port and 65535.");
          }
        }
      }
    }
  }

  const addDependencyIssue = (resource, severity, code, message) => {
    issues.push({ id: resource.id + ":" + severity + ":" + code, resource: resource.name, kind: resource.kind, severity, message });
  };
  // Cluster-scoped objects are addressed by kind/name, never by a namespace.
  // Treating their normalized "default" namespace as real caused false missing
  // dependency warnings when a namespaced resource referenced them.
  const CLUSTER_SCOPED_KINDS = new Set([
    "Namespace", "Node", "PersistentVolume", "StorageClass", "ClusterRole",
    "ClusterRoleBinding", "CustomResourceDefinition", "IngressClass",
  ]);
  const hasResource = (kind, name, namespace) => resources.some((candidate) =>
    candidate.kind === kind && candidate.name === name
      && (CLUSTER_SCOPED_KINDS.has(kind) || namespace == null || candidate.namespace === namespace)
  );

  for (const resource of resources) {
    const podSpec = resource.kind === "Pod" ? resource.manifest?.spec : resource.manifest?.spec?.template?.spec;
    if (!podSpec) continue;
    if (podSpec.serviceAccountName && !hasResource("ServiceAccount", podSpec.serviceAccountName, resource.namespace)) {
      addDependencyIssue(resource, "warning", "service-account:" + podSpec.serviceAccountName, "References ServiceAccount '" + podSpec.serviceAccountName + "', which is not present in this manifest set (it may be created separately).");
    }
    for (const imagePullSecret of podSpec.imagePullSecrets || []) {
      if (imagePullSecret.name && !hasResource("Secret", imagePullSecret.name, resource.namespace)) {
        addDependencyIssue(resource, "warning", "image-pull-secret:" + imagePullSecret.name, "Image pull credentials reference Secret '" + imagePullSecret.name + "', which is not present in this manifest set.");
      }
    }
    for (const volume of podSpec.volumes || []) {
      const claimName = volume.persistentVolumeClaim?.claimName;
      if (claimName && !hasResource("PersistentVolumeClaim", claimName, resource.namespace)) {
        addDependencyIssue(resource, "warning", "pvc:" + claimName, "Volume references PersistentVolumeClaim '" + claimName + "', which is not present in this manifest set.");
      }
      const configMapName = volume.configMap?.name;
      if (configMapName && !hasResource("ConfigMap", configMapName, resource.namespace)) {
        addDependencyIssue(resource, "warning", "configmap:" + configMapName, "Volume references ConfigMap '" + configMapName + "', which is not present in this manifest set.");
      }
      const secretName = volume.secret?.secretName;
      if (secretName && !hasResource("Secret", secretName, resource.namespace)) {
        addDependencyIssue(resource, "warning", "secret:" + secretName, "Volume references Secret '" + secretName + "', which is not present in this manifest set.");
      }
      const projected = volume.projected?.sources || [];
      for (const source of projected) {
        const projectedConfigMap = source.configMap?.name;
        const projectedSecret = source.secret?.name;
        if (projectedConfigMap && !hasResource("ConfigMap", projectedConfigMap, resource.namespace)) {
          addDependencyIssue(resource, "warning", "projected-configmap:" + projectedConfigMap, "Projected volume references ConfigMap '" + projectedConfigMap + "', which is not present in this manifest set.");
        }
        if (projectedSecret && !hasResource("Secret", projectedSecret, resource.namespace)) {
          addDependencyIssue(resource, "warning", "projected-secret:" + projectedSecret, "Projected volume references Secret '" + projectedSecret + "', which is not present in this manifest set.");
        }
      }
    }
    for (const container of [...(podSpec.initContainers || []), ...(podSpec.containers || []), ...(podSpec.ephemeralContainers || [])]) {
      for (const envFrom of container.envFrom || []) {
        const configMapName = envFrom.configMapRef?.name;
        const secretName = envFrom.secretRef?.name;
        if (configMapName && !hasResource("ConfigMap", configMapName, resource.namespace)) {
          addDependencyIssue(resource, "warning", "env-configmap:" + configMapName, "Container environment references ConfigMap '" + configMapName + "', which is not present in this manifest set.");
        }
        if (secretName && !hasResource("Secret", secretName, resource.namespace)) {
          addDependencyIssue(resource, "warning", "env-secret:" + secretName, "Container environment references Secret '" + secretName + "', which is not present in this manifest set.");
        }
      }
      for (const env of container.env || []) {
        const configMapName = env.valueFrom?.configMapKeyRef?.name;
        const secretName = env.valueFrom?.secretKeyRef?.name;
        if (env.valueFrom?.configMapKeyRef && !configMapName) {
          addDependencyIssue(resource, "error", "env-key-configmap-name:" + (env.name || "unnamed"), "Environment variable '" + (env.name || "unnamed") + "' has configMapKeyRef without a ConfigMap name.");
        } else if (configMapName && !hasResource("ConfigMap", configMapName, resource.namespace)) {
          addDependencyIssue(resource, env.valueFrom.configMapKeyRef.optional === true ? "info" : "warning", "env-key-configmap:" + configMapName, "Environment variable '" + env.name + "' references ConfigMap '" + configMapName + "', which is not present in this manifest set" + (env.valueFrom.configMapKeyRef.optional === true ? " (the reference is optional)." : "."));
        }
        if (env.valueFrom?.secretKeyRef && !secretName) {
          addDependencyIssue(resource, "error", "env-key-secret-name:" + (env.name || "unnamed"), "Environment variable '" + (env.name || "unnamed") + "' has secretKeyRef without a Secret name.");
        } else if (secretName && !hasResource("Secret", secretName, resource.namespace)) {
          addDependencyIssue(resource, env.valueFrom.secretKeyRef.optional === true ? "info" : "warning", "env-key-secret:" + secretName, "Environment variable '" + env.name + "' references Secret '" + secretName + "', which is not present in this manifest set" + (env.valueFrom.secretKeyRef.optional === true ? " (the reference is optional)." : "."));
        }
      }
    }
  }

  for (const resource of resources) {
    const spec = resource.manifest?.spec || {};
    if (resource.kind === "HorizontalPodAutoscaler" && spec.scaleTargetRef?.name) {
      const targetKind = spec.scaleTargetRef.kind || "Deployment";
      const target = resources.find((candidate) => candidate.kind === targetKind && candidate.name === spec.scaleTargetRef.name && candidate.namespace === resource.namespace);
      if (!target) {
        addDependencyIssue(resource, "warning", "hpa-target:" + spec.scaleTargetRef.name, "HPA target " + targetKind + "/" + spec.scaleTargetRef.name + " is not present in this manifest set.");
      } else {
        const metrics = Array.isArray(spec.metrics) ? spec.metrics : [];
        const usesCpuUtilization = metrics.some((metric) => metric.resource?.name === "cpu" && metric.resource?.target?.type === "Utilization");
        if (usesCpuUtilization) {
          const targetPodSpec = target.kind === "Pod" ? target.manifest?.spec : target.manifest?.spec?.template?.spec;
          const targetContainers = [...(targetPodSpec?.initContainers || []), ...(targetPodSpec?.containers || [])];
          if (targetContainers.some((container) => !container.resources?.requests?.cpu)) {
            addDependencyIssue(resource, "warning", "hpa-cpu-request:" + target.name, "HPA uses CPU utilization, but at least one target container has no CPU request; utilization may be undefined.");
          }
        }
      }
    }
    if (resource.kind === "RoleBinding" || resource.kind === "ClusterRoleBinding") {
      const roleRef = spec.roleRef;
      if (roleRef?.name && !hasResource(roleRef.kind, roleRef.name, resource.namespace)) {
        addDependencyIssue(resource, "warning", "role-ref:" + roleRef.name, "Role binding references " + roleRef.kind + "/" + roleRef.name + ", which is not present in this manifest set.");
      }
      for (const subject of spec.subjects || []) {
        if (subject.kind === "ServiceAccount" && subject.name && !hasResource("ServiceAccount", subject.name, subject.namespace || resource.namespace)) {
          addDependencyIssue(resource, "warning", "rbac-service-account:" + subject.name, "Role binding references ServiceAccount '" + subject.name + "', which is not present in this manifest set.");
        }
      }
    }
  }
  return issues;
}
