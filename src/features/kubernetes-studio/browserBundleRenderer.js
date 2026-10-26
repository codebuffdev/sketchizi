import { parseAllDocuments, parseDocument, stringify } from "yaml";

const clean = (value) => String(value || "").replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\.\//, "");
const normalizePath = (value) => {
  const stack = [];
  for (const part of clean(value).split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") { if (stack.length) stack.pop(); continue; }
    stack.push(part);
  }
  return stack.join("/");
};
const dirname = (value) => { const p = clean(value).split("/"); p.pop(); return p.join("/"); };
const join = (...parts) => normalizePath(parts.filter(Boolean).join("/"));
const basename = (value) => clean(value).split("/").pop() || "";
const clone = (value) => value == null ? value : JSON.parse(JSON.stringify(value));

function readYaml(text, label) {
  const doc = parseDocument(text, { prettyErrors: true, uniqueKeys: true });
  if (doc.errors.length) throw new Error(label + ": " + doc.errors[0].message);
  return doc.toJSON();
}

function documents(text, label) {
  const docs = parseAllDocuments(text, { prettyErrors: true, uniqueKeys: true });
  const failure = docs.find((doc) => doc.errors.length);
  if (failure) throw new Error(label + ": " + failure.errors[0].message);
  return docs.map((doc) => doc.toJSON()).filter((value) => value && typeof value === "object");
}

function mergeObject(target, patch) {
  for (const [key, value] of Object.entries(patch || {})) {
    if (value && typeof value === "object" && !Array.isArray(value)) {
      target[key] = mergeObject(target[key] && typeof target[key] === "object" ? target[key] : {}, value);
    } else target[key] = clone(value);
  }
  return target;
}

function applyKustomizeTransform(resources, config) {
  return resources.map((original) => {
    const resource = clone(original);
    const meta = resource.metadata ||= {};
    if (config.namespace && resource.kind !== "Namespace" && !["Node", "PersistentVolume", "StorageClass", "ClusterRole", "ClusterRoleBinding"].includes(resource.kind)) meta.namespace = config.namespace;
    if (meta.name && resource.kind !== "Namespace" && config.namePrefix) meta.name = config.namePrefix + meta.name;
    if (meta.name && resource.kind !== "Namespace" && config.nameSuffix) meta.name += config.nameSuffix;
    if (config.commonLabels) meta.labels = { ...(meta.labels || {}), ...config.commonLabels };
    if (config.commonAnnotations) meta.annotations = { ...(meta.annotations || {}), ...config.commonAnnotations };
    if (Array.isArray(config.images)) {
      const replaceImage = (node) => {
        if (!node || typeof node !== "object") return;
        if (Array.isArray(node)) { node.forEach(replaceImage); return; }
        if (typeof node.image === "string") {
          const old = node.image;
          const image = config.images.find((entry) => old === entry.name || old.startsWith(entry.name + ":") || old.startsWith(entry.name + "@"));
          if (image) node.image = (image.newName || image.name) + (image.digest ? "@" + image.digest : image.newTag ? ":" + image.newTag : old.includes(":") ? ":" + old.split(":").pop() : "");
        }
        Object.values(node).forEach(replaceImage);
      };
      replaceImage(resource.spec);
    }
    return resource;
  });
}

export function renderKustomizeBundle(bundleFiles, sourcePath) {
  const fileMap = new Map(bundleFiles.map((file) => [clean(file.name), file.text]));
  const rootSource = clean(sourcePath);
  const seen = new Set();

  function build(kustomizationPath) {
    if (seen.has(kustomizationPath)) throw new Error("Kustomize resource cycle detected at " + kustomizationPath);
    seen.add(kustomizationPath);
    const config = readYaml(fileMap.get(kustomizationPath), kustomizationPath) || {};
    const base = dirname(kustomizationPath);
    const resources = [];
    for (const entry of config.resources || []) {
      const target = join(base, entry);
      const direct = fileMap.get(target);
      if (direct !== undefined) resources.push(...documents(direct, target));
      else {
        const nested = [join(target, "kustomization.yaml"), join(target, "kustomization.yml"), join(target, "Kustomization")].find((path) => fileMap.has(path));
        if (nested) resources.push(...build(nested));
        else throw new Error("Kustomize resource was not found in the imported bundle: " + entry);
      }
    }
    for (const generator of config.configMapGenerator || []) {
      const data = { ...(generator.literals || []).reduce((acc, literal) => { const i = literal.indexOf("="); if (i > 0) acc[literal.slice(0, i)] = literal.slice(i + 1); return acc; }, {}) };
      for (const file of generator.files || []) {
        const [key, path] = file.includes("=") ? file.split(/=(.*)/s).slice(0, 2) : [basename(file), file];
        const text = fileMap.get(join(base, path));
        if (text === undefined) throw new Error("ConfigMap generator file not found: " + path);
        data[key] = text;
      }
      resources.push({ apiVersion: "v1", kind: "ConfigMap", metadata: { name: (generator.name || "generated") + (config.nameSuffix || "") }, data });
    }
    for (const generator of config.secretGenerator || []) {
      const data = { ...(generator.literals || []).reduce((acc, literal) => { const i = literal.indexOf("="); if (i > 0) acc[literal.slice(0, i)] = literal.slice(i + 1); return acc; }, {}) };
      for (const file of generator.files || []) {
        const [key, path] = file.includes("=") ? file.split(/=(.*)/s).slice(0, 2) : [basename(file), file];
        const text = fileMap.get(join(base, path));
        if (text === undefined) throw new Error("Secret generator file not found: " + path);
        data[key] = text;
      }
      resources.push({ apiVersion: "v1", kind: "Secret", type: "Opaque", metadata: { name: (generator.name || "generated") + (config.nameSuffix || "") }, stringData: data });
    }
    for (const patch of config.patches || config.patchesStrategicMerge || []) {
      const patchValue = typeof patch === "string" ? readYaml(fileMap.get(join(base, patch)), patch) : patch;
      if (!patchValue) continue;
      const target = resources.find((item) => item.kind === patchValue.kind && item.metadata?.name === patchValue.metadata?.name && (!patchValue.metadata?.namespace || item.metadata?.namespace === patchValue.metadata.namespace));
      if (target) mergeObject(target, patchValue);
    }
    seen.delete(kustomizationPath);
    return applyKustomizeTransform(resources, config);
  }

  if (!fileMap.has(rootSource)) throw new Error("The selected Kustomization file is missing from the imported bundle.");
  const rendered = build(rootSource);
  if (!rendered.length) throw new Error("Kustomize produced no Kubernetes resources. Check the resources list in " + rootSource + ".");
  return rendered.map((item) => stringify(item).trimEnd()).join("\n---\n") + "\n";
}

function deepMerge(left, right) {
  const result = clone(left || {});
  for (const [key, value] of Object.entries(right || {})) {
    result[key] = value && typeof value === "object" && !Array.isArray(value)
      ? deepMerge(result[key] && typeof result[key] === "object" ? result[key] : {}, value)
      : clone(value);
  }
  return result;
}

function lookup(context, expression) {
  const expr = String(expression || "").trim();
  if (!expr || expr === ".") return context.__dot ?? context;
  if (expr.startsWith("$")) {
    const parts = expr.slice(1).split(".");
    let value = context[parts.shift()];
    for (const part of parts) value = value == null ? undefined : value[part];
    return value;
  }
  if (expr.startsWith(".")) {
    const parts = expr.slice(1).split(".");
    const first = parts.shift();
    let value = ["Values", "Release", "Chart"].includes(first) ? context[first] : (context.__dot ?? context);
    if (!["Values", "Release", "Chart"].includes(first)) parts.unshift(first);
    for (const part of parts) value = value == null ? undefined : value[part];
    return value;
  }
  if (/^-?\d+(?:\.\d+)?$/.test(expr)) return Number(expr);
  if (expr === "true") return true;
  if (expr === "false") return false;
  if (expr === "nil" || expr === "null") return null;
  if ((expr.startsWith('"') && expr.endsWith('"')) || (expr.startsWith("'") && expr.endsWith("'"))) return expr.slice(1, -1);
  return context[expr];
}

function truthy(value) {
  return !(value == null || value === false || value === 0 || value === "");
}

function parseArgs(source, context) {
  const tokens = String(source || "").match(/"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|[^\s]+/g) || [];
  return tokens.map((token) => {
    if (token.startsWith('"') && token.endsWith('"')) { try { return JSON.parse(token); } catch { return token.slice(1, -1); } }
    if (token.startsWith("'") && token.endsWith("'")) return token.slice(1, -1);
    if (token === ".") return lookup(context, ".");
    if (token.startsWith(".") || token.startsWith("$") || token === "true" || token === "false" || token === "nil" || token === "null" || /^-?\d+(?:\.\d+)?$/.test(token)) return lookup(context, token);
    return token;
  });
}

function callTemplateFunction(name, args) {
  const [a, b, d] = args;
  switch (name) {
    case "default": return truthy(b) ? b : a;
    case "quote": return JSON.stringify(String(a ?? ""));
    case "toYaml": return stringify(a).trimEnd();
    case "toJson": return JSON.stringify(a);
    case "indent":
    case "nindent": {
      const indent = " ".repeat(Math.min(80, Math.max(0, Number(a || 0))));
      const result = String(b ?? "").split("\n").map((line) => indent + line).join("\n");
      return name === "nindent" ? "\n" + result : result;
    }
    case "upper": return String(a ?? "").toUpperCase();
    case "lower": return String(a ?? "").toLowerCase();
    case "trim": return String(a ?? "").trim();
    case "trimSuffix": return String(b ?? "").endsWith(String(a)) ? String(b ?? "").slice(0, -String(a).length) : String(b ?? "");
    case "trimPrefix": return String(b ?? "").startsWith(String(a)) ? String(b ?? "").slice(String(a).length) : String(b ?? "");
    case "trunc": return String(b ?? "").slice(0, Math.max(0, Number(a || 0)));
    case "contains": return String(b ?? "").includes(String(a ?? ""));
    case "hasKey": return a != null && Object.prototype.hasOwnProperty.call(a, b);
    case "not": return !truthy(a);
    case "and": return args.every(truthy);
    case "or": return args.find(truthy) ?? args[args.length - 1];
    case "eq": return args.every((value) => value === args[0]);
    case "ne": return args.length > 1 && args[0] !== args[1];
    case "printf": {
      const format = String(a ?? "");
      let index = 1;
      return format.replace(/%[sdvqx]/g, (token) => {
        const value = args[index++];
        if (token === "%q") return JSON.stringify(String(value ?? ""));
        if (token === "%d") return String(Number(value));
        if (token === "%x") return Number(value).toString(16);
        return String(value ?? "");
      });
    }
    case "replace": return String(d ?? "").split(String(a ?? "")).join(String(b ?? ""));
    case "required": if (!truthy(b)) throw new Error("Required Helm value is missing: " + String(a ?? "")); return b;
    default: throw new Error("The Helm chart uses unsupported template function '" + name + "'. No diagram was created; the existing canvas is unchanged.");
  }
}

function evaluateExpression(expression, context) {
  const stages = String(expression || "").split(/\s+\|\s+/);
  const first = stages.shift() || "";
  const tokens = first.trim().match(/"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|[^\s]+/g) || [];
  let value;
  const functions = new Set(["default", "quote", "toYaml", "toJson", "indent", "nindent", "upper", "lower", "trim", "trimSuffix", "trimPrefix", "trunc", "contains", "hasKey", "not", "and", "or", "eq", "ne", "printf", "replace", "required"]);
  if (tokens.length > 1 && functions.has(tokens[0])) value = callTemplateFunction(tokens[0], parseArgs(tokens.slice(1).join(" "), context));
  else if (tokens.length === 1 && functions.has(tokens[0])) value = callTemplateFunction(tokens[0], []);
  else value = lookup(context, first.trim());
  for (const stage of stages) {
    const tokens = stage.trim().match(/"(?:\\.|[^"])*"|'(?:\\.|[^'])*'|[^\s]+/g) || [];
    const name = tokens.shift();
    value = callTemplateFunction(name, [...parseArgs(tokens.join(" "), context), value]);
  }
  return value;
}

function findBlock(source, opening) {
  const directives = /{{-?\s*(if|with|range|else(?:\s+if)?|end)\b([^}]*)-?}}/g;
  directives.lastIndex = opening.end;
  let depth = 1;
  let firstElse = null;
  let token;
  while ((token = directives.exec(source))) {
    const kind = token[1].split(/\s+/)[0];
    if (["if", "with", "range"].includes(kind)) depth += 1;
    else if (kind === "end") {
      depth -= 1;
      if (depth === 0) return { endStart: token.index, end: directives.lastIndex, elseToken: firstElse };
    } else if (kind === "else" && depth === 1 && !firstElse) firstElse = { start: token.index, end: directives.lastIndex, expression: token[2].replace(/^\s*if\s+/, "").trim(), isElseIf: token[1].includes("if") };
  }
  throw new Error("A Helm template block is missing its closing {{ end }}.");
}

function renderBlocks(source, context, namedTemplates) {
  for (let pass = 0; pass < 100; pass++) {
    const match = /{{(-?)\s*(if|with|range)\s+([^}]+?)\s*(-?)}}/.exec(source);
    if (!match) break;
    const opening = { index: match.index, end: match.index + match[0].length, leftTrim: Boolean(match[1]), rightTrim: Boolean(match[4]), kind: match[2], expression: match[3].trim() };
    const block = findBlock(source, opening);
    let body = source.slice(opening.end, block.elseToken ? block.elseToken.start : block.endStart);
    let otherwise = block.elseToken ? source.slice(block.elseToken.end, block.endStart) : "";
    if (opening.rightTrim) body = body.replace(/^\s+/, "");
    const closingTag = source.slice(block.endStart, block.end);
    if (/^{{-/.test(closingTag)) body = body.replace(/\s+$/, "");
    if (opening.kind === "if") {
      const condition = opening.expression.startsWith("not ") ? !truthy(evaluateExpression(opening.expression.slice(4), context)) : truthy(evaluateExpression(opening.expression, context));
      if (block.elseToken?.isElseIf && !condition) otherwise = "{{ if " + block.elseToken.expression + " }}" + otherwise + "{{ end }}";
      body = condition ? renderBlocks(body, context, namedTemplates) : renderBlocks(otherwise, context, namedTemplates);
    } else if (opening.kind === "with") {
      const value = evaluateExpression(opening.expression, context);
      body = truthy(value) ? renderBlocks(body, { ...context, __dot: value }, namedTemplates) : renderBlocks(otherwise, context, namedTemplates);
    } else {
      const rangeMatch = opening.expression.match(/^(?:(\$[\w]+)(?:\s*,\s*(\$[\w]+))?\s*:=\s*)?(.+)$/);
      const value = evaluateExpression(rangeMatch?.[3] || opening.expression, context);
      const entries = Array.isArray(value) ? value.map((item, index) => [index, item]) : value && typeof value === "object" ? Object.entries(value) : [];
      body = entries.map(([key, item]) => {
        const scoped = { ...context, __dot: item };
        if (item && typeof item === "object" && !Array.isArray(item)) Object.assign(scoped, item);
        if (rangeMatch?.[1] && rangeMatch?.[2]) { scoped[rangeMatch[1].slice(1)] = key; scoped[rangeMatch[2].slice(1)] = item; }
        else if (rangeMatch?.[1]) scoped[rangeMatch[1].slice(1)] = item;
        return renderBlocks(body, scoped, namedTemplates);
      }).join("");
    }
    let prefix = source.slice(0, opening.index);
    let suffix = source.slice(block.end);
    if (opening.leftTrim) prefix = prefix.replace(/\s+$/, "");
    if (/{{[^}]*-}}$/.test(closingTag)) suffix = suffix.replace(/^\s+/, "");
    source = prefix + body + suffix;
  }
  if (/{{-?\s*(?:if|with|range|else|end)\b/.test(source)) throw new Error("The Helm chart uses nested or advanced template directives that this browser renderer cannot safely resolve. No diagram was created; the existing canvas is unchanged.");
  return source;
}

function renderSimpleTemplate(template, context, namedTemplates) {
  let source = stripTemplateDefinitions(template, namedTemplates);
  source = source.replace(/\s*{{-/g, "{{-").replace(/-}}\s*/g, "-}}");
  source = source.replace(/{{-?\s*(?:include|template)\s+"([^"]+)"(?:\s+\.)?([^}]*)-?}}/g, (_, name, tail = "") => {
    const body = namedTemplates.get(name);
    if (body === undefined) throw new Error("Helm helper '" + name + "' is not defined in the selected chart.");
    let value = renderSimpleTemplate(body, context, namedTemplates);
    const stages = tail.split("|").map((stage) => stage.trim()).filter(Boolean);
    for (const stage of stages) {
      const [fn, ...args] = stage.split(/\s+/);
      value = callTemplateFunction(fn, [...parseArgs(args.join(" "), context), value]);
    }
    return value;
  });
  source = renderBlocks(source, context, namedTemplates);
  source = source.replace(/{{-?\s*(\$\w+)\s*:=\s*([^}]+?)\s*-?}}/g, (_, variable, expression) => {
    context[variable.slice(1)] = evaluateExpression(expression, context);
    return "";
  });
  source = source.replace(/{{-?\s*([^{}]+?)\s*-?}}/g, (_, expression) => {
    const expr = expression.trim();
    if (/^(?:else|end|\/\*|\*)/.test(expr)) return "";
    return evaluateExpression(expr, context) ?? "";
  });
  if (/{{[\s\S]*?}}/.test(source)) throw new Error("The selected Helm chart uses template features not supported by Sketchizi's browser renderer. No diagram was created; the existing canvas is unchanged.");
  return source;
}

export function renderHelmBundle(bundleFiles, chartFilePath, valuesFilePath = "", releaseName = "sketchizi") {
  const fileMap = new Map(bundleFiles.map((file) => [clean(file.name), file.text]));
  const chartDir = dirname(chartFilePath);
  const chart = readYaml(fileMap.get(chartFilePath), chartFilePath) || {};
  const defaultsPath = join(chartDir, "values.yaml");
  let values = defaultsPath && fileMap.has(defaultsPath) ? readYaml(fileMap.get(defaultsPath), defaultsPath) || {} : {};
  if (valuesFilePath) {
    if (!fileMap.has(valuesFilePath)) throw new Error("The selected Helm values file is missing from the bundle.");
    values = deepMerge(values, readYaml(fileMap.get(valuesFilePath), valuesFilePath) || {});
  }
  const context = {
    Values: values,
    Release: { Name: releaseName, Namespace: "default", Service: "Helm", IsInstall: true, IsUpgrade: false },
    Chart: { Name: String(chart.name || basename(chartDir)), Version: String(chart.version || "0.1.0"), AppVersion: String(chart.appVersion || "") },
  };
  const templates = [...fileMap.entries()].filter(([path]) => path.startsWith(join(chartDir, "templates") + "/") && /\.(?:ya?ml|tpl)$/i.test(path));
  if (!templates.length) throw new Error("No Helm templates were found in " + chartDir + "/templates.");
  const namedTemplates = new Map();
  const rendered = templates.sort(([a], [b]) => a.localeCompare(b)).map(([path, template]) => renderSimpleTemplate(template, context, namedTemplates)).filter((text) => text.trim() && !/^\s*# Source:/m.test(text) || text.trim());
  const yaml = rendered.join("\n---\n");
  const docs = documents(yaml, "Rendered Helm chart");
  if (!docs.length) throw new Error("The Helm chart rendered no Kubernetes resources.");
  return docs.map((item) => stringify(item).trimEnd()).join("\n---\n") + "\n";
}
