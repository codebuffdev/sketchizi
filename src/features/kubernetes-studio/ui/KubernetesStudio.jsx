import { useMemo, useRef, useState } from "react";
import { parseAllDocuments } from "yaml";
import "./kubernetes-studio.css";

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

  const createDiagram = () => {
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
            <textarea aria-label="Kubernetes YAML manifest" spellCheck="false" value={yamlText} onChange={(event) => { setYamlText(event.target.value); setError(""); setNotice(""); }} placeholder="Paste Kubernetes YAML here…" />
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
