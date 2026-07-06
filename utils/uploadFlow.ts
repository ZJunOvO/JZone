import type { CollectionSelectValue } from '../components/CollectionCreatableSelect';
import type { Song } from '../types';
import { supabaseApi, type SongRow, type SongVisibility } from '../supabaseApi';

export const resolveUploadAlbum = (selection: CollectionSelectValue, fallbackAlbum: string) => {
  if (selection.kind === 'existing' && selection.type === 'album') return selection.title;
  if (selection.kind === 'create' && selection.type === 'album') return selection.title;
  return fallbackAlbum;
};

export const createUploadedSongFromRow = ({
  row,
  coverUrl,
  visibility,
}: {
  row: SongRow;
  coverUrl: string;
  visibility: SongVisibility;
}): Song => ({
  id: row.id,
  title: row.title,
  artist: row.artist,
  album: row.album ?? undefined,
  genre: row.genre ?? undefined,
  story: row.story ?? undefined,
  fileSize: typeof row.file_size === 'number' ? row.file_size : undefined,
  coverUrl,
  audioUrl: '',
  audioPath: row.audio_path,
  coverPath: row.cover_path ?? undefined,
  ownerId: row.owner_id,
  visibility,
  duration: row.duration,
  trimStart: row.trim_start,
  trimEnd: row.trim_end,
  uploadedBy: 'Me',
  addedAt: new Date(row.created_at).getTime(),
  isPublic: visibility === 'public',
  pinnedAt: row.pinned_at ?? null,
});

export const attachUploadedSongToCollection = async (selection: CollectionSelectValue, songId: string) => {
  if (selection.kind === 'existing') {
    await supabaseApi.addSongsToCollection(selection.id, [songId]);
    return;
  }

  if (selection.kind === 'create') {
    const collectionId = await supabaseApi.createCollection({
      type: selection.type,
      title: selection.title,
      visibility: 'public',
      coverUrl: null,
      description: null,
      releaseYear: null,
      genre: null,
    });
    await supabaseApi.addSongsToCollection(collectionId, [songId]);
  }
};
