import { lookup as dnsLookup } from "node:dns/promises";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");
export const DEFAULT_REGISTRY_HOST = "registry.npmjs.org";
export const DEFAULT_METADATA_URL = "https://registry.npmjs.org/%40excalidraw%2fexcalidraw/0.18.0-c0ad61c";

function errorInfo(error) {
  return {
    code: typeof error?.code === "string" ? error.code : "UNKNOWN",
    message: typeof error?.message === "string" ? error.message : String(error),
  };
}

/**
 * Diagnostic-only probe. Its result must not be used as a replacement for npm ci:
 * registry reachability at one moment does not guarantee every package can install.
 */
export async function probeNpmRegistry({
  lookup = dnsLookup,
  fetchImpl = globalThis.fetch,
  metadataUrl = DEFAULT_METADATA_URL,
  host = DEFAULT_REGISTRY_HOST,
  timeoutMs = 8000,
} = {}) {
  const report = {
    schemaVersion: 1,
    checkedAt: new Date().toISOString(),
    host,
    metadataUrl,
    status: "unknown",
    dns: { status: "unknown", addresses: [], error: null },
    http: { status: "not-attempted", statusCode: null, packageVersion: null, error: null },
    note: "Diagnostic only; npm ci remains the authoritative dependency-install gate.",
  };

  try {
    const addresses = await lookup(host, { all: true, verbatim: true });
    report.dns = {
      status: addresses.length ? "resolved" : "no-addresses",
      addresses: addresses.map(({ address, family }) => ({ address, family })),
      error: null,
    };
    if (!addresses.length) {
      report.status = "dns-unresolved";
      report.http.status = "not-attempted";
      return report;
    }
  } catch (error) {
    report.dns = { status: "failed", addresses: [], error: errorInfo(error) };
    report.status = "dns-failed";
    return report;
  }

  if (typeof fetchImpl !== "function") {
    report.http = {
      status: "not-available",
      statusCode: null,
      packageVersion: null,
      error: { code: "FETCH_UNAVAILABLE", message: "This Node.js runtime does not expose fetch()." },
    };
    report.status = "http-probe-unavailable";
    return report;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(new Error(`Registry request timed out after ${timeoutMs} ms.`)), timeoutMs);
  try {
    const response = await fetchImpl(metadataUrl, {
      method: "GET",
      headers: { accept: "application/vnd.npm.install-v1+json, application/json" },
      signal: controller.signal,
    });
    let packageVersion = null;
    if (response.ok) {
      try {
        const metadata = await response.json();
        packageVersion = typeof metadata?.version === "string" ? metadata.version : null;
      } catch {
        // The HTTP status is still useful if a proxy returns non-JSON content.
      }
    }
    report.http = {
      status: response.ok ? (packageVersion ? "reachable" : "invalid-metadata") : "http-error",
      statusCode: response.status,
      packageVersion,
      error: null,
    };
    report.status = response.ok && packageVersion === "0.18.0-c0ad61c"
      ? "reachable"
      : response.ok && !packageVersion
        ? "invalid-metadata"
        : response.ok
          ? "version-mismatch"
          : "http-error";
  } catch (error) {
    report.http = { status: "failed", statusCode: null, packageVersion: null, error: errorInfo(error) };
    report.status = "http-failed";
  } finally {
    clearTimeout(timeout);
  }
  return report;
}

export function renderRegistryProbe(report) {
  const lines = [
    `npm registry connectivity probe: ${report.status.toUpperCase()}`,
    `DNS: ${report.dns.status}${report.dns.addresses?.length ? ` (${report.dns.addresses.map((item) => `${item.address}/IPv${item.family}`).join(", ")})` : ""}`,
    `HTTP: ${report.http.status}${report.http.statusCode ? ` (${report.http.statusCode})` : ""}`,
    `Pinned package metadata version: ${report.http.packageVersion ?? "not confirmed"}`,
    report.note,
  ];
  if (report.dns.error) lines.push(`DNS error: ${report.dns.error.code}: ${report.dns.error.message}`);
  if (report.http.error) lines.push(`HTTP error: ${report.http.error.code}: ${report.http.error.message}`);
  return lines.join("\n");
}

async function main() {
  const report = await probeNpmRegistry();
  const logDirectory = path.join(projectRoot, "artifacts", "ci-logs");
  await mkdir(logDirectory, { recursive: true });
  await writeFile(path.join(logDirectory, "npm-registry-probe.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(renderRegistryProbe(report));
  console.log(`NPM_REGISTRY_PROBE_JSON=${JSON.stringify(report)}`);
  if (report.status !== "reachable") process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(`npm registry probe failed unexpectedly: ${error?.stack || error}`);
    process.exitCode = 1;
  });
}
