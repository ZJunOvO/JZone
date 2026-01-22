import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { useAuth } from '../auth';
import { useStore } from '../store';
import { Song } from '../types';
import { CollectionRow, supabaseApi } from '../supabaseApi';
import { useModalPresence } from '../modalPresence';
import { Icons } from '../components/Icons';
import { CollectionBentoWall } from '../components/CollectionBentoWall';
import { SongPickerModal } from '../components/SongPickerModal';
import { CollectionContextMenu } from '../components/CollectionContextMenu';
import { EditCollectionModal } from '../components/EditCollectionModal';
import { extractAverageColor } from '../utils/extractAverageColor';

export const CollectionDetailPage: React.FC<{ collectionId: string; onClose: () => void }> = ({ collectionId, onClose }) => {
  useModalPresence(true);
  const { user } = useAuth();
  const store = useStore();
  const storeSongsRef = useRef(store.songs);
  useEffect(() => {
    storeSongsRef.current = store.songs;
  }, [store.songs]);

  const [loading, setLoading] = useState(true);
  const [collection, setCollection] = useState<CollectionRow | null>(null);
  const [creatorName, setCreatorName] = useState<string>('未知');
  const [creatorAvatarUrl, setCreatorAvatarUrl] = useState<string | null>(null);
  const [orderedSongs, setOrderedSongs] = useState<Song[]>([]);
  const [missingCount, setMissingCount] = useState(0);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | undefined>(undefined);
  const [bgColor, setBgColor] = useState<{ r: number; g: number; b: number } | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearchActive, setIsSearchActive] = useState(false);
  const [signedCoverUrl, setSignedCoverUrl] = useState<string | null>(null);
  const [showStickyTitle, setShowStickyTitle] = useState(false);

  const titleRef = useRef<HTMLDivElement>(null);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.currentTarget;
    const titleEl = titleRef.current;
    if (!titleEl) {
      if (target.scrollTop > 280) {
        if (!showStickyTitle) setShowStickyTitle(true);
      } else {
        if (showStickyTitle) setShowStickyTitle(false);
      }
      return;
    }

    const containerRect = target.getBoundingClientRect();
    const titleRect = titleEl.getBoundingClientRect();
    const headerHeight = store.playerState.currentSongId ? 120 : 72;
    const shouldShow = titleRect.bottom <= containerRect.top + headerHeight;

    if (shouldShow) {
      if (!showStickyTitle) setShowStickyTitle(true);
    } else {
      if (showStickyTitle) setShowStickyTitle(false);
    }
  };

  const isOwner = !!user && !!collection && collection.creator_id === user.id;

  const reload = useCallback(async (silent = false) => {
    if (!supabaseApi.isEnabled()) return;
    if (!silent) setLoading(true);
    try {
      const { collection: c, songs: songRows, relations, creatorProfile } = await supabaseApi.fetchCollection(collectionId);
      setCollection(c);

      const displayName = (creatorProfile?.nickname && creatorProfile.nickname.trim()) || (creatorProfile?.id ? `${creatorProfile.id.slice(0, 6)}…${creatorProfile.id.slice(-4)}` : '未知');
      setCreatorName(displayName);

      if (creatorProfile?.avatar_url) {
        try {
          const signed = await supabaseApi.createSignedAvatarUrl(creatorProfile.avatar_url);
          setCreatorAvatarUrl(signed);
        } catch {
          setCreatorAvatarUrl(null);
        }
      } else {
        setCreatorAvatarUrl(null);
      }

      const globalById = new Map<string, Song>(storeSongsRef.current.map((s) => [s.id, s]));
      const list: Song[] = [];
      for (const r of songRows) {
        const existing = globalById.get(r.id);
        if (existing) {
          list.push(existing);
          continue;
        }
        let coverUrl = null;
        if (r.cover_path) {
          try {
            coverUrl = await supabaseApi.createSignedCoverUrl(r.cover_path);
          } catch {}
        }
        const isPublic = typeof r.is_public === 'boolean' ? r.is_public : r.visibility !== 'private';
        list.push({
          id: r.id,
          title: r.title,
          artist: r.artist,
          album: r.album ?? undefined,
          genre: r.genre ?? undefined,
          story: r.story ?? undefined,
          fileSize: typeof r.file_size === 'number' ? r.file_size : undefined,
          coverUrl: coverUrl || `https://picsum.photos/seed/${r.id}/400/400`,
          audioUrl: '',
          audioPath: r.audio_path,
          coverPath: r.cover_path ?? undefined,
          visibility: isPublic ? 'public' : 'private',
          ownerId: r.owner_id,
          playsCount: typeof r.plays_count === 'number' ? r.plays_count : undefined,
          duration: r.duration,
          trimStart: r.trim_start,
          trimEnd: r.trim_end,
          uploadedBy: r.owner_id === user?.id ? 'Me' : 'Member',
          addedAt: new Date(r.created_at).getTime(),
          isPublic,
          pinnedAt: r.pinned_at ?? null,
        });
      }

      setOrderedSongs(list);
      const mc = Math.max(0, (relations?.length ?? 0) - list.length);
      setMissingCount(mc);

      const coverForColor = (c.cover_url && c.cover_url.trim()) || list[0]?.coverUrl;
      if (c.type === 'album' && coverForColor) {
        extractAverageColor(coverForColor).then((rgb) => setBgColor(rgb));
      } else {
        setBgColor(null);
      }
    } finally {
      if (!silent) setLoading(false);
    }
  }, [collectionId, user?.id]);

  useEffect(() => {
    reload(!!collection).catch(() => {});
  }, [reload]);

  // Update signed cover url when collection changes
  useEffect(() => {
    if (collection?.cover_url) {
        supabaseApi.createSignedCoverUrl(collection.cover_url).then(setSignedCoverUrl).catch(() => setSignedCoverUrl(null));
    } else {
        // Fallback to first song cover if no collection cover
        setSignedCoverUrl(orderedSongs[0]?.coverUrl || null);
    }
  }, [collection?.cover_url, orderedSongs]);

  const visibleCount = orderedSongs.length;

  const filteredSongs = useMemo(() => {
    if (!searchQuery.trim()) return orderedSongs;
    const q = searchQuery.toLowerCase().trim();
    return orderedSongs.filter(s => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q));
  }, [orderedSongs, searchQuery]);

  const canPickSongs = useMemo(() => {
    if (!collection) return [];
    const existingIds = new Set(orderedSongs.map((s) => s.id));
    const pool = collection.type === 'album' ? store.songs.filter((s) => s.ownerId && s.ownerId === user?.id) : store.songs;
    return pool.filter((s) => !existingIds.has(s.id));
  }, [collection, store.songs, user, orderedSongs]);

  const handleAddSongs = async (ids: string[]) => {
    if (!collection) return;
    try {
      await supabaseApi.addSongsToCollection(collection.id, ids);
      
      // Auto-set cover if missing
      if (!collection.cover_url && ids.length > 0) {
         const lastId = ids[ids.length - 1];
         const song = store.songs.find(s => s.id === lastId);
         if (song && song.coverPath) {
             await supabaseApi.updateCollection(collection.id, { coverUrl: song.coverPath });
         }
      }

      reload().catch(() => {});
    } catch (e: any) {
      const msg = typeof e?.message === 'string' ? e.message : '添加失败';
      alert(msg);
    }
  };

  const handlePlayAll = () => {
    if (!orderedSongs.length) return;
    if (collection) {
      store.playCollection(
        orderedSongs.map((s) => s.id),
        orderedSongs[0].id,
        { collectionId: collection.id, collectionType: collection.type }
      );
      if (collection.type === 'playlist') {
        setCollection((prev) => (prev ? { ...prev, play_count: (prev.play_count ?? 0) + 1 } : prev));
      }
      return;
    }
    store.playSong(orderedSongs[0].id);
  };

  const headerCover = signedCoverUrl;
  const bgStyle =
    collection?.type === 'album' && bgColor
      ? {
          background: `radial-gradient(100% 120% at 50% 0%, rgba(${bgColor.r},${bgColor.g},${bgColor.b},0.55) 0%, rgba(0,0,0,0.9) 60%, rgba(0,0,0,1) 100%)`,
        }
      : undefined;

  const hasActivePlayer = !!store.playerState.currentSongId;

  return (
    <div className="fixed inset-0 z-[150] bg-black">
      <div className="absolute inset-0 overflow-hidden">
        {collection?.type === 'album' ? (
          <div className="absolute inset-0" style={bgStyle} />
        ) : (
          <>
            {headerCover && <img src={headerCover} className="absolute inset-0 w-full h-full object-cover blur-[90px] brightness-[0.55] saturate-[1.6] scale-150" alt="" />}
            <div className="absolute inset-0 bg-gradient-to-t from-black via-black/70 to-black/10" />
          </>
        )}
      </div>

      <motion.div
        initial={{ y: 16, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 16, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 280 }}
        className="relative h-full flex flex-col"
      >
        <div className="absolute top-0 left-0 right-0 h-[100px] z-10 pointer-events-none">
        </div>

        <motion.div 
          initial={{ paddingTop: 'calc(env(safe-area-inset-top) + 16px)' }}
          animate={{ paddingTop: hasActivePlayer ? 'calc(env(safe-area-inset-top) + 80px)' : 'calc(env(safe-area-inset-top) + 16px)' }}
          transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          className="flex items-center justify-between px-6 pb-3 z-20 relative"
        >
          <button onClick={onClose} className="bg-zinc-800/50 backdrop-blur-2xl rounded-full p-3 border border-white/10 shadow-2xl hover:bg-zinc-700 transition-colors text-white active:scale-95">
            <Icons.ChevronLeft size={20} />
          </button>
          
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: showStickyTitle ? 1 : 0, y: showStickyTitle ? 0 : 10 }}
            className="absolute left-[44%] top-[calc(100%-40px)] -translate-x-1/2 -translate-y-1/2 text-sm font-bold text-white truncate max-w-[40%]"
          >
            {collection?.title}
          </motion.div>

          <div className="flex items-center gap-3">
              {isSearchActive && (
                  <motion.div 
                    initial={{ width: 0, opacity: 0 }}
                    animate={{ width: 200, opacity: 1 }}
                    className="relative"
                  >
                      <input 
                        autoFocus
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="在专辑内搜索"
                        className="w-full bg-white/10 backdrop-blur-xl border border-white/10 rounded-full py-2 px-4 text-sm text-white focus:outline-none focus:border-red-500/50"
                      />
                      {searchQuery && (
                          <button 
                            onClick={() => {
                                setSearchQuery('');
                                setIsSearchActive(false);
                            }}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white"
                          >
                              <Icons.X size={14} />
                          </button>
                      )}
                  </motion.div>
              )}
              <button
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setMenuAnchor({ x: rect.left, y: rect.top });
                  setMenuOpen(true);
                }}
                className="bg-zinc-800/50 backdrop-blur-2xl rounded-full p-3 border border-white/10 shadow-2xl hover:bg-zinc-700 transition-colors text-white active:scale-95"
              >
                <Icons.MoreHorizontal size={20} />
              </button>
        </div>
        </motion.div>
        
        {/* Sticky Header Background - Only visible when header content is sticky */}
        <motion.div 
            className="absolute top-0 left-0 right-0 h-[100px] z-10 pointer-events-none"
            initial={{ opacity: 0 }}
            animate={{ opacity: hasActivePlayer ? 0 : 1 }}
            transition={{ duration: 0.3 }}
        >
             <div className="absolute inset-0 bg-zinc-900/40 backdrop-blur-xl" style={{ maskImage: 'linear-gradient(to bottom, black 60%, transparent)' }}></div>
        </motion.div>
        
        {/* Separate Header Background when Player is Active - Pushed down */}
        <motion.div 
            className="absolute left-0 right-0 h-[100px] z-10 pointer-events-none"
            initial={{ top: 0, opacity: 0 }}
            animate={{ top: hasActivePlayer ? 64 : 0, opacity: hasActivePlayer ? 1 : 0 }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
        >
             <div className="absolute inset-0 bg-zinc-900/40 backdrop-blur-xl" style={{ maskImage: 'linear-gradient(to bottom, black 60%, transparent)' }}></div>
        </motion.div>

        <div 
          className="flex-1 overflow-y-auto no-scrollbar pb-[calc(env(safe-area-inset-bottom)+108px)]"
          onScroll={handleScroll}
        >
          {collection?.type === 'playlist' ? (
            <div className="relative px-6">
              <div className="relative h-[46vh] rounded-[28px] overflow-hidden border border-white/10 shadow-2xl">
                <CollectionBentoWall songs={orderedSongs} />
                <div className="absolute inset-0 pointer-events-none">
                  <div className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent" />
                </div>
              </div>

              <div className="mt-8 text-center" ref={titleRef}>
                <div className="text-white text-3xl font-extrabold tracking-tight drop-shadow-md">{collection?.title ?? (loading ? '加载中…' : '未找到')}</div>
                <div className="mt-2 flex items-center justify-center gap-2 text-base font-semibold text-zinc-300 drop-shadow-sm">
                  {creatorAvatarUrl ? <img src={creatorAvatarUrl} className="w-5 h-5 rounded-full object-cover shadow-sm" alt="" /> : <div className="w-5 h-5 rounded-full bg-white/10" />}
                  <div className="truncate">{creatorName}</div>
                  <div className="text-zinc-500">|</div>
                  <div className="text-zinc-400">{(collection?.play_count ?? 0).toLocaleString()} 次播放</div>
                </div>
              </div>
            </div>
          ) : (
            <div className="px-6">
              <div className="mt-6 flex flex-col items-center">
                <div className="w-[70%] max-w-[320px] aspect-square rounded-[24px] overflow-hidden shadow-2xl border border-white/10 bg-zinc-900/50 flex items-center justify-center">
                  {headerCover ? (
                    <img src={headerCover} className="w-full h-full object-cover" alt="" />
                  ) : (
                    <Icons.Disc size={64} className="text-zinc-700" />
                  )}
                </div>
                <div className="mt-8 text-center" ref={collection?.type === 'album' ? titleRef : undefined}>
                  <div className="text-white text-3xl font-extrabold tracking-tight drop-shadow-md">{collection?.title ?? (loading ? '加载中…' : '未找到')}</div>
                  <div className="mt-2 text-base font-semibold text-zinc-200 drop-shadow-sm">{creatorName}</div>
                  <div className="mt-2 text-[11px] font-semibold text-zinc-400 uppercase tracking-wider">
                    {(collection?.genre && collection.genre.trim()) ? collection.genre.trim() : '未知'} · {collection?.release_year ?? '—'} · Dolby Atmos · 无损
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="px-6 mt-10 space-y-4">
            {missingCount > 0 && !isOwner ? (
              <div className="text-xs text-zinc-400 bg-white/5 border border-white/10 rounded-2xl px-4 py-3">
                部分歌曲因隐私设置不可见
              </div>
            ) : null}

            <div className="space-y-2">
              {loading ? (
                <div className="text-center text-zinc-500 text-sm py-10">加载中…</div>
              ) : (
                filteredSongs.map((s, idx) => {
                  const isCurrent = store.playerState.currentSongId === s.id;
                  const isPlaying = isCurrent && store.playerState.isPlaying;

                  return (
                    <button
                      key={s.id}
                      onClick={() => {
                        if (collection) {
                          store.playCollection(
                            orderedSongs.map((x) => x.id),
                            s.id,
                            { collectionId: collection.id, collectionType: collection.type }
                          );
                          if (collection.type === 'playlist') {
                            setCollection((prev) => (prev ? { ...prev, play_count: (prev.play_count ?? 0) + 1 } : prev));
                          }
                          return;
                        }
                        store.playSong(s.id);
                      }}
                      className={`w-full flex items-center gap-4 p-3 rounded-2xl transition active:scale-[0.99] group ${isCurrent ? 'bg-zinc-800/60' : 'hover:bg-white/5'}`}
                    >
                      <div className="w-6 text-center text-xs font-mono text-zinc-500 flex justify-center">
                        {isPlaying ? (
                          <div className="flex gap-[2px] justify-center items-end h-3">
                            <div className="w-0.5 bg-red-500 animate-[bounce_1s_infinite] h-full"></div>
                            <div className="w-0.5 bg-red-500 animate-[bounce_1.2s_infinite] h-2/3"></div>
                            <div className="w-0.5 bg-red-500 animate-[bounce_0.8s_infinite] h-1/2"></div>
                          </div>
                        ) : (
                          <span className={isCurrent ? 'text-red-500 font-bold' : 'group-hover:text-white'}>{idx + 1}</span>
                        )}
                      </div>
                      <img src={s.coverUrl} className="w-12 h-12 rounded-xl object-cover bg-zinc-800 shadow-sm" alt="" loading="lazy" decoding="async" />
                      <div className="flex-1 min-w-0 text-left">
                        <div className={`text-sm font-bold truncate ${isCurrent ? 'text-red-500' : 'text-zinc-200 group-hover:text-white'}`}>{s.title}</div>
                        <div className="text-xs font-medium text-zinc-500 truncate">{s.artist}</div>
                      </div>
                      {s.isPublic === false ? <Icons.Lock size={14} className="text-zinc-500 shrink-0" /> : null}
                    </button>
                  );
                })
              )}

              {!loading && !orderedSongs.length ? <div className="text-center text-zinc-500 text-sm py-10">还没有歌曲</div> : null}
              {!loading && orderedSongs.length > 0 && !filteredSongs.length ? <div className="text-center text-zinc-500 text-sm py-10">未找到相关歌曲</div> : null}
            </div>
          </div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 h-[120px] z-10 pointer-events-none">
            <div className="absolute inset-0 bg-zinc-900/40 backdrop-blur-xl" style={{ maskImage: 'linear-gradient(to top, black 60%, transparent)' }}></div>
        </div>

        <div className="absolute bottom-0 left-0 right-0 px-6 pb-[calc(env(safe-area-inset-bottom)+16px)] pt-4 z-20">
          <div className="flex items-center gap-3">
            <button
              onClick={handlePlayAll}
              className="flex-1 bg-red-500 text-white font-extrabold rounded-2xl py-3 shadow-[0_4px_24px_rgba(239,68,68,0.4)] active:scale-[0.99] transition text-left px-5 hover:bg-red-400"
            >
              <div className="flex items-center gap-2">
                <Icons.Play size={18} fill="currentColor" />
                <span className="text-base">播放全部</span>
              </div>
              <div className="text-[10px] text-white/80 font-semibold mt-0.5 opacity-80">共 {visibleCount} 首</div>
            </button>

            <button
              onClick={() => setIsAddOpen(true)}
              className="w-11 h-11 rounded-full bg-zinc-800/50 backdrop-blur-2xl border border-white/10 text-white flex items-center justify-center shadow-2xl hover:bg-zinc-700 transition active:scale-95"
              title="添加歌曲"
            >
              <Icons.PlusCircle size={20} />
            </button>

            <button
              onClick={() => alert('多选功能即将开放')}
              className="w-11 h-11 rounded-full bg-zinc-800/50 backdrop-blur-2xl border border-white/10 text-white flex items-center justify-center shadow-2xl hover:bg-zinc-700 transition active:scale-95"
              title="多选"
            >
              <Icons.List size={20} />
            </button>
          </div>
        </div>

        {collection ? (
          <CollectionContextMenu
            isOpen={menuOpen}
            onClose={() => setMenuOpen(false)}
            anchorPosition={menuAnchor}
            collection={collection}
            isOwner={isOwner}
            onToggleVisibility={(next) => {
              supabaseApi
                .setCollectionVisibility(collection.id, next)
                .then(() => setCollection((prev) => (prev ? { ...prev, visibility: next } : prev)))
                .catch((e: any) => alert(typeof e?.message === 'string' ? e.message : '操作失败'));
            }}
            onEdit={() => setIsEditOpen(true)}
            onSearch={() => setIsSearchActive(true)}
          />
        ) : null}

        {collection && (
            <EditCollectionModal 
                isOpen={isEditOpen}
                collection={collection}
                onClose={() => setIsEditOpen(false)}
                onSuccess={() => reload().catch(() => {})}
            />
        )}

        <SongPickerModal
          isOpen={isAddOpen}
          title={collection?.type === 'album' ? '添加到专辑' : '添加到歌单'}
          songs={canPickSongs}
          onClose={() => setIsAddOpen(false)}
          onConfirm={handleAddSongs}
        />
      </motion.div>
    </div>
  );
};
