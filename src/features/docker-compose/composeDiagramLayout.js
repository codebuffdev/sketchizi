// Pure layout planner for editable Compose architecture diagrams.
// Edges point from a service to the service it declares in depends_on.
export function planComposeDiagram(document) {
  const services = Object.entries(document?.services || {});
  const names = new Set(services.map(([name]) => name));
  const dependencies = (service) => Array.isArray(service?.depends_on) ? service.depends_on : Object.keys(service?.depends_on || {});
  const levels = new Map();
  const visiting = new Set();
  function level(name) {
    if (levels.has(name)) return levels.get(name);
    if (visiting.has(name)) return 0;
    visiting.add(name);
    const deps = dependencies(document.services[name]).filter((dep) => names.has(dep));
    const result = deps.length ? 1 + Math.max(...deps.map(level)) : 0;
    visiting.delete(name);
    levels.set(name, result);
    return result;
  }
  services.forEach(([name]) => level(name));
  const maxLevel = Math.max(0, ...levels.values());
  const groups = new Map();
  services.forEach(([name]) => {
    const column = maxLevel - levels.get(name);
    if (!groups.has(column)) groups.set(column, []);
    groups.get(column).push(name);
  });
  const cardWidth = 300, cardHeight = 154, gapX = 120, gapY = 38;
  const left = 170, top = 220;
  const positions = new Map();
  for (const [column, group] of groups) {
    group.forEach((name, row) => positions.set(name, { x: left + column * (cardWidth + gapX), y: top + row * (cardHeight + gapY) }));
  }
  const edges = services.flatMap(([name, service]) => dependencies(service).filter((dep) => names.has(dep) && dep !== name).map((dep) => ({ from: name, to: dep })));
  const networks = new Map();
  const volumes = new Map();
  for (const [name, service] of services) {
    const declared = service.networks ? (Array.isArray(service.networks) ? service.networks : Object.keys(service.networks)) : ["default"];
    declared.forEach((network) => { if (!networks.has(network)) networks.set(network, []); networks.get(network).push(name); });
    (Array.isArray(service.volumes) ? service.volumes : []).forEach((mount) => {
      const source = typeof mount === "string" ? mount.split(":")[0] : mount?.source;
      if (!source || source.startsWith("/") || source.startsWith(".")) return;
      if (!volumes.has(source)) volumes.set(source, []);
      volumes.get(source).push(name);
    });
  }
  const rows = Math.max(1, ...[...groups.values()].map((group) => group.length));
  const resources = [
    ...networks.entries().map(([name, members]) => ({ name, kind: "NETWORK", members })),
    ...volumes.entries().map(([name, members]) => ({ name, kind: "VOLUME", members }))
  ];
  const resourceWidth = 260, resourceHeight = 62, resourceGap = 16;
  const resourceTop = top + rows * (cardHeight + gapY) + 34;
  const resourceColumns = Math.min(4, Math.max(1, resources.length));
  const resourceRows = Math.ceil(resources.length / resourceColumns);
  const width = Math.max((maxLevel + 1) * (cardWidth + gapX) - gapX, resourceColumns * (resourceWidth + resourceGap) - resourceGap) + 110;
  const height = resourceTop - top + (resources.length ? resourceRows * (resourceHeight + 12) : 0) + 50;
  return { positions, edges, resources, cardWidth, cardHeight, left, top, resourceTop, resourceWidth, resourceHeight, resourceGap, width, height };
}

export function composeCardDetails(service) {
  const image = service?.image || (typeof service?.build === "string" ? "Build: " + service.build : service?.build?.context ? "Build: " + service.build.context : "Image not specified");
  const ports = (Array.isArray(service?.ports) ? service.ports : []).map((port) => typeof port === "string" ? port : [port?.published, port?.target].filter(Boolean).join(" → "));
  const envCount = Array.isArray(service?.environment) ? service.environment.length : Object.keys(service?.environment || {}).length;
  const details = [String(image), ports.length ? "Ports: " + ports.slice(0, 2).join(", ") : "", envCount ? envCount + " environment variables" : ""].filter(Boolean);
  return details.map((detail) => detail.length > 37 ? detail.slice(0, 34) + "…" : detail);
}
