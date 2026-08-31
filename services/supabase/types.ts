export type SongVisibility = 'private' | 'public';
export type CollectionType = 'album' | 'playlist';
export type CollectionVisibility = 'private' | 'public';
export type SongArtistRole = 'primary' | 'featured' | 'producer' | 'other';
export type SongLyricsFormat = 'plain' | 'lrc' | 'ttml';
export type SongLyricsSource = 'upload' | 'embedded' | 'editor';
export type SongVideoKind = 'full' | 'memory';

export type JsonValue =
  | string
  | number
  | boolean
  | null
  | JsonValue[]
  | { [key: string]: JsonValue };

export type SongLyricsNormalizedContent = JsonValue | null;

export interface SongLyricsRow {
  song_id: string;
  format: SongLyricsFormat;
  source: SongLyricsSource;
  raw_content: string;
  normalized_content: SongLyricsNormalizedContent;
  offset_ms: number;
  checksum: string;
  version: number;
  created_at: string;
  updated_at: string;
}

export interface SongLyricsInput {
  format: SongLyricsFormat;
  source: SongLyricsSource;
  rawContent: string;
  normalizedContent?: SongLyricsNormalizedContent;
  offsetMs?: number;
  checksum?: string;
  version?: number;
}

export interface SongVideoRow {
  id: string;
  song_id: string;
  owner_id: string;
  kind: SongVideoKind;
  video_path: string;
  poster_path: string | null;
  file_name: string;
  file_size: number;
  duration_ms: number;
  video_start_ms: number;
  video_end_ms: number | null;
  song_start_ms: number | null;
  song_end_ms: number | null;
  audio_mix: number;
  created_at: string;
  updated_at: string;
}

export interface SongVideoInput {
  kind: SongVideoKind;
  videoFile: File;
  posterFile?: File | null;
  durationMs: number;
  videoStartMs?: number;
  videoEndMs?: number | null;
  songStartMs?: number | null;
  songEndMs?: number | null;
  audioMix?: number;
}

export type SongLyricsUpsertInput = SongLyricsInput;

export interface SongArtistRow {
  song_id: string;
  profile_id: string | null;
  display_name: string;
  role: SongArtistRole;
  sort_order: number;
  created_at?: string;
  updated_at?: string;
}

export interface SongArtistInput {
  profileId?: string | null;
  displayName: string;
  role?: SongArtistRole;
  sortOrder?: number;
}

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
  stream_audio_path?: string | null;
  stream_file_size?: number | null;
  stream_bitrate_kbps?: number | null;
  cover_path: string | null;
  plays_count?: number | null;
  is_public?: boolean;
  pinned_at?: string | null;
  recorded_at?: string | null;
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
  quoted_lyric?: string | null;
  created_at: string;
  parent_comment_id?: string | null;
  deleted_at?: string | null;
  avatar_frame_id?: string | null;
  likes_count?: number;
  user_liked?: boolean;
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
  player_skin_id?: 'classic' | 'vinyl' | 'immersive' | null;
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
