import fs from 'node:fs/promises';
import path from 'node:path';
import {
  ERASER_DOCS,
  ERASER_JINA_DOCS,
  ERASER_JINA_DOCS_HTTPS,
  ERASER_STORAGE_API,
  ERASER_STORAGE_BASE,
  ERASER_PROXY_BASE,
  parseDocsCatalog,
  originIconUrl,
  proxyIconUrl,
  jinaIconUrl,
} from './eraser-source.mjs';

const OUT = path.resolve('public/eraser-icons');
const MANIFEST = path.resolve('public/eraser-icons-manifest.json');
const CONCURRENCY = 8;
const timeoutMs = 20000;

async function fetchWithTimeout(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: options.signal || controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function catalogFromStorage() {
  const items = [];
  let pageToken = '';
  do {
    const url = new URL(ERASER_STORAGE_API);
    url.searchParams.set('prefix', 'canvas-icons/');
    url.searchParams.set('maxResults', '5000');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const response = await fetchWithTimeout(url);
    if (!response.ok) throw new Error(`Storage catalog failed (${response.status})`);
    const data = await response.json();
    for (const item of data.items || []) {
      const name = item.name?.slice('canvas-icons/'.length);
      if (name?.toLowerCase().endsWith('.svg') && !/_48_(Light|Dark)\.svg$/i.test(name)) {
        items.push(name.slice(0, -4));
      }
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return [...new Set(items)].sort((a, b) => a.localeCompare(b));
}

async function catalogFromJina(url) {
  const response = await fetchWithTimeout(url, {
    headers: { accept: 'text/plain,text/markdown,text/html;q=0.9,*/*;q=0.8' },
  });
  if (!response.ok) throw new Error(`Catalog proxy failed (${response.status})`);
  const names = parseDocsCatalog(await response.text());
  if (!names.length) throw new Error('Catalog proxy returned no icon names.');
  return names;
}

async function catalogFromDocs() {
  let lastError;
  for (const url of [ERASER_JINA_DOCS, ERASER_JINA_DOCS_HTTPS, ERASER_DOCS]) {
    try {
      return await catalogFromJina(url);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError || new Error('Unable to load Eraser catalog.');
}

async function getCatalog() {
  try {
    const names = await catalogFromStorage();
    if (names.length) {
      console.log(`Catalog source: Google Cloud Storage (${names.length} icons)`);
      return names;
    }
  } catch (error) {
    console.warn(`Google Cloud Storage catalog unavailable: ${error.message}`);
  }

  const names = await catalogFromDocs();
  console.log(`Catalog source: Eraser docs proxy (${names.length} icons)`);
  return names;
}

async function fetchIcon(name) {
  const directUrl = originIconUrl(`${name}.svg`);
  try {
    const response = await fetchWithTimeout(directUrl, { headers: { accept: 'image/svg+xml,text/plain;q=0.9,*/*;q=0.8' } });
    if (response.ok) return Buffer.from(await response.arrayBuffer());
  } catch {
    // Direct storage can be unavailable because of DNS/CORS restrictions.
  }

  try {
    const response = await fetchWithTimeout(proxyIconUrl(`${name}.svg`), { headers: { accept: 'image/svg+xml,text/plain;q=0.9,*/*;q=0.8' } });
    if (response.ok) return Buffer.from(await response.arrayBuffer());
  } catch {
    // Fall through to Jina.
  }

  const response = await fetchWithTimeout(jinaIconUrl(`${name}.svg`), { headers: { accept: 'image/svg+xml,text/plain;q=0.9,*/*;q=0.8' } });
  if (!response.ok) throw new Error(`Icon ${name}: HTTP ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

const names = await getCatalog();
await fs.mkdir(OUT, { recursive: true });
let done = 0;
let failed = 0;
let cursor = 0;
const failures = [];

const worker = async () => {
  while (true) {
    const index = cursor++;
    if (index >= names.length) return;
    const name = names[index];
    const target = path.join(OUT, `${name}.svg`);
    try {
      try {
        await fs.access(target);
      } catch {
        await fs.writeFile(target, await fetchIcon(name));
      }
    } catch (error) {
      failed += 1;
      failures.push({ name, error: error.message });
    } finally {
      done += 1;
      if (done % 25 === 0 || done === names.length) {
        console.log(`${done}/${names.length} processed${failed ? ` (${failed} failed)` : ''}`);
      }
    }
  }
};

await Promise.all(Array.from({ length: CONCURRENCY }, worker));
await fs.writeFile(MANIFEST, JSON.stringify(names, null, 2));

if (failures.length) {
  await fs.writeFile(path.resolve('public/eraser-icons-failures.json'), JSON.stringify(failures, null, 2));
  console.error(`Completed with ${failures.length} failed icon downloads. The manifest was still written.`);
  process.exitCode = 2;
} else {
  console.log(`Downloaded ${names.length} Eraser icons into ${OUT}`);
}
