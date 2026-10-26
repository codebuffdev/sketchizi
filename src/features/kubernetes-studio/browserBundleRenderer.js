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
  const expr = expression.trim().replace(/^\$/, "");
  if (!expr || expr === ".") return context;
  const parts = expr.replace(/^\./, "").split(".");
  let value = context;
  for (const part of parts) value = value == null ? undefined : value[part];
  return value;
}

function helmValue(expression, context) {
  const tokens = expression.trim().split(/\s+\|\s+/);
  let value = lookup(context, tokens.shift() || "");
  for (const token of tokens) {
    const [fn, ...args] = token.trim().split(/\s+/);
    const arg = args.join(" ").replace(/^["']|["']$/g, "");
    if (fn === "quote") value = JSON.stringify(String(value ?? ""));
    else if (fn === "upper") value = String(value ?? "").toUpperCase();
    else if (fn === "lower") value = String(value ?? "").toLowerCase();
    else if (fn === "default") value = value == null || value === "" || value === false ? arg : value;
    else if (fn === "trim") value = String(value ?? "").trim();
    else if (fn === "toString") value = String(value ?? "");
    else if (fn === "toYaml") value = stringify(value).trimEnd();
    else if (fn === "indent" || fn === "nindent") {
      const count = Number(args[0] || 0);
      const indent = " ".repeat(Math.min(80, Math.max(0, count)));
      value = String(value ?? "").split("\n").map((line) => indent + line).join("\n");
      if (fn === "nindent") value = "\n" + value;
    } else if (fn === "required") {
      if (value == null || value === "") throw new Error("Helm required value missing: " + arg);
    } else throw new Error("This Helm template uses unsupported function '" + fn + "'. Use a chart that does not require this function or render it with the full Helm CLI.");
  }
  if (value == null) return "";
  if (typeof value === "object") return stringify(value).trimEnd();
  return String(value);
}

function stripTemplateDefinitions(source, namedTemplates) {
  const directive = /{{-?\s*(define|if|range|with|end)\b(?:\s+"([^"]+)")?[^}]*-?}}/g;
  let output = "";
  let cursor = 0;
  while (true) {
    const opening = directive.exec(source);
    if (!opening) break;
    if (opening[1] !== "define") continue;
    output += source.slice(cursor, opening.index);
    const bodyStart = directive.lastIndex;
    const scanner = /{{-?\s*(define|if|range|with|end)\b(?:\s+"([^"]+)")?[^}]*-?}}/g;
    scanner.lastIndex = bodyStart;
    let depth = 1;
    let closing = null;
    let token;
    while ((token = scanner.exec(source))) {
      if (["define", "if", "range", "with"].includes(token[1])) depth += 1;
      else if (token[1] === "end") depth -= 1;
      if (depth === 0) { closing = token; break; }
    }
    if (!closing) throw new Error("Helm helper '" + opening[2] + "' has an unterminated template block.");
    namedTemplates.set(opening[2], source.slice(bodyStart, closing.index));
    cursor = scanner.lastIndex;
    directive.lastIndex = cursor;
  }
  output += source.slice(cursor);
  return output;
}

function renderSimpleTemplate(template, context, namedTemplates) {
  let source = stripTemplateDefinitions(template, namedTemplates);
  source = source.replace(/{{-?\s*(?:include|template)\s+"([^"]+)"(?:\s+\.)?([^}]*)-?}}/g, (_, name, tail = "") => {
    const body = namedTemplates.get(name);
    if (body === undefined) throw new Error("Helm helper '" + name + "' is not defined in the selected chart.");
    let value = renderSimpleTemplate(body, context, namedTemplates);
    const stages = tail.split("|").map((stage) => stage.trim()).filter(Boolean);
    for (const stage of stages) {
      const [fn, ...args] = stage.split(/\s+/);
      const arg = args.join(" ").replace(/^["']|["']$/g, "");
      if (fn === "nindent" || fn === "indent") {
        const indent = " ".repeat(Math.min(80, Math.max(0, Number(args[0] || 0))));
        value = String(value).trimEnd().split("\n").map((line) => indent + line).join("\n");
        if (fn === "nindent") value = "\n" + value;
      } else if (fn === "trim") value = String(value).trim();
      else if (fn === "upper") value = String(value).toUpperCase();
      else if (fn === "lower") value = String(value).toLowerCase();
      else if (fn === "quote") value = JSON.stringify(String(value));
      else if (fn === "default" && !value) value = arg;
      else throw new Error("This Helm helper uses unsupported pipeline function '" + fn + "'.");
    }
    return value;
  });
  source = source.replace(/{{-?\s*range\s+(?:(\$[\w]+)(?:\s*,\s*(\$[\w]+))?\s*:=\s*)?([^}]+?)\s*-?}}([\s\S]*?){{-?\s*end\s*-?}}/g, (_, firstVar, secondVar, expression, body) => {
    const value = lookup(context, expression.trim());
    const entries = Array.isArray(value) ? value.map((item, index) => [index, item]) : value && typeof value === "object" ? Object.entries(value) : [];
    return entries.map(([key, item]) => {
      const scoped = { ...context };
      if (item && typeof item === "object" && !Array.isArray(item)) Object.assign(scoped, item);
      if (firstVar && secondVar) { scoped[firstVar.slice(1)] = key; scoped[secondVar.slice(1)] = item; }
      else if (firstVar) scoped[firstVar.slice(1)] = item;
      return renderSimpleTemplate(body, scoped, namedTemplates);
    }).join("");
  });
  // Resolve simple if/else blocks before evaluating values.
  for (let pass = 0; pass < 20; pass++) {
    const next = source.replace(/{{-?\s*if\s+([^}]+?)\s*-?}}([\s\S]*?)(?:{{-?\s*else\s*-?}}([\s\S]*?))?{{-?\s*end\s*-?}}/g, (_, condition, yes, no = "") => {
      const value = lookup(context, condition.trim());
      return value && value !== false && value !== 0 ? yes : no;
    });
    if (next === source) break;
    source = next;
  }
  if (/{{-?\s*(?:if|range|with|else|end|block|tpl|lookup)\b/.test(source)) {
    throw new Error("The selected Helm chart uses nested or advanced template directives that the browser renderer cannot safely resolve. No diagram was created; the existing canvas is unchanged.");
  }
  source = source.replace(/{{-?\s*\.Release.Name\s*-?}}/g, String(context.Release.Name));
  source = source.replace(/{{-?\s*\.Release.Namespace\s*-?}}/g, String(context.Release.Namespace));
  source = source.replace(/{{-?\s*\.Chart.Name\s*-?}}/g, String(context.Chart.Name));
  source = source.replace(/{{-?\s*\.Chart.Version\s*-?}}/g, String(context.Chart.Version));
  source = source.replace(/{{-?\s*([^{}]+?)\s*-?}}/g, (_, expression) => {
    const expr = expression.trim();
    if (/^(?:-?\s*)?(?:else|end|\/\*|\*)/.test(expr)) return "";
    return helmValue(expr, context);
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
