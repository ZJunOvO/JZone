import { cosClient } from '../../cosClient';
import { downscaleImageBlob } from '../../imageProcessing';
import {
  cached,
  emitCollectionsChanged,
  invalidateApiCache,
  TTL_COLLECTION_DETAIL_MS,
  TTL_COLLECTION_LIST_MS,
} from './cache';
import { ensureSupabase } from './client';
import { createSignedCoverUrl } from './storageApi';
import type {
  AlbumSongRow,
  CollectionRow,
  CollectionType,
  CollectionVisibility,
  ProfileRow,
  SongRow,
} from './types';

const getExt = (name: string) => {
  const idx = name.lastIndexOf('.');
  if (idx === -1) return '';
  return name.slice(idx + 1).toLowerCase();
};

const invalidateCollectionCaches = (collectionId?: string) => {
  invalidateApiCache((key) => {
    if (collectionId && key === `collection:${collectionId}`) return true;
    return key.startsWith('myCollections:') || key.startsWith('collectionsByCreator:') || key.startsWith('visibleCollections:');
  });
};

const resolveCollectionRowCover = async (row: any): Promise<CollectionRow> => {
  let coverPath = row.cover_url;
  if (!coverPath && row.album_songs && row.album_songs.length > 0) {
    const sorted = [...row.album_songs].sort((a, b) => new Date(b.added_at).getTime() - new Date(a.added_at).getTime());
    const match = sorted.find((item: any) => item.song?.cover_path);
    if (match) coverPath = match.song.cover_path;
  }

  let finalCoverUrl = null;
  if (coverPath) {
    try {
      finalCoverUrl = await createSignedCoverUrl(coverPath);
    } catch {}
  }

  const { album_songs, ...rest } = row;
  return { ...rest, cover_url: finalCoverUrl } as CollectionRow;
};

const fetchProfileById = async (userId: string): Promise<ProfileRow | null> => {
  const client = ensureSupabase();
  const { data, error } = await client.from('profiles').select('*').eq('id', userId).single();
  if (error) return null;
  return data as ProfileRow;
};

export const createCollectionsApi = () => {
  const api = {
    async searchMyCollections(query: string, limit = 12, creatorId?: string): Promise<CollectionRow[]> {
      const client = ensureSupabase();
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
      const client = ensureSupabase();
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

        return Promise.all((data ?? []).map(resolveCollectionRowCover));
      });
    },

    async fetchVisibleCollections(type?: CollectionType, limit = 80): Promise<CollectionRow[]> {
      return cached(`visibleCollections:${type ?? 'all'}:${limit}`, TTL_COLLECTION_LIST_MS, async () => {
        const client = ensureSupabase();
        let q = client
          .from('albums')
          .select('*, album_songs(song:songs(cover_path), added_at)')
          .order('created_at', { ascending: false })
          .limit(limit);
        if (type) q = q.eq('type', type);
        const { data, error } = await q;
        if (error) throw error;

        return Promise.all((data ?? []).map(resolveCollectionRowCover));
      });
    },

    async fetchCollectionsByCreator(creatorId: string, type?: CollectionType, limit = 50, viewerId?: string): Promise<CollectionRow[]> {
      const scope = viewerId && viewerId === creatorId ? 'self' : 'public';
      return cached(`collectionsByCreator:${creatorId}:${scope}:${type ?? 'all'}:${limit}`, TTL_COLLECTION_LIST_MS, async () => {
        const client = ensureSupabase();
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

        return Promise.all((data ?? []).map(resolveCollectionRowCover));
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
      const client = ensureSupabase();
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
      invalidateCollectionCaches();
      emitCollectionsChanged();
      return data as string;
    },

    async addSongsToCollection(collectionId: string, songIds: string[]) {
      const client = ensureSupabase();
      const { error } = await client.rpc('add_songs_to_collection', {
        p_album_id: collectionId,
        p_song_ids: songIds,
      });
      if (error) throw error;
      invalidateCollectionCaches(collectionId);
      emitCollectionsChanged();
    },

    async removeSongsFromCollection(collectionId: string, songIds: string[]) {
      const client = ensureSupabase();
      const { error } = await client.rpc('remove_songs_from_collection', {
        p_album_id: collectionId,
        p_song_ids: songIds,
      });
      if (error) throw error;
      invalidateCollectionCaches(collectionId);
      emitCollectionsChanged();
    },

    async reorderCollectionSongs(collectionId: string, songIds: string[]) {
      const client = ensureSupabase();
      const { error } = await client.rpc('reorder_collection_songs', {
        p_album_id: collectionId,
        p_song_ids: songIds,
      });
      if (error) throw error;
      invalidateCollectionCaches(collectionId);
      emitCollectionsChanged();
    },

    async findMyCollectionByTitle(title: string, type: CollectionType): Promise<CollectionRow | null> {
      const client = ensureSupabase();
      const normalizedTitle = title.trim();
      if (!normalizedTitle) return null;
      const { data: authData } = await client.auth.getUser();
      const uid = authData.user?.id;
      if (!uid) return null;

      const { data, error } = await client
        .from('albums')
        .select('*')
        .eq('creator_id', uid)
        .eq('type', type)
        .ilike('title', normalizedTitle)
        .limit(10);
      if (error) throw error;

      const rows = (data ?? []) as CollectionRow[];
      return rows.find((row) => row.title.trim().toLowerCase() === normalizedTitle.toLowerCase()) ?? null;
    },

    async ensureMyAlbumByTitle(title: string): Promise<string | null> {
      const normalizedTitle = title.trim();
      if (!normalizedTitle) return null;
      const existing = await api.findMyCollectionByTitle(normalizedTitle, 'album');
      if (existing) return existing.id;
      return api.createCollection({
        type: 'album',
        title: normalizedTitle,
        visibility: 'public',
        coverUrl: null,
        description: null,
        releaseYear: null,
        genre: null,
      });
    },

    async syncSongAlbumByTitle(songId: string, albumTitle?: string | null) {
      const client = ensureSupabase();
      const normalizedTitle = albumTitle?.trim() ?? '';
      const { data: authData } = await client.auth.getUser();
      const uid = authData.user?.id;
      if (!uid) return;

      const { data: myAlbums, error: albumsError } = await client
        .from('albums')
        .select('id')
        .eq('creator_id', uid)
        .eq('type', 'album');
      if (albumsError) throw albumsError;

      const albumIds = (myAlbums ?? []).map((row: any) => row.id).filter(Boolean);
      if (albumIds.length) {
        const { error: deleteError } = await client
          .from('album_songs')
          .delete()
          .eq('song_id', songId)
          .in('album_id', albumIds);
        if (deleteError) throw deleteError;
      }

      let collectionId: string | null = null;
      if (normalizedTitle) {
        collectionId = await api.ensureMyAlbumByTitle(normalizedTitle);
        if (collectionId) await api.addSongsToCollection(collectionId, [songId]);
      } else {
        invalidateCollectionCaches();
        emitCollectionsChanged();
      }

      return collectionId;
    },

    async setCollectionVisibility(collectionId: string, visibility: CollectionVisibility) {
      const client = ensureSupabase();
      const { error } = await client.rpc('set_collection_visibility', {
        p_album_id: collectionId,
        p_visibility: visibility,
      });
      if (error) throw error;
      invalidateCollectionCaches(collectionId);
      emitCollectionsChanged();
    },

    async incrementCollectionPlayCount(collectionId: string) {
      const client = ensureSupabase();
      const { error } = await client.rpc('increment_collection_play_count', { p_album_id: collectionId });
      if (error) throw error;
    },

    async fetchCollection(collectionId: string): Promise<{ collection: CollectionRow; songs: SongRow[]; relations: AlbumSongRow[]; creatorProfile: ProfileRow | null }> {
      return cached(`collection:${collectionId}`, TTL_COLLECTION_DETAIL_MS, async () => {
        const client = ensureSupabase();
        const { data: collection, error: collectionError } = await client.from('albums').select('*').eq('id', collectionId).single();
        if (collectionError) throw collectionError;

        const { data: rels, error: relError } = await client
          .from('album_songs')
          .select('album_id, song_id, added_at, sort_order')
          .eq('album_id', collectionId)
          .order('sort_order', { ascending: true });
        if (relError) throw relError;

        const songIds = (rels ?? []).map((row: any) => row.song_id).filter(Boolean);
        let songs: SongRow[] = [];
        if (songIds.length) {
          const { data: songRows, error: songsError } = await client.from('songs').select('*').in('id', songIds);
          if (songsError) throw songsError;
          const byId = new Map<string, SongRow>((songRows ?? []).map((song: any) => [song.id, song]));
          songs = songIds.map((id) => byId.get(id)).filter(Boolean) as SongRow[];
        }

        const creatorId = (collection as any).creator_id as string | undefined;
        let creatorProfile: ProfileRow | null = null;
        if (creatorId) {
          try {
            creatorProfile = await fetchProfileById(creatorId);
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
      const client = ensureSupabase();
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
      invalidateCollectionCaches(collectionId);
      emitCollectionsChanged();
    },

    async deleteCollection(collectionId: string) {
      const client = ensureSupabase();
      const { data: collection } = await client.from('albums').select('cover_url').eq('id', collectionId).single();
      if (collection?.cover_url && !/^https?:\/\//i.test(collection.cover_url)) {
        if (cosClient.isEnabled) {
          await cosClient.deleteFiles([collection.cover_url]).catch(() => {});
        }
      }

      const { error } = await client.from('albums').delete().eq('id', collectionId);
      if (error) throw error;

      invalidateCollectionCaches(collectionId);
      emitCollectionsChanged();
    },
  };

  return api;
};
