export const PLAYER_LYRICS_REQUEST_EVENT = 'jzone:player-lyrics-request' as const;

export interface PlayerLyricsRequestDetail {
  songId: string;
  source: 'song-menu';
}

export type PlayerLyricsRequestEvent = CustomEvent<PlayerLyricsRequestDetail>;

export const dispatchPlayerLyricsRequest = (songId: string): boolean => {
  const normalizedSongId = songId.trim();
  if (!normalizedSongId || typeof window === 'undefined') return false;
  return window.dispatchEvent(new CustomEvent<PlayerLyricsRequestDetail>(PLAYER_LYRICS_REQUEST_EVENT, {
    detail: { songId: normalizedSongId, source: 'song-menu' },
  }));
};

export const SONG_LYRICS_UPDATED_EVENT = 'jzone:song-lyrics-updated' as const;

export type SongLyricsUpdatedAction = 'saved' | 'deleted';

export interface SongLyricsUpdatedDetail {
  songId: string;
  action: SongLyricsUpdatedAction;
}

export type SongLyricsUpdatedEvent = CustomEvent<SongLyricsUpdatedDetail>;

export const dispatchSongLyricsUpdated = (detail: SongLyricsUpdatedDetail): boolean => {
  if (typeof window === 'undefined') return false;
  return window.dispatchEvent(new CustomEvent<SongLyricsUpdatedDetail>(SONG_LYRICS_UPDATED_EVENT, { detail }));
};
