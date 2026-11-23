import test from "node:test";
import assert from "node:assert/strict";
import { parseDocument } from "yaml";
import {
  buildComposeCanvasState,
  composeCanvasStateToDocument,
  composeCanvasStateToYaml,
  parseComposeYaml,
  roundTripComposeYaml,
} from "../src/features/docker-compose/composeYamlModel.js";
import { exportComposeYaml, validateComposeDocument } from "../src/features/docker-compose/composeDocumentService.js";
import { composeCardDetails, planComposeDiagram } from "../src/features/docker-compose/composeDiagramLayout.js";
import { convertComposeToKubernetes } from "../src/features/docker-compose/composeToKubernetes.js";
import { namedVolumeSource, parseHostPort } from "../src/features/docker-compose/composeMountSource.js";

const STACK = `name: shop
x-common: &common
  restart: unless-stopped
  logging:
    driver: json-file
    options:
      max-size: "10m"
services:
  web:
    <<: *common
    image: nginx:1.27
    ports:
      - "8080:80"
      - "127.0.0.1:8443:443/tcp"
      - target: 9000
        published: 9000
        protocol: tcp
    environment:
      API_URL: http://api:3000
      DEBUG: true
      RETRIES: 3
      EMPTY: ""
    depends_on:
      api:
        condition: service_healthy
    networks:
      - frontend
    volumes:
      - ./nginx.conf:/etc/nginx/nginx.conf:ro
      - static:/usr/share/nginx/html
  api:
    <<: *common
    build:
      context: ./api
      args:
        NODE_ENV: production
    environment:
      - DATABASE_URL=postgres://app:secret@db:5432/app
      - FEATURE_FLAGS=a=b,c=d
      - OPTIONAL_TOKEN
    depends_on: [db, cache]
    networks:
      frontend:
        aliases: [backend]
      backend: {}
    healthcheck:
      test: ["CMD-SHELL", "curl -f http://localhost:3000/health || exit 1"]
      interval: 30s
      retries: 3
    command: ["node", "server.js", "--port", "3000"]
  db:
    image: postgres:17
    networks: [backend]
    volumes:
      - db-data:/var/lib/postgresql/data
      - type: volume
        source: db-backups
        target: /backups
    environment:
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    secrets: [db_password]
  cache:
    image: redis:7
    networks: [backend]
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
volumes:
  static:
  db-data:
    driver: local
  db-backups: {}
networks:
  frontend:
  backend:
    internal: true
secrets:
  db_password:
    file: ./secrets/db_password.txt
x-empty: {}
`;

const toJS = (yaml) => parseDocument(yaml, { merge: true, uniqueKeys: true }).toJS();

test("parses a multi-service Compose file with anchors, networks, volumes and depends_on", () => {
  const result = parseComposeYaml(STACK);
  assert.equal(result.error, "");
  assert.deepEqual(Object.keys(result.document.services), ["web", "api", "db", "cache"]);
  // The <<: *common merge key is expanded rather than kept as a literal "<<" key.
  assert.equal(result.document.services.web.restart, "unless-stopped");
  assert.equal(Object.hasOwn(result.document.services.web, "<<"), false);
  assert.equal(validateComposeDocument(result.document).valid, true, JSON.stringify(validateComposeDocument(result.document).findings));
});

test("round trip YAML -> canvas state -> YAML preserves every field of a realistic stack", () => {
  const { parsed, yaml } = roundTripComposeYaml(STACK);
  assert.deepEqual(toJS(yaml), parsed.document);
  const exported = toJS(yaml);
  // Spot-check the relationships and fields the task calls out.
  assert.deepEqual(exported.services.web.depends_on, { api: { condition: "service_healthy" } });
  assert.deepEqual(exported.services.api.depends_on, ["db", "cache"]);
  assert.deepEqual(exported.services.api.networks, { frontend: { aliases: ["backend"] }, backend: {} });
  assert.deepEqual(exported.services.db.volumes[1], { type: "volume", source: "db-backups", target: "/backups" });
  assert.deepEqual(exported.volumes.static, null);
  assert.deepEqual(exported.volumes["db-data"], { driver: "local" });
  assert.deepEqual(exported.networks.backend, { internal: true });
  assert.deepEqual(exported.secrets, { db_password: { file: "./secrets/db_password.txt" } });
  assert.deepEqual(exported["x-empty"], {});
  assert.equal(exported.name, "shop");
});

test("environment values keep their types and special characters", () => {
  const exported = roundTripComposeYaml(STACK).parsed.document;
  const again = toJS(roundTripComposeYaml(STACK).yaml);
  assert.strictEqual(again.services.web.environment.DEBUG, true);
  assert.strictEqual(again.services.web.environment.RETRIES, 3);
  assert.strictEqual(again.services.web.environment.EMPTY, "");
  assert.deepEqual(again.services.api.environment, exported.services.api.environment);
  assert.ok(again.services.api.environment.includes("FEATURE_FLAGS=a=b,c=d"));
  assert.ok(again.services.api.environment.includes("OPTIONAL_TOKEN"));
});

test("export is stable: a second round trip produces identical YAML and top-level key order", () => {
  const first = roundTripComposeYaml(STACK).yaml;
  const second = roundTripComposeYaml(first).yaml;
  assert.equal(second, first);
  assert.deepEqual(Object.keys(toJS(first)), Object.keys(parseComposeYaml(STACK).document));
});

test("canvas state records dependency edges and network/volume membership", () => {
  const state = buildComposeCanvasState(parseComposeYaml(STACK).document);
  assert.deepEqual(state.edges.map(({ from, to }) => `${from}>${to}`).sort(), ["service:api>service:cache", "service:api>service:db", "service:web>service:api"]);
  const members = (id) => state.nodes.find((node) => node.id === id).members;
  assert.deepEqual(members("network:frontend"), ["web", "api"]);
  assert.deepEqual(members("network:backend").sort(), ["api", "cache", "db"]);
  assert.deepEqual(members("volume:db-data"), ["db"]);
  assert.deepEqual(members("volume:db-backups"), ["db"], "long-form named volumes are linked too");
  assert.ok(!state.nodes.some((node) => node.id.includes("nginx.conf")), "bind mounts are not named volumes");
  assert.ok(state.nodes.filter((node) => node.type === "service").every((node) => Number.isFinite(node.x) && Number.isFinite(node.y)));
});

test("editing a service on the canvas state flows through to the exported YAML", () => {
  const state = buildComposeCanvasState(parseComposeYaml(STACK).document);
  state.nodes.find((node) => node.id === "service:cache").definition.image = "redis:7.4";
  const exported = toJS(composeCanvasStateToYaml(state));
  assert.equal(exported.services.cache.image, "redis:7.4");
  assert.equal(exported.services.db.image, "postgres:17");
});

test("declared-but-unused networks and volumes survive the round trip", () => {
  const { yaml } = roundTripComposeYaml(`services:
  app:
    image: app:1
volumes:
  orphan-data:
networks:
  unused:
    driver: bridge
`);
  const exported = toJS(yaml);
  assert.ok(Object.hasOwn(exported.volumes, "orphan-data"));
  assert.deepEqual(exported.networks.unused, { driver: "bridge" });
});

test("a bare `volumes: name:` declaration is not flagged as invalid", () => {
  const { findings } = validateComposeDocument(parseComposeYaml("services:\n  a:\n    image: a:1\n    volumes: [\"d:/x\"]\nvolumes:\n  d:\n").document);
  assert.equal(findings.some((finding) => finding.code === "COMPOSE_INVALID_RESOURCE"), false);
});

test("optional and empty fields never crash the planner, card details, validator or converter", () => {
  const sparse = parseComposeYaml(`services:
  empty:
  nulls:
    image: app:1
    depends_on:
    networks:
    volumes:
    ports:
    environment:
    healthcheck:
  host:
    image: app:1
    network_mode: host
  strings:
    image: app:1
    environment: not-a-collection
`);
  assert.equal(sparse.error, "");
  assert.ok(sparse.warnings.some((warning) => warning.code === "COMPOSE_EMPTY_SERVICE"));
  assert.doesNotThrow(() => planComposeDiagram(sparse.document));
  assert.doesNotThrow(() => buildComposeCanvasState(sparse.document));
  assert.doesNotThrow(() => Object.values(sparse.document.services).forEach((service) => composeCardDetails(service)));
  assert.doesNotThrow(() => validateComposeDocument(sparse.document));
  assert.doesNotThrow(() => convertComposeToKubernetes(sparse.document));
  const plan = planComposeDiagram(sparse.document);
  assert.equal(plan.positions.size, 4);
  assert.deepEqual(plan.resources.find((item) => item.name === "default").members, ["empty", "nulls", "strings"], "network_mode: host services join no Compose network");
  assert.equal(validateComposeDocument(undefined).valid, false);
  assert.doesNotThrow(() => validateComposeDocument(null));
});

test("empty and sparse containers round trip without producing invalid YAML", () => {
  const document = { services: { a: { image: "a:1", command: [], labels: {}, ports: [{}], cap_add: [[]] } } };
  const yaml = exportComposeYaml(document);
  const reparsed = parseDocument(yaml);
  assert.equal(reparsed.errors.length, 0, reparsed.errors.map((error) => error.message).join("; "));
  assert.deepEqual(reparsed.toJS().services, document.services);
});

test("exporter handles awkward keys, multi-line strings and non-finite numbers", () => {
  const document = { services: { a: { image: "a:1", labels: { "com.example/team": "infra", "true": "x", "0123": "y", "with space": "z" }, environment: { MOTD: "line1\nline2\ttabbed", QUOTE: 'say "hi"', LIMIT: Number.POSITIVE_INFINITY, GONE: undefined } } } };
  const exported = toJS(exportComposeYaml(document));
  assert.equal(exported.services.a.labels["com.example/team"], "infra");
  assert.equal(exported.services.a.labels.true, "x");
  assert.equal(exported.services.a.labels["0123"], "y");
  assert.equal(exported.services.a.labels["with space"], "z");
  assert.equal(exported.services.a.environment.MOTD, "line1\nline2\ttabbed");
  assert.equal(exported.services.a.environment.QUOTE, 'say "hi"');
  assert.equal(exported.services.a.environment.LIMIT, Infinity);
  assert.equal(Object.hasOwn(exported.services.a.environment, "GONE"), false);
});

test("port parsing accepts ranges, IPv6 and substitutions without false errors", () => {
  assert.deepEqual(parseHostPort("8000-8010:80"), { kind: "range", value: "8000-8010" });
  assert.deepEqual(parseHostPort("[::1]:8080:80/tcp"), { kind: "single", value: "8080" });
  assert.equal(parseHostPort("${PORT:-8080}:80").kind, "none");
  assert.equal(parseHostPort("abc:80").kind, "invalid");
  const { findings } = validateComposeDocument({ services: { a: { image: "a:1", ports: ["8000-8010:80", "${PORT:-9000}:90", "127.0.0.1:7000:70"] } } });
  assert.equal(findings.filter((finding) => /PORT/.test(finding.code)).length, 0);
  const bad = validateComposeDocument({ services: { a: { image: "a:1", ports: ["99999:80", "9010-9000:80", "web:80"], } } }).findings.map((finding) => finding.code);
  assert.deepEqual(bad.sort(), ["COMPOSE_HOST_PORT_OUT_OF_RANGE", "COMPOSE_INVALID_HOST_PORT", "COMPOSE_INVALID_HOST_PORT"]);
});

test("Windows paths, home paths and substitutions are not mistaken for named volumes", () => {
  assert.equal(namedVolumeSource("C:\\data:/data"), "");
  assert.equal(namedVolumeSource("~/cache:/cache"), "");
  assert.equal(namedVolumeSource("${DATA_DIR}:/data"), "");
  assert.equal(namedVolumeSource({ type: "bind", source: "named", target: "/x" }), "");
  assert.equal(namedVolumeSource("data:/data"), "data");
  const { findings } = validateComposeDocument({ services: { a: { image: "a:1", volumes: ["C:\\data:/data", "~/cache:/cache"] } } });
  assert.equal(findings.some((finding) => finding.code === "COMPOSE_UNKNOWN_VOLUME"), false);
});

test("services that extend another service do not need their own image", () => {
  const { findings } = validateComposeDocument({ services: { base: { image: "a:1" }, derived: { extends: { service: "base" } } } });
  assert.equal(findings.some((finding) => finding.code === "COMPOSE_MISSING_IMAGE_OR_BUILD"), false);
});

test("broken relationships are still reported by validation after a round trip", () => {
  const { yaml } = roundTripComposeYaml(`services:
  web:
    image: nginx:1
    depends_on: [ghost]
    networks: [missing-net]
    volumes: ["undeclared:/x"]
`);
  const codes = validateComposeDocument(toJS(yaml)).findings.map((finding) => finding.code);
  assert.ok(codes.includes("COMPOSE_UNKNOWN_DEPENDENCY"));
  assert.ok(codes.includes("COMPOSE_UNKNOWN_NETWORK"));
  assert.ok(codes.includes("COMPOSE_UNKNOWN_VOLUME"));
});

test("composeCanvasStateToDocument tolerates an empty or partial state", () => {
  assert.deepEqual(composeCanvasStateToDocument({}), { services: {} });
  assert.deepEqual(composeCanvasStateToDocument(null), { services: {} });
});
