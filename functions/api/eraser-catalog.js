const STORAGE_API = "https://storage.googleapis.com/storage/v1/b/eraser-public-assets/o";
const DOCS_URL = "https://docs.eraser.io/icons";
const PREFIX = "canvas-icons/";

function parseDocsCatalog(html) {
  const names = [];
  const seen = new Set();
  const re = /(?:https?:\/\/)?storage\.googleapis\.com\/eraser-public-assets\/canvas-icons\/([^"'<>\s?#]+\.svg)/gi;
  let match;
  while ((match = re.exec(html))) {
    let name;
    try { name = decodeURIComponent(match[1]); } catch { name = match[1]; }
    if (!name || /_48_(Light|Dark)\.svg$/i.test(name) || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }
  return names.sort((a, b) => a.localeCompare(b));
}

async function catalogFromStorage(signal) {
  const names = [];
  let pageToken = "";
  do {
    const url = new URL(STORAGE_API);
    url.searchParams.set("prefix", PREFIX);
    url.searchParams.set("maxResults", "5000");
    if (pageToken) url.searchParams.set("pageToken", pageToken);
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Storage catalog failed (${response.status})`);
    const data = await response.json();
    for (const item of data.items || []) {
      const name = item.name?.slice(PREFIX.length);
      if (name?.toLowerCase().endsWith(".svg") && !/_48_(Light|Dark)\.svg$/i.test(name)) names.push(name);
    }
    pageToken = data.nextPageToken || "";
  } while (pageToken);
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

export async function onRequestGet({ request }) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20000);
  try {
    let names;
    try {
      names = await catalogFromStorage(controller.signal);
    } catch {
      const response = await fetch(DOCS_URL, { signal: controller.signal, headers: { accept: "text/html,application/xhtml+xml" } });
      if (!response.ok) throw new Error(`Eraser docs catalog failed (${response.status})`);
      names = parseDocsCatalog(await response.text());
    }
    if (!names?.length) throw new Error("No Eraser SVG icon links were found.");
    return new Response(JSON.stringify(names), {
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error?.message || "Unable to load Eraser icon catalog." }), {
      status: 502,
      headers: { "content-type": "application/json; charset=utf-8" },
    });
  } finally {
    clearTimeout(timeout);
  }
}
