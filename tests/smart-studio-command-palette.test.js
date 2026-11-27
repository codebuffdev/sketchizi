import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { getCommandPaletteShortcut, isCommandPaletteShortcut, isMacPlatform } from "../src/features/commands/platformShortcut.js";
import { getInfrastructureInsertTargets } from "../src/features/commands/engineeringCommandCatalog.js";
import { rankCommands } from "../src/features/commands/commandPaletteSearch.js";
import { buildArchitecturePackElements, insertArchitecturePack } from "../src/features/templates/architecturePackInsertion.js";
import { ARCHITECTURE_PACKS } from "../src/features/templates/architecturePacks.js";

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

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

test("command palette motion styling and removed Validate Arch entries", async () => {
  const css = await read("src/styles/smart-studio.css");
  assert.match(css, /sk-palette-in 200ms/);
  assert.match(css, /sk-palette-out 130ms/);
  assert.match(css, /prefers-reduced-motion: reduce/);
  assert.match(css, /rgba\(255, 255, 255, 0\.1\)/);
  assert.match(css, /rgba\(15, 23, 42, 0\.08\)/);
  assert.doesNotMatch(css, /smart-studio-pill|smart-studio-popover/);
  const header = await read("src/components/app/DesktopAppHeader.jsx");
  assert.doesNotMatch(header, /SmartStudioPill|Validate Arch|onRunArchitectureValidation|onOpenKubernetesStudio|onOpenDockerComposeStudio|onOpenSystemDesignReview/);
});

test("command registry groups engineering actions", async () => {
  const registry = await read("src/features/commands/commandRegistry.js");
  for (const id of ["templates.architecture-packs", "templates.design-catalog"]) {
    assert.ok(registry.includes(`id: "${id}"`), id);
  }
  // Studios are reachable from Ctrl/Cmd+K; validation and design review stay removed.
  for (const id of ["studios.kubernetes", "studios.docker-compose"])
    assert.ok(registry.includes(`id: "${id}"`), id);
  for (const id of ["review.architecture", "studios.system-design-review"])
    assert.ok(!registry.includes(`id: "${id}"`), id);
  assert.match(registry, /ARCHITECTURE_PACKS\.map/);
  assert.match(registry, /getInfrastructureInsertTargets\(\)\.map/);
  assert.doesNotMatch(registry, /Export Diagram \/ YAML \/ PNG|export\.diagram-yaml-png/);
});

test("header Workspace icon button toggles a quick popover instead of jumping to /workspace", async () => {
  const header = await read("src/components/app/DesktopAppHeader.jsx");
  const popover = await read("src/components/app/WorkspaceQuickPopover.jsx");
  const app = await read("src/App.jsx");
  const css = await read("src/styles/header-redesign.css");
  assert.match(header, /className=\{`desktop-app-workspace-button/);
  assert.match(header, /aria-label="Open Cloud Workspace"/);
  assert.match(header, /"Cloud Workspace \(Synced\)" : "Cloud Workspace"/);
  assert.match(header, /setIsWorkspacePopoverOpen\(\(open\) => !open\)/);
  // Explicit inline 4-square icon: no icon-font / import dependency.
  assert.match(header, /<svg\s+width="16"\s+height="16"\s+viewBox="0 0 24 24"[\s\S]*?strokeWidth="1\.9"[\s\S]*?<rect x="3" y="14" width="7" height="7" rx="1\.5" \/>/);
  // Popover: Escape + outside click, Full View, project pills, chapter rows, quick create.
  assert.match(popover, /event\.key !== "Escape"/);
  assert.match(popover, /pointerdown/);
  assert.match(popover, /Workspace ↗/);
  assert.match(popover, /Switch chapters without leaving the editor/);
  assert.match(popover, /\+ New chapter in \{project\?\.name\}/);
  assert.match(popover, /formatChapterLabel\(chapter\.chapterNumber\)/);
  // App: only the explicit Full View goes to /workspace; chapters open in the editor.
  assert.match(app, /onOpenFullWorkspace=\{openCloudWorkspace\}/);
  assert.match(app, /onOpenWorkspaceDiagram=\{openWorkspaceDiagram\}/);
  assert.match(app, /onCreateWorkspaceChapter=\{createWorkspaceChapter\}/);
  assert.match(css, /\.workspace-popover \{[\s\S]*?border-radius: 16px;/);
  assert.match(css, /#10b981/);
});
