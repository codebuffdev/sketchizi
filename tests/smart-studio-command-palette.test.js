import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  classifyInfrastructureElement,
  detectArchitectureContext,
  getSmartStudioPresentation,
  architectureDetectionSignature,
} from "../src/features/architecture/architectureContextDetection.js";
import { getCommandPaletteShortcut, isCommandPaletteShortcut, isMacPlatform } from "../src/features/commands/platformShortcut.js";
import { getInfrastructureInsertTargets } from "../src/features/commands/engineeringCommandCatalog.js";
import { rankCommands } from "../src/features/commands/commandPaletteSearch.js";
import { buildArchitecturePackElements, insertArchitecturePack } from "../src/features/templates/architecturePackInsertion.js";
import { ARCHITECTURE_PACKS } from "../src/features/templates/architecturePacks.js";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const el = (customData, extra = {}) => ({ id: Math.random().toString(36), type: "rectangle", isDeleted: false, customData, ...extra });

test("plain sketches and notes produce no Smart Studio context", () => {
  const scene = [{ id: "a", type: "rectangle" }, { id: "b", type: "text", text: "note" }, { id: "c", type: "freedraw" }];
  assert.equal(detectArchitectureContext(scene).context, null);
  assert.equal(detectArchitectureContext([]).context, null);
  assert.equal(detectArchitectureContext(undefined).context, null);
  assert.equal(architectureDetectionSignature(detectArchitectureContext([])), "none");
});

test("detects kubernetes, docker, architecture and multi-cloud scenes", () => {
  const k8s = el({ kubernetesResource: { kubernetesResourceId: "k" } });
  const compose = el({ composeDiagram: true });
  const aws = el({ awsResource: { awsResourceId: "a" } });
  const net = el({ networkingResource: { networkingResourceId: "n" } });
  assert.equal(detectArchitectureContext([k8s]).context, "kubernetes");
  assert.equal(detectArchitectureContext([compose]).context, "docker");
  assert.equal(detectArchitectureContext([aws]).context, "architecture");
  assert.equal(detectArchitectureContext([aws, net]).context, "architecture");
  assert.equal(detectArchitectureContext([k8s, aws]).context, "multi-cloud");
  assert.equal(detectArchitectureContext([k8s, compose]).context, "multi-cloud");
  assert.equal(detectArchitectureContext([k8s, k8s, aws]).counts.kubernetes, 2);
});

test("deleted elements, relationship arrows and unrelated metadata are ignored", () => {
  assert.equal(classifyInfrastructureElement(el({ kubernetesResource: {} }, { isDeleted: true })), null);
  assert.equal(classifyInfrastructureElement(el({ kubernetesRelationship: { relationshipId: "r" } })), null);
  assert.equal(classifyInfrastructureElement(el({ diagramIcon: true, iconSource: "eraser" })), null);
  assert.equal(classifyInfrastructureElement(el({ diagramIcon: true, iconId: "aws:service:compute:amazon-ec2:x" })), "architecture");
  assert.equal(classifyInfrastructureElement(el({ diagramIcon: true, iconId: "k8s:pod" })), "kubernetes");
});

test("pill labels follow the detected context", () => {
  assert.equal(getSmartStudioPresentation("kubernetes").label, "K8s Studio");
  assert.equal(getSmartStudioPresentation("docker").label, "Compose Studio");
  assert.equal(getSmartStudioPresentation("architecture").label, "Validate Arch");
  assert.equal(getSmartStudioPresentation("multi-cloud").label, "Validate Arch");
  assert.equal(getSmartStudioPresentation(null), null);
});

test("shortcut hint is platform aware and Ctrl/Cmd+K is recognised", () => {
  assert.equal(getCommandPaletteShortcut({ platform: "MacIntel" }).label, "⌘K");
  assert.equal(getCommandPaletteShortcut({ userAgentData: { platform: "macOS" } }).label, "⌘K");
  assert.equal(getCommandPaletteShortcut({ platform: "Win32" }).label, "Ctrl+K");
  assert.equal(getCommandPaletteShortcut({ platform: "Linux x86_64" }).label, "Ctrl+K");
  assert.equal(isMacPlatform({ platform: "", userAgent: "Mozilla/5.0 (Macintosh)" }), true);
  assert.equal(isCommandPaletteShortcut({ ctrlKey: true, key: "k" }), true);
  assert.equal(isCommandPaletteShortcut({ metaKey: true, key: "K" }), true);
  assert.equal(isCommandPaletteShortcut({ ctrlKey: true, shiftKey: true, key: "k" }), false);
  assert.equal(isCommandPaletteShortcut({ key: "k" }), false);
});

test("engineering insert targets cover AWS, Kubernetes and Networking with real catalog icons", () => {
  const targets = getInfrastructureInsertTargets();
  const ids = new Set(targets.map((target) => target.id));
  for (const id of ["ec2", "s3", "rds", "vpc", "eks", "lambda"]) assert.ok(ids.has(`insert.aws.${id}`), id);
  for (const id of ["pod", "deployment", "service", "ingress", "configmap"]) assert.ok(ids.has(`insert.kubernetes.${id}`), id);
  assert.ok(targets.some((target) => target.provider === "networking"));
  assert.equal(ids.size, targets.length, "command ids are unique");
  for (const target of targets) assert.ok(target.icon?.id && target.icon?.name, target.id);
});

test("fuzzy search finds engineering commands by service name", () => {
  const commands = getInfrastructureInsertTargets().map((target) => ({ id: target.id, label: target.label, description: target.description, keywords: target.keywords, category: "Insert Cloud & Infra" }));
  assert.equal(rankCommands(commands, "ec2")[0].id, "insert.aws.ec2");
  assert.equal(rankCommands(commands, "ingress")[0].id, "insert.kubernetes.ingress");
  assert.ok(rankCommands(commands, "lmbd").some((command) => command.id === "insert.aws.lambda"));
  assert.ok(rankCommands(commands, "k8s pod").some((command) => command.id === "insert.kubernetes.pod"));
});

test("architecture pack insertion places packs beside existing work and is shared", () => {
  const pack = ARCHITECTURE_PACKS[0];
  const added = buildArchitecturePackElements(pack, [{ x: 500, y: 40, width: 100, height: 50 }], { now: 1, random: () => 0.5 });
  assert.equal(added.length, pack.elements.length);
  assert.ok(added.every((element) => element.x >= 580), "offset to the right of existing content");
  const calls = [];
  const api = { getSceneElements: () => [], updateScene: (update) => calls.push(update), scrollToContent: () => {} };
  assert.equal(insertArchitecturePack(api, pack, { captureUpdate: "IMMEDIATELY" }), true);
  assert.equal(calls[0].captureUpdate, "IMMEDIATELY");
  assert.equal(insertArchitecturePack(null, pack), false);
});

test("Smart Studio pill is mounted before the AI button and hidden in Zen Mode", async () => {
  const header = await read("src/components/app/DesktopAppHeader.jsx");
  const pill = await read("src/components/app/SmartStudioPill.jsx");
  const pillAt = header.indexOf("<SmartStudioPill");
  const aiAt = header.indexOf('className="desktop-app-global-ai-control"');
  assert.ok(pillAt > 0 && aiAt > pillAt, "pill renders right before the AI control");
  assert.match(header, /isZenMode=\{isZenMode\}/);
  assert.match(pill, /const visible = Boolean\(context\) && !isZenMode/);
  assert.match(pill, /if \(!present \|\| !presentation\) return null/);
  for (const label of ["Run Architecture Validation", "Open Kubernetes Studio / Export YAML", "Open Docker Compose Studio", "System Design Review"]) {
    assert.ok(pill.includes(label), label);
  }
  assert.match(pill, /role="menu"/);
  assert.match(pill, /ArrowDown/);
  assert.match(pill, /Escape/);
});

test("Smart Studio styling matches the specified geometry and motion", async () => {
  const css = await read("src/styles/smart-studio.css");
  assert.match(css, /height: 36px;[\s\S]*?padding: 0 11px;|padding: 0 11px;[\s\S]*?height: 36px;/);
  assert.match(css, /border-radius: 9999px/);
  assert.match(css, /gap: 7px/);
  assert.match(css, /animation: smart-studio-enter 240ms var\(--smart-studio-ease\)/);
  assert.match(css, /cubic-bezier\(0\.22, 1, 0\.36, 1\)/);
  assert.match(css, /scale\(0\.92\)[\s\S]*?blur\(4px\)/);
  assert.match(css, /top: calc\(100% \+ 8px\);\s*right: 0;\s*width: 240px;/);
  assert.match(css, /#10B981/);
  assert.match(css, /#F59E0B/);
  assert.match(css, /font-size: 11px;[\s\S]*?font-variant-numeric: tabular-nums/);
  assert.match(css, /rgba\(255, 255, 255, 0\.1\)/);
  assert.match(css, /rgba\(15, 23, 42, 0\.08\)/);
  assert.match(css, /sk-palette-in 200ms/);
  assert.match(css, /sk-palette-out 130ms/);
  assert.match(css, /prefers-reduced-motion: reduce/);
});

test("scene detection is debounced 250ms and fed from the scene pipeline", async () => {
  const hook = await read("src/features/architecture/useDetectedArchitectureContext.js");
  const app = await read("src/App.jsx");
  assert.match(hook, /ARCHITECTURE_CONTEXT_DEBOUNCE_MS = 250/);
  assert.match(hook, /setTimeout/);
  assert.match(app, /useDetectedArchitectureContext\(\)/);
  assert.match(app, /notifyArchitectureContext\(elements\)/);
  assert.match(app, /architectureContext=\{architectureContext\}/);
  assert.match(app, /composeDiagram: true/);
});

test("command palette opens on Ctrl/Cmd+K and exposes the platform hint", async () => {
  const hook = await read("src/features/navigation/useCommandPalette.js");
  const palette = await read("src/components/app/CommandPalette.jsx");
  const header = await read("src/components/app/DesktopAppHeader.jsx");
  assert.match(hook, /isCommandPaletteShortcut\(event\)/);
  assert.match(hook, /monaco-editor, \.cm-editor/);
  assert.match(palette, /getCommandPaletteShortcut/);
  assert.match(palette, /COMMAND_PALETTE_ENTER_MS = 200/);
  assert.match(palette, /COMMAND_PALETTE_EXIT_MS = 130/);
  assert.match(palette, /ArrowDown[\s\S]*ArrowUp[\s\S]*Enter[\s\S]*Escape/);
  // The visible header pill was replaced by the Workspace icon button; the
  // global shortcut and the menu / rail "Search" entries remain.
  assert.doesNotMatch(header, /desktop-app-command-trigger/);
  assert.match(header, /paletteShortcut\.label/);
  assert.match(header, /Search Commands/);
  assert.doesNotMatch(header, />Ctrl\+K<\/kbd>/);
});

test("command registry groups engineering actions", async () => {
  const registry = await read("src/features/commands/commandRegistry.js");
  for (const id of ["review.architecture", "studios.kubernetes", "studios.docker-compose", "studios.system-design-review", "export.diagram-yaml-png", "templates.architecture-packs", "templates.design-catalog"]) {
    assert.ok(registry.includes(`id: "${id}"`), id);
  }
  assert.match(registry, /ARCHITECTURE_PACKS\.map/);
  assert.match(registry, /getInfrastructureInsertTargets\(\)\.map/);
  for (const label of ["Validate Architecture", "Open Kubernetes Studio", "Open Docker Compose Studio", "Open System Design Review", "Export Diagram / YAML / PNG"]) {
    assert.ok(registry.includes(`label: "${label}"`), label);
  }
});

test("header Workspace icon button opens the Cloud Workspace in one click", async () => {
  const header = await read("src/components/app/DesktopAppHeader.jsx");
  const app = await read("src/App.jsx");
  const css = await read("src/styles/header-redesign.css");
  assert.match(header, /className=\{`desktop-app-workspace-button/);
  assert.match(header, /aria-label="Open Cloud Workspace"/);
  assert.match(header, /"Cloud Workspace \(Synced\)" : "Cloud Workspace"/);
  assert.match(header, /onOpenWorkspace\?\.\(\)/);
  assert.match(app, /onOpenWorkspace=\{openCloudWorkspace\}/);
  assert.match(css, /\.desktop-app-workspace-button \{[^}]*width: 36px;[^}]*height: 36px;/);
  assert.match(css, /#10b981/);
});
