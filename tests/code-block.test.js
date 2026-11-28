import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { ALL_CHILDREN, DOCK_SLOTS, findSlot, resolveActiveChild, tooltipLabel, defaultSlotMemory, isPersistentTool } from "../src/components/app/primaryDockModel.js";
import { badgeForFilename, DEFAULT_CODE_FILENAME, effectiveFilename, FILENAME_PLACEHOLDER, languageForFilename, sanitizeFilename } from "../src/features/canvas/codeBlock/codeLanguages.js";
import { tokenizeCode } from "../src/features/canvas/codeBlock/codeTokenizer.js";
import { applyEdit, getEnterEdit, getTabEdit, normalizePastedCode } from "../src/features/canvas/codeBlock/codeEditing.js";
import { CODE_METRICS, expandTabs, measureCodeBlock } from "../src/features/canvas/codeBlock/codeBlockLayout.js";
import { CODE_BORDER_WIDTH, CODE_THEMES, getCodeTheme } from "../src/features/canvas/codeBlock/codeSyntaxTheme.js";
import { drawCodeBlock } from "../src/features/canvas/codeBlock/codeBlockRenderer.js";
import { codeBlockFileId, hitTestCodeBlock, isCodeBlockElement, normalizeCodeBlockData, readCodeBlock } from "../src/features/canvas/codeBlock/codeBlockModel.js";
import { isCodeBlockShortcut, isTypingTarget } from "../src/features/canvas/codeBlock/codeBlockShortcut.js";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

/* ------------------------------------------------------------------ dock + shortcut */

test("Text flyout keeps Text and Sticky Note and adds Code Block (C)", () => {
  const text = findSlot("text");
  assert.deepEqual(text.tools.map((tool) => tool.id), ["text", "sticky-note", "code-block"]);
  const code = text.tools[2];
  assert.equal(code.label, "Code Block");
  assert.equal(code.keyHint, "C");
  assert.equal(tooltipLabel(code), "Code Block (C)");
  assert.equal(code.kind, "custom");
  assert.ok(isPersistentTool(code));
  // Text stays the slot's default child.
  assert.equal(defaultSlotMemory().text, "text");
  assert.equal(DOCK_SLOTS.length, 9);
});

test("an armed Code Block tool is the active dock child", () => {
  const memory = defaultSlotMemory();
  assert.equal(resolveActiveChild({ activeToolType: "selection", customTool: "codeblock", slotMemory: memory }).id, "code-block");
  assert.equal(resolveActiveChild({ activeToolType: "selection", customTool: "codeblock", slotMemory: memory }).slotId, "text");
  assert.ok(ALL_CHILDREN.some((child) => child.id === "code-block"));
});

test("C shortcut fires only for a bare, non-repeating key outside text entry", () => {
  const key = (extra = {}, target = { tagName: "DIV", closest: () => null }) => ({ key: "c", target, ...extra });
  assert.equal(isCodeBlockShortcut(key()), true);
  assert.equal(isCodeBlockShortcut(key({ key: "C" })), true);
  for (const mod of ["ctrlKey", "metaKey", "altKey", "shiftKey", "repeat", "isComposing"]) {
    assert.equal(isCodeBlockShortcut(key({ [mod]: true })), false, mod);
  }
  assert.equal(isCodeBlockShortcut(key({}, { tagName: "TEXTAREA", closest: () => null })), false);
  assert.equal(isCodeBlockShortcut(key({}, { tagName: "INPUT", closest: () => null })), false);
  assert.equal(isCodeBlockShortcut(key({}, { tagName: "DIV", isContentEditable: true, closest: () => null })), false);
  assert.equal(isTypingTarget({ tagName: "DIV", closest: (sel) => (sel.includes("[role='dialog']") ? {} : null) }), true);
  assert.equal(isCodeBlockShortcut({ key: "x", target: { tagName: "DIV", closest: () => null } }), false);
});

test("dock, canvas and help are wired to the Code Block tool", () => {
  const dock = read("../src/components/app/PrimaryDock.jsx");
  assert.match(dock, /const CUSTOM_TOOLS = \[[^\]]*"codeblock"/);
  assert.match(dock, /sketchizi:clear-custom-tool/);
  const canvas = read("../src/components/app/SketchiziCanvas.jsx");
  assert.match(canvas, /<CodeBlockLayer[^>]*apiRef=\{apiRef\}/);
  assert.match(read("../src/ShortcutHelp.jsx"), /\["C", "Code Block/);
  const icons = read("../src/components/app/primaryDockIcons.jsx");
  assert.match(icons, /"code-block": /);
  const layer = read("../src/components/app/CodeBlockLayer.jsx");
  assert.match(layer, /sketchizi:activate-tool/);
  assert.match(layer, /viewportCoordsToSceneCoords/);
  assert.match(layer, /dblclick/);
  assert.match(layer, /rethemeCodeBlocks/);
});

/* ------------------------------------------------------------------ filename -> language */

test("filename extensions drive the language and badge", () => {
  const cases = {
    "a.ts": ["typescript", "TS"], "a.tsx": ["typescript", "TS"], "a.js": ["javascript", "JS"], "a.jsx": ["javascript", "JS"],
    "A.java": ["java", "JAVA"], "a.py": ["python", "PY"], "q.sql": ["sql", "SQL"], "d.json": ["json", "JSON"],
    "r.sh": ["bash", "BASH"], "r.bash": ["bash", "BASH"], "c.yaml": ["yaml", "YAML"], "c.yml": ["yaml", "YAML"],
    "i.html": ["html", "HTML"], "s.css": ["css", "CSS"], "TEST.TS": ["typescript", "TS"], "x.test.ts": ["typescript", "TS"],
  };
  for (const [name, [language, badge]] of Object.entries(cases)) {
    assert.equal(languageForFilename(name), language, name);
    assert.equal(badgeForFilename(name), badge, name);
  }
  assert.equal(languageForFilename("README"), "plain");
  assert.equal(languageForFilename("notes."), "plain");
  assert.equal(badgeForFilename("notes.txt"), "");
  assert.equal(DEFAULT_CODE_FILENAME, "test.ts");
  assert.equal(FILENAME_PLACEHOLDER, "snippet.ts");
  assert.equal(effectiveFilename("   "), "test.ts");
  assert.equal(sanitizeFilename("a\nb\t.ts"), "a b .ts");
});

test("changing the extension re-highlights the same code differently", () => {
  const code = "SELECT 1";
  const asSql = tokenizeCode(code, languageForFilename("q.sql"))[0].map((t) => t.type);
  const asTs = tokenizeCode(code, languageForFilename("q.ts"))[0].map((t) => t.type);
  assert.ok(asSql.includes("keyword"));
  assert.ok(!asTs.includes("keyword"));
});

/* ------------------------------------------------------------------ tokenizer */

const typesOf = (code, language) => new Map(tokenizeCode(code, language).flat().map((t) => [t.text, t.type]));
const SAMPLES = {
  typescript: "interface User { id: number }\n@Injectable()\nexport async function load(id: number): Promise<User> {\n  const url = `/api/${id}`; // c\n  /* a\n  b */ return 0x1F;\n}",
  javascript: "const x = async () => { await fetch('/a'); };",
  java: "@Override\npublic class Foo<T> {\n  private final int n = 42;\n  String s = \"hi\";\n}",
  python: "@dataclass\nclass A:\n    def run(self) -> str:\n        \"\"\"doc\n        more\"\"\"\n        return 1 # c",
  sql: "SELECT COUNT(*) FROM t WHERE a >= 1 -- c\n/* x\ny */",
  json: '{ "a": [1, true, null], "b": "x" }',
  bash: "#!/bin/bash\nexport A=1\nif [ -f \"$F\" ]; then echo ok; fi",
  yaml: "a:\n  b: [1, true]\n  - c: 'x' # k",
  html: "<div class=\"a\">\n  <!-- c\n  d -->\n  <img src='x' />\n</div>",
  css: ".a:hover {\n  color: #fff; /* c */\n  margin: 0 1.5rem !important;\n}",
};

test("tokenizer is lossless for every supported language (line by line)", () => {
  for (const [language, code] of Object.entries(SAMPLES)) {
    const lines = tokenizeCode(code, language);
    assert.equal(lines.map((line) => line.map((t) => t.text).join("")).join("\n"), code, language);
  }
  // Windows newlines are normalised, empty input is one empty line.
  assert.equal(tokenizeCode("a\r\nb", "typescript").length, 2);
  assert.deepEqual(tokenizeCode("", "typescript"), [[]]);
});

test("tokenizer classifies keywords, types, strings, numbers, functions, decorators, operators and comments", () => {
  const ts = typesOf("@Injectable()\nexport async function load(id: number): Promise<User> {\n  const s = 'x' + 42; // c\n}", "typescript");
  assert.equal(ts.get("@Injectable"), "decorator");
  assert.equal(ts.get("export"), "keyword");
  assert.equal(ts.get("async"), "keyword");
  assert.equal(ts.get("load"), "function");
  assert.equal(ts.get("number"), "type");
  assert.equal(ts.get("Promise"), "type");
  assert.equal(ts.get("User"), "type");
  assert.equal(ts.get("'x'"), "string");
  assert.equal(ts.get("42"), "number");
  assert.equal(ts.get("// c"), "comment");
  assert.equal(ts.get("+"), "operator");

  const java = typesOf("public class Foo { private int n = 1; @Override void m() {} }", "java");
  assert.equal(java.get("public"), "keyword");
  assert.equal(java.get("Foo"), "type");
  assert.equal(java.get("int"), "type");
  assert.equal(java.get("@Override"), "decorator");
  assert.equal(java.get("m"), "function");

  const py = typesOf("def run(x):\n    return len(x)  # c", "python");
  assert.equal(py.get("def"), "keyword");
  assert.equal(py.get("run"), "function");
  assert.equal(py.get("len"), "function");
  assert.equal(py.get("# c"), "comment");

  const sql = typesOf("select name from users where id = 1", "sql");
  assert.equal(sql.get("select"), "keyword");
  assert.equal(sql.get("from"), "keyword");
  assert.equal(sql.get("1"), "number");
  assert.equal(typesOf("SELECT 'a' -- x", "sql").get("'a'"), "string");
});

test("multi-line constructs keep their state across lines", () => {
  const block = tokenizeCode("/* a\nb\nc */ let x", "typescript");
  assert.ok(block[0].every((t) => t.type === "comment"));
  assert.ok(block[1].every((t) => t.type === "comment"));
  assert.equal(block[2][0].type, "comment");
  assert.ok(block[2].some((t) => t.text === "let" && t.type === "keyword"));
  const triple = tokenizeCode('x = """a\nb"""\ny = 1', "python");
  assert.equal(triple[1][0].type, "string");
  assert.ok(triple[2].some((t) => t.text === "1" && t.type === "number"));
  const tpl = tokenizeCode("const a = `x\ny`;\nconst b = 1;", "typescript");
  assert.equal(tpl[1][0].type, "string");
  assert.ok(tpl[2].some((t) => t.text === "const" && t.type === "keyword"));
});

test("JSON separates keys from string values; YAML separates keys from scalars", () => {
  const json = typesOf('{ "k": "v", "n": 1.5, "t": true }', "json");
  assert.equal(json.get('"k"'), "property");
  assert.equal(json.get('"v"'), "string");
  assert.equal(json.get("1.5"), "number");
  assert.equal(json.get("true"), "keyword");
  const yaml = typesOf("name: ci\ncount: 3\nok: true", "yaml");
  assert.equal(yaml.get("name"), "property");
  assert.equal(yaml.get("ci"), "string");
  assert.equal(yaml.get("3"), "number");
  assert.equal(yaml.get("true"), "keyword");
});

/* ------------------------------------------------------------------ editing keys */

const tab = (value, s, e = s, shiftKey = false) => applyEdit(value, getTabEdit({ value, selectionStart: s, selectionEnd: e, shiftKey }));
const enter = (value, s, e = s, language = "typescript") => applyEdit(value, getEnterEdit({ value, selectionStart: s, selectionEnd: e, language }));

test("Tab inserts two spaces; Tab / Shift+Tab indent and outdent multi-line selections", () => {
  assert.deepEqual(tab("ab", 1), { value: "a  b", selectionStart: 3, selectionEnd: 3 });
  const indented = tab("a\nb\nc", 0, 5);
  assert.equal(indented.value, "  a\n  b\n  c");
  assert.deepEqual([indented.selectionStart, indented.selectionEnd], [2, 11]);
  assert.equal(tab("a\nb\nc", 0, 4).value, "  a\n  b\nc"); // selection ending at column 0 skips that line
  assert.equal(tab("a\n\nb", 0, 4).value, "  a\n\n  b"); // blank lines stay blank
  assert.equal(tab("    a\n  b\n\tc\nd", 0, 14, true).value, "  a\nb\nc\nd");
  const caretOutdent = tab("    foo", 6, 6, true);
  assert.equal(caretOutdent.value, "  foo");
  assert.equal(caretOutdent.selectionStart, 4);
  assert.equal(tab("foo", 1, 1, true).value, "foo"); // nothing to remove
});

test("Enter keeps indentation and adds a level after { [ ( and : (Python / YAML)", () => {
  assert.equal(enter("  foo()", 7).value, "  foo()\n  ");
  assert.equal(enter("\tfoo", 4).value, "\tfoo\n\t");
  assert.equal(enter("if (x) {", 8).value, "if (x) {\n  ");
  assert.equal(enter("  a = [", 7).value, "  a = [\n    ");
  assert.equal(enter("  f(", 4).value, "  f(\n    ");
  assert.equal(enter("x = {  ", 7).value, "x = {  \n  ");
  assert.equal(enter("def f():", 8, 8, "python").value, "def f():\n  ");
  assert.equal(enter("key:", 4, 4, "yaml").value, "key:\n  ");
  assert.equal(enter("def f():", 8, 8, "typescript").value, "def f():\n"); // ':' only opens a block in Python / YAML
  const split = enter("fn {}", 4);
  assert.equal(split.value, "fn {\n  \n}");
  assert.equal(split.selectionStart, 7);
});

test("paste keeps leading spaces, tabs and line breaks exactly", () => {
  assert.equal(normalizePastedCode("a\r\n\tb\r  c"), "a\n\tb\n  c");
  assert.equal(normalizePastedCode("    x\n\t\ty"), "    x\n\t\ty");
  const editor = read("../src/components/app/CodeBlockEditor.jsx");
  assert.match(editor, /getData\("text\/plain"\)/);
  assert.match(editor, /normalizePastedCode/);
  assert.match(editor, /document\.execCommand\("insertText"/); // keeps native undo
  assert.match(editor, /event\.key === "Tab"/);
  assert.match(editor, /event\.key === "Enter"/);
});

/* ------------------------------------------------------------------ layout + palette + renderer */

test("card geometry: 14px radius, 280x160 minimum, 16px 18px padding, 6px header gap, auto-grow", () => {
  assert.equal(CODE_METRICS.radius, 14);
  assert.equal(CODE_METRICS.minWidth, 280);
  assert.equal(CODE_METRICS.minHeight, 160);
  assert.equal(CODE_METRICS.paddingY, 16);
  assert.equal(CODE_METRICS.paddingX, 18);
  assert.equal(CODE_METRICS.headerGap, 6);
  const empty = measureCodeBlock("", { charWidth: 8.4 });
  assert.equal(empty.cardWidth, 280);
  assert.equal(empty.cardHeight, 160);
  assert.equal(empty.height, CODE_METRICS.headerHeight + 6 + 160);
  const wide = measureCodeBlock(`${"x".repeat(80)}\nshort`, { charWidth: 8 });
  assert.ok(wide.cardWidth > 280);
  assert.equal(wide.cardWidth, Math.ceil(81 * 8) + 36);
  const tall = measureCodeBlock(Array(20).fill("x").join("\n"), { charWidth: 8 });
  assert.equal(tall.cardHeight, 20 * 21 + 32);
  assert.ok(tall.cardHeight > measureCodeBlock("x\ny", { charWidth: 8 }).cardHeight);
  assert.equal(expandTabs("\tab\tc", 2), "  ab  c");
});

test("palettes: Day is #ffffff with a 1.5px slate border; Dark is #111522", () => {
  assert.equal(CODE_BORDER_WIDTH, 1.5);
  assert.equal(CODE_THEMES.light.surface, "#ffffff");
  assert.equal(CODE_THEMES.dark.surface, "#111522");
  assert.notEqual(CODE_THEMES.light.border, CODE_THEMES.dark.border);
  const luminance = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a, b) => { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); };
  for (const theme of ["light", "dark"]) {
    const palette = getCodeTheme(theme);
    for (const [type, color] of Object.entries(palette.tokens)) {
      assert.ok(contrast(color, palette.surface) >= 4.5, `${theme}.${type} contrast ${contrast(color, palette.surface).toFixed(2)}`);
    }
  }
  assert.equal(getCodeTheme("anything-else"), CODE_THEMES.light);
});

function recordingContext() {
  const calls = { text: [], rects: [], strokes: [], fills: [], fonts: new Set() };
  const state = { fillStyle: "", strokeStyle: "", lineWidth: 0, font: "" };
  const ctx = new Proxy({}, {
    get(_t, prop) {
      if (prop in state) return state[prop];
      if (prop === "measureText") return (text) => ({ width: String(text).length * 8.4 });
      if (prop === "fillText") return (text, x, y) => { calls.text.push({ text, x, y, fill: state.fillStyle, font: state.font }); calls.fonts.add(state.font); };
      if (prop === "fill") return () => calls.fills.push({ fill: state.fillStyle });
      if (prop === "stroke") return () => calls.strokes.push({ stroke: state.strokeStyle, width: state.lineWidth });
      if (prop === "arcTo") return (...args) => calls.rects.push(args);
      return () => {};
    },
    set(_t, prop, value) { state[prop] = value; return true; },
  });
  return { ctx, calls };
}

test("renderer paints tokenized code, filename label, badge and a 1.5px rounded border in each theme", () => {
  const code = "const n: number = 42; // hi\nexport function go() {}";
  for (const theme of ["light", "dark"]) {
    const palette = CODE_THEMES[theme === "dark" ? "dark" : "light"];
    const { ctx, calls } = recordingContext();
    drawCodeBlock(ctx, { code, filename: "test.ts", theme }, measureCodeBlock(code, { charWidth: 8.4 }));
    const fills = (text) => calls.text.filter((c) => c.text === text).map((c) => c.fill);
    assert.deepEqual(fills("const"), [palette.tokens.keyword], `${theme} keyword`);
    assert.deepEqual(fills("42"), [palette.tokens.number], `${theme} number`);
    assert.deepEqual(fills("go"), [palette.tokens.function], `${theme} function`);
    assert.deepEqual(fills("// hi"), [palette.tokens.comment], `${theme} comment`);
    assert.deepEqual(fills("test.ts"), [palette.headerText], `${theme} filename`);
    assert.deepEqual(fills("TS"), [palette.badgeText], `${theme} badge`);
    assert.ok(calls.fills.some((f) => f.fill === palette.surface), `${theme} surface`);
    assert.ok(calls.strokes.some((s) => s.stroke === palette.border && s.width === 1.5), `${theme} border 1.5px`);
    assert.ok(calls.rects.length >= 4, "rounded corners drawn with arcTo");
    assert.ok([...calls.fonts].some((f) => f.startsWith("italic ")), "comments are italic");
    // Filename sits above the card; code starts below the header + 6px gap.
    const name = calls.text.find((c) => c.text === "test.ts");
    const first = calls.text.find((c) => c.text === "const");
    assert.ok(name.y < CODE_METRICS.headerHeight);
    assert.ok(first.y > CODE_METRICS.headerHeight + CODE_METRICS.headerGap);
    assert.equal(first.x, CODE_METRICS.paddingX);
  }
});

test("blank filename falls back to test.ts and an unknown extension draws no badge", () => {
  const { ctx, calls } = recordingContext();
  drawCodeBlock(ctx, { code: "x", filename: "", theme: "light" });
  assert.ok(calls.text.some((c) => c.text === "test.ts"));
  const plain = recordingContext();
  drawCodeBlock(plain.ctx, { code: "x", filename: "notes.txt", theme: "light" });
  assert.ok(!plain.calls.text.some((c) => /^(TS|TXT)$/.test(c.text)));
});

/* ------------------------------------------------------------------ element model */

test("code block elements are images carrying their source in customData", () => {
  const data = normalizeCodeBlockData({ code: "a\r\nb", filename: "x.py", theme: "dark" });
  assert.deepEqual(data, { v: 1, code: "a\nb", filename: "x.py", theme: "dark" });
  assert.equal(normalizeCodeBlockData({}).filename, "test.ts");
  assert.equal(normalizeCodeBlockData({ theme: "weird" }).theme, "light");
  const el = { id: "1", type: "image", x: 10, y: 20, width: 300, height: 200, customData: { codeBlock: data } };
  assert.ok(isCodeBlockElement(el));
  assert.ok(!isCodeBlockElement({ ...el, isDeleted: true }));
  assert.ok(!isCodeBlockElement({ ...el, type: "rectangle" }));
  assert.ok(!isCodeBlockElement({ id: "2", type: "image", customData: {} }));
  assert.equal(readCodeBlock(el).code, "a\nb");
  assert.equal(hitTestCodeBlock([el], { x: 20, y: 30 }), el);
  assert.equal(hitTestCodeBlock([el], { x: 500, y: 30 }), null);
  assert.equal(hitTestCodeBlock([el], { x: 313, y: 30 }, 6), el);
  assert.notEqual(codeBlockFileId(data), codeBlockFileId({ ...data, theme: "light" }));
  assert.equal(codeBlockFileId(data), codeBlockFileId({ ...data }));
});

test("scene glue: image elements via customData, theme refresh is not undoable, edits restore first", () => {
  const scene = read("../src/features/canvas/codeBlock/codeBlockScene.js");
  assert.match(scene, /type: "image"/);
  assert.match(scene, /mimeType: "image\/png"/); // SVG would be colour-inverted by Excalidraw's dark theme
  assert.match(scene, /rethemeCodeBlocks[\s\S]*CaptureUpdateAction\.NEVER/);
  const layer = read("../src/components/app/CodeBlockLayer.jsx");
  assert.ok(layer.indexOf("restoreCodeBlock(api, current.original)") < layer.indexOf("updateCodeBlock(api, current.id, data,"));
});

/* ------------------------------------------------------------------ CSS contract */

test("editor CSS matches the card spec and the copy button reveals on hover/focus", () => {
  const css = read("../src/styles/code-block.css");
  assert.match(css, /\.sk-code-editor__card \{[^}]*border: var\(--cb-border-width\) solid var\(--cb-border\)/);
  assert.match(css, /border-radius: var\(--cb-radius\)/);
  assert.match(css, /white-space: pre/);
  assert.match(css, /tab-size: var\(--cb-tab-size\)/);
  assert.match(css, /\.sk-code-editor:hover \.sk-code-editor__copy/);
  assert.match(css, /\.sk-code-editor:focus-within \.sk-code-editor__copy/);
  assert.match(css, /sketchizi-code-tool-active/);
  const editor = read("../src/components/app/CodeBlockEditor.jsx");
  assert.match(editor, /placeholder=\{FILENAME_PLACEHOLDER\}/);
  assert.match(editor, /"--cb-radius": `\$\{CODE_METRICS\.radius\}px`/);
  assert.match(editor, /marginBottom: CODE_METRICS\.headerGap/);
  assert.match(editor, /copied \? "Copied" : "Copy"/);
});

/* ------------------------------------------------------------------ resized blocks keep their size while editing */

test("a resized block's size is a floor: it never shrinks, and only grows when code overflows", async () => {
  const { getCodeBlockGeometry } = await import("../src/features/canvas/codeBlock/codeBlockLayout.js");
  const code = "class Test {}";
  const natural = measureCodeBlock(code, { charWidth: 8 });
  // Corner-resized 3x: element is 3x the natural box.
  const element = { width: natural.width * 3, height: natural.height * 3 };
  const geo = getCodeBlockGeometry(element, { code, box: { width: natural.width, height: natural.height } });
  assert.ok(Math.abs(geo.scale - 3) < 1e-9);
  assert.deepEqual(geo.box, { width: natural.width, height: natural.height });
  // Same short content with the floor keeps the resized natural size.
  const same = measureCodeBlock(code, { charWidth: 8, minWidth: geo.box.width, minHeight: geo.box.height });
  assert.equal(same.width, natural.width);
  assert.equal(same.height, natural.height);
  // A taller floor (edge-resized height) is honoured and not collapsed to content height.
  const tall = measureCodeBlock(code, { charWidth: 8, minWidth: 0, minHeight: 600 });
  assert.equal(tall.height, 600);
  // Overflowing content still grows past the floor.
  const grown = measureCodeBlock("x".repeat(120), { charWidth: 8, minWidth: natural.width, minHeight: natural.height });
  assert.ok(grown.width > natural.width);
  // Legacy blocks without `box` derive scale from their content measurement.
  const legacy = getCodeBlockGeometry({ width: 560, height: 400 }, { code: "" });
  assert.ok(legacy.scale > 0);
});

test("box is persisted only when present and changes the bitmap file id", () => {
  const plain = normalizeCodeBlockData({ code: "a", filename: "x.py", theme: "dark" });
  assert.equal("box" in plain, false);
  const boxed = normalizeCodeBlockData({ code: "a", filename: "x.py", theme: "dark", box: { width: 400.4, height: 200 } });
  assert.deepEqual(boxed.box, { width: 400, height: 200 });
  assert.notEqual(codeBlockFileId(plain), codeBlockFileId(boxed));
});

test("editor and layer wire the resize scale and box floor through edit sessions", () => {
  const layer = read("../src/components/app/CodeBlockLayer.jsx");
  assert.match(layer, /getCodeBlockGeometry\(element, data\)/);
  assert.match(layer, /updateCodeBlock\(api, current\.id, data, \{ scale: current\.scale \}\)/);
  const editor = read("../src/components/app/CodeBlockEditor.jsx");
  assert.match(editor, /minWidth: floor\?\.width, minHeight: floor\?\.height/);
});

test("Consolas-first CODE_FONT_FAMILY is the only code font: canvas, measurer, editor and stylesheet", async () => {
  const { CODE_FONT_FAMILY, CODE_METRICS } = await import("../src/features/canvas/codeBlock/codeBlockLayout.js");
  assert.equal(CODE_FONT_FAMILY, "'Consolas', 'Cascadia Code', 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, Monaco, monospace");
  // Canvas: header, badge and every token set ctx.font from the constant.
  const fonts = [];
  const ctx = new Proxy({}, {
    get: (t, k) => (k === "measureText" ? (text) => ({ width: String(text).length * 8 }) : k in t ? t[k] : () => {}),
    set: (t, k, v) => { if (k === "font") fonts.push(v); t[k] = v; return true; },
  });
  drawCodeBlock(ctx, { code: "int x = 1;", filename: "test.java", theme: "dark" }, measureCodeBlock("int x = 1;", { charWidth: 8 }));
  assert.ok(fonts.length >= 3);
  for (const f of fonts) assert.ok(f.endsWith(CODE_FONT_FAMILY), f);
  assert.ok(fonts.some((f) => f.startsWith(`600 ${CODE_METRICS.headerFontSize}px`)), "filename header");
  assert.ok(fonts.some((f) => f.startsWith(`700 ${CODE_METRICS.badgeFontSize}px`)), "language badge");
  // No hardcoded stacks in the stylesheet or editor / renderer sources.
  const css = read("../src/styles/code-block.css");
  assert.doesNotMatch(css, /monospace|JetBrains|Consolas/i);
  assert.match(css, /var\(--cb-font-family\)/);
  for (const f of ["../src/components/app/CodeBlockEditor.jsx", "../src/features/canvas/codeBlock/codeBlockRenderer.js"]) assert.doesNotMatch(read(f), /monospace|JetBrains/i, f);
  // Editor: textarea and pre share one typography object.
  const editor = read("../src/components/app/CodeBlockEditor.jsx");
  assert.equal((editor.match(/style=\{CODE_TYPOGRAPHY\}/g) || []).length, 2);
  for (const needle of [/fontFamily: CODE_FONT_FAMILY/, /fontVariantLigatures: "none"/, /letterSpacing: "0px"/, /tabSize: CODE_METRICS\.tabSize/]) assert.match(editor, needle);
});
