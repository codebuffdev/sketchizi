import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { cloudflare } from "@cloudflare/vite-plugin";
import { onRequestGet as eraserCatalog } from "./functions/api/eraser-catalog.js";
import { onRequestGet as eraserIcon } from "./functions/api/eraser-icon.js";

async function handlePagesFunction(handler, req, res) {
  const protocol = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers.host || "localhost:5173";
  const request = new Request(`${protocol}://${host}${req.url}`, {
    method: "GET",
    headers: new Headers(req.headers),
  });
  const response = await handler({ request });
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  const body = Buffer.from(await response.arrayBuffer());
  res.end(body);
}

function sketchiziPagesFunctionsDev() {
  return {
    name: "sketchizi-pages-functions-dev",
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.method !== "GET") return next();

        const path = new URL(req.url || "/", "http://localhost").pathname;

        const handler =
          path === "/api/eraser-catalog"
            ? eraserCatalog
            : path === "/api/eraser-icon"
              ? eraserIcon
              : null;

        if (!handler) return next();

        try {
          await handlePagesFunction(handler, req, res);
        } catch (error) {
          res.statusCode = 502;
          res.setHeader("content-type", "application/json; charset=utf-8");
          res.end(
            JSON.stringify({
              error: error?.message || "Eraser API failed.",
            }),
          );
        }
      });
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    cloudflare(),
    sketchiziPagesFunctionsDev(),
  ],
  server: {
    proxy: {
      "/collaboration": {
        target: "ws://localhost:8787",
        ws: true,
      },
    },
  },
});