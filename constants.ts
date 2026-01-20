
import { Song, Comment } from './types';

// Using a sample MP3 for demo purposes
export const DEMO_AUDIO_URL = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";

export const MOCK_SONGS: Song[] = [
  {
    id: '1',
    title: 'OH LA LA LA',
    artist: '蔡依林',
    album: 'Single',
    coverUrl: 'https://picsum.photos/id/129/400/400',
    audioUrl: DEMO_AUDIO_URL,
    duration: 240,
    trimStart: 0,
    trimEnd: 240,
    uploadedBy: 'User A',
    addedAt: Date.now(),
  },
  {
    id: '2',
    title: '高所爱',
    artist: '辛丑',
    album: 'Dream',
    coverUrl: 'https://picsum.photos/id/145/400/400',
    audioUrl: DEMO_AUDIO_URL,
    duration: 185,
    trimStart: 10,
    trimEnd: 180,
    uploadedBy: 'User B',
    addedAt: Date.now() - 100000,
  },
  {
    id: '3',
    title: '日落大道',
    artist: 'Chill Cow',
    album: 'Beats',
    coverUrl: 'https://picsum.photos/id/184/400/400',
    audioUrl: DEMO_AUDIO_URL,
    duration: 120,
    trimStart: 0,
    trimEnd: 120,
    uploadedBy: 'User A',
    addedAt: Date.now() - 200000,
  }
];

export const MOCK_COMMENTS: Comment[] = [
  {
    id: 'c1',
    songId: '1',
    userId: 'u1',
    username: 'JZone Official',
    avatarUrl: 'https://picsum.photos/id/64/100/100',
    text: 'Welcome to the zone. Enjoy the bass drop here!',
    timestamp: Date.now() - 86400000,
    playbackTime: 45,
    likes: 128,
    isVerified: true,
    role: 'admin'
  },
  {
    id: 'c2',
    songId: '1',
    userId: 'u2',
    username: 'MusicLover',
    avatarUrl: 'https://picsum.photos/id/75/100/100',
    text: 'This transition is seamless.',
    timestamp: Date.now() - 3600000,
    playbackTime: 12,
    likes: 5,
    role: 'user'
  },
  {
    id: 'c3',
    songId: '1',
    userId: 'u3',
    username: '蔡依林 Fan',
    avatarUrl: 'https://picsum.photos/id/88/100/100',
    text: 'Queen is back!!',
    timestamp: Date.now() - 1800000,
    playbackTime: 0,
    likes: 42,
    role: 'user'
  }
];
