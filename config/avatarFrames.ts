export interface AvatarFrameConfig {
  id: string;
  name: string;
  imageUrl: string;
  description?: string;
  tags?: string[];
  price?: number;
  unlockCondition?: string;
}

export const AVATAR_FRAMES: Record<string, AvatarFrameConfig> = {
  'cloud_dream_v1': {
    id: 'cloud_dream_v1',
    name: '旷野',
    imageUrl: '/frames/cloud_dream_v1.png',
    description: '如同漫步在云端，感受自由的风。',
    tags: ['限定'],
  },
};

export const getAvatarFrameUrl = (id?: string | null) => {
  if (!id) return undefined;
  return AVATAR_FRAMES[id]?.imageUrl;
};
