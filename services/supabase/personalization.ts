import type { PersonalizationProgress } from '../../config/personalization';
import { cached, TTL_PROFILE_MS } from './cache';
import { ensureSupabase } from './client';

const countRows = (count: number | null) => Math.max(0, count ?? 0);

export const createPersonalizationApi = () => ({
  async fetchPersonalizationProgress(userId: string, ownedSongIds: string[]): Promise<PersonalizationProgress> {
    const songIds = [...new Set(ownedSongIds.filter(Boolean))];
    const cacheKey = `personalizationProgress:${userId}:${songIds.slice().sort().join(',')}`;

    return cached(cacheKey, TTL_PROFILE_MS, async () => {
      const client = ensureSupabase();
      const emptyOwned = Promise.resolve({ count: 0, error: null });
      const [lyricsResult, videosResult, playsResult] = await Promise.all([
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
      ]);

      const error = lyricsResult.error || videosResult.error || playsResult.error;
      if (error) throw error;

      return {
        uploads: songIds.length,
        lyrics: countRows(lyricsResult.count),
        videos: countRows(videosResult.count),
        qualifiedPlays: countRows(playsResult.count),
      };
    });
  },
});
