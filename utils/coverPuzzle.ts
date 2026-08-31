import type { Song } from '../types';

const normalizeCoverIdentity = (song: Song) => {
  const raw = song.coverPath?.trim() || song.coverUrl?.trim() || `song:${song.id}`;
  try {
    const url = new URL(raw, window.location.origin);
    return decodeURIComponent(url.pathname).replace(/\/+$/, '').toLowerCase();
  } catch {
    return raw.split('?')[0].replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
  }
};

const fallbackHash = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `cover-${(hash >>> 0).toString(16).padStart(8, '0')}`;
};

export const getCoverPuzzleIdentity = async (song: Song) => {
  const identity = normalizeCoverIdentity(song);
  if (!globalThis.crypto?.subtle) return fallbackHash(identity);
  const bytes = new TextEncoder().encode(identity);
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
};

export const formatPuzzleTime = (elapsedMs: number) => {
  const totalTenths = Math.max(0, Math.round(elapsedMs / 100));
  const minutes = Math.floor(totalTenths / 600);
  const seconds = Math.floor((totalTenths % 600) / 10);
  const tenths = totalTenths % 10;
  return minutes > 0
    ? `${minutes}:${seconds.toString().padStart(2, '0')}.${tenths}`
    : `${seconds}.${tenths} 秒`;
};
