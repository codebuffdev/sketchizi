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
  const cardWidth = 272, cardHeight = 118, gapX = 76, gapY = 34;
  const left = 170, top = 180;
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
  const resourceWidth = 210, resourceHeight = 58, resourceGap = 22;
  const resourceTop = top + rows * (cardHeight + gapY) + 48;
  // Put each resource beneath its members, avoiding a disconnected left-aligned legend.
  const resourcePositions = new Map();
  const placed = [];
  for (const resource of resources) {
    const memberCenters = resource.members.map((name) => positions.get(name)).filter(Boolean).map((pos) => pos.x + cardWidth / 2);
    const preferred = memberCenters.length ? memberCenters.reduce((a, b) => a + b, 0) / memberCenters.length - resourceWidth / 2 : left;
    let x = Math.max(left, preferred), y = resourceTop + (resource.kind === "VOLUME" ? 76 : 0);
    while (placed.some((pos) => Math.abs(pos.y - y) < resourceHeight + 8 && Math.abs(pos.x - x) < resourceWidth + resourceGap)) y += resourceHeight + 18;
    resourcePositions.set(resource.kind + ":" + resource.name, { x, y });
    placed.push({ x, y });
  }
  const maxServiceRight = Math.max(left + cardWidth, ...[...positions.values()].map((pos) => pos.x + cardWidth));
  const maxResourceRight = Math.max(left, ...placed.map((pos) => pos.x + resourceWidth));
  const maxResourceBottom = Math.max(top + cardHeight, ...placed.map((pos) => pos.y + resourceHeight));
  const width = Math.max(maxServiceRight, maxResourceRight) - left + 90;
  const height = maxResourceBottom - top + 88;
  return { positions, edges, resources, resourcePositions, cardWidth, cardHeight, left, top, resourceTop, resourceWidth, resourceHeight, resourceGap, width, height };
}

export function composeCardDetails(service) {
  const image = service?.image || (typeof service?.build === "string" ? "Build: " + service.build : service?.build?.context ? "Build: " + service.build.context : "Image not specified");
  const ports = (Array.isArray(service?.ports) ? service.ports : []).map((port) => typeof port === "string" ? port : [port?.published, port?.target].filter(Boolean).join(" → "));
  const envCount = Array.isArray(service?.environment) ? service.environment.length : Object.keys(service?.environment || {}).length;
  const details = [String(image), ports.length ? "Ports: " + ports.slice(0, 2).join(", ") : "", envCount ? envCount + " environment variables" : ""].filter(Boolean);
  return details.map((detail) => detail.length > 37 ? detail.slice(0, 34) + "…" : detail);
}
