import React from 'react';
import { useAuth } from '../auth';
import { DEFAULT_PLAYER_SKIN, normalizePlayerSkinId } from '../config/personalization';
import { useCurrentArtistProfile } from './useCurrentArtistProfile';
import { supabaseApi } from '../supabaseApi';
import { useStore } from '../store';
import type { PlayerSkin } from '../types';

const SKIN_CACHE_PREFIX = 'jzone:player-skin:v1:';

const readCachedSkin = (userId?: string): PlayerSkin => {
  if (!userId) return DEFAULT_PLAYER_SKIN;
  try {
    return normalizePlayerSkinId(localStorage.getItem(`${SKIN_CACHE_PREFIX}${userId}`));
  } catch {
    return DEFAULT_PLAYER_SKIN;
  }
};

const writeCachedSkin = (userId: string, skinId: PlayerSkin) => {
  try {
    localStorage.setItem(`${SKIN_CACHE_PREFIX}${userId}`, skinId);
  } catch {}
};

export const usePersonalization = () => {
  const { user } = useAuth();
  const { profile, resolvedAvatarUrl, displayName, isLoading } = useCurrentArtistProfile();
  const { setSkin } = useStore();
  const [playerSkinId, setPlayerSkinId] = React.useState<PlayerSkin>(() => readCachedSkin(user?.id));
  const [savingKey, setSavingKey] = React.useState<'skin' | 'avatar' | null>(null);

  React.useEffect(() => {
    const next = normalizePlayerSkinId(profile?.player_skin_id ?? readCachedSkin(user?.id));
    setPlayerSkinId(next);
    setSkin(next);
    if (user?.id) writeCachedSkin(user.id, next);
  }, [profile?.player_skin_id, setSkin, user?.id]);

  const savePlayerSkin = React.useCallback(async (skinId: PlayerSkin) => {
    if (!user?.id) throw new Error('请先登录');
    const previous = playerSkinId;
    const normalized = normalizePlayerSkinId(skinId);
    setSavingKey('skin');
    setPlayerSkinId(normalized);
    setSkin(normalized);
    writeCachedSkin(user.id, normalized);
    try {
      await supabaseApi.updateProfile(user.id, { player_skin_id: normalized });
    } catch (error) {
      setPlayerSkinId(previous);
      setSkin(previous);
      writeCachedSkin(user.id, previous);
      throw error;
    } finally {
      setSavingKey(null);
    }
  }, [playerSkinId, setSkin, user?.id]);

  const saveAvatarFrame = React.useCallback(async (frameId: string | null) => {
    if (!user?.id) throw new Error('请先登录');
    setSavingKey('avatar');
    try {
      await supabaseApi.updateProfile(user.id, { avatar_frame_id: frameId });
    } finally {
      setSavingKey(null);
    }
  }, [user?.id]);

  return {
    userId: user?.id,
    profile,
    displayName,
    resolvedAvatarUrl,
    playerSkinId,
    avatarFrameId: profile?.avatar_frame_id ?? null,
    isLoading,
    savingKey,
    savePlayerSkin,
    saveAvatarFrame,
  };
};
