import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { USER_ROLES } from "../config/privileges.js";
import { getBuildMetadata } from "../config/buildMetadata.js";

const DIAGNOSTICS_URL = "/api/admin/diagnostics";

const formatUptime = (seconds) => {
  if (!Number.isFinite(seconds)) return "—";
  const d = Math.floor(seconds / 86400), h = Math.floor((seconds % 86400) / 3600), m = Math.floor((seconds % 3600) / 60);
  return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m ${Math.floor(seconds % 60)}s`;
};
const yesNo = (v) => (v === undefined || v === null ? "—" : v ? "Enabled" : "Disabled");
const show = (v) => (v === undefined || v === null || v === "" ? "—" : String(v));

/** Admin-only diagnostics. Mounts and fetches only when role === admin and open. */
export default function AdminDiagnosticsModal({ role, open, onClose, getElementCount }) {
  const isAdmin = role === USER_ROLES.ADMIN;
  const active = isAdmin && open;
  const [state, setState] = useState({ status: "loading", data: null });
  const [copy, setCopy] = useState("idle");
  const timer = useRef(null);
  const fe = getBuildMetadata();
  const [elementCount, setElementCount] = useState(0);
  const dark = typeof document !== "undefined" && Boolean(document.querySelector(".app.theme-dark"));

  useEffect(() => {
    if (!active) return undefined;
    const controller = new AbortController();
    setState({ status: "loading", data: null });
    (async () => {
      try {
        const response = await fetch(DIAGNOSTICS_URL, { credentials: "include", cache: "no-store", headers: { accept: "application/json" }, signal: controller.signal });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        setState({ status: "ready", data: await response.json() });
      } catch (error) {
        if (error?.name !== "AbortError") setState({ status: "error", data: null });
      }
    })();
    return () => controller.abort();
  }, [active]);

  useEffect(() => {
    if (!active) return undefined;
    try { setElementCount(Number(getElementCount?.()) || 0); } catch { setElementCount(0); }
    const onKey = (event) => { if (event.key === "Escape") { event.stopPropagation(); onClose?.(); } };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [active, getElementCount, onClose]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const data = state.data || {};
  const be = data.build || null;
  const cfg = data.config || data;
  const db = data.db || {};
  const beHash = be?.shortHash;
  const inSync = Boolean(be && beHash && beHash === fe.shortHash);

  const copyBundle = useCallback(async () => {
    const bundle = {
      feBuild: { shortHash: fe.shortHash, fullHash: fe.fullHash, branch: fe.branch, builtAt: fe.builtAt },
      beBuild: be ? { shortHash: be.shortHash, branch: be.branch, uptimeSeconds: be.uptimeSeconds } : null,
      role,
      elementCount,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    };
    const text = JSON.stringify(bundle, null, 2);
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch {
      try {
        const field = document.createElement("textarea");
        field.value = text; field.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(field);
        field.select(); ok = document.execCommand("copy"); document.body.removeChild(field);
      } catch { ok = false; }
    }
    setCopy(ok ? "copied" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopy("idle"), 1600);
  }, [fe, be, role, elementCount]);

  if (!active || typeof document === "undefined") return null;

  const rows = [
    ["Gemini model", show(cfg.geminiModel)],
    ["AI question limit", cfg.aiAccountQuestionLimit != null ? `${cfg.aiAccountQuestionLimit} / ${show(cfg.aiAccountWindowHours)}h` : "—"],
    ["Max concurrent AI", show(cfg.aiMaxConcurrentRequests)],
    ["GitHub OAuth", yesNo(cfg.githubOauthEnabled)],
    ["GitHub repo auth", yesNo(cfg.githubRepoAuthEnabled)],
    ["DB pool size", show(cfg.dbPoolSize ?? db.poolSize)],
  ];
  const dbHealthy = cfg.dbHealthy ?? db.healthy;
  const failed = state.status === "error";

  return createPortal(
    <div className={`admin-diag-backdrop${dark ? " is-dark" : ""}`} role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose?.(); }}>
      <section className="admin-diag" role="dialog" aria-modal="true" aria-labelledby="admin-diag-title">
        <header className="admin-diag-header">
          <h2 id="admin-diag-title">Diagnostics</h2>
          <button type="button" className="admin-diag-close" aria-label="Close diagnostics" autoFocus onClick={onClose}>×</button>
        </header>

        {failed && <div className="admin-diag-banner" role="alert">Backend diagnostics unavailable</div>}

        <div className="admin-diag-card">
          <div className="admin-diag-card-title">
            <span>Deployment &amp; Build Parity</span>
            {state.status === "loading" ? <span className="admin-diag-badge">Checking…</span>
              : failed ? null
              : inSync ? <span className="admin-diag-badge is-sync">In Sync</span>
              : <span className="admin-diag-badge is-drift">Version Drift</span>}
          </div>
          <div className="admin-diag-compare">
            <div>
              <h3>Frontend Build</h3>
              <dl>
                <dt>Commit</dt><dd><code>{fe.shortHash}</code></dd>
                <dt>Branch</dt><dd>{show(fe.branch)}</dd>
                <dt>Built</dt><dd>{fe.builtAt ? new Date(fe.builtAt).toLocaleString() : "—"}</dd>
              </dl>
            </div>
            <div>
              <h3>Backend Build</h3>
              {state.status === "loading" ? <p className="admin-diag-muted">Loading…</p> : failed || !be ? <p className="admin-diag-muted">Unavailable</p> : (
                <dl>
                  <dt>Commit</dt><dd><code>{show(be.shortHash)}</code></dd>
                  <dt>Branch</dt><dd>{show(be.branch)}</dd>
                  <dt>Uptime</dt><dd>{formatUptime(be.uptimeSeconds)}</dd>
                </dl>
              )}
            </div>
          </div>
        </div>

        {!failed && (
          <div className="admin-diag-card">
            <div className="admin-diag-card-title"><span>Live Quotas &amp; Runtime Config</span></div>
            {state.status === "loading" ? <p className="admin-diag-muted">Loading…</p> : (
              <div className="admin-diag-grid">
                {rows.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value}</strong></div>)}
                <div><span>Database</span><strong><i className={`admin-diag-dot${dbHealthy === true ? " is-ok" : dbHealthy === false ? " is-bad" : ""}`} aria-hidden="true" />{dbHealthy === true ? "Healthy" : dbHealthy === false ? "Unhealthy" : "—"}</strong></div>
              </div>
            )}
          </div>
        )}

        <div className="admin-diag-card">
          <div className="admin-diag-card-title"><span>Local Canvas Snapshot</span></div>
          <div className="admin-diag-grid">
            <div><span>Canvas elements</span><strong>{elementCount}</strong></div>
            <div><span>Role</span><strong>{role}</strong></div>
          </div>
          <button type="button" className="admin-diag-primary" onClick={copyBundle}>
            <span role="status" aria-live="polite">{copy === "copied" ? "Copied" : copy === "failed" ? "Copy failed" : "Copy Debug Bundle"}</span>
          </button>
        </div>
      </section>
    </div>,
    document.body,
  );
}
