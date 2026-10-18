import { createServer } from "node:http";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = path.resolve(path.dirname(scriptPath), "..");
const MIME_TYPES = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "text/javascript; charset=utf-8"],
  [".mjs", "text/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

export function createWorkbenchBrowserTestServer({ root = projectRoot } = {}) {
  const absoluteRoot = path.resolve(root);
  let result = null;

  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url || "/", "http://127.0.0.1");

      if (url.pathname === "/__status") {
        sendJson(response, 200, { done: result !== null, result });
        return;
      }

      if (url.pathname === "/__result") {
        if (request.method !== "POST") {
          response.writeHead(405, { Allow: "POST", "content-type": "text/plain; charset=utf-8" });
          response.end("POST required");
          return;
        }
        const expectedOrigin = `http://127.0.0.1:${server.address()?.port}`;
        if (request.headers.origin !== expectedOrigin) {
          sendJson(response, 403, { error: "Result reports must originate from the isolated browser-test page" });
          return;
        }
        const body = await readRequestBody(request, 64 * 1024);
        let parsed;
        try {
          parsed = JSON.parse(body);
        } catch {
          sendJson(response, 400, { error: "Invalid JSON result" });
          return;
        }
        if (!parsed || !["passed", "failed"].includes(parsed.status) || !Array.isArray(parsed.results)) {
          sendJson(response, 400, { error: "Result must contain status passed|failed and a results array" });
          return;
        }
        result = {
          status: parsed.status,
          results: parsed.results.filter((item) => typeof item === "string").slice(0, 500),
          completedAt: typeof parsed.completedAt === "string" ? parsed.completedAt : new Date().toISOString(),
        };
        sendJson(response, 200, { accepted: true });
        return;
      }

      if (request.method !== "GET" && request.method !== "HEAD") {
        response.writeHead(405, { Allow: "GET, HEAD", "content-type": "text/plain; charset=utf-8" });
        response.end("Method not allowed");
        return;
      }

      let pathname;
      try {
        pathname = decodeURIComponent(url.pathname);
      } catch {
        response.writeHead(400);
        response.end("Invalid URL encoding");
        return;
      }
      if (pathname.includes("\\0")) {
        response.writeHead(400);
        response.end("Invalid path");
        return;
      }

      const requestedPath = path.resolve(absoluteRoot, `.${pathname}`);
      if (requestedPath !== absoluteRoot && !requestedPath.startsWith(`${absoluteRoot}${path.sep}`)) {
        response.writeHead(403, { "content-type": "text/plain; charset=utf-8" });
        response.end("Forbidden");
        return;
      }

      let filePath = requestedPath;
      let fileStat;
      try {
        await access(filePath);
        fileStat = await stat(filePath);
      } catch {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        response.end("Not found");
        return;
      }
      if (fileStat.isDirectory()) filePath = path.join(filePath, "index.html");
      try {
        const contents = await readFile(filePath);
        response.writeHead(200, {
          "content-type": MIME_TYPES.get(path.extname(filePath).toLowerCase()) || "application/octet-stream",
          "cache-control": "no-store",
          "x-content-type-options": "nosniff",
        });
        response.end(request.method === "HEAD" ? undefined : contents);
      } catch {
        response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
        response.end("Not found");
      }
    } catch (error) {
      response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify({ error: error?.message || "Unexpected server error" }));
    }
  });

  return server;
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
  });
  response.end(JSON.stringify(payload));
}

async function readRequestBody(request, maxBytes) {
  const chunks = [];
  let length = 0;
  for await (const chunk of request) {
    length += chunk.length;
    if (length > maxBytes) throw new Error("Result payload exceeds size limit");
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}

async function run() {
  const args = new Map();
  for (let index = 2; index < process.argv.length; index += 1) {
    if (process.argv[index].startsWith("--")) args.set(process.argv[index], process.argv[index + 1]);
  }
  const portValue = Number(args.get("--port") || process.env.WORKBENCH_TEST_PORT || 8765);
  if (!Number.isInteger(portValue) || portValue < 1 || portValue > 65535) {
    throw new Error("--port must be an integer between 1 and 65535");
  }
  await access(path.join(projectRoot, "tests", "browser", "workbench-persistence-smoke.html"));
  const server = createWorkbenchBrowserTestServer();
  server.on("error", (error) => {
    console.error(`[workbench-browser-test] ${error.message}`);
    process.exitCode = 1;
  });
  server.listen(portValue, "127.0.0.1", () => {
    console.log(`[workbench-browser-test] Serving ${projectRoot} at http://127.0.0.1:${portValue}`);
    console.log(`[workbench-browser-test] Awaiting browser result at http://127.0.0.1:${portValue}/__status`);
  });
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === scriptPath) {
  run().catch((error) => {
    console.error(`[workbench-browser-test] ${error.message}`);
    process.exitCode = 1;
  });
}
