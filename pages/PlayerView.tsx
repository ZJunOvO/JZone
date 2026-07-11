import React, { useState } from 'react';
import { useStore } from '../store';
import { Icons } from '../components/Icons';
import { CommentsSheet } from '../components/CommentsSheet';
import { MemoryCardModal } from '../components/MemoryCardModal';
import { UniversalContextMenu } from '../components/UniversalContextMenu';
import { useModalPresence } from '../modalPresence';
import { SkeletonBlock } from '../components/Skeletons';
import { Reorder, useDragControls } from 'framer-motion';
import type { Song } from '../types';

interface PlayerViewProps {
  onClose: () => void;
}

const formatTime = (time: number) => {
  const min = Math.floor(time / 60);
  const sec = Math.floor(time % 60);
  return `${min}:${sec < 10 ? '0' : ''}${sec}`;
};

const QueueSongRow: React.FC<{
  song: Song;
  currentSongId: string;
  isPlaying: boolean;
  sorting: boolean;
  onPlay: () => void;
  onRemove: () => void;
}> = ({ song, currentSongId, isPlaying, sorting, onPlay, onRemove }) => {
  const dragControls = useDragControls();
  const active = song.id === currentSongId;
  const content = (
    <>
      <img src={song.coverUrl} loading="lazy" decoding="async" className="w-12 h-12 rounded-lg object-cover mr-4 shadow-md" alt="" />
      <div className="flex-1 min-w-0">
        <h4 className={`text-sm font-bold truncate ${active ? 'text-white' : 'text-zinc-300'}`}>{song.title}</h4>
        <p className="text-[11px] text-zinc-500 truncate font-medium mt-0.5">{song.artist}</p>
      </div>
      <div className="flex items-center gap-1">
        {active && isPlaying ? (
          <div className="flex gap-[2px] items-end h-3 mr-3" aria-hidden="true">
            <div className="w-0.5 bg-white animate-[bounce_1s_infinite] h-full" />
            <div className="w-0.5 bg-white animate-[bounce_1.2s_infinite] h-2/3" />
            <div className="w-0.5 bg-white animate-[bounce_0.8s_infinite] h-1/2" />
          </div>
        ) : null}
        {sorting ? (
          <button
            type="button"
            onPointerDown={(event) => {
              event.stopPropagation();
              dragControls.start(event);
            }}
            onClick={(event) => event.stopPropagation()}
            className="w-11 h-11 flex items-center justify-center text-white/55 touch-none cursor-grab active:cursor-grabbing"
            aria-label={`拖动排序 ${song.title}`}
          >
            <Icons.GripVertical size={19} />
          </button>
        ) : (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
            className="w-11 h-11 flex items-center justify-center text-white/25 hover:text-red-500 transition-colors"
            aria-label={`从待播放移除 ${song.title}`}
          >
            <Icons.X size={16} strokeWidth={2} />
          </button>
        )}
      </div>
    </>
  );

  const className = `flex items-center p-3 rounded-2xl transition group touch-pan-y ${active ? 'bg-white/10' : 'hover:bg-white/5'}`;
  if (!sorting) {
    return <div onClick={onPlay} className={`${className} cursor-pointer`}>{content}</div>;
  }
  return (
    <Reorder.Item
      value={song.id}
      dragListener={false}
      dragControls={dragControls}
      onClick={onPlay}
      className={className}
      whileDrag={{ scale: 1.02, backgroundColor: 'rgba(255,255,255,0.12)', zIndex: 10 }}
    >
      {content}
    </Reorder.Item>
  );
};

export const PlayerView: React.FC<PlayerViewProps> = ({ onClose }) => {
  const { playerState, getCurrentSong, songs, togglePlay, nextSong, prevSong, cyclePlaybackMode, seek, setVolume, playSong, removeFromQueue, reorderQueue, toggleFavorite, isFavorite } = useStore();
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [isQueueSorting, setIsQueueSorting] = useState(false);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [memoryOpenNonce, setMemoryOpenNonce] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [isChangingVolume, setIsChangingVolume] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | undefined>(undefined);

  useModalPresence(isMemoryOpen);
  useModalPresence(isQueueOpen);
  useModalPresence(isCommentsOpen);
  React.useEffect(() => {
    if (!isQueueOpen) setIsQueueSorting(false);
  }, [isQueueOpen]);
  
  const song = getCurrentSong();

  if (!song) return null;
  const isFav = isFavorite(song.id);
  const playbackModeMeta = {
    sequence: { label: '顺序播放', Icon: Icons.List },
    'repeat-one': { label: '单曲循环', Icon: Icons.Repeat1 },
    shuffle: { label: '随机播放', Icon: Icons.Shuffle },
  }[playerState.playbackMode];
  const PlaybackModeIcon = playbackModeMeta.Icon;

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    seek(Number(e.target.value));
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(Number(e.target.value));
  };

  const trimStart = Number.isFinite(song.trimStart) ? song.trimStart : 0;
  const trimEnd = Number.isFinite(song.trimEnd) && song.trimEnd > trimStart ? song.trimEnd : song.duration;
  const playableDuration = Math.max(0.1, trimEnd - trimStart);
  const currentTime = Math.max(trimStart, Math.min(trimEnd, playerState.currentTime));
  const progressPct = Math.max(0, Math.min(100, ((currentTime - trimStart) / playableDuration) * 100));
  const remainingTime = Math.max(0, trimEnd - currentTime);
  const volumePct = playerState.volume * 100;

  // Only show songs that are in the queue
  const queueSongs = songs.filter(s => playerState.queue.includes(s.id))
    .sort((a, b) => playerState.queue.indexOf(a.id) - playerState.queue.indexOf(b.id));

  return (
    <div className="fixed inset-0 bg-black z-[200] flex flex-col h-screen justify-between py-8 animate-[slideUp_0.4s_cubic-bezier(0.33,1,0.68,1)] overflow-hidden">
      {/* 1. Immersive Dynamic Background Layer */}
      <div className="absolute inset-0 -z-10 scale-150 overflow-hidden pointer-events-none transition-opacity duration-500 ease-in-out">
        <img 
          key={song.coverUrl}
          src={song.coverUrl} 
          className="w-full h-full object-cover blur-[100px] brightness-[0.55] saturate-[1.6] animate-[fadeIn_0.5s_ease-in-out]" 
          alt="immersive background" 
        />
        <div className="absolute inset-0 bg-black/20"></div>
      </div>

      {/* Top Handle indicator */}
      <button type="button" className="flex justify-center pt-2 pb-2 cursor-pointer relative z-10" onClick={onClose} aria-label="收起播放页">
        <div className="w-10 h-1.5 bg-white/20 rounded-full"></div>
      </button>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col px-8 justify-between mt-2 relative z-10">
        
        {/* Core Cover Area */}
        <div className="flex items-center justify-center flex-grow-[2] py-4">
          <div className="w-[96%] max-w-[400px] aspect-square relative transition-all duration-500 ease-out">
            <img 
              src={song.coverUrl} 
              alt="Album Cover" 
              className={`w-full h-full object-cover rounded-[14px] shadow-[0_25px_50px_-12px_rgba(0,0,0,0.7)] border border-white/10 transition-transform duration-500 ${playerState.isPlaying ? 'scale-100' : 'scale-[0.88] opacity-80'}`}
            />
          </div>
        </div>

        {/* Song Info & Action Buttons */}
        <div className="flex items-center justify-between">
          <div className="flex-1 min-w-0 pr-4">
            <h2 className="text-2xl font-bold text-white truncate tracking-tight mb-0.5">
              {song.title}
            </h2>
            <p className="text-lg text-white/60 font-medium truncate">
              {song.artist}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => toggleFavorite(song.id)}
              className={`w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition ${isFav ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white/90'}`}
              aria-label={isFav ? `取消收藏 ${song.title}` : `收藏 ${song.title}`}
            >
              <Icons.Heart size={18} strokeWidth={1.5} fill={isFav ? 'currentColor' : 'none'} />
            </button>
            <button 
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setMenuAnchor({ x: rect.left, y: rect.top });
                  setContextMenuOpen(true);
                }}
                className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/90 active:scale-90 transition"
                aria-label={`打开 ${song.title} 的更多操作`}
            >
              <Icons.MoreHorizontal size={18} strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* 5. Progress Bar - Apple style with Thickening Animation */}
        <div className="mt-8">
          {playerState.isAudioLoading ? (
            <SkeletonBlock className="w-full h-1.5 rounded-full" />
          ) : (
            <div
              className={`relative w-full bg-white/20 rounded-full overflow-hidden transition-all duration-300 ease-out ${isSeeking ? 'h-[7px]' : 'h-1.5'}`}
            >
              <div
                className="absolute top-0 left-0 h-full bg-white transition-all duration-100 pointer-events-none"
                style={{ width: `${progressPct}%` }}
              ></div>
              <input
                type="range"
                min={trimStart}
                max={trimEnd}
                step="0.1"
                value={currentTime}
                onChange={handleSeek}
                onMouseDown={() => setIsSeeking(true)}
                onMouseUp={() => setIsSeeking(false)}
                onTouchStart={() => setIsSeeking(true)}
                onTouchEnd={() => setIsSeeking(false)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none z-10"
                aria-label="播放进度"
              />
            </div>
          )}
          <div className="flex justify-between text-[11px] font-bold text-white/40 tracking-wider font-mono mt-2 tabular-nums">
            <span>{formatTime(currentTime)}</span>
            <span>-{formatTime(remainingTime)}</span>
          </div>
        </div>

        {/* Main Playback Controls */}
        <div className="flex items-center justify-around px-4 mt-2">
          <button onClick={prevSong} className="w-11 h-11 flex items-center justify-center text-white opacity-80 hover:opacity-100 transition active:scale-90" aria-label="上一首">
            <Icons.SkipBack size={26} fill="currentColor" />
          </button>
          <button 
            onClick={togglePlay} 
            className="w-16 h-16 flex items-center justify-center text-white active:scale-95 transition"
            aria-label={playerState.isPlaying ? '暂停' : '播放'}
          >
            {playerState.isPlaying ? 
              <Icons.Pause size={56} fill="currentColor" /> : 
              <Icons.Play size={56} fill="currentColor" className="ml-1.5" />
            }
          </button>
          <button onClick={nextSong} className="w-11 h-11 flex items-center justify-center text-white opacity-80 hover:opacity-100 transition active:scale-90" aria-label="下一首">
            <Icons.SkipForward size={26} fill="currentColor" />
          </button>
        </div>

        {/* 7. Volume Control Slider - Functional with Thickening Animation */}
        <div className="flex items-center gap-4 px-2 my-6 group">
          <div className="w-4 flex justify-center">
            {playerState.volume === 0 ? (
              <Icons.VolumeX size={14} strokeWidth={1.5} className="text-white/40" />
            ) : (
              <Icons.Volume1 size={14} strokeWidth={1.5} className="text-white/40" />
            )}
          </div>
          
          <div className="flex-1 relative flex items-center h-4">
             <div 
               className={`w-full bg-white/20 rounded-full overflow-hidden transition-all duration-300 ease-out ${isChangingVolume ? 'h-2' : 'h-1'}`}
             >
                <div 
                  className="h-full bg-white/60 pointer-events-none" 
                  style={{ width: `${volumePct}%` }}
                ></div>
                <input 
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={playerState.volume}
                  onChange={handleVolumeChange}
                  onMouseDown={() => setIsChangingVolume(true)}
                  onMouseUp={() => setIsChangingVolume(false)}
                  onTouchStart={() => setIsChangingVolume(true)}
                  onTouchEnd={() => setIsChangingVolume(false)}
                  className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none z-10"
                  aria-label="音量"
                />
             </div>
          </div>

          <div className="w-4 flex justify-center">
            <Icons.Volume2 size={14} strokeWidth={1.5} className="text-white/40" />
          </div>
        </div>

        {/* Footer Function Bar */}
        <div className="flex justify-center pb-[calc(env(safe-area-inset-bottom)+12px)]">
          <div className="flex items-center justify-between w-full max-w-[280px]">
            <button 
              onClick={() => setIsCommentsOpen(true)}
              className={`w-11 h-11 flex items-center justify-center transition active:opacity-60 ${isCommentsOpen ? 'text-white' : 'text-white/40 hover:text-white'}`}
              aria-label="打开评论"
            >
              <Icons.MessageSquareQuote size={20} strokeWidth={1.5} />
            </button>
            <button 
              onClick={() => {
                setIsMemoryOpen(true);
                setMemoryOpenNonce((n) => n + 1);
              }}
              className={`w-11 h-11 flex items-center justify-center transition active:opacity-60 ${isMemoryOpen ? 'text-white' : 'text-white/40 hover:text-white'}`}
              aria-label="打开记忆卡片"
            >
              <Icons.Sparkles size={20} strokeWidth={1.5} />
            </button>
            <button 
              onClick={() => setIsQueueOpen(true)}
              className={`w-11 h-11 flex items-center justify-center transition active:opacity-60 ${isQueueOpen ? 'text-white' : 'text-white/40 hover:text-white'}`}
              aria-label="打开待播放"
            >
              <Icons.List size={20} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>

      {/* Memory Card Overlay */}
       <MemoryCardModal song={isMemoryOpen ? song : null} openNonce={memoryOpenNonce} onClose={() => setIsMemoryOpen(false)} />

      {/* Queue/List Overlay */}
      {isQueueOpen && (
        <div className="absolute inset-0 z-50 animate-[fadeIn_0.3s_ease-out]">
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-sm" 
            onClick={() => setIsQueueOpen(false)}
          ></div>
          <div className="absolute inset-x-0 bottom-0 top-1/3 bg-zinc-900/60 backdrop-blur-3xl rounded-t-[32px] border-t border-white/10 flex flex-col shadow-[0_-20px_50px_rgba(0,0,0,0.5)] animate-[slideUp_0.4s_cubic-bezier(0.33,1,0.68,1)]">
            <button type="button" className="flex justify-center py-4 cursor-pointer" onClick={() => setIsQueueOpen(false)} aria-label="收起待播放">
              <div className="w-10 h-1.5 bg-white/20 rounded-full"></div>
            </button>
            
            <div className="px-6 py-2 flex justify-between items-center">
              <h3 className="text-lg font-bold text-white tracking-tight">待播放</h3>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIsQueueSorting((value) => !value)}
                  className={`min-h-11 px-3 rounded-full text-xs font-semibold transition ${isQueueSorting ? 'bg-white text-black' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
                  aria-pressed={isQueueSorting}
                >
                  {isQueueSorting ? '完成' : '排序'}
                </button>
                <button
                  onClick={cyclePlaybackMode}
                  className="min-h-11 px-3 rounded-full flex items-center gap-2 text-white/70 hover:text-white hover:bg-white/10 active:scale-95 transition"
                  aria-label={`切换播放策略，当前为${playbackModeMeta.label}`}
                  title={playbackModeMeta.label}
                >
                  <PlaybackModeIcon size={16} strokeWidth={1.8} />
                  <span className="text-xs font-semibold tracking-tight">{playbackModeMeta.label}</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-12 no-scrollbar">
              {isQueueSorting ? (
                <Reorder.Group axis="y" values={queueSongs.map((item) => item.id)} onReorder={reorderQueue} className="space-y-1 mt-4">
                  {queueSongs.map((queueSong) => (
                    <QueueSongRow
                      key={queueSong.id}
                      song={queueSong}
                      currentSongId={song.id}
                      isPlaying={playerState.isPlaying}
                      sorting
                      onPlay={() => playSong(queueSong.id)}
                      onRemove={() => removeFromQueue(queueSong.id)}
                    />
                  ))}
                </Reorder.Group>
              ) : (
                <div className="space-y-1 mt-4">
                  {queueSongs.map((queueSong) => (
                    <QueueSongRow
                      key={queueSong.id}
                      song={queueSong}
                      currentSongId={song.id}
                      isPlaying={playerState.isPlaying}
                      sorting={false}
                      onPlay={() => playSong(queueSong.id)}
                      onRemove={() => removeFromQueue(queueSong.id)}
                    />
                  ))}
                </div>
              )}
                {queueSongs.length === 0 && (
                  <div className="py-20 text-center">
                    <p className="text-zinc-500 italic text-sm">播放列表为空</p>
                  </div>
                )}
            </div>
          </div>
        </div>
      )}

      {/* Comments Sheet Overlay */}
      <CommentsSheet isOpen={isCommentsOpen} onClose={() => setIsCommentsOpen(false)} />

      {/* More Menu */}
      <UniversalContextMenu 
          isOpen={contextMenuOpen} 
          onClose={() => setContextMenuOpen(false)} 
          item={song} 
          type="song"
          anchorPosition={menuAnchor}
      />
    </div>
  );
};
