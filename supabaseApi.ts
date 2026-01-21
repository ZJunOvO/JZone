import { hasSupabaseConfig, supabase } from './supabaseClient';
import { cosClient } from './cosClient';

export type SongVisibility = 'private' | 'public';

export interface SongRow {
  id: string;
  owner_id: string;
  visibility: SongVisibility;
  title: string;
  artist: string;
  album: string | null;
  duration: number;
  trim_start: number;
  trim_end: number;
  audio_path: string;
  cover_path: string | null;
  plays_count?: number | null;
  created_at: string;
}

export interface CommentRow {
  id: string;
  song_id: string;
  user_id: string;
  username: string;
  avatar_url: string;
  text: string;
  playback_time: number;
  created_at: string;
}

const AUDIO_BUCKET = (import.meta.env.VITE_SUPABASE_AUDIO_BUCKET as string | undefined) ?? 'audio';
const COVERS_BUCKET = (import.meta.env.VITE_SUPABASE_COVERS_BUCKET as string | undefined) ?? 'covers';

const ensure = () => {
  if (!hasSupabaseConfig) throw new Error('Supabase 未配置');
  return supabase;
};

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

const guessImageContentType = (file: File) => {
  if (file.type) return file.type;
  const ext = getExt(file.name);
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return undefined;
};

type SignedUrlCacheEntry = { signedUrl: string; expiresAt: number };
const signedUrlCache = new Map<string, SignedUrlCacheEntry>();
const getSignedUrlCached = async (bucket: string, path: string, expiresInSeconds: number) => {
  const key = `${bucket}:${path}`;
  const now = Date.now();
  const cached = signedUrlCache.get(key);
  if (cached && cached.expiresAt - now > 30_000) return cached.signedUrl;

  const client = ensure();
  const { data, error } = await client.storage.from(bucket).createSignedUrl(path, expiresInSeconds);
  if (error) throw error;
  const expiresAt = now + expiresInSeconds * 1000;
  signedUrlCache.set(key, { signedUrl: data.signedUrl, expiresAt });
  return data.signedUrl;
};

export const supabaseApi = {
  isEnabled: () => hasSupabaseConfig,

  async fetchSongs(): Promise<SongRow[]> {
    const client = ensure();
    const { data, error } = await client.from('songs').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as SongRow[];
  },

  async fetchComments(songId: string): Promise<CommentRow[]> {
    const client = ensure();
    const { data, error } = await client
      .from('comments')
      .select('*')
      .eq('song_id', songId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as CommentRow[];
  },

  async insertComment(input: {
    songId: string;
    userId: string;
    username: string;
    avatarUrl: string;
    text: string;
    playbackTime: number;
  }): Promise<CommentRow> {
    const client = ensure();
    const { data, error } = await client
      .from('comments')
      .insert({
        song_id: input.songId,
        user_id: input.userId,
        username: input.username,
        avatar_url: input.avatarUrl,
        text: input.text,
        playback_time: input.playbackTime,
      })
      .select('*')
      .single();
    if (error) throw error;
    return data as CommentRow;
  },

  async createSignedAudioUrl(path: string, expiresInSeconds = 3600) {
    if (cosClient.isEnabled) {
      return cosClient.getSignedUrl(path, expiresInSeconds);
    }
    return getSignedUrlCached(AUDIO_BUCKET, path, expiresInSeconds);
  },

  async createSignedCoverUrl(path: string, expiresInSeconds = 3600) {
    if (cosClient.isEnabled) {
      return cosClient.getSignedUrl(path, expiresInSeconds);
    }
    return getSignedUrlCached(COVERS_BUCKET, path, expiresInSeconds);
  },

  async uploadAndCreateSong(input: {
    userId: string;
    title: string;
    artist: string;
    album?: string;
    duration: number;
    trimStart: number;
    trimEnd: number;
    audioFile: File;
    coverFile?: File;
    visibility?: SongVisibility;
  }): Promise<SongRow> {
    const client = ensure();
    const songId = uuidv4();
    const audioExt = getExt(input.audioFile.name) || 'bin';
    const audioPath = `${input.userId}/${songId}/audio.${audioExt}`;

    if (cosClient.isEnabled) {
      await cosClient.uploadFile(input.audioFile, audioPath);
    } else {
      const { error: audioUploadError } = await client.storage
        .from(AUDIO_BUCKET)
        .upload(audioPath, input.audioFile, { upsert: false, contentType: guessAudioContentType(input.audioFile) });
      if (audioUploadError) throw audioUploadError;
    }

    let coverPath: string | null = null;
    if (input.coverFile) {
      const coverExt = getExt(input.coverFile.name) || 'bin';
      coverPath = `${input.userId}/${songId}/cover.${coverExt}`;
      
      if (cosClient.isEnabled) {
        await cosClient.uploadFile(input.coverFile, coverPath);
      } else {
        const { error: coverUploadError } = await client.storage
          .from(COVERS_BUCKET)
          .upload(coverPath, input.coverFile, { upsert: false, contentType: guessImageContentType(input.coverFile) });
        if (coverUploadError) throw coverUploadError;
      }
    }

    try {
      const { data, error } = await client
        .from('songs')
        .insert({
          id: songId,
          owner_id: input.userId,
          visibility: input.visibility ?? 'private',
          title: input.title,
          artist: input.artist,
          album: input.album ?? null,
          duration: input.duration,
          trim_start: input.trimStart,
          trim_end: input.trimEnd,
          audio_path: audioPath,
          cover_path: coverPath,
        })
        .select('*')
        .single();

      if (error) throw error;
      return data as SongRow;
    } catch (e) {
      if (cosClient.isEnabled) {
        await cosClient.deleteFiles([audioPath]).catch(() => {});
        if (coverPath) {
          await cosClient.deleteFiles([coverPath]).catch(() => {});
        }
      } else {
        await client.storage.from(AUDIO_BUCKET).remove([audioPath]).catch(() => {});
        if (coverPath) {
          await client.storage.from(COVERS_BUCKET).remove([coverPath]).catch(() => {});
        }
      }
      throw e;
    }
  },

  async incrementSongPlay(songId: string) {
    const client = ensure();
    const { error } = await client.rpc('increment_song_play', { p_song_id: songId });
    if (error) throw error;
  },

  async deleteSong(songId: string, userId: string) {
    const client = ensure();
    
    // 1. 获取歌曲信息以拿到文件路径
    const { data: song, error: fetchError } = await client
      .from('songs')
      .select('audio_path, cover_path, owner_id')
      .eq('id', songId)
      .single();
      
    if (fetchError) throw fetchError;
    if (song.owner_id !== userId) throw new Error('Permission denied');

    // 2. 从数据库删除记录
    const { error: deleteError } = await client
      .from('songs')
      .delete()
      .eq('id', songId);
      
    if (deleteError) throw deleteError;

    // 3. 删除物理文件
    const filesToDelete = [song.audio_path];
    if (song.cover_path) filesToDelete.push(song.cover_path);

    if (cosClient.isEnabled) {
      // 腾讯云 COS 删除
      await cosClient.deleteFiles(filesToDelete).catch(err => console.error('COS delete failed:', err));
    } else {
      // Supabase Storage 删除 (Fallback)
      if (song.audio_path) {
          await client.storage.from(AUDIO_BUCKET).remove([song.audio_path]).catch(() => {});
      }
      if (song.cover_path) {
          await client.storage.from(COVERS_BUCKET).remove([song.cover_path]).catch(() => {});
      }
    }
  },
};

