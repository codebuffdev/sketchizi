import { routeOrthogonal, roundedPath, pointAlong } from "./orthogonalRouter.js";
import { formatRps, nodeCapacity } from "./trafficSimulator.js";
import { nodeFacets, serviceNames } from "./yamlPreview.js";

const escapeXml = (value) => String(value ?? "").replace(/[&<>"']/g, (char) => ({
  "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;",
}[char]));
const number = (value, fallback = 0) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const STATUS = {
  healthy: "#22c55e", elevated: "#f59e0b", degraded: "#f59e0b",
  overloaded: "#f97316", lagging: "#f97316", down: "#ef4444",
};
const ACCENTS = {
  blue: "#60a5fa", violet: "#a78bfa", green: "#34d399", orange: "#fb923c",
  cyan: "#22d3ee", pink: "#f472b6", slate: "#94a3b8", amber: "#fbbf24",
};

export function buildSystemDesignSvg({
  nodes = [], edges = [], simulation = null, mode = "canvas",
  background = "dark", darkMode = background === "dark", padding = 24,
} = {}) {
  const safeNodes = (nodes || []).filter((node) => node && Number.isFinite(Number(node.x)) && Number.isFinite(Number(node.y)));
  if (!safeNodes.length) return "";
  const byId = new Map(safeNodes.map((node) => [node.id, node]));
  const minX = Math.min(...safeNodes.map((node) => node.x));
  const minY = Math.min(...safeNodes.map((node) => node.y));
  const maxX = Math.max(...safeNodes.map((node) => node.x + Math.max(1, number(node.width, 204))));
  const maxY = Math.max(...safeNodes.map((node) => node.y + Math.max(1, number(node.height, 88))));
  const bounds = { x: minX - padding, y: minY - padding, width: maxX - minX + padding * 2, height: maxY - minY + padding * 2 };
  const surface = background === "transparent" ? "none" : darkMode ? "#12141c" : "#ffffff";
  const card = darkMode ? "#202633" : "#ffffff";
  const border = darkMode ? "#3b4658" : "#d6deea";
  const primary = darkMode ? "#f8fafc" : "#172033";
  const secondary = darkMode ? "#a7b3c5" : "#64748b";
  const routes = (edges || []).filter((edge) => byId.has(edge.from) && byId.has(edge.to)).map((edge) => {
    const from = byId.get(edge.from), to = byId.get(edge.to);
    const points = routeOrthogonal(from, edge.fromPort || "right", to, edge.toPort || "left");
    return { edge, points, path: roundedPath(points) };
  });
  const names = serviceNames(safeNodes);
  const edgeMarkup = routes.map(({ edge, points, path }) => {
    const mid = pointAlong(points, 0.5);
    const badge = escapeXml(edge.protocol || "HTTPS");
    return `<g data-edge-id="${escapeXml(edge.id)}"><path d="${path}" fill="none" stroke="${darkMode ? "#94a3b8" : "#64748b"}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" ${edge.lineStyle === "dashed" ? 'stroke-dasharray="7 5"' : ""}/><path d="${path}" fill="none" stroke="${darkMode ? "#94a3b8" : "#64748b"}" stroke-width="2.5" marker-end="url(#sd-arrow)"/><rect x="${mid.x - Math.max(24, badge.length * 4.2)}" y="${mid.y - 12}" width="${Math.max(48, badge.length * 8.4)}" height="24" rx="7" fill="${darkMode ? "#303b4c" : "#eef2f7"}" stroke="${border}"/><text x="${mid.x}" y="${mid.y + 4}" text-anchor="middle" font-size="10" font-weight="700" fill="${primary}">${badge}</text></g>`;
  }).join("");
  const nodeMarkup = safeNodes.map((node) => {
    const w = Math.max(1, number(node.width, 204)), h = Math.max(1, number(node.height, 88));
    const accent = ACCENTS[node.accent] || ACCENTS.blue;
    const telemetry = simulation?.nodes?.[node.id];
    const status = telemetry?.status || (node.health === "down" ? "down" : node.health === "degraded" ? "elevated" : "healthy");
    const statusColor = STATUS[status] || STATUS.healthy;
    const facets = nodeFacets(node, mode, names);
    const title = escapeXml(node.label || node.kind || "Component");
    const subtitle = escapeXml(facets.sub || node.subtitle || "");
    const icon = escapeXml((node.customIcon?.name || node.kind || "S").slice(0, 1).toUpperCase());
    const customIcon = node.customIcon?.src
      ? `<image href="${escapeXml(node.customIcon.src)}" x="${node.x + 13}" y="${node.y + top - 12}" width="24" height="24" preserveAspectRatio="xMidYMid meet"/>`
      : node.customIcon?.svgPath
        ? `<path d="${escapeXml(node.customIcon.svgPath)}" transform="translate(${node.x + 13} ${node.y + top - 12}) scale(.9)" fill="${accent}"/>`
        : "";
    const rps = telemetry ? formatRps(telemetry.incomingRps) : "—";
    const p95 = telemetry?.p95Ms != null ? `${telemetry.p95Ms}ms` : "—";
    const util = telemetry ? (Number.isFinite(telemetry.utilization) ? `${Math.round(telemetry.utilization * 100)}%` : "∞") : "—";
    const cap = nodeCapacity(node);
    const titleSize = w >= 340 ? 17 : w >= 250 ? 15 : 13;
    const top = Math.max(30, Math.min(42, h * 0.42));
    return `<g data-node-id="${escapeXml(node.id)}"><rect x="${node.x}" y="${node.y}" width="${w}" height="${h}" rx="13" fill="${card}" stroke="${border}" stroke-width="1.5"/><path d="M ${node.x + 13} ${node.y + 2} H ${node.x + w - 13}" stroke="${accent}" stroke-width="4" stroke-linecap="round"/><circle cx="${node.x + 25}" cy="${node.y + top}" r="13" fill="${accent}" fill-opacity=".18"/>${customIcon || `<text x="${node.x + 25}" y="${node.y + top + 5}" text-anchor="middle" font-size="13" font-weight="800" fill="${accent}">${icon}</text>`}<text x="${node.x + 47}" y="${node.y + top - 2}" font-size="${titleSize}" font-weight="700" fill="${primary}">${title}</text><circle cx="${node.x + w - 15}" cy="${node.y + 18}" r="4" fill="${statusColor}"/><text x="${node.x + 47}" y="${node.y + top + 17}" font-size="10.5" fill="${secondary}">${subtitle}</text><path d="M ${node.x + 12} ${node.y + h - 28} H ${node.x + w - 12}" stroke="${border}"/><text x="${node.x + 14}" y="${node.y + h - 11}" font-size="9.5" fill="${secondary}">RPS <tspan fill="${primary}" font-weight="700">${escapeXml(rps)}</tspan></text><text x="${node.x + w * .43}" y="${node.y + h - 11}" font-size="9.5" fill="${secondary}">p95 <tspan fill="${primary}" font-weight="700">${escapeXml(p95)}</tspan></text><text x="${node.x + w - 45}" y="${node.y + h - 11}" font-size="9.5" fill="${secondary}">Util <tspan fill="${primary}" font-weight="700">${escapeXml(util)}</tspan></text><title>${title} · ${escapeXml(formatRps(cap))} RPS capacity</title></g>`;
  }).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${bounds.width}" height="${bounds.height}" viewBox="${bounds.x} ${bounds.y} ${bounds.width} ${bounds.height}" role="img" aria-label="System Design architecture diagram"><defs><marker id="sd-arrow" markerWidth="9" markerHeight="9" refX="7" refY="3" orient="auto"><path d="M0 0 L0 6 L8 3 z" fill="${darkMode ? "#94a3b8" : "#64748b"}"/></marker></defs>${surface !== "none" ? `<rect x="${bounds.x}" y="${bounds.y}" width="${bounds.width}" height="${bounds.height}" fill="${surface}"/>` : ""}${edgeMarkup}${nodeMarkup}</svg>`;
}

export function svgToCanvas(svgString, scale = 1) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = Math.ceil(image.naturalWidth * scale);
      canvas.height = Math.ceil(image.naturalHeight * scale);
      const context = canvas.getContext("2d");
      if (!context) { URL.revokeObjectURL(url); reject(new Error("Canvas is unavailable")); return; }
      context.scale(scale, scale);
      context.drawImage(image, 0, 0);
      URL.revokeObjectURL(url);
      resolve(canvas);
    };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Unable to render System Design SVG")); };
    image.src = url;
  });
}

export async function exportSystemDesignImage(options = {}) {
  const svg = buildSystemDesignSvg(options);
  if (!svg) throw new Error("No System Design nodes to export");
  if (options.format === "svg") return new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
  const canvas = await svgToCanvas(svg, options.scale || 1);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("Unable to encode PNG")), "image/png"));
}
