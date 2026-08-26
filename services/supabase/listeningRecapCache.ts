import {
  normalizeListeningRecapPeriod,
  parseListeningRecapResponse,
  type ListeningRecapPeriod,
  type ListeningRecapResponse,
} from './listeningRecapTypes';

export const LISTENING_RECAP_CACHE_PREFIX = 'jzone_listening_recap_v1:';
export const LISTENING_RECAP_COVERAGE_VERSION = 'events-v1';
export const LISTENING_RECAP_CACHE_TTL_MS = 5 * 60_000;
export const LISTENING_RECAP_CACHE_EVENT = 'jzone:listening-recap-cache-changed';

interface StoredListeningRecapCacheEntry {
  response: ListeningRecapResponse;
  cachedAt: number;
  expiresAt: number;
}

export interface ListeningRecapCacheEntry {
  key: string;
  response: ListeningRecapResponse;
  cachedAt: number;
  expiresAt: number;
  isFresh: boolean;
}

const memoryCache = new Map<string, StoredListeningRecapCacheEntry>();

const getStorage = (): Storage | null => {
  if (typeof window === 'undefined') return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const notifyCacheChanged = () => {
  if (typeof window === 'undefined') return;
  try {
    window.dispatchEvent(new Event(LISTENING_RECAP_CACHE_EVENT));
  } catch {
    // 某些测试运行时没有完整的 DOM 事件实现，缓存本身仍然有效。
  }
};

const isStoredEntry = (value: unknown): value is StoredListeningRecapCacheEntry => {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<StoredListeningRecapCacheEntry>;
  return typeof candidate.cachedAt === 'number'
    && Number.isFinite(candidate.cachedAt)
    && typeof candidate.expiresAt === 'number'
    && Number.isFinite(candidate.expiresAt)
    && candidate.expiresAt > 0
    && candidate.response !== undefined;
};

const readStoredEntry = (key: string): StoredListeningRecapCacheEntry | null => {
  const inMemory = memoryCache.get(key);
  if (inMemory) return inMemory;

  const storage = getStorage();
  if (!storage) return null;
  let parsed: unknown;
  try {
    const raw = storage.getItem(key);
    if (!raw) return null;
    parsed = JSON.parse(raw);
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // 忽略不可用的持久化缓存，继续使用内存缓存。
    }
    return null;
  }

  if (!isStoredEntry(parsed)) {
    try {
      storage.removeItem(key);
    } catch {
      // 忽略损坏缓存的清理失败。
    }
    return null;
  }

  try {
    const response = parseListeningRecapResponse(parsed.response);
    const entry = { ...parsed, response };
    memoryCache.set(key, entry);
    return entry;
  } catch {
    try {
      storage.removeItem(key);
    } catch {
      // 忽略损坏缓存的清理失败。
    }
    return null;
  }
};

export const getListeningRecapCacheKey = (
  userId: string,
  period: ListeningRecapPeriod,
  coverageVersion = LISTENING_RECAP_COVERAGE_VERSION,
) => {
  if (!userId) throw new Error('聆听回顾缓存缺少用户');
  const normalizedPeriod = normalizeListeningRecapPeriod(period);
  if (!coverageVersion) throw new Error('聆听回顾缓存缺少覆盖版本');
  return `${LISTENING_RECAP_CACHE_PREFIX}${userId}:${normalizedPeriod.type}:${normalizedPeriod.id}:${coverageVersion}`;
};

export const readListeningRecapCache = (
  userId: string,
  period: ListeningRecapPeriod,
): ListeningRecapCacheEntry | null => {
  if (!userId) return null;
  const key = getListeningRecapCacheKey(userId, period);
  const entry = readStoredEntry(key);
  if (!entry) return null;
  return {
    key,
    response: entry.response,
    cachedAt: entry.cachedAt,
    expiresAt: entry.expiresAt,
    isFresh: entry.expiresAt > Date.now(),
  };
};

export const writeListeningRecapCache = (
  userId: string,
  response: ListeningRecapResponse,
  ttlMs = LISTENING_RECAP_CACHE_TTL_MS,
): ListeningRecapCacheEntry | null => {
  if (!userId || ttlMs <= 0) return null;
  const normalizedResponse = parseListeningRecapResponse(response);
  const key = getListeningRecapCacheKey(userId, normalizedResponse.period, normalizedResponse.coverageVersion);
  const cachedAt = Date.now();
  const entry: StoredListeningRecapCacheEntry = {
    response: normalizedResponse,
    cachedAt,
    expiresAt: cachedAt + ttlMs,
  };
  memoryCache.set(key, entry);

  const storage = getStorage();
  if (storage) {
    try {
      storage.setItem(key, JSON.stringify(entry));
    } catch {
      // localStorage 不可用时保留本页内存缓存，不让回顾读取失败。
    }
  }
  notifyCacheChanged();
  return {
    key,
    response: normalizedResponse,
    cachedAt,
    expiresAt: entry.expiresAt,
    isFresh: true,
  };
};

export const clearListeningRecapCacheForUser = (userId: string | null | undefined) => {
  if (!userId) return;
  const userPrefix = `${LISTENING_RECAP_CACHE_PREFIX}${userId}:`;
  for (const key of memoryCache.keys()) {
    if (key.startsWith(userPrefix)) memoryCache.delete(key);
  }

  const storage = getStorage();
  if (storage) {
    const keysToRemove: string[] = [];
    try {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key?.startsWith(userPrefix)) keysToRemove.push(key);
      }
      for (const key of keysToRemove) storage.removeItem(key);
    } catch {
      // 只清理已知用户前缀；存储不可用时不影响其余回顾状态。
    }
  }
  notifyCacheChanged();
};

export const clearListeningRecapCache = () => {
  memoryCache.clear();
  const storage = getStorage();
  if (storage) {
    const keysToRemove: string[] = [];
    try {
      for (let index = 0; index < storage.length; index += 1) {
        const key = storage.key(index);
        if (key?.startsWith(LISTENING_RECAP_CACHE_PREFIX)) keysToRemove.push(key);
      }
      for (const key of keysToRemove) storage.removeItem(key);
    } catch {
      // 只清理回顾专用用户命名空间，不触碰其他页面缓存。
    }
  }
  notifyCacheChanged();
};

const getDatePart = (parts: Intl.DateTimeFormatPart[], type: Intl.DateTimeFormatPartTypes) => (
  parts.find((part) => part.type === type)?.value ?? ''
);

export const getCurrentListeningRecapPeriod = (): ListeningRecapPeriod => {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
    }).formatToParts(new Date());
    const year = getDatePart(parts, 'year');
    const month = getDatePart(parts, 'month');
    if (/^\d{4}$/.test(year) && /^(0[1-9]|1[0-2])$/.test(month)) return { type: 'month', id: `${year}-${month}` };
  } catch {
    // 使用固定 UTC+08:00 兜底，绝不回退到设备本地时区。
  }

  const shanghaiNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
  return {
    type: 'month',
    id: `${shanghaiNow.getUTCFullYear()}-${String(shanghaiNow.getUTCMonth() + 1).padStart(2, '0')}`,
  };
};
