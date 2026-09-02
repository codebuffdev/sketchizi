const BUCKET_API = 'https://storage.googleapis.com/storage/v1/b/eraser-public-assets/o';
const ICON_PREFIX = 'canvas-icons/';
const ICON_BASE = 'https://storage.googleapis.com/eraser-public-assets/canvas-icons/';
const CACHE_NAME = 'sketchizi-eraser-icons-v2';

export const eraserIconUrl = (name) => `${ICON_BASE}${encodeURIComponent(name)}`;

function readableName(filename) {
  const base = filename.replace(/\.svg$/i, '').replace(/_48_(Light|Dark)$/i, '');
  return base.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export async function fetchEraserCatalog(signal) {
  const all = [];
  let pageToken = '';
  do {
    const url = new URL(BUCKET_API);
    url.searchParams.set('prefix', ICON_PREFIX);
    url.searchParams.set('maxResults', '5000');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await fetch(url, { signal });
    if (!response.ok) throw new Error(`Eraser catalog failed (${response.status})`);
    const data = await response.json();
    for (const item of data.items || []) {
      const name = item.name?.slice(ICON_PREFIX.length);
      if (!name || !name.toLowerCase().endsWith('.svg')) continue;
      if (/_48_(Light|Dark)\.svg$/i.test(name)) continue;
      all.push(name);
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);

  const unique = [...new Set(all)].sort((a, b) => a.localeCompare(b));
  return unique.map((filename) => ({
    id: filename.replace(/\.svg$/i, ''),
    name: readableName(filename),
    subtitle: 'Eraser',
    category: 'Eraser Icons',
    src: eraserIconUrl(filename),
    source: 'eraser',
    iconName: filename.replace(/\.svg$/i, ''),
  }));
}

export async function cacheEraserIcons(icons, onProgress, signal) {
  if (!("caches" in window)) throw new Error("Browser cache storage is unavailable.");
  const cache = await caches.open(CACHE_NAME);
  let completed = 0;
  let cursor = 0;
  let failures = 0;

  const fetchForCache = async (url) => {
    // Prefer a normal CORS request so the cached response can be inspected.
    try {
      const response = await fetch(url, { signal, mode: "cors", cache: "no-store" });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      await cache.put(url, response.clone());
      return;
    } catch (error) {
      if (error?.name === "AbortError") throw error;
      // Some public Eraser assets do not expose CORS headers. An opaque
      // no-cors response is still cacheable and is sufficient for offline use.
      const response = await fetch(url, { signal, mode: "no-cors", cache: "no-store" });
      await cache.put(url, response.clone());
    }
  };

  const worker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= icons.length) return;
      const icon = icons[index];
      try {
        if (!(await cache.match(icon.src))) {
          await fetchForCache(icon.src);
        }
      } catch (error) {
        if (error?.name === "AbortError") throw error;
        failures += 1;
      } finally {
        completed += 1;
        onProgress?.(completed, icons.length);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(12, icons.length) }, worker));
  if (failures > 0) {
    throw new Error(`${failures} icon${failures === 1 ? "" : "s"} could not be cached. The rest are available offline.`);
  }
}

export async function getCachedIconCount(icons) {
  if (!('caches' in window)) return 0;
  const cache = await caches.open(CACHE_NAME);
  let count = 0;
  for (const icon of icons) if (await cache.match(icon.src)) count += 1;
  return count;
}

export function registerEraserServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/eraser-sw.js').catch(() => {});
  }
}
