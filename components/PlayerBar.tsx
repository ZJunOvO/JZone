import React from 'react';
import { useStore } from '../store';
import { Icons } from './Icons';

interface PlayerBarProps {
  onExpand: () => void;
}

export const PlayerBar: React.FC<PlayerBarProps> = ({ onExpand }) => {
  const { playerState, getCurrentSong, togglePlay, nextSong } = useStore();
  const song = getCurrentSong();

  if (!song) return null;

  return (
    <div 
      className="fixed bottom-[64px] left-3 right-3 h-[56px] bg-zinc-800/80 backdrop-blur-xl rounded-xl flex items-center shadow-2xl border border-white/5 z-40 cursor-pointer overflow-hidden"
      onClick={onExpand}
    >
      {/* Album Art */}
      <div className="h-full aspect-square p-1.5">
        <img 
          src={song.coverUrl} 
          alt="Cover" 
          className="w-full h-full rounded-md object-cover shadow-sm bg-zinc-900" 
        />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0 flex flex-col justify-center px-2">
        <h4 className="text-[14px] font-medium text-white truncate leading-tight">
            {song.title}
        </h4>
        <div className="flex items-center text-zinc-400">
             <span className="text-[12px] truncate">{song.artist}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1 pr-3">
        <button 
          onClick={(e) => { e.stopPropagation(); togglePlay(); }}
          className="p-2 text-white hover:text-gray-300 transition active:scale-95"
        >
          {playerState.isPlaying ? <Icons.Pause size={20} fill="currentColor" /> : <Icons.Play size={20} fill="currentColor" />}
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); nextSong(); }}
          className="p-2 text-zinc-400 hover:text-white transition active:scale-95"
        >
          <Icons.SkipForward size={20} fill="currentColor" />
        </button>
      </div>
      
      {/* Progress Bar Background */}
      <div className="absolute bottom-0 left-0 h-[1px] bg-white/10 w-full">
         <div 
            className="h-full bg-white/50" 
            style={{ width: `${(playerState.currentTime / song.duration) * 100}%` }}
         ></div>
      </div>
    </div>
  );
};
