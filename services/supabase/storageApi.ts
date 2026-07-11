import { cosClient } from '../../cosClient';

const extractSupabasePublicObject = (url: string) => {
  const match = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/i);
  if (!match) return null;
  return { bucket: match[1].toLowerCase(), path: match[2] };
};

const extractCosObjectKey = (url: string) => {
  try {
    const parsed = new URL(url);
    if (!/myqcloud\.com$/i.test(parsed.hostname)) return null;
    const key = decodeURIComponent(parsed.pathname.replace(/^\/+/, ''));
    return key ? key : null;
  } catch {
    return null;
  }
};

type CosSignedUrlCacheEntry = { signedUrl: string; expiresAt: number };

const cosSignedUrlCache = new Map<string, CosSignedUrlCacheEntry>();

const getCosSignedUrlCached = async (key: string, expiresInSeconds: number) => {
  const cacheKey = `${expiresInSeconds}:${key}`;
  const now = Date.now();
  const cached = cosSignedUrlCache.get(cacheKey);
  if (cached && cached.expiresAt - now > 30_000) return cached.signedUrl;
  if (!cosClient.isEnabled) throw new Error('COS 未配置');
  const signedUrl = await cosClient.getSignedUrl(key, expiresInSeconds);
  cosSignedUrlCache.set(cacheKey, { signedUrl, expiresAt: now + expiresInSeconds * 1000 });
  return signedUrl;
};

const normalizeStoragePath = (path: string, bucket: string) => {
  if (!/^https?:\/\//i.test(path)) return path;

  const extracted = extractSupabasePublicObject(path);
  if (extracted && extracted.bucket === bucket) return extracted.path;

  const key = extractCosObjectKey(path);
  return key ?? path;
};

export const createSignedAudioUrl = async (path: string, expiresInSeconds = 6 * 60 * 60) => {
  const normalizedPath = normalizeStoragePath(path, 'audio');
  if (/^https?:\/\//i.test(normalizedPath)) return normalizedPath;
  return getCosSignedUrlCached(normalizedPath, expiresInSeconds);
};

export const createSignedCoverUrl = async (path: string, expiresInSeconds = 24 * 60 * 60) => {
  const normalizedPath = normalizeStoragePath(path, 'covers');
  if (/^https?:\/\//i.test(normalizedPath)) return normalizedPath;
  return getCosSignedUrlCached(normalizedPath, expiresInSeconds);
};

export const createSignedAvatarUrl = async (path: string, expiresInSeconds = 24 * 60 * 60) => {
  const normalizedPath = normalizeStoragePath(path, 'avatars');
  if (/^https?:\/\//i.test(normalizedPath)) return normalizedPath;
  return getCosSignedUrlCached(normalizedPath, expiresInSeconds);
};

export const clearSignedUrlCache = () => {
  cosSignedUrlCache.clear();
};
