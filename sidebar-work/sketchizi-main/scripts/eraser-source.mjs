export const ERASER_DOCS = 'https://docs.eraser.io/icons';
export const ERASER_JINA_DOCS = 'https://r.jina.ai/http://docs.eraser.io/icons';
export const ERASER_JINA_DOCS_HTTPS = 'https://r.jina.ai/https://docs.eraser.io/icons';
export const ERASER_STORAGE_API = 'https://storage.googleapis.com/storage/v1/b/eraser-public-assets/o';
export const ERASER_STORAGE_BASE = 'https://storage.googleapis.com/eraser-public-assets/canvas-icons/';
export const ERASER_PROXY_BASE = 'https://wsrv.nl/?url=';
export const ERASER_JINA_STORAGE_BASE = 'https://r.jina.ai/http://storage.googleapis.com/eraser-public-assets/canvas-icons/';
export const ERASER_PREFIX = 'canvas-icons/';

export function originIconUrl(name) {
  return `${ERASER_STORAGE_BASE}${encodeURIComponent(name)}`;
}

export function proxyIconUrl(name) {
  return `${ERASER_PROXY_BASE}${encodeURIComponent(originIconUrl(name))}`;
}

export function jinaIconUrl(name) {
  return `${ERASER_JINA_STORAGE_BASE}${encodeURIComponent(name)}`;
}

/**
 * Parse the current Eraser Icons documentation in its rendered/markdown form.
 * The docs currently publish the full icon list as bullet entries like:
 *   * Image `aws-ec2`
 * This is deliberately independent of the storage.googleapis.com bucket API.
 */
export function parseDocsCatalog(text) {
  const names = [];
  const seen = new Set();
  const re = /(?:^|\n)\s*(?:\*|-|•)\s+Image\s+`([^`]+)`/g;
  let match;

  while ((match = re.exec(text))) {
    const name = match[1].trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    names.push(name);
  }

  // Some renderers emit a plain image label without the bullet marker.
  if (!names.length) {
    const fallback = /\bImage\s+`([^`]+)`/g;
    while ((match = fallback.exec(text))) {
      const name = match[1].trim();
      if (!name || seen.has(name)) continue;
      seen.add(name);
      names.push(name);
    }
  }

  return names.sort((a, b) => a.localeCompare(b));
}
