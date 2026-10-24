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
      `Action: ${runnerResult.action || "unknown"}`,
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
