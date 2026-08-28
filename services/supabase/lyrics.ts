import { cached, invalidateApiCache } from './cache';
import { ensureSupabase } from './client';
import type {
  SongLyricsFormat,
  SongLyricsInput,
  SongLyricsNormalizedContent,
  SongLyricsRow,
  SongLyricsSource,
} from './types';

export const SONG_LYRICS_CACHE_TTL_MS = 10 * 60_000;
const SONG_LYRICS_CACHE_PREFIX = 'songLyrics:';

const SONG_LYRICS_FORMATS = new Set<SongLyricsFormat>(['plain', 'lrc', 'ttml']);
const SONG_LYRICS_SOURCES = new Set<SongLyricsSource>(['upload', 'embedded', 'editor']);

const encodeCachePart = (value: string) => encodeURIComponent(value);

const getSongLyricsCachePrefix = (songId: string) => (
  `${SONG_LYRICS_CACHE_PREFIX}${encodeCachePart(songId)}:`
);

const getSongLyricsCacheKey = (songId: string, viewerId: string) => (
  `${getSongLyricsCachePrefix(songId)}${encodeCachePart(viewerId)}`
);

const assertSongId = (songId: string) => {
  if (typeof songId !== 'string' || !songId.trim()) throw new Error('歌曲 ID 不能为空');
  return songId.trim();
};

const assertLyricsInput = (input: SongLyricsInput) => {
  if (!input || typeof input !== 'object') throw new Error('歌词参数无效');
  if (!SONG_LYRICS_FORMATS.has(input.format)) throw new Error(`不支持的歌词格式：${input.format}`);
  if (!SONG_LYRICS_SOURCES.has(input.source)) throw new Error(`不支持的歌词来源：${input.source}`);
  if (typeof input.rawContent !== 'string' || !input.rawContent.trim()) {
    throw new Error('歌词内容不能为空');
  }

  const offsetMs = input.offsetMs ?? 0;
  if (!Number.isSafeInteger(offsetMs)) throw new Error('歌词偏移必须是整数');

  const version = input.version ?? 1;
  if (!Number.isSafeInteger(version) || version < 1) throw new Error('歌词版本必须是正整数');

  return { offsetMs, version };
};

const createFallbackChecksum = (value: string) => {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
};

const calculateChecksum = async (
  format: SongLyricsFormat,
  source: SongLyricsSource,
  rawContent: string,
  normalizedContent: SongLyricsNormalizedContent,
  offsetMs: number,
) => {
  const material = [
    format,
    source,
    rawContent,
    JSON.stringify(normalizedContent),
    String(offsetMs),
  ].join('\u0000');

  try {
    if (globalThis.crypto?.subtle) {
      const digest = await globalThis.crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(material),
      );
      return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
    }
  } catch {
    // 当前运行环境没有可用 Web Crypto 时使用稳定的本地兜底校验值。
  }

  return createFallbackChecksum(material);
};

const buildLyricsPayload = async (songId: string, input: SongLyricsInput) => {
  const { offsetMs, version } = assertLyricsInput(input);
  const normalizedContent = input.normalizedContent ?? null;
  const checksum = input.checksum?.trim() || await calculateChecksum(
    input.format,
    input.source,
    input.rawContent,
    normalizedContent,
    offsetMs,
  );

  return {
    song_id: songId,
    format: input.format,
    source: input.source,
    raw_content: input.rawContent,
    normalized_content: normalizedContent,
    offset_ms: offsetMs,
    checksum,
    version,
  };
};

const getViewerCacheScope = async (client: any): Promise<string | null> => {
  try {
    if (!client.auth || typeof client.auth.getUser !== 'function') return null;
    const { data, error } = await client.auth.getUser();
    if (error) return null;
    return data?.user?.id ? String(data.user.id) : 'anonymous';
  } catch {
    // 身份查询失败时不缓存结果，避免把一个用户的私有歌词复用给另一用户。
    return null;
  }
};

const fetchSongLyricsFromSupabase = async (client: any, songId: string): Promise<SongLyricsRow | null> => {
  const { data, error } = await client
    .from('song_lyrics')
    .select('*')
    .eq('song_id', songId)
    .maybeSingle();
  if (error) throw error;
  return (data ?? null) as SongLyricsRow | null;
};

export const invalidateSongLyricsCache = (songId: string) => {
  const normalizedSongId = assertSongId(songId);
  const prefix = getSongLyricsCachePrefix(normalizedSongId);
  invalidateApiCache((key) => key.startsWith(prefix));
};

export const createSongLyricsApi = () => ({
  async fetchSongLyrics(songId: string): Promise<SongLyricsRow | null> {
    const normalizedSongId = assertSongId(songId);
    const client = ensureSupabase();
    const viewerId = await getViewerCacheScope(client);
    if (!viewerId) return fetchSongLyricsFromSupabase(client, normalizedSongId);

    return cached(
      getSongLyricsCacheKey(normalizedSongId, viewerId),
      SONG_LYRICS_CACHE_TTL_MS,
      () => fetchSongLyricsFromSupabase(client, normalizedSongId),
    );
  },

  async upsertSongLyrics(songId: string, input: SongLyricsInput): Promise<SongLyricsRow> {
    const normalizedSongId = assertSongId(songId);
    const client = ensureSupabase();
    const payload = await buildLyricsPayload(normalizedSongId, input);
    const { data, error } = await client
      .from('song_lyrics')
      .upsert(payload, { onConflict: 'song_id' })
      .select('*')
      .single();
    if (error) throw error;
    if (!data) throw new Error('歌词保存未返回数据');

    invalidateSongLyricsCache(normalizedSongId);
    return data as SongLyricsRow;
  },

  async deleteSongLyrics(songId: string): Promise<void> {
    const normalizedSongId = assertSongId(songId);
    const client = ensureSupabase();
    const { error } = await client
      .from('song_lyrics')
      .delete()
      .eq('song_id', normalizedSongId);
    if (error) throw error;

    invalidateSongLyricsCache(normalizedSongId);
  },
});

export const createLyricsApi = createSongLyricsApi;

export type SongLyricsApi = ReturnType<typeof createSongLyricsApi>;
