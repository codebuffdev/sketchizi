/**
 * Shared helpers for interpreting Compose volume mounts so the validator and the
 * diagram planner agree on what counts as a *named* volume.
 */
const WINDOWS_DRIVE = /^[a-zA-Z]:[\\/]/;

/** True when a mount source is a host path or substitution rather than a named volume. */
export function isHostPathSource(source) {
  if (typeof source !== "string" || !source) return true;
  return source.startsWith("/") || source.startsWith(".") || source.startsWith("~")
    || source.startsWith("$") || WINDOWS_DRIVE.test(source);
}

/** Return the named-volume source of a short- or long-form mount, or "" when it is not a named volume. */
export function namedVolumeSource(mount) {
  if (typeof mount === "string") {
    if (WINDOWS_DRIVE.test(mount)) return "";
    const source = mount.split(":")[0];
    return source && mount.includes(":") && !isHostPathSource(source) ? source : "";
  }
  if (mount && typeof mount === "object" && !Array.isArray(mount)) {
    if (mount.type && mount.type !== "volume") return "";
    return typeof mount.source === "string" && !isHostPathSource(mount.source) ? mount.source : "";
  }
  return "";
}

/** Parse the host side of a published port. Returns { kind: "none" | "single" | "range" | "invalid", value }. */
export function parseHostPort(port) {
  let raw = "";
  if (typeof port === "number") return { kind: "none", value: "" };
  if (typeof port === "string") {
    // Mask ${VAR:-default} substitutions so their colons are not treated as separators.
    const substitutions = [];
    const masked = port.replace(/\$\{[^}]*\}/g, (match) => { substitutions.push(match); return `\u0000${substitutions.length - 1}\u0000`; });
    const withoutProtocol = masked.replace(/\/(tcp|udp|sctp)$/i, "");
    const parts = withoutProtocol.startsWith("[")
      ? withoutProtocol.replace(/^\[[^\]]*\]:?/, "").split(":")
      : withoutProtocol.split(":");
    // ip:host:container, host:container, or container
    raw = parts.length >= 2 ? parts.at(-2) : "";
    raw = raw.replace(/\u0000(\d+)\u0000/g, (_, index) => substitutions[Number(index)]);
  } else if (port && typeof port === "object" && port.published != null) {
    raw = String(port.published);
  }
  if (!raw) return { kind: "none", value: "" };
  if (/^\d+$/.test(raw)) return { kind: "single", value: raw };
  if (/^\d+-\d+$/.test(raw)) return { kind: "range", value: raw };
  if (/^\$\{[^}]+\}$/.test(raw)) return { kind: "none", value: raw };
  if (/\$\{[^}]*\}/.test(raw)) return { kind: "none", value: raw };
  return { kind: "invalid", value: raw };
}
