import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ProfileHeader } from '../components/ProfileHeader';
import { useAuth } from '../auth';
import { useStore } from '../store';
import { Icons } from '../components/Icons';
import { CollectionRow, supabaseApi, ProfileRow } from '../supabaseApi';
import { useModalPresence } from '../modalPresence';
import { PersonalizationEntry } from '../components/profile/PersonalizationEntry';
import { ProfileContent } from '../components/profile/ProfileContent';
import { ProfileBackgroundSheet } from '../components/profile/ProfileBackgroundSheet';
import { ProfileSettingsSheet } from '../components/profile/ProfileSettingsSheet';
import { useCurrentArtistProfile } from '../hooks/useCurrentArtistProfile';

import { StatusSelector } from '../components/StatusSelector';
import { ImageCropperModal } from '../components/ImageCropperModal';
import { UniversalContextMenu } from '../components/UniversalContextMenu';
import { CollectionContextMenu } from '../components/CollectionContextMenu';
import { EditCollectionModal } from '../components/EditCollectionModal';
import { Song } from '../types';
import { CreateCollectionModal } from '../components/CreateCollectionModal';
import { feedback } from '../components/feedback';
import { normalizeSecureMediaUrl } from '../utils/mediaUrl';

interface ProfileProps {
  userId?: string; // If undefined, show current user
  onBack?: () => void;
}

const PROFILE_CACHE_PREFIX = 'jzone_profile_cache_v1:';
const PROFILE_FETCHED_AT_PREFIX = 'jzone_profile_fetched_at_v1:';
const PROFILE_MEDIA_CACHE_PREFIX = 'jzone_profile_media_cache_v1:';
const PROFILE_REFRESH_MS = 30 * 60 * 1000;
const PROFILE_MEDIA_CACHE_MS = 50 * 60 * 1000;

type ProfileMediaCache = {
  avatarRaw?: string;
  avatarUrl?: string;
  coverRaw?: string;
  coverUrl?: string;
  expiresAt: number;
};

const readProfileMediaCache = (userId?: string): ProfileMediaCache | null => {
  if (!userId) return null;
  try {
    const value = JSON.parse(localStorage.getItem(`${PROFILE_MEDIA_CACHE_PREFIX}${userId}`) || 'null') as ProfileMediaCache | null;
    if (!value || value.expiresAt <= Date.now()) return null;
    return {
      ...value,
      avatarUrl: normalizeSecureMediaUrl(value.avatarUrl),
      coverUrl: normalizeSecureMediaUrl(value.coverUrl),
    };
  } catch {
    return null;
  }
};

const writeProfileMediaCache = (userId: string, value: ProfileMediaCache) => {
  try {
    localStorage.setItem(`${PROFILE_MEDIA_CACHE_PREFIX}${userId}`, JSON.stringify(value));
  } catch {}
};

export const Profile: React.FC<ProfileProps> = ({ userId, onBack }) => {
  const { user, signOut } = useAuth();
  const { songs, playContext, favoriteSongIds } = useStore();
  const currentArtistProfile = useCurrentArtistProfile();
  const targetUserId = userId || user?.id;
  const isCurrentUser = !userId || (user && user.id === userId);
  const [activeTab, setActiveTab] = useState<'creation' | 'collection'>('creation');
  const [activeSubTab, setActiveSubTab] = useState<string>('uploads');
  const [profileData, setProfileData] = useState<ProfileRow | null>(() => {
    const id = userId || user?.id;
    if (!id) return null;
    try {
      const cachedRaw = localStorage.getItem(`${PROFILE_CACHE_PREFIX}${id}`);
      if (!cachedRaw) return null;
      return JSON.parse(cachedRaw) as ProfileRow;
    } catch {
      return null;
    }
  });
  const [isLoading, setIsLoading] = useState(true);
  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editCollectionOpen, setEditCollectionOpen] = useState(false);
  const [editCollectionTarget, setEditCollectionTarget] = useState<CollectionRow | null>(null);
  const [createType, setCreateType] = useState<'album' | 'playlist'>('album');

  // Fetch profile data on mount or userId change
  React.useLayoutEffect(() => {
    if (!targetUserId) return;
    let cancelled = false;
    const handlePageHide = () => {
      cancelled = true;
    };
    window.addEventListener('pagehide', handlePageHide);
    let timer: number | undefined;
    let hadCache = false;
    try {
      const cachedRaw = localStorage.getItem(`${PROFILE_CACHE_PREFIX}${targetUserId}`);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw) as ProfileRow;
        hadCache = true;
        setProfileData(cached);
        if (typeof cached.background_blur === 'number') {
          setBackgroundBlur(cached.background_blur * 100);
        }
      }
    } catch {}

    setIsLoading(!hadCache);
    const refresh = async () => {
      try {
        const data = await supabaseApi.fetchProfile(targetUserId);
        if (cancelled) return;
        setProfileData(data);
        if (typeof data?.background_blur === 'number') {
          setBackgroundBlur(data.background_blur * 100);
        }
        try {
          if (data) {
            localStorage.setItem(`${PROFILE_CACHE_PREFIX}${targetUserId}`, JSON.stringify(data));
            localStorage.setItem(`${PROFILE_FETCHED_AT_PREFIX}${targetUserId}`, String(Date.now()));
          }
        } catch {}
      } catch (error) {
        if (cancelled) return;
        console.error('Error loading profile:', error);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    let fetchedAt = 0;
    try {
      fetchedAt = Number(localStorage.getItem(`${PROFILE_FETCHED_AT_PREFIX}${targetUserId}`) || 0);
    } catch {}
    if (!hadCache || Date.now() - fetchedAt >= PROFILE_REFRESH_MS) void refresh();
    else setIsLoading(false);
    timer = window.setInterval(refresh, PROFILE_REFRESH_MS);
    const handleProfileChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ userId?: string; updates?: Partial<ProfileRow> }>).detail;
      if (detail?.userId && detail.userId !== targetUserId) return;
      if (detail?.updates) {
        setProfileData((previous) => {
          if (!previous) return previous;
          const next = { ...previous, ...detail.updates } as ProfileRow;
          try {
            localStorage.setItem(`${PROFILE_CACHE_PREFIX}${targetUserId}`, JSON.stringify(next));
          } catch {}
          return next;
        });
      }
      void refresh();
    };
    window.addEventListener('jzone:profile-changed', handleProfileChanged);
    return () => {
      cancelled = true;
      if (timer) window.clearInterval(timer);
      window.removeEventListener('jzone:profile-changed', handleProfileChanged);
      window.removeEventListener('pagehide', handlePageHide);
    };
  }, [targetUserId]);

  useEffect(() => {
    if (!targetUserId) return;
    if (!supabaseApi.isEnabled()) return;
    let cancelled = false;
    setCollectionsLoading(true);
    supabaseApi
      .fetchCollectionsByCreator(targetUserId, undefined, 50, user?.id)
      .then((rows) => {
        if (cancelled) return;
        setCollections(rows);
      })
      .catch(() => {})
      .finally(() => {
        if (cancelled) return;
        setCollectionsLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [targetUserId]);

  useEffect(() => {
    if (!targetUserId) return;
    if (!supabaseApi.isEnabled()) return;
    const handler = () => {
      supabaseApi.fetchCollectionsByCreator(targetUserId, undefined, 50, user?.id).then(setCollections).catch(() => {});
    };
    window.addEventListener('jzone:collections-changed', handler);
    return () => {
      window.removeEventListener('jzone:collections-changed', handler);
    };
  }, [targetUserId, user?.id]);

  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [backgroundBlur, setBackgroundBlur] = useState(() => {
    const id = userId || user?.id;
    if (!id) return 100;
    try {
      const cachedRaw = localStorage.getItem(`${PROFILE_CACHE_PREFIX}${id}`);
      if (!cachedRaw) return 100;
      const cached = JSON.parse(cachedRaw) as ProfileRow;
      if (typeof cached.background_blur === 'number') return cached.background_blur * 100;
      return 0;
    } catch {
      return 0;
    }
  });
  const blurTimeoutRef = useRef<any>(null);
  
  const [cropperState, setCropperState] = useState<{ isOpen: boolean; imageSrc: string | null; aspectOverride?: number }>({
    isOpen: false,
    imageSrc: null,
  });
  const [isBackgroundManagerOpen, setIsBackgroundManagerOpen] = useState(false);
  const [isStatusSelectorOpen, setIsStatusSelectorOpen] = useState(false);
  const [resolvedAvatarUrl, setResolvedAvatarUrl] = useState<string | undefined>(() => readProfileMediaCache(targetUserId)?.avatarUrl);
  const [resolvedCoverUrl, setResolvedCoverUrl] = useState<string | undefined>(() => readProfileMediaCache(targetUserId)?.coverUrl);
  const [contextMenu, setContextMenu] = useState<{ isOpen: boolean; anchor?: { x: number; y: number }; item: Song } | null>(null);
  const [collectionMenu, setCollectionMenu] = useState<{ isOpen: boolean; anchor?: { x: number; y: number }; item: CollectionRow } | null>(null);
  
  // Easter Egg State
  const [showEasterEgg, setShowEasterEgg] = useState(false);

  useModalPresence(isSettingsOpen);
  useModalPresence(isBackgroundManagerOpen);
  useModalPresence(isStatusSelectorOpen);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.addEventListener('load', () => {
        const style = (profileData?.background_style ?? 'half') as 'half' | 'full';
        const viewportW = window.innerWidth || 390;
        const viewportH = window.innerHeight || 844;
        const aspectOverride = style === 'full' ? viewportW / viewportH : viewportW / 360;
        setCropperState({ isOpen: true, imageSrc: reader.result as string, aspectOverride });
      });
      reader.readAsDataURL(file);
      e.target.value = '';
    }
  };

  const handleCropComplete = async (blob: Blob) => {
    setCropperState({ isOpen: false, imageSrc: null });
    if (!targetUserId) return;

    try {
      setIsBackgroundManagerOpen(false);
      // 1. 上传到 COS；接口返回内容寻址 key，不能再拼接时间戳或随机缓存参数。
      const publicUrl = await supabaseApi.uploadProfileImage(targetUserId, blob, 'covers', 'background.jpg');

      // 2. Update DB
      await supabaseApi.updateProfile(targetUserId, { cover_url: publicUrl });
      const signedCoverUrl = await supabaseApi.createSignedCoverUrl(publicUrl, 3600).catch(() => publicUrl);
      setResolvedCoverUrl(signedCoverUrl);
      writeProfileMediaCache(targetUserId, {
        ...readProfileMediaCache(targetUserId),
        coverRaw: publicUrl,
        coverUrl: signedCoverUrl,
        expiresAt: Date.now() + PROFILE_MEDIA_CACHE_MS,
      });
      
      // 3. Update Local State
      setProfileData((prev) => {
        if (!prev) return prev;
        const next = { ...prev, cover_url: publicUrl } as ProfileRow;
        try {
          localStorage.setItem(`${PROFILE_CACHE_PREFIX}${targetUserId}`, JSON.stringify(next));
        } catch {}
        return next;
      });
      window.dispatchEvent(new CustomEvent('jzone:profile-changed'));
    } catch (e) {
      const msg = typeof (e as any)?.message === 'string' ? (e as any).message : '';
      console.error('Upload failed', e);
      feedback.error(msg || '上传失败：请检查存储服务配置后重试');
    }
  };

  const handleStatusSelect = async (status: { emoji: string; text: string }) => {
    setIsStatusSelectorOpen(false);
    if (!targetUserId) return;
    try {
      await supabaseApi.updateProfile(targetUserId, { 
        status_text: status.text,
        status_emoji: status.emoji 
      });
      setProfileData((prev) => {
        if (!prev) return prev;
        const next = { ...prev, status_text: status.text, status_emoji: status.emoji } as ProfileRow;
        try {
          localStorage.setItem(`${PROFILE_CACHE_PREFIX}${targetUserId}`, JSON.stringify(next));
        } catch {}
        return next;
      });
      window.dispatchEvent(new CustomEvent('jzone:profile-changed'));
    } catch (e) {
      console.error(e);
      feedback.error('更新状态失败，请重试');
    }
  };

  const handleSettings = () => {
    setIsSettingsOpen(true);
  };

  const handleEditProfile = async (data: { nickname: string; signature: string; avatarBlob?: Blob }) => {
    if (!targetUserId) return;
    try {
        let avatarUrl = undefined;
        if (data.avatarBlob) {
            // 内容变化会生成新 key，配合现有签名 URL 缓存和 immutable 图片缓存，不会复用旧图。
            avatarUrl = await supabaseApi.uploadProfileImage(targetUserId, data.avatarBlob, 'avatars', 'avatar.jpg');
        }

        await supabaseApi.updateProfile(targetUserId, {
            nickname: data.nickname,
            signature: data.signature,
            ...(avatarUrl ? { avatar_url: avatarUrl } : {})
        });
        
        // Optimistic update
        setProfileData((prev) => {
          const base = prev ?? ({
            id: targetUserId,
            nickname: null,
            avatar_url: null,
            cover_url: null,
            signature: null,
            background_style: 'half',
            followers_count: 0,
            following_count: 0,
          } satisfies ProfileRow);
          const next = {
            ...base,
            nickname: data.nickname,
            signature: data.signature,
            ...(avatarUrl ? { avatar_url: avatarUrl } : {})
          } as ProfileRow;
          try {
            localStorage.setItem(`${PROFILE_CACHE_PREFIX}${targetUserId}`, JSON.stringify(next));
          } catch {}
          return next;
        });
        if (avatarUrl) {
          const signedAvatarUrl = await supabaseApi.createSignedAvatarUrl(avatarUrl, 3600).catch(() => avatarUrl);
          setResolvedAvatarUrl(signedAvatarUrl);
          writeProfileMediaCache(targetUserId, {
            ...readProfileMediaCache(targetUserId),
            avatarRaw: avatarUrl,
            avatarUrl: signedAvatarUrl,
            expiresAt: Date.now() + PROFILE_MEDIA_CACHE_MS,
          });
        }
        window.dispatchEvent(new CustomEvent('jzone:profile-changed'));
        
        // Refresh global user metadata if it's the current user (optional, if AuthProvider relies on it)
        // For now, local state update is sufficient for visual feedback
    } catch (err) {
        const msg = typeof (err as any)?.message === 'string' ? (err as any).message : '';
        console.error('Failed to update profile:', err);
        feedback.error(msg || '保存失败：请检查存储服务配置后重试');
    }
  };

  const handleBlurChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const newVal = Number(e.target.value);
      setBackgroundBlur(newVal);
      
      // Debounced save
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
      blurTimeoutRef.current = setTimeout(async () => {
          if (targetUserId) {
              await supabaseApi.updateProfile(targetUserId, { background_blur: newVal / 100 });
              setProfileData((prev) => (prev ? { ...prev, background_blur: newVal / 100 } : prev));
              try {
                const cachedRaw = localStorage.getItem(`${PROFILE_CACHE_PREFIX}${targetUserId}`);
                const cached = cachedRaw ? (JSON.parse(cachedRaw) as ProfileRow) : null;
                if (cached) {
                  cached.background_blur = newVal / 100;
                  localStorage.setItem(`${PROFILE_CACHE_PREFIX}${targetUserId}`, JSON.stringify(cached));
                }
              } catch {}
          }
      }, 500);
  };

  const getQQAvatar = (email?: string) => {
    if (!email) return undefined;
    const match = email.match(/^(\d+)@qq\.com$/);
    if (match) {
        return `https://q1.qlogo.cn/g?b=qq&nk=${match[1]}&s=100`;
    }
    return undefined;
  };

  // Resolve raw avatar/cover to signed URLs
  useEffect(() => {
    let cancelled = false;
    const resolve = async (raw: string | null | undefined, kind: 'avatar' | 'cover') => {
      // If no raw URL, check for QQ fallback immediately
      if (!raw) {
          if (kind === 'avatar' && isCurrentUser && user?.email) {
              return getQQAvatar(user.email);
          }
          return undefined;
      }
      
      try {
        if (kind === 'avatar') return await supabaseApi.createSignedAvatarUrl(raw, 3600);
        return await supabaseApi.createSignedCoverUrl(raw, 3600);
      } catch {
        return raw;
      }
    };

    (async () => {
      const rawAvatar = profileData?.avatar_url
        ?? (isCurrentUser ? currentArtistProfile.profile?.avatar_url : undefined)
        ?? (isCurrentUser ? (user?.user_metadata?.avatar_url as string | undefined) : undefined);
      const rawCover = profileData?.cover_url ?? (isCurrentUser ? (user?.user_metadata?.cover_url as string | undefined) : undefined);
      const cached = readProfileMediaCache(targetUserId);

      if (cached && cached.avatarRaw === rawAvatar && cached.avatarUrl) setResolvedAvatarUrl(cached.avatarUrl);
      else if (!rawAvatar && isCurrentUser && currentArtistProfile.resolvedAvatarUrl) {
        setResolvedAvatarUrl(currentArtistProfile.resolvedAvatarUrl);
      }
      if (cached && cached.coverRaw === rawCover && cached.coverUrl) setResolvedCoverUrl(cached.coverUrl);

      const avatarPromise = cached && cached.avatarRaw === rawAvatar && cached.avatarUrl
        ? Promise.resolve(cached.avatarUrl)
        : resolve(rawAvatar, 'avatar');
      const coverPromise = cached && cached.coverRaw === rawCover && cached.coverUrl
        ? Promise.resolve(cached.coverUrl)
        : resolve(rawCover, 'cover');

      const [avatar, cover] = await Promise.all([avatarPromise, coverPromise]);
      if (cancelled) return;
      setResolvedAvatarUrl(avatar || (isCurrentUser ? currentArtistProfile.resolvedAvatarUrl : undefined));
      setResolvedCoverUrl(cover);
      if (targetUserId) {
        writeProfileMediaCache(targetUserId, {
          avatarRaw: rawAvatar,
          avatarUrl: avatar || (isCurrentUser ? currentArtistProfile.resolvedAvatarUrl : undefined),
          coverRaw: rawCover,
          coverUrl: cover,
          expiresAt: Date.now() + PROFILE_MEDIA_CACHE_MS,
        });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [currentArtistProfile.profile?.avatar_url, currentArtistProfile.resolvedAvatarUrl, profileData?.avatar_url, profileData?.cover_url, user?.user_metadata?.avatar_url, user?.user_metadata?.cover_url, isCurrentUser, targetUserId, user?.email]);

  // Construct display user object from DB profile or Fallback
  const displayUser = {
    id: targetUserId || 'guest',
    nickname: profileData?.nickname || (isCurrentUser ? currentArtistProfile.displayName : undefined) || user?.user_metadata?.nickname || 'JZone 用户',
    avatarUrl: resolvedAvatarUrl || (isCurrentUser ? currentArtistProfile.resolvedAvatarUrl : undefined),
    coverUrl: resolvedCoverUrl || (isCurrentUser ? user?.user_metadata?.cover_url : undefined),
    signature: profileData?.signature || user?.user_metadata?.signature,
    backgroundStyle: profileData?.background_style || (isCurrentUser ? user?.user_metadata?.background_style : undefined) || 'half',
    backgroundBlur: backgroundBlur / 100,
    avatarFrameId: profileData?.avatar_frame_id ?? null,
    followersCount: profileData?.followers_count || 0,
    followingCount: profileData?.following_count || 0,
    titleText: profileData?.title_text || '音乐人',
    titleStyle: profileData?.title_style || 'default',
    statusText: profileData?.status_text,
    statusEmoji: profileData?.status_emoji,
  };

  // Filter songs uploaded by this user
  // In real app: fetch songs by owner_id from DB
  const myUploads = songs.filter((s) => (s.ownerId ? s.ownerId === targetUserId : s.uploadedBy === 'Me')); 
  const favoriteSongs = favoriteSongIds
    .map((id) => songs.find((song) => song.id === id))
    .filter((song): song is (typeof songs)[number] => Boolean(song));
 
  const blurPx = Math.round((backgroundBlur / 100) * 40);
  const hasCustomCover = !!displayUser.coverUrl;
  const viewportW = typeof window !== 'undefined' ? window.innerWidth || 390 : 390;
  const viewportH = typeof window !== 'undefined' ? window.innerHeight || 844 : 844;
  const bannerAspect = displayUser.backgroundStyle === 'full' ? viewportW / viewportH : viewportW / 360;
  const previewHeightClass = displayUser.backgroundStyle === 'full' ? 'h-[140px]' : 'h-[180px]';
  const myAlbums = collections.filter((c) => c.type === 'album');
  const myPlaylists = collections.filter((c) => c.type === 'playlist');

  return (
    <div
      className={`min-h-screen relative transition-colors duration-500 ${displayUser.backgroundStyle === 'full' ? 'bg-black/30' : 'bg-black'}`}
      data-profile-page="true"
    >
      
      {/* Full Screen Background Layer */}
      {displayUser.backgroundStyle === 'full' && (
        <div className="fixed inset-0 z-0">
            {(!hasCustomCover && blurPx === 0) ? (
              <div className="w-full h-full bg-black" />
            ) : (
              <img 
                  src={displayUser.coverUrl || displayUser.avatarUrl || "https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?q=80&w=2670&auto=format&fit=crop"} 
                  className="w-full h-full object-cover scale-125"
                  data-testid="profile-immersive-background"
                  data-profile-background-visual="true"
                  style={{
                    filter: `blur(${blurPx}px)`,
                    opacity: hasCustomCover ? 0.75 : 0.6,
                    willChange: 'filter, opacity',
                    backfaceVisibility: 'hidden',
                  }}
                  alt="Immersive Background"
              />
            )}
            <div className="absolute inset-0 bg-black/40" />
        </div>
      )}

      <div className="relative z-10">
        <ProfileHeader 
            user={displayUser} 
            isCurrentUser={isCurrentUser} 
            onBack={onBack}
            onSettings={handleSettings}
            onEditProfile={handleEditProfile}
            onAvatarFrameOpen={() => window.dispatchEvent(new CustomEvent('jzone:navigate-personalization', { detail: { section: 'avatar' } }))}
            onStatusClick={() => setIsStatusSelectorOpen(true)}
        />

        {isCurrentUser && (
          <PersonalizationEntry
            onOpen={() => window.dispatchEvent(new CustomEvent('jzone:navigate-personalization'))}
          />
        )}

        {/* Sticky Tabs */}
        <div className={`sticky top-0 z-30 border-b border-white/5 transition-all duration-300 ${displayUser.backgroundStyle === 'full' ? 'bg-black/20 backdrop-blur-md' : 'bg-black/80 backdrop-blur-xl'}`}>
            <div className="flex items-center px-6">
                <button 
                    onClick={() => setActiveTab('creation')}
                    className={`relative py-4 px-2 mr-6 text-sm font-bold transition-colors ${activeTab === 'creation' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                    创作
                    {activeTab === 'creation' && (
                        <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-white rounded-full" />
                    )}
                </button>
                <button 
                    onClick={() => setActiveTab('collection')}
                    className={`relative py-4 px-2 mr-6 text-sm font-bold transition-colors ${activeTab === 'collection' ? 'text-white' : 'text-zinc-500 hover:text-zinc-300'}`}
                >
                    收藏
                    {activeTab === 'collection' && (
                        <motion.div layoutId="activeTab" className="absolute bottom-0 left-0 right-0 h-0.5 bg-white rounded-full" />
                    )}
                </button>
            </div>
        </div>

        <div className="pt-6">
            <ProfileContent
              activeTab={activeTab}
              activeSubTab={activeSubTab}
              setActiveSubTab={setActiveSubTab}
              myUploads={myUploads}
              favoriteSongs={favoriteSongs}
              myAlbums={myAlbums}
              myPlaylists={myPlaylists}
              collectionsLoading={collectionsLoading}
              isCurrentUser={isCurrentUser}
              playContext={playContext}
              onSongContextMenu={(anchor, song) => setContextMenu({ isOpen: true, anchor, item: song })}
              onCollectionContextMenu={(anchor, collection) => setCollectionMenu({ isOpen: true, anchor, item: collection })}
              onCreateCollection={(type) => {
                setCreateType(type);
                setCreateModalOpen(true);
              }}
              selectedSongId={contextMenu?.item.id}
              selectedCollectionId={collectionMenu?.item.id}
            />
        </div>
      </div>

      {/* Easter Egg Modal */}
      <AnimatePresence>
        {showEasterEgg && (
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 z-[250] flex items-center justify-center p-6 pointer-events-none"
          >
            <div className="bg-zinc-900/90 backdrop-blur-xl border border-white/10 p-6 rounded-2xl shadow-2xl flex flex-col items-center gap-4 max-w-xs text-center pointer-events-auto">
              <div className="w-16 h-16 bg-gradient-to-tr from-pink-500 to-purple-500 rounded-full flex items-center justify-center text-3xl animate-bounce">
                🍬
              </div>
              <div>
                <h3 className="text-lg font-bold text-white mb-1">小可爱，真聪明</h3>
                <p className="text-zinc-400 text-sm">明天过来上班~</p>
              </div>
              <button 
                onClick={() => setShowEasterEgg(false)}
                className="px-6 py-2 bg-white text-black font-bold rounded-full text-sm hover:bg-zinc-200 transition"
              >
                收下 Offer
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <ImageCropperModal
        isOpen={cropperState.isOpen}
        onClose={() => setCropperState({ isOpen: false, imageSrc: null })}
        imageSrc={cropperState.imageSrc || ''}
        onCropComplete={handleCropComplete}
        mode="banner"
        aspectOverride={cropperState.aspectOverride}
      />

      <StatusSelector
        isOpen={isStatusSelectorOpen}
        onClose={() => setIsStatusSelectorOpen(false)}
        currentStatus={{
            text: displayUser.statusText || undefined,
            emoji: displayUser.statusEmoji || undefined
        }}
        onSelect={handleStatusSelect}
      />

      <AnimatePresence>
        {isBackgroundManagerOpen && (
          <ProfileBackgroundSheet
            displayUser={displayUser}
            profileData={profileData}
            targetUserId={targetUserId}
            profileCachePrefix={PROFILE_CACHE_PREFIX}
            previewHeightClass={previewHeightClass}
            blurPx={blurPx}
            onClose={() => setIsBackgroundManagerOpen(false)}
            onPickFile={handleFileChange}
            setProfileData={setProfileData}
          />
        )}
      </AnimatePresence>

      {/* Settings Bottom Sheet */}
      <AnimatePresence>
        {isSettingsOpen && (
          <ProfileSettingsSheet
            backgroundBlur={backgroundBlur}
            onBlurChange={handleBlurChange}
            onClose={() => setIsSettingsOpen(false)}
            onEditProfile={() => {
              setIsSettingsOpen(false);
              document.getElementById('trigger-edit-profile')?.click();
            }}
            onOpenBackground={() => {
              setIsSettingsOpen(false);
              setIsBackgroundManagerOpen(true);
            }}
            onOpenMediaGovernance={() => {
              setIsSettingsOpen(false);
              window.dispatchEvent(new CustomEvent('jzone:navigate-media-governance'));
            }}
            onSignOut={async () => {
              setIsSettingsOpen(false);
              await signOut();
            }}
          />
        )}
      </AnimatePresence>

      {contextMenu && (
        <UniversalContextMenu 
            isOpen={contextMenu.isOpen} 
            onClose={() => setContextMenu(null)} 
            anchorPosition={contextMenu.anchor} 
            item={contextMenu.item} 
            type="song"
        />
      )}

      {collectionMenu && collectionMenu.item && (
        <CollectionContextMenu
          isOpen={collectionMenu.isOpen}
          onClose={() => setCollectionMenu(null)}
          anchorPosition={collectionMenu.anchor}
          collection={collectionMenu.item}
          canManageCollection={isCurrentUser}
          onToggleVisibility={(next) => {
            supabaseApi
              .setCollectionVisibility(collectionMenu.item.id, next)
              .then(() => {
                setCollections((prev) => prev.map((c) => (c.id === collectionMenu.item.id ? { ...c, visibility: next } : c)));
              })
              .catch((e: any) => feedback.error(typeof e?.message === 'string' ? e.message : '操作失败'));
          }}
          onEdit={() => {
             setEditCollectionTarget(collectionMenu.item);
             setEditCollectionOpen(true);
          }}
          onDelete={() => {
             if (window.confirm(`确定要删除 "${collectionMenu.item.title}" 吗？此操作不可恢复。`)) {
                 supabaseApi.deleteCollection(collectionMenu.item.id)
                    .then(() => {
                        setCollections(prev => prev.filter(c => c.id !== collectionMenu.item.id));
                    })
                    .catch((e: any) => feedback.error(typeof e?.message === 'string' ? e.message : '删除失败'));
             }
          }}
          onTogglePin={() => {
             const nextPinnedAt = collectionMenu.item.pinned_at ? null : new Date().toISOString();
             supabaseApi.updateCollection(collectionMenu.item.id, { pinnedAt: nextPinnedAt })
                .then(() => {
                    setCollections(prev => prev.map(c => c.id === collectionMenu.item.id ? { ...c, pinned_at: nextPinnedAt } : c));
                })
                .catch((e: any) => feedback.error(typeof e?.message === 'string' ? e.message : '操作失败'));
          }}
        />
      )}

      {editCollectionTarget && (
        <EditCollectionModal 
            isOpen={editCollectionOpen}
            collection={editCollectionTarget}
            onClose={() => {
                setEditCollectionOpen(false);
                setEditCollectionTarget(null);
            }}
            onSuccess={() => {
                // Refresh list
                if (targetUserId) {
                    supabaseApi.fetchCollectionsByCreator(targetUserId, undefined, 50, user?.id).then(setCollections);
                }
            }}
        />
      )}

      <CreateCollectionModal
        isOpen={createModalOpen && isCurrentUser}
        type={createType}
        onClose={() => setCreateModalOpen(false)}
        onCreated={() => {
          if (!targetUserId) return;
          supabaseApi.fetchCollectionsByCreator(targetUserId, undefined, 50, user?.id).then(setCollections).catch(() => {});
        }}
      />
    </div>
  );
};
