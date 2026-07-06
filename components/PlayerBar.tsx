import React from 'react';
import { useStore } from '../store';
import { Icons } from './Icons';
import { SkeletonBlock } from './Skeletons';

interface PlayerBarProps {
  onExpand: () => void;
  variant?: 'dock' | 'island';
}

export const PlayerBar: React.FC<PlayerBarProps> = ({ onExpand, variant = 'dock' }) => {
  const { playerState, getCurrentSong, togglePlay, nextSong } = useStore();
  const song = getCurrentSong();

  if (!song) return null;

  const denom = Math.max(0.1, (song.trimEnd ?? song.duration) - (song.trimStart ?? 0));
  const progress = Math.max(0, Math.min(1, ((playerState.currentTime - (song.trimStart ?? 0)) / denom)));

  return (
    <div 
      className={`relative h-[56px] bg-zinc-900/40 backdrop-blur-xl rounded-xl flex items-center shadow-2xl border border-white/10 cursor-pointer overflow-hidden ${
        variant === 'island' ? 'rounded-full h-[48px] border-white/15' : ''
      }`}
      onClick={onExpand}
    >
      {/* Album Art */}
      <div className={`h-full aspect-square p-1.5 ${variant === 'island' ? 'hidden' : ''}`}>
        <img 
          src={song.coverUrl} 
          alt="Cover" 
          decoding="async"
          className="w-full h-full rounded-md object-cover shadow-sm bg-zinc-800" 
        />
      </div>

      {/* Info */}
      <div className={`flex-1 min-w-0 flex flex-col justify-center ${variant === 'island' ? 'px-4' : 'px-2'}`}>
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
         {playerState.isAudioLoading ? (
            <SkeletonBlock className="h-full w-full" />
         ) : (
            <div
              className="h-full bg-white/50"
              style={{ width: `${progress * 100}%` }}
            ></div>
         )}
      </div>
    </div>
  );
};
