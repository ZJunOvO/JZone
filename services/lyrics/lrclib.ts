export interface LrcLibLyricsResult {
  id: number;
  trackName: string;
  artistName: string;
  albumName: string;
  duration: number | null;
  instrumental: boolean;
  plainLyrics: string;
  syncedLyrics: string;
}

export interface LrcLibSearchInput {
  trackName: string;
  artistName?: string;
  signal?: AbortSignal;
}

interface LrcLibResponseRow {
  id?: unknown;
  trackName?: unknown;
  artistName?: unknown;
  albumName?: unknown;
  duration?: unknown;
  instrumental?: unknown;
  plainLyrics?: unknown;
  syncedLyrics?: unknown;
}

interface CachedSearch {
  expiresAt: number;
  results: LrcLibLyricsResult[];
}

const LRCLIB_SEARCH_ENDPOINT = 'https://lrclib.net/api/search';
const CACHE_TTL_MS = 24 * 60 * 60 * 1_000;
const CACHE_PREFIX = 'jzone:lrclib-search:v1:';
const memoryCache = new Map<string, CachedSearch>();

const asText = (value: unknown): string => typeof value === 'string' ? value.trim() : '';

const normalizeKeyPart = (value: string): string => value
  .normalize('NFKC')
  .trim()
  .toLocaleLowerCase()
  .replace(/\s+/g, ' ');

const createCacheKey = (trackName: string, artistName: string): string => (
  `${normalizeKeyPart(trackName)}\u0000${normalizeKeyPart(artistName)}`
);

const readSessionCache = (key: string): CachedSearch | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.sessionStorage.getItem(`${CACHE_PREFIX}${key}`);
    if (!raw) return null;
    const cached = JSON.parse(raw) as CachedSearch;
    if (!cached || cached.expiresAt <= Date.now() || !Array.isArray(cached.results)) return null;
    return cached;
  } catch {
    return null;
  }
};

const writeSessionCache = (key: string, value: CachedSearch) => {
  if (typeof window === 'undefined') return;
  try {
    window.sessionStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(value));
  } catch {
    // 会话缓存不可用时退回内存缓存，不影响搜索。
  }
};

const normalizeResult = (row: LrcLibResponseRow): LrcLibLyricsResult | null => {
  const id = Number(row.id);
  const trackName = asText(row.trackName);
  const artistName = asText(row.artistName);
  const plainLyrics = asText(row.plainLyrics);
  const syncedLyrics = asText(row.syncedLyrics);
  if (!Number.isSafeInteger(id) || !trackName || (!plainLyrics && !syncedLyrics)) return null;
  const duration = Number(row.duration);
  return {
    id,
    trackName,
    artistName,
    albumName: asText(row.albumName),
    duration: Number.isFinite(duration) && duration > 0 ? duration : null,
    instrumental: row.instrumental === true,
    plainLyrics,
    syncedLyrics,
  };
};

export const toUntimedLyricsText = (result: LrcLibLyricsResult): string => {
  if (result.plainLyrics) return result.plainLyrics;
  return result.syncedLyrics
    .split(/\r?\n/)
    .map((line) => line.replace(/^(?:\s*\[(?:\d+:)*\d+(?:\.\d+)?\])+\s*/, ''))
    .filter((line) => line.trim())
    .join('\n');
};

export const searchLrcLibLyrics = async ({
  trackName,
  artistName = '',
  signal,
}: LrcLibSearchInput): Promise<LrcLibLyricsResult[]> => {
  const normalizedTrack = trackName.trim();
  const normalizedArtist = artistName.trim();
  if (normalizedTrack.length < 1) throw new Error('请输入原曲名称。');

  const cacheKey = createCacheKey(normalizedTrack, normalizedArtist);
  const cached = memoryCache.get(cacheKey) ?? readSessionCache(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    memoryCache.set(cacheKey, cached);
    return cached.results;
  }

  const query = new URLSearchParams();
  query.set('track_name', normalizedTrack);
  if (normalizedArtist) query.set('artist_name', normalizedArtist);

  const timeoutController = new AbortController();
  const timeoutId = window.setTimeout(() => timeoutController.abort(), 10_000);
  const abortFromCaller = () => timeoutController.abort();
  signal?.addEventListener('abort', abortFromCaller, { once: true });

  try {
    const response = await fetch(`${LRCLIB_SEARCH_ENDPOINT}?${query.toString()}`, {
      headers: {
        'Lrclib-Client': 'JZone Player 1.0 (personal music library)',
      },
      signal: timeoutController.signal,
    });
    if (response.status === 429) throw new Error('搜索过于频繁，请稍后再试。');
    if (!response.ok) throw new Error(`在线歌词服务暂时不可用（${response.status}）。`);
    const payload = await response.json() as unknown;
    if (!Array.isArray(payload)) throw new Error('在线歌词返回了无法识别的数据。');
    const results = payload
      .map((row) => normalizeResult(row as LrcLibResponseRow))
      .filter((row): row is LrcLibLyricsResult => Boolean(row))
      .slice(0, 8);
    const nextCache = { expiresAt: Date.now() + CACHE_TTL_MS, results };
    memoryCache.set(cacheKey, nextCache);
    writeSessionCache(cacheKey, nextCache);
    return results;
  } catch (error) {
    if (timeoutController.signal.aborted) {
      if (signal?.aborted) throw new Error('搜索已取消。');
      throw new Error('在线歌词搜索超时，请检查网络后重试。');
    }
    throw error instanceof Error ? error : new Error('在线歌词搜索失败。');
  } finally {
    window.clearTimeout(timeoutId);
    signal?.removeEventListener('abort', abortFromCaller);
  }
};
