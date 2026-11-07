import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function base64ToBlob(base64: string, type: string = 'image/png'): Blob {
  if (!base64 || typeof base64 !== 'string') {
    return new Blob([], { type });
  }

  // If input is a URL (HTTP, HTTPS, blob:, or relative/absolute path), it's not raw base64 data
  if (
    base64.startsWith('http://') ||
    base64.startsWith('https://') ||
    base64.startsWith('/') ||
    base64.startsWith('blob:')
  ) {
    console.warn("[base64ToBlob] Input appears to be a URL, not base64. Returning empty Blob. Use imageSourceToBlob for URLs.");
    return new Blob([], { type });
  }

  try {
    const commaIndex = base64.indexOf(',');
    let cleanBase64 = commaIndex !== -1 ? base64.slice(commaIndex + 1) : base64;

    // Detect MIME type if data: URI header is present
    let mimeType = type;
    if (commaIndex !== -1) {
      const header = base64.slice(0, commaIndex);
      const match = header.match(/data:([^;]+);/);
      if (match && match[1]) {
        mimeType = match[1];
      }
    }

    // Clean whitespace and sanitize URL-safe base64 characters
    cleanBase64 = cleanBase64.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/');
    while (cleanBase64.length % 4 !== 0) {
      cleanBase64 += '=';
    }

    const byteString = atob(cleanBase64);
    const ab = new ArrayBuffer(byteString.length);
    const ia = new Uint8Array(ab);
    for (let i = 0; i < byteString.length; i++) {
      ia[i] = byteString.charCodeAt(i);
    }
    return new Blob([ab], { type: mimeType });
  } catch (err) {
    console.warn("[base64ToBlob] Failed to decode base64 string to Blob:", err);
    return new Blob([], { type });
  }
}

export async function imageSourceToBlob(
  source: string | null | undefined,
  defaultType: string = 'image/png'
): Promise<Blob | null> {
  if (!source || typeof source !== 'string') return null;

  const trimmed = source.trim();
  if (!trimmed) return null;

  // Case 1: Data URI
  if (trimmed.startsWith('data:')) {
    try {
      const blob = base64ToBlob(trimmed, defaultType);
      return blob.size > 0 ? blob : null;
    } catch (e) {
      console.warn("[imageSourceToBlob] Failed converting data URI to Blob:", e);
      return null;
    }
  }

  // Case 2: Remote or Local URL
  if (
    trimmed.startsWith('http://') ||
    trimmed.startsWith('https://') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('blob:')
  ) {
    try {
      const response = await fetch(trimmed);
      if (response.ok) {
        return await response.blob();
      }
    } catch (fetchErr) {
      console.warn("[imageSourceToBlob] Failed fetching image URL to Blob:", fetchErr);
    }
    return null;
  }

  // Case 3: Raw base64 string without data: prefix
  try {
    const blob = base64ToBlob(trimmed, defaultType);
    return blob.size > 0 ? blob : null;
  } catch (e) {
    console.warn("[imageSourceToBlob] Failed converting raw base64 to Blob:", e);
    return null;
  }
}
