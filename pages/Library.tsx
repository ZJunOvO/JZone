import React, { useState } from 'react';
import { useStore } from '../store';
import { Icons } from '../components/Icons';
import { LibraryCanvas } from '../components/LibraryCanvas';
import { UploadModal } from '../components/UploadModal';
import { MemoryCardModal } from '../components/MemoryCardModal';
import { UniversalContextMenu } from '../components/UniversalContextMenu';
import { CreateCollectionModal } from '../components/CreateCollectionModal';
import { Song } from '../types';
import { motion, PanInfo, useAnimation } from 'framer-motion';
import { useModalPresence } from '../modalPresence';
import { useAuth } from '../auth';

const SwipeableListItem = ({ song, index, playSong, deleteSong, currentSongId, isPlaying, onContextMenu }: any) => {
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
        drag={isOwner ? "x" : false}
        dragConstraints={{ left: -100, right: 0 }}
        dragElastic={0.1}
        onDragEnd={handleDragEnd}
        animate={controls}
        className={`relative bg-black flex items-center p-3 cursor-pointer hover:bg-zinc-900 transition active:scale-[0.99] ${currentSongId === song.id ? 'bg-zinc-900' : ''}`}
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
        
        <div className="text-xs text-zinc-600 font-mono">
           {/* Hint arrow or spacer */}
           <Icons.ChevronLeft size={14} className="opacity-20" />
        </div>
      </motion.div>
    </div>
  );
};

export const Library: React.FC = () => {
  const { songs, playSong, deleteSong, playerState } = useStore();
  const { user } = useAuth();
  const [viewMode, setViewMode] = useState<'list' | 'canvas'>('list');
  const [showUpload, setShowUpload] = useState(false);
  const [memorySong, setMemorySong] = useState<Song | null>(null);
  const [memoryOpenNonce, setMemoryOpenNonce] = useState(0);
  const [contextMenu, setContextMenu] = useState<{ isOpen: boolean; anchor?: { x: number; y: number }; item: Song } | null>(null);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [createMenuAnchor, setCreateMenuAnchor] = useState<{ x: number; y: number } | undefined>(undefined);
  const [createType, setCreateType] = useState<'album' | 'playlist'>('album');
  const [createModalOpen, setCreateModalOpen] = useState(false);

  useModalPresence(!!memorySong);

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

  return (
    <div className={`min-h-screen ${viewMode === 'list' ? 'pb-24 pt-12 px-6' : 'pt-0 pb-0'}`}>
       
       {/* Header with View Toggle */}
       <div className={`flex items-center ${viewMode === 'canvas' ? 'justify-end absolute top-12 right-6 z-30 pointer-events-none' : 'justify-between mb-6'}`}>
           {viewMode === 'list' && (
             <h1 className="text-3xl font-extrabold text-white tracking-tight pointer-events-auto drop-shadow-md">资料库</h1>
           )}
           
           <div className="flex gap-2 pointer-events-auto">
               <button 
                 onClick={(e) => {
                   const rect = (e.currentTarget as HTMLButtonElement).getBoundingClientRect();
                   setCreateMenuAnchor({ x: rect.left, y: rect.bottom + 8 });
                   setCreateMenuOpen((prev) => !prev);
                 }}
                  className="bg-zinc-800/50 backdrop-blur-2xl rounded-full p-3 border border-white/10 shadow-2xl hover:bg-zinc-700 transition-colors text-white"
               >
                   <Icons.PlusCircle size={18} />
               </button>

               <div className="bg-zinc-800/50 backdrop-blur-2xl rounded-full p-1 flex gap-1 border border-white/10 shadow-2xl transition-colors duration-300">
                   <button 
                      onClick={() => setViewMode('list')}
                      className={`p-2 rounded-full transition-all ${viewMode === 'list' ? 'bg-zinc-600 text-white shadow-sm' : 'text-zinc-400 hover:text-white'}`}
                   >
                       <Icons.ListMusic size={18} />
                   </button>
                   <button 
                      onClick={() => setViewMode('canvas')}
                      className={`p-2 rounded-full transition-all ${viewMode === 'canvas' ? 'bg-zinc-600 text-white shadow-sm' : 'text-zinc-400 hover:text-white'}`}
                   >
                       <Icons.Search size={18} /> {/* Using Search icon as a metaphor for exploration */}
                   </button>
               </div>
           </div>
       </div>
       
       {viewMode === 'list' ? (
           <>
               {/* Filter Chips */}
               <div className="flex gap-2 overflow-x-auto no-scrollbar mb-6 pb-2">
                 {['全部', '收藏', '专辑', '艺人'].map((filter, i) => (
                     <button 
                        key={filter} 
                        className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition ${i === 0 ? 'bg-white text-black' : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}`}
                     >
                        {filter}
                     </button>
                 ))}
               </div>

               {/* List View */}
               <div className="space-y-1">
                 {songs.map((song, index) => (
                    <SwipeableListItem 
                        key={song.id} 
                        song={song} 
                        index={index} 
                        playSong={playSong}
                        deleteSong={deleteSong}
                        currentSongId={playerState.currentSongId}
                        isPlaying={playerState.isPlaying}
                        onContextMenu={handleContextMenu}
                    />
                 ))}
               </div>
           </>
       ) : (
           /* Canvas View */
           <LibraryCanvas 
               songs={songs} 
               onPlay={playSong} 
               // Bento view no longer deletes directly
               onLongPress={handleBentoLongPress}
               currentSongId={playerState.currentSongId} 
               isPlaying={playerState.isPlaying}
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
         <div className="fixed inset-0 z-[150]" style={{ pointerEvents: 'none' }}>
           <div className="absolute inset-0 pointer-events-auto" onClick={() => setCreateMenuOpen(false)} />
           <div
             className="absolute bg-zinc-800/60 backdrop-blur-xl backdrop-saturate-150 border border-white/10 rounded-2xl shadow-2xl overflow-hidden min-w-[220px] pointer-events-auto"
             style={{ left: Math.min(createMenuAnchor.x, window.innerWidth - 240), top: createMenuAnchor.y }}
           >
             <div className="p-1.5">
               <button
                 onClick={() => {
                   setCreateMenuOpen(false);
                   setShowUpload(true);
                 }}
                 className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold transition-colors text-zinc-300 hover:text-white hover:bg-white/10"
               >
                 <Icons.Upload size={16} />
                 上传音乐
               </button>
               <button
                 disabled={!user}
                 onClick={() => {
                   setCreateMenuOpen(false);
                   setCreateType('album');
                   setCreateModalOpen(true);
                 }}
                 className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold transition-colors text-zinc-300 hover:text-white hover:bg-white/10 disabled:opacity-50"
               >
                 <Icons.Disc size={16} />
                 新建专辑
               </button>
               <button
                 disabled={!user}
                 onClick={() => {
                   setCreateMenuOpen(false);
                   setCreateType('playlist');
                   setCreateModalOpen(true);
                 }}
                 className="w-full flex items-center gap-3 px-3 py-3 rounded-xl text-sm font-bold transition-colors text-zinc-300 hover:text-white hover:bg-white/10 disabled:opacity-50"
               >
                 <Icons.ListMusic size={16} />
                 新建歌单
               </button>
             </div>
           </div>
         </div>
       )}

       <CreateCollectionModal
         isOpen={createModalOpen}
         type={createType}
         onClose={() => setCreateModalOpen(false)}
       />
    </div>
  );
};
