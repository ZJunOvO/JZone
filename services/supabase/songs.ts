import { cosClient } from '../../cosClient';
import { downscaleImageBlob } from '../../imageProcessing';
import { getAudioExtFromMime } from '../../utils/uploadAudio';
import { cached, TTL_MY_SONG_PLAY_MS } from './cache';
import { ensureSupabase } from './client';
import type { SongRow, SongVisibility } from './types';

export interface SongUploadProgress {
  phase: 'audio' | 'cover' | 'database';
  percent: number;
  message: string;
}

const getExt = (name: string) => {
  const idx = name.lastIndexOf('.');
  if (idx === -1) return '';
  return name.slice(idx + 1).toLowerCase();
};

const uuidv4 = () => {
  if (globalThis.crypto?.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (globalThis.crypto?.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
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
    coverFile?: File;
    visibility?: SongVisibility;
    onUploadProgress?: (progress: SongUploadProgress) => void;
  }): Promise<SongRow> {
    const client = ensureSupabase();
    const songId = uuidv4();
    const audioContentType = guessAudioContentType(input.audioFile) ?? 'audio/mp4';
    const audioExt = getExt(input.audioFile.name) || getAudioExtFromMime(audioContentType) || 'm4a';
    const audioPath = `${input.userId}/${songId}/audio.${audioExt}`;

    let coverPath: string | null = null;

    try {
      if (!cosClient.isEnabled) throw new Error('COS 未配置');

      input.onUploadProgress?.({ phase: 'audio', percent: 0, message: '正在上传音频' });
      await cosClient.uploadFile(input.audioFile, audioPath, audioContentType, (progress) => {
        input.onUploadProgress?.({
          phase: 'audio',
          percent: Math.min(85, Math.round(progress.percent * 0.85)),
          message: `正在上传音频 ${progress.percent}%`,
        });
      });

      if (input.coverFile) {
        coverPath = `${input.userId}/${songId}/cover.jpg`;
        input.onUploadProgress?.({ phase: 'cover', percent: 86, message: '正在处理封面' });
        const compressed = await downscaleImageBlob(input.coverFile, { maxWidth: 1024, maxHeight: 1024, mimeType: 'image/jpeg', quality: 0.86 });
        await cosClient.uploadFile(compressed, coverPath, 'image/jpeg', (progress) => {
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
      };

      const tryInsert = async (payload: any) => {
        return client.from('songs').insert(payload).select('*').single();
      };

      let { data, error } = await tryInsert(insertWithExtras);
      const message = typeof (error as any)?.message === 'string' ? (error as any).message : '';
      if (error && (message.includes('story') || message.includes('file_size') || message.includes('is_public'))) {
        ({ data, error } = await tryInsert(insertBase));
      }

      if (error) throw error;
      input.onUploadProgress?.({ phase: 'database', percent: 100, message: '上传完成' });
      return data as SongRow;
    } catch (error) {
      await cosClient.deleteFiles([audioPath]).catch(() => {});
      if (coverPath) await cosClient.deleteFiles([coverPath]).catch(() => {});
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

    const { data: song, error: fetchError } = await client
      .from('songs')
      .select('audio_path, cover_path, owner_id')
      .eq('id', songId)
      .single();

    if (fetchError) throw fetchError;
    if (song.owner_id !== userId) throw new Error('Permission denied');

    const { error: deleteError } = await client
      .from('songs')
      .delete()
      .eq('id', songId);

    if (deleteError) throw deleteError;

    const filesToDelete = [song.audio_path];
    if (song.cover_path) filesToDelete.push(song.cover_path);

    if (!cosClient.isEnabled) throw new Error('COS 未配置');
    await cosClient.deleteFiles(filesToDelete).catch(() => {});
  },

  async uploadSongCover(songId: string, ownerId: string, file: File, oldCoverPath?: string): Promise<{ path: string; signedUrl: string }> {
    const path = `${ownerId}/${songId}/cover_${Date.now()}.jpg`;

    if (!cosClient.isEnabled) throw new Error('COS 未配置');
    const compressed = await downscaleImageBlob(file, { maxWidth: 1024, maxHeight: 1024, mimeType: 'image/jpeg', quality: 0.86 });
    await cosClient.uploadFile(compressed, path);

    if (oldCoverPath && oldCoverPath !== path && !/^https?:\/\//i.test(oldCoverPath)) {
      try {
        await cosClient.deleteFiles([oldCoverPath]);
      } catch (error) {
        console.warn('Failed to delete old cover:', error);
      }
    }

    const signedUrl = await cosClient.getSignedUrl(path, 3600);
    return { path, signedUrl };
  },
});
