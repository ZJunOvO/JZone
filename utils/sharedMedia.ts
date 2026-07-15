export const SHARED_COVER_PREFIX = 'shared/covers/v1/';

const bytesToHex = (bytes: Uint8Array) => Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('');

const fallbackContentHash = (bytes: Uint8Array) => {
  const seeds = [0x811c9dc5, 0x9e3779b9, 0x85ebca6b, 0xc2b2ae35];
  const hashes = seeds.map((seed) => {
    let hash = seed >>> 0;
    for (let index = 0; index < bytes.length; index += 1) {
      hash ^= bytes[index] + (index & 0xff);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
  });
  return `fallback-${hashes.join('')}`;
};

export const getBlobContentHash = async (blob: Blob) => {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  if (globalThis.crypto?.subtle) {
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return bytesToHex(new Uint8Array(digest));
  }
  return fallbackContentHash(bytes);
};

export const createSharedCoverPath = async (blob: Blob) => {
  const hash = await getBlobContentHash(blob);
  return `${SHARED_COVER_PREFIX}${hash}.jpg`;
};

export const isSharedCoverPath = (path?: string | null) => Boolean(path?.startsWith(SHARED_COVER_PREFIX));

