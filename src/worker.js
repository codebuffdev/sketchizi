import { onRequestGet as eraserCatalog } from "../functions/api/eraser-catalog.js";
import { onRequestGet as eraserIcon } from "../functions/api/eraser-icon.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === "GET" && url.pathname === "/api/eraser-catalog") {
      return eraserCatalog({ request, env });
    }

    if (request.method === "GET" && url.pathname === "/api/eraser-icon") {
      return eraserIcon({ request, env });
    }

    return env.ASSETS.fetch(request);
  },
};
