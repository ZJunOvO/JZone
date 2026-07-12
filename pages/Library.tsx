import React, { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { Icons } from '../components/Icons';
import { LibraryCanvas, type LibraryBentoItem } from '../components/LibraryCanvas';
import { UploadModal } from '../components/UploadModal';
import { MemoryCardModal } from '../components/MemoryCardModal';
import { UniversalContextMenu } from '../components/UniversalContextMenu';
import { CreateCollectionModal } from '../components/CreateCollectionModal';
import { Song } from '../types';
import { AnimatePresence, motion, PanInfo, useAnimation } from 'framer-motion';
import { useModalPresence } from '../modalPresence';
import { useAuth } from '../auth';
import { CollectionRow, supabaseApi } from '../supabaseApi';
import { LiquidGlassSurface } from '../components/LiquidGlassSurface';
import { LiquidGlassMotionContent } from '../components/LiquidGlassMotionContent';

type LibraryContentType = 'songs' | 'albums' | 'playlists';
type LibraryFilter = 'all' | 'mine' | 'collaborations' | 'public' | 'private' | 'favorites';

const SwipeableListItem = ({ song, index, playSong, deleteSong, currentSongId, isPlaying, onContextMenu, isMenuTarget }: any) => {
  const controls = useAnimation();
  const [isDeleting, setIsDeleting] = useState(false);
  const longPressTimerRef = React.useRef<NodeJS.Timeout | null>(null);
  const { user } = useAuth();
  const isOwner = user?.id === song.ownerId;

  const handleDragEnd = async (event: any, info: PanInfo) => {
    if (!isOwner) return;
    if (info.offset.x < -100) {
      // Trigger delete
      if (window.confirm(`确定要删除 "${song.title}" 吗？此操作不可恢复。`)) {
        setIsDeleting(true);
        await deleteSong(song.id);
      } else {
        controls.start({ x: 0 });
      }
    } else {
      controls.start({ x: 0 });
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
      const touch = e.touches[0];
      const { clientX, clientY } = touch;
      longPressTimerRef.current = setTimeout(() => {
          onContextMenu(song, { x: clientX, y: clientY });
      }, 500);
  };

  const handleTouchEnd = () => {
      if (longPressTimerRef.current) {
          clearTimeout(longPressTimerRef.current);
          longPressTimerRef.current = null;
      }
  };

  if (isDeleting) return null;

  return (
    <div className="relative overflow-hidden rounded-xl mb-1">
      {/* Background Delete Action */}
      <div className="absolute inset-y-0 right-0 w-full bg-red-600 flex items-center justify-end pr-6 rounded-xl">
        <Icons.Trash size={20} className="text-white" />
      </div>

      {/* Foreground Content */}
      <motion.div 
        data-testid={`library-song-${song.id}`}
        data-library-song="true"
        drag={isOwner ? "x" : false}
        dragConstraints={{ left: -100, right: 0 }}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
        animate={controls}
        className={`relative flex items-center p-3 cursor-pointer transition active:scale-[0.99] ${
          isMenuTarget
            ? 'bg-zinc-800/95 ring-1 ring-inset ring-white/18 shadow-[0_10px_28px_rgba(0,0,0,0.32)]'
            : currentSongId === song.id
              ? 'bg-zinc-900'
              : 'bg-black hover:bg-zinc-900'
        }`}
        onClick={() => playSong(song.id)}
        onContextMenu={(e) => { e.preventDefault(); onContextMenu(song, { x: e.clientX, y: e.clientY }); }}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
        onTouchMove={handleTouchEnd} // Cancel on scroll
      >
        <div className="w-6 mr-3 flex justify-center">
            {currentSongId === song.id && isPlaying ? 
                <div className="flex gap-[2px] justify-center items-end h-3">
                     <div className="w-0.5 bg-red-500 animate-[bounce_1s_infinite] h-full"></div>
                     <div className="w-0.5 bg-red-500 animate-[bounce_1.2s_infinite] h-2/3"></div>
                     <div className="w-0.5 bg-red-500 animate-[bounce_0.8s_infinite] h-1/2"></div>
                </div> 
                : <span className="text-zinc-500 text-xs font-mono">{index + 1}</span>
            }
        </div>
        
        <div className="relative">
            <img src={song.coverUrl} loading="lazy" decoding="async" className="w-12 h-12 rounded-md object-cover mr-3 bg-zinc-800" alt="art" />
            {song.pinnedAt && (
                <div className="absolute -top-1 -right-1 bg-red-500 rounded-full p-[2px] border border-black">
                    <Icons.Pin size={8} className="text-white" fill="currentColor" />
                </div>
            )}
        </div>
        
        <div className="flex-1 overflow-hidden pointer-events-none">
            <div className="flex items-center gap-1.5">
                <h4 className={`text-sm font-medium truncate mb-0.5 ${currentSongId === song.id ? 'text-red-500' : 'text-zinc-200'}`}>{song.title}</h4>
                {song.isPublic === false && <Icons.Lock size={10} className="text-zinc-500 shrink-0" />}
            </div>
            <p className="text-xs text-zinc-500 truncate">{song.artist}</p>
        </div>
        
        <button
          type="button"
          aria-label={`打开 ${song.title} 的更多操作`}
          onClick={(e) => {
            e.stopPropagation();
            const rect = e.currentTarget.getBoundingClientRect();
            onContextMenu(song, { x: rect.left, y: rect.top });
          }}
          className="w-11 h-11 flex items-center justify-center text-zinc-500 hover:text-white active:scale-95 transition"
        >
          <Icons.MoreHorizontal size={18} />
        </button>
      </motion.div>
    </div>
  );
};

const CollectionListItem = ({ collection, userId }: { collection: CollectionRow; userId?: string }) => {
  const isOwner = collection.creator_id === userId;
  const isPrivate = collection.visibility === 'private';
  const Icon = collection.type === 'album' ? Icons.Disc : Icons.ListMusic;

  return (
    <button
      onClick={() => window.dispatchEvent(new CustomEvent('jzone:navigate-collection', { detail: { id: collection.id } }))}
      className="w-full flex items-center p-3 rounded-2xl cursor-pointer hover:bg-zinc-900 transition-all active:scale-[0.98] text-left"
    >
      <div className="relative w-12 h-12 rounded-xl bg-zinc-900 border border-white/5 overflow-hidden mr-4 shrink-0 flex items-center justify-center">
        {collection.cover_url ? (
          <img src={collection.cover_url} loading="lazy" decoding="async" className="w-full h-full object-cover" alt={collection.title} />
        ) : (
          <Icon size={22} className="text-zinc-500" />
        )}
        {collection.pinned_at && (
          <div className="absolute -top-1 -right-1 bg-red-500 rounded-full p-[2px] border border-black">
            <Icons.Pin size={8} className="text-white" fill="currentColor" />
          </div>
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <h4 className="text-sm font-bold text-zinc-100 truncate">{collection.title}</h4>
          {isPrivate && <Icons.Lock size={11} className="text-zinc-500 shrink-0" />}
        </div>
        <p className="text-[11px] text-zinc-500 truncate font-medium mt-0.5">
          {collection.type === 'album' ? '专辑' : '歌单'} · {isOwner ? '我的' : '公开'}{collection.type === 'playlist' ? ` · ${(collection.play_count ?? 0).toLocaleString()} 次播放` : ''}
        </p>
      </div>

      <Icons.ChevronRight size={16} className="text-white/20 ml-3" />
    </button>
  );
};

export const Library: React.FC = () => {
  const { songs, playContext, deleteSong, playerState, favoriteSongIds } = useStore();
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<'list' | 'canvas'>('list');
  const [bentoEditing, setBentoEditing] = useState(false);
  const [contentType, setContentType] = useState<LibraryContentType>('songs');
  const [activeFilter, setActiveFilter] = useState<LibraryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [collections, setCollections] = useState<CollectionRow[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(false);
  const [showUpload, setShowUpload] = useState(false);
  const [memorySong, setMemorySong] = useState<Song | null>(null);
  const [memoryOpenNonce, setMemoryOpenNonce] = useState(0);
  const [contextMenu, setContextMenu] = useState<{ isOpen: boolean; anchor?: { x: number; y: number }; item: Song } | null>(null);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [createMenuClosing, setCreateMenuClosing] = useState(false);
  const createMenuCloseTimerRef = React.useRef<number | null>(null);
  const [createMenuAnchor, setCreateMenuAnchor] = useState<{ x: number; y: number } | undefined>(undefined);
  const [createType, setCreateType] = useState<'album' | 'playlist'>('album');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [collaboratingSongIds, setCollaboratingSongIds] = useState<Set<string>>(new Set());

  const closeCreateMenu = React.useCallback((afterClose?: () => void) => {
    if (createMenuClosing) return;
    setCreateMenuClosing(true);
    if (createMenuCloseTimerRef.current) window.clearTimeout(createMenuCloseTimerRef.current);
    createMenuCloseTimerRef.current = window.setTimeout(() => {
      setCreateMenuOpen(false);
      setCreateMenuClosing(false);
      afterClose?.();
    }, 740);
  }, [createMenuClosing]);

  useEffect(() => () => {
    if (createMenuCloseTimerRef.current) window.clearTimeout(createMenuCloseTimerRef.current);
  }, []);

  useModalPresence(!!memorySong);

  useEffect(() => {
    if (!supabaseApi.isEnabled()) {
      setCollections([]);
      return;
    }
    let cancelled = false;
    const load = async () => {
      setCollectionsLoading(true);
      try {
        const rows = await supabaseApi.fetchVisibleCollections(undefined, 80);
        if (!cancelled) setCollections(rows);
      } catch {
        if (!cancelled) setCollections([]);
      } finally {
        if (!cancelled) setCollectionsLoading(false);
      }
    };

    load();
    const handler = () => load();
    window.addEventListener('jzone:collections-changed', handler);
    return () => {
      cancelled = true;
      window.removeEventListener('jzone:collections-changed', handler);
    };
  }, []);

  useEffect(() => {
    if (!user?.id || !supabaseApi.isEnabled()) {
      setCollaboratingSongIds(new Set());
      return;
    }
    let cancelled = false;
    supabaseApi.fetchCollaboratingSongIds(user.id)
      .then((ids) => {
        if (!cancelled) setCollaboratingSongIds(new Set(ids));
      })
      .catch(() => {
        if (!cancelled) setCollaboratingSongIds(new Set());
      });
    return () => { cancelled = true; };
  }, [user?.id]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filteredSongs = useMemo(() => {
    return songs.filter((song) => {
      if (activeFilter === 'mine' && song.ownerId !== user?.id) return false;
      if (activeFilter === 'collaborations' && !collaboratingSongIds.has(song.id)) return false;
      if (activeFilter === 'public' && (song.isPublic === false || song.visibility === 'private')) return false;
      if (activeFilter === 'private' && !(song.isPublic === false || song.visibility === 'private')) return false;
      if (activeFilter === 'favorites' && !favoriteSongIds.includes(song.id)) return false;
      if (!normalizedQuery) return true;
      const haystack = `${song.title} ${song.artist} ${song.album ?? ''} ${song.genre ?? ''}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [activeFilter, collaboratingSongIds, favoriteSongIds, normalizedQuery, songs, user?.id]);

  const filteredCollections = useMemo(() => {
    return collections.filter((collection) => {
      if (contentType === 'albums' && collection.type !== 'album') return false;
      if (contentType === 'playlists' && collection.type !== 'playlist') return false;
      if (activeFilter === 'mine' && collection.creator_id !== user?.id) return false;
      if (activeFilter === 'public' && collection.visibility !== 'public') return false;
      if (activeFilter === 'private' && collection.visibility !== 'private') return false;
      if (activeFilter === 'favorites') return false;
      if (!normalizedQuery) return true;
      const haystack = `${collection.title} ${collection.genre ?? ''} ${collection.description ?? ''}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [activeFilter, collections, contentType, normalizedQuery, user?.id]);

  const filterOptions = useMemo(() => {
    const base: Array<{ id: LibraryFilter; label: string }> = [
      { id: 'all', label: '全部' },
      { id: 'mine', label: '我的' },
      { id: 'collaborations', label: '合作' },
      { id: 'public', label: '公开' },
      { id: 'private', label: '私有' },
    ];
    if (contentType === 'songs') base.splice(1, 0, { id: 'favorites', label: '收藏' });
    else return base.filter((filter) => filter.id !== 'collaborations');
    return base;
  }, [contentType]);

  useEffect(() => {
    if (contentType !== 'songs' && (activeFilter === 'favorites' || activeFilter === 'collaborations')) setActiveFilter('all');
  }, [activeFilter, contentType]);

  useEffect(() => {
    if (viewMode === 'list') setBentoEditing(false);
  }, [viewMode]);

  const handleBentoLongPress = (songId: string) => {
    const song = songs.find(s => s.id === songId);
    if (song) {
      setMemorySong(song);
      setMemoryOpenNonce((n) => n + 1);
    }
  };

  const handleContextMenu = (song: Song, anchor: { x: number; y: number }) => {
      setContextMenu({ isOpen: true, anchor, item: song });
  };

  const bentoItems = useMemo<LibraryBentoItem[]>(() => {
    if (contentType === 'songs') {
      return filteredSongs.map((song) => ({
        id: song.id,
        title: song.title,
        subtitle: song.artist,
        coverUrl: song.coverUrl,
        kind: 'song',
        pinned: Boolean(song.pinnedAt),
      }));
    }
    return filteredCollections.map((collection) => ({
      id: collection.id,
      title: collection.title,
      subtitle: collection.type === 'album' ? '专辑' : '歌单',
      coverUrl: collection.cover_url ?? undefined,
      kind: collection.type,
      pinned: Boolean(collection.pinned_at),
    }));
  }, [contentType, filteredCollections, filteredSongs]);

  const openBentoItem = (id: string) => {
    if (contentType === 'songs') {
      playContext(filteredSongs.map((song) => song.id), id);
      return;
    }
    window.dispatchEvent(new CustomEvent('jzone:navigate-collection', { detail: { id } }));
  };

  return (
    <div className={`min-h-screen ${viewMode === 'list' ? 'pb-24 pt-12 px-6' : 'pt-0 pb-0'}`}>
       
       {/* Header with View Toggle */}
       <div className={`flex items-center ${viewMode === 'canvas' ? 'justify-end absolute top-12 inset-x-6 z-30 pointer-events-none' : 'justify-between mb-6'}`}>
           {viewMode === 'list' && (
             <h1 className="text-3xl font-extrabold text-white tracking-tight pointer-events-auto drop-shadow-md">资料库</h1>
           )}
           {viewMode === 'canvas' && (
             <div className="pointer-events-none absolute -top-5 left-1/2 -translate-x-1/2 whitespace-nowrap text-xs font-bold text-white/72 drop-shadow-[0_1px_8px_rgba(0,0,0,0.8)]">
               {contentType === 'songs' ? '歌曲' : contentType === 'albums' ? '专辑' : '歌单'} · {filterOptions.find((filter) => filter.id === activeFilter)?.label ?? '全部'}
             </div>
           )}
           
           <div className="flex gap-2 pointer-events-auto" data-library-glass-controls>
             <div className="relative h-11 w-11 overflow-hidden rounded-full" data-liquid-control-root>
               <LiquidGlassSurface borderRadiusClass="rounded-full" material="shuding" />
               <button
                 type="button"
                 aria-label="打开资料库新建菜单"
                 title="新建"
                 onClick={(e) => {
                   const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                   setCreateMenuAnchor({ x: rect.left, y: rect.bottom + 8 });
                   if (createMenuOpen) closeCreateMenu();
                   else {
                     setCreateMenuClosing(false);
                     setCreateMenuOpen(true);
                   }
                 }}
                 className="liquid-glass-interactive relative z-10 flex h-full w-full items-center justify-center rounded-full transition-colors"
                 data-liquid-adaptive="true"
               >
                 <Icons.PlusCircle size={18} />
               </button>
             </div>

             <div className="relative h-11 w-[84px] overflow-hidden rounded-full" data-liquid-control-root>
               <LiquidGlassSurface borderRadiusClass="rounded-full" material="shuding" />
               <div className="relative z-10 flex h-full w-full items-center gap-1 rounded-full p-1">
                 <button
                   type="button"
                   onClick={() => {
                     setBentoEditing(false);
                     setViewMode('list');
                   }}
                   aria-label="切换到列表视图"
                   title="列表视图"
                   className={`liquid-glass-interactive flex h-9 w-9 items-center justify-center rounded-full transition-all ${viewMode === 'list' ? 'bg-white/[0.18] shadow-sm' : ''}`}
                   data-liquid-adaptive="true"
                 >
                   <Icons.ListMusic size={18} />
                 </button>
                 <button
                   type="button"
                   onClick={() => setViewMode('canvas')}
                   aria-label="切换到 Bento 视图"
                   title="Bento 视图"
                   className={`liquid-glass-interactive flex h-9 w-9 items-center justify-center rounded-full transition-all ${viewMode === 'canvas' ? 'bg-white/[0.18] shadow-sm' : ''}`}
                   data-liquid-adaptive="true"
                 >
                   <Icons.LayoutDashboard size={18} />
                 </button>
               </div>
             </div>
             {viewMode === 'canvas' && (
               <div className="relative h-11 w-11 overflow-hidden rounded-full" data-liquid-control-root>
                 <LiquidGlassSurface borderRadiusClass="rounded-full" material="shuding" />
                 <button
                   type="button"
                   onClick={() => setBentoEditing((value) => !value)}
                   className={`liquid-glass-interactive relative z-10 flex h-full w-full items-center justify-center rounded-full transition-all ${bentoEditing ? 'bg-white/[0.18]' : ''}`}
                   data-liquid-adaptive="true"
                   aria-label={bentoEditing ? '完成 Bento 布局调整' : '调整 Bento 布局'}
                   title={bentoEditing ? '完成调整' : '调整布局'}
                 >
                   {bentoEditing ? <Icons.Check size={19} /> : <Icons.GripVertical size={19} />}
                 </button>
               </div>
             )}
           </div>
       </div>
       
       {viewMode === 'list' ? (
           <>
               <div className="space-y-3 mb-6">
                 <div className="flex items-center gap-3 bg-zinc-900/70 border border-white/5 rounded-2xl px-4 py-3">
                   <Icons.Search size={17} className="text-zinc-500 shrink-0" />
                   <input
                     value={searchQuery}
                     onChange={(e) => setSearchQuery(e.target.value)}
                     placeholder="搜索歌曲、艺人、专辑"
                     className="flex-1 bg-transparent outline-none text-sm text-white placeholder:text-zinc-600"
                   />
                   {searchQuery && (
                     <button onClick={() => setSearchQuery('')} className="text-zinc-500 hover:text-white transition" aria-label="清除搜索">
                       <Icons.X size={15} />
                     </button>
                   )}
                 </div>

                 <div className="grid grid-cols-3 gap-1 bg-zinc-900/70 border border-white/5 rounded-full p-1">
                   {[
                     { id: 'songs', label: '歌曲' },
                     { id: 'albums', label: '专辑' },
                     { id: 'playlists', label: '歌单' },
                   ].map((item) => (
                     <button
                       key={item.id}
                       onClick={() => setContentType(item.id as LibraryContentType)}
                       className={`h-9 rounded-full text-xs font-bold transition ${contentType === item.id ? 'bg-white text-black' : 'text-zinc-500 hover:text-zinc-200'}`}
                     >
                       {item.label}
                     </button>
                   ))}
                 </div>

                 <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
                   {filterOptions.map((filter) => (
                     <button
                       key={filter.id}
                       onClick={() => setActiveFilter(filter.id)}
                       className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${activeFilter === filter.id ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
                     >
                       {filter.label}
                     </button>
                   ))}
                 </div>
               </div>

               {/* List View */}
               <div className="space-y-1">
                 {contentType === 'songs' ? (
                   filteredSongs.length ? (
                     filteredSongs.map((song, index) => (
                        <SwipeableListItem
                            key={song.id}
                            song={song}
                            index={index}
                            playSong={(songId: string) => playContext(filteredSongs.map((item) => item.id), songId)}
                            deleteSong={deleteSong}
                            currentSongId={playerState.currentSongId}
                            isPlaying={playerState.isPlaying}
                            onContextMenu={handleContextMenu}
                            isMenuTarget={contextMenu?.item.id === song.id}
                        />
                     ))
                   ) : (
                     <div className="py-16 text-center text-zinc-500 text-sm">没有匹配的歌曲</div>
                   )
                 ) : collectionsLoading ? (
                   <div className="py-16 text-center text-zinc-500 text-sm">加载中…</div>
                 ) : filteredCollections.length ? (
                   filteredCollections.map((collection) => (
                     <CollectionListItem key={collection.id} collection={collection} userId={user?.id} />
                   ))
                 ) : (
                   <div className="py-16 text-center text-zinc-500 text-sm">
                     没有匹配的{contentType === 'albums' ? '专辑' : '歌单'}
                   </div>
                 )}
               </div>
           </>
       ) : (
           /* Canvas View */
           <LibraryCanvas
               items={bentoItems}
               onOpen={openBentoItem}
               onLongPress={contentType === 'songs' ? handleBentoLongPress : undefined}
               currentItemId={contentType === 'songs' ? playerState.currentSongId : null}
               selectedItemId={contentType === 'songs' ? contextMenu?.item.id : null}
               isPlaying={contentType === 'songs' && playerState.isPlaying}
               layoutKey={`${user?.id ?? 'guest'}:${contentType}:${activeFilter}`}
               isEditing={bentoEditing}
               onEditingChange={setBentoEditing}
           />
       )}

       {showUpload && <UploadModal onClose={() => setShowUpload(false)} />}
       <MemoryCardModal song={memorySong} openNonce={memoryOpenNonce} onClose={() => setMemorySong(null)} />
       
       {contextMenu && (
           <UniversalContextMenu 
               isOpen={contextMenu.isOpen} 
               onClose={() => setContextMenu(null)} 
               anchorPosition={contextMenu.anchor} 
               item={contextMenu.item} 
               type="song"
           />
       )}

       {createMenuOpen && createMenuAnchor && (
         <div className="fixed inset-0 z-[259]" onClick={() => closeCreateMenu()} />
       )}
       <AnimatePresence>
         {createMenuOpen && createMenuAnchor && (
           <motion.div
             className={`liquid-context-menu-panel fixed z-[260] min-w-[220px] rounded-2xl ${createMenuClosing ? 'pointer-events-none' : 'pointer-events-auto'}`}
             style={{ left: Math.min(createMenuAnchor.x, window.innerWidth - 240), top: createMenuAnchor.y }}
             data-liquid-control-root
           >
             <LiquidGlassMotionContent profile="menu" className="p-1.5" closing={createMenuClosing}>
               <button
                 onClick={() => {
                   closeCreateMenu(() => setShowUpload(true));
                 }}
                 className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold transition-colors text-zinc-300 hover:text-white hover:bg-white/10"
               >
                 <Icons.Upload size={16} data-liquid-adaptive="true" />
                 上传音乐
               </button>
               <button
                 disabled={!user}
                 onClick={() => {
                   closeCreateMenu(() => {
                     setCreateType('album');
                     setCreateModalOpen(true);
                   });
                 }}
                 className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold transition-colors text-zinc-300 hover:text-white hover:bg-white/10 disabled:opacity-50"
               >
                 <Icons.Disc size={16} data-liquid-adaptive="true" />
                 新建专辑
               </button>
               <button
                 disabled={!user}
                 onClick={() => {
                   closeCreateMenu(() => {
                     setCreateType('playlist');
                     setCreateModalOpen(true);
                   });
                 }}
                 className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold transition-colors text-zinc-300 hover:text-white hover:bg-white/10 disabled:opacity-50"
               >
                 <Icons.ListMusic size={16} data-liquid-adaptive="true" />
                 新建歌单
               </button>
             </LiquidGlassMotionContent>
           </motion.div>
         )}
       </AnimatePresence>

       <CreateCollectionModal
         isOpen={createModalOpen}
         type={createType}
         onClose={() => setCreateModalOpen(false)}
       />
    </div>
  );
};
