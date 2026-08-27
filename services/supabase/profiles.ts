import { cosClient } from '../../cosClient';
import { cached, invalidateApiCache, TTL_PROFILE_MS } from './cache';
import { ensureSupabase } from './client';
import type { ProfileRow } from './types';
import { getBlobContentHash } from '../../utils/sharedMedia';

const getExt = (name: string) => {
  const idx = name.lastIndexOf('.');
  if (idx === -1) return '';
  return name.slice(idx + 1).toLowerCase();
};

export const createProfilesApi = () => ({
  async fetchProfile(userId: string): Promise<ProfileRow | null> {
    return cached(`profile:${userId}`, TTL_PROFILE_MS, async () => {
      const client = ensureSupabase();
      const { data, error } = await client.from('profiles').select('*').eq('id', userId).single();
      if (error) {
        if (error.code === 'PGRST116') return null;
        throw error;
      }
      return data as ProfileRow;
    });
  },

  async fetchArtistProfiles(limit = 24): Promise<Pick<ProfileRow, 'id' | 'nickname' | 'avatar_url'>[]> {
    return cached(`artistProfiles:${limit}`, TTL_PROFILE_MS, async () => {
      const client = ensureSupabase();
      const { data, error } = await client
        .from('profiles')
        .select('id, nickname, avatar_url')
        .order('nickname', { ascending: true, nullsFirst: false })
        .limit(limit);
      if (error) throw error;
      return (data ?? []) as Pick<ProfileRow, 'id' | 'nickname' | 'avatar_url'>[];
    });
  },

  async uploadProfileImage(userId: string, file: Blob, bucket: 'avatars' | 'covers', originalName?: string): Promise<string> {
    const anyFile = file as any;
    const requestedExt = getExt(originalName ?? (anyFile?.name as string) ?? '') || 'jpg';
    const ext = /^[a-z0-9]{1,8}$/i.test(requestedExt) ? requestedExt : 'jpg';
    const contentHash = await getBlobContentHash(file);
    // 内容寻址 key 与签名 URL/COS immutable 缓存兼容：内容不变就复用，内容变化就自然得到新缓存 key。
    const fileName = `${userId}/${bucket}/v1/${contentHash}.${ext}`;
    const contentType = file.type?.toLowerCase().startsWith('image/') ? file.type : 'image/jpeg';

    if (!cosClient.isEnabled) throw new Error('COS 未配置');
    await cosClient.uploadFileIfAbsent(file, fileName, contentType);
    return fileName;
  },

  async updateProfile(userId: string, data: Partial<ProfileRow>) {
    const client = ensureSupabase();
    const { error } = await client.from('profiles').upsert({ id: userId, ...data });
    if (error) throw error;
    invalidateApiCache((key) => key === `profile:${userId}`);
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('jzone:profile-changed', { detail: { userId } }));
    }
  },
});
