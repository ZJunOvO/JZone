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
  compactMode?: 'circle' | 'expanded';
}

export const PlayerBar: React.FC<PlayerBarProps> = ({
  onExpand,
  variant = 'dock',
  settlePulse = 0,
  compact = false,
  compactMode,
}) => {
  const { playerState, getCurrentSong, togglePlay, nextSong } = useStore();
  const playbackTime = usePlaybackTime();
  const song = getCurrentSong();
  const reduceMotion = useReducedMotion();
  const isCompactDock = compact && variant === 'dock';
  const isCompactCircle = isCompactDock && compactMode === 'circle';
  const isCompactExpanded = isCompactDock && compactMode === 'expanded';
  const playerRadiusClass = variant === 'island'
    ? 'rounded-full'
    : isCompactCircle
      ? 'rounded-full'
      : isCompactDock
        ? 'rounded-[32px]'
      : 'rounded-[18px]';
  const initialMapSize = React.useMemo(() => ({
    width: Math.min(
      variant === 'island'
        ? 320
        : isCompactCircle
          ? BOTTOM_DOCK_GEOMETRY.compactCircleSize
        : isCompactDock
          ? BOTTOM_DOCK_GEOMETRY.compactMaxWidth
          : BOTTOM_DOCK_GEOMETRY.wideMaxWidth,
      Math.max(1, (typeof window === 'undefined' ? 390 : window.innerWidth) - BOTTOM_DOCK_GEOMETRY.viewportGutter * 2),
    ),
    height: variant === 'island'
      ? 48
      : isCompactDock
        ? BOTTOM_DOCK_GEOMETRY.compactCircleSize
        : 56,
  }), [isCompactCircle, isCompactDock, variant]);
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
      className={`liquid-mini-player relative flex min-w-0 items-center cursor-pointer ${playerRadiusClass} ${
        variant === 'island' ? 'h-[48px]' : isCompactDock ? 'h-16' : 'h-[56px]'
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
      aria-label={isCompactCircle ? `展开迷你播放器：${song.title}` : `展开播放器：${song.title}`}
      data-liquid-control-root
      data-testid="mini-player"
      data-layout-mode={variant === 'island' ? 'island' : isCompactDock ? `compact-${compactMode ?? 'expanded'}` : 'wide'}
      data-compact-player-state={isCompactCircle ? 'circle' : isCompactExpanded ? 'expanded' : undefined}
      data-playback-progress={progress.toFixed(4)}
      data-liquid-settle-surface
      style={{ scale: settleScale, transformOrigin: '50% 50%' }}
    >
      <LiquidGlassMotionContent
        profile="player"
        borderRadiusClass={playerRadiusClass}
        className="flex h-full w-full min-w-0 items-center overflow-hidden"
        initialMapSize={initialMapSize}
        materialKey={isCompactDock ? `compact-${compactMode ?? 'expanded'}` : variant}
      >
      {isCompactCircle ? (
        <div className="relative h-full w-full p-[5px]" data-testid="compact-player-circle">
          <div
            className="relative h-full w-full overflow-hidden rounded-full bg-zinc-800"
            data-shared-element="song-cover"
            data-player-shared-source="cover"
          >
            <img
              src={song.coverUrl}
              alt=""
              decoding="async"
              className="h-full w-full object-cover"
            />
            {playerState.isPlaying && (
              <div
                className="absolute inset-0 flex items-center justify-center gap-[3px] bg-black/18"
                aria-hidden="true"
                data-testid="compact-player-equalizer"
              >
                {[0, 1, 2, 3].map((index) => (
                  <motion.span
                    key={index}
                    className="w-[3px] rounded-full bg-white shadow-[0_1px_6px_rgba(0,0,0,0.45)]"
                    animate={reduceMotion ? { height: 15 } : { height: [8, 22 - index * 2, 11, 18 + index] }}
                    transition={reduceMotion ? { duration: 0 } : {
                      duration: 0.72 + index * 0.08,
                      delay: index * 0.07,
                      repeat: Infinity,
                      repeatType: 'mirror',
                      ease: 'easeInOut',
                    }}
                  />
                ))}
              </div>
            )}
            {!playerState.isPlaying && (
              <div
                className="absolute inset-0 flex items-center justify-center bg-black/28 text-white"
                aria-hidden="true"
                data-testid="compact-player-paused"
              >
                <Icons.Pause size={22} fill="currentColor" />
              </div>
            )}
          </div>
          <svg className="pointer-events-none absolute inset-0 -rotate-90" viewBox="0 0 64 64" aria-hidden="true">
            <circle cx="32" cy="32" r="29.5" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="2" />
            <circle
              cx="32"
              cy="32"
              r="29.5"
              fill="none"
              stroke="rgba(255,255,255,0.92)"
              strokeWidth="2.4"
              strokeLinecap="round"
              pathLength="1"
              strokeDasharray="1"
              strokeDashoffset={1 - progress}
              className="transition-[stroke-dashoffset] duration-200"
              data-testid="compact-player-progress-ring"
            />
          </svg>
        </div>
      ) : (
      <>
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
          className={`h-full w-full object-cover shadow-sm bg-zinc-800 ${isCompactExpanded ? 'rounded-[25px]' : 'rounded-md'}`}
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
      </>
      )}
      </LiquidGlassMotionContent>
    </motion.div>
  );
};
