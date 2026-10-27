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


test("Compose YAML remains visible in the editable textarea without relying on syntax overlay", () => {
  assert.match(css, /\.docker-studio-yaml-highlight\{display:block!important/);
  assert.match(css, /\.docker-studio-yaml-input\{z-index:2;background:transparent!important/);
});


test("Compose YAML input padding clears the line-number gutter and keeps a visible caret", () => {
  assert.match(css, /\.docker-studio \.docker-studio-yaml-input\{padding:12px 16px 20px 60px!important/);
  assert.match(css, /caret-color:#f3f6ff!important/);
  assert.match(css, /\.docker-studio \.docker-studio-yaml-input:focus\{padding-left:60px!important/);
});


test("Compose YAML editor provides context-aware completions and keyboard acceptance", () => {
  assert.match(component, /function buildComposeCompletions/);
  assert.match(component, /COMPOSE_COMPLETION_GROUPS/);
  assert.match(component, /COMPOSE_VALUE_COMPLETIONS/);
  assert.match(component, /event\.code === "Space"/);
  assert.match(component, /event\.key === "ArrowDown"/);
  assert.match(component, /applyCompletion\(completion\.items\[completion\.selectedIndex\]\)/);
  assert.match(component, /docker-compose-yaml-completions/);
  assert.match(component, /Ctrl\+Space suggestions/);
  assert.match(css, /\.docker-compose-yaml-completions/);
  assert.match(css, /\.docker-compose-yaml-completion\.active/);
});


test("Compose environment completions match mapping and list YAML styles", () => {
  assert.match(component, /parent === "environment" && \/\^-/);
  assert.match(component, /"- NODE_ENV=production", "- PORT=3000", "- DATABASE_URL=/);
  assert.match(component, /else if \(parent === "environment"\) choices = COMPOSE_COMPLETION_GROUPS\.environment/);
});

test("Compose YAML completions use indentation-aware parent context and filter existing sibling keys", () => {
  assert.match(component, /const parentLine = \[\.\.\.previousLines\]\.reverse\(\)\.find/);
  assert.match(component, /lineIndent < currentIndent/);
  assert.match(component, /const siblingKeys = new Set/);
  assert.match(component, /!siblingKeys\.has\(key\)/);
});

test("Compose YAML completions support line dismissal, explicit reopen, and cursor-relative popup placement", () => {
  assert.match(component, /dismissedCompletionLine/);
  assert.match(component, /setDismissedCompletionLine\(yamlText\.lastIndexOf/);
  assert.match(component, /if \(force\) setDismissedCompletionLine\(null\)/);
  assert.match(component, /completionPosition\.top/);
  assert.match(component, /completionPosition\.left/);
  assert.match(component, /onKeyUp=\{/);
});

test("complex Compose document round-trips without dropping operational configuration", () => {
  const source = [
    "name: commerce",
    "services:",
    "  web:",
    "    image: nginx:1.27",
    "    environment:",
    "      APP_MODE: production",
    "      API_URL: ${API_URL:-http://api:8080}",
    "    depends_on:",
    "      api:",
    "        condition: service_healthy",
    "    volumes:",
    "      - web-cache:/var/cache/nginx",
    "    networks: [edge]",
    "    healthcheck:",
    "      test: [CMD-SHELL, 'curl -fsS http://localhost/health || exit 1']",
    "      interval: 15s",
    "      timeout: 4s",
    "      retries: 4",
    "  api:",
    "    image: example/api:2.4.1",
    "    environment:",
    "      DATABASE_URL: ${DATABASE_URL:?DATABASE_URL is required}",
    "    depends_on:",
    "      db:",
    "        condition: service_healthy",
    "    volumes:",
    "      - ./config:/app/config:ro",
    "    networks: [edge, private]",
    "    healthcheck:",
    "      test: [CMD, /app/healthcheck]",
    "      interval: 10s",
    "      retries: 5",
    "  db:",
    "    image: postgres:17",
    "    environment:",
    "      POSTGRES_DB: commerce",
    "      POSTGRES_PASSWORD: ${DB_PASSWORD}",
    "    volumes: [db-data:/var/lib/postgresql/data]",
    "    networks: [private]",
    "    healthcheck:",
    "      test: [CMD-SHELL, 'pg_isready -U postgres']",
    "      interval: 5s",
    "      retries: 12",
    "volumes:",
    "  web-cache: {}",
    "  db-data: {}",
    "networks:",
    "  edge: {}",
    "  private:",
    "    internal: true",
    ""
  ].join("\n");
  const parsed = parseDocument(source, { uniqueKeys: true });
  assert.equal(parsed.errors.length, 0);
  const doc = parsed.toJS();
  assert.equal(doc.services.web.depends_on.api.condition, "service_healthy");
  assert.equal(doc.services.api.depends_on.db.condition, "service_healthy");
  assert.equal(doc.services.api.environment.DATABASE_URL, "${DATABASE_URL:?DATABASE_URL is required}");
  assert.deepEqual(doc.services.web.volumes, ["web-cache:/var/cache/nginx"]);
  assert.deepEqual(doc.services.api.networks, ["edge", "private"]);
  assert.equal(doc.services.db.healthcheck.retries, 12);
  assert.equal(doc.networks.private.internal, true);
  // The editor's export path downloads the source text rather than rebuilding
  // YAML from the parsed object, preserving comments, ordering, and formatting.
  assert.match(component, /new Blob\(\[yamlText\.endsWith/);
  assert.match(component, /anchor\.download = "compose\.yaml"/);
});

test("YAML editor, syntax overlay and line-number gutter share scrolling and typography", () => {
  assert.match(component, /docker-studio-yaml-gutter/);
  assert.match(component, /lineHeight: 1\.65/);
  assert.match(component, /setScrollTop\(event\.currentTarget\.scrollTop\)/);
  assert.match(component, /pre\.scrollTop = event\.currentTarget\.scrollTop/);
  assert.match(component, /pre\.scrollLeft = event\.currentTarget\.scrollLeft/);
  assert.match(css, /\.docker-studio-yaml-gutter span\{display:block;height:1\.65em\}/);
  assert.match(css, /\.docker-studio-yaml-highlight,\.docker-studio-yaml-input\{[^}]*line-height/);
});

test("Compose Studio places the container inspector left of the YAML editor on desktop", () => {
  assert.match(css, /\.docker-studio-k8s-workspace\{grid-template-columns:minmax\(300px,\.8fr\) minmax\(0,1\.45fr\)\}/);
  assert.match(css, /\.docker-studio-resource-pane\{grid-column:1;grid-row:1/);
  assert.match(css, /\.docker-studio-yaml-pane\{grid-column:2;grid-row:1/);
});


test("Compose YAML remains visible in the editable textarea without relying on syntax overlay", () => {
  assert.match(css, /\.docker-studio-yaml-highlight\{display:block!important/);
  assert.match(css, /\.docker-studio-yaml-input\{z-index:2;background:transparent!important/);
});


test("Compose YAML input padding clears the line-number gutter and keeps a visible caret", () => {
  assert.match(css, /\.docker-studio \.docker-studio-yaml-input\{padding:12px 16px 20px 60px!important/);
  assert.match(css, /caret-color:#f3f6ff!important/);
  assert.match(css, /\.docker-studio \.docker-studio-yaml-input:focus\{padding-left:60px!important/);
});


test("Compose YAML editor provides context-aware completions and keyboard acceptance", () => {
  assert.match(component, /function buildComposeCompletions/);
  assert.match(component, /COMPOSE_COMPLETION_GROUPS/);
  assert.match(component, /COMPOSE_VALUE_COMPLETIONS/);
  assert.match(component, /event\.code === "Space"/);
  assert.match(component, /event\.key === "ArrowDown"/);
  assert.match(component, /applyCompletion\(completion\.items\[completion\.selectedIndex\]\)/);
  assert.match(component, /docker-compose-yaml-completions/);
  assert.match(component, /Ctrl\+Space suggestions/);
  assert.match(css, /\.docker-compose-yaml-completions/);
  assert.match(css, /\.docker-compose-yaml-completion\.active/);
});
