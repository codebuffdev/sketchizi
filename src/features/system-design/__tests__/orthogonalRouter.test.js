import test from "node:test";
import assert from "node:assert/strict";
import { choosePorts, getPortPoint, getPorts, isOrthogonal, nearestPort, pointAlong, roundedPath, routeOrthogonal, PORT_STUB, getSceneViewport } from "../orthogonalRouter.js";

const rect = (x, y, width = 200, height = 84) => ({ x, y, width, height });

test("exposes four cardinal ports at edge midpoints", () => {
  const r = rect(100, 100);
  assert.deepEqual(getPorts(r).map((p) => p.port), ["top", "right", "bottom", "left"]);
  assert.deepEqual(getPortPoint(r, "top"), { x: 200, y: 100 });
  assert.deepEqual(getPortPoint(r, "right"), { x: 300, y: 142 });
  assert.deepEqual(getPortPoint(r, "bottom"), { x: 200, y: 184 });
  assert.deepEqual(getPortPoint(r, "left"), { x: 100, y: 142 });
  assert.equal(nearestPort(r, { x: 301, y: 140 }), "right");
});

test("choosePorts faces nodes toward each other by dominant axis", () => {
  assert.deepEqual(choosePorts(rect(0, 0), rect(500, 20)), { fromPort: "right", toPort: "left" });
  assert.deepEqual(choosePorts(rect(500, 0), rect(0, 20)), { fromPort: "left", toPort: "right" });
  assert.deepEqual(choosePorts(rect(0, 0), rect(20, 400)), { fromPort: "bottom", toPort: "top" });
  assert.deepEqual(choosePorts(rect(0, 400), rect(20, 0)), { fromPort: "top", toPort: "bottom" });
});

test("routes snap to the requested ports and every segment is axis-aligned", () => {
  const a = rect(0, 0);
  const cases = [
    [rect(400, 0), "right", "left"], [rect(400, 200), "right", "left"], [rect(0, 300), "bottom", "top"],
    [rect(400, 200), "right", "top"], [rect(400, 200), "bottom", "left"], [rect(-400, 0), "right", "right"],
    [rect(10, -300), "bottom", "bottom"], [rect(0, 0, 200, 84), "right", "left"],
  ];
  for (const [b, fp, tp] of cases) {
    const route = routeOrthogonal(a, fp, b, tp);
    assert.ok(isOrthogonal(route), `${fp}->${tp} orthogonal`);
    assert.deepEqual(route[0], getPortPoint(a, fp));
    assert.deepEqual(route[route.length - 1], getPortPoint(b, tp));
  }
});

test("a route leaves along the port normal by at least the stub length", () => {
  const route = routeOrthogonal(rect(0, 0), "right", rect(400, 200), "left");
  assert.equal(route[1].y, route[0].y);
  assert.ok(route[1].x - route[0].x >= PORT_STUB);
});

test("dragging a node re-routes: the end point follows the moved rect", () => {
  const a = rect(0, 0);
  const before = routeOrthogonal(a, "right", rect(400, 0), "left");
  const after = routeOrthogonal(a, "right", rect(400, 300), "left");
  assert.notDeepEqual(before, after);
  assert.deepEqual(after[after.length - 1], { x: 400, y: 342 });
  assert.ok(isOrthogonal(after));
});

test("rounded path uses quadratic corners and clamps the radius on short segments", () => {
  const d = roundedPath([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]);
  assert.match(d, /^M 0 0 L 90 0 Q 100 0 100 10 L 100 100$/);
  const tight = roundedPath([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }], 10);
  assert.match(tight, /Q 10 0 10 5/);
});

test("pointAlong places badges at the path midpoint", () => {
  assert.deepEqual(pointAlong([{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }], 0.5), { x: 100, y: 0 });
});

test("edge SVG viewport includes negative scene coordinates and routing margins", () => {
  const viewport = getSceneViewport([rect(-420, -180), rect(300, 240)]);
  assert.equal(viewport.left, -516);
  assert.equal(viewport.top, -276);
  assert.equal(viewport.width, 1116);
  assert.equal(viewport.height, 612);
  assert.equal(viewport.viewBox, "-516 -276 1116 612");
  assert.ok(viewport.left < -420 && viewport.top < -180);
});

test("empty scene receives a valid non-zero SVG viewport", () => {
  assert.deepEqual(getSceneViewport([]), {
    left: 0, top: 0, width: 1, height: 1, viewBox: "0 0 1 1",
  });
});
