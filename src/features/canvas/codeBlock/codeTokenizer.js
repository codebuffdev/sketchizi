/**
 * Small line-oriented syntax tokenizer for the Code Block tool.
 *
 * tokenizeCode(code, language) -> Array<Array<{ text, type }>> (one token list
 * per line). Concatenating a line's token texts always reproduces the line
 * exactly, so the DOM editor and the canvas renderer can never drift apart.
 *
 * Token types: plain, keyword, type, string, number, function, decorator,
 * operator, punctuation, comment, property, tag, attr.
 *
 * State carried between lines handles block comments, triple-quoted strings,
 * template literals and (for HTML/CSS) tag / brace context.
 */

const words = (list) => new Set(list.split(/\s+/).filter(Boolean));

const TS_KEYWORDS = words(`abstract as async await break case catch class const continue debugger declare default delete do else enum export extends finally for from function get if implements import in instanceof interface is keyof let namespace new of override private protected public readonly return satisfies set static super switch this throw try type typeof var void while with yield true false null undefined`);
const TS_TYPES = words(`string number boolean any unknown never object symbol bigint void Array Promise Record Partial Required Readonly Pick Omit Map Set Date Error RegExp`);
const JAVA_KEYWORDS = words(`abstract assert break case catch class continue default do else enum extends final finally for if implements import instanceof interface native new package private protected public return static strictfp super switch synchronized this throw throws transient try var volatile while record sealed permits yield true false null`);
const JAVA_TYPES = words(`int long short byte float double char boolean void String Integer Long Double Boolean Object List Map Set Optional`);
const PY_KEYWORDS = words(`and as assert async await break class continue def del elif else except finally for from global if import in is lambda nonlocal not or pass raise return try while with yield match case True False None self cls`);
const PY_TYPES = words(`int str float bool list dict set tuple bytes object complex frozenset Any Optional Union List Dict Set Tuple Callable`);
const PY_BUILTINS = words(`print len range int str float bool list dict set tuple type isinstance enumerate zip map filter open sum min max abs sorted super`);
const SQL_KEYWORDS = words(`select from where and or not in is null as join inner left right full outer cross on group by order having limit offset insert into values update set delete create table alter drop index view database schema primary key foreign references unique default check constraint distinct union all case when then else end exists between like ilike asc desc with returning begin commit rollback truncate add column if cascade true false`);
const SQL_TYPES = words(`int integer bigint smallint serial text varchar char boolean bool date time timestamp timestamptz numeric decimal float real double json jsonb uuid blob`);
const BASH_KEYWORDS = words(`if then else elif fi for while until do done case esac in function select time return exit local readonly declare export`);
const BASH_BUILTINS = words(`echo cd ls cat grep sed awk find mkdir rm cp mv chmod chown curl wget git npm npx yarn pnpm docker kubectl sudo source set unset test read printf eval exec trap kill pwd head tail sort uniq xargs tar ssh`);
const CSS_KEYWORDS = words(`important inherit initial unset none auto`);

const NUMBER = /(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|\d[\d_]*\.?\d*(?:[eE][+-]?\d+)?[nLlFfDd]?|\.\d+(?:[eE][+-]?\d+)?)\b/y;
const IDENT = /[A-Za-z_$][\w$]*/y;
const SPACE = /[ \t]+/y;

function sticky(re, line, pos) {
  re.lastIndex = pos;
  const m = re.exec(line);
  return m && m.index === pos ? m[0] : null;
}

function push(tokens, text, type) {
  if (!text) return;
  const last = tokens[tokens.length - 1];
  if (last && last.type === type && type !== "function") last.text += text;
  else tokens.push({ text, type });
}

/** Ordinary identifier classification for C-like languages. */
function classifyWord(word, line, end, opts, start = 0) {
  if (opts.keywords.has(word)) return "keyword";
  if (opts.types.has(word)) return "type";
  if (/^[A-Z]$/.test(word)) return "type"; // generics: T, K, V
  if (/\b(?:class|interface|enum|extends|implements|new|type|record|throws|instanceof)\s+$/.test(line.slice(0, start)) && /^[A-Za-z_$]/.test(word)) return "type";
  const next = line.slice(end).match(/^\s*(<[^>(]*>\s*)?\(/);
  if (next) return /^[A-Z]/.test(word) && opts.pascalCallIsType ? "type" : "function";
  if (/^[A-Z][A-Za-z0-9_$]*$/.test(word) && /[a-z]/.test(word)) return "type";
  if (/^[A-Z][A-Z0-9_]+$/.test(word) && opts.upperConstIsNumber) return "number";
  return "plain";
}

/* ------------------------------------------------------------------ C-like (ts/js/java) */

function tokenizeCLike(line, state, opts) {
  const tokens = [];
  let pos = 0;
  let mode = state.mode || null; // "block" | "template" | "textblock"

  const scanUntil = (close, type) => {
    const idx = line.indexOf(close, pos);
    if (idx < 0) { push(tokens, line.slice(pos), type); pos = line.length; return false; }
    push(tokens, line.slice(pos, idx + close.length), type);
    pos = idx + close.length;
    return true;
  };

  if (mode === "block" && scanUntil("*/", "comment")) mode = null;
  else if (mode === "template" && scanTemplate()) mode = null;
  else if (mode === "textblock" && scanUntil('"""', "string")) mode = null;

  function scanTemplate() {
    let i = pos;
    while (i < line.length) {
      if (line[i] === "\\") { i += 2; continue; }
      if (line[i] === "`") { push(tokens, line.slice(pos, i + 1), "string"); pos = i + 1; return true; }
      i += 1;
    }
    push(tokens, line.slice(pos), "string");
    pos = line.length;
    return false;
  }

  while (pos < line.length) {
    if (mode) break; // still inside a multi-line construct that did not close on this line
    const ch = line[pos];
    const space = sticky(SPACE, line, pos);
    if (space) { push(tokens, space, "plain"); pos += space.length; continue; }
    if (line.startsWith("//", pos)) { push(tokens, line.slice(pos), "comment"); pos = line.length; break; }
    if (line.startsWith("/*", pos)) {
      push(tokens, "/*", "comment"); pos += 2;
      if (!scanUntil("*/", "comment")) mode = "block";
      continue;
    }
    if (opts.textBlocks && line.startsWith('"""', pos)) {
      push(tokens, '"""', "string"); pos += 3;
      if (!scanUntil('"""', "string")) mode = "textblock";
      continue;
    }
    if (ch === "`" && opts.templates) {
      push(tokens, "`", "string"); pos += 1;
      if (!scanTemplate()) mode = "template";
      continue;
    }
    if (ch === '"' || ch === "'") {
      let i = pos + 1;
      while (i < line.length && line[i] !== ch) i += line[i] === "\\" ? 2 : 1;
      push(tokens, line.slice(pos, Math.min(i + 1, line.length)), "string");
      pos = Math.min(i + 1, line.length);
      continue;
    }
    if (ch === "@" && /[A-Za-z_]/.test(line[pos + 1] || "")) {
      const name = sticky(/@[A-Za-z_$][\w$.]*/y, line, pos);
      push(tokens, name, "decorator"); pos += name.length; continue;
    }
    if (/\d/.test(ch) || (ch === "." && /\d/.test(line[pos + 1] || ""))) {
      const num = sticky(NUMBER, line, pos);
      if (num) { push(tokens, num, "number"); pos += num.length; continue; }
    }
    if (/[A-Za-z_$]/.test(ch)) {
      const word = sticky(IDENT, line, pos);
      const afterDot = line[pos - 1] === ".";
      let type = classifyWord(word, line, pos + word.length, opts, pos);
      if (afterDot && type === "keyword" && !["this", "super"].includes(word)) type = "plain";
      if (afterDot && type === "plain") type = "property";
      push(tokens, word, type); pos += word.length; continue;
    }
    if (/[{}()[\];,.]/.test(ch)) { push(tokens, ch, "punctuation"); pos += 1; continue; }
    if (/[+\-*/%=<>!&|^~?:]/.test(ch)) {
      const op = sticky(/[+\-*/%=<>!&|^~?:]+/y, line, pos);
      push(tokens, op, "operator"); pos += op.length; continue;
    }
    push(tokens, ch, "plain"); pos += 1;
  }
  if (pos < line.length) {
    // Remaining text belongs to an unterminated multi-line construct.
    push(tokens, line.slice(pos), mode === "block" ? "comment" : "string");
  }
  return { tokens, state: mode ? { mode } : {} };
}

const TS_OPTS = { keywords: TS_KEYWORDS, types: TS_TYPES, templates: true, textBlocks: false, pascalCallIsType: false, upperConstIsNumber: false };
const JS_OPTS = { ...TS_OPTS, types: words("Array Promise Map Set Date Error RegExp Object JSON Math") };
const JAVA_OPTS = { keywords: JAVA_KEYWORDS, types: JAVA_TYPES, templates: false, textBlocks: true, pascalCallIsType: true, upperConstIsNumber: false };

/* ------------------------------------------------------------------ Python */

function tokenizePython(line, state) {
  const tokens = [];
  let pos = 0;
  let mode = state.mode || null; // '"""' | "'''"
  const closeTriple = () => {
    const idx = line.indexOf(mode, pos);
    if (idx < 0) { push(tokens, line.slice(pos), "string"); pos = line.length; return; }
    push(tokens, line.slice(pos, idx + 3), "string"); pos = idx + 3; mode = null;
  };
  if (mode) closeTriple();
  while (pos < line.length) {
    const ch = line[pos];
    const space = sticky(SPACE, line, pos);
    if (space) { push(tokens, space, "plain"); pos += space.length; continue; }
    if (ch === "#") { push(tokens, line.slice(pos), "comment"); pos = line.length; break; }
    const prefix = sticky(/[rRbBfFuU]{0,2}(?=["'])/y, line, pos) ?? "";
    const q = line[pos + prefix.length];
    if (q === '"' || q === "'") {
      const triple = q.repeat(3);
      if (line.startsWith(triple, pos + prefix.length)) {
        push(tokens, line.slice(pos, pos + prefix.length + 3), "string");
        pos += prefix.length + 3; mode = triple; closeTriple(); continue;
      }
      let i = pos + prefix.length + 1;
      while (i < line.length && line[i] !== q) i += line[i] === "\\" ? 2 : 1;
      const end = Math.min(i + 1, line.length);
      push(tokens, line.slice(pos, end), "string"); pos = end; continue;
    }
    if (ch === "@" && /[A-Za-z_]/.test(line[pos + 1] || "")) {
      const name = sticky(/@[A-Za-z_][\w.]*/y, line, pos);
      push(tokens, name, "decorator"); pos += name.length; continue;
    }
    if (/\d/.test(ch)) {
      const num = sticky(/(?:0[xX][0-9a-fA-F_]+|\d[\d_]*\.?\d*(?:[eE][+-]?\d+)?j?)/y, line, pos);
      if (num) { push(tokens, num, "number"); pos += num.length; continue; }
    }
    if (/[A-Za-z_]/.test(ch)) {
      const word = sticky(IDENT, line, pos);
      const before = line.slice(0, pos);
      let type = "plain";
      if (PY_KEYWORDS.has(word)) type = "keyword";
      else if (/\bdef\s+$/.test(before)) type = "function";
      else if (/\bclass\s+$/.test(before)) type = "type";
      else if (/^\s*\(/.test(line.slice(pos + word.length))) type = PY_BUILTINS.has(word) ? "function" : /^[A-Z]/.test(word) ? "type" : "function";
      else if (/^[A-Z][A-Za-z0-9]*$/.test(word) && /[a-z]/.test(word)) type = "type";
      else if (before.endsWith(".")) type = "property";
      else if (PY_TYPES.has(word)) type = "type";
      push(tokens, word, type); pos += word.length; continue;
    }
    if (/[()[\]{},.;]/.test(ch)) { push(tokens, ch, "punctuation"); pos += 1; continue; }
    if (/[+\-*/%=<>!&|^~:@]/.test(ch)) {
      const op = sticky(/[+\-*/%=<>!&|^~:@]+/y, line, pos);
      push(tokens, op, "operator"); pos += op.length; continue;
    }
    push(tokens, ch, "plain"); pos += 1;
  }
  return { tokens, state: mode ? { mode } : {} };
}

/* ------------------------------------------------------------------ SQL */

function tokenizeSql(line, state) {
  const tokens = [];
  let pos = 0;
  let inBlock = state.mode === "block";
  if (inBlock) {
    const idx = line.indexOf("*/");
    if (idx < 0) return { tokens: [{ text: line, type: "comment" }], state: { mode: "block" } };
    push(tokens, line.slice(0, idx + 2), "comment"); pos = idx + 2; inBlock = false;
  }
  while (pos < line.length) {
    const ch = line[pos];
    const space = sticky(SPACE, line, pos);
    if (space) { push(tokens, space, "plain"); pos += space.length; continue; }
    if (line.startsWith("--", pos) || ch === "#") { push(tokens, line.slice(pos), "comment"); pos = line.length; break; }
    if (line.startsWith("/*", pos)) {
      const idx = line.indexOf("*/", pos + 2);
      if (idx < 0) { push(tokens, line.slice(pos), "comment"); pos = line.length; inBlock = true; break; }
      push(tokens, line.slice(pos, idx + 2), "comment"); pos = idx + 2; continue;
    }
    if (ch === "'" || ch === '"' || ch === "`") {
      let i = pos + 1;
      while (i < line.length && line[i] !== ch) i += 1;
      const end = Math.min(i + 1, line.length);
      push(tokens, line.slice(pos, end), ch === "'" ? "string" : "property"); pos = end; continue;
    }
    if (/\d/.test(ch)) {
      const num = sticky(/\d+\.?\d*(?:[eE][+-]?\d+)?/y, line, pos);
      push(tokens, num, "number"); pos += num.length; continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const word = sticky(/[A-Za-z_][\w]*/y, line, pos);
      const lower = word.toLowerCase();
      let type = "plain";
      if (SQL_KEYWORDS.has(lower)) type = "keyword";
      else if (SQL_TYPES.has(lower)) type = "type";
      else if (/\b(?:table|into|from|join|update|view|index|on|exists)\s+$/i.test(line.slice(0, pos))) type = "plain";
      else if (/^\s*\(/.test(line.slice(pos + word.length))) type = "function";
      push(tokens, word, type); pos += word.length; continue;
    }
    if (/[()[\];,.]/.test(ch)) { push(tokens, ch, "punctuation"); pos += 1; continue; }
    if (/[+\-*/%=<>!|&^~:]/.test(ch)) {
      const op = sticky(/[+\-*/%=<>!|&^~:]+/y, line, pos);
      push(tokens, op, "operator"); pos += op.length; continue;
    }
    push(tokens, ch, "plain"); pos += 1;
  }
  return { tokens, state: inBlock ? { mode: "block" } : {} };
}

/* ------------------------------------------------------------------ JSON */

function tokenizeJson(line) {
  const tokens = [];
  let pos = 0;
  while (pos < line.length) {
    const ch = line[pos];
    const space = sticky(SPACE, line, pos);
    if (space) { push(tokens, space, "plain"); pos += space.length; continue; }
    if (line.startsWith("//", pos)) { push(tokens, line.slice(pos), "comment"); pos = line.length; break; }
    if (ch === '"') {
      let i = pos + 1;
      while (i < line.length && line[i] !== '"') i += line[i] === "\\" ? 2 : 1;
      const end = Math.min(i + 1, line.length);
      const isKey = /^\s*:/.test(line.slice(end));
      push(tokens, line.slice(pos, end), isKey ? "property" : "string"); pos = end; continue;
    }
    const num = /[-\d]/.test(ch) ? sticky(/-?\d+\.?\d*(?:[eE][+-]?\d+)?/y, line, pos) : null;
    if (num) { push(tokens, num, "number"); pos += num.length; continue; }
    const lit = sticky(/\b(?:true|false|null)\b/y, line, pos);
    if (lit) { push(tokens, lit, "keyword"); pos += lit.length; continue; }
    if (/[{}[\],:]/.test(ch)) { push(tokens, ch, "punctuation"); pos += 1; continue; }
    push(tokens, ch, "plain"); pos += 1;
  }
  return { tokens, state: {} };
}

/* ------------------------------------------------------------------ Bash */

function tokenizeBash(line) {
  const tokens = [];
  let pos = 0;
  let atCommand = true;
  while (pos < line.length) {
    const ch = line[pos];
    const space = sticky(SPACE, line, pos);
    if (space) { push(tokens, space, "plain"); pos += space.length; continue; }
    if (ch === "#" && (pos === 0 || /\s/.test(line[pos - 1]))) { push(tokens, line.slice(pos), "comment"); pos = line.length; break; }
    if (ch === '"' || ch === "'") {
      let i = pos + 1;
      while (i < line.length && line[i] !== ch) i += ch === '"' && line[i] === "\\" ? 2 : 1;
      const end = Math.min(i + 1, line.length);
      push(tokens, line.slice(pos, end), "string"); pos = end; atCommand = false; continue;
    }
    if (ch === "$") {
      const variable = sticky(/\$(?:\{[^}]*\}|\([^)]*\)|[A-Za-z_]\w*|[0-9@#?!*$-])/y, line, pos);
      if (variable) { push(tokens, variable, "property"); pos += variable.length; atCommand = false; continue; }
    }
    if (ch === "-" && /[A-Za-z-]/.test(line[pos + 1] || "") && /\s|^$/.test(line[pos - 1] || " ")) {
      const flag = sticky(/--?[A-Za-z][\w-]*/y, line, pos);
      push(tokens, flag, "decorator"); pos += flag.length; continue;
    }
    if (/\d/.test(ch)) {
      const num = sticky(/\d+(?:\.\d+)?\b/y, line, pos);
      if (num) { push(tokens, num, "number"); pos += num.length; continue; }
    }
    if (/[A-Za-z_]/.test(ch)) {
      const word = sticky(/[A-Za-z_][\w.-]*/y, line, pos);
      let type = "plain";
      if (BASH_KEYWORDS.has(word)) { type = "keyword"; atCommand = true; }
      else if (BASH_BUILTINS.has(word) && atCommand) { type = "function"; atCommand = false; }
      else if (/^=/.test(line.slice(pos + word.length)) && atCommand) type = "property";
      else atCommand = false;
      push(tokens, word, type); pos += word.length; continue;
    }
    if (/[|&;(){}[\]<>=!]/.test(ch)) {
      const op = sticky(/[|&;<>]+|[(){}[\]=!]/y, line, pos);
      push(tokens, op, "operator"); pos += op.length;
      if (/[|&;(]/.test(op)) atCommand = true;
      continue;
    }
    push(tokens, ch, "plain"); pos += 1;
  }
  return { tokens, state: {} };
}

/* ------------------------------------------------------------------ YAML */

function tokenizeYaml(line, state) {
  const tokens = [];
  let pos = 0;
  const keyMatch = line.match(/^(\s*(?:-\s+)*)((?:"[^"]*"|'[^']*'|[^\s#:'"][^#:]*?))(\s*:)(?=\s|$)/);
  if (keyMatch) {
    push(tokens, keyMatch[1], "plain");
    push(tokens, keyMatch[2], "property");
    push(tokens, keyMatch[3], "punctuation");
    pos = keyMatch[0].length;
  }
  while (pos < line.length) {
    const ch = line[pos];
    const space = sticky(SPACE, line, pos);
    if (space) { push(tokens, space, "plain"); pos += space.length; continue; }
    if (ch === "#" && (pos === 0 || /\s/.test(line[pos - 1]))) { push(tokens, line.slice(pos), "comment"); pos = line.length; break; }
    if (ch === '"' || ch === "'") {
      let i = pos + 1;
      while (i < line.length && line[i] !== ch) i += ch === '"' && line[i] === "\\" ? 2 : 1;
      const end = Math.min(i + 1, line.length);
      push(tokens, line.slice(pos, end), "string"); pos = end; continue;
    }
    if (ch === "-" && /^\s*$/.test(line.slice(0, pos)) && /\s|$/.test(line[pos + 1] || " ")) { push(tokens, "-", "punctuation"); pos += 1; continue; }
    if (/[&*!]/.test(ch)) {
      const anchor = sticky(/[&*!][\w./-]*/y, line, pos);
      push(tokens, anchor, "decorator"); pos += anchor.length; continue;
    }
    if (/[|>]/.test(ch) && /^\s*$/.test(line.slice(pos + 1))) { push(tokens, ch, "operator"); pos += 1; continue; }
    const num = /[-\d]/.test(ch) ? sticky(/-?\d+(?:\.\d+)?(?![\w.-])/y, line, pos) : null;
    if (num) { push(tokens, num, "number"); pos += num.length; continue; }
    const lit = sticky(/(?:true|false|null|yes|no|on|off|~)(?![\w-])/iy, line, pos);
    if (lit) { push(tokens, lit, "keyword"); pos += lit.length; continue; }
    if (/[[\]{},]/.test(ch)) { push(tokens, ch, "punctuation"); pos += 1; continue; }
    // plain scalar run
    const run = sticky(/[^\s#[\]{},"'&*!|>][^#[\]{},]*?(?=\s+#|[[\]{},]|$)/y, line, pos) ?? ch;
    push(tokens, run, "string"); pos += run.length;
  }
  return { tokens, state };
}

/* ------------------------------------------------------------------ HTML */

function tokenizeHtml(line, state) {
  const tokens = [];
  let pos = 0;
  let mode = state.mode || null; // "comment" | "tag"
  if (mode === "comment") {
    const idx = line.indexOf("-->");
    if (idx < 0) return { tokens: [{ text: line, type: "comment" }], state: { mode } };
    push(tokens, line.slice(0, idx + 3), "comment"); pos = idx + 3; mode = null;
  }
  while (pos < line.length) {
    const ch = line[pos];
    if (mode === "tag") {
      const space = sticky(SPACE, line, pos);
      if (space) { push(tokens, space, "plain"); pos += space.length; continue; }
      if (ch === ">" || line.startsWith("/>", pos)) {
        const close = ch === ">" ? ">" : "/>";
        push(tokens, close, "punctuation"); pos += close.length; mode = null; continue;
      }
      if (ch === '"' || ch === "'") {
        let i = pos + 1;
        while (i < line.length && line[i] !== ch) i += 1;
        const end = Math.min(i + 1, line.length);
        push(tokens, line.slice(pos, end), "string"); pos = end; continue;
      }
      if (ch === "=") { push(tokens, "=", "operator"); pos += 1; continue; }
      const attr = sticky(/[^\s=<>"'/]+/y, line, pos);
      if (attr) { push(tokens, attr, "attr"); pos += attr.length; continue; }
      push(tokens, ch, "plain"); pos += 1; continue;
    }
    if (line.startsWith("<!--", pos)) {
      const idx = line.indexOf("-->", pos + 4);
      if (idx < 0) { push(tokens, line.slice(pos), "comment"); pos = line.length; mode = "comment"; break; }
      push(tokens, line.slice(pos, idx + 3), "comment"); pos = idx + 3; continue;
    }
    if (line.startsWith("<!", pos)) {
      const m = sticky(/<![^>]*>?/y, line, pos);
      push(tokens, m, "keyword"); pos += m.length; continue;
    }
    const open = sticky(/<\/?[A-Za-z][\w:-]*/y, line, pos);
    if (open) {
      const bracket = open.startsWith("</") ? "</" : "<";
      push(tokens, bracket, "punctuation");
      push(tokens, open.slice(bracket.length), "tag");
      pos += open.length; mode = "tag"; continue;
    }
    const entity = sticky(/&#?\w+;/y, line, pos);
    if (entity) { push(tokens, entity, "number"); pos += entity.length; continue; }
    const text = sticky(/[^<&]+/y, line, pos) ?? ch;
    push(tokens, text, "plain"); pos += text.length;
  }
  return { tokens, state: mode ? { mode } : {} };
}

/* ------------------------------------------------------------------ CSS */

function tokenizeCss(line, state) {
  const tokens = [];
  let pos = 0;
  let mode = state.mode === "block" ? "block" : null;
  let depth = state.depth || 0;
  let inValue = Boolean(state.inValue);
  if (mode === "block") {
    const idx = line.indexOf("*/");
    if (idx < 0) return { tokens: [{ text: line, type: "comment" }], state: { ...state } };
    push(tokens, line.slice(0, idx + 2), "comment"); pos = idx + 2; mode = null;
  }
  while (pos < line.length) {
    const ch = line[pos];
    const space = sticky(SPACE, line, pos);
    if (space) { push(tokens, space, "plain"); pos += space.length; continue; }
    if (line.startsWith("/*", pos)) {
      const idx = line.indexOf("*/", pos + 2);
      if (idx < 0) { push(tokens, line.slice(pos), "comment"); pos = line.length; mode = "block"; break; }
      push(tokens, line.slice(pos, idx + 2), "comment"); pos = idx + 2; continue;
    }
    if (ch === '"' || ch === "'") {
      let i = pos + 1;
      while (i < line.length && line[i] !== ch) i += line[i] === "\\" ? 2 : 1;
      const end = Math.min(i + 1, line.length);
      push(tokens, line.slice(pos, end), "string"); pos = end; continue;
    }
    if (ch === "{") { depth += 1; inValue = false; push(tokens, ch, "punctuation"); pos += 1; continue; }
    if (ch === "}") { depth = Math.max(0, depth - 1); inValue = false; push(tokens, ch, "punctuation"); pos += 1; continue; }
    if (ch === ";") { inValue = false; push(tokens, ch, "punctuation"); pos += 1; continue; }
    if (ch === "@") {
      const at = sticky(/@[\w-]+/y, line, pos);
      push(tokens, at, "keyword"); pos += at.length; continue;
    }
    if (ch === "#" && inValue) {
      const hex = sticky(/#[0-9a-fA-F]{3,8}\b/y, line, pos);
      if (hex) { push(tokens, hex, "number"); pos += hex.length; continue; }
    }
    if (/[\d]/.test(ch) || (ch === "." && /\d/.test(line[pos + 1] || "")) || (ch === "-" && inValue && /[\d.]/.test(line[pos + 1] || ""))) {
      const num = sticky(/-?(?:\d+\.?\d*|\.\d+)(?:%|[a-zA-Z]{1,4})?/y, line, pos);
      if (num && (inValue || depth === 0)) { push(tokens, num, "number"); pos += num.length; continue; }
    }
    if (ch === "!" ) {
      const imp = sticky(/!\s*important/y, line, pos);
      if (imp) { push(tokens, imp, "keyword"); pos += imp.length; continue; }
    }
    if (/[A-Za-z_-]/.test(ch)) {
      const word = sticky(/-{0,2}[A-Za-z_][\w-]*/y, line, pos) ?? ch;
      const rest = line.slice(pos + word.length);
      let type = "plain";
      if (depth > 0 && !inValue && /^\s*:(?!:)/.test(rest)) type = "property";
      else if (/^\(/.test(rest)) type = "function";
      else if (inValue) type = CSS_KEYWORDS.has(word) ? "keyword" : "plain";
      else if (depth === 0 && line[pos - 1] === ":") type = "function";
      else if (depth === 0) type = /^[a-z][a-z0-9]*$/.test(word) ? "tag" : "type";
      push(tokens, word, type); pos += word.length; continue;
    }
    if (ch === ":") {
      if (depth > 0 && !inValue && !line.startsWith("::", pos)) inValue = true;
      push(tokens, ch, depth === 0 ? "operator" : "punctuation"); pos += 1; continue;
    }
    if ((ch === "." || ch === "#") && depth === 0) {
      const sel = sticky(/[.#][\w-]+/y, line, pos);
      if (sel) { push(tokens, sel, "type"); pos += sel.length; continue; }
    }
    if (/[()[\],>+~*=|^$/]/.test(ch)) { push(tokens, ch, "punctuation"); pos += 1; continue; }
    push(tokens, ch, "plain"); pos += 1;
  }
  return { tokens, state: { mode, depth, inValue } };
}

/* ------------------------------------------------------------------ public API */

function tokenizeLine(line, language, state) {
  switch (language) {
    case "typescript": return tokenizeCLike(line, state, TS_OPTS);
    case "javascript": return tokenizeCLike(line, state, JS_OPTS);
    case "java": return tokenizeCLike(line, state, JAVA_OPTS);
    case "python": return tokenizePython(line, state);
    case "sql": return tokenizeSql(line, state);
    case "json": return tokenizeJson(line, state);
    case "bash": return tokenizeBash(line, state);
    case "yaml": return tokenizeYaml(line, state);
    case "html": return tokenizeHtml(line, state);
    case "css": return tokenizeCss(line, state);
    default: return { tokens: line ? [{ text: line, type: "plain" }] : [], state };
  }
}

/** Tokenize a whole snippet. Returns one token array per line ("\n"-separated). */
export function tokenizeCode(code, language = "plain") {
  const lines = String(code ?? "").replace(/\r\n?/g, "\n").split("\n");
  let state = {};
  return lines.map((line) => {
    const result = tokenizeLine(line, language, state);
    state = result.state || {};
    return result.tokens;
  });
}
