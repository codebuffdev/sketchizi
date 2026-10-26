import { useEffect, useMemo, useRef, useState } from "react";
import { parseAllDocuments, stringify } from "yaml";
import "./kubernetes-studio.css";

const COMPLETION_KINDS = [
  ["Pod", "v1"], ["Service", "v1"], ["Namespace", "v1"], ["ConfigMap", "v1"], ["Secret", "v1"],
  ["PersistentVolume", "v1"], ["PersistentVolumeClaim", "v1"], ["ServiceAccount", "v1"],
  ["Deployment", "apps/v1"], ["StatefulSet", "apps/v1"], ["DaemonSet", "apps/v1"], ["ReplicaSet", "apps/v1"],
  ["Job", "batch/v1"], ["CronJob", "batch/v1"], ["Ingress", "networking.k8s.io/v1"],
  ["NetworkPolicy", "networking.k8s.io/v1"], ["Role", "rbac.authorization.k8s.io/v1"],
  ["RoleBinding", "rbac.authorization.k8s.io/v1"], ["ClusterRole", "rbac.authorization.k8s.io/v1"],
  ["ClusterRoleBinding", "rbac.authorization.k8s.io/v1"], ["HorizontalPodAutoscaler", "autoscaling/v2"],
  ["StorageClass", "storage.k8s.io/v1"], ["ResourceQuota", "v1"], ["LimitRange", "v1"],
];
const COMPLETION_API_VERSIONS = ["v1", "apps/v1", "batch/v1", "networking.k8s.io/v1", "rbac.authorization.k8s.io/v1", "autoscaling/v2", "storage.k8s.io/v1", "policy/v1"];

function highlightYaml(source) {
  return source.split("\n").map((line, index) => {
    const commentIndex = line.indexOf("#");
    const content = commentIndex >= 0 ? line.slice(0, commentIndex) : line;
    const comment = commentIndex >= 0 ? line.slice(commentIndex) : "";
    const match = content.match(/^(\s*)(-\s+)?([A-Za-z_][\w.-]*)(\s*:\s*)(.*)$/);
    let rendered;
    if (match) {
      const [, indent, listMarker = "", key, separator, value] = match;
      const valueClass = /^(true|false|null|yes|no|on|off)$/i.test(value.trim())
        ? "yaml-token-literal"
        : /^-?\d+(?:\.\d+)?$/.test(value.trim())
        ? "yaml-token-number"
        : /^["'].*["']$/.test(value.trim())
        ? "yaml-token-string"
        : key === "kind" || key === "apiVersion"
        ? "yaml-token-type"
        : "yaml-token-value";
      rendered = <>{indent}<span className="yaml-token-punctuation">{listMarker}</span><span className="yaml-token-key">{key}</span><span className="yaml-token-punctuation">{separator}</span><span className={valueClass}>{value}</span>{comment ? <span className="yaml-token-comment">{comment}</span> : null}</>;
    } else {
      rendered = <>{content}{comment ? <span className="yaml-token-comment">{comment}</span> : null}</>;
    }
    return <span className="yaml-highlight-line" key={index}>{rendered}{"\n"}</span>;
  });
}

function buildCompletions(text, caret, force = false) {
  const lineStart = text.lastIndexOf("\n", Math.max(0, caret - 1)) + 1;
  const lineEndIndex = text.indexOf("\n", caret);
  const lineEnd = lineEndIndex < 0 ? text.length : lineEndIndex;
  const line = text.slice(lineStart, lineEnd);
  const beforeCaret = text.slice(lineStart, caret);
  const indent = (line.match(/^\s*/) || [""])[0];
  const previousLines = text.slice(0, lineStart).split("\n").reverse();
  const previousLine = previousLines.find((value) => value.trim())?.trim() || "";
  const currentDocument = text.slice(0, caret).split(/^---\s*$/m).pop() || "";
  const kind = currentDocument.match(/^kind:\s*([A-Za-z]+)/m)?.[1] || "";
  let items = [];
  let replaceStart = lineStart + indent.length;
  let replaceEnd = caret;
  const add = (label, detail, insert) => items.push({ label, detail, insert });

  if (/^kind:\s*/.test(beforeCaret)) {
    const valueStart = lineStart + beforeCaret.indexOf(":") + 1;
    replaceStart = valueStart + (text.slice(valueStart, caret).match(/^\s*/) || [""])[0].length;
    replaceEnd = caret;
    COMPLETION_KINDS.forEach(([name, version]) => add(name, version, name));
  } else if (/^apiVersion:\s*/.test(beforeCaret)) {
    const valueStart = lineStart + beforeCaret.indexOf(":") + 1;
    replaceStart = valueStart + (text.slice(valueStart, caret).match(/^\s*/) || [""])[0].length;
    replaceEnd = caret;
    COMPLETION_API_VERSIONS.forEach((version) => add(version, "Kubernetes API version", version));
  } else if (/^\s*type:\s*/.test(beforeCaret) && kind === "Service") {
    const valueStart = lineStart + beforeCaret.indexOf(":") + 1;
    replaceStart = valueStart + (text.slice(valueStart, caret).match(/^\s*/) || [""])[0].length;
    ["ClusterIP", "NodePort", "LoadBalancer", "ExternalName"].forEach((value) => add(value, "Service type", value));
  } else if (/^\s*restartPolicy:\s*/.test(beforeCaret)) {
    const valueStart = lineStart + beforeCaret.indexOf(":") + 1;
    replaceStart = valueStart + (text.slice(valueStart, caret).match(/^\s*/) || [""])[0].length;
    ["Always", "OnFailure", "Never"].forEach((value) => add(value, "Pod restart policy", value));
  } else if (/^\s*protocol:\s*/.test(beforeCaret)) {
    const valueStart = lineStart + beforeCaret.indexOf(":") + 1;
    replaceStart = valueStart + (text.slice(valueStart, caret).match(/^\s*/) || [""])[0].length;
    ["TCP", "UDP", "SCTP"].forEach((value) => add(value, "Network protocol", value));
  } else if (/^\s*pathType:\s*/.test(beforeCaret)) {
    const valueStart = lineStart + beforeCaret.indexOf(":") + 1;
    replaceStart = valueStart + (text.slice(valueStart, caret).match(/^\s*/) || [""])[0].length;
    ["Prefix", "Exact", "ImplementationSpecific"].forEach((value) => add(value, "Ingress path matching", value));
  } else if (/^\s*kind:\s*$/.test(line) || /^\s*apiVersion:\s*$/.test(line)) {
    return { items: [], replaceStart, replaceEnd };
  } else if (/^\s*kind:\s*[^\s]+/.test(line) && beforeCaret.includes("kind:")) {
    return { items: [], replaceStart, replaceEnd };
  } else {
    const parent = previousLine.replace(/:.*$/, "").trim();
    const fieldGroups = {
      root: ["apiVersion:", "kind:", "metadata:", "spec:", "data:", "type:"],
      metadata: ["name:", "namespace:", "labels:", "annotations:"],
      spec: kind === "Deployment" || kind === "StatefulSet" || kind === "ReplicaSet"
        ? ["replicas:", "selector:", "template:", "strategy:", "minReadySeconds:"]
        : kind === "Service" ? ["type:", "selector:", "ports:", "sessionAffinity:"]
        : kind === "Pod" ? ["containers:", "initContainers:", "volumes:", "restartPolicy:", "serviceAccountName:", "nodeSelector:"]
        : kind === "Ingress" ? ["ingressClassName:", "rules:", "tls:", "defaultBackend:"]
        : ["selector:", "template:", "containers:", "ports:", "resources:", "type:", "accessModes:", "storageClassName:"],
      selector: ["matchLabels:", "matchExpressions:"],
      template: ["metadata:", "spec:"],
      containers: ["- name: app", "image:", "ports:", "env:", "resources:", "volumeMounts:", "command:", "args:"],
      ports: ["- port:", "targetPort:", "protocol:", "name:", "nodePort:"],
      labels: ["app:", "tier:", "component:"],
      resources: ["requests:", "limits:"],
      requests: ["cpu:", "memory:"],
      limits: ["cpu:", "memory:"],
      rules: ["- host:", "http:", "paths:"],
      http: ["paths:"],
      paths: ["- path:", "pathType:", "backend:"],
      backend: ["service:", "resource:"],
      service: ["name:", "port:"],
      volumes: ["- name:", "persistentVolumeClaim:", "configMap:", "secret:"],
      persistentVolumeClaim: ["claimName:"],
      data: ["APP_ENV:", "LOG_LEVEL:"],
    };
    let choices = fieldGroups[parent] || fieldGroups.root;
    if (beforeCaret.trim()) {
      const partial = beforeCaret.trim();
      if (/^[A-Za-z][\w-]*$/.test(partial)) {
        const match = choices.filter((entry) => entry.toLowerCase().startsWith(partial.toLowerCase()));
        if (match.length) choices = match;
      }
    }
    if (parent === "containers" && (!beforeCaret.trim() || beforeCaret.trim() === "-")) {
      choices = ["- name: app", "- name: web"];
    }
    choices.forEach((entry) => add(entry, parent ? `Kubernetes ${parent} field` : "Kubernetes manifest field", entry));
    if (!force && !beforeCaret.trim() && !previousLine.endsWith(":")) items = [];
  }

  const isKindValue = /^kind:\s*/.test(beforeCaret);
  const isApiVersionValue = /^apiVersion:\s*/.test(beforeCaret);
  const isOtherValue = /^\s*(?:type|restartPolicy|protocol|pathType):\s*/.test(beforeCaret);
  const isValueCompletion = isKindValue || isApiVersionValue || isOtherValue;
  const query = isValueCompletion
    ? beforeCaret.slice(beforeCaret.indexOf(":") + 1).trim()
    : beforeCaret.trim().replace(/^[- ]+/, "");
  if (query) {
    items = items.filter((item) => item.label.toLowerCase().startsWith(query.toLowerCase()));
    if (!isValueCompletion) replaceStart = lineStart + indent.length;
    if (!force && items.some((item) => item.label.toLowerCase() === query.toLowerCase())) items = [];
  }
  if (!force && !items.length) return { items: [], replaceStart, replaceEnd };
  return { items: items.slice(0, 10), replaceStart, replaceEnd };
}

const KIND_LABELS = {
  Pod: "Pod", Deployment: "Deployment", StatefulSet: "StatefulSet", DaemonSet: "DaemonSet",
  Service: "Service", Ingress: "Ingress", ConfigMap: "ConfigMap", Secret: "Secret",
  Namespace: "Namespace", Node: "Node", PersistentVolume: "PersistentVolume",
  PersistentVolumeClaim: "PersistentVolumeClaim", StorageClass: "StorageClass",
  Job: "Job", CronJob: "CronJob", ReplicaSet: "ReplicaSet", ServiceAccount: "ServiceAccount",
  Role: "Role", ClusterRole: "ClusterRole", RoleBinding: "RoleBinding",
  ClusterRoleBinding: "ClusterRoleBinding", NetworkPolicy: "NetworkPolicy",
  HorizontalPodAutoscaler: "HorizontalPodAutoscaler", LimitRange: "LimitRange",
  ResourceQuota: "ResourceQuota", EndpointSlice: "EndpointSlice",
};

function KubernetesResourceIcon({ kind }) {
  const common = { fill: "none", stroke: "currentColor", strokeWidth: 1.7, strokeLinecap: "round", strokeLinejoin: "round" };
  let artwork;
  switch (kind) {
    case "Pod":
      artwork = <><path {...common} d="M12 3.5 19.5 7.8v8.4L12 20.5l-7.5-4.3V7.8L12 3.5Z" /><circle {...common} cx="12" cy="12" r="2.7" /><path {...common} d="M12 5.5v3.8M17.6 8.8l-3.3 1.9M17.6 15.2l-3.3-1.9M12 18.5v-3.8M6.4 15.2l3.3-1.9M6.4 8.8l3.3 1.9" /></>;
      break;
    case "Deployment":
    case "ReplicaSet":
      artwork = <><rect {...common} x="5" y="5" width="14" height="5" rx="1.5" /><rect {...common} x="5" y="14" width="6" height="5" rx="1.5" /><rect {...common} x="13" y="14" width="6" height="5" rx="1.5" /><path {...common} d="M12 10v2M8 12h8" /></>;
      break;
    case "Service":
      artwork = <><circle {...common} cx="12" cy="12" r="3" /><circle {...common} cx="5" cy="6" r="2" /><circle {...common} cx="19" cy="6" r="2" /><circle {...common} cx="5" cy="18" r="2" /><circle {...common} cx="19" cy="18" r="2" /><path {...common} d="m7 7.5 3 2.7m4 0 3-2.7m-10 9 3-2.7m4 0 3 2.7" /></>;
      break;
    case "StatefulSet":
    case "DaemonSet":
      artwork = <><path {...common} d="M4 7.5 12 3l8 4.5v9L12 21l-8-4.5v-9Z" /><path {...common} d="m4.5 7.8 7.5 4.3 7.5-4.3M12 12.1V21" /></>;
      break;
    case "Ingress":
      artwork = <><path {...common} d="M4 5h16v4H4zM12 9v4M7 13h10M7 13v6m10-6v6" /><path {...common} d="m5 17 2 2 2-2m6 0 2 2 2-2" /></>;
      break;
    case "ConfigMap":
    case "Secret":
      artwork = <><path {...common} d="M7 3.5h7l4 4V20H7z" /><path {...common} d="M14 3.5V8h4M10 12h5M10 15h5" />{kind === "Secret" ? <circle {...common} cx="12.5" cy="17.5" r="1.3" /> : null}</>;
      break;
    case "PersistentVolume":
    case "PersistentVolumeClaim":
    case "StorageClass":
      artwork = <><ellipse {...common} cx="12" cy="6" rx="7.5" ry="3" /><path {...common} d="M4.5 6v12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3V6M4.5 12c0 1.7 3.4 3 7.5 3s7.5-1.3 7.5-3" /></>;
      break;
    case "Node":
    case "Namespace":
      artwork = <><rect {...common} x="4" y="4" width="6" height="6" rx="1" /><rect {...common} x="14" y="4" width="6" height="6" rx="1" /><rect {...common} x="9" y="14" width="6" height="6" rx="1" /><path {...common} d="M7 10v2h10v-2m-5 2v2" /></>;
      break;
    case "Job":
    case "CronJob":
      artwork = <><circle {...common} cx="12" cy="12" r="8" /><path {...common} d="M12 7v5l3.5 2M17.5 3.5l2 2" /></>;
      break;
    case "ServiceAccount":
    case "Role":
    case "ClusterRole":
    case "RoleBinding":
    case "ClusterRoleBinding":
      artwork = <><circle {...common} cx="9" cy="8" r="3.2" /><path {...common} d="M3.5 19v-1.5a5.5 5.5 0 0 1 11 0V19zM16 9h5m-2.5-2.5v5" /></>;
      break;
    default:
      artwork = <><rect {...common} x="4" y="4" width="16" height="16" rx="3" /><path {...common} d="M8 9h8M8 12h8M8 15h5" /></>;
  }
  return <svg className={"k8s-resource-icon k8s-resource-icon-" + kind.toLowerCase().replace(/[^a-z0-9]+/g, "-")} viewBox="0 0 24 24" width="24" height="24" aria-hidden="true">{artwork}</svg>;
}

function validateKubernetesResources(resources) {
  const issues = [];
  const expectedApiVersions = { Pod: "v1", Service: "v1", Namespace: "v1", ConfigMap: "v1", Secret: "v1", PersistentVolume: "v1", PersistentVolumeClaim: "v1", ServiceAccount: "v1", Deployment: "apps/v1", StatefulSet: "apps/v1", DaemonSet: "apps/v1", ReplicaSet: "apps/v1", Job: "batch/v1", CronJob: "batch/v1", Ingress: "networking.k8s.io/v1", NetworkPolicy: "networking.k8s.io/v1", Role: "rbac.authorization.k8s.io/v1", RoleBinding: "rbac.authorization.k8s.io/v1", ClusterRole: "rbac.authorization.k8s.io/v1", ClusterRoleBinding: "rbac.authorization.k8s.io/v1", HorizontalPodAutoscaler: "autoscaling/v2", StorageClass: "storage.k8s.io/v1", ResourceQuota: "v1", LimitRange: "v1" };
  const add = (resource, severity, message) => issues.push({ id: resource.id + ":" + severity + ":" + message, resource: resource.name, kind: resource.kind, severity, message });
  const matches = (selector, labels) => Boolean(selector && labels && Object.keys(selector).length && Object.entries(selector).every(([key, value]) => labels[key] === value));
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
      if (container.securityContext?.privileged === true) add(resource, "warning", "Container '" + (container.name || "unnamed") + "' runs in privileged mode.");
      if (!container.resources?.requests?.cpu && !container.resources?.requests?.memory) add(resource, "warning", "Container '" + (container.name || "unnamed") + "' has no CPU or memory requests.");
      if (!container.resources?.limits?.cpu && !container.resources?.limits?.memory) add(resource, "warning", "Container '" + (container.name || "unnamed") + "' has no CPU or memory limits.");
      if (!container.readinessProbe) add(resource, "warning", "Container '" + (container.name || "unnamed") + "' has no readiness probe.");
    }

    if (podSpec) {
      const podSecurityContext = podSpec.securityContext || {};
      if (podSecurityContext.runAsUser === 0) add(resource, "warning", "Pod securityContext explicitly runs as root (runAsUser: 0). Use a non-root user where possible.");
      const volumeNames = new Set();
      for (const volume of podSpec.volumes || []) {
        if (volume.name && volumeNames.has(volume.name)) add(resource, "error", "Pod volume name '" + volume.name + "' is duplicated.");
        if (volume.name) volumeNames.add(volume.name);
      }
      for (const container of containers) {
        const mountedNames = new Set();
        for (const mount of container.volumeMounts || []) {
          if (!mount.name || !volumeNames.has(mount.name)) add(resource, "error", "Container '" + (container.name || "unnamed") + "' mounts volume '" + (mount.name || "(missing name)") + "', but that volume is not declared in the pod spec.");
          if (mount.name && mountedNames.has(mount.name) && !mount.mountPath) add(resource, "warning", "Container '" + (container.name || "unnamed") + "' has a repeated volume mount for '" + mount.name + "'.");
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
        if (container.securityContext?.allowPrivilegeEscalation === true) add(resource, "warning", "Container '" + (container.name || "unnamed") + "' allows privilege escalation.");
        if (container.securityContext?.runAsUser === 0) add(resource, "warning", "Container '" + (container.name || "unnamed") + "' explicitly runs as root (runAsUser: 0).");
        if (container.securityContext?.runAsNonRoot !== true) add(resource, "info", "Container '" + (container.name || "unnamed") + "' does not enforce runAsNonRoot.");
        if (container.securityContext?.readOnlyRootFilesystem !== true) add(resource, "info", "Container '" + (container.name || "unnamed") + "' does not use a read-only root filesystem.");
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
      for (const rule of rules) {
        for (const path of rule.http?.paths || []) {
          if (!path.path || typeof path.path !== "string" || !path.path.startsWith("/")) add(resource, "error", "Ingress HTTP paths must specify a path beginning with '/'.");
          if (path.pathType && !["Exact", "Prefix", "ImplementationSpecific"].includes(path.pathType)) add(resource, "error", "Ingress pathType must be Exact, Prefix, or ImplementationSpecific.");
          if (!path.pathType) add(resource, "warning", "Ingress path '" + (path.path || "(missing)") + "' does not declare pathType.");
          if (!path.backend?.service?.name) add(resource, "error", "Each Ingress HTTP path must reference a backend Service name.");
          if (path.backend?.service && path.backend.service.port?.number == null && !path.backend.service.port?.name) add(resource, "error", "Ingress backend Service '" + (path.backend.service.name || "(unnamed)") + "' must specify a port number or port name.");
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

    if (resource.kind === "PersistentVolumeClaim" && !spec.resources?.requests?.storage) add(resource, "error", "PersistentVolumeClaim must request storage in spec.resources.requests.storage.");
    if (resource.kind === "PersistentVolume" && !spec.capacity?.storage) add(resource, "error", "PersistentVolume must define spec.capacity.storage.");
    if (["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet"].includes(resource.kind) && spec.replicas != null && (!Number.isInteger(spec.replicas) || spec.replicas < 0)) add(resource, "error", "spec.replicas must be a non-negative integer.");
    if (resource.kind === "StatefulSet" && !spec.serviceName) add(resource, "error", "StatefulSet must define spec.serviceName for its governing Service.");
    if (resource.kind === "CronJob" && !spec.schedule) add(resource, "error", "CronJob must define spec.schedule.");
    if (resource.kind === "CronJob" && spec.concurrencyPolicy != null && !["Allow", "Forbid", "Replace"].includes(spec.concurrencyPolicy)) add(resource, "error", "CronJob concurrencyPolicy must be Allow, Forbid, or Replace.");
    if (resource.kind === "HorizontalPodAutoscaler") {
      if (!spec.scaleTargetRef?.name || !spec.scaleTargetRef?.kind) add(resource, "error", "HPA must define scaleTargetRef.kind and scaleTargetRef.name.");
      if (spec.minReplicas != null && (!Number.isInteger(spec.minReplicas) || spec.minReplicas < 1)) add(resource, "error", "HPA minReplicas must be a positive integer.");
      if (spec.maxReplicas != null && (!Number.isInteger(spec.maxReplicas) || spec.maxReplicas < 1)) add(resource, "error", "HPA maxReplicas must be a positive integer.");
      if (Number.isInteger(spec.minReplicas) && Number.isInteger(spec.maxReplicas) && spec.minReplicas > spec.maxReplicas) add(resource, "error", "HPA minReplicas cannot exceed maxReplicas.");
      if (spec.scaleTargetRef?.kind && !["Deployment", "StatefulSet", "ReplicaSet"].includes(spec.scaleTargetRef.kind)) add(resource, "warning", "HPA scaleTargetRef.kind is not a commonly supported scalable workload kind.");
    }
    if (resource.kind === "NetworkPolicy") {
      if (!spec.podSelector || typeof spec.podSelector !== "object") add(resource, "error", "NetworkPolicy must define spec.podSelector (use an empty object to select all pods in the namespace).");
      if (spec.policyTypes != null && (!Array.isArray(spec.policyTypes) || spec.policyTypes.some((type) => !["Ingress", "Egress"].includes(type)))) add(resource, "error", "NetworkPolicy policyTypes entries must be Ingress or Egress.");
      for (const [direction, rules] of [["ingress", spec.ingress], ["egress", spec.egress]]) {
        if (rules != null && !Array.isArray(rules)) add(resource, "error", "NetworkPolicy spec." + direction + " must be a list.");
        for (const [index, rule] of (Array.isArray(rules) ? rules : []).entries()) {
          if (!rule || typeof rule !== "object") add(resource, "error", "NetworkPolicy " + direction + " rule " + (index + 1) + " must be an object.");
          else if (rule.ports != null && !Array.isArray(rule.ports)) add(resource, "error", "NetworkPolicy " + direction + " rule " + (index + 1) + " ports must be a list.");
        }
      }
    }
  }

  const addDependencyIssue = (resource, severity, code, message) => {
    issues.push({ id: resource.id + ":" + severity + ":" + code, resource: resource.name, kind: resource.kind, severity, message });
  };
  const hasResource = (kind, name, namespace) => resources.some((candidate) =>
    candidate.kind === kind && candidate.name === name && (namespace == null || candidate.namespace === namespace)
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
        if (configMapName && !hasResource("ConfigMap", configMapName, resource.namespace)) {
          addDependencyIssue(resource, "warning", "env-key-configmap:" + configMapName, "Environment variable '" + env.name + "' references ConfigMap '" + configMapName + "', which is not present in this manifest set.");
        }
        if (secretName && !hasResource("Secret", secretName, resource.namespace)) {
          addDependencyIssue(resource, "warning", "env-key-secret:" + secretName, "Environment variable '" + env.name + "' references Secret '" + secretName + "', which is not present in this manifest set.");
        }
      }
    }
  }

  for (const resource of resources) {
    const spec = resource.manifest?.spec || {};
    if (resource.kind === "HorizontalPodAutoscaler" && spec.scaleTargetRef?.name) {
      const targetKind = spec.scaleTargetRef.kind || "Deployment";
      if (!hasResource(targetKind, spec.scaleTargetRef.name, resource.namespace)) {
        addDependencyIssue(resource, "warning", "hpa-target:" + spec.scaleTargetRef.name, "HPA target " + targetKind + "/" + spec.scaleTargetRef.name + " is not present in this manifest set.");
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

function normalizeManifest(value, index) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const kind = String(value.kind || "").trim();
  const metadata = value.metadata && typeof value.metadata === "object" ? value.metadata : {};
  if (!kind || !metadata.name) return null;
  return {
    id: `${kind.toLowerCase()}-${String(metadata.namespace || "default")}-${String(metadata.name)}-${index}`,
    documentIndex: index - 1,
    kind,
    name: String(metadata.name),
    namespace: String(metadata.namespace || (kind === "Namespace" ? metadata.name : "default")),
    apiVersion: String(value.apiVersion || "unknown"),
    manifest: value,
    supported: Boolean(KIND_LABELS[kind]),
  };
}

export default function KubernetesStudio({ onClose, onCreateDiagram, onApplyResourceYaml }) {
  const fileInputRef = useRef(null);
  const yamlEditorRef = useRef(null);
  const [completion, setCompletion] = useState({ items: [], replaceStart: 0, replaceEnd: 0, selectedIndex: 0 });
  const [manifestFontSize, setManifestFontSize] = useState(12);
  const [yamlScrollTop, setYamlScrollTop] = useState(0);
  const [previewSplit, setPreviewSplit] = useState(50);
  const workspaceRef = useRef(null);
  const splitDragRef = useRef(false);
  useEffect(() => {
    const onMove = (event) => {
      if (!splitDragRef.current || !workspaceRef.current) return;
      const rect = workspaceRef.current.getBoundingClientRect();
      const next = 100 - ((event.clientX - rect.left) / rect.width) * 100;
      setPreviewSplit(Math.max(28, Math.min(72, next)));
    };
    const onUp = () => { splitDragRef.current = false; document.body.classList.remove("k8s-studio-resizing"); };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => { window.removeEventListener("pointermove", onMove); window.removeEventListener("pointerup", onUp); document.body.classList.remove("k8s-studio-resizing"); };
  }, []);
  const [yamlText, setYamlText] = useState(`apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  namespace: default
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
---
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web
  ports:
    - port: 80
      targetPort: 8080`);
  const [savedYamlText, setSavedYamlText] = useState(yamlText);
  const [importedFileNames, setImportedFileNames] = useState([]);
  const [hasInspectedEdits, setHasInspectedEdits] = useState(false);
  const hasUnsavedChanges = yamlText !== savedYamlText;
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [inspectedResourceId, setInspectedResourceId] = useState("");
  const [inspectorOpen, setInspectorOpen] = useState(false);
  const [inspectorDraft, setInspectorDraft] = useState("");
  const [inspectorScrollTop, setInspectorScrollTop] = useState(0);
  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    const warnBeforeUnload = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasUnsavedChanges]);

  const requestClose = () => {
    if (hasUnsavedChanges && !window.confirm("You have unsaved YAML changes. Close K8s Studio and discard them?")) return;
    onClose?.();
  };

  const updateCompletions = (text, caret, force = false) => {
    const next = buildCompletions(text, caret, force);
    setCompletion({ ...next, selectedIndex: 0 });
  };
  const applyCompletion = (item) => {
    const editor = yamlEditorRef.current;
    if (!editor || !item) return;
    const start = completion.replaceStart;
    const end = completion.replaceEnd;
    const nextText = yamlText.slice(0, start) + item.insert + yamlText.slice(end);
    const nextCaret = start + item.insert.length;
    setYamlText(nextText);
    setError("");
    setNotice("");
    setCompletion({ items: [], replaceStart: 0, replaceEnd: 0, selectedIndex: 0 });
    requestAnimationFrame(() => {
      editor.focus();
      editor.setSelectionRange(nextCaret, nextCaret);
    });
  };
  const handleYamlKeyDown = (event) => {
    if ((event.ctrlKey || event.metaKey) && event.code === "Space") {
      event.preventDefault();
      updateCompletions(yamlText, event.currentTarget.selectionStart, true);
      return;
    }
    if (completion.items.length && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
      event.preventDefault();
      setCompletion((current) => ({ ...current, selectedIndex: (current.selectedIndex + (event.key === "ArrowDown" ? 1 : current.items.length - 1)) % current.items.length }));
      return;
    }
    if (completion.items.length && (event.key === "Enter" || event.key === "Tab")) {
      event.preventDefault();
      applyCompletion(completion.items[completion.selectedIndex]);
      return;
    }
    if (event.key === "Escape") {
      setCompletion({ items: [], replaceStart: 0, replaceEnd: 0, selectedIndex: 0 });
      return;
    }
    if (event.key === "Enter" && !completion.items.length) {
      const editor = event.currentTarget;
      const before = yamlText.slice(0, editor.selectionStart);
      const line = before.slice(before.lastIndexOf("\n") + 1);
      const indentation = (line.match(/^\s*/) || [""])[0];
      const extraIndent = line.trim().endsWith(":") ? "  " : "";
      event.preventDefault();
      const inserted = "\n" + indentation + extraIndent;
      const nextText = yamlText.slice(0, editor.selectionStart) + inserted + yamlText.slice(editor.selectionEnd);
      const nextCaret = editor.selectionStart + inserted.length;
      setYamlText(nextText);
      setCompletion({ items: [], replaceStart: 0, replaceEnd: 0, selectedIndex: 0 });
      requestAnimationFrame(() => { editor.focus(); editor.setSelectionRange(nextCaret, nextCaret); updateCompletions(nextText, nextCaret); });
    }
  };
  const parsed = useMemo(() => {
    if (!yamlText.trim()) return { resources: [], unsupported: [], parseError: "", issues: [] };
    try {
      const documents = parseAllDocuments(yamlText, { prettyErrors: true, uniqueKeys: true });
      const resources = [];
      const unsupported = [];
      for (const [index, document] of documents.entries()) {
        if (document.errors.length) throw document.errors[0];
        const value = document.toJSON();
        if (value == null) continue;
        const resource = normalizeManifest(value, index + 1);
        if (!resource) {
          unsupported.push(`Document ${index + 1}: missing kind or metadata.name`);
          continue;
        }
        if (resource.supported) resources.push(resource);
        else unsupported.push(`${resource.kind}/${resource.name}: valid Kubernetes kind, rendered as a generic resource`);
        if (!resource.supported) resources.push(resource);
      }
      return { resources, unsupported, parseError: "", issues: validateKubernetesResources(resources) };
    } catch (cause) {
      return { resources: [], unsupported: [], parseError: cause?.message || "Unable to parse YAML.", issues: [] };
    }
  }, [yamlText]);

  const inspectedResource = parsed.resources.find((resource) => resource.id === inspectedResourceId) || null;
  const inspectResource = (resource) => {
    setInspectedResourceId(resource.id);
    setInspectorDraft(stringify(resource.manifest));
    setInspectorOpen(true);
    setError("");
  };
  const copyInspectedResource = async () => {
    if (!inspectedResource) return;
    try {
      await navigator.clipboard.writeText(inspectorDraft);
      setNotice("Copied " + inspectedResource.kind + "/" + inspectedResource.name + " YAML.");
      setError("");
    } catch {
      setError("Clipboard access was blocked. Select the YAML and copy it manually.");
    }
  };
  const applyInspectedResource = () => {
    if (!inspectedResource) return;
    try {
      const editedDocuments = parseAllDocuments(inspectorDraft, { prettyErrors: true, uniqueKeys: true });
      if (editedDocuments.length !== 1) throw new Error("Edit exactly one Kubernetes resource in this inspector.");
      const editedDocument = editedDocuments[0];
      if (editedDocument.errors.length) throw editedDocument.errors[0];
      const editedManifest = editedDocument.toJSON();
      const normalized = normalizeManifest(editedManifest, inspectedResource.documentIndex + 1);
      if (!normalized) throw new Error("The edited YAML must include kind and metadata.name.");
      if (normalized.kind !== inspectedResource.kind || normalized.documentIndex !== inspectedResource.documentIndex) {
        throw new Error("Changing the resource kind is not supported in the inspector. Edit its fields and try again.");
      }
      if (normalized.name !== inspectedResource.name || normalized.namespace !== inspectedResource.namespace) {
        const collision = parsed.resources.find((candidate) =>
          candidate.id !== inspectedResource.id &&
          candidate.kind === normalized.kind &&
          candidate.name === normalized.name &&
          candidate.namespace === normalized.namespace
        );
        if (collision) throw new Error("A " + normalized.kind + " named '" + normalized.name + "' already exists in namespace '" + normalized.namespace + "'. Choose a unique name before applying.");
      }
      const documents = parseAllDocuments(yamlText, { prettyErrors: true, uniqueKeys: true });
      const targetDocument = documents[inspectedResource.documentIndex];
      if (!targetDocument) throw new Error("The original YAML document could not be located. Reopen the inspector and try again.");
      targetDocument.contents = editedDocument.contents;
      const nextYaml = documents.map((document) => document.toString().trimEnd()).filter(Boolean).join("\n---\n") + "\n";
      const previousYaml = yamlText;
      setYamlText(nextYaml);
      setSavedYamlText(nextYaml);
      setHasInspectedEdits(true);
      setInspectorOpen(false);
      setNotice("Applied changes to " + normalized.kind + "/" + normalized.name + ". Revalidate the manifest set before creating the diagram.");
      setError("");
      setCompletion({ items: [], replaceStart: 0, replaceEnd: 0, selectedIndex: 0 });
      try {
        onApplyResourceYaml?.({ ...normalized, id: inspectedResource.id });
      } catch (callbackError) {
        setYamlText(previousYaml);
        setSavedYamlText(previousYaml);
        throw callbackError;
      }
    } catch (cause) {
      setError(cause?.message || "The resource YAML could not be applied.");
    }
  };
  const exportYaml = () => {
    if (!yamlText.trim() || parsed.parseError) { setError(parsed.parseError || "Add valid YAML before exporting."); return; }
    const blob = new Blob([yamlText], { type: "application/yaml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "kubernetes-manifests.yaml";
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    setSavedYamlText(yamlText);
    setNotice("Exported the complete manifest set.");
  };

  const importFile = async (event) => {
    const files = Array.from(event.target.files || []);
    event.target.value = "";
    if (!files.length) return;
    const invalidFiles = files.filter((file) => !/\.ya?ml$/i.test(file.name));
    if (invalidFiles.length) {
      setError("Choose only .yaml or .yml files. Invalid: " + invalidFiles.map((file) => file.name).join(", "));
      return;
    }
    try {
      const importedFiles = await Promise.all(files.map(async (file) => ({
        name: file.name,
        text: await file.text(),
      })));
      const combinedText = importedFiles.map((file) => file.text.trim()).filter(Boolean).join("\n---\n") + "\n";
      if (!combinedText.trim()) throw new Error("The selected YAML files are empty.");
      const documents = parseAllDocuments(combinedText, { prettyErrors: true, uniqueKeys: true });
      const parseFailure = documents.find((document) => document.errors.length);
      if (parseFailure) throw parseFailure.errors[0];
      const normalized = documents.map((document, index) => document.toJSON() == null ? null : normalizeManifest(document.toJSON(), index + 1));
      const invalidDocuments = normalized.flatMap((resource, index) => resource ? [] : [index + 1]);
      if (invalidDocuments.length) throw new Error("Document(s) " + invalidDocuments.join(", ") + " must include kind and metadata.name.");
      const distinctNames = new Set();
      const collisions = [];
      for (const resource of normalized.filter(Boolean)) {
        const key = resource.namespace + "/" + resource.kind + "/" + resource.name;
        if (distinctNames.has(key)) collisions.push(key);
        distinctNames.add(key);
      }
      if (collisions.length) throw new Error("The imported files contain duplicate resources: " + [...new Set(collisions)].join(", "));
      setYamlText(combinedText);
      setSavedYamlText(combinedText);
      setImportedFileNames(importedFiles.map((file) => file.name));
      setHasInspectedEdits(false);
      setNotice("Loaded " + importedFiles.length + " YAML file(s) and " + normalized.filter(Boolean).length + " resource(s). Review cross-resource checks before creating the diagram.");
      setError("");
    } catch (cause) {
      setError(cause?.message || "The selected YAML file(s) could not be read.");
    }
  };

  const createDiagram = async () => {
    if (!parsed.resources.length) {
      setError(parsed.parseError || "Add at least one Kubernetes resource with kind and metadata.name.");
      return;
    }
    if (parsed.parseError) {
      setError(parsed.parseError);
      return;
    }
    const blockingIssues = parsed.issues.filter((issue) => issue.severity === "error");
    if (blockingIssues.length) {
      setError("Resolve " + blockingIssues.length + " manifest error(s) before creating the diagram. Warnings can be reviewed and accepted.");
      return;
    }
    try {
      await onCreateDiagram?.(parsed.resources);
      setError("");
      setSavedYamlText(yamlText);
      setNotice(`Added ${parsed.resources.length} Kubernetes resource(s) to the canvas.`);
      onClose?.();
    } catch (cause) {
      setError(cause?.message || "Could not create the Kubernetes diagram.");
    }
  };

  return (
    <div className="k8s-studio-overlay" role="presentation">
      <section className="k8s-studio" role="dialog" aria-modal="true" aria-labelledby="k8s-studio-title">
        <header className="k8s-studio-header">
          <div className="k8s-studio-brand">K8s</div>
          <div className="k8s-studio-heading">
            <span className="k8s-studio-eyebrow">KUBERNETES WORKSPACE</span>
            <h1 id="k8s-studio-title">K8s Studio</h1>
            <p>Build a Kubernetes architecture from resources or existing YAML manifests.</p>
          </div>
          <button type="button" className="k8s-studio-close" onClick={requestClose} aria-label="Close K8s Studio">×</button>
        </header>

        <div className="k8s-studio-actions">
          <button type="button" className="k8s-studio-primary" onClick={() => fileInputRef.current?.click()}>Import YAML</button>
          <input ref={fileInputRef} type="file" accept=".yaml,.yml,application/yaml,text/yaml" hidden onChange={importFile} />
          <span>Supports multiple YAML documents separated by <code>---</code></span>
          <button type="button" className="k8s-studio-secondary" onClick={() => { setYamlText(""); setNotice(""); setError(""); }}>Clear</button>
        </div>

        <div className="k8s-studio-workspace" ref={workspaceRef} style={{ "--k8s-editor-width": previewSplit + "%" }}>
          <section className="k8s-studio-editor">
            <div className="k8s-studio-section-title k8s-studio-manifest-title"><button type="button" className="k8s-studio-secondary" onClick={exportYaml} disabled={!yamlText.trim() || Boolean(parsed.parseError)}>Export YAML</button>
              <div><span>01</span><h2>Manifest YAML</h2></div>
              <div className="k8s-yaml-editor-controls" aria-label="Manifest font size controls">
                <button type="button" onClick={() => setManifestFontSize((size) => Math.max(10, size - 1))} disabled={manifestFontSize <= 10} aria-label="Decrease manifest font size" title="Decrease font size">A−</button>
                <output aria-live="polite" title="Manifest font size">{manifestFontSize}px</output>
                <button type="button" onClick={() => setManifestFontSize((size) => Math.min(20, size + 1))} disabled={manifestFontSize >= 20} aria-label="Increase manifest font size" title="Increase font size">A+</button>
                <small>{yamlText.length.toLocaleString()} characters</small>
              </div>
            </div>
            <div className={yamlText ? "k8s-yaml-editor-shell has-content" : "k8s-yaml-editor-shell"}>
              <div className="k8s-yaml-line-numbers" aria-hidden="true"><div style={{ transform: "translateY(-" + yamlScrollTop + "px)" }}>{Array.from({ length: Math.max(1, yamlText.split(String.fromCharCode(10)).length) }, (_, index) => <span key={index}>{index + 1}</span>)}</div></div>
              <pre className="k8s-yaml-highlight" aria-hidden="true" style={{ fontSize: `${manifestFontSize}px`, lineHeight: 1.65 }}>{highlightYaml(yamlText)}</pre>
              <textarea
                ref={yamlEditorRef}
                aria-label="Kubernetes YAML manifest"
                spellCheck="false"
                autoCapitalize="off"
                autoCorrect="off"
                value={yamlText}
                style={{ fontSize: `${manifestFontSize}px`, lineHeight: 1.65 }}
                onChange={(event) => {
                  const value = event.target.value;
                  const caret = event.target.selectionStart;
                  setYamlText(value);
                  setError("");
                  setNotice("");
                  updateCompletions(value, caret);
                }}
                onClick={(event) => updateCompletions(yamlText, event.currentTarget.selectionStart)}
                onKeyUp={(event) => {
                  if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) updateCompletions(yamlText, event.currentTarget.selectionStart);
                }}
                onKeyDown={handleYamlKeyDown}
                onBlur={() => window.setTimeout(() => setCompletion((current) => ({ ...current, items: [] })), 120)}
                onScroll={(event) => {
                  setYamlScrollTop(event.currentTarget.scrollTop);
                  const highlight = event.currentTarget.parentElement?.querySelector(".k8s-yaml-highlight");
                  if (highlight) {
                    highlight.scrollTop = event.currentTarget.scrollTop;
                    highlight.scrollLeft = event.currentTarget.scrollLeft;
                  }
                }}
                placeholder="Paste Kubernetes YAML here…"
              />
              {completion.items.length > 0 && (
                <div className="k8s-yaml-completions" role="listbox" aria-label="YAML completions">
                  <div className="k8s-yaml-completion-heading">Kubernetes suggestions <kbd>↑</kbd><kbd>↓</kbd><kbd>Enter</kbd></div>
                  {completion.items.map((item, index) => (
                    <button type="button" role="option" aria-selected={index === completion.selectedIndex} className={index === completion.selectedIndex ? "k8s-yaml-completion active" : "k8s-yaml-completion"} key={item.label} onMouseDown={(event) => event.preventDefault()} onClick={() => applyCompletion(item)}>
                      <code>{item.label}</code><span>{item.detail}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="k8s-yaml-editor-status"><span>YAML</span><span>Ctrl+Space for completions</span><span>Indent: 2 spaces</span></div>
            <p className="k8s-studio-help">Paste one manifest or a multi-document Kubernetes YAML file. Your current canvas is preserved when the diagram is added.</p>
          </section>
          <div className="k8s-studio-splitter" role="separator" aria-label="Resize manifest and resource preview" aria-orientation="vertical" aria-valuemin={28} aria-valuemax={72} aria-valuenow={Math.round(previewSplit)} tabIndex={0} onPointerDown={(event) => { splitDragRef.current = true; document.body.classList.add("k8s-studio-resizing"); }} onKeyDown={(event) => { if (event.key === "ArrowLeft") { event.preventDefault(); setPreviewSplit((value) => Math.max(28, value - 3)); } if (event.key === "ArrowRight") { event.preventDefault(); setPreviewSplit((value) => Math.min(72, value + 3)); } }} />
          <aside className="k8s-studio-preview">
            <div className="k8s-studio-section-title"><div><span>02</span><h2>Resource preview</h2></div><strong>{parsed.resources.length}</strong></div>
            {parsed.parseError ? <div className="k8s-studio-error" role="alert"><strong>YAML parsing failed</strong><p>{parsed.parseError}</p></div> : null}
            {!parsed.parseError && !parsed.resources.length ? <div className="k8s-studio-empty">Resources will appear here after valid YAML is provided.</div> : null}
            {parsed.issues?.length > 0 && <section className="k8s-studio-validation" aria-label="Manifest validation">
              <div className="k8s-studio-validation-heading"><strong>Manifest checks</strong><span>{parsed.issues.filter((issue) => issue.severity === "error").length} errors · {parsed.issues.filter((issue) => issue.severity === "warning").length} warnings</span></div>
              <ul>{parsed.issues.map((issue) => <li key={issue.id} className={"k8s-studio-validation-" + issue.severity}><span>{issue.severity === "error" ? "Error" : issue.severity === "warning" ? "Warning" : "Info"}</span><div><strong>{issue.kind}/{issue.resource}</strong><p>{issue.message}</p></div></li>)}</ul>
            </section>}
            <div className="k8s-studio-resource-list">
              {parsed.resources.map((resource) => <article className="k8s-studio-resource" key={resource.id}>
                <span className={"k8s-studio-resource-glyph k8s-studio-resource-glyph-" + resource.kind.toLowerCase().replace(/[^a-z0-9]+/g, "-")}><KubernetesResourceIcon kind={resource.kind} /></span>
                <div><strong>{resource.name}</strong><small>{resource.kind} · {resource.namespace}</small></div><button type="button" className="k8s-studio-resource-inspect" onClick={() => inspectResource(resource)}>Inspect</button>
                {!resource.supported && <em>Generic</em>}
              </article>)}
            </div>
            {parsed.unsupported.length > 0 && <details className="k8s-studio-notes"><summary>Import notes ({parsed.unsupported.length})</summary><ul>{parsed.unsupported.map((item, index) => <li key={index}>{item}</li>)}</ul></details>}
          </aside>
        </div>

        {(error || parsed.parseError || notice) && <div className={error || parsed.parseError ? "k8s-studio-message error" : "k8s-studio-message"} role={error || parsed.parseError ? "alert" : "status"}>{error || parsed.parseError || notice}</div>}
        <footer className="k8s-studio-footer">
          <span>{parsed.resources.length} resource(s) ready · Existing canvas will not be replaced</span>
          <div><button type="button" className="k8s-studio-secondary" onClick={requestClose}>Cancel</button><button type="button" className="k8s-studio-primary" disabled={!parsed.resources.length || Boolean(parsed.parseError) || parsed.issues.some((issue) => issue.severity === "error")} onClick={createDiagram}>Create diagram</button></div>
        </footer>
      {inspectorOpen && inspectedResource && <div className="k8s-studio-inspector-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setInspectorOpen(false); }}><section className="k8s-studio-inspector" role="dialog" aria-modal="true" aria-labelledby="k8s-inspector-title"><header className="k8s-studio-inspector-header"><div className="k8s-studio-inspector-identity"><span className="k8s-studio-inspector-kind">K8s Resource</span><strong id="k8s-inspector-title">{inspectedResource.kind}<span>/</span>{inspectedResource.name}</strong><small>{inspectedResource.namespace} <span>·</span> {inspectedResource.apiVersion}</small></div><button type="button" className="k8s-studio-inspector-close" aria-label="Close resource editor" onClick={() => setInspectorOpen(false)}>×</button></header><div className="k8s-studio-inspector-body"><div className="k8s-studio-inspector-editor-label"><span>Manifest YAML</span><span>{inspectorDraft.split("\n").length} lines</span></div><div className="k8s-studio-inspector-code"><div className="k8s-studio-inspector-line-numbers" aria-hidden="true"><div style={{ transform: "translateY(-" + inspectorScrollTop + "px)" }}>{Array.from({ length: Math.max(1, inspectorDraft.split("\n").length) }, (_, index) => <span key={index}>{index + 1}</span>)}</div></div><textarea className="k8s-studio-inspector-editor" aria-label={"Edit YAML for " + inspectedResource.kind + "/" + inspectedResource.name} spellCheck="false" value={inspectorDraft} onScroll={(event) => setInspectorScrollTop(event.currentTarget.scrollTop)} onChange={(event) => { setInspectorDraft(event.target.value); setError(""); }} /></div></div><footer className="k8s-studio-inspector-footer"><span className="k8s-studio-inspector-note">Edits apply to this manifest, not the live cluster.</span><div className="k8s-studio-inspector-actions"><button type="button" className="k8s-studio-secondary" onClick={copyInspectedResource}>Copy YAML</button><button type="button" className="k8s-studio-secondary" onClick={() => setInspectorOpen(false)}>Cancel</button><button type="button" className="k8s-studio-primary" onClick={applyInspectedResource}>Apply changes</button></div></footer></section></div>}
      </section>
    </div>
  );
}
