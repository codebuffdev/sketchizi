import { useMemo, useRef, useState } from "react";
import { parseDocument, stringify } from "yaml";
import { analyzeComposeReadiness, exportComposeReadinessReport, validateComposeDocument } from "../composeDocumentService.js";
import "./docker-compose-studio.css";

function emptyService() {
  return { image: "", buildContext: "", portsText: "", environmentText: "", dependsText: "", volumesText: "", networksText: "", healthcheckText: "", restart: "unless-stopped" };
}

function parseComposeStatus(output) {
  if (!output?.trim()) return [];
  try {
    const parsed = JSON.parse(output);
    return (Array.isArray(parsed) ? parsed : [parsed]).filter((item) => item && typeof item === "object");
  } catch {
    return output.split("\n").map((line) => { try { return JSON.parse(line); } catch { return null; } }).filter((item) => item && typeof item === "object");
  }
}
function getContainerState(container) {
  const raw = String(container.State || container.Status || "").toLowerCase();
  const health = String(container.Health || container.HealthStatus || "").toLowerCase();
  if (health.includes("unhealthy") || raw.includes("unhealthy")) return { label: "Unhealthy", kind: "unhealthy" };
  if (health.includes("starting") || raw.includes("starting") || raw.includes("created") || raw.includes("restarting")) return { label: "Starting", kind: "starting" };
  if (health.includes("healthy")) return { label: "Healthy", kind: "healthy" };
  if (raw.includes("running") || raw === "up") return { label: "Running", kind: "running" };
  if (raw.includes("exited") || raw.includes("stopped") || raw.includes("dead") || raw.includes("removing")) return { label: "Stopped", kind: "stopped" };
  return { label: raw ? raw.replace(/^./, (letter) => letter.toUpperCase()) : "Unknown", kind: "unknown" };
}
function getContainerAttention(container) {
  const state = getContainerState(container);
  if (state.kind === "unhealthy") return { title: "Health check failing", detail: "Inspect this service’s logs and healthcheck command; verify its dependencies and readiness endpoint." };
  if (state.kind === "stopped") return { title: "Container stopped", detail: "Review the exit code and recent logs. Check the service command, required environment variables, and dependency availability." };
  if (state.kind === "starting") return { title: "Still starting", detail: "Allow the startup window to finish, then refresh status. If it remains here, inspect logs and healthcheck timing." };
  if (state.kind === "unknown") return { title: "State not recognized", detail: "Refresh status and inspect the raw Docker status output to confirm the current container state." };
  return null;
}

function getRecoveryGuidance(errorCode, action, serviceName) {
  const target = serviceName ? ` for service “${serviceName}”` : "";
  const guidance = {
    DOCKER_CLI_MISSING: { title: "Docker CLI unavailable", steps: ["Install or repair Docker Desktop.", "Ensure the docker CLI is available on PATH.", "Run Check runner again."], risk: "No Compose lifecycle action was confirmed.", action: "health", actionLabel: "Check runner" },
    DOCKER_DAEMON_UNAVAILABLE: { title: "Docker engine unavailable", steps: ["Open Docker Desktop and wait until the engine reports ready.", "Run Check runner to verify daemon access.", "Retry only after the connection check succeeds."], risk: "Do not repeat Start or Stop until the engine state is checked.", action: "health", actionLabel: "Check Docker connection" },
    PORT_CONFLICT: { title: "Published port is already in use", steps: ["Identify the process or container currently using the host port.", "Change the host-side port mapping for the affected service.", "Run Validate, then retry when the conflict is resolved."], risk: "Do not stop unrelated containers without identifying their owner.", action: "validate", actionLabel: "Validate Compose file" },
    IMAGE_ACCESS_DENIED: { title: "Image registry access denied", steps: ["Verify the image name and tag for this service.", "Confirm registry authentication and image pull permissions.", "Retry after access has been verified."], risk: "Never include registry passwords or access tokens in diagnostic reports.", action: "logs", actionLabel: "View service logs" },
    DOCKERFILE_MISSING: { title: "Dockerfile or build context not found", steps: ["Confirm the build context is the directory containing the Dockerfile.", "Check the Dockerfile name and relative path.", "Run Validate before starting services again."], risk: "No files will be deleted or changed automatically.", action: "validate", actionLabel: "Validate Compose file" },
    COMPOSE_CONFIG_INVALID: { title: "Compose configuration is invalid", steps: ["Read the first validation error in the command output.", "Correct the named service field or YAML structure.", "Re-run Validate before Start."], risk: "Start is not recommended until validation passes.", action: "validate", actionLabel: "Revalidate Compose file" },
    COMMAND_TIMEOUT: { title: "Command timed out; final state may be uncertain", steps: ["Run Status or Refresh status to observe current containers.", "Inspect targeted service logs if a container is unhealthy or stopped.", "Retry a lifecycle command only after confirming the actual state."], risk: "A timeout does not prove Start or Stop failed; repeating immediately can compound the problem.", action: "ps", actionLabel: "Check runtime status" },
    DOCKER_DISK_FULL: { title: "Docker storage is full", steps: ["Review Docker Desktop disk usage.", "Remove only resources confirmed safe to discard.", "Avoid broad prune or volume deletion commands until data impact is understood."], risk: "Pruning and volume removal can permanently delete data.", action: "ps", actionLabel: "Check runtime status" },
    COMPOSE_COMMAND_FAILED: { title: "Compose command failed", steps: ["Read the first actionable error in stderr.", "Inspect affected service logs when the service is known.", "Correct the reported configuration, build, or runtime issue before retrying."], risk: "No automatic restart or cleanup will be performed.", action: "logs", actionLabel: "Inspect recent logs" },
  };
  const selected = guidance[errorCode];
  if (!selected) return null;
  return { ...selected, scope: `Recommended next steps${target} · original action: ${action || "unknown"}` };
}

function summarizeContainers(containers) {
  return containers.reduce((summary, container) => {
    const kind = getContainerState(container).kind;
    summary[kind] = (summary[kind] || 0) + 1;
    summary.total += 1;
    return summary;
  }, { total: 0, healthy: 0, running: 0, starting: 0, unhealthy: 0, stopped: 0, unknown: 0 });
}

function parseLines(value) {
  return value.split("\n").map((line) => line.trim()).filter(Boolean);
}

function toDocument(name, services, volumeNames, networkNames) {
  const normalized = {};
  for (const service of services) {
    const definition = {};
    if (service.image.trim()) definition.image = service.image.trim();
    if (service.buildContext.trim()) definition.build = { context: service.buildContext.trim() };
    const ports = parseLines(service.portsText);
    if (ports.length) definition.ports = ports;
    const environment = parseLines(service.environmentText);
    if (environment.length) definition.environment = environment;
    const depends = parseLines(service.dependsText);
    if (depends.length) definition.depends_on = depends;
    const volumesForService = parseLines(service.volumesText);
    if (volumesForService.length) definition.volumes = volumesForService;
    const networksForService = parseLines(service.networksText);
    if (networksForService.length) definition.networks = networksForService;
    const healthcheck = parseLines(service.healthcheckText);
    if (healthcheck.length) definition.healthcheck = { test: ["CMD-SHELL", healthcheck[0]], ...(healthcheck[1] ? { interval: healthcheck[1] } : {}), ...(healthcheck[2] ? { retries: Number(healthcheck[2]) || healthcheck[2] } : {}) };
    if (service.restart) definition.restart = service.restart;
    normalized[service.name.trim()] = definition;
  }
  const volumes = Object.fromEntries(parseLines(volumeNames).map((name) => [name, {}]));
  const networks = Object.fromEntries(parseLines(networkNames).map((name) => [name, {}]));
  return { name: name.trim(), services: normalized, volumes, networks };
}

export default function DockerComposeStudio({ onClose, onCreateDiagram }) {
  const [projectName, setProjectName] = useState("my-compose-project");
  const [services, setServices] = useState([{ name: "web", ...emptyService() }]);
  const [selectedId, setSelectedId] = useState("web");
  const [volumeNames, setVolumeNames] = useState("");
  const [networkNames, setNetworkNames] = useState("");
  const [sourceDocument, setSourceDocument] = useState(null);
  const fileInputRef = useRef(null);
  const [notice, setNotice] = useState("");
  const [showExecutionPreflight, setShowExecutionPreflight] = useState(false);
  const [executionAcknowledged, setExecutionAcknowledged] = useState(false);
  const [runnerUrl, setRunnerUrl] = useState("http://127.0.0.1:8788");
  const [runnerBusy, setRunnerBusy] = useState(false);
  const [runnerResult, setRunnerResult] = useState(null);
  const [operationHistory, setOperationHistory] = useState([]);
  const [runnerHealth, setRunnerHealth] = useState(null);
  const selected = services.find((service) => service.name === selectedId) || services[0];
  const composeDocument = useMemo(() => toDocument(projectName, services, volumeNames, networkNames), [projectName, services, volumeNames, networkNames]);
  const validation = useMemo(() => validateComposeDocument(composeDocument), [composeDocument]);
  const readiness = useMemo(() => analyzeComposeReadiness(composeDocument), [composeDocument]);

  const updateSelected = (patch) => {
    if (!selected) return;
    setServices((current) => current.map((service) => service.name === selected.name ? { ...service, ...patch } : service));
  };
  const addService = () => {
    let index = services.length + 1;
    let name = `service-${index}`;
    while (services.some((service) => service.name === name)) name = `service-${++index}`;
    setServices((current) => [...current, { name, ...emptyService() }]);
    setSelectedId(name);
    setNotice("");
  };
  const renameSelected = (name) => {
    if (!selected) return;
    const nextName = name.replace(/[^a-zA-Z0-9_.-]/g, "-");
    setServices((current) => current.map((service) => service.name === selected.name ? { ...service, name: nextName } : service));
    setSelectedId(nextName);
  };
  const removeSelected = () => {
    if (!selected) return;
    const next = services.filter((service) => service !== selected);
    setServices(next);
    setSelectedId(next[0]?.name || "");
    setNotice("");
  };
  const importYaml = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = parseDocument(text, { uniqueKeys: true });
      if (parsed.errors.length) throw new Error(parsed.errors[0].message);
      const imported = parsed.toJS();
      if (!imported || typeof imported !== "object" || Array.isArray(imported) || !imported.services || typeof imported.services !== "object" || Array.isArray(imported.services)) throw new Error("The file must contain a Compose document with a services mapping.");
      const importedServices = Object.entries(imported.services).map(([name, definition]) => {
        const service = definition && typeof definition === "object" && !Array.isArray(definition) ? definition : {};
        const build = typeof service.build === "string" ? service.build : service.build?.context || "";
        const environment = Array.isArray(service.environment) ? service.environment : Object.entries(service.environment || {}).map(([key, value]) => `${key}=${value ?? ""}`);
        const health = service.healthcheck || {};
        const healthCommand = Array.isArray(health.test) ? health.test.slice(1).join(" ") : "";
        return { name, ...emptyService(), image: typeof service.image === "string" ? service.image : "", buildContext: build, portsText: (service.ports || []).map((value) => typeof value === "object" ? [value.host_ip, value.published, value.target].filter(Boolean).join(":") : String(value)).join("\n"), environmentText: environment.join("\n"), dependsText: (Array.isArray(service.depends_on) ? service.depends_on : Object.keys(service.depends_on || {})).join("\n"), volumesText: (service.volumes || []).map((value) => typeof value === "string" ? value : [value.source, value.target, value.read_only ? "ro" : ""].filter(Boolean).join(":")).join("\n"), networksText: (Array.isArray(service.networks) ? service.networks : Object.keys(service.networks || {})).join("\n"), healthcheckText: [healthCommand, health.interval, health.retries].filter((value) => value !== undefined && value !== "").join("\n"), restart: service.restart || "unless-stopped" };
      });
      setProjectName(typeof imported.name === "string" ? imported.name : file.name.replace(/\.(ya?ml)$/i, ""));
      setServices(importedServices);
      setSelectedId(importedServices[0]?.name || "");
      setVolumeNames(Object.keys(imported.volumes || {}).join("\n"));
      setNetworkNames(Object.keys(imported.networks || {}).join("\n"));
      setSourceDocument(imported);
      setNotice(`Imported ${file.name}. Unsupported fields will be retained on export.`);
    } catch (error) {
      setNotice(`Import failed: ${error instanceof Error ? error.message : "Invalid Compose YAML"}`);
    }
  };

  const getExportDocument = () => sourceDocument ? {
    ...sourceDocument,
    ...composeDocument,
    volumes: Object.fromEntries(Object.keys(composeDocument.volumes).map((name) => [name, sourceDocument.volumes?.[name] ?? {}])),
    networks: Object.fromEntries(Object.keys(composeDocument.networks).map((name) => [name, sourceDocument.networks?.[name] ?? {}])),
    services: Object.fromEntries(Object.entries(composeDocument.services).map(([name, service]) => {
      const original = { ...(sourceDocument.services?.[name] || {}) };
      for (const key of ["image", "build", "ports", "environment", "depends_on", "volumes", "networks", "healthcheck", "restart"]) delete original[key];
      return [name, { ...original, ...service }];
    }))
  } : composeDocument;

  const checkRunnerHealth = async () => {
    if (runnerBusy) return;
    setRunnerBusy(true);
    setRunnerHealth({ checking: true });
    try {
      const base = runnerUrl.trim().replace(/\/+$/, "");
      if (!base) throw new Error("Enter the local runner URL.");
      const response = await fetch(base + "/health");
      if (!response.ok) throw new Error("Runner health endpoint returned HTTP " + response.status + ".");
      const result = await response.json();
      setRunnerHealth({ ...result, reachable: true });
      setNotice(result.docker?.available ? "Local runner and Docker daemon are ready." : "Local runner is reachable, but Docker needs attention.");
    } catch (error) {
      setRunnerHealth({ reachable: false, message: error instanceof Error ? error.message : "Could not reach the local runner." });
      setNotice("Runner check failed. Start the runner and verify its allowed origin.");
    } finally { setRunnerBusy(false); }
  };

  const runComposeAction = async (action, serviceName) => {
    if (runnerBusy) return;
    if (action === "up" && (!executionAcknowledged || !window.confirm("Start containers for this Compose project on your machine?"))) return;
    if (action === "down" && !window.confirm("Stop and remove this Compose project's containers and default network? Named volumes are preserved unless configured otherwise.")) return;
    const startedAt = Date.now();
    let operationOutcome = "Outcome uncertain";
    let operationDetail = "";
    setRunnerBusy(true);
    setRunnerResult(null);
    try {
      const base = runnerUrl.trim().replace(/\/+$/, "");
      const response = await fetch(base + "/api/compose", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, projectName, composeYaml: stringify(getExportDocument()), ...(serviceName ? { serviceName } : {}) }),
      });
      const result = await response.json();
      operationOutcome = result.timedOut ? "Timed out · outcome uncertain" : result.success ? "Succeeded" : "Failed";
      operationDetail = serviceName ? `${serviceName}: ${result.errorCode || result.message || ""}` : result.errorCode || result.message || "";
      setRunnerResult({ ...result, httpStatus: response.status });
      setNotice(result.message || result.error || "Compose runner returned a response.");

      // Refresh runtime state after lifecycle changes so the displayed status
      // reflects the resulting project rather than the previous snapshot.
      if (response.ok && result.success && ["up", "down"].includes(action)) {
        try {
          const statusResponse = await fetch(base + "/api/compose", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ action: "ps", projectName, composeYaml: stringify(getExportDocument()) }),
          });
          const statusResult = await statusResponse.json();
          if (!statusResponse.ok || !statusResult.success) {
            operationOutcome = "Succeeded · status refresh failed";
            operationDetail = statusResult.error || statusResult.stderr || "Status refresh failed";
            setRunnerResult({ ...result, httpStatus: response.status, refreshWarning: statusResult.error || statusResult.stderr || "The lifecycle command succeeded, but status refresh failed." });
            setNotice(action === "up" ? "Start completed, but runtime status could not be refreshed." : "Stop completed, but runtime status could not be refreshed.");
          } else {
            operationOutcome = "Succeeded · status refreshed";
            operationDetail = "Runtime status refreshed";
            setRunnerResult({ ...statusResult, lifecycleAction: action, lifecycleExitCode: result.exitCode, lifecycleOutput: result.stdout, httpStatus: statusResponse.status, message: (result.message || "Compose lifecycle command completed.") + " Runtime status refreshed." });
            setNotice(action === "up" ? "Start completed; runtime status refreshed." : "Stop completed; runtime status refreshed.");
          }
        } catch (refreshError) {
          operationOutcome = "Succeeded · status refresh failed";
          operationDetail = refreshError instanceof Error ? refreshError.message : "Runtime status refresh failed";
          setRunnerResult({ ...result, httpStatus: response.status, refreshWarning: refreshError instanceof Error ? refreshError.message : "Runtime status refresh failed." });
          setNotice("Lifecycle command completed, but runtime status refresh failed.");
        }
      }
    } catch (error) {
      operationOutcome = "Outcome uncertain";
      operationDetail = error instanceof Error ? error.message : "The request outcome could not be confirmed";
      setRunnerResult({ success: false, outcomeUnknown: true, error: error instanceof Error ? error.message : "The request outcome could not be confirmed." });
      setNotice("The request outcome could not be confirmed. Check Status before retrying a lifecycle action.");
    } finally {
      setOperationHistory((current) => [{ id: startedAt, action, timestamp: new Date(startedAt).toISOString(), durationMs: Date.now() - startedAt, outcome: operationOutcome, detail: operationDetail }, ...current].slice(0, 10));
      setRunnerBusy(false);
    }
  };

  const copyDiagnosticReport = async () => {
    if (!runnerResult) return;
    const report = [
      "Sketchizi Docker Compose diagnostic report",
      `Project: ${projectName}`,
      `Action: ${runnerResult.action || runnerResult.lifecycleAction || "unknown"}`,
      `Service: ${runnerResult.serviceName || "all services"}`,
      `Outcome: ${runnerResult.success ? "success" : runnerResult.outcomeUnknown || runnerResult.timedOut ? "uncertain" : "failed"}`,
      `Error code: ${runnerResult.errorCode || "none"}`,
      `Hint: ${runnerResult.hint || "none"}`,
      `Message: ${runnerResult.message || runnerResult.error || "none"}`,
      `HTTP status: ${runnerResult.httpStatus ?? "unknown"}`,
      "",
      "STDOUT:", runnerResult.stdout || "(empty)",
      "",
      "STDERR:", runnerResult.stderr || "(empty)",
    ].join("\\n");
    try {
      await navigator.clipboard.writeText(report);
      setNotice("Diagnostic report copied to clipboard.");
    } catch {
      setNotice("Clipboard access was unavailable. Select and copy the command output manually.");
    }
  };

  const downloadYaml = () => {
    if (!validation.valid) {
      setNotice("Fix the validation errors before exporting.");
      return;
    }
    const output = getExportDocument();
    const blob = new Blob([stringify(output)], { type: "text/yaml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "compose.yaml";
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("compose.yaml exported.");
  };

  const downloadPreflightReport = () => {
    const report = exportComposeReadinessReport(composeDocument);
    const blob = new Blob([report], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = (projectName.trim() || "compose") + "-preflight-report.md";
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("Preflight report exported. It records static checks only; no deployment was run.");
  };

  return (
    <div className="docker-studio-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="docker-studio" role="dialog" aria-modal="true" aria-labelledby="docker-studio-title">
        <header className="docker-studio-header">
          <div className="docker-studio-brand-mark" aria-hidden="true">▦</div>
          <div className="docker-studio-heading">
            <span className="docker-studio-eyebrow">INFRASTRUCTURE DESIGN</span>
            <h1 id="docker-studio-title">Docker Compose Studio</h1>
            <p>Model your multi-container application and export a Compose file.</p>
          </div>
          <button type="button" className="docker-studio-close" onClick={onClose} aria-label="Close Docker Compose Studio">×</button>
        </header>

        <div className="docker-studio-project-row">
          <label>Project name<input value={projectName} onChange={(event) => setProjectName(event.target.value)} /></label>
          <div className="docker-studio-header-actions">
            <input ref={fileInputRef} type="file" accept=".yaml,.yml,application/yaml,text/yaml" className="docker-studio-file-input" style={{ display: "none" }} onChange={importYaml} aria-label="Import Compose YAML" />
            <button type="button" className="docker-studio-secondary" onClick={() => fileInputRef.current?.click()}>Import YAML</button>
            <button type="button" className="docker-studio-secondary" onClick={() => onCreateDiagram?.(composeDocument)}>Open as diagram</button>
            <button type="button" className="docker-studio-secondary" onClick={downloadPreflightReport}>Export preflight report</button>
            <button type="button" className="docker-studio-secondary" onClick={() => { setExecutionAcknowledged(false); setShowExecutionPreflight(true); }}>Deployment preflight</button>
            <button type="button" className="docker-studio-secondary" onClick={addService}>＋ Add service</button>
            <button type="button" className="docker-studio-primary" onClick={downloadYaml}>Export compose.yaml</button>
          </div>
        </div>

        <section className="docker-studio-topology" aria-label="Visual service topology">
          <div className="docker-studio-topology-heading">
            <div>
              <span className="docker-studio-eyebrow">LIVE TOPOLOGY</span>
              <h2>Service connections</h2>
            </div>
            <span className="docker-studio-topology-count">{services.length} {services.length === 1 ? "service" : "services"}</span>
          </div>
          {services.length ? (
            <div className="docker-studio-topology-canvas">
              <div className="docker-studio-topology-nodes">
                {services.map((service) => {
                  const dependencies = parseLines(service.dependsText);
                  const isSelected = selected?.name === service.name;
                  return (
                    <button
                      key={service.name}
                      type="button"
                      className={isSelected ? "docker-studio-topology-node selected" : "docker-studio-topology-node"}
                      onClick={() => setSelectedId(service.name)}
                      aria-pressed={isSelected}
                    >
                      <span className="docker-studio-topology-node-icon" aria-hidden="true">▣</span>
                      <span className="docker-studio-topology-node-copy">
                        <strong>{service.name}</strong>
                        <small>{service.image || "Image not configured"}</small>
                        {service.portsText.trim() && <small className="docker-studio-topology-port">Ports: {parseLines(service.portsText).join(", ")}</small>}
                      </span>
                      <span className="docker-studio-topology-node-meta">{dependencies.length ? `Depends on ${dependencies.join(", ")}` : "No dependencies"}</span>
                    </button>
                  );
                })}
              </div>
              {services.some((service) => parseLines(service.dependsText).length > 0) && (
                <div className="docker-studio-topology-edges" aria-label="Dependency connections">
                  {services.flatMap((service) => parseLines(service.dependsText).map((dependency) => {
                    const exists = services.some((candidate) => candidate.name === dependency);
                    return (
                      <div key={`${service.name}-depends-${dependency}`} className={exists ? "docker-studio-topology-edge" : "docker-studio-topology-edge missing"}>
                        <strong>{service.name}</strong>
                        <span aria-hidden="true">⟶</span>
                        <strong>{dependency}</strong>
                        <small>{exists ? "depends on" : "missing service"}</small>
                      </div>
                    );
                  }))}
                </div>
              )}
            </div>
          ) : <p className="docker-studio-topology-empty">Add a service to see the topology.</p>}
        </section>

        <section className="docker-studio-resources" aria-label="Shared volumes and networks">
          <label>Named volumes <span>One volume name per line</span><textarea value={volumeNames} onChange={(event) => setVolumeNames(event.target.value)} placeholder={"database-data\nuploads"} rows={2} /></label>
          <label>Networks <span>One network name per line</span><textarea value={networkNames} onChange={(event) => setNetworkNames(event.target.value)} placeholder={"frontend\nbackend"} rows={2} /></label>
        </section>

        <div className="docker-studio-workspace">
          <aside className="docker-studio-service-list" aria-label="Services">
            <div className="docker-studio-section-heading"><span>Services</span><span>{services.length}</span></div>
            {services.map((service) => (
              <button key={service.name} type="button" className={selected?.name === service.name ? "docker-studio-service active" : "docker-studio-service"} onClick={() => setSelectedId(service.name)}>
                <span className="docker-studio-service-icon" aria-hidden="true">▣</span>
                <span><strong>{service.name}</strong><small>{service.image || "Image not configured"}</small></span>
              </button>
            ))}
          </aside>

          <div className="docker-studio-editor">
            {selected ? (
              <>
                <div className="docker-studio-editor-heading"><div><span className="docker-studio-eyebrow">SERVICE CONFIGURATION</span><h2>{selected.name}</h2></div><button type="button" className="docker-studio-danger" onClick={removeSelected} disabled={services.length === 1}>Remove service</button></div>
                <div className="docker-studio-fields">
                  <label>Service name<input value={selected.name} onChange={(event) => renameSelected(event.target.value)} /></label>
                  <label>Container image<input value={selected.image} onChange={(event) => updateSelected({ image: event.target.value })} placeholder="e.g. nginx:alpine" /></label>
                  <label>Build context <span>Directory containing a Dockerfile</span><input value={selected.buildContext} onChange={(event) => updateSelected({ buildContext: event.target.value })} placeholder="." /></label>
                  <label>Published ports <span>One mapping per line</span><textarea value={selected.portsText} onChange={(event) => updateSelected({ portsText: event.target.value })} placeholder={"8080:80\n8443:443"} rows={3} /></label>
                  <label>Environment variables <span>KEY=value, one per line</span><textarea value={selected.environmentText} onChange={(event) => updateSelected({ environmentText: event.target.value })} placeholder={"NODE_ENV=production\nPORT=3000"} rows={3} /></label>
                  <label>Depends on <span>Service names, one per line</span><textarea value={selected.dependsText} onChange={(event) => updateSelected({ dependsText: event.target.value })} placeholder="database" rows={2} /></label>
                  <label>Mounted volumes <span>source:target, one per line</span><textarea value={selected.volumesText} onChange={(event) => updateSelected({ volumesText: event.target.value })} placeholder={"database-data:/var/lib/data\n./config:/app/config:ro"} rows={3} /></label>
                  <label>Networks <span>Declared network names, one per line</span><textarea value={selected.networksText} onChange={(event) => updateSelected({ networksText: event.target.value })} placeholder={"frontend\nbackend"} rows={2} /></label>
                  <label>Health check <span>Command, interval, retries (one per line)</span><textarea value={selected.healthcheckText} onChange={(event) => updateSelected({ healthcheckText: event.target.value })} placeholder={"curl -f http://localhost/health || exit 1\n30s\n3"} rows={3} /></label>
                  <label>Restart policy<select value={selected.restart} onChange={(event) => updateSelected({ restart: event.target.value })}><option value="unless-stopped">unless-stopped</option><option value="always">always</option><option value="on-failure">on-failure</option><option value="no">no</option></select></label>
                </div>
              </>
            ) : <p>Add a service to start designing your Compose project.</p>}
          </div>

          <aside className="docker-studio-validation">
            <div className="docker-studio-section-heading"><span>Validation</span><span className={validation.valid && readiness.ready ? "docker-studio-status valid" : "docker-studio-status invalid"}>{validation.valid && readiness.ready ? "Ready" : "Issues"}</span></div>
            <section className="docker-studio-readiness" aria-label="Startup readiness">
              <div className="docker-studio-section-heading"><span>Run readiness</span><span className={readiness.ready ? "docker-studio-status valid" : "docker-studio-status invalid"}>{readiness.ready ? "Ready to review" : "Action needed"}</span></div>
              <div className="docker-studio-readiness-score" aria-label={`Readiness score ${readiness.readinessScore} out of 100`}>
                <strong>{readiness.readinessScore}/100</strong><span>{readiness.readinessGrade}</span>
                <small>{readiness.severityCounts.error} errors · {readiness.severityCounts.warning} warnings · {readiness.severityCounts.info} recommendations</small>
              </div>
              {readiness.startupOrder.length > 0 && <p><strong>Suggested startup order</strong><br />{readiness.startupOrder.join(" → ")}</p>}
              {readiness.prioritizedFindings.length > 0 ? (
                <>
                  <p className="docker-studio-remediation-intro">Recommended fixes are ordered by severity. Address blocking errors first, then review warnings.</p>
                  {readiness.prioritizedFindings.map((finding, index) => (
                    <div key={finding.code + finding.path + index} className={`docker-studio-finding ${finding.severity}`}>
                      <div className="docker-studio-remediation-priority"><strong>{finding.priority}</strong><span>{finding.priorityLabel}</span></div>
                      <strong>{finding.message}</strong><small>{finding.path}</small><p>{finding.remediation}</p>
                    </div>
                  ))}
                </>
              ) : <p>No dependency cycles or readiness findings detected. Review external environment variables before starting.</p>}
            </section>
            {validation.findings.length ? validation.findings.map((finding, index) => <div key={finding.code + finding.path + index} className={`docker-studio-finding ${finding.severity}`}><strong>{finding.message}</strong><small>{finding.path}</small><p>{finding.remediation}</p></div>) : <div className="docker-studio-empty-check"><span aria-hidden="true">✓</span><strong>No issues found</strong><p>Your current Compose model passes the initial checks.</p></div>}
            {notice && <p className="docker-studio-notice" role="status">{notice}</p>}
          </aside>
        </div>
                {showExecutionPreflight && (
          <div className="docker-studio-dialog-backdrop" role="presentation">
            <section className="docker-studio-execution-dialog" role="dialog" aria-modal="true" aria-labelledby="docker-studio-execution-title">
              <div className="docker-studio-editor-heading">
                <div><span className="docker-studio-eyebrow">PHASE 2 · EXECUTION PREFLIGHT</span><h2 id="docker-studio-execution-title">Review before running Compose</h2></div>
                <button type="button" className="docker-studio-secondary" onClick={() => setShowExecutionPreflight(false)} aria-label="Close deployment preflight">Close</button>
              </div>
              <p>Commands run through the local loopback runner on this machine. Check runner health first; Start and Stop require explicit confirmation.</p>
              <label className="docker-studio-runner-url">Local runner URL
                <input value={runnerUrl} onChange={(event) => setRunnerUrl(event.target.value)} placeholder="http://127.0.0.1:8788" />
              </label>
              <div className="docker-studio-lifecycle-controls">
                <button type="button" className="docker-studio-secondary" disabled={runnerBusy} onClick={checkRunnerHealth}>Check runner</button>
                <button type="button" className="docker-studio-secondary" disabled={runnerBusy} onClick={() => runComposeAction("validate")}>Validate</button>
                <button type="button" className="docker-studio-primary" disabled={runnerBusy || !executionAcknowledged} onClick={() => runComposeAction("up")}>{runnerBusy ? "Running…" : "Start services"}</button>
                <button type="button" className="docker-studio-danger" disabled={runnerBusy} onClick={() => runComposeAction("down")}>Stop services</button>
                <button type="button" className="docker-studio-secondary" disabled={runnerBusy} onClick={() => runComposeAction("ps")}>Status</button>
                <button type="button" className="docker-studio-secondary" disabled={runnerBusy} onClick={() => runComposeAction("ps")}>Refresh status</button>
                <button type="button" className="docker-studio-secondary" disabled={runnerBusy} onClick={() => runComposeAction("logs")}>Logs</button>
                <button type="button" className="docker-studio-secondary" disabled={runnerBusy} onClick={() => runComposeAction("stats")}>Resource usage</button>
              </div>
              {runnerHealth && <section className={"docker-studio-runner-result " + (runnerHealth.checking || runnerHealth.docker?.available ? "success" : "failure")} aria-live="polite">
                <strong>{runnerHealth.checking ? "Checking local runner…" : runnerHealth.reachable ? "Local runner reachable" : "Local runner unavailable"}</strong>
                {runnerHealth.docker && <p>{runnerHealth.docker.available ? "Docker daemon available" + (runnerHealth.docker.serverVersion ? " · server " + runnerHealth.docker.serverVersion : "") : runnerHealth.docker.message}</p>}
                {runnerHealth.message && <p>{runnerHealth.message}</p>}
              </section>}
              {operationHistory.length > 0 && <section className="docker-studio-operation-history" aria-label="Recent Compose operations"><div className="docker-studio-history-heading"><strong>Recent operations</strong><span>Last {operationHistory.length} · this session</span></div><ol>{operationHistory.map((operation) => <li key={operation.id}><div className="docker-studio-history-main"><strong>{({validate:"Validate",up:"Start services",down:"Stop services",ps:"Refresh status",logs:"View logs",stats:"Resource usage"})[operation.action] || operation.action}</strong><span className={operation.outcome.startsWith("Succeeded") ? "success" : operation.outcome === "Failed" ? "failure" : "uncertain"}>{operation.outcome}</span></div><div className="docker-studio-history-meta"><time dateTime={operation.timestamp}>{new Date(operation.timestamp).toLocaleTimeString()}</time><span>{(operation.durationMs / 1000).toFixed(1)} s</span></div>{operation.detail && <small>{operation.detail}</small>}</li>)}</ol></section>}
              {runnerResult && <section className={runnerResult.success ? "docker-studio-runner-result success" : "docker-studio-runner-result failure"} aria-live="polite">
                <strong>{runnerResult.timedOut || runnerResult.outcomeUnknown ? "Outcome uncertain" : runnerResult.success ? "Command succeeded" : "Command failed"}{Number.isInteger(runnerResult.exitCode) ? " · exit code " + runnerResult.exitCode : ""}</strong>
                {(runnerResult.timedOut || runnerResult.outcomeUnknown) && <div className="docker-studio-actionable-diagnostic"><span>CHECK BEFORE RETRYING</span><p>The runner could not confirm the final result. Use Status or Refresh status to inspect the project before repeating Start or Stop.</p></div>}
                {runnerResult.lifecycleAction && <p>Lifecycle action <strong>{runnerResult.lifecycleAction === "up" ? "Start" : "Stop"}</strong> completed with exit code {runnerResult.lifecycleExitCode}. The table below shows the refreshed container state.</p>}
                {runnerResult.refreshWarning && <div className="docker-studio-actionable-diagnostic"><span>STATUS REFRESH FAILED</span><p>{runnerResult.refreshWarning} Use Status or Refresh status to retry without repeating the lifecycle action.</p></div>}
                {runnerResult.error && <p>{runnerResult.error}</p>}
                {runnerResult.message && <p>{runnerResult.message}</p>}
                {!runnerResult.success && runnerResult.errorCode && (() => {
                  const recovery = getRecoveryGuidance(runnerResult.errorCode, runnerResult.action, runnerResult.serviceName);
                  if (!recovery) return <div className="docker-studio-actionable-diagnostic"><span>UNCLASSIFIED ERROR</span><p>{runnerResult.hint || "Review the command output and correct the reported issue before retrying."} No automatic recovery was attempted.</p></div>;
                  return <section className="docker-studio-recovery-guidance" aria-label="Recovery guidance">
                    <div className="docker-studio-recovery-heading"><span>RECOVERY GUIDANCE</span><strong>{recovery.title}</strong><small>{recovery.scope}</small></div>
                    <ol>{recovery.steps.map((step) => <li key={step}>{step}</li>)}</ol>
                    <p className="docker-studio-recovery-risk"><strong>Safety note:</strong> {recovery.risk}</p>
                    <div className="docker-studio-recovery-actions">
                      {recovery.action === "health" && <button type="button" className="docker-studio-secondary" disabled={runnerBusy} onClick={checkRunnerHealth}>{recovery.actionLabel}</button>}
                      {recovery.action === "validate" && <button type="button" className="docker-studio-secondary" disabled={runnerBusy} onClick={() => runComposeAction("validate")}>{recovery.actionLabel}</button>}
                      {recovery.action === "ps" && <button type="button" className="docker-studio-secondary" disabled={runnerBusy} onClick={() => runComposeAction("ps")}>{recovery.actionLabel}</button>}
                      {recovery.action === "logs" && <button type="button" className="docker-studio-secondary" disabled={runnerBusy} onClick={() => runComposeAction("logs", runnerResult.serviceName)}>{recovery.actionLabel}</button>}
                    </div>
                  </section>;
                })()}
                {["ps", "stats"].includes(runnerResult.action) && runnerResult.success && parseComposeStatus(runnerResult.stdout).length > 0 && <>{runnerResult.action === "ps" && (() => { const summary = summarizeContainers(parseComposeStatus(runnerResult.stdout)); return <div className="docker-studio-container-summary" aria-label="Container state summary">{[["Total", summary.total, "total"], ["Healthy", summary.healthy, "healthy"], ["Running", summary.running, "running"], ["Starting", summary.starting, "starting"], ["Unhealthy", summary.unhealthy, "unhealthy"], ["Stopped", summary.stopped, "stopped"]].map(([label, count, kind]) => <div key={label} className={"docker-studio-container-summary-item " + kind}><span>{label}</span><strong>{count}</strong></div>)}</div>; })()}{runnerResult.action === "ps" && (() => { const attention = parseComposeStatus(runnerResult.stdout).map((container) => ({ container, state: getContainerState(container), advice: getContainerAttention(container) })).filter((item) => item.advice); return attention.length > 0 ? <section className="docker-studio-health-events" aria-label="Containers needing attention"><div className="docker-studio-health-events-heading"><strong>Needs attention</strong><span>{attention.length} container{attention.length === 1 ? "" : "s"}</span></div><ul>{attention.map(({container,state,advice}, index) => <li key={container.ID || container.Id || container.Name || index}><div><strong>{container.Name || container.Service || container.ID || container.Id || "Container"}</strong><span className={"docker-studio-container-state " + state.kind}>{state.label}</span></div><b>{advice.title}</b><p>{advice.detail}</p><button type="button" className="docker-studio-secondary docker-studio-inspect-logs" disabled={runnerBusy || !(container.Service || services.some((service) => service.name === container.Name))} onClick={() => runComposeAction("logs", container.Service || container.Name)}>View service logs</button></li>)}</ul></section> : null; })()}<div className="docker-studio-status-table-wrap"><table className="docker-studio-status-table"><thead><tr><th>Container</th>{runnerResult.action === "ps" ? <><th>State</th><th>Health</th><th>Ports</th></> : <><th>CPU</th><th>Memory usage / limit</th><th>Memory %</th><th>Network I/O</th><th>Block I/O</th><th>PIDs</th></>}</tr></thead><tbody>{parseComposeStatus(runnerResult.stdout).map((container, index) => { const state = getContainerState(container); return <tr key={container.ID || container.Id || container.Name || container.Container || index}><td><strong>{container.Name || container.Service || container.ID || container.Id || container.Container || "Container"}</strong><small>{container.Image || ""}</small></td>{runnerResult.action === "ps" ? <><td><span className={"docker-studio-container-state " + state.kind}>{state.label}</span></td><td>{container.Health || container.HealthStatus || "—"}</td><td>{container.Ports || "—"}</td></> : <><td>{container.CPUPerc || container.CPU || container.CPUPercentage || "—"}</td><td>{container.MemUsage || container.MemoryUsage || "—"}</td><td>{container.MemPerc || container.MemoryPercent || "—"}</td><td>{container.NetIO || container.NetworkIO || "—"}</td><td>{container.BlockIO || "—"}</td><td>{container.PIDs || container.Pids || "—"}</td></>}</tr>; })}</tbody></table></div></>}{runnerResult.lifecycleOutput && <><strong>Lifecycle output · {runnerResult.lifecycleAction === "up" ? "Start" : "Stop"}</strong><pre>{runnerResult.lifecycleOutput}</pre></>}{runnerResult.action === "logs" && runnerResult.serviceName && <strong>Service logs · {runnerResult.serviceName}</strong>}{(!runnerResult.success || runnerResult.timedOut || runnerResult.outcomeUnknown) && <button type="button" className="docker-studio-secondary docker-studio-copy-diagnostics" disabled={runnerBusy} onClick={copyDiagnosticReport}>Copy diagnostic report</button>}{(runnerResult.stdout || runnerResult.stderr) && <pre>{[runnerResult.stdout && "STDOUT:\n" + runnerResult.stdout, runnerResult.stderr && "STDERR:\n" + runnerResult.stderr].filter(Boolean).join("\n\n")}</pre>}
              </section>}
              <div className={validation.valid && readiness.ready ? "docker-studio-preflight-status valid" : "docker-studio-preflight-status invalid"}>
                <strong>{validation.valid && readiness.ready ? "Static checks found no blocking errors" : "Review issues before deployment"}</strong>
                <span>{validation.findings.length} validation findings · {readiness.severityCounts.error} readiness errors · {readiness.severityCounts.warning} warnings</span>
              </div>
              {validation.findings.length > 0 && <ul>{validation.findings.map((finding, index) => <li key={finding.code + finding.path + index}>{finding.message} <small>({finding.path})</small></li>)}</ul>}
              {readiness.prioritizedFindings.filter((finding) => finding.severity === "error").map((finding, index) => <p key={finding.code + finding.path + index} className="docker-studio-preflight-error">{finding.message} — {finding.remediation}</p>)}
              <ol>
                <li>Export the current model as <code>compose.yaml</code>.</li>
                <li>Open a terminal in the directory containing that file.</li>
                <li>Review the configuration, environment variables, exposed ports, volumes, and secrets.</li>
                <li>Run the validation command first; only continue if it succeeds.</li>
              </ol>
              <label className="docker-studio-execution-acknowledgement">
                <input type="checkbox" checked={executionAcknowledged} onChange={(event) => setExecutionAcknowledged(event.target.checked)} />
                <span>I understand these commands run on my machine and may create or modify containers, networks, and volumes.</span>
              </label>
              {executionAcknowledged && (
                <div className="docker-studio-command-preview">
                  <strong>1. Validate configuration</strong>
                  <code>docker compose -f compose.yaml config --quiet</code>
                  <strong>2. Start services (run only after validation succeeds)</strong>
                  <code>docker compose -f compose.yaml up --detach --build</code>
                  <button type="button" className="docker-studio-secondary" onClick={() => { navigator.clipboard?.writeText("docker compose -f compose.yaml config --quiet\ndocker compose -f compose.yaml up --detach --build").then(() => setNotice("Compose command plan copied."), () => setNotice("Clipboard access unavailable. Select and copy the commands manually.")); }}>Copy command plan</button>
                </div>
              )}
              <div className="docker-studio-dialog-actions">
                <button type="button" className="docker-studio-secondary" onClick={() => setShowExecutionPreflight(false)}>Cancel</button>
                <button type="button" className="docker-studio-primary" onClick={() => { setShowExecutionPreflight(false); setNotice("Preflight reviewed. Export compose.yaml and run the reviewed commands in your local terminal; Sketchizi has not started containers."); }} disabled={!executionAcknowledged}>Acknowledge and continue</button>
              </div>
            </section>
          </div>
        )}
<footer className="docker-studio-footer"><span>Phase 1 · Docker Compose Studio</span><span>Visual editing and initial validation</span></footer>
      </section>
    </div>
  );
}
