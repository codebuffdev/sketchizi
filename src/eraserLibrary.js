import { logger } from "./logging/logger";
const CATALOG_URL = '/api/eraser-catalog';
const ICON_CACHE_NAME = 'sketchizi-eraser-icons-v4';
const CATALOG_STORAGE_KEY = 'sketchizi:eraser-catalog:v4';

export const eraserIconUrl = (name) => `/api/eraser-icon?name=${encodeURIComponent(name)}`;

function readableName(filename) {
  const base = filename.replace(/\.svg$/i, '').replace(/_48_(Light|Dark)$/i, '');
  return base.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function toIcons(names) {
  return [...new Set(names || [])]
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .map((filename) => ({
      id: filename.replace(/\.svg$/i, ''),
      name: readableName(filename),
      subtitle: 'Eraser',
      category: 'Eraser Icons',
      src: eraserIconUrl(filename.endsWith('.svg') ? filename : `${filename}.svg`),
      source: 'eraser',
      iconName: filename.replace(/\.svg$/i, ''),
    }));
}

export function loadStoredEraserCatalog() {
  try {
    const parsed = JSON.parse(localStorage.getItem(CATALOG_STORAGE_KEY) || '[]');
    if (!Array.isArray(parsed)) return [];
    return toIcons(parsed.map((item) => item?.iconName || item?.id).filter(Boolean));
  } catch {
    logger.warn("Stored Eraser catalog could not be read", { category: "api", operation: "eraser-catalog-cache" });
    return [];
  }
}

export function storeEraserCatalog(icons) {
  try {
    localStorage.setItem(
      CATALOG_STORAGE_KEY,
      JSON.stringify(
        icons.map((icon) => ({
          id: icon.id,
          name: icon.name,
          iconName: icon.iconName || icon.id,
        })),
      ),
    );
  } catch (error) {
    logger.warn("Eraser catalog could not be persisted", { category: "persistence", operation: "eraser-catalog-cache", errorMessage: error?.message });
    // localStorage can be unavailable or full; catalog can still work in memory.
  }
}

export async function fetchEraserCatalog(signal) {
  const response = await fetch(CATALOG_URL, {
    signal,
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });

  if (!response.ok) {
    let message = `Eraser catalog failed (${response.status})`;
    try {
      const payload = await response.json();
      if (payload?.error) message = payload.error;
    } catch {
      // Keep the HTTP error above.
    }
    throw new Error(message);
  }

  const payload = await response.json();
  const names = Array.isArray(payload)
    ? payload
    : Array.isArray(payload.names)
      ? payload.names
      : Array.isArray(payload.items)
        ? payload.items.map((item) => item?.name).filter(Boolean)
        : [];

  const icons = toIcons(names);
  if (!icons.length) throw new Error('Eraser catalog returned no icons.');
  return icons;
}

export async function cacheEraserIcons(icons, onProgress, signal) {
  if (!('caches' in window)) throw new Error('Browser cache storage is unavailable.');
  if (!icons.length) return;

  const cache = await caches.open(ICON_CACHE_NAME);
  const total = icons.length;
  let completed = 0;
  let cursor = 0;
  let failures = 0;

  const cacheOne = async (icon) => {
    const request = new Request(icon.src, { method: 'GET' });
    if (await cache.match(request)) return;

    const response = await fetch(request, {
      signal,
      cache: 'no-store',
      credentials: 'same-origin',
    });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    await cache.put(request, response.clone());
  };

  const worker = async () => {
    while (true) {
      const index = cursor++;
      if (index >= total) return;
      try {
        await cacheOne(icons[index]);
      } catch (error) {
        if (error?.name === 'AbortError') throw error;
        failures += 1;
      } finally {
        completed += 1;
        onProgress?.(completed, total);
      }
    }
  };

  await Promise.all(Array.from({ length: Math.min(12, total) }, worker));

  if (failures) {
    throw new Error(`${failures} icon${failures === 1 ? '' : 's'} could not be cached. ${total - failures} are available offline.`);
  }
}

export async function getCachedIconCount(icons) {
  if (!('caches' in window) || !icons.length) return 0;
  const cache = await caches.open(ICON_CACHE_NAME);
  const requests = await cache.keys();
  const urls = new Set(requests.map((request) => new URL(request.url, window.location.href).href));
  return icons.reduce((count, icon) => {
    const url = new URL(icon.src, window.location.href).href;
    return count + (urls.has(url) ? 1 : 0);
  }, 0);
}

export function registerEraserServiceWorker() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/service-worker.js').catch(() => {});
  }
}
