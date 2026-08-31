import type { PersonalizationProgress } from '../../config/personalization';
import type { CoverPuzzleRecordRow } from './types';
import { cached, invalidateApiCache, TTL_PROFILE_MS } from './cache';
import { ensureSupabase } from './client';

const countRows = (count: number | null) => Math.max(0, count ?? 0);

export const createPersonalizationApi = () => ({
  async fetchPersonalizationProgress(userId: string, ownedSongIds: string[]): Promise<PersonalizationProgress> {
    const songIds = [...new Set(ownedSongIds.filter(Boolean))];
    const cacheKey = `personalizationProgress:${userId}:${songIds.slice().sort().join(',')}`;

    return cached(cacheKey, TTL_PROFILE_MS, async () => {
      const client = ensureSupabase();
      const emptyOwned = Promise.resolve({ count: 0, error: null });
      const [lyricsResult, videosResult, playsResult, puzzlesResult] = await Promise.all([
        songIds.length
          ? client.from('song_lyrics').select('song_id', { count: 'exact', head: true }).in('song_id', songIds)
          : emptyOwned,
        songIds.length
          ? client.from('song_videos').select('id', { count: 'exact', head: true }).in('song_id', songIds)
          : emptyOwned,
        client
          .from('listening_play_events')
          .select('event_id', { count: 'exact', head: true })
          .eq('user_id', userId)
          .eq('metric', 'qualified_play'),
        client
          .from('cover_puzzle_records')
          .select('cover_key', { count: 'exact', head: true })
          .eq('user_id', userId),
      ]);

      const error = lyricsResult.error || videosResult.error || playsResult.error || puzzlesResult.error;
      if (error) throw error;

      return {
        uploads: songIds.length,
        lyrics: countRows(lyricsResult.count),
        videos: countRows(videosResult.count),
        qualifiedPlays: countRows(playsResult.count),
        puzzles: countRows(puzzlesResult.count),
      };
    });
  },

  async fetchCoverPuzzleRecords(userId?: string): Promise<CoverPuzzleRecordRow[]> {
    const client = ensureSupabase();
    let query = client
      .from('cover_puzzle_records')
      .select('*')
      .order('best_time_ms', { ascending: true });
    if (userId) query = query.eq('user_id', userId);
    const { data, error } = await query;
    if (error) throw error;
    return (data ?? []) as CoverPuzzleRecordRow[];
  },

  async recordCoverPuzzleResult(input: {
    coverKey: string;
    coverPath?: string | null;
    albumTitle?: string | null;
    elapsedMs: number;
  }): Promise<CoverPuzzleRecordRow> {
    const client = ensureSupabase();
    const { data, error } = await client.rpc('record_cover_puzzle_result', {
      p_cover_key: input.coverKey,
      p_cover_path: input.coverPath ?? null,
      p_album_title: input.albumTitle ?? null,
      p_elapsed_ms: Math.max(1, Math.round(input.elapsedMs)),
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error('拼图成绩未保存');
    invalidateApiCache((key) => key.startsWith('personalizationProgress:'));
    return row as CoverPuzzleRecordRow;
  },
});
