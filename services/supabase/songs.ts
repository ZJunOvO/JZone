import { cosClient } from '../../cosClient';
import { downscaleImageBlob } from '../../imageProcessing';
import { getAudioExtFromMime } from '../../utils/uploadAudio';
import { createRuntimeUuid } from '../../utils/runtimeId';
import { createSharedCoverPath, isSharedCoverPath } from '../../utils/sharedMedia';
import { cached, TTL_MY_SONG_PLAY_MS } from './cache';
import { ensureSupabase } from './client';
import { createSignedCoverUrl } from './storageApi';
import type { SongRow, SongVisibility } from './types';

export interface SongUploadProgress {
  phase: 'audio' | 'stream' | 'cover' | 'database';
  percent: number;
  message: string;
}

const getExt = (name: string) => {
  const idx = name.lastIndexOf('.');
  if (idx === -1) return '';
  return name.slice(idx + 1).toLowerCase();
};

const guessAudioContentType = (file: File) => {
  if (file.type) return file.type;
  const ext = getExt(file.name);
  if (ext === 'mp3') return 'audio/mpeg';
  if (ext === 'm4a' || ext === 'mp4') return 'audio/mp4';
  if (ext === 'wav') return 'audio/wav';
  if (ext === 'flac') return 'audio/flac';
  if (ext === 'amr') return 'audio/amr';
  if (ext === '3gp' || ext === '3gpp') return 'audio/3gpp';
  return undefined;
};

export const createSongsApi = () => ({
  async fetchSongs(): Promise<SongRow[]> {
    const client = ensureSupabase();
    const { data, error } = await client
      .from('songs')
      .select('*')
      .order('pinned_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as SongRow[];
  },

  async updateSong(songId: string, updates: Partial<SongRow>) {
    const client = ensureSupabase();
    const { error } = await client.from('songs').update(updates).eq('id', songId);
    if (error) throw error;
  },

  async uploadAndCreateSong(input: {
    userId: string;
    title: string;
    artist: string;
    album?: string;
    genre?: string;
    story?: string;
    fileSize?: number;
    duration: number;
    trimStart: number;
    trimEnd: number;
    audioFile: File;
    streamAudioFile?: File;
    streamBitrateKbps?: number;
    coverFile?: File;
    visibility?: SongVisibility;
    onUploadProgress?: (progress: SongUploadProgress) => void;
  }): Promise<SongRow> {
    const client = ensureSupabase();
    const songId = createRuntimeUuid();
    const audioContentType = guessAudioContentType(input.audioFile) ?? 'audio/mp4';
    const audioExt = getExt(input.audioFile.name) || getAudioExtFromMime(audioContentType) || 'm4a';
    const audioPath = `${input.userId}/${songId}/audio.${audioExt}`;
    let streamAudioPath = input.streamAudioFile ? `${input.userId}/${songId}/stream.mp3` : null;

    let coverPath: string | null = null;

    try {
      if (!cosClient.isEnabled) throw new Error('COS 未配置');

      input.onUploadProgress?.({ phase: 'audio', percent: 0, message: '正在上传音频' });
      await cosClient.uploadFile(input.audioFile, audioPath, audioContentType, (progress) => {
        const audioEnd = streamAudioPath ? 55 : 85;
        input.onUploadProgress?.({
          phase: 'audio',
          percent: Math.min(audioEnd, Math.round(progress.percent * audioEnd / 100)),
          message: `正在上传音频 ${progress.percent}%`,
        });
      });

      if (input.streamAudioFile && streamAudioPath) {
        input.onUploadProgress?.({ phase: 'stream', percent: 55, message: '正在上传节流播放副本' });
        const pendingStreamPath = streamAudioPath;
        try {
          await cosClient.uploadFile(input.streamAudioFile, pendingStreamPath, 'audio/mpeg', (progress) => {
            input.onUploadProgress?.({
              phase: 'stream',
              percent: 55 + Math.round(progress.percent * 0.3),
              message: `正在上传节流播放副本 ${progress.percent}%`,
            });
          });
        } catch (error) {
          console.warn('节流播放副本上传失败，继续使用原文件:', error);
          await cosClient.deleteFiles([pendingStreamPath]).catch(() => {});
          streamAudioPath = null;
          input.onUploadProgress?.({ phase: 'stream', percent: 85, message: '播放副本失败，已回退原文件' });
        }
      }

      if (input.coverFile) {
        input.onUploadProgress?.({ phase: 'cover', percent: 86, message: '正在处理封面' });
        const compressed = await downscaleImageBlob(input.coverFile, { maxWidth: 1024, maxHeight: 1024, mimeType: 'image/jpeg', quality: 0.86 });
        coverPath = await createSharedCoverPath(compressed);
        await cosClient.uploadFileIfAbsent(compressed, coverPath, 'image/jpeg', (progress) => {
          input.onUploadProgress?.({
            phase: 'cover',
            percent: 86 + Math.round(progress.percent * 0.09),
            message: `正在上传封面 ${progress.percent}%`,
          });
        });
      }

      input.onUploadProgress?.({ phase: 'database', percent: 96, message: '正在写入资料库' });
      const visibility = input.visibility ?? 'private';
      const insertBase = {
        id: songId,
        owner_id: input.userId,
        visibility,
        is_public: visibility === 'public',
        title: input.title,
        artist: input.artist,
        album: input.album ?? null,
        genre: input.genre ?? null,
        duration: input.duration,
        trim_start: input.trimStart,
        trim_end: input.trimEnd,
        audio_path: audioPath,
        cover_path: coverPath,
      };

      const insertWithExtras = {
        ...insertBase,
        story: input.story ?? null,
        file_size: input.fileSize ?? null,
        stream_audio_path: streamAudioPath,
        stream_file_size: streamAudioPath ? input.streamAudioFile?.size ?? null : null,
        stream_bitrate_kbps: streamAudioPath ? input.streamBitrateKbps ?? null : null,
      };

      const tryInsert = async (payload: any) => {
        return client.from('songs').insert(payload).select('*').single();
      };

      let { data, error } = await tryInsert(insertWithExtras);
      const message = typeof (error as any)?.message === 'string' ? (error as any).message : '';
      if (error && (message.includes('story') || message.includes('file_size') || message.includes('is_public') || message.includes('stream_audio_path') || message.includes('stream_file_size') || message.includes('stream_bitrate_kbps'))) {
        ({ data, error } = await tryInsert(insertBase));
        if (!error && streamAudioPath) {
          await cosClient.deleteFiles([streamAudioPath]).catch(() => {});
        }
      }

      if (error) throw error;
      input.onUploadProgress?.({ phase: 'database', percent: 100, message: '上传完成' });
      return data as SongRow;
    } catch (error) {
      await cosClient.deleteFiles([audioPath, ...(streamAudioPath ? [streamAudioPath] : [])]).catch(() => {});
      // 内容寻址封面可能已被其他歌曲或合集复用，失败回滚时也不能删除。
      if (coverPath && !isSharedCoverPath(coverPath)) await cosClient.deleteFiles([coverPath]).catch(() => {});
      throw error;
    }
  },

  async incrementSongPlay(songId: string) {
    const client = ensureSupabase();
    const { error } = await client.rpc('increment_song_play', { p_song_id: songId });
    if (error) throw error;
  },

  async incrementUserSongPlay(songId: string) {
    const client = ensureSupabase();
    const { error } = await client.rpc('increment_user_song_play', { p_song_id: songId });
    if (error) throw error;
  },

  async fetchMySongPlayCount(songId: string, userId: string): Promise<number> {
    return cached(`mySongPlay:${userId}:${songId}`, TTL_MY_SONG_PLAY_MS, async () => {
      const client = ensureSupabase();
      const { data, error } = await client
        .from('user_song_plays')
        .select('plays_count')
        .eq('song_id', songId)
        .maybeSingle();
      if (error) throw error;
      const count = (data as any)?.plays_count;
      return typeof count === 'number' ? count : 0;
    });
  },

  async deleteSong(songId: string, userId: string) {
    const client = ensureSupabase();

    let { data: song, error: fetchError } = await client
      .from('songs')
      .select('audio_path, stream_audio_path, cover_path, owner_id')
      .eq('id', songId)
      .single();

    if (fetchError && String(fetchError.message ?? '').includes('stream_audio_path')) {
      ({ data: song, error: fetchError } = await client
        .from('songs')
        .select('audio_path, cover_path, owner_id')
        .eq('id', songId)
        .single() as any);
    }

    if (fetchError) throw fetchError;
    if (song.owner_id !== userId) throw new Error('Permission denied');

    const { error: deleteError } = await client
      .from('songs')
      .delete()
      .eq('id', songId);

    if (deleteError) throw deleteError;

    const filesToDelete = [song.audio_path];
    if ((song as any).stream_audio_path) filesToDelete.push((song as any).stream_audio_path);
    if (song.cover_path && !isSharedCoverPath(song.cover_path)) filesToDelete.push(song.cover_path);

    if (!cosClient.isEnabled) throw new Error('COS 未配置');
    await cosClient.deleteFiles(filesToDelete).catch(() => {});
  },

  async uploadSongCover(_songId: string, _ownerId: string, file: File, _oldCoverPath?: string): Promise<{ path: string; signedUrl: string }> {
    if (!cosClient.isEnabled) throw new Error('COS 未配置');
    const compressed = await downscaleImageBlob(file, { maxWidth: 1024, maxHeight: 1024, mimeType: 'image/jpeg', quality: 0.86 });
    const path = await createSharedCoverPath(compressed);
    await cosClient.uploadFileIfAbsent(compressed, path, 'image/jpeg');

    const signedUrl = await createSignedCoverUrl(path);
    return { path, signedUrl };
  },

  async deleteCoverIfUnreferenced(path?: string | null): Promise<'deleted' | 'retained' | 'skipped'> {
    const normalizedPath = path?.trim();
    if (!normalizedPath || /^https?:\/\//i.test(normalizedPath)) return 'skipped';
    if (!cosClient.isEnabled) throw new Error('COS 未配置');

    const client = ensureSupabase();
    const { data, error } = await client.rpc('get_media_cover_reference_count', { p_path: normalizedPath });
    if (error) throw error;
    const referenceCount = Number(data);
    if (!Number.isFinite(referenceCount)) throw new Error('封面引用计数无效');
    if (referenceCount > 0) return 'retained';

    await cosClient.deleteFiles([normalizedPath]);
    return 'deleted';
  },
});
