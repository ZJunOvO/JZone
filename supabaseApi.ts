import { hasSupabaseConfig, supabase } from './supabaseClient';
import { cosClient } from './cosClient';
import { downscaleImageBlob } from './imageProcessing';

export type SongVisibility = 'private' | 'public';
export type CollectionType = 'album' | 'playlist';
export type CollectionVisibility = 'private' | 'public';

export interface SongRow {
  id: string;
  owner_id: string;
  visibility: SongVisibility;
  title: string;
  artist: string;
  album: string | null;
  genre: string | null;
  story: string | null;
  file_size: number | null;
  duration: number;
  trim_start: number;
  trim_end: number;
  audio_path: string;
  cover_path: string | null;
  plays_count?: number | null;
  is_public?: boolean;
  pinned_at?: string | null;
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

export interface FavoriteRow {
  user_id: string;
  song_id: string;
  created_at: string;
}

export interface UserSongPlayRow {
  user_id: string;
  song_id: string;
  plays_count: number;
  updated_at: string;
}

export interface ProfileRow {
  id: string;
  nickname: string | null;
  avatar_url: string | null;
  cover_url: string | null;
  signature: string | null;
  background_style: 'half' | 'full' | null;
  background_opacity?: number | null;
  background_blur?: number | null;
  status_text?: string | null;
  status_emoji?: string | null;
  title_text?: string | null;
  title_style?: string | null;
  avatar_frame_id?: string | null;
  followers_count: number;
  following_count: number;
}

export interface CollectionRow {
  id: string;
  title: string;
  cover_url: string | null;
  description: string | null;
  created_at: string;
  creator_id: string;
  type: CollectionType;
  visibility: CollectionVisibility;
  release_year: number | null;
  genre: string | null;
  play_count: number;
  pinned_at?: string | null;
}

export interface AlbumSongRow {
  album_id: string;
  song_id: string;
  added_at: string;
  sort_order: number;
}

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

const guessImageContentType = (file: Blob, name?: string) => {
  const anyFile = file as any;
  if (typeof anyFile?.type === 'string' && anyFile.type) return anyFile.type;
  const ext = getExt(name ?? (anyFile?.name as string) ?? '');
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg';
  if (ext === 'png') return 'image/png';
  if (ext === 'webp') return 'image/webp';
  return undefined;
};

const extractSupabasePublicObject = (url: string) => {
  const match = url.match(/\/storage\/v1\/object\/public\/([^/]+)\/(.+)$/i);
  if (!match) return null;
  return { bucket: match[1].toLowerCase(), path: match[2] };
};

const extractCosObjectKey = (url: string) => {
  try {
    const u = new URL(url);
    if (!/myqcloud\.com$/i.test(u.hostname)) return null;
    const key = decodeURIComponent(u.pathname.replace(/^\/+/, ''));
    return key ? key : null;
  } catch {
    return null;
  }
};

type CosSignedUrlCacheEntry = { signedUrl: string; expiresAt: number };
const cosSignedUrlCache = new Map<string, CosSignedUrlCacheEntry>();
const getCosSignedUrlCached = async (key: string, expiresInSeconds: number) => {
  const cacheKey = `${expiresInSeconds}:${key}`;
  const now = Date.now();
  const cached = cosSignedUrlCache.get(cacheKey);
  if (cached && cached.expiresAt - now > 30_000) return cached.signedUrl;
  if (!cosClient.isEnabled) throw new Error('COS 未配置');
  const signedUrl = await cosClient.getSignedUrl(key, expiresInSeconds);
  cosSignedUrlCache.set(cacheKey, { signedUrl, expiresAt: now + expiresInSeconds * 1000 });
  return signedUrl;
};

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
const cached = async <T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> => {
  const hit = getApiCache<T>(key);
  if (hit !== undefined) return hit;
  const inflight = apiInFlight.get(key) as Promise<T> | undefined;
  if (inflight) return inflight;
  const p = fn()
    .then((value) => {
      setApiCache(key, value, ttlMs);
      apiInFlight.delete(key);
      return value;
    })
    .catch((e) => {
      apiInFlight.delete(key);
      throw e;
    });
  apiInFlight.set(key, p);
  return p;
};
const invalidateApiCache = (match: (key: string) => boolean) => {
  for (const key of apiCache.keys()) {
    if (match(key)) apiCache.delete(key);
  }
  for (const key of apiInFlight.keys()) {
    if (match(key)) apiInFlight.delete(key);
  }
};
const emitCollectionsChanged = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event('jzone:collections-changed'));
};

const TTL_PROFILE_MS = 5 * 60_000;
const TTL_COLLECTION_DETAIL_MS = 60_000;
const TTL_COLLECTION_LIST_MS = 2 * 60_000;
const TTL_MY_SONG_PLAY_MS = 60_000;

export const supabaseApi = {
  isEnabled: () => hasSupabaseConfig,

  async searchMyCollections(query: string, limit = 12, creatorId?: string): Promise<CollectionRow[]> {
    const client = ensure();
    const q = query.trim();
    if (!q) return [];
    const { data: authData } = await client.auth.getUser();
    const uid = creatorId ?? authData.user?.id;
    if (!uid) return [];
    const { data, error } = await client
      .from('albums')
      .select('*')
      .eq('creator_id', uid)
      .ilike('title', `%${q}%`)
      .order('created_at', { ascending: false })
      .limit(limit);
    if (error) throw error;
    return (data ?? []) as CollectionRow[];
  },

  async fetchMyCollections(type?: CollectionType, limit = 50): Promise<CollectionRow[]> {
    const client = ensure();
    const { data: authData } = await client.auth.getUser();
    const uid = authData.user?.id;
    if (!uid) return [];

    return cached(`myCollections:${uid}:${type ?? 'all'}:${limit}`, TTL_COLLECTION_LIST_MS, async () => {
      let q = client
        .from('albums')
        .select('*, album_songs(song:songs(cover_path), added_at)')
        .eq('creator_id', uid)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (type) q = q.eq('type', type);
      const { data, error } = await q;
      if (error) throw error;

      return await Promise.all((data ?? []).map(async (row: any) => {
        let coverPath = row.cover_url;
        if (!coverPath && row.album_songs && row.album_songs.length > 0) {
          const sorted = [...row.album_songs].sort((a, b) => new Date(b.added_at).getTime() - new Date(a.added_at).getTime());
          const match = sorted.find((s: any) => s.song?.cover_path);
          if (match) {
            coverPath = match.song.cover_path;
          }
        }

        let finalCoverUrl = null;
        if (coverPath) {
          try {
            finalCoverUrl = await supabaseApi.createSignedCoverUrl(coverPath);
          } catch {}
        }

        const { album_songs, ...rest } = row;
        return { ...rest, cover_url: finalCoverUrl };
      }));
    });
  },

  async fetchVisibleCollections(type?: CollectionType, limit = 80): Promise<CollectionRow[]> {
    return cached(`visibleCollections:${type ?? 'all'}:${limit}`, TTL_COLLECTION_LIST_MS, async () => {
      const client = ensure();
      let q = client
        .from('albums')
        .select('*, album_songs(song:songs(cover_path), added_at)')
        .order('created_at', { ascending: false })
        .limit(limit);
      if (type) q = q.eq('type', type);
      const { data, error } = await q;
      if (error) throw error;

      return await Promise.all((data ?? []).map(async (row: any) => {
        let coverPath = row.cover_url;
        if (!coverPath && row.album_songs && row.album_songs.length > 0) {
          const sorted = [...row.album_songs].sort((a, b) => new Date(b.added_at).getTime() - new Date(a.added_at).getTime());
          const match = sorted.find((s: any) => s.song?.cover_path);
          if (match) coverPath = match.song.cover_path;
        }

        let finalCoverUrl = null;
        if (coverPath) {
          try {
            finalCoverUrl = await supabaseApi.createSignedCoverUrl(coverPath);
          } catch {}
        }

        const { album_songs, ...rest } = row;
        return { ...rest, cover_url: finalCoverUrl };
      }));
    });
  },

  async fetchCollectionsByCreator(creatorId: string, type?: CollectionType, limit = 50, viewerId?: string): Promise<CollectionRow[]> {
    const scope = viewerId && viewerId === creatorId ? 'self' : 'public';
    return cached(`collectionsByCreator:${creatorId}:${scope}:${type ?? 'all'}:${limit}`, TTL_COLLECTION_LIST_MS, async () => {
      const client = ensure();
      let q = client
        .from('albums')
        .select('*, album_songs(song:songs(cover_path), added_at)')
        .eq('creator_id', creatorId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (scope !== 'self') q = q.eq('visibility', 'public');
      if (type) q = q.eq('type', type);
      const { data, error } = await q;
      if (error) throw error;

      return await Promise.all((data ?? []).map(async (row: any) => {
        let coverPath = row.cover_url;
        if (!coverPath && row.album_songs && row.album_songs.length > 0) {
          const sorted = [...row.album_songs].sort((a, b) => new Date(b.added_at).getTime() - new Date(a.added_at).getTime());
          const match = sorted.find((s: any) => s.song?.cover_path);
          if (match) {
            coverPath = match.song.cover_path;
          }
        }

        let finalCoverUrl = null;
        if (coverPath) {
          try {
            finalCoverUrl = await supabaseApi.createSignedCoverUrl(coverPath);
          } catch {}
        }

        const { album_songs, ...rest } = row;
        return { ...rest, cover_url: finalCoverUrl };
      }));
    });
  },

  async createCollection(input: {
    type: CollectionType;
    title: string;
    coverUrl?: string | null;
    description?: string | null;
    releaseYear?: number | null;
    genre?: string | null;
    visibility?: CollectionVisibility;
  }): Promise<string> {
    const client = ensure();
    const visibility = input.visibility ?? 'public';
    const { data, error } = await client.rpc('create_collection', {
      p_type: input.type,
      p_title: input.title,
      p_cover_url: input.coverUrl ?? null,
      p_description: input.description ?? null,
      p_release_year: input.releaseYear ?? null,
      p_genre: input.genre ?? null,
      p_visibility: visibility,
    });
    if (error) throw error;
    invalidateApiCache((k) => k.startsWith('myCollections:') || k.startsWith('collectionsByCreator:') || k.startsWith('visibleCollections:'));
    emitCollectionsChanged();
    return data as string;
  },

  async addSongsToCollection(collectionId: string, songIds: string[]) {
    const client = ensure();
    const { error } = await client.rpc('add_songs_to_collection', {
      p_album_id: collectionId,
      p_song_ids: songIds,
    });
    if (error) throw error;
    invalidateApiCache((k) => k === `collection:${collectionId}` || k.startsWith('myCollections:') || k.startsWith('collectionsByCreator:') || k.startsWith('visibleCollections:'));
    emitCollectionsChanged();
  },

  async setCollectionVisibility(collectionId: string, visibility: CollectionVisibility) {
    const client = ensure();
    const { error } = await client.rpc('set_collection_visibility', {
      p_album_id: collectionId,
      p_visibility: visibility,
    });
    if (error) throw error;
    invalidateApiCache((k) => k === `collection:${collectionId}` || k.startsWith('myCollections:') || k.startsWith('collectionsByCreator:') || k.startsWith('visibleCollections:'));
    emitCollectionsChanged();
  },

  async incrementCollectionPlayCount(collectionId: string) {
    const client = ensure();
    const { error } = await client.rpc('increment_collection_play_count', { p_album_id: collectionId });
    if (error) throw error;
  },

  async fetchCollection(collectionId: string): Promise<{ collection: CollectionRow; songs: SongRow[]; relations: AlbumSongRow[]; creatorProfile: ProfileRow | null }> {
    return cached(`collection:${collectionId}`, TTL_COLLECTION_DETAIL_MS, async () => {
      const client = ensure();
      const { data: collection, error: collectionError } = await client.from('albums').select('*').eq('id', collectionId).single();
      if (collectionError) throw collectionError;

      const { data: rels, error: relError } = await client
        .from('album_songs')
        .select('album_id, song_id, added_at, sort_order')
        .eq('album_id', collectionId)
        .order('sort_order', { ascending: true });
      if (relError) throw relError;

      const songIds = (rels ?? []).map((r: any) => r.song_id).filter(Boolean);
      let songs: SongRow[] = [];
      if (songIds.length) {
        const { data: songRows, error: songsError } = await client.from('songs').select('*').in('id', songIds);
        if (songsError) throw songsError;
        const byId = new Map<string, SongRow>((songRows ?? []).map((s: any) => [s.id, s]));
        songs = songIds.map((id) => byId.get(id)).filter(Boolean) as SongRow[];
      }

      const creatorId = (collection as any).creator_id as string | undefined;
      let creatorProfile: ProfileRow | null = null;
      if (creatorId) {
        try {
          creatorProfile = await supabaseApi.fetchProfile(creatorId);
        } catch {
          creatorProfile = null;
        }
      }

      return {
        collection: collection as any as CollectionRow,
        songs,
        relations: (rels ?? []) as AlbumSongRow[],
        creatorProfile,
      };
    });
  },

  async fetchSongs(): Promise<SongRow[]> {
    const client = ensure();
    const { data, error } = await client
      .from('songs')
      .select('*')
      .order('pinned_at', { ascending: false, nullsFirst: false })
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as SongRow[];
  },

  async updateSong(songId: string, updates: Partial<SongRow>) {
    const client = ensure();
    const { error } = await client.from('songs').update(updates).eq('id', songId);
    if (error) throw error;
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

  async fetchFavorites(userId: string): Promise<FavoriteRow[]> {
    const client = ensure();
    const { data, error } = await client
      .from('favorites')
      .select('user_id, song_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return (data ?? []) as FavoriteRow[];
  },

  async addFavorite(userId: string, songId: string): Promise<FavoriteRow> {
    const client = ensure();
    const { data, error } = await client
      .from('favorites')
      .insert({ user_id: userId, song_id: songId })
      .select('user_id, song_id, created_at')
      .single();
    if (error) throw error;
    return data as FavoriteRow;
  },

  async removeFavorite(userId: string, songId: string) {
    const client = ensure();
    const { error } = await client
      .from('favorites')
      .delete()
      .eq('user_id', userId)
      .eq('song_id', songId);
    if (error) throw error;
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

  async createSignedAudioUrl(path: string, expiresInSeconds = 6 * 60 * 60) {
    if (/^https?:\/\//i.test(path)) {
      const extracted = extractSupabasePublicObject(path);
      if (extracted && extracted.bucket === 'audio') path = extracted.path;
      else {
        const key = extractCosObjectKey(path);
        if (!key) return path;
        path = key;
      }
    }
    return getCosSignedUrlCached(path, expiresInSeconds);
  },

  async createSignedCoverUrl(path: string, expiresInSeconds = 24 * 60 * 60) {
    if (/^https?:\/\//i.test(path)) {
      const extracted = extractSupabasePublicObject(path);
      if (extracted && extracted.bucket === 'covers') path = extracted.path;
      else {
        const key = extractCosObjectKey(path);
        if (!key) return path;
        path = key;
      }
    }
    return getCosSignedUrlCached(path, expiresInSeconds);
  },

  async createSignedAvatarUrl(path: string, expiresInSeconds = 24 * 60 * 60) {
    if (/^https?:\/\//i.test(path)) {
      const extracted = extractSupabasePublicObject(path);
      if (extracted && extracted.bucket === 'avatars') path = extracted.path;
      else {
        const key = extractCosObjectKey(path);
        if (!key) return path;
        path = key;
      }
    }
    return getCosSignedUrlCached(path, expiresInSeconds);
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
  }): Promise<SongRow> {
    const client = ensure();
    const songId = uuidv4();
    const audioExt = getExt(input.audioFile.name) || 'bin';
    const audioPath = `${input.userId}/${songId}/audio.${audioExt}`;

    if (!cosClient.isEnabled) throw new Error('COS 未配置');
    await cosClient.uploadFile(input.audioFile, audioPath, guessAudioContentType(input.audioFile) ?? 'application/octet-stream');

    let coverPath: string | null = null;
    if (input.coverFile) {
      coverPath = `${input.userId}/${songId}/cover.jpg`;
      const compressed = await downscaleImageBlob(input.coverFile, { maxWidth: 1024, maxHeight: 1024, mimeType: 'image/jpeg', quality: 0.86 });
      await cosClient.uploadFile(compressed, coverPath, 'image/jpeg');
    }

    try {
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
      return data as SongRow;
    } catch (e) {
      await cosClient.deleteFiles([audioPath]).catch(() => {});
      if (coverPath) await cosClient.deleteFiles([coverPath]).catch(() => {});
      throw e;
    }
  },

  async incrementSongPlay(songId: string) {
    const client = ensure();
    const { error } = await client.rpc('increment_song_play', { p_song_id: songId });
    if (error) throw error;
  },

  async incrementUserSongPlay(songId: string) {
    const client = ensure();
    const { error } = await client.rpc('increment_user_song_play', { p_song_id: songId });
    if (error) throw error;
  },

  async fetchMySongPlayCount(songId: string, userId: string): Promise<number> {
    return cached(`mySongPlay:${userId}:${songId}`, TTL_MY_SONG_PLAY_MS, async () => {
      const client = ensure();
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

    if (!cosClient.isEnabled) throw new Error('COS 未配置');
    await cosClient.deleteFiles(filesToDelete).catch(() => {});
  },

  async fetchProfile(userId: string): Promise<ProfileRow | null> {
    return cached(`profile:${userId}`, TTL_PROFILE_MS, async () => {
      const client = ensure();
      const { data, error } = await client.from('profiles').select('*').eq('id', userId).single();
      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      return data as ProfileRow;
    });
  },

  async uploadProfileImage(userId: string, file: Blob, bucket: 'avatars' | 'covers', originalName?: string): Promise<string> {
    const anyFile = file as any;
    const ext = getExt(originalName ?? (anyFile?.name as string) ?? '') || 'jpg';
    const fileName = `${userId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;

    if (!cosClient.isEnabled) throw new Error('COS 未配置');
    await cosClient.uploadFile(file, fileName);
    return fileName;
  },

  async uploadSongCover(songId: string, ownerId: string, file: File, oldCoverPath?: string): Promise<{ path: string, signedUrl: string }> {
      const path = `${ownerId}/${songId}/cover_${Date.now()}.jpg`;

      if (!cosClient.isEnabled) throw new Error('COS 未配置');
      const compressed = await downscaleImageBlob(file, { maxWidth: 1024, maxHeight: 1024, mimeType: 'image/jpeg', quality: 0.86 });
      await cosClient.uploadFile(compressed, path);

      if (oldCoverPath && oldCoverPath !== path && !/^https?:\/\//i.test(oldCoverPath)) {
          try {
              await cosClient.deleteFiles([oldCoverPath]);
          } catch (e) {
              console.warn('Failed to delete old cover:', e);
          }
      }

      const signedUrl = await cosClient.getSignedUrl(path, 3600);
      
      return { path, signedUrl };
  },

  async uploadCollectionCover(creatorId: string, file: File): Promise<string> {
    const ext = getExt(file.name) || 'jpg';
    const path = `${creatorId}/collections/cover_${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
    
    if (!cosClient.isEnabled) throw new Error('COS 未配置');
    const compressed = await downscaleImageBlob(file, { maxWidth: 1024, maxHeight: 1024, mimeType: 'image/jpeg', quality: 0.86 });
    await cosClient.uploadFile(compressed, path);
    return path;
  },

  async updateCollection(collectionId: string, updates: {
    title?: string;
    description?: string;
    coverUrl?: string | null;
    visibility?: CollectionVisibility;
    releaseYear?: number | null;
    genre?: string | null;
    pinnedAt?: string | null;
  }) {
    const client = ensure();
    const payload: any = {};
    if (updates.title !== undefined) payload.title = updates.title;
    if (updates.description !== undefined) payload.description = updates.description;
    if (updates.coverUrl !== undefined) payload.cover_url = updates.coverUrl;
    if (updates.visibility !== undefined) payload.visibility = updates.visibility;
    if (updates.releaseYear !== undefined) payload.release_year = updates.releaseYear;
    if (updates.genre !== undefined) payload.genre = updates.genre;
    if (updates.pinnedAt !== undefined) payload.pinned_at = updates.pinnedAt;

    if (Object.keys(payload).length === 0) return;

    const { error } = await client.from('albums').update(payload).eq('id', collectionId);
    if (error) throw error;
    invalidateApiCache((k) => k === `collection:${collectionId}` || k.startsWith('myCollections:') || k.startsWith('collectionsByCreator:') || k.startsWith('visibleCollections:'));
    emitCollectionsChanged();
  },

  async deleteCollection(collectionId: string) {
    const client = ensure();
    const { data: collection } = await client.from('albums').select('cover_url').eq('id', collectionId).single();
    if (collection?.cover_url && !/^https?:\/\//i.test(collection.cover_url)) {
        if (cosClient.isEnabled) {
             await cosClient.deleteFiles([collection.cover_url]).catch(() => {});
        }
    }

    const { error } = await client.from('albums').delete().eq('id', collectionId);
    if (error) throw error;
    
    invalidateApiCache((k) => k === `collection:${collectionId}` || k.startsWith('myCollections:') || k.startsWith('collectionsByCreator:') || k.startsWith('visibleCollections:'));
    emitCollectionsChanged();
  },

  async updateProfile(userId: string, data: Partial<ProfileRow>) {
    const client = ensure();
    const { error } = await client.from('profiles').upsert({ id: userId, ...data });
    if (error) throw error;
    invalidateApiCache((k) => k === `profile:${userId}`);
  },

  clearCache() {
    invalidateApiCache(() => true);
    cosSignedUrlCache.clear();
  },
};

