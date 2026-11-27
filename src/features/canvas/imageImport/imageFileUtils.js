// Small browser helpers shared by canvas import and the cloud-save optimizer.

export function readAsDataURL(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error || new Error("Could not read the image."));
    reader.readAsDataURL(blob);
  });
}

export async function contentFileId(blob) {
  try {
    const digest = await crypto.subtle.digest("SHA-1", await blob.arrayBuffer());
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, "0")).join("");
  } catch {
    return `img-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/** "data:image/png;base64,AAAA" -> File (no network round trip). */
export function dataUrlToFile(dataURL, name = "image") {
  const comma = dataURL.indexOf(",");
  const header = dataURL.slice(0, comma);
  const mime = /^data:([^;,]+)/.exec(header)?.[1] || "image/png";
  const binary = header.includes(";base64") ? atob(dataURL.slice(comma + 1)) : decodeURIComponent(dataURL.slice(comma + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], name, { type: mime });
}
