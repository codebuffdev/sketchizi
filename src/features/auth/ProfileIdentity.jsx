import { useEffect, useRef, useState } from "react";
import { ROLE_PRIVILEGES, USER_ROLES } from "../../config/privileges.js";
import { getBuildMetadata } from "../../config/buildMetadata.js";

export function RolePill({ role }) {
  const privileges = ROLE_PRIVILEGES[role] || ROLE_PRIVILEGES.free;
  return <b className={`auth-role-pill auth-role-pill-${ROLE_PRIVILEGES[role] ? role : "free"}`} data-role={role}>{privileges.label}</b>;
}

async function copyText(text) {
  try {
    if (navigator.clipboard?.writeText) { await navigator.clipboard.writeText(text); return true; }
  } catch { /* fall through to the legacy path */ }
  try {
    const field = document.createElement("textarea");
    field.value = text;
    field.setAttribute("readonly", "");
    field.style.position = "fixed";
    field.style.opacity = "0";
    document.body.appendChild(field);
    field.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(field);
    return ok;
  } catch { return false; }
}

/** Admin-only build strip. Renders nothing for free and pro users. */
export function AdminBuildStrip({ role }) {
  const [state, setState] = useState("idle");
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  if (role !== USER_ROLES.ADMIN) return null;

  const { shortHash, fullHash, branch, builtAt } = getBuildMetadata();
  const builtLabel = builtAt ? new Date(builtAt).toLocaleString() : "";
  const handleCopy = async () => {
    const ok = await copyText(fullHash);
    setState(ok ? "copied" : "failed");
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1600);
  };

  return (
    <div className="auth-build-strip" role="group" aria-label="Build information" title={[fullHash, builtLabel && `Built ${builtLabel}`].filter(Boolean).join(" · ")}>
      <svg viewBox="0 0 20 20" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><circle cx="10" cy="10" r="3" /><path d="M2 10h5M13 10h5" /></svg>
      <code className="auth-build-hash">build · {shortHash}</code>
      {branch && <span className="auth-build-branch">{branch}</span>}
      <button type="button" className="auth-build-copy" onClick={handleCopy} aria-label="Copy full commit SHA">
        <span role="status" aria-live="polite">{state === "copied" ? "Copied" : state === "failed" ? "Failed" : "Copy"}</span>
      </button>
    </div>
  );
}
