
export type PlayerSkin = 'vinyl' | 'coverflow' | 'minimal';

export interface Song {
  id: string;
  title: string;
  artist: string;
  album?: string;
  coverUrl: string;
  audioUrl: string;
  audioPath?: string;
  coverPath?: string;
  visibility?: 'private' | 'public';
  ownerId?: string;
  playsCount?: number;
  duration: number; // in seconds
  trimStart: number; // start time in seconds
  trimEnd: number; // end time in seconds
  uploadedBy: string;
  addedAt: number;
}

export interface Comment {
  id: string;
  songId: string;
  userId: string;
  username: string;
  avatarUrl: string;
  text: string;
  timestamp: number; // The actual time the comment was posted
  playbackTime: number; // The time in the song the comment refers to
  likes: number;
  isVerified?: boolean; // For admins or artists
  role?: 'admin' | 'artist' | 'user';
}

export interface PlayerState {
  currentSongId: string | null;
  isPlaying: boolean;
  currentTime: number;
  volume: number;
  queue: string[];
  skin: PlayerSkin;
}

export interface UserProfile {
  id: string;
  username: string;
  avatarUrl: string;
  role: 'admin' | 'member';
}
