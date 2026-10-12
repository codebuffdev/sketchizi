const STORAGE_BASE = "https://storage.googleapis.com/eraser-public-assets/canvas-icons/";
const PROXY_BASE = "https://wsrv.nl/?url=";

async function fetchIcon(name) {
  const originUrl = `${STORAGE_BASE}${encodeURIComponent(name)}`;
  try {
    const response = await fetch(originUrl, { headers: { accept: "image/svg+xml,text/plain;q=0.9,*/*;q=0.8" } });
    if (response.ok) return response;
  } catch {}
  const proxyResponse = await fetch(`${PROXY_BASE}${encodeURIComponent(originUrl)}`);
  if (!proxyResponse.ok) throw new Error(`Icon proxy failed (${proxyResponse.status})`);
  return proxyResponse;
}

export async function onRequestGet({ request }) {
  const url = new URL(request.url);
  const name = url.searchParams.get("name") || "";
  if (!name || name.includes("..") || name.includes("/") || !name.toLowerCase().endsWith(".svg")) {
    return new Response("Invalid icon name", { status: 400 });
  }

  try {
    const response = await fetchIcon(name);
    const headers = new Headers();
    headers.set("content-type", response.headers.get("content-type") || "image/svg+xml; charset=utf-8");
    headers.set("cache-control", "public, max-age=31536000, immutable");
    headers.set("x-content-type-options", "nosniff");
    return new Response(response.body, { status: 200, headers });
  } catch (error) {
    return new Response(error?.message || "Unable to load icon.", { status: 502 });
  }
}
