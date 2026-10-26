const ZIP_EOCD = 0x06054b50;
const ZIP_CENTRAL = 0x02014b50;
const ZIP_LOCAL = 0x04034b50;

async function inflateRaw(bytes) {
  if (typeof DecompressionStream !== "function") {
    throw new Error("This browser cannot extract compressed ZIP files. Extract the ZIP and choose the folder instead.");
  }
  try {
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
    return new Uint8Array(await new Response(stream).arrayBuffer());
  } catch {
    throw new Error("This ZIP compression method is not supported by this browser. Extract the ZIP and choose the folder instead.");
  }
}

export async function readZipTextFiles(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const min = Math.max(0, bytes.length - 65557);
  let eocd = -1;
  for (let i = bytes.length - 22; i >= min; i--) {
    if (view.getUint32(i, true) === ZIP_EOCD) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error("This file is not a valid ZIP archive.");
  const count = view.getUint16(eocd + 10, true);
  let cursor = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const files = [];
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > bytes.length || view.getUint32(cursor, true) !== ZIP_CENTRAL) {
      throw new Error("The ZIP archive directory is invalid or incomplete.");
    }
    const flags = view.getUint16(cursor + 8, true);
    const method = view.getUint16(cursor + 10, true);
    const compressedSize = view.getUint32(cursor + 20, true);
    const nameLength = view.getUint16(cursor + 28, true);
    const extraLength = view.getUint16(cursor + 30, true);
    const commentLength = view.getUint16(cursor + 32, true);
    const localOffset = view.getUint32(cursor + 42, true);
    const name = decoder.decode(bytes.subarray(cursor + 46, cursor + 46 + nameLength)).replace(/\\/g, "/");
    cursor += 46 + nameLength + extraLength + commentLength;
    if (!name || name.endsWith("/") || name.startsWith("/") || name.split("/").includes("..")) continue;
    if (flags & 1) throw new Error("Encrypted ZIP archives are not supported.");
    if (!/\\.(?:ya?ml)$/i.test(name)) continue;
    if (localOffset + 30 > bytes.length || view.getUint32(localOffset, true) !== ZIP_LOCAL) {
      throw new Error("A file in the ZIP archive has an invalid header: " + name);
    }
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.subarray(dataStart, dataStart + compressedSize);
    let content;
    if (method === 0) content = compressed;
    else if (method === 8) content = await inflateRaw(compressed);
    else throw new Error("Unsupported ZIP compression method for " + name + ".");
    files.push({ name, text: decoder.decode(content) });
  }
  if (!files.length) throw new Error("No YAML files were found in the selected ZIP archive.");
  return files;
}
