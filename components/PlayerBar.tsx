import React from 'react';
import { animate, motion, useMotionValue, useReducedMotion, type AnimationPlaybackControls } from 'framer-motion';
import { useStore } from '../store';
import { Icons } from './Icons';
import { SkeletonBlock } from './Skeletons';
import { LiquidGlassMotionContent } from './LiquidGlassMotionContent';
import { PLAYER_SETTLE_SPRING, PLAYER_SETTLE_VELOCITY } from './motion/playerTransition';

interface PlayerBarProps {
  onExpand: () => void;
  variant?: 'dock' | 'island';
  settlePulse?: number;
}

export const PlayerBar: React.FC<PlayerBarProps> = ({ onExpand, variant = 'dock', settlePulse = 0 }) => {
  const { playerState, getCurrentSong, togglePlay, nextSong } = useStore();
  const song = getCurrentSong();
  const reduceMotion = useReducedMotion();
  const settleScale = useMotionValue(1);
  const settleAnimationRef = React.useRef<AnimationPlaybackControls | null>(null);

  React.useEffect(() => {
    settleAnimationRef.current?.stop();
    settleScale.set(settlePulse > 0 && !reduceMotion ? 0.9985 : 1);
    if (settlePulse <= 0 || reduceMotion) return;
    settleAnimationRef.current = animate(settleScale, 1, {
      ...PLAYER_SETTLE_SPRING,
      velocity: PLAYER_SETTLE_VELOCITY * 1.15,
    });
  }, [reduceMotion, settlePulse, settleScale]);

  React.useEffect(() => () => settleAnimationRef.current?.stop(), []);

  if (!song) return null;

  const denom = Math.max(0.1, (song.trimEnd ?? song.duration) - (song.trimStart ?? 0));
  const progress = Math.max(0, Math.min(1, ((playerState.currentTime - (song.trimStart ?? 0)) / denom)));

  return (
    <motion.div
      className={`liquid-mini-player relative h-[56px] rounded-[18px] flex items-center cursor-pointer ${
        variant === 'island' ? 'rounded-full h-[48px]' : ''
      }`}
      onClick={onExpand}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onExpand();
        }
      }}
      role="button"
      tabIndex={0}
      aria-label={`展开播放器：${song.title}`}
      data-liquid-control-root
      data-testid="mini-player"
      data-liquid-settle-surface
      style={{ scale: settleScale, transformOrigin: '50% 50%' }}
    >
      <LiquidGlassMotionContent
        profile="player"
        borderRadiusClass={variant === 'island' ? 'rounded-full' : 'rounded-[18px]'}
        className="flex h-full w-full items-center"
      >
      {/* Album Art */}
      <div
        className={`h-full aspect-square p-1.5 ${variant === 'island' ? 'hidden' : ''}`}
        data-shared-element="song-cover"
        data-player-shared-source="cover"
      >
        <img 
          src={song.coverUrl} 
          alt="Cover" 
          decoding="async"
          className="w-full h-full rounded-md object-cover shadow-sm bg-zinc-800" 
        />
      </div>

      {/* Info */}
      <div className={`flex-1 min-w-0 flex flex-col justify-center ${variant === 'island' ? 'px-4' : 'px-2'}`}>
        <h4
          className="text-[14px] font-medium text-white truncate leading-tight"
          data-shared-element="song-title"
          data-player-shared-source="title"
        >
            {song.title}
        </h4>
        <div
          className="flex items-center text-zinc-400"
          data-shared-element="song-artist"
          data-player-shared-source="artist"
        >
          <span className="text-[12px] truncate">{song.artist}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center gap-1 pr-3">
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
      <div className="absolute bottom-0 left-0 h-[1px] bg-white/10 w-full">
         {playerState.isAudioLoading ? (
            <SkeletonBlock className="h-full w-full" />
         ) : (
            <div
              className="h-full origin-left bg-white/50"
              style={{ transform: `scaleX(${progress})` }}
            ></div>
         )}
      </div>
      </LiquidGlassMotionContent>
    </motion.div>
  );
};
