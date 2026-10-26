import { useMemo, useRef, useState } from "react";
import { parseDocument, stringify } from "yaml";
import { analyzeComposeReadiness, exportComposeReadinessReport, validateComposeDocument } from "../composeDocumentService.js";
import "./docker-compose-studio.css";


const COMPOSE_COMPLETION_GROUPS = {
  root: ["name:", "services:", "networks:", "volumes:", "configs:", "secrets:", "include:", "profiles:"],
  service: ["image:", "build:", "container_name:", "command:", "entrypoint:", "ports:", "expose:", "environment:", "env_file:", "depends_on:", "healthcheck:", "volumes:", "networks:", "restart:", "working_dir:", "user:", "read_only:", "privileged:", "cap_add:", "cap_drop:", "security_opt:", "labels:", "logging:", "deploy:", "profiles:", "hostname:", "extra_hosts:", "dns:", "ulimits:", "sysctls:", "stop_grace_period:", "init:"],
  build: ["context:", "dockerfile:", "dockerfile_inline:", "args:", "target:", "cache_from:", "cache_to:", "network:", "ssh:", "secrets:", "additional_contexts:", "pull:", "no_cache:"],
  depends_on: ["condition:", "restart:", "required:"],
  healthcheck: ["test:", "interval:", "timeout:", "retries:", "start_period:", "start_interval:", "disable:"],
  networks: ["aliases:", "ipv4_address:", "ipv6_address:", "priority:", "gw_priority:", "interface_name:", "mac_address:"],
  volumes: ["type:", "source:", "target:", "read_only:", "bind:", "volume:", "tmpfs:", "consistency:"],
  ports: ["target:", "published:", "host_ip:", "protocol:", "mode:", "name:", "app_protocol:"],
  deploy: ["mode:", "replicas:", "endpoint_mode:", "labels:", "resources:", "restart_policy:", "placement:", "update_config:", "rollback_config:", "depends_on:", "replicas:"],
  resources: ["limits:", "reservations:"],
  limits: ["cpus:", "memory:", "pids:"],
  reservations: ["cpus:", "memory:", "devices:"],
  restart_policy: ["condition:", "delay:", "max_attempts:", "window:"],
  logging: ["driver:", "options:"],
  options: ["max-size:", "max-file:", "labels:", "env:"],
  configs: ["source:", "target:", "uid:", "gid:", "mode:"],
  secrets: ["source:", "target:", "uid:", "gid:", "mode:"],
  networks_root: ["driver:", "driver_opts:", "attachable:", "internal:", "ipam:", "enable_ipv6:", "external:", "name:", "labels:"],
  volumes_root: ["driver:", "driver_opts:", "external:", "name:", "labels:"],
  ipam: ["driver:", "config:", "options:"],
  environment: ["NODE_ENV:", "PORT:", "LOG_LEVEL:", "DATABASE_URL:", "REDIS_URL:"],
};
const COMPOSE_VALUE_COMPLETIONS = {
  restart: [["no", "Do not restart"], ["always", "Always restart"], ["on-failure", "Restart on failure"], ["unless-stopped", "Restart unless manually stopped"]],
  condition: [["service_started", "Dependency has started"], ["service_healthy", "Dependency is healthy"], ["service_completed_successfully", "Dependency completed successfully"]],
  driver: [["bridge", "Bridge network"], ["overlay", "Swarm overlay"], ["host", "Host network"], ["none", "No network driver"]],
  mode: [["replicated", "Replicated service"], ["global", "One task per node"], ["host", "Publish ports on each node"], ["ingress", "Swarm ingress routing"]],
  protocol: [["tcp", "TCP"], ["udp", "UDP"], ["sctp", "SCTP"]],
  read_only: [["true", "Read-only filesystem"], ["false", "Writable filesystem"]],
  privileged: [["true", "Privileged container"], ["false", "Unprivileged container"]],
  internal: [["true", "Internal network"], ["false", "External connectivity allowed"]],
  external: [["true", "Use an externally managed resource"], ["false", "Manage resource in this project"]],
  required: [["true", "Required dependency"], ["false", "Optional dependency"]],
  disable: [["true", "Disable healthcheck"], ["false", "Enable healthcheck"]],
  init: [["true", "Run an init process"], ["false", "No init process"]],
  pull: [["true", "Always pull image"], ["false", "Use local image if available"]],
  no_cache: [["true", "Disable build cache"], ["false", "Use build cache"]],
  endpoint_mode: [["vip", "Virtual IP"], ["dnsrr", "DNS round-robin"]],
};
function buildComposeCompletions(text, caret, force = false) {
  const lineStart = text.lastIndexOf("\n", Math.max(0, caret - 1)) + 1;
  const lineEndIndex = text.indexOf("\n", caret);
  const lineEnd = lineEndIndex < 0 ? text.length : lineEndIndex;
  const line = text.slice(lineStart, lineEnd);
  const before = text.slice(lineStart, caret);
  const indent = (line.match(/^\s*/) || [""])[0];
  const previous = text.slice(0, lineStart).split("\n").reverse().find((value) => value.trim())?.trim() || "";
  const parent = previous.replace(/:\s*.*$/, "").replace(/^[- ]+/, "").trim();
  const trimmed = before.trim();
  let items = [];
  let replaceStart = lineStart + indent.length;
  let replaceEnd = caret;
  const add = (label, detail, insert = label) => items.push({ label, detail, insert });
  const valueKey = before.match(/^\s*([A-Za-z_][\w-]*):\s*(.*)$/);
  if (valueKey && COMPOSE_VALUE_COMPLETIONS[valueKey[1]]) {
    const key = valueKey[1];
    const valueStart = lineStart + before.indexOf(":") + 1 + (before.slice(before.indexOf(":") + 1).match(/^\s*/) || [""])[0].length;
    replaceStart = valueStart;
    COMPOSE_VALUE_COMPLETIONS[key].forEach(([value, detail]) => add(value, detail, value));
  } else {
    let choices;
    if (!indent && !trimmed) choices = COMPOSE_COMPLETION_GROUPS.root;
    else if (parent === "services") choices = ["# service-name:", "web:", "api:", "worker:", "database:", "redis:", "frontend:", "backend:"];
    else if (parent === "networks" && indent.length <= 2) choices = COMPOSE_COMPLETION_GROUPS.networks_root;
    else if (parent === "volumes" && indent.length <= 2) choices = COMPOSE_COMPLETION_GROUPS.volumes_root;
    else if (parent === "build") choices = COMPOSE_COMPLETION_GROUPS.build;
    else if (parent === "depends_on") choices = COMPOSE_COMPLETION_GROUPS.depends_on;
    else if (parent === "healthcheck") choices = COMPOSE_COMPLETION_GROUPS.healthcheck;
    else if (parent === "deploy") choices = COMPOSE_COMPLETION_GROUPS.deploy;
    else if (parent === "resources") choices = COMPOSE_COMPLETION_GROUPS.resources;
    else if (parent === "limits" || parent === "reservations") choices = COMPOSE_COMPLETION_GROUPS[parent];
    else if (parent === "restart_policy") choices = COMPOSE_COMPLETION_GROUPS.restart_policy;
    else if (parent === "logging") choices = COMPOSE_COMPLETION_GROUPS.logging;
    else if (parent === "options") choices = COMPOSE_COMPLETION_GROUPS.options;
    else if (parent === "ipam") choices = COMPOSE_COMPLETION_GROUPS.ipam;
    else if (parent === "environment") choices = COMPOSE_COMPLETION_GROUPS.environment;
    else if (parent === "networks" && indent.length > 2) choices = COMPOSE_COMPLETION_GROUPS.networks;
    else if (parent === "volumes" && indent.length > 2) choices = COMPOSE_COMPLETION_GROUPS.volumes;
    else if (parent === "ports") choices = COMPOSE_COMPLETION_GROUPS.ports;
    else if (parent === "configs") choices = COMPOSE_COMPLETION_GROUPS.configs;
    else if (parent === "secrets") choices = COMPOSE_COMPLETION_GROUPS.secrets;
    else {
      choices = COMPOSE_COMPLETION_GROUPS.service;
      if (!indent && trimmed) choices = COMPOSE_COMPLETION_GROUPS.root;
    }
    choices.forEach((entry) => add(entry, parent ? "Compose " + parent + " option" : "Docker Compose option", entry));
    if (!force && !trimmed && !previous.endsWith(":")) items = [];
  }
  const query = valueKey && COMPOSE_VALUE_COMPLETIONS[valueKey[1]] ? valueKey[2].trim() : trimmed.replace(/^[- ]+/, "");
  if (query) {
    items = items.filter((item) => item.label.toLowerCase().startsWith(query.toLowerCase()));
    if (!(valueKey && COMPOSE_VALUE_COMPLETIONS[valueKey[1]])) replaceStart = lineStart + indent.length;
    if (!force && items.some((item) => item.label.toLowerCase() === query.toLowerCase())) items = [];
  }
  if (!force && !items.length) return { items: [], replaceStart, replaceEnd };
  return { items: items.slice(0, 12), replaceStart, replaceEnd };
}
\nconst STARTER = "name: ecommerce\nservices:\n  web:\n    image: nginx:1.27\n    ports:\n      - \"8080:80\"\n    depends_on:\n      api:\n        condition: service_healthy\n    networks: [frontend]\n  api:\n    build:\n      context: ./api\n    environment:\n      NODE_ENV: production\n      DATABASE_URL: ${DATABASE_URL}\n    depends_on:\n      database:\n        condition: service_healthy\n    networks: [frontend, backend]\n  database:\n    image: postgres:17\n    environment:\n      POSTGRES_DB: ecommerce\n      POSTGRES_USER: app\n      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}\n    volumes:\n      - database-data:/var/lib/postgresql/data\n    healthcheck:\n      test: [CMD-SHELL, \"pg_isready -U app -d ecommerce\"]\n      interval: 10s\n      timeout: 5s\n      retries: 5\n    networks: [backend]\nvolumes:\n  database-data: {}\nnetworks:\n  frontend: {}\n  backend:\n    internal: true\n";
const isRecord = (value) => value !== null && typeof value === "object" && !Array.isArray(value);
const namesOf = (value) => Array.isArray(value) ? value.map((item) => typeof item === "string" ? item : item?.source).filter(Boolean) : isRecord(value) ? Object.keys(value) : [];
const imageOf = (service) => typeof service?.image === "string" ? service.image : typeof service?.build === "string" ? "build: " + service.build : isRecord(service?.build) ? "build: " + (service.build.context || ".") : "Image/build not configured";
const dependenciesOf = (service) => namesOf(service?.depends_on);

function highlightLine(line) {
  const trimmed = line.trimStart();
  if (!trimmed || trimmed.startsWith("#")) return <span className={trimmed.startsWith("#") ? "docker-yaml-comment" : ""}>{line}</span>;
  const match = line.match(/^(\s*(?:-\s+)?)([^:#][^:]*)(:\s*)(.*)$/);
  if (!match) return line;
  const [, indent, key, separator, value] = match;
  const valueClass = /^(true|false|null)$/i.test(value.trim()) ? "docker-yaml-literal" : /^-?\d+(?:\.\d+)?$/.test(value.trim()) ? "docker-yaml-number" : /^[\"'].*[\"']$/.test(value.trim()) ? "docker-yaml-string" : "docker-yaml-value";
  return <>{indent}<span className="docker-yaml-key">{key}</span><span className="docker-yaml-punctuation">{separator}</span><span className={valueClass}>{value}</span></>;
}

export default function DockerComposeStudio({ onClose, onCreateDiagram }) {
  const [yamlText, setYamlText] = useState(STARTER);
  const [savedYaml, setSavedYaml] = useState(STARTER);
  const [selectedService, setSelectedService] = useState("web");
  const [fontSize, setFontSize] = useState(13);
  const [scrollTop, setScrollTop] = useState(0);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [showValidation, setShowValidation] = useState(false);\n  const [completion, setCompletion] = useState({ items: [], replaceStart: 0, replaceEnd: 0, selectedIndex: 0 });
  const fileInputRef = useRef(null);
  const editorRef = useRef(null);
  const parsed = useMemo(() => {
    try {
      const doc = parseDocument(yamlText, { prettyErrors: true, uniqueKeys: true });
      if (doc.errors.length) return { document: null, error: doc.errors[0].message };
      const value = doc.toJS();
      if (!isRecord(value)) return { document: null, error: "Compose YAML must be a mapping." };
      if (!isRecord(value.services)) return { document: null, error: "Add a top-level services mapping." };
      return { document: value, error: "" };
    } catch (cause) { return { document: null, error: cause?.message || "Could not parse Compose YAML." }; }
  }, [yamlText]);
  const composeDoc = parsed.document;
  const serviceEntries = Object.entries(composeDoc?.services || {});
  const serviceNames = new Set(serviceEntries.map(([name]) => name));
  const selected = composeDoc?.services?.[selectedService];
  const volumes = Object.keys(composeDoc?.volumes || {});
  const networks = Object.keys(composeDoc?.networks || {});
  const validation = useMemo(() => document ? validateComposeDocument(document) : { valid: false, findings: [] }, [document]);
  const readiness = useMemo(() => document ? analyzeComposeReadiness(document) : null, [document]);
  const edges = serviceEntries.flatMap(([from, service]) => dependenciesOf(service).map((to) => ({ from, to, exists: serviceNames.has(to) })));
  const dirty = yamlText !== savedYaml;
  const close = () => { if (dirty && !window.confirm("You have unsaved Compose YAML changes. Close Docker Compose Studio and discard them?")) return; onClose?.(); };


  const updateCompletions = (text, caret, force = false) => {
    const next = buildComposeCompletions(text, caret, force);
    setCompletion({ ...next, selectedIndex: 0 });
  };
  const applyCompletion = (item) => {
    const editor = editorRef.current;
    if (!editor || !item) return;
    const start = completion.replaceStart;
    const nextText = yamlText.slice(0, start) + item.insert + yamlText.slice(completion.replaceEnd);
    const nextCaret = start + item.insert.length;
    setYamlText(nextText);
    setError("");
    setNotice("");
    setCompletion({ items: [], replaceStart: 0, replaceEnd: 0, selectedIndex: 0 });
    requestAnimationFrame(() => { editor.focus(); editor.setSelectionRange(nextCaret, nextCaret); });
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
    if (event.key === "Enter") {
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
\n  const importYaml = async (event) => {
    const file = event.target.files?.[0]; event.target.value = ""; if (!file) return;
    try {
      const text = await file.text();
      const doc = parseDocument(text, { prettyErrors: true, uniqueKeys: true });
      if (doc.errors.length) throw new Error(doc.errors[0].message);
      const value = doc.toJS();
      if (!isRecord(value) || !isRecord(value.services)) throw new Error("The file must contain a Compose document with a top-level services mapping.");
      const next = text.endsWith("\n") ? text : text + "\n";
      setYamlText(next); setSavedYaml(next); setSelectedService(Object.keys(value.services)[0] || "");
      setError(""); setNotice("Imported " + file.name + ". The full source YAML is retained in the editor.");
    } catch (cause) { setError("Import failed: " + (cause?.message || "Invalid Compose YAML")); setNotice(""); }
  };
  const exportYaml = () => {
    if (!composeDoc) { setError(parsed.error || "Fix YAML before exporting."); return; }
    const blob = new Blob([yamlText.endsWith("\n") ? yamlText : yamlText + "\n"], { type: "text/yaml;charset=utf-8" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "compose.yaml"; anchor.click(); URL.revokeObjectURL(url);
    setSavedYaml(yamlText); setError(""); setNotice("compose.yaml exported directly from the editor; unsupported fields were not reconstructed or discarded.");
  };
  const exportReport = () => {
    if (!composeDoc) { setError(parsed.error || "Fix YAML before exporting a report."); return; }
    const blob = new Blob([exportComposeReadinessReport(document)], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = (composeDoc.name || "compose") + "-preflight-report.md"; anchor.click(); URL.revokeObjectURL(url);
    setNotice("Static preflight report exported. No containers were started.");
  };
  const createDiagram = async () => {
    if (!composeDoc) { setError(parsed.error || "Fix YAML before creating a diagram."); return; }
    if (validation.findings.some((finding) => finding.severity === "error")) { setShowValidation(true); setError("Resolve blocking Compose validation errors before creating the diagram."); return; }
    try { await onCreateDiagram?.(document); setSavedYaml(yamlText); setError(""); setNotice("Diagram created from the current Compose YAML."); onClose?.(); }
    catch (cause) { setError(cause?.message || "Could not create the Compose diagram."); }
  };
  const addService = () => {
    if (!composeDoc) { setError(parsed.error); return; }
    let i = serviceEntries.length + 1; let name = "service-" + i;
    while (serviceNames.has(name)) name = "service-" + (++i);
    setYamlText(stringify({ ...composeDoc, services: { ...composeDoc.services, [name]: { image: "nginx:alpine", restart: "unless-stopped" } } }));
    setSelectedService(name); setError(""); setNotice("Added " + name + " to the YAML.");
  };
  const focusSelected = () => {
    if (!editorRef.current) return;
    const lines = yamlText.split("\n"); const line = lines.findIndex((line) => new RegExp("^  " + selectedService.replace(/[.*+?^${}()|[\]\]/g, "\$&") + ":").test(line));
    if (line < 0) return;
    const offset = lines.slice(0, line).reduce((sum, line) => sum + line.length + 1, 0);
    editorRef.current.focus(); editorRef.current.setSelectionRange(offset, offset);
  };

  return <div className="docker-studio-overlay docker-studio-k8s-layout" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) close(); }}>
    <section className="docker-studio docker-studio-yaml-first" role="dialog" aria-modal="true" aria-labelledby="docker-studio-title">
      <header className="docker-studio-header"><div className="docker-studio-brand-mark" aria-hidden="true">▦</div><div className="docker-studio-heading"><span className="docker-studio-eyebrow">INFRASTRUCTURE WORKSPACE</span><h1 id="docker-studio-title">Docker Compose Studio</h1><p>Edit Compose YAML and inspect its containers and relationships.</p></div><button type="button" className="docker-studio-close" onClick={close} aria-label="Close Docker Compose Studio">×</button></header>
      <div className="docker-studio-toolbar"><div className="docker-studio-toolbar-context"><strong>{composeDoc?.name || "Compose project"}</strong><span>{serviceEntries.length} services · {volumes.length} volumes · {networks.length} networks</span>{dirty && <em>Unsaved edits</em>}</div><div className="docker-studio-toolbar-actions"><input ref={fileInputRef} type="file" accept=".yaml,.yml,application/yaml,text/yaml" hidden onChange={importYaml} aria-label="Import Compose YAML"/><button type="button" className="docker-studio-secondary" onClick={() => fileInputRef.current?.click()}>Import YAML</button><button type="button" className="docker-studio-secondary" onClick={addService} disabled={!composeDoc}>+ Service</button><button type="button" className="docker-studio-secondary" onClick={exportReport} disabled={!composeDoc}>Preflight report</button><button type="button" className="docker-studio-secondary" onClick={exportYaml} disabled={!composeDoc}>Export YAML</button><button type="button" className="docker-studio-primary" onClick={createDiagram} disabled={!document || Boolean(parsed.error)}>Create diagram</button></div></div>
      <div className="docker-studio-k8s-workspace">
        <section className="docker-studio-yaml-pane" aria-label="Compose YAML editor">
          <div className="docker-studio-pane-heading"><div><span>01</span><h2>Compose YAML</h2></div><div className="docker-studio-font-controls"><button type="button" onClick={() => setFontSize((size) => Math.max(10, size - 1))} disabled={fontSize <= 10} aria-label="Decrease YAML font size">A−</button><output>{fontSize}px</output><button type="button" onClick={() => setFontSize((size) => Math.min(20, size + 1))} disabled={fontSize >= 20} aria-label="Increase YAML font size">A+</button></div></div>
          <div className="docker-studio-yaml-shell"><div className="docker-studio-yaml-gutter" aria-hidden="true" style={{ fontSize: fontSize + "px", lineHeight: 1.65 }}><div style={{ transform: "translateY(-" + scrollTop + "px)" }}>{Array.from({ length: Math.max(1, yamlText.split("\n").length) }, (_, i) => <span key={i}>{i + 1}</span>)}</div></div><pre className="docker-studio-yaml-highlight" aria-hidden="true" style={{ fontSize: fontSize + "px", lineHeight: 1.65 }}>{yamlText.split("\n").map((line, i) => <span className="docker-yaml-line" key={i}>{highlightLine(line)}{"\n"}</span>)}</pre><textarea ref={editorRef} className="docker-studio-yaml-input" aria-label="Docker Compose YAML" spellCheck="false" autoCapitalize="off" autoCorrect="off" value={yamlText} style={{ fontSize: fontSize + "px", lineHeight: 1.65 }} onChange={(event) => { const nextText = event.target.value; setYamlText(nextText); setError(""); setNotice(""); updateCompletions(nextText, event.target.selectionStart); }} onKeyDown={handleYamlKeyDown} onClick={(event) => updateCompletions(yamlText, event.currentTarget.selectionStart)} onScroll={(event) => { setScrollTop(event.currentTarget.scrollTop); const pre = event.currentTarget.parentElement?.querySelector(".docker-studio-yaml-highlight"); if (pre) { pre.scrollTop = event.currentTarget.scrollTop; pre.scrollLeft = event.currentTarget.scrollLeft; } }} placeholder="Paste compose.yaml here…"/>{completion.items.length > 0 && <div className="docker-compose-yaml-completions" role="listbox" aria-label="Compose YAML completions"><div className="docker-compose-yaml-completion-heading">Compose suggestions <kbd>↑</kbd><kbd>↓</kbd><kbd>Enter</kbd><kbd>Esc</kbd></div>{completion.items.map((item, index) => <button type="button" role="option" aria-selected={index === completion.selectedIndex} className={index === completion.selectedIndex ? "docker-compose-yaml-completion active" : "docker-compose-yaml-completion"} key={item.label} onMouseDown={(event) => event.preventDefault()} onClick={() => applyCompletion(item)}><strong>{item.label}</strong><small>{item.detail}</small></button>)}</div>}</div>
          <div className="docker-studio-yaml-status"><span>YAML</span><span>{yamlText.split("\n").length} lines</span><span>{yamlText.length.toLocaleString()} characters</span><span>Ctrl+Space suggestions · Enter/Tab accept</span></div><p className="docker-studio-editor-help">YAML is the source of truth. Imports and exports keep the complete document, including fields the visual preview does not yet interpret.</p>
        </section>
        <aside className="docker-studio-resource-pane" aria-label="Live service preview">
          <div className="docker-studio-pane-heading"><div><span>02</span><h2>Containers</h2></div><strong>{serviceEntries.length}</strong></div>
          {parsed.error && <div className="docker-studio-parse-error" role="alert"><strong>YAML needs attention</strong><p>{parsed.error}</p></div>}
          {!parsed.error && !serviceEntries.length && <div className="docker-studio-empty-check">Define services in YAML to see their containers here.</div>}
          <div className="docker-studio-container-list">{serviceEntries.map(([name, service]) => <button key={name} type="button" className={selectedService === name ? "docker-studio-container-card selected" : "docker-studio-container-card"} onClick={() => { setSelectedService(name); setError(""); }} aria-pressed={selectedService === name}><span className="docker-studio-container-icon" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h8M8 12h8M8 15h5"/></svg></span><span className="docker-studio-container-copy"><strong>{name}</strong><small>{imageOf(service)}</small><small className="docker-studio-container-meta">{service?.ports?.length || 0} ports · {service?.volumes?.length || 0} mounts · {service?.environment ? (Array.isArray(service.environment) ? service.environment.length : Object.keys(service.environment).length) : 0} env</small></span></button>)}</div>
          {selected && <section className="docker-studio-selected-details"><div className="docker-studio-selected-heading"><span>SELECTED SERVICE</span><button type="button" onClick={focusSelected}>Edit YAML</button></div><h3>{selectedService}</h3><p>{imageOf(selected)}</p>{dependenciesOf(selected).length > 0 && <div><strong>Depends on</strong><div className="docker-studio-chip-list">{dependenciesOf(selected).map((name) => <button type="button" key={name} className={serviceNames.has(name) ? "" : "missing"} onClick={() => setSelectedService(name)}>{name}</button>)}</div></div>}{namesOf(selected.volumes).length > 0 && <div><strong>Mounts</strong><div className="docker-studio-detail-list">{namesOf(selected.volumes).map((value, i) => <span key={i}>{value}</span>)}</div></div>}{namesOf(selected.networks).length > 0 && <div><strong>Networks</strong><div className="docker-studio-chip-list">{namesOf(selected.networks).map((name) => <span key={name}>{name}</span>)}</div></div>}</section>}
          <section className="docker-studio-relationship-panel" aria-label="Service relationships"><div className="docker-studio-relationship-heading"><strong>Relationships</strong><span>{edges.length}</span></div>{edges.length ? edges.map((edge, i) => <button type="button" key={edge.from + edge.to + i} className={edge.exists ? "docker-studio-relationship" : "docker-studio-relationship missing"} onClick={() => setSelectedService(edge.exists ? edge.to : edge.from)}><strong>{edge.from}</strong><span>→</span><strong>{edge.to}</strong><small>{edge.exists ? "depends on" : "missing service"}</small></button>) : <p>No service dependencies are defined.</p>}{(volumes.length > 0 || networks.length > 0) && <div className="docker-studio-shared-resources"><strong>Shared resources</strong>{volumes.map((name) => <span key={"v" + name}>Volume · {name}</span>)}{networks.map((name) => <span key={"n" + name}>Network · {name}</span>)}</div>}</section>
        </aside>
      </div>
      <section className="docker-studio-validation-strip" aria-label="Compose validation"><button type="button" className="docker-studio-validation-toggle" onClick={() => setShowValidation((value) => !value)} aria-expanded={showValidation}><span className={parsed.error || validation.findings.some((finding) => finding.severity === "error") ? "docker-studio-validation-dot error" : "docker-studio-validation-dot"}/><strong>{parsed.error ? "YAML parse error" : validation.findings.length ? validation.findings.length + " validation findings" : "Compose checks"}</strong><span>{parsed.error ? "Fix YAML syntax to continue" : validation.findings.filter((finding) => finding.severity === "error").length + " errors · " + validation.findings.filter((finding) => finding.severity === "warning").length + " warnings"}</span><span>{showValidation ? "−" : "+"}</span></button>{showValidation && <div className="docker-studio-validation-content">{parsed.error && <p className="docker-studio-parse-error">{parsed.error}</p>}{validation.findings.map((finding, i) => <article key={finding.code + finding.path + i} className={"docker-studio-finding " + finding.severity}><strong>{finding.message}</strong><small>{finding.path}</small><p>{finding.remediation}</p></article>)}{readiness && <div className="docker-studio-readiness-summary"><strong>Readiness {readiness.readinessScore}/100 · {readiness.readinessGrade}</strong><span>{readiness.severityCounts.error} errors · {readiness.severityCounts.warning} warnings · {readiness.severityCounts.info} recommendations</span>{readiness.startupOrder.length > 0 && <p>Suggested startup order: {readiness.startupOrder.join(" → ")}</p>}</div>}{!parsed.error && !validation.findings.length && <p>No issues detected by the static checks.</p>}</div>}</section>
      {(error || notice) && <div className={error ? "docker-studio-message error" : "docker-studio-message"} role={error ? "alert" : "status"}>{error || notice}</div>}
      <footer className="docker-studio-footer"><span>{serviceEntries.length} services · {volumes.length} named volumes · {networks.length} networks</span><span>YAML-first workflow · Canvas changes only after Create diagram</span></footer>
    </section>
  </div>;
}
