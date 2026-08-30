import { cosClient } from '../../cosClient';
import { createRuntimeUuid } from '../../utils/runtimeId';
import { cached, invalidateApiCache } from './cache';
import { ensureSupabase } from './client';
import { createSignedVideoPosterUrl, createSignedVideoUrl } from './storageApi';
import type { SongVideoInput, SongVideoRow } from './types';

const VIDEO_METADATA_TTL_MS = 15 * 60_000;
const cacheKey = (songId: string) => `songVideos:${songId}`;
const emitSongVideosChanged = (songId: string) => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent('jzone:song-videos-changed', { detail: { songId } }));
};

const getVideoExt = (file: File) => {
  const fromName = file.name.split('.').pop()?.toLowerCase();
  if (fromName && /^(mp4|webm|mov|m4v)$/.test(fromName)) return fromName;
  if (file.type.includes('webm')) return 'webm';
  if (file.type.includes('quicktime')) return 'mov';
  return 'mp4';
};

export const createSongVideosApi = () => ({
  async fetchSongVideos(songId: string): Promise<SongVideoRow[]> {
    return cached(cacheKey(songId), VIDEO_METADATA_TTL_MS, async () => {
      const client = ensureSupabase();
      const { data, error } = await client
        .from('song_videos')
        .select('*')
        .eq('song_id', songId)
        .order('created_at', { ascending: true });
      if (error) throw error;
      return (data ?? []) as SongVideoRow[];
    });
  },

  async createSongVideo(songId: string, ownerId: string, input: SongVideoInput, onProgress?: (percent: number) => void) {
    if (!cosClient.isEnabled) throw new Error('COS 未配置');
    const client = ensureSupabase();
    const id = createRuntimeUuid();
    const ext = getVideoExt(input.videoFile);
    const videoPath = `${ownerId}/${songId}/videos/${id}.${ext}`;
    const posterPath = input.posterFile ? `${ownerId}/${songId}/video-posters/${id}.jpg` : null;

    try {
      await cosClient.uploadFile(input.videoFile, videoPath, input.videoFile.type || `video/${ext}`, (progress) => {
        onProgress?.(Math.round(progress.percent * (posterPath ? 0.9 : 1)));
      });
      if (posterPath && input.posterFile) {
        await cosClient.uploadFile(input.posterFile, posterPath, 'image/jpeg', (progress) => {
          onProgress?.(90 + Math.round(progress.percent * 0.1));
        });
      }

      const { data: existing, error: existingError } = await client
        .from('song_videos')
        .select('*')
        .eq('song_id', songId)
        .eq('kind', input.kind)
        .maybeSingle();
      if (existingError) throw existingError;
      const existingRow = existing as SongVideoRow | null;
      const payload = {
        id: existingRow?.id ?? id,
        song_id: songId,
        owner_id: ownerId,
        kind: input.kind,
        video_path: videoPath,
        poster_path: posterPath,
        file_name: input.videoFile.name,
        file_size: input.videoFile.size,
        duration_ms: Math.round(input.durationMs),
        video_start_ms: Math.max(0, Math.round(input.videoStartMs ?? 0)),
        video_end_ms: input.videoEndMs == null ? null : Math.round(input.videoEndMs),
        song_start_ms: input.kind === 'memory' ? Math.max(0, Math.round(input.songStartMs ?? 0)) : null,
        song_end_ms: input.kind === 'memory' ? Math.max(1, Math.round(input.songEndMs ?? input.durationMs)) : null,
        audio_mix: input.kind === 'memory' ? Math.max(0, Math.min(1, input.audioMix ?? 0)) : 1,
      };
      const request = existingRow
        ? client.from('song_videos').update(payload).eq('id', existingRow.id).select('*').single()
        : client.from('song_videos').insert(payload).select('*').single();
      const { data, error } = await request;
      if (error) throw error;
      invalidateApiCache((key) => key === cacheKey(songId));
      emitSongVideosChanged(songId);
      if (existingRow) {
        const stalePaths = [existingRow.video_path, ...(existingRow.poster_path ? [existingRow.poster_path] : [])]
          .filter((path) => path !== videoPath && path !== posterPath);
        if (stalePaths.length) await cosClient.deleteFiles(stalePaths).catch(() => {});
      }
      onProgress?.(100);
      return data as SongVideoRow;
    } catch (error) {
      await cosClient.deleteFiles([videoPath, ...(posterPath ? [posterPath] : [])]).catch(() => {});
      throw error;
    }
  },

  async deleteSongVideo(row: SongVideoRow) {
    const client = ensureSupabase();
    const { error } = await client.from('song_videos').delete().eq('id', row.id);
    if (error) throw error;
    invalidateApiCache((key) => key === cacheKey(row.song_id));
    emitSongVideosChanged(row.song_id);
    if (cosClient.isEnabled) {
      await cosClient.deleteFiles([row.video_path, ...(row.poster_path ? [row.poster_path] : [])]).catch(() => {});
    }
  },

  createSignedVideoUrl,
  createSignedVideoPosterUrl,
});
