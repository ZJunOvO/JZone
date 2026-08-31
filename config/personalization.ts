import type { PlayerSkin } from '../types';

export type PersonalizationSection = 'player' | 'avatar' | 'achievements';

export interface PlayerSkinConfig {
  id: PlayerSkin;
  name: string;
  description: string;
}

export const DEFAULT_PLAYER_SKIN: PlayerSkin = 'classic';

export const PLAYER_SKINS: PlayerSkinConfig[] = [
  { id: 'classic', name: '经典专辑', description: '熟悉的专辑封面与沉浸背景' },
  { id: 'vinyl', name: '黑胶唱片', description: '让封面成为缓慢旋转的唱片' },
  { id: 'immersive', name: '全屏封面', description: '让画面延伸到整个播放空间' },
];

const PLAYER_SKIN_IDS = new Set<PlayerSkin>(PLAYER_SKINS.map((skin) => skin.id));

export const normalizePlayerSkinId = (value?: string | null): PlayerSkin => {
  if (value === 'coverflow') return 'classic';
  if (value === 'minimal') return 'immersive';
  return PLAYER_SKIN_IDS.has(value as PlayerSkin) ? value as PlayerSkin : DEFAULT_PLAYER_SKIN;
};

export interface PersonalizationProgress {
  uploads: number;
  lyrics: number;
  videos: number;
  qualifiedPlays: number;
  puzzles: number;
}

export interface AchievementConfig {
  id: string;
  name: string;
  description: string;
  metric: keyof PersonalizationProgress;
  target: number;
}

export const ACHIEVEMENTS: AchievementConfig[] = [
  { id: 'first_recording_v1', name: '第一段声音', description: '完成第一次录音收录', metric: 'uploads', target: 1 },
  { id: 'first_lyrics_v1', name: '写进旋律里', description: '为一首歌曲完成歌词', metric: 'lyrics', target: 1 },
  { id: 'first_video_v1', name: '记忆有了画面', description: '为一首歌曲留下影像', metric: 'videos', target: 1 },
  { id: 'listener_30_v1', name: '声音的陪伴', description: '完成 30 次有效聆听', metric: 'qualifiedPlays', target: 30 },
  { id: 'first_puzzle_v1', name: '拼回这一刻', description: '完成一张记忆拼图', metric: 'puzzles', target: 1 },
];
