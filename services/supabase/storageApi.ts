import {
  COS_AUDIO_BROWSER_CACHE_CONTROL,
  COS_AUDIO_BROWSER_CACHE_MAX_AGE_SECONDS,
  COS_IMAGE_BROWSER_CACHE_CONTROL,
  COS_IMAGE_BROWSER_CACHE_MAX_AGE_SECONDS,
  cosClient,
} from '../../cosClient';
import {
  classifyMediaFailure,
  type MediaFailureCategory,
} from '../../utils/mediaFailure';

export const AUDIO_SIGNED_URL_TTL_SECONDS = COS_AUDIO_BROWSER_CACHE_MAX_AGE_SECONDS;
export const IMAGE_SIGNED_URL_TTL_SECONDS = COS_IMAGE_BROWSER_CACHE_MAX_AGE_SECONDS;
const SIGNED_URL_CACHE_KEY = 'jzone_cos_signed_urls_v1';
const SIGNED_URL_EXPIRY_MARGIN_MS = 10 * 60 * 1000;
const MAX_PERSISTED_SIGNED_URLS = 256;

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
const cosSignedUrlInFlight = new Map<string, Promise<string>>();
const signedUrlCacheGenerations = new Map<string, number>();
let signedUrlCacheGeneration = 0;

const readPersistedSignedUrls = () => {
  if (typeof window === 'undefined') return;
  try {
    const raw = window.localStorage.getItem(SIGNED_URL_CACHE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, CosSignedUrlCacheEntry>;
    const now = Date.now();
    Object.entries(parsed).forEach(([key, value]) => {
      if (typeof value?.signedUrl === 'string' && value.expiresAt - now > SIGNED_URL_EXPIRY_MARGIN_MS) {
        cosSignedUrlCache.set(key, value);
      }
    });
  } catch {
    try {
      window.localStorage.removeItem(SIGNED_URL_CACHE_KEY);
    } catch {
      // 隐私模式可能完全禁用 localStorage，退回内存缓存即可。
    }
  }
};

const persistSignedUrls = () => {
  if (typeof window === 'undefined') return;
  try {
    const now = Date.now();
    const entries = Array.from(cosSignedUrlCache.entries())
      .filter(([, value]) => value.expiresAt - now > SIGNED_URL_EXPIRY_MARGIN_MS)
      .sort((a, b) => b[1].expiresAt - a[1].expiresAt)
      .slice(0, MAX_PERSISTED_SIGNED_URLS);
    window.localStorage.setItem(SIGNED_URL_CACHE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // localStorage 不可用时仍保留本次页面内的内存缓存。
  }
};

readPersistedSignedUrls();

const getCosSignedUrlCached = async (key: string, expiresInSeconds: number, responseCacheControl: string) => {
  const cacheKey = `${responseCacheControl}:${key}`;
  const now = Date.now();
  const cached = cosSignedUrlCache.get(cacheKey);
  if (cached && cached.expiresAt - now > SIGNED_URL_EXPIRY_MARGIN_MS) return cached.signedUrl;
  const pending = cosSignedUrlInFlight.get(cacheKey);
  if (pending) return pending;
  if (!cosClient.isEnabled) throw new Error('COS 未配置');
  const generation = signedUrlCacheGeneration;
  const keyGeneration = signedUrlCacheGenerations.get(cacheKey) ?? 0;
  let request: Promise<string>;
  request = cosClient
    .getSignedUrl(key, expiresInSeconds, responseCacheControl)
    .then((signedUrl) => {
      if (
        generation !== signedUrlCacheGeneration
        || keyGeneration !== (signedUrlCacheGenerations.get(cacheKey) ?? 0)
      ) return signedUrl;
      cosSignedUrlCache.set(cacheKey, { signedUrl, expiresAt: Date.now() + expiresInSeconds * 1000 });
      persistSignedUrls();
      return signedUrl;
    })
    .finally(() => {
      if (cosSignedUrlInFlight.get(cacheKey) === request) cosSignedUrlInFlight.delete(cacheKey);
    });
  cosSignedUrlInFlight.set(cacheKey, request);
  return request;
};

const normalizeStoragePath = (path: string, bucket: string) => {
  if (!/^https?:\/\//i.test(path)) return path;

  const extracted = extractSupabasePublicObject(path);
  if (extracted && extracted.bucket === bucket) return extracted.path;

  const key = extractCosObjectKey(path);
  return key ?? path;
};

const invalidateSignedUrlForPath = (path: string, bucket: string, responseCacheControl: string) => {
  const normalizedPath = normalizeStoragePath(path, bucket);
  if (!normalizedPath || /^https?:\/\//i.test(normalizedPath)) return;

  const cacheKey = `${responseCacheControl}:${normalizedPath}`;
  cosSignedUrlCache.delete(cacheKey);
  cosSignedUrlInFlight.delete(cacheKey);
  signedUrlCacheGenerations.set(cacheKey, (signedUrlCacheGenerations.get(cacheKey) ?? 0) + 1);
  persistSignedUrls();
};

export interface AudioPathDiagnostic {
  category: MediaFailureCategory;
  statusCode?: number;
}

/** 只在播放候选全部失败后调用的只读 COS HEAD 诊断。 */
export const diagnoseAudioPath = async (path: string): Promise<AudioPathDiagnostic> => {
  const normalizedPath = normalizeStoragePath(path, 'audio');
  if (!normalizedPath || /^https?:\/\//i.test(normalizedPath) || !cosClient.isEnabled) {
    return { category: 'unknown' };
  }

  try {
    const result = await cosClient.headObject(normalizedPath);
    return {
      category: result.ok ? 'available' : classifyMediaFailure(result),
      ...(result.statusCode === undefined ? {} : { statusCode: result.statusCode }),
    };
  } catch (error) {
    return { category: classifyMediaFailure(error) };
  }
};

/** 仅清掉指定音频 path 的签名缓存，不影响其他媒体或其他音频。 */
export const invalidateSignedAudioUrlCache = (path: string) => {
  invalidateSignedUrlForPath(path, 'audio', COS_AUDIO_BROWSER_CACHE_CONTROL);
};

/** 图片加载失败时只淘汰当前封面的签名地址，避免清空整个媒体缓存。 */
export const invalidateSignedCoverUrlCache = (path: string) => {
  invalidateSignedUrlForPath(path, 'covers', COS_IMAGE_BROWSER_CACHE_CONTROL);
};

/** 头像与个人背景沿用图片缓存策略，但保持独立的存储路径归一化。 */
export const invalidateSignedAvatarUrlCache = (path: string) => {
  invalidateSignedUrlForPath(path, 'avatars', COS_IMAGE_BROWSER_CACHE_CONTROL);
};

export const createSignedAudioUrl = async (path: string, expiresInSeconds = AUDIO_SIGNED_URL_TTL_SECONDS) => {
  const normalizedPath = normalizeStoragePath(path, 'audio');
  if (/^https?:\/\//i.test(normalizedPath)) return normalizedPath;
  return getCosSignedUrlCached(
    normalizedPath,
    Math.max(expiresInSeconds, AUDIO_SIGNED_URL_TTL_SECONDS),
    COS_AUDIO_BROWSER_CACHE_CONTROL,
  );
};

export const createSignedCoverUrl = async (path: string, expiresInSeconds = IMAGE_SIGNED_URL_TTL_SECONDS) => {
  const normalizedPath = normalizeStoragePath(path, 'covers');
  if (/^https?:\/\//i.test(normalizedPath)) return normalizedPath;
  return getCosSignedUrlCached(
    normalizedPath,
    Math.max(expiresInSeconds, IMAGE_SIGNED_URL_TTL_SECONDS),
    COS_IMAGE_BROWSER_CACHE_CONTROL,
  );
};

export const createSignedAvatarUrl = async (path: string, expiresInSeconds = IMAGE_SIGNED_URL_TTL_SECONDS) => {
  const normalizedPath = normalizeStoragePath(path, 'avatars');
  if (/^https?:\/\//i.test(normalizedPath)) return normalizedPath;
  return getCosSignedUrlCached(
    normalizedPath,
    Math.max(expiresInSeconds, IMAGE_SIGNED_URL_TTL_SECONDS),
    COS_IMAGE_BROWSER_CACHE_CONTROL,
  );
};

export const createSignedVideoUrl = async (path: string, expiresInSeconds = AUDIO_SIGNED_URL_TTL_SECONDS) => {
  const normalizedPath = normalizeStoragePath(path, 'videos');
  if (/^https?:\/\//i.test(normalizedPath)) return normalizedPath;
  return getCosSignedUrlCached(
    normalizedPath,
    Math.max(expiresInSeconds, AUDIO_SIGNED_URL_TTL_SECONDS),
    COS_AUDIO_BROWSER_CACHE_CONTROL,
  );
};

export const createSignedVideoPosterUrl = async (path: string, expiresInSeconds = IMAGE_SIGNED_URL_TTL_SECONDS) => {
  const normalizedPath = normalizeStoragePath(path, 'video-posters');
  if (/^https?:\/\//i.test(normalizedPath)) return normalizedPath;
  return getCosSignedUrlCached(
    normalizedPath,
    Math.max(expiresInSeconds, IMAGE_SIGNED_URL_TTL_SECONDS),
    COS_IMAGE_BROWSER_CACHE_CONTROL,
  );
};

export const clearSignedUrlCache = () => {
  signedUrlCacheGeneration += 1;
  cosSignedUrlCache.clear();
  cosSignedUrlInFlight.clear();
  signedUrlCacheGenerations.clear();
  if (typeof window !== 'undefined') {
    try {
      window.localStorage.removeItem(SIGNED_URL_CACHE_KEY);
    } catch {
      // localStorage 不可用时只清理内存缓存。
    }
  }
};
