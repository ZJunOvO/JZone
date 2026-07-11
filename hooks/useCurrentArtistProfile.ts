import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../auth';
import { hasSupabaseConfig } from '../supabaseClient';
import { supabaseApi, type ProfileRow } from '../supabaseApi';
import { getFallbackAvatarUrl, getQQAvatarUrl } from '../utils/avatar';

export type CurrentArtistProfile = Pick<ProfileRow, 'id' | 'nickname' | 'avatar_url'>;

type CachedProfile = {
  profile: CurrentArtistProfile | null;
  profileUpdatedAt: number;
  avatarRaw?: string;
  avatarUrl?: string;
  avatarExpiresAt?: number;
};

const CACHE_PREFIX = 'jzone_current_artist_profile_v2:';
const PROFILE_REFRESH_MS = 30 * 60 * 1000;
const AVATAR_CACHE_MS = 50 * 60 * 1000;

const readCache = (userId?: string): CachedProfile | null => {
  if (!userId) return null;
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${userId}`);
    return raw ? JSON.parse(raw) as CachedProfile : null;
  } catch {
    return null;
  }
};

const writeCache = (userId: string, value: CachedProfile) => {
  try {
    localStorage.setItem(`${CACHE_PREFIX}${userId}`, JSON.stringify(value));
  } catch {}
};

const getAuthDisplayName = (user: ReturnType<typeof useAuth>['user']) => {
  const metadataNickname = user?.user_metadata?.nickname;
  if (typeof metadataNickname === 'string' && metadataNickname.trim()) return metadataNickname.trim();
  if (typeof user?.email === 'string' && user.email.trim()) return user.email.split('@')[0];
  return undefined;
};

export const useCurrentArtistProfile = () => {
  const { user } = useAuth();
  const initialCache = readCache(user?.id);
  const [profile, setProfile] = useState<CurrentArtistProfile | null>(initialCache?.profile ?? null);
  const [isProfileResolved, setIsProfileResolved] = useState(Boolean(initialCache) || !hasSupabaseConfig);
  const [resolvedAvatarUrl, setResolvedAvatarUrl] = useState<string | undefined>(() => {
    if (!initialCache?.avatarUrl || (initialCache.avatarExpiresAt ?? 0) <= Date.now()) return undefined;
    return initialCache.avatarUrl;
  });

  useEffect(() => {
    if (!hasSupabaseConfig || !user?.id) {
      setProfile(null);
      setIsProfileResolved(true);
      return;
    }

    let cancelled = false;
    let timer: number | undefined;
    const cached = readCache(user.id);
    setProfile(cached?.profile ?? null);
    setIsProfileResolved(Boolean(cached));
    if (cached?.avatarUrl && (cached.avatarExpiresAt ?? 0) > Date.now()) {
      setResolvedAvatarUrl(cached.avatarUrl);
    } else {
      setResolvedAvatarUrl(undefined);
    }

    const refresh = async () => {
      try {
        const row = await supabaseApi.fetchProfile(user.id);
        if (cancelled) return;
        const nextProfile = row ? { id: row.id, nickname: row.nickname, avatar_url: row.avatar_url } : null;
        setProfile(nextProfile);
        setIsProfileResolved(true);
        const previous = readCache(user.id);
        writeCache(user.id, {
          profile: nextProfile,
          profileUpdatedAt: Date.now(),
          avatarRaw: previous?.avatarRaw,
          avatarUrl: previous?.avatarUrl,
          avatarExpiresAt: previous?.avatarExpiresAt,
        });
      } catch {
        if (!cancelled) setIsProfileResolved(true);
      }
    };

    const cacheFresh = cached && Date.now() - cached.profileUpdatedAt < PROFILE_REFRESH_MS;
    if (!cacheFresh) void refresh();
    timer = window.setInterval(refresh, PROFILE_REFRESH_MS);
    const onProfileChanged = () => void refresh();
    window.addEventListener('jzone:profile-changed', onProfileChanged);

    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      window.removeEventListener('jzone:profile-changed', onProfileChanged);
    };
  }, [user?.id]);

  const displayName = useMemo(() => {
    const profileName = profile?.nickname?.trim();
    if (profileName) return profileName;
    return isProfileResolved ? getAuthDisplayName(user) : undefined;
  }, [isProfileResolved, profile?.nickname, user]);

  useEffect(() => {
    let cancelled = false;
    const rawAvatar = profile?.avatar_url || (user?.user_metadata?.avatar_url as string | undefined);
    const fallback = getQQAvatarUrl(user?.email) || getFallbackAvatarUrl(user?.id || user?.email || 'jzone');

    if (!isProfileResolved) return;
    if (!rawAvatar) {
      setResolvedAvatarUrl(fallback);
      return;
    }
    const isCosUrl = /^https?:\/\/[^/]*myqcloud\.com\//i.test(rawAvatar);
    if (/^(https?:|blob:|data:)/i.test(rawAvatar) && !isCosUrl) {
      setResolvedAvatarUrl(rawAvatar);
      if (user?.id) {
        const cached = readCache(user.id);
        writeCache(user.id, {
          profile,
          profileUpdatedAt: cached?.profileUpdatedAt ?? Date.now(),
          avatarRaw: rawAvatar,
          avatarUrl: rawAvatar,
          avatarExpiresAt: Date.now() + AVATAR_CACHE_MS,
        });
      }
      return;
    }

    const cached = readCache(user?.id);
    if (cached?.avatarRaw === rawAvatar && cached.avatarUrl && (cached.avatarExpiresAt ?? 0) > Date.now()) {
      setResolvedAvatarUrl(cached.avatarUrl);
      return;
    }

    // 已有自定义头像时不先闪回 QQ 头像，等待后台签名完成。
    if (cached?.avatarRaw !== rawAvatar) setResolvedAvatarUrl(undefined);
    supabaseApi
      .createSignedAvatarUrl(rawAvatar, 3600)
      .then((url) => {
        if (cancelled) return;
        const nextUrl = url || fallback;
        setResolvedAvatarUrl(nextUrl);
        if (user?.id) {
          const previous = readCache(user.id);
          writeCache(user.id, {
            profile,
            profileUpdatedAt: previous?.profileUpdatedAt ?? Date.now(),
            avatarRaw: rawAvatar,
            avatarUrl: nextUrl,
            avatarExpiresAt: Date.now() + AVATAR_CACHE_MS,
          });
        }
      })
      .catch(() => {
        if (!cancelled) setResolvedAvatarUrl(fallback);
      });
    return () => {
      cancelled = true;
    };
  }, [isProfileResolved, profile, user?.email, user?.id, user?.user_metadata?.avatar_url]);

  return {
    profile,
    displayName,
    resolvedAvatarUrl,
    isLoading: !isProfileResolved,
  };
};
