import React from 'react';
import { useStore } from '../store';
import { Icons } from './Icons';
import { SkeletonBlock } from './Skeletons';
import { LiquidGlassSurface } from './LiquidGlassSurface';

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
      className={`liquid-mini-player relative h-[56px] rounded-[18px] flex items-center cursor-pointer overflow-hidden ${
        variant === 'island' ? 'rounded-full h-[48px]' : ''
      }`}
      onClick={onExpand}
      data-liquid-control-root
    >
      <LiquidGlassSurface
        material="shuding"
        borderRadiusClass={variant === 'island' ? 'rounded-full' : 'rounded-[18px]'}
      />
      {/* Album Art */}
      <div className={`relative z-10 h-full aspect-square p-1.5 ${variant === 'island' ? 'hidden' : ''}`}>
        <img 
          src={song.coverUrl} 
          alt="Cover" 
          decoding="async"
          className="w-full h-full rounded-md object-cover shadow-sm bg-zinc-800" 
        />
      </div>

      {/* Info */}
      <div className={`relative z-10 flex-1 min-w-0 flex flex-col justify-center ${variant === 'island' ? 'px-4' : 'px-2'}`}>
        <h4 className="text-[14px] font-medium text-white truncate leading-tight">
            {song.title}
        </h4>
        <div className="flex items-center text-zinc-400">
             <span className="text-[12px] truncate">{song.artist}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="relative z-10 flex items-center gap-1 pr-3">
        <button 
          onClick={(e) => { e.stopPropagation(); togglePlay(); }}
          aria-label={playerState.isPlaying ? `暂停 ${song.title}` : `播放 ${song.title}`}
          className="liquid-glass-interactive p-2 transition active:scale-95"
          data-liquid-adaptive="true"
        >
          {playerState.isPlaying ? <Icons.Pause size={20} fill="currentColor" /> : <Icons.Play size={20} fill="currentColor" />}
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); nextSong(); }}
          aria-label="播放下一首"
          className="liquid-glass-interactive p-2 transition active:scale-95"
          data-liquid-adaptive="true"
        >
          <Icons.SkipForward size={20} fill="currentColor" />
        </button>
      </div>
      
      {/* Progress Bar Background */}
      <div className="absolute bottom-0 left-0 z-10 h-[1px] bg-white/10 w-full">
         {playerState.isAudioLoading ? (
            <SkeletonBlock className="h-full w-full" />
         ) : (
            <div
              className="h-full origin-left bg-white/50"
              style={{ transform: `scaleX(${progress})` }}
            ></div>
         )}
      </div>
    </div>
  );
};
