// Orthogonal (elbow) routing between cardinal ports. Pure scene-coordinate math.

export const PORTS = ["top", "right", "bottom", "left"];
const DIRECTION = {
  top: { x: 0, y: -1 },
  right: { x: 1, y: 0 },
  bottom: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
};
export const OPPOSITE_PORT = { top: "bottom", bottom: "top", left: "right", right: "left" };
export const PORT_STUB = 24;
export const CORNER_RADIUS = 10;

/** SVG viewport covering the complete scene bounds, including negative blueprint coordinates. */
export function getSceneViewport(nodes, margin = 96) {
  if (!nodes?.length) return { left: 0, top: 0, width: 1, height: 1, viewBox: "0 0 1 1" };
  const minX = Math.min(...nodes.map((node) => node.x)) - margin;
  const minY = Math.min(...nodes.map((node) => node.y)) - margin;
  const maxX = Math.max(...nodes.map((node) => node.x + node.width)) + margin;
  const maxY = Math.max(...nodes.map((node) => node.y + node.height)) + margin;
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);
  return { left: minX, top: minY, width, height, viewBox: `${minX} ${minY} ${width} ${height}` };
}

export function getPortPoint(rect, port) {
  const { x, y, width, height } = rect;
  switch (port) {
    case "top": return { x: x + width / 2, y };
    case "right": return { x: x + width, y: y + height / 2 };
    case "bottom": return { x: x + width / 2, y: y + height };
    case "left": return { x, y: y + height / 2 };
    default: throw new Error(`Unknown port: ${port}`);
  }
}

export function getPorts(rect) {
  return PORTS.map((port) => ({ port, ...getPortPoint(rect, port) }));
}

/** Nearest cardinal port of `rect` to a scene point (for snapping a dropped connector end). */
export function nearestPort(rect, point) {
  let best = null;
  for (const entry of getPorts(rect)) {
    const distance = Math.hypot(entry.x - point.x, entry.y - point.y);
    if (!best || distance < best.distance) best = { port: entry.port, distance };
  }
  return best.port;
}

/** Best port pair from relative position: dominant axis decides, so lines leave facing each other. */
export function choosePorts(fromRect, toRect) {
  const fc = { x: fromRect.x + fromRect.width / 2, y: fromRect.y + fromRect.height / 2 };
  const tc = { x: toRect.x + toRect.width / 2, y: toRect.y + toRect.height / 2 };
  const dx = tc.x - fc.x;
  const dy = tc.y - fc.y;
  if (Math.abs(dx) >= Math.abs(dy)) return dx >= 0 ? { fromPort: "right", toPort: "left" } : { fromPort: "left", toPort: "right" };
  return dy >= 0 ? { fromPort: "bottom", toPort: "top" } : { fromPort: "top", toPort: "bottom" };
}

function dedupe(points) {
  const out = [];
  for (const point of points) {
    const last = out[out.length - 1];
    if (last && Math.abs(last.x - point.x) < 0.01 && Math.abs(last.y - point.y) < 0.01) continue;
    out.push(point);
  }
  // Drop collinear middle points.
  return out.filter((point, index) => {
    if (index === 0 || index === out.length - 1) return true;
    const a = out[index - 1];
    const b = out[index + 1];
    return !((a.x === point.x && point.x === b.x) || (a.y === point.y && point.y === b.y));
  });
}

/**
 * Route between two rects leaving/entering through cardinal ports.
 * Every segment is horizontal or vertical; the first and last segments run along the port normals.
 */
export function routeOrthogonal(fromRect, fromPort, toRect, toPort, stub = PORT_STUB) {
  const start = getPortPoint(fromRect, fromPort);
  const end = getPortPoint(toRect, toPort);
  const d1 = DIRECTION[fromPort];
  const d2 = DIRECTION[toPort];
  const s1 = { x: start.x + d1.x * stub, y: start.y + d1.y * stub };
  const s2 = { x: end.x + d2.x * stub, y: end.y + d2.y * stub };
  const horizontal1 = d1.x !== 0;
  const horizontal2 = d2.x !== 0;
  const mid = [];

  if (horizontal1 && horizontal2) {
    const facing = d1.x * (s2.x - s1.x) > 0 && d1.x !== d2.x;
    if (facing || s1.x === s2.x) {
      const midX = (s1.x + s2.x) / 2;
      mid.push({ x: midX, y: s1.y }, { x: midX, y: s2.y });
    } else {
      // Same side / backtracking: wrap around both rects.
      const wrapX = d1.x > 0 ? Math.max(s1.x, s2.x) : Math.min(s1.x, s2.x);
      mid.push({ x: wrapX, y: s1.y }, { x: wrapX, y: s2.y });
    }
  } else if (!horizontal1 && !horizontal2) {
    const facing = d1.y * (s2.y - s1.y) > 0 && d1.y !== d2.y;
    if (facing || s1.y === s2.y) {
      const midY = (s1.y + s2.y) / 2;
      mid.push({ x: s1.x, y: midY }, { x: s2.x, y: midY });
    } else {
      const wrapY = d1.y > 0 ? Math.max(s1.y, s2.y) : Math.min(s1.y, s2.y);
      mid.push({ x: s1.x, y: wrapY }, { x: s2.x, y: wrapY });
    }
  } else if (horizontal1) {
    mid.push({ x: s2.x, y: s1.y });
  } else {
    mid.push({ x: s1.x, y: s2.y });
  }

  return dedupe([start, s1, ...mid, s2, end]);
}

export function isOrthogonal(points) {
  return points.every((point, i) => i === 0 || point.x === points[i - 1].x || point.y === points[i - 1].y);
}

/** SVG path with rounded elbow corners (radius clamped to half of each adjacent segment). */
export function roundedPath(points, radius = CORNER_RADIUS) {
  if (points.length < 2) return "";
  let path = `M ${points[0].x} ${points[0].y}`;
  for (let i = 1; i < points.length - 1; i += 1) {
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    const inLen = Math.hypot(cur.x - prev.x, cur.y - prev.y);
    const outLen = Math.hypot(next.x - cur.x, next.y - cur.y);
    const r = Math.min(radius, inLen / 2, outLen / 2);
    const a = { x: cur.x - Math.sign(cur.x - prev.x) * r, y: cur.y - Math.sign(cur.y - prev.y) * r };
    const b = { x: cur.x + Math.sign(next.x - cur.x) * r, y: cur.y + Math.sign(next.y - cur.y) * r };
    path += ` L ${a.x} ${a.y} Q ${cur.x} ${cur.y} ${b.x} ${b.y}`;
  }
  const last = points[points.length - 1];
  return `${path} L ${last.x} ${last.y}`;
}

export function pathLength(points) {
  return points.reduce((sum, point, i) => (i === 0 ? 0 : sum + Math.hypot(point.x - points[i - 1].x, point.y - points[i - 1].y)), 0);
}

/** Point at fraction t (0..1) along a polyline. Used to place badges and animated packets. */
export function pointAlong(points, t) {
  const total = pathLength(points);
  if (total === 0) return { ...points[0] };
  let target = Math.min(1, Math.max(0, t)) * total;
  for (let i = 1; i < points.length; i += 1) {
    const seg = Math.hypot(points[i].x - points[i - 1].x, points[i].y - points[i - 1].y);
    if (target <= seg) {
      const f = seg === 0 ? 0 : target / seg;
      return { x: points[i - 1].x + (points[i].x - points[i - 1].x) * f, y: points[i - 1].y + (points[i].y - points[i - 1].y) * f };
    }
    target -= seg;
  }
  return { ...points[points.length - 1] };
}

export function snapToGrid(value, size) {
  return size > 0 ? Math.round(value / size) * size : value;
}
