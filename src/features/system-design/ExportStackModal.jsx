import { useMemo, useState } from "react";
import { compileStack } from "./stackCompiler.js";
import { Icon } from "./PrimitiveIcon.jsx";
import { exportSystemDesignImage } from "./exportSystemDesignImage.js";

const TARGETS = [
  { id: "k8s", label: "Kubernetes", filename: "k8s-stack.yaml" },
  { id: "compose", label: "Docker Compose", filename: "docker-compose.yml" },
];

export default function ExportStackModal({ nodes, edges, onClose }) {
  const [target, setTarget] = useState("k8s");
  const [copied, setCopied] = useState(false);
  const active = TARGETS.find((item) => item.id === target);
  const manifest = useMemo(() => compileStack(nodes, edges, target), [nodes, edges, target]);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(manifest);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch { setCopied(false); }
  };
  const downloadDiagram = async (format) => {
    const blob = await exportSystemDesignImage({ nodes, edges, background: "dark", darkMode: true, scale: 2, format });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = format === "svg" ? "system-design-diagram.svg" : "system-design-diagram_2x.png"; anchor.click();
    URL.revokeObjectURL(url);
  };
  const download = () => {
    const blob = new Blob([manifest], { type: "text/yaml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = active.filename;
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="sd-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="sd-surface sd-export-modal" role="dialog" aria-modal="true" aria-labelledby="sd-export-title">
        <header className="sd-export-head">
          <div><strong id="sd-export-title">Export Stack</strong><small>Compile the complete connected architecture into deployable manifests.</small></div>
          <button type="button" className="sd-icon-btn" aria-label="Close export" onClick={onClose}><Icon name="close" /></button>
        </header>
        <div className="sd-export-tabs" role="tablist" aria-label="Export target">
          {TARGETS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={target === item.id}
            className={target === item.id ? "is-active" : ""} onClick={() => { setTarget(item.id); setCopied(false); }}>{item.label}</button>)}
          <span className="sd-yaml-file sd-mono">{active.filename}</span>
          <button type="button" className="sd-export-secondary" onClick={() => downloadDiagram("png")}>Export Diagram PNG (2x)</button>
          <button type="button" className="sd-export-secondary" onClick={() => downloadDiagram("svg")}>Export Diagram SVG</button>
        </div>
        <pre className="sd-export-code sd-mono" tabIndex={0} aria-label={active.label + " manifest"}>{manifest}</pre>
        <footer className="sd-export-foot">
          <span>{nodes.length} nodes · {edges.length} connections · {manifest.split("\n").length} lines</span>
          <div><button type="button" className="sd-export-secondary" onClick={copy}><Icon name={copied ? "check" : "copy"} size={14} />{copied ? "Copied" : "Copy to Clipboard"}</button>
            <button type="button" className="sd-export-primary" onClick={download}><Icon name="download" size={14} />Download {target === "k8s" ? ".yaml" : ".yml"}</button></div>
        </footer>
      </section>
    </div>
  );
}
