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
const enabledLabel = (v) => (typeof v === "boolean" ? (v ? "Enabled" : "Disabled") : "—");
const isObject = (v) => v !== null && typeof v === "object" && !Array.isArray(v);
const show = (v) => (v === undefined || v === null || v === "" ? "—" : String(v));

// Never render more than 7 hex characters of a commit; the full SHA lives in the tooltip and copy action.
const compactHash = (value) => (typeof value === "string" && value.length > 7 && /^[0-9a-f]+$/i.test(value) ? value.slice(0, 7) : value);

async function writeClipboard(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch {
    try {
      const field = document.createElement("textarea");
      field.value = text; field.style.cssText = "position:fixed;opacity:0"; document.body.appendChild(field);
      field.select(); const ok = document.execCommand("copy"); document.body.removeChild(field); return ok;
    } catch { return false; }
  }
}

function CommitPill({ shortHash, fullHash }) {
  const [state, setState] = useState("idle");
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const label = compactHash(shortHash || fullHash);
  if (!label || (label === "unknown" && !fullHash)) return <span>{show(label)}</span>;
  const full = fullHash || shortHash;
  const copyFull = async () => {
    setState((await writeClipboard(full)) ? "copied" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1400);
  };
  return (
    <span className="admin-diag-hash" title={full}>
      <code>{label}</code>
      <button type="button" className="admin-diag-hash-copy" onClick={copyFull} aria-label="Copy full commit SHA" title={state === "copied" ? "Copied" : "Copy full SHA"}>
        {state === "copied"
          ? <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 10.5l4 4 8-9" /></svg>
          : <svg viewBox="0 0 20 20" width="12" height="12" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><rect x="7" y="7" width="9" height="9" rx="1.8" /><path d="M13 7V5.2A1.2 1.2 0 0 0 11.8 4H5.2A1.2 1.2 0 0 0 4 5.2v6.6A1.2 1.2 0 0 0 5.2 13H7" /></svg>}
      </button>
    </span>
  );
}

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

  // Keep the full payload; tolerate nested (quotas/runtime), alternative and top-level shapes.
  const data = isObject(state.data) ? state.data : {};
  const be = isObject(data.build) ? data.build : null;
  const quotas = isObject(data.quotas) ? data.quotas : isObject(data.limits) ? data.limits : data;
  const runtime = isObject(data.runtime) ? data.runtime : isObject(data.config) ? data.config : data;
  const beHash = be?.shortHash;
  const inSync = Boolean(be && beHash && compactHash(beHash) === compactHash(fe.shortHash));

  const copyBundle = useCallback(async () => {
    const bundle = {
      feBuild: { shortHash: compactHash(fe.shortHash), fullHash: fe.fullHash, branch: fe.branch, commitMessage: fe.commitMessage, builtAt: fe.builtAt },
      beBuild: be ? { shortHash: compactHash(be.shortHash), fullHash: be.fullHash, branch: be.branch, commitMessage: be.commitMessage, builtAt: be.builtAt, uptimeSeconds: be.uptimeSeconds } : null,
      role,
      elementCount,
      userAgent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    };
    const text = JSON.stringify(bundle, null, 2);
    const ok = await writeClipboard(text);
    setCopy(ok ? "copied" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopy("idle"), 1600);
  }, [fe, be, role, elementCount]);

  if (!active || typeof document === "undefined") return null;

  const accountWindow = quotas.aiAccountWindowHours ?? quotas.ai_account_window_hours ?? 12;
  const accountLimit = quotas.aiAccountQuestionLimit ?? quotas.ai_account_question_limit;
  const githubOauth = runtime.githubOauthEnabled ?? runtime.github_oauth_enabled;
  const githubRepoAuth = runtime.githubRepoAuthEnabled ?? runtime.github_repo_auth_enabled;
  const dbHealthy = runtime.dbHealthy ?? runtime.db_healthy;
  const rows = [
    ["Gemini model", show(runtime.geminiModel ?? runtime.gemini_model)],
    ["AI question limit", accountLimit != null ? `${accountLimit} / ${accountWindow}h` : "—"],
    ["Max concurrent AI", show(quotas.aiMaxConcurrentRequests ?? quotas.ai_max_concurrent_requests)],
    ["GitHub OAuth", enabledLabel(githubOauth)],
    ["GitHub repo auth", enabledLabel(githubRepoAuth)],
    ["DB pool size", show(runtime.dbPoolSize ?? runtime.db_pool_size)],
  ];
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
                <dt>Commit</dt><dd><CommitPill shortHash={fe.shortHash} fullHash={fe.fullHash} /></dd>
                <dt>Message</dt><dd className="admin-diag-ellipsis" title={show(fe.commitMessage)}>{show(fe.commitMessage)}</dd>
                <dt>Branch</dt><dd className="admin-diag-ellipsis" title={show(fe.branch)}>{show(fe.branch)}</dd>
                <dt>Built</dt><dd>{fe.builtAt ? new Date(fe.builtAt).toLocaleString() : "—"}</dd>
              </dl>
            </div>
            <div>
              <h3>Backend Build</h3>
              {state.status === "loading" ? <p className="admin-diag-muted">Loading…</p> : failed || !be ? <p className="admin-diag-muted">Unavailable</p> : (
                <dl>
                  <dt>Commit</dt><dd><CommitPill shortHash={be.shortHash} fullHash={be.fullHash} /></dd>
                  <dt>Message</dt><dd className="admin-diag-ellipsis" title={show(be.commitMessage)}>{show(be.commitMessage)}</dd>
                  <dt>Branch</dt><dd className="admin-diag-ellipsis" title={show(be.branch)}>{show(be.branch)}</dd>
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
                <div><span>Database</span><strong><i className={`admin-diag-dot${dbHealthy === true ? " is-ok" : dbHealthy === false ? " is-bad" : ""}`} aria-hidden="true" />{dbHealthy === true ? "Healthy" : dbHealthy === false ? "Unreachable" : "—"}</strong></div>
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
