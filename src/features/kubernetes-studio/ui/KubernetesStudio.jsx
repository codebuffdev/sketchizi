import { useMemo, useRef, useState } from "react";
import { parseAllDocuments } from "yaml";
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

function buildCompletions(text, caret, force = false) {
  const lineStart = text.lastIndexOf("\n", Math.max(0, caret - 1)) + 1;
  const lineEndIndex = text.indexOf("\n", caret);
  const lineEnd = lineEndIndex < 0 ? text.length : lineEndIndex;
  const line = text.slice(lineStart, lineEnd);
  const beforeCaret = text.slice(lineStart, caret);
  const indent = (line.match(/^\s*/) || [""])[0];
  const previousLines = text.slice(0, lineStart).split("\n").reverse();
  const previousLine = previousLines.find((value) => value.trim())?.trim() || "";
  const kind = text.match(/^kind:\s*([A-Za-z]+)/m)?.[1] || "";
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
  const query = isKindValue || isApiVersionValue
    ? beforeCaret.slice(beforeCaret.indexOf(":") + 1).trim()
    : beforeCaret.trim().replace(/^[- ]+/, "");
  if (query) {
    items = items.filter((item) => item.label.toLowerCase().startsWith(query.toLowerCase()));
    if (!isKindValue && !isApiVersionValue) replaceStart = lineStart + indent.length;
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

function normalizeManifest(value, index) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const kind = String(value.kind || "").trim();
  const metadata = value.metadata && typeof value.metadata === "object" ? value.metadata : {};
  if (!kind || !metadata.name) return null;
  return {
    id: `${kind.toLowerCase()}-${String(metadata.namespace || "default")}-${String(metadata.name)}-${index}`,
    kind,
    name: String(metadata.name),
    namespace: String(metadata.namespace || (kind === "Namespace" ? metadata.name : "default")),
    apiVersion: String(value.apiVersion || "unknown"),
    manifest: value,
    supported: Boolean(KIND_LABELS[kind]),
  };
}

export default function KubernetesStudio({ onClose, onCreateDiagram }) {
  const fileInputRef = useRef(null);
  const yamlEditorRef = useRef(null);
  const [completion, setCompletion] = useState({ items: [], replaceStart: 0, replaceEnd: 0, selectedIndex: 0 });
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
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
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
    if (!yamlText.trim()) return { resources: [], unsupported: [], parseError: "" };
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
      return { resources, unsupported, parseError: "" };
    } catch (cause) {
      return { resources: [], unsupported: [], parseError: cause?.message || "Unable to parse YAML." };
    }
  }, [yamlText]);

  const importFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/\.ya?ml$/i.test(file.name)) {
      setError("Choose a .yaml or .yml file.");
      return;
    }
    try {
      setYamlText(await file.text());
      setNotice(`Loaded ${file.name}. Review the resources before creating the diagram.`);
      setError("");
    } catch {
      setError("The selected file could not be read.");
    }
  };

  const createDiagram = async () => {
    if (!parsed.resources.length) {
      setError(parsed.parseError || "Add at least one Kubernetes resource with kind and metadata.name.");
      return;
    }
    try {
      onCreateDiagram?.(parsed.resources);
      setError("");
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
          <button type="button" className="k8s-studio-close" onClick={onClose} aria-label="Close K8s Studio">×</button>
        </header>

        <div className="k8s-studio-actions">
          <button type="button" className="k8s-studio-primary" onClick={() => fileInputRef.current?.click()}>Import YAML</button>
          <input ref={fileInputRef} type="file" accept=".yaml,.yml,application/yaml,text/yaml" hidden onChange={importFile} />
          <span>Supports multiple YAML documents separated by <code>---</code></span>
          <button type="button" className="k8s-studio-secondary" onClick={() => { setYamlText(""); setNotice(""); setError(""); }}>Clear</button>
        </div>

        <div className="k8s-studio-workspace">
          <section className="k8s-studio-editor">
            <div className="k8s-studio-section-title"><div><span>01</span><h2>Manifest YAML</h2></div><small>{yamlText.length.toLocaleString()} characters</small></div>
            <div className="k8s-yaml-editor-shell">
              <textarea
                ref={yamlEditorRef}
                aria-label="Kubernetes YAML manifest"
                spellCheck="false"
                autoCapitalize="off"
                autoCorrect="off"
                value={yamlText}
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
          <aside className="k8s-studio-preview">
            <div className="k8s-studio-section-title"><div><span>02</span><h2>Resource preview</h2></div><strong>{parsed.resources.length}</strong></div>
            {parsed.parseError ? <div className="k8s-studio-error" role="alert"><strong>YAML parsing failed</strong><p>{parsed.parseError}</p></div> : null}
            {!parsed.parseError && !parsed.resources.length ? <div className="k8s-studio-empty">Resources will appear here after valid YAML is provided.</div> : null}
            <div className="k8s-studio-resource-list">
              {parsed.resources.map((resource) => <article className="k8s-studio-resource" key={resource.id}>
                <span className="k8s-studio-resource-glyph">{resource.kind.slice(0, 2).toUpperCase()}</span>
                <div><strong>{resource.name}</strong><small>{resource.kind} · {resource.namespace}</small></div>
                {!resource.supported && <em>Generic</em>}
              </article>)}
            </div>
            {parsed.unsupported.length > 0 && <details className="k8s-studio-notes"><summary>Import notes ({parsed.unsupported.length})</summary><ul>{parsed.unsupported.map((item, index) => <li key={index}>{item}</li>)}</ul></details>}
          </aside>
        </div>

        {(error || parsed.parseError || notice) && <div className={error || parsed.parseError ? "k8s-studio-message error" : "k8s-studio-message"} role={error || parsed.parseError ? "alert" : "status"}>{error || parsed.parseError || notice}</div>}
        <footer className="k8s-studio-footer">
          <span>{parsed.resources.length} resource(s) ready · Existing canvas will not be replaced</span>
          <div><button type="button" className="k8s-studio-secondary" onClick={onClose}>Cancel</button><button type="button" className="k8s-studio-primary" disabled={!parsed.resources.length || Boolean(parsed.parseError)} onClick={createDiagram}>Create diagram</button></div>
        </footer>
      </section>
    </div>
  );
}
