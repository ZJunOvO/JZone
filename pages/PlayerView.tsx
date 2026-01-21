import React, { useState } from 'react';
import { useStore } from '../store';
import { Icons } from '../components/Icons';
import { CommentsSheet } from '../components/CommentsSheet';
import { MemoryCardModal } from '../components/MemoryCardModal';

interface PlayerViewProps {
  onClose: () => void;
}

const formatTime = (time: number) => {
  const min = Math.floor(time / 60);
  const sec = Math.floor(time % 60);
  return `${min}:${sec < 10 ? '0' : ''}${sec}`;
};

export const PlayerView: React.FC<PlayerViewProps> = ({ onClose }) => {
  const { playerState, getCurrentSong, songs, togglePlay, nextSong, prevSong, seek, setVolume, playSong, removeFromQueue } = useStore();
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [isSeeking, setIsSeeking] = useState(false);
  const [isChangingVolume, setIsChangingVolume] = useState(false);
  
  const song = getCurrentSong();

  if (!song) return null;

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    seek(Number(e.target.value));
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(Number(e.target.value));
  };

  const progressPct = ((playerState.currentTime - song.trimStart) / (song.trimEnd - song.trimStart)) * 100;
  const volumePct = playerState.volume * 100;

  // Only show songs that are in the queue
  const queueSongs = songs.filter(s => playerState.queue.includes(s.id))
    .sort((a, b) => playerState.queue.indexOf(a.id) - playerState.queue.indexOf(b.id));

  return (
    <div className="fixed inset-0 bg-black z-50 flex flex-col h-screen justify-between py-8 animate-[slideUp_0.4s_cubic-bezier(0.33,1,0.68,1)] overflow-hidden">
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
      <div className="flex justify-center pt-2 pb-2 cursor-pointer relative z-10" onClick={onClose}>
        <div className="w-10 h-1.5 bg-white/20 rounded-full"></div>
      </div>

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
            <button className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/90 active:scale-90 transition">
              <Icons.Star size={18} strokeWidth={1.5} />
            </button>
            <button className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/90 active:scale-90 transition">
              <Icons.MoreHorizontal size={18} strokeWidth={1.5} />
            </button>
          </div>
        </div>

        {/* 5. Progress Bar - Apple style with Thickening Animation */}
        <div className="mt-8">
          <div 
            className={`relative w-full bg-white/20 rounded-full overflow-hidden transition-all duration-300 ease-out ${isSeeking ? 'h-[7px]' : 'h-1.5'}`}
          >
            <div 
              className="absolute top-0 left-0 h-full bg-white transition-all duration-100 pointer-events-none"
              style={{ width: `${progressPct}%` }}
            ></div>
            <input 
              type="range" 
              min={song.trimStart} 
              max={song.trimEnd} 
              step="0.1"
              value={playerState.currentTime} 
              onChange={handleSeek}
              onMouseDown={() => setIsSeeking(true)}
              onMouseUp={() => setIsSeeking(false)}
              onTouchStart={() => setIsSeeking(true)}
              onTouchEnd={() => setIsSeeking(false)}
              className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none z-10"
            />
          </div>
          <div className="flex justify-between text-[11px] font-bold text-white/40 tracking-wider font-mono mt-2 tabular-nums">
            <span>{formatTime(playerState.currentTime)}</span>
            <span>-{formatTime(song.trimEnd - playerState.currentTime)}</span>
          </div>
        </div>

        {/* Main Playback Controls */}
        <div className="flex items-center justify-around px-4 mt-2">
          <button onClick={prevSong} className="text-white opacity-80 hover:opacity-100 transition active:scale-90">
            <Icons.SkipBack size={26} fill="currentColor" />
          </button>
          <button 
            onClick={togglePlay} 
            className="w-16 h-16 flex items-center justify-center text-white active:scale-95 transition"
          >
            {playerState.isPlaying ? 
              <Icons.Pause size={56} fill="currentColor" /> : 
              <Icons.Play size={56} fill="currentColor" className="ml-1.5" />
            }
          </button>
          <button onClick={nextSong} className="text-white opacity-80 hover:opacity-100 transition active:scale-90">
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
              className={`p-2 transition active:opacity-60 ${isCommentsOpen ? 'text-white' : 'text-white/40 hover:text-white'}`}
            >
              <Icons.MessageSquareQuote size={20} strokeWidth={1.5} />
            </button>
            <button 
              onClick={() => setIsMemoryOpen(true)}
              className={`p-2 transition active:opacity-60 ${isMemoryOpen ? 'text-white' : 'text-white/40 hover:text-white'}`}
            >
              <Icons.Sparkles size={20} strokeWidth={1.5} />
            </button>
            <button 
              onClick={() => setIsQueueOpen(true)}
              className={`p-2 transition active:opacity-60 ${isQueueOpen ? 'text-white' : 'text-white/40 hover:text-white'}`}
            >
              <Icons.List size={20} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </div>

      {/* Memory Card Overlay */}
      <MemoryCardModal song={isMemoryOpen ? song : null} onClose={() => setIsMemoryOpen(false)} />

      {/* Queue/List Overlay */}
      {isQueueOpen && (
        <div className="absolute inset-0 z-50 animate-[fadeIn_0.3s_ease-out]">
          <div 
            className="absolute inset-0 bg-black/40 backdrop-blur-sm" 
            onClick={() => setIsQueueOpen(false)}
          ></div>
          <div className="absolute inset-x-0 bottom-0 top-1/3 bg-zinc-900/60 backdrop-blur-3xl rounded-t-[32px] border-t border-white/10 flex flex-col shadow-[0_-20px_50px_rgba(0,0,0,0.5)] animate-[slideUp_0.4s_cubic-bezier(0.33,1,0.68,1)]">
            <div className="flex justify-center py-4 cursor-pointer" onClick={() => setIsQueueOpen(false)}>
              <div className="w-10 h-1.5 bg-white/20 rounded-full"></div>
            </div>
            
            <div className="px-6 py-2 flex justify-between items-center">
              <h3 className="text-lg font-bold text-white tracking-tight">待播清单</h3>
              <button 
                onClick={() => setIsQueueOpen(false)}
                className="text-white/40 text-xs font-bold uppercase tracking-widest"
              >
                关闭
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-4 pb-12 no-scrollbar">
              <div className="space-y-1 mt-4">
                {queueSongs.map((s) => (
                  <div 
                    key={s.id}
                    onClick={() => playSong(s.id)}
                    className={`flex items-center p-3 rounded-2xl transition active:scale-[0.98] group ${s.id === song.id ? 'bg-white/10' : 'hover:bg-white/5'}`}
                  >
                    <img src={s.coverUrl} className="w-12 h-12 rounded-lg object-cover mr-4 shadow-md" alt="art" />
                    <div className="flex-1 min-w-0">
                      <h4 className={`text-sm font-bold truncate ${s.id === song.id ? 'text-white' : 'text-zinc-300'}`}>
                        {s.title}
                      </h4>
                      <p className="text-[11px] text-zinc-500 truncate font-medium mt-0.5">{s.artist}</p>
                    </div>
                    
                    <div className="flex items-center gap-1">
                      {s.id === song.id && playerState.isPlaying && (
                        <div className="flex gap-[2px] items-end h-3 mr-3">
                          <div className="w-0.5 bg-white animate-[bounce_1s_infinite] h-full"></div>
                          <div className="w-0.5 bg-white animate-[bounce_1.2s_infinite] h-2/3"></div>
                          <div className="w-0.5 bg-white animate-[bounce_0.8s_infinite] h-1/2"></div>
                        </div>
                      )}
                      
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          removeFromQueue(s.id);
                        }}
                        className="p-2 text-white/20 hover:text-red-500 transition-colors opacity-40 group-hover:opacity-100"
                        title="从播放列表中移除"
                      >
                        <Icons.X size={16} strokeWidth={2} />
                      </button>
                    </div>
                  </div>
                ))}
                
                {queueSongs.length === 0 && (
                  <div className="py-20 text-center">
                    <p className="text-zinc-500 italic text-sm">播放列表为空</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Comments Sheet Overlay */}
      <CommentsSheet isOpen={isCommentsOpen} onClose={() => setIsCommentsOpen(false)} />

    </div>
  );
};