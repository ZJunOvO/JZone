import React from 'react';
import { animate, motion, useMotionValue, useReducedMotion, type AnimationPlaybackControls } from 'framer-motion';
import { usePlaybackTime, useStore } from '../store';
import { Icons } from './Icons';
import { SkeletonBlock } from './Skeletons';
import { LiquidGlassMotionContent } from './LiquidGlassMotionContent';
import { createPlayerSettleCurve, PLAYER_SETTLE_DURATION } from './motion/playerTransition';
import { BOTTOM_DOCK_GEOMETRY } from '../utils/liquidGlassSettings';

const MINI_SETTLE_CURVE = createPlayerSettleCurve(1.0072);

interface PlayerBarProps {
  onExpand: () => void;
  variant?: 'dock' | 'island';
  settlePulse?: number;
  compact?: boolean;
}

export const PlayerBar: React.FC<PlayerBarProps> = ({ onExpand, variant = 'dock', settlePulse = 0, compact = false }) => {
  const { playerState, getCurrentSong, togglePlay, nextSong } = useStore();
  const playbackTime = usePlaybackTime();
  const song = getCurrentSong();
  const reduceMotion = useReducedMotion();
  const isCompactDock = compact && variant === 'dock';
  const playerRadiusClass = variant === 'island'
    ? 'rounded-full'
    : isCompactDock
      ? 'rounded-[28px]'
      : 'rounded-[18px]';
  const initialMapSize = React.useMemo(() => ({
    width: Math.min(
      variant === 'island'
        ? 320
        : isCompactDock
          ? BOTTOM_DOCK_GEOMETRY.compactMaxWidth
          : BOTTOM_DOCK_GEOMETRY.wideMaxWidth,
      Math.max(1, (typeof window === 'undefined' ? 390 : window.innerWidth) - BOTTOM_DOCK_GEOMETRY.viewportGutter * 2),
    ),
    height: variant === 'island' ? 48 : 56,
  }), [isCompactDock, variant]);
  const settleScale = useMotionValue(1);
  const settleAnimationRef = React.useRef<AnimationPlaybackControls | null>(null);

  React.useEffect(() => {
    settleAnimationRef.current?.stop();
    settleScale.set(1);
    if (settlePulse <= 0 || reduceMotion) return;
    settleAnimationRef.current = animate(settleScale, MINI_SETTLE_CURVE.values, {
      duration: PLAYER_SETTLE_DURATION,
      times: MINI_SETTLE_CURVE.times,
      ease: 'linear',
    });
  }, [reduceMotion, settlePulse, settleScale]);

  React.useEffect(() => () => settleAnimationRef.current?.stop(), []);

  if (!song) return null;

  const denom = Math.max(0.1, (song.trimEnd ?? song.duration) - (song.trimStart ?? 0));
  const progress = Math.max(0, Math.min(1, ((playbackTime - (song.trimStart ?? 0)) / denom)));

  return (
    <motion.div
      className={`liquid-mini-player relative flex h-[56px] min-w-0 items-center cursor-pointer ${playerRadiusClass} ${
        variant === 'island' ? 'h-[48px]' : ''
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
      data-layout-mode={variant === 'island' ? 'island' : isCompactDock ? 'compact' : 'wide'}
      data-liquid-settle-surface
      style={{ scale: settleScale, transformOrigin: '50% 50%' }}
    >
      <LiquidGlassMotionContent
        profile="player"
        borderRadiusClass={playerRadiusClass}
        className="flex h-full w-full min-w-0 items-center"
        initialMapSize={initialMapSize}
      >
      {/* Album Art */}
      <div
        className={`h-full shrink-0 aspect-square p-1.5 ${variant === 'island' ? 'hidden' : ''}`}
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
      <div className={`flex min-w-0 flex-1 flex-col justify-center ${variant === 'island' ? 'px-4' : isCompactDock ? 'px-1.5' : 'px-2'}`}>
        <h4
          className="text-[14px] font-medium text-white truncate leading-tight"
          data-shared-element="song-title"
          data-player-shared-source="title"
          data-liquid-adaptive="true"
        >
            {song.title}
        </h4>
        <div
          className="flex items-center text-zinc-400"
          data-shared-element="song-artist"
          data-player-shared-source="artist"
          data-liquid-adaptive="true"
          data-liquid-tone="secondary"
        >
          <span className="text-[12px] truncate">{song.artist}</span>
        </div>
      </div>

      {/* Controls */}
      <div className={`flex shrink-0 items-center ${isCompactDock ? 'gap-0 pr-1.5' : 'gap-1 pr-3'}`}>
        <button 
          onClick={(e) => { e.stopPropagation(); togglePlay(); }}
          aria-label={playerState.isPlaying ? `暂停 ${song.title}` : `播放 ${song.title}`}
          className={`liquid-glass-interactive transition active:scale-95 ${isCompactDock ? 'p-1.5' : 'p-2'}`}
          data-liquid-adaptive="true"
        >
          {playerState.isPlaying ? <Icons.Pause size={20} fill="currentColor" /> : <Icons.Play size={20} fill="currentColor" />}
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); nextSong(); }}
          aria-label="播放下一首"
          className={`liquid-glass-interactive transition active:scale-95 ${isCompactDock ? 'p-1.5' : 'p-2'}`}
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
