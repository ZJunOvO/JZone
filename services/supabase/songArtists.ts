import { ensureSupabase } from './client';
import type { SongArtistInput, SongArtistRole, SongArtistRow } from './types';

const SONG_ARTIST_ROLES = new Set<SongArtistRole>(['primary', 'featured', 'producer', 'other']);

const isSongArtistsMigrationMissing = (error: unknown) => {
  const value = error as { code?: unknown; message?: unknown; details?: unknown } | null;
  const code = typeof value?.code === 'string' ? value.code : '';
  const description = [value?.message, value?.details]
    .filter((part): part is string => typeof part === 'string')
    .join(' ');
  const referencesSongArtists = /(song_artists|upsert_song_artists)/i.test(description);
  return referencesSongArtists && (
    ['42P01', '42883', 'PGRST202', 'PGRST205'].includes(code)
    || /(schema cache|does not exist|could not find|not find)/i.test(description)
  );
};

const normalizeArtists = (artists: SongArtistInput[]): SongArtistRow[] => {
  const normalized = artists.map((artist, inputIndex) => {
    const displayName = artist.displayName.trim();
    if (!displayName) throw new Error('艺人显示名称不能为空');
    if (artist.role && !SONG_ARTIST_ROLES.has(artist.role)) throw new Error(`不支持的艺人角色：${artist.role}`);

    const requestedOrder = typeof artist.sortOrder === 'number' ? artist.sortOrder : inputIndex;
    return {
      inputIndex,
      requestedOrder: Number.isInteger(requestedOrder) && requestedOrder >= 0 ? requestedOrder : inputIndex,
      profile_id: artist.profileId?.trim() || null,
      display_name: displayName,
      role: artist.role ?? (inputIndex === 0 ? 'primary' : 'featured'),
    };
  });

  normalized.sort((left, right) => left.requestedOrder - right.requestedOrder || left.inputIndex - right.inputIndex);
  return normalized.map((artist, sortOrder) => ({
    song_id: '',
    profile_id: artist.profile_id,
    display_name: artist.display_name,
    role: artist.role,
    sort_order: sortOrder,
  }));
};

const fetchLegacyArtist = async (songId: string): Promise<SongArtistRow[]> => {
  const client = ensureSupabase();
  const { data, error } = await client
    .from('songs')
    .select('artist')
    .eq('id', songId)
    .maybeSingle();
  if (error) throw error;

  const displayName = typeof data?.artist === 'string' ? data.artist.trim() : '';
  if (!displayName) return [];
  return [{
    song_id: songId,
    profile_id: null,
    display_name: displayName,
    role: 'primary',
    sort_order: 0,
  }];
};

export const createSongArtistsApi = () => ({
  async fetchSongIdsByArtistProfile(profileId: string): Promise<string[]> {
    const client = ensureSupabase();
    const { data, error } = await client
      .from('song_artists')
      .select('song_id')
      .eq('profile_id', profileId);

    if (error) {
      if (isSongArtistsMigrationMissing(error)) return [];
      throw error;
    }
    return Array.from(new Set((data ?? []).map((row) => row.song_id).filter(Boolean)));
  },

  async fetchCollaboratingSongIds(profileId: string): Promise<string[]> {
    const client = ensureSupabase();
    const { data: ownCredits, error: ownError } = await client
      .from('song_artists')
      .select('song_id')
      .eq('profile_id', profileId);
    if (ownError) {
      if (isSongArtistsMigrationMissing(ownError)) return [];
      throw ownError;
    }

    const candidateIds = Array.from(new Set<string>(
      (ownCredits ?? [])
        .map((row) => typeof row.song_id === 'string' ? row.song_id : '')
        .filter(Boolean),
    ));
    if (!candidateIds.length) return [];
    const { data: credits, error } = await client
      .from('song_artists')
      .select('song_id, profile_id, display_name')
      .in('song_id', candidateIds);
    if (error) throw error;

    const creditKeys = new Map<string, Set<string>>();
    (credits ?? []).forEach((credit) => {
      const keys = creditKeys.get(credit.song_id) ?? new Set<string>();
      keys.add(credit.profile_id || `name:${credit.display_name}`);
      creditKeys.set(credit.song_id, keys);
    });
    return candidateIds.filter((songId) => (creditKeys.get(songId)?.size ?? 0) > 1);
  },

  async fetchSongArtists(songId: string): Promise<SongArtistRow[]> {
    const client = ensureSupabase();
    const { data, error } = await client
      .from('song_artists')
      .select('song_id, profile_id, display_name, role, sort_order, created_at, updated_at')
      .eq('song_id', songId)
      .order('sort_order', { ascending: true });

    if (error) {
      if (isSongArtistsMigrationMissing(error)) return fetchLegacyArtist(songId);
      throw error;
    }

    const rows = (data ?? []) as SongArtistRow[];
    return rows.length ? rows : fetchLegacyArtist(songId);
  },

  async upsertSongArtists(
    songId: string,
    artists: SongArtistInput[],
    legacyArtist?: string
  ): Promise<SongArtistRow[]> {
    const client = ensureSupabase();
    const normalized = normalizeArtists(artists).map((artist) => ({ ...artist, song_id: songId }));
    const legacyDisplayName = legacyArtist?.trim() || normalized.map((artist) => artist.display_name).join(' / ');
    const payload = normalized.map((artist) => ({
      profile_id: artist.profile_id,
      display_name: artist.display_name,
      role: artist.role,
    }));

    const { data, error } = await client.rpc('upsert_song_artists', {
      p_song_id: songId,
      p_artists: payload,
      p_legacy_artist: legacyDisplayName || null,
    });

    if (!error) return (data ?? []) as SongArtistRow[];
    if (!isSongArtistsMigrationMissing(error)) throw error;

    if (legacyDisplayName) {
      const { error: legacyError } = await client
        .from('songs')
        .update({ artist: legacyDisplayName })
        .eq('id', songId);
      if (legacyError) throw legacyError;
    }

    return normalized;
  },
});
