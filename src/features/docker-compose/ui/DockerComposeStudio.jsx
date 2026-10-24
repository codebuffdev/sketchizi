import { useMemo, useState } from "react";
import { exportComposeYaml, validateComposeDocument } from "../composeDocumentService.js";
import "./docker-compose-studio.css";

function emptyService() {
  return { image: "", buildContext: "", portsText: "", environmentText: "", dependsText: "", volumesText: "", networksText: "", healthcheckText: "", restart: "unless-stopped" };
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
  const networks = Object.fromEntries(parseLines(networkNames).map((name) => [name, {}]));\n  return { name: name.trim(), services: normalized, volumes, networks };
}

export default function DockerComposeStudio({ onClose }) {
  const [projectName, setProjectName] = useState("my-compose-project");
  const [services, setServices] = useState([{ name: "web", ...emptyService() }]);
  const [selectedId, setSelectedId] = useState("web");\n  const [volumeNames, setVolumeNames] = useState("");\n  const [networkNames, setNetworkNames] = useState("");
  const [notice, setNotice] = useState("");
  const selected = services.find((service) => service.name === selectedId) || services[0];
  const composeDocument = useMemo(() => toDocument(projectName, services, volumeNames, networkNames), [projectName, services, volumeNames, networkNames]);
  const validation = useMemo(() => validateComposeDocument(composeDocument), [composeDocument]);

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
  const downloadYaml = () => {
    if (!validation.valid) {
      setNotice("Fix the validation errors before exporting.");
      return;
    }
    const blob = new Blob([exportComposeYaml(composeDocument)], { type: "text/yaml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "compose.yaml";
    anchor.click();
    URL.revokeObjectURL(url);
    setNotice("compose.yaml exported.");
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
          <label>Named volumes <span>One volume name per line</span><textarea value={volumeNames} onChange={(event) => setVolumeNames(event.target.value)} placeholder={"database-data\\nuploads"} rows={2} /></label>
          <label>Networks <span>One network name per line</span><textarea value={networkNames} onChange={(event) => setNetworkNames(event.target.value)} placeholder={"frontend\\nbackend"} rows={2} /></label>
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
                  <label>Mounted volumes <span>source:target, one per line</span><textarea value={selected.volumesText} onChange={(event) => updateSelected({ volumesText: event.target.value })} placeholder={"database-data:/var/lib/data\\n./config:/app/config:ro"} rows={3} /></label>
                  <label>Networks <span>Declared network names, one per line</span><textarea value={selected.networksText} onChange={(event) => updateSelected({ networksText: event.target.value })} placeholder={"frontend\\nbackend"} rows={2} /></label>
                  <label>Health check <span>Command, interval, retries (one per line)</span><textarea value={selected.healthcheckText} onChange={(event) => updateSelected({ healthcheckText: event.target.value })} placeholder={"curl -f http://localhost/health || exit 1\\n30s\\n3"} rows={3} /></label>
                  <label>Restart policy<select value={selected.restart} onChange={(event) => updateSelected({ restart: event.target.value })}><option value="unless-stopped">unless-stopped</option><option value="always">always</option><option value="on-failure">on-failure</option><option value="no">no</option></select></label>
                </div>
              </>
            ) : <p>Add a service to start designing your Compose project.</p>}
          </div>

          <aside className="docker-studio-validation">
            <div className="docker-studio-section-heading"><span>Validation</span><span className={validation.valid ? "docker-studio-status valid" : "docker-studio-status invalid"}>{validation.valid ? "Ready" : "Issues"}</span></div>
            {validation.findings.length ? validation.findings.map((finding, index) => <div key={finding.code + finding.path + index} className={`docker-studio-finding ${finding.severity}`}><strong>{finding.message}</strong><small>{finding.path}</small><p>{finding.remediation}</p></div>) : <div className="docker-studio-empty-check"><span aria-hidden="true">✓</span><strong>No issues found</strong><p>Your current Compose model passes the initial checks.</p></div>}
            {notice && <p className="docker-studio-notice" role="status">{notice}</p>}
          </aside>
        </div>
        <footer className="docker-studio-footer"><span>Phase 1 · Docker Compose Studio</span><span>Visual editing and initial validation</span></footer>
      </section>
    </div>
  );
}
