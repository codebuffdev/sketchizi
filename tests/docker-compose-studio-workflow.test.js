import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { parseDocument } from "yaml";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const component = await readFile(resolve(root, "src/features/docker-compose/ui/DockerComposeStudio.jsx"), "utf8");
const css = await readFile(resolve(root, "src/features/docker-compose/ui/docker-compose-studio.css"), "utf8");

test("Compose Studio uses YAML as the source of truth and previews parsed services", () => {
  assert.match(component, /parseDocument\(yamlText/);
  assert.match(component, /aria-label="Docker Compose YAML"/);
  assert.match(component, /serviceEntries\.map/);
  assert.match(component, /docker-studio-k8s-workspace/);
  assert.match(component, /setYamlText\(next\)/);
});

test("Compose Studio exports editor contents directly instead of rebuilding a reduced model", () => {
  assert.match(component, /new Blob\(\[yamlText\.endsWith/);
  assert.match(component, /anchor\.download = "compose\.yaml"/);
  assert.doesNotMatch(component, /function toDocument\(/);
});

test("Compose Studio exposes dependency relationships and shared resources from live YAML", () => {
  assert.match(component, /dependenciesOf\(service\)/);
  assert.match(component, /docker-studio-relationship-panel/);
  assert.match(component, /docker-studio-shared-resources/);
  assert.match(component, /validateComposeDocument\(composeDoc\)/);
  assert.match(component, /analyzeComposeReadiness\(composeDoc\)/);
});

test("Compose Studio keeps editor and preview independently scrollable at compact widths", () => {
  assert.match(css, /docker-studio-k8s-workspace/);
  assert.match(css, /docker-studio-yaml-shell/);
  assert.match(css, /@media\(max-width:700px\)/);
  assert.match(css, /docker-studio-resource-pane/);
});

test("complex Compose YAML preserves service conditions, environment substitutions, healthchecks, volumes and networks", () => {
  const source = [
    "services:",
    "  api:",
    "    image: example/api:1",
    "    environment:",
    "      DATABASE_URL: ${DATABASE_URL}",
    "    depends_on:",
    "      database:",
    "        condition: service_healthy",
    "    volumes:",
    "      - uploads:/srv/uploads",
    "    networks: [backend]",
    "    healthcheck:",
    "      test: [CMD, curl, -f, http://localhost/health]",
    "volumes:",
    "  uploads: {}",
    "networks:",
    "  backend: {}",
    ""
  ].join("\n");
  const parsed = parseDocument(source, { uniqueKeys: true });
  assert.equal(parsed.errors.length, 0);
  const roundTrip = parsed.toJS();
  assert.equal(roundTrip.services.api.depends_on.database.condition, "service_healthy");
  assert.equal(roundTrip.services.api.environment.DATABASE_URL, "${DATABASE_URL}");
  assert.deepEqual(roundTrip.services.api.volumes, ["uploads:/srv/uploads"]);
  assert.deepEqual(roundTrip.services.api.networks, ["backend"]);
  assert.equal(roundTrip.services.api.healthcheck.test[1], "curl");
});


test("Compose Studio places the container inspector left of the YAML editor on desktop", () => {
  assert.match(css, /\.docker-studio-k8s-workspace\{grid-template-columns:minmax\(300px,\.8fr\) minmax\(0,1\.45fr\)\}/);
  assert.match(css, /\.docker-studio-resource-pane\{grid-column:1;grid-row:1/);
  assert.match(css, /\.docker-studio-yaml-pane\{grid-column:2;grid-row:1/);
});
