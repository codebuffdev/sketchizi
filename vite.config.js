import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { onRequestGet as eraserCatalog } from "./functions/api/eraser-catalog.js";
import { onRequestGet as eraserIcon } from "./functions/api/eraser-icon.js";
import { onRequest as authGateway } from "./functions/api/auth/[[path]].js";
import { onRequest as aiGateway } from "./functions/api/ai/[[path]].js";

async function readRequestBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];

    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

async function handlePagesFunction(handler, req, res) {
  const method = (req.method || "GET").toUpperCase();
  const protocol = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers.host || "localhost:5173";
  const headers = new Headers(req.headers);

  for (const name of [
    "host",
    "connection",
    "content-length",
    "transfer-encoding",
  ]) {
    headers.delete(name);
  }

  const body = ["GET", "HEAD"].includes(method)
    ? undefined
    : await readRequestBody(req);
  const hasBody = Boolean(body && body.length > 0);

  const requestInit = { method, headers };
  if (hasBody) {
    requestInit.body = body;
    requestInit.duplex = "half";
  }

  const request = new Request(`${protocol}://${host}${req.url}`, requestInit);
  const response = await handler({
    request,
    env: {
      AUTH_SERVICE_ORIGIN:
        process.env.AUTH_SERVICE_ORIGIN || "http://localhost:8080",
      AI_SERVICE_ORIGIN:
        process.env.AI_SERVICE_ORIGIN || "http://localhost:8090",
      AI_IDENTITY_HMAC_SECRET: process.env.AI_IDENTITY_HMAC_SECRET || "",
      PUBLIC_FRONTEND_ORIGIN:
        process.env.PUBLIC_FRONTEND_ORIGIN || "http://localhost:5173",
    },
  });

  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    if (key.toLowerCase() !== "set-cookie") res.setHeader(key, value);
  });

  const cookies = response.headers.getSetCookie?.() || [];
  if (cookies.length) {
    res.setHeader("set-cookie", cookies);
  } else if (response.headers.has("set-cookie")) {
    res.setHeader("set-cookie", response.headers.get("set-cookie"));
  }

  const responseBody = Buffer.from(await response.arrayBuffer());
  res.end(responseBody);
}

function sketchiziPagesFunctionsDev() {
  return {
    name: "sketchizi-pages-functions-dev",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const path = new URL(req.url || "/", "http://localhost").pathname;
        const isEraser =
          req.method === "GET" &&
          ["/api/eraser-catalog", "/api/eraser-icon"].includes(path);
        const isAuth = path === "/api/auth" || path.startsWith("/api/auth/");
        const isAi = path === "/api/ai" || path.startsWith("/api/ai/");

        if (!isEraser && !isAuth && !isAi) return next();

        const handler =
          path === "/api/eraser-catalog"
            ? eraserCatalog
            : path === "/api/eraser-icon"
              ? eraserIcon
              : isAi
                ? aiGateway
                : authGateway;

        try {
          await handlePagesFunction(handler, req, res);
        } catch (error) {
          console.error(
            "[sketchizi-pages-functions-dev] Gateway request failed:",
            error
          );

          if (res.headersSent) {
            res.destroy(error);
            return;
          }

          res.statusCode = 502;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.setHeader("cache-control", "no-store");
          res.end(
            JSON.stringify({
              error: isAuth
                ? "Authentication gateway failed."
                : isAi
                  ? "AI gateway failed."
                  : "Eraser API failed.",
            })
          );
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), sketchiziPagesFunctionsDev()],
  server: {
    proxy: {
      "/collaboration": {
        target: "ws://localhost:8787",
        ws: true,
      },
    },
  },
});
