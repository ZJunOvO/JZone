type ApiCacheEntry<T> = { value: T; expiresAt: number };

const apiCache = new Map<string, ApiCacheEntry<any>>();
const apiInFlight = new Map<string, Promise<any>>();

const getApiCache = <T>(key: string): T | undefined => {
  const entry = apiCache.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt <= Date.now()) {
    apiCache.delete(key);
    return undefined;
  }
  return entry.value as T;
};

const setApiCache = <T>(key: string, value: T, ttlMs: number) => {
  if (ttlMs <= 0) return;
  apiCache.set(key, { value, expiresAt: Date.now() + ttlMs });
};

export const cached = async <T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> => {
  const hit = getApiCache<T>(key);
  if (hit !== undefined) return hit;

  const inflight = apiInFlight.get(key) as Promise<T> | undefined;
  if (inflight) return inflight;

  const request = fn()
    .then((value) => {
      setApiCache(key, value, ttlMs);
      apiInFlight.delete(key);
      return value;
    })
    .catch((error) => {
      apiInFlight.delete(key);
      throw error;
    });

  apiInFlight.set(key, request);
  return request;
};

export const invalidateApiCache = (match: (key: string) => boolean) => {
  for (const key of apiCache.keys()) {
    if (match(key)) apiCache.delete(key);
  }
  for (const key of apiInFlight.keys()) {
    if (match(key)) apiInFlight.delete(key);
  }
};

export const clearApiCache = () => {
  apiCache.clear();
  apiInFlight.clear();
};

export const emitCollectionsChanged = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('jzone:collections-changed'));
};

export const TTL_PROFILE_MS = 5 * 60_000;
export const TTL_COLLECTION_DETAIL_MS = 60_000;
export const TTL_COLLECTION_LIST_MS = 2 * 60_000;
export const TTL_MY_SONG_PLAY_MS = 60_000;
