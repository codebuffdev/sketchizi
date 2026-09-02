import fs from 'node:fs/promises';
import path from 'node:path';

const API = 'https://storage.googleapis.com/storage/v1/b/eraser-public-assets/o';
const PREFIX = 'canvas-icons/';
const OUT = path.resolve('public/eraser-icons');

async function catalog() {
  const items = [];
  let pageToken = '';
  do {
    const url = new URL(API);
    url.searchParams.set('prefix', PREFIX);
    url.searchParams.set('maxResults', '5000');
    if (pageToken) url.searchParams.set('pageToken', pageToken);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Catalog request failed: ${res.status}`);
    const data = await res.json();
    for (const item of data.items || []) {
      const name = item.name?.slice(PREFIX.length);
      if (name?.endsWith('.svg') && !/_48_(Light|Dark)\.svg$/i.test(name)) items.push(name);
    }
    pageToken = data.nextPageToken || '';
  } while (pageToken);
  return [...new Set(items)].sort();
}

const names = await catalog();
await fs.mkdir(OUT, { recursive: true });
let done = 0;
let cursor = 0;
const worker = async () => {
  while (cursor < names.length) {
    const name = names[cursor++];
    const target = path.join(OUT, name);
    const res = await fetch(`https://storage.googleapis.com/eraser-public-assets/canvas-icons/${encodeURIComponent(name)}`);
    if (!res.ok) throw new Error(`${name}: ${res.status}`);
    await fs.writeFile(target, Buffer.from(await res.arrayBuffer()));
    done += 1;
    if (done % 50 === 0 || done === names.length) console.log(`${done}/${names.length}`);
  }
};
await Promise.all(Array.from({ length: 8 }, worker));
await fs.writeFile(path.resolve('public/eraser-icons-manifest.json'), JSON.stringify(names, null, 2));
console.log(`Downloaded ${names.length} Eraser icons into ${OUT}`);
