import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ProfileHeader } from '../components/ProfileHeader';
import { useAuth } from '../auth';
import { useStore } from '../store';
import { Icons } from '../components/Icons';
import { CollectionRow, supabaseApi, ProfileRow } from '../supabaseApi';
import { cosClient } from '../cosClient';
import { useModalPresence } from '../modalPresence';
import { AvatarFrameModal } from '../components/AvatarFrameModal';

import { StatusSelector } from '../components/StatusSelector';
import { ImageCropperModal } from '../components/ImageCropperModal';
import { UniversalContextMenu } from '../components/UniversalContextMenu';
import { CollectionContextMenu } from '../components/CollectionContextMenu';
import { EditCollectionModal } from '../components/EditCollectionModal';
import { Song } from '../types';
import { CreateCollectionModal } from '../components/CreateCollectionModal';

interface ProfileProps {
  userId?: string; // If undefined, show current user
  onBack?: () => void;
}

export const Profile: React.FC<ProfileProps> = ({ userId, onBack }) => {
  const { user, signOut } = useAuth();
  const { songs, playSong, favoriteSongIds } = useStore();
  const PROFILE_CACHE_PREFIX = 'jzone_profile_cache_v1:';
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

  // Determine if we are viewing the current user
  const isCurrentUser = !userId || (user && user.id === userId);
  const targetUserId = userId || user?.id;

  // Fetch profile data on mount or userId change
  useEffect(() => {
    async function loadProfile() {
      if (!targetUserId) return;

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
      try {
        const data = await supabaseApi.fetchProfile(targetUserId);
        setProfileData(data);
        if (typeof data?.background_blur === 'number') {
          setBackgroundBlur(data.background_blur * 100);
        }
        try {
          if (data) localStorage.setItem(`${PROFILE_CACHE_PREFIX}${targetUserId}`, JSON.stringify(data));
        } catch {}
      } catch (error) {
        console.error('Error loading profile:', error);
      } finally {
        setIsLoading(false);
      }
    }
    loadProfile();
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isBackgroundManagerOpen, setIsBackgroundManagerOpen] = useState(false);
  const [isAvatarFrameOpen, setIsAvatarFrameOpen] = useState(false);
  const [isStatusSelectorOpen, setIsStatusSelectorOpen] = useState(false);
  const [resolvedAvatarUrl, setResolvedAvatarUrl] = useState<string | undefined>(undefined);
  const [resolvedCoverUrl, setResolvedCoverUrl] = useState<string | undefined>(undefined);
  const [contextMenu, setContextMenu] = useState<{ isOpen: boolean; anchor?: { x: number; y: number }; item: Song } | null>(null);
  const [collectionMenu, setCollectionMenu] = useState<{ isOpen: boolean; anchor?: { x: number; y: number }; item: CollectionRow } | null>(null);
  
  // Easter Egg State
  const [showEasterEgg, setShowEasterEgg] = useState(false);

  useModalPresence(isSettingsOpen);
  useModalPresence(isBackgroundManagerOpen);
  useModalPresence(isAvatarFrameOpen);
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
      // 1. Upload to COS
      // Upload
      const publicUrl = await supabaseApi.uploadProfileImage(targetUserId, blob, 'covers', 'background.jpg');

      // 2. Update DB
      await supabaseApi.updateProfile(targetUserId, { cover_url: publicUrl });
      
      // 3. Update Local State
      setProfileData((prev) => {
        if (!prev) return prev;
        const next = { ...prev, cover_url: publicUrl } as ProfileRow;
        try {
          localStorage.setItem(`${PROFILE_CACHE_PREFIX}${targetUserId}`, JSON.stringify(next));
        } catch {}
        return next;
      });
    } catch (e) {
      const msg = typeof (e as any)?.message === 'string' ? (e as any).message : '';
      console.error('Upload failed', e);
      alert(msg || '上传失败：请检查腾讯云 COS 是否欠费、密钥权限与 Bucket 区域配置');
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
    } catch (e) {
      console.error(e);
      alert('更新状态失败，请重试');
    }
  };

  const handleSettings = () => {
    setIsSettingsOpen(true);
  };

  const handleAvatarFrameSave = async (frameId: string | null) => {
    if (!targetUserId) return;
    try {
      await supabaseApi.updateProfile(targetUserId, { avatar_frame_id: frameId });
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
        const next = { ...base, avatar_frame_id: frameId } as ProfileRow;
        try {
          localStorage.setItem(`${PROFILE_CACHE_PREFIX}${targetUserId}`, JSON.stringify(next));
        } catch {}
        return next;
      });
    } catch (e) {
      console.error(e);
      alert('保存失败，请重试');
      throw e;
    }
  };

  const handleEditProfile = async (data: { nickname: string; signature: string; avatarBlob?: Blob }) => {
    if (!targetUserId) return;
    try {
        let avatarUrl = undefined;
        if (data.avatarBlob) {
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
        
        // Refresh global user metadata if it's the current user (optional, if AuthProvider relies on it)
        // For now, local state update is sufficient for visual feedback
    } catch (err) {
        const msg = typeof (err as any)?.message === 'string' ? (err as any).message : '';
        console.error('Failed to update profile:', err);
        alert(msg || '保存失败：请检查腾讯云 COS 是否欠费、密钥权限与 Bucket 区域配置');
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

  useEffect(() => {
    let cancelled = false;
    const resolve = async (raw: string | null | undefined, kind: 'avatar' | 'cover') => {
      if (!raw) return undefined;
      try {
        if (kind === 'avatar') return await supabaseApi.createSignedAvatarUrl(raw, 3600);
        return await supabaseApi.createSignedCoverUrl(raw, 3600);
      } catch {
        return raw;
      }
    };

    (async () => {
      const rawAvatar = profileData?.avatar_url ?? (isCurrentUser ? (user?.user_metadata?.avatar_url as string | undefined) : undefined) ?? undefined;
      const rawCover = profileData?.cover_url ?? (isCurrentUser ? (user?.user_metadata?.cover_url as string | undefined) : undefined) ?? undefined;

      const [avatar, cover] = await Promise.all([resolve(rawAvatar, 'avatar'), resolve(rawCover, 'cover')]);
      if (cancelled) return;
      setResolvedAvatarUrl(avatar);
      setResolvedCoverUrl(cover);
    })();

    return () => {
      cancelled = true;
    };
  }, [profileData?.avatar_url, profileData?.cover_url, user?.user_metadata?.avatar_url, user?.user_metadata?.cover_url, isCurrentUser]);

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
      const rawAvatar = profileData?.avatar_url ?? (isCurrentUser ? (user?.user_metadata?.avatar_url as string | undefined) : undefined);
      const rawCover = profileData?.cover_url ?? (isCurrentUser ? (user?.user_metadata?.cover_url as string | undefined) : undefined);

      const [avatar, cover] = await Promise.all([resolve(rawAvatar, 'avatar'), resolve(rawCover, 'cover')]);
      if (cancelled) return;
      setResolvedAvatarUrl(avatar);
      setResolvedCoverUrl(cover);
    })();

    return () => {
      cancelled = true;
    };
  }, [profileData?.avatar_url, profileData?.cover_url, user?.user_metadata?.avatar_url, user?.user_metadata?.cover_url, isCurrentUser, user?.email]);

  // Construct display user object from DB profile or Fallback
  const displayUser = {
    id: targetUserId || 'guest',
    nickname: profileData?.nickname || user?.user_metadata?.nickname || 'JZone 用户',
    avatarUrl: resolvedAvatarUrl, // Already resolved including fallback
    coverUrl: resolvedCoverUrl || (isCurrentUser ? user?.user_metadata?.cover_url : undefined),
    signature: profileData?.signature || user?.user_metadata?.signature,
    backgroundStyle: profileData?.background_style || 'half',
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

  const handleCollectionLongPress = (e: React.TouchEvent | React.MouseEvent, collection: CollectionRow) => {
     if (!isCurrentUser) return;
     // If touch event, prevent default to stop context menu
     // Logic handled by touch handlers usually, but here we invoke menu
     // e.preventDefault(); 
     // We need clientX/Y. For touch, it's e.touches[0]
     let clientX, clientY;
     if ('touches' in e) {
         clientX = e.touches[0].clientX;
         clientY = e.touches[0].clientY;
     } else {
         clientX = (e as React.MouseEvent).clientX;
         clientY = (e as React.MouseEvent).clientY;
     }
     setCollectionMenu({ isOpen: true, anchor: { x: clientX, y: clientY }, item: collection });
  };

  const renderContent = () => {
    return (
        <AnimatePresence mode="wait">
            <motion.div
                key={activeTab}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.2 }}
                className="min-h-[400px]"
            >
                {activeTab === 'creation' && (
                    <div className="grid grid-cols-1 gap-4 pb-32">
                        {/* Sub-tabs for Creation */}
                        <div className="flex gap-4 px-6 overflow-x-auto no-scrollbar justify-center">
                            {[
                                { id: 'uploads', label: '收录', count: myUploads.length },
                                { id: 'albums', label: '专辑', count: myAlbums.length },
                                { id: 'playlists', label: '歌单', count: myPlaylists.length }
                            ].map(sub => (
                                <button 
                                    key={sub.id}
                                    onClick={() => setActiveSubTab(sub.id)}
                                    className={`px-3 py-1 text-sm font-bold transition-colors relative group ${activeSubTab === sub.id ? 'text-white' : 'text-white/40 hover:text-white/60'}`}
                                >
                                    <span className="relative inline-block pr-3">
                                        {sub.label}
                                        <sup className="absolute top-[2px] right-0 text-[10px] leading-none opacity-80">{sub.count}</sup>
                                    </span>
                                </button>
                            ))}
                        </div>

                        {/* Content based on Sub-tab */}
                        {activeSubTab === 'uploads' && (
                             <div className="px-6 space-y-2">
                                {myUploads.map((song) => (
                                    <button
                                        key={song.id}
                                        onClick={() => playSong(song.id)}
                                        onContextMenu={(e) => { e.preventDefault(); setContextMenu({ isOpen: true, anchor: { x: e.clientX, y: e.clientY }, item: song }); }}
                                        className="w-full flex items-center gap-3 p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition active:scale-[0.98] text-left"
                                    >
                                        <div className="relative">
                                            <img src={song.coverUrl} loading="lazy" decoding="async" className="w-12 h-12 rounded-lg object-cover shadow-lg" alt={song.title} />
                                            {song.pinnedAt && (
                                                <div className="absolute -top-1 -right-1 bg-red-500 rounded-full p-[2px] border border-black">
                                                    <Icons.Pin size={8} className="text-white" fill="currentColor" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-white font-medium truncate">
                                                {song.title}
                                                {song.isPublic === false && <Icons.Lock size={12} className="inline ml-1 text-zinc-500" />}
                                            </h4>
                                            <p className="text-zinc-400 text-xs truncate">{song.artist}</p>
                                        </div>
                                        <div className="text-zinc-500 text-xs font-mono">{song.playsCount || 0} plays</div>
                                    </button>
                                ))}
                                {myUploads.length === 0 && (
                                    <div className="py-12 text-center text-zinc-500 text-sm">
                                        还没有上传过音乐
                                    </div>
                                )}
                             </div>
                        )}
                        
                        {activeSubTab === 'albums' && (
                          <div className="px-6 space-y-2">
                            {collectionsLoading ? (
                              <div className="py-12 text-center text-zinc-500 text-sm">加载中…</div>
                            ) : myAlbums.length ? (
                              myAlbums.map((c) => (
                                    <button
                                      key={c.id}
                                      onClick={() => window.dispatchEvent(new CustomEvent('jzone:navigate-collection', { detail: { id: c.id } }))}
                                      onContextMenu={(e) => {
                                         e.preventDefault();
                                         handleCollectionLongPress(e, c);
                                      }}
                                      className="w-full flex items-center gap-3 p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition active:scale-[0.98] text-left relative"
                                    >
                                      <div className="w-12 h-12 rounded-xl overflow-hidden bg-zinc-800 shrink-0 relative">
                                        {c.cover_url ? <img src={c.cover_url} className="w-full h-full object-cover" alt="" loading="lazy" decoding="async" /> : null}
                                      </div>
                                      <div className="flex-1 min-w-0">
                                        <div className="text-white font-bold truncate flex items-center gap-2">
                                            {c.title}
                                            {c.pinned_at && (
                                                <Icons.Pin size={12} className="text-red-500 fill-red-500" />
                                            )}
                                        </div>
                                        <div className="text-zinc-500 text-xs font-medium truncate">{c.visibility === 'public' ? '公开' : '私有'}</div>
                                      </div>
                                      <Icons.ChevronRight size={16} className="text-white/20" />
                                    </button>
                                  ))
                            ) : isCurrentUser ? (
                              <div className="py-16 text-center flex flex-col items-center gap-4">
                                <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center text-zinc-600">
                                  <Icons.Disc size={28} />
                                </div>
                                <p className="text-zinc-500 font-medium">还没有创建专辑</p>
                                <button
                                  onClick={() => {
                                    setCreateType('album');
                                    setCreateModalOpen(true);
                                  }}
                                  className="px-6 py-2 bg-white/10 rounded-full text-white text-sm font-bold"
                                >
                                  新建专辑
                                </button>
                              </div>
                            ) : (
                              <div className="py-12 text-center text-zinc-500 text-sm">暂无内容</div>
                            )}
                          </div>
                        )}

                        {activeSubTab === 'playlists' && (
                          <div className="px-6 space-y-2">
                            {collectionsLoading ? (
                              <div className="py-12 text-center text-zinc-500 text-sm">加载中…</div>
                            ) : myPlaylists.length ? (
                              myPlaylists.map((c) => (
                                <button
                                  key={c.id}
                                  onClick={() => window.dispatchEvent(new CustomEvent('jzone:navigate-collection', { detail: { id: c.id } }))}
                                  onContextMenu={(e) => {
                                      e.preventDefault();
                                      handleCollectionLongPress(e, c);
                                  }}
                                  className="w-full flex items-center gap-3 p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition active:scale-[0.98] text-left relative"
                                >
                                  <div className="w-12 h-12 rounded-xl overflow-hidden bg-zinc-800 shrink-0 relative">
                                    {c.cover_url ? <img src={c.cover_url} className="w-full h-full object-cover" alt="" loading="lazy" decoding="async" /> : null}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <div className="text-white font-bold truncate flex items-center gap-2">
                                        {c.title}
                                        {c.pinned_at && (
                                            <Icons.Pin size={12} className="text-red-500 fill-red-500" />
                                        )}
                                    </div>
                                    <div className="text-zinc-500 text-xs font-medium truncate">
                                      {c.visibility === 'public' ? '公开' : '私有'} · {(c.play_count ?? 0).toLocaleString()}次播放
                                    </div>
                                  </div>
                                  <Icons.ChevronRight size={16} className="text-white/20" />
                                </button>
                              ))
                            ) : isCurrentUser ? (
                              <div className="py-16 text-center flex flex-col items-center gap-4">
                                <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center text-zinc-600">
                                  <Icons.ListMusic size={28} />
                                </div>
                                <p className="text-zinc-500 font-medium">还没有创建歌单</p>
                                <button
                                  onClick={() => {
                                    setCreateType('playlist');
                                    setCreateModalOpen(true);
                                  }}
                                  className="px-6 py-2 bg-white/10 rounded-full text-white text-sm font-bold"
                                >
                                  新建歌单
                                </button>
                              </div>
                            ) : (
                              <div className="py-12 text-center text-zinc-500 text-sm">暂无内容</div>
                            )}
                          </div>
                        )}
                    </div>
                )}

                {activeTab === 'collection' && (
                    <div className="grid grid-cols-1 gap-4 pb-32">
                         {favoriteSongs.length > 0 ? (
                            <div className="px-6 space-y-2">
                                {favoriteSongs.map((song) => (
                                    <button
                                        key={song.id}
                                        onClick={() => playSong(song.id)}
                                        onContextMenu={(e) => { e.preventDefault(); setContextMenu({ isOpen: true, anchor: { x: e.clientX, y: e.clientY }, item: song }); }}
                                        className="w-full flex items-center gap-3 p-3 bg-white/5 hover:bg-white/10 rounded-2xl transition active:scale-[0.98] text-left"
                                    >
                                        <div className="relative">
                                            <img src={song.coverUrl} loading="lazy" decoding="async" className="w-12 h-12 rounded-lg object-cover shadow-lg" alt={song.title} />
                                            {song.pinnedAt && (
                                                <div className="absolute -top-1 -right-1 bg-red-500 rounded-full p-[2px] border border-black">
                                                    <Icons.Pin size={8} className="text-white" fill="currentColor" />
                                                </div>
                                            )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <h4 className="text-white font-medium truncate">
                                                {song.title}
                                                {song.isPublic === false && <Icons.Lock size={12} className="inline ml-1 text-zinc-500" />}
                                            </h4>
                                            <p className="text-zinc-400 text-xs truncate">{song.artist}</p>
                                        </div>
                                        <div className="text-zinc-500 text-xs font-mono">{song.playsCount || 0} plays</div>
                                    </button>
                                ))}
                             </div>
                         ) : (
                            <div className="px-6 py-20 text-center flex flex-col items-center gap-4">
                                <div className="w-16 h-16 bg-zinc-900 rounded-full flex items-center justify-center text-zinc-600">
                                    <Icons.Heart size={32} />
                                </div>
                                <p className="text-zinc-500 font-medium">还没有收藏任何内容</p>
                                <button 
                                    onClick={() => window.dispatchEvent(new CustomEvent('jzone:navigate-home'))}
                                    className="px-6 py-2 bg-white/10 rounded-full text-white text-sm font-bold"
                                >
                                    去发现
                                </button>
                            </div>
                         )}
                    </div>
                )}
            </motion.div>
        </AnimatePresence>
    );
  };

  return (
    <div className={`min-h-screen relative transition-colors duration-500 ${displayUser.backgroundStyle === 'full' ? 'bg-black/30' : 'bg-black'}`}>
      
      {/* Full Screen Background Layer */}
      {displayUser.backgroundStyle === 'full' && (
        <div className="fixed inset-0 z-0">
            {(!hasCustomCover && blurPx === 0) ? (
              <div className="w-full h-full bg-black" />
            ) : (
              <img 
                  src={displayUser.coverUrl || displayUser.avatarUrl || "https://images.unsplash.com/photo-1614850523459-c2f4c699c52e?q=80&w=2670&auto=format&fit=crop"} 
                  className="w-full h-full object-cover scale-125"
                  style={{ filter: `blur(${blurPx}px)`, opacity: hasCustomCover ? 0.75 : 0.6 }}
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
            onAvatarFrameOpen={() => setIsAvatarFrameOpen(true)}
            onStatusClick={() => setIsStatusSelectorOpen(true)}
        />

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
            {renderContent()}
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

      <AvatarFrameModal
        isOpen={isAvatarFrameOpen}
        onClose={() => setIsAvatarFrameOpen(false)}
        currentUser={{
          nickname: displayUser.nickname,
          avatarUrl: displayUser.avatarUrl,
          avatarFrameId: displayUser.avatarFrameId ?? null,
        }}
        onSave={async (frameId) => {
            if (!isCurrentUser) {
                setIsAvatarFrameOpen(false);
                setTimeout(() => setShowEasterEgg(true), 300);
                return;
            }
            await handleAvatarFrameSave(frameId);
        }}
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
          <div className="fixed inset-0 z-[60] flex items-end justify-center sm:items-center">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsBackgroundManagerOpen(false)}
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="relative w-full max-w-md max-h-[80vh] overflow-y-auto bg-zinc-900 border-t border-white/10 rounded-t-3xl sm:rounded-3xl p-6 pb-[calc(env(safe-area-inset-bottom)+24px)] space-y-5 shadow-2xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex justify-center">
                <div className="w-10 h-1 bg-zinc-700 rounded-full" />
              </div>

              <div className="flex items-center justify-between">
                <h3 className="text-lg font-bold text-white">自定义背景</h3>
                <button onClick={() => setIsBackgroundManagerOpen(false)} className="text-zinc-400 hover:text-white">
                  <Icons.X size={20} />
                </button>
              </div>

              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleFileChange}
              />

              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-sm font-medium text-zinc-400">背景风格</label>
                  <span className="text-sm font-bold text-white">{displayUser.backgroundStyle === 'full' ? '全屏模糊' : '半屏沉浸'}</span>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={async () => {
                      if (!targetUserId) return;
                      try {
                        await supabaseApi.updateProfile(targetUserId, { background_style: 'half' });
                        setProfileData((prev) => {
                          if (!prev) return prev;
                          const next = { ...prev, background_style: 'half' } as ProfileRow;
                          try {
                            localStorage.setItem(`${PROFILE_CACHE_PREFIX}${targetUserId}`, JSON.stringify(next));
                          } catch {}
                          return next;
                        });
                      } catch (e) {
                        console.error(e);
                        alert('设置失败，请重试');
                      }
                    }}
                    className={`w-full flex items-center justify-center py-3 rounded-xl border transition-all ${
                      displayUser.backgroundStyle !== 'full' ? 'bg-white text-black border-white' : 'bg-white/5 text-zinc-400 border-transparent hover:bg-white/10'
                    }`}
                  >
                    <span className="text-sm font-bold">半屏沉浸</span>
                  </button>
                  <button
                    onClick={async () => {
                      if (!targetUserId) return;
                      try {
                        await supabaseApi.updateProfile(targetUserId, { background_style: 'full' });
                        setProfileData((prev) => {
                          if (!prev) return prev;
                          const next = { ...prev, background_style: 'full' } as ProfileRow;
                          try {
                            localStorage.setItem(`${PROFILE_CACHE_PREFIX}${targetUserId}`, JSON.stringify(next));
                          } catch {}
                          return next;
                        });
                      } catch (e) {
                        console.error(e);
                        alert('设置失败，请重试');
                      }
                    }}
                    className={`w-full flex items-center justify-center py-3 rounded-xl border transition-all ${
                      displayUser.backgroundStyle === 'full' ? 'bg-white text-black border-white' : 'bg-white/5 text-zinc-400 border-transparent hover:bg-white/10'
                    }`}
                  >
                    <span className="text-sm font-bold">全屏模糊</span>
                  </button>
                </div>
              </div>

              <div
                className={`w-full ${previewHeightClass} rounded-2xl overflow-hidden bg-black/40 border border-white/10 cursor-pointer`}
                onClick={() => fileInputRef.current?.click()}
              >
                {displayUser.coverUrl ? (
                  <img
                    src={displayUser.coverUrl}
                    className="w-full h-full object-cover"
                    style={{ filter: `blur(${blurPx}px)` }}
                    alt="Custom Background"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-zinc-500 text-sm">
                    暂无自定义背景，点击上传
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full flex items-center justify-center py-3 rounded-xl bg-white/10 text-white font-bold hover:bg-white/15 transition"
                >
                  上传新背景
                </button>
                <button
                  disabled={!profileData?.cover_url}
                  onClick={async () => {
                    if (!targetUserId) return;
                    const raw = profileData?.cover_url;
                    setIsBackgroundManagerOpen(false);
                    try {
                      await supabaseApi.updateProfile(targetUserId, { cover_url: null });
                      if (raw && cosClient.isEnabled && !/^https?:\/\//i.test(raw)) {
                        await cosClient.deleteFiles([raw]).catch(() => {});
                      }
                      setProfileData((prev) => {
                        if (!prev) return prev;
                        const next = { ...prev, cover_url: null } as ProfileRow;
                        try {
                          localStorage.setItem(`${PROFILE_CACHE_PREFIX}${targetUserId}`, JSON.stringify(next));
                        } catch {}
                        return next;
                      });
                    } catch (e) {
                      console.error(e);
                      alert('恢复默认失败，请重试');
                    }
                  }}
                  className={`w-full flex items-center justify-center py-3 rounded-xl font-bold transition ${
                    profileData?.cover_url ? 'bg-white text-black hover:bg-white/90' : 'bg-white/5 text-white/30'
                  }`}
                >
                  恢复默认
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Settings Bottom Sheet */}
      <AnimatePresence>
        {isSettingsOpen && (
            <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setIsSettingsOpen(false)}
                    className="absolute inset-0 bg-black/60 backdrop-blur-sm"
                />
                <motion.div
                    initial={{ y: '100%' }}
                    animate={{ y: 0 }}
                    exit={{ y: '100%' }}
                    transition={{ type: "spring", damping: 25, stiffness: 300 }}
                    className="relative w-full max-w-md max-h-[80vh] overflow-y-auto bg-zinc-900 border-t border-white/10 rounded-t-3xl sm:rounded-3xl p-6 pb-[calc(env(safe-area-inset-bottom)+24px)] space-y-6 shadow-2xl"
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="flex justify-center mb-2">
                        <div className="w-10 h-1 bg-zinc-700 rounded-full" />
                    </div>
                    
                    <h3 className="text-lg font-bold text-white text-center">设置</h3>

                    <div className="space-y-4">
                        <div className="space-y-2">
                            <div className="flex justify-between items-center">
                                <label className="text-sm font-medium text-zinc-400">背景模糊度</label>
                                <span className="text-sm font-bold text-white">{backgroundBlur}%</span>
                            </div>
                            <input 
                                type="range" 
                                min="0" 
                                max="100" 
                                value={backgroundBlur} 
                                onChange={handleBlurChange}
                                className="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-white"
                            />
                        </div>

                        <div className="h-px bg-white/10" />

                        <button 
                            onClick={() => {
                                setIsSettingsOpen(false);
                                document.getElementById('trigger-edit-profile')?.click();
                            }}
                            className="w-full flex items-center justify-between p-4 bg-zinc-800/50 rounded-xl text-white font-medium hover:bg-zinc-800 transition"
                        >
                            <span>编辑资料</span>
                            <Icons.ChevronRight size={16} className="text-zinc-500" />
                        </button>

                        <button 
                             onClick={() => {
                               setIsSettingsOpen(false);
                               setIsBackgroundManagerOpen(true);
                             }}
                             className="w-full flex items-center justify-between p-4 bg-zinc-800/50 rounded-xl text-white font-medium hover:bg-zinc-800 transition"
                        >
                             <span>更换背景</span>
                             <div className="flex items-center gap-2">
                                <Icons.ChevronRight size={16} className="text-zinc-500" />
                             </div>
                        </button>
                        
                        <button 
                            onClick={async () => {
                                setIsSettingsOpen(false);
                                await signOut();
                            }}
                            className="w-full flex items-center justify-center p-4 bg-red-500/10 text-red-500 rounded-xl font-bold hover:bg-red-500/20 transition active:scale-95"
                        >
                            退出登录
                        </button>
                    </div>
                    
                    <button 
                        onClick={() => setIsSettingsOpen(false)}
                        className="w-full py-3 text-zinc-500 font-medium text-sm hover:text-white transition"
                    >
                        取消
                    </button>
                </motion.div>
            </div>
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
          isOwner={isCurrentUser}
          onToggleVisibility={(next) => {
            supabaseApi
              .setCollectionVisibility(collectionMenu.item.id, next)
              .then(() => {
                setCollections((prev) => prev.map((c) => (c.id === collectionMenu.item.id ? { ...c, visibility: next } : c)));
              })
              .catch((e: any) => alert(typeof e?.message === 'string' ? e.message : '操作失败'));
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
                    .catch((e: any) => alert(typeof e?.message === 'string' ? e.message : '删除失败'));
             }
          }}
          onTogglePin={() => {
             const nextPinnedAt = collectionMenu.item.pinned_at ? null : new Date().toISOString();
             supabaseApi.updateCollection(collectionMenu.item.id, { pinnedAt: nextPinnedAt })
                .then(() => {
                    setCollections(prev => prev.map(c => c.id === collectionMenu.item.id ? { ...c, pinned_at: nextPinnedAt } : c));
                })
                .catch((e: any) => alert(typeof e?.message === 'string' ? e.message : '操作失败'));
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
                    supabaseApi.fetchCollectionsByCreator(targetUserId).then(setCollections);
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
