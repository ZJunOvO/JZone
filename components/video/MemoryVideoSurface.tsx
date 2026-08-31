import React from 'react';
import { createPortal } from 'react-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Icons } from '../Icons';
import { useStore } from '../../store';
import type { Song } from '../../types';
import type { SongVideoRow } from '../../supabaseApi';
import { getMemoryAudioMix } from '../../utils/songVideo';
import type { LyricsInput, ParsedLyrics } from '../../utils/lyrics';
import { VideoLyricsOverlay } from './VideoLyricsOverlay';

interface MemoryVideoSurfaceProps {
  row: SongVideoRow;
  song: Song;
  videoUrl: string;
  posterUrl?: string;
  anchorRef: React.RefObject<HTMLElement>;
  playbackTime: number;
  previewVisible: boolean;
  expanded: boolean;
  mediaReady: boolean;
  preloadTargetReached: boolean;
  lyrics?: LyricsInput | ParsedLyrics | null;
  onPreloadTargetReached: () => void;
  onReady: () => void;
  onExpand: () => void;
  onClose: () => void;
}

interface SurfaceRect {
  top: number;
  left: number;
  width: number;
  height: number;
  borderRadius: number;
}

const CLOSE_DURATION_MS = 460;

const readAnchorRect = (element: HTMLElement | null): SurfaceRect | null => {
  if (!element) return null;
  const rect = element.getBoundingClientRect();
  const borderRadius = Number.parseFloat(window.getComputedStyle(element).borderRadius);
  return {
    top: rect.top,
    left: rect.left,
    width: rect.width,
    height: rect.height,
    borderRadius: Number.isFinite(borderRadius) ? borderRadius : 14,
  };
};

export const MemoryVideoSurface: React.FC<MemoryVideoSurfaceProps> = ({
  row,
  song,
  videoUrl,
  posterUrl,
  anchorRef,
  playbackTime,
  previewVisible,
  expanded,
  mediaReady,
  preloadTargetReached,
  lyrics,
  onPreloadTargetReached,
  onReady,
  onExpand,
  onClose,
}) => {
  const reduceMotion = useReducedMotion();
  const { playerState, togglePlay, setPlaybackVolumeMultiplier } = useStore();
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const closeTimerRef = React.useRef<number | null>(null);
  const [anchorRect, setAnchorRect] = React.useState<SurfaceRect | null>(() => readAnchorRect(anchorRef.current));
  const [visualExpanded, setVisualExpanded] = React.useState(expanded && mediaReady);
  const [showLyrics, setShowLyrics] = React.useState(false);
  const songStart = (row.song_start_ms ?? 0) / 1_000;
  const songEnd = (row.song_end_ms ?? row.duration_ms) / 1_000;
  const videoStart = row.video_start_ms / 1_000;
  const videoEnd = (row.video_end_ms ?? row.duration_ms) / 1_000;

  const syncAnchor = React.useCallback(() => {
    const next = readAnchorRect(anchorRef.current);
    if (!next) return;
    setAnchorRect((previous) => {
      if (previous
        && Math.abs(previous.top - next.top) < 0.25
        && Math.abs(previous.left - next.left) < 0.25
        && Math.abs(previous.width - next.width) < 0.25
        && Math.abs(previous.height - next.height) < 0.25
        && Math.abs(previous.borderRadius - next.borderRadius) < 0.25) return previous;
      return next;
    });
  }, [anchorRef]);

  React.useLayoutEffect(() => {
    syncAnchor();
    const element = anchorRef.current;
    const observer = element && typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(syncAnchor)
      : null;
    if (element) observer?.observe(element);
    window.addEventListener('resize', syncAnchor);
    window.addEventListener('orientationchange', syncAnchor);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', syncAnchor);
      window.removeEventListener('orientationchange', syncAnchor);
    };
  }, [anchorRef, syncAnchor]);

  React.useLayoutEffect(() => {
    if (!previewVisible || visualExpanded) return;
    let frame = 0;
    const track = () => {
      syncAnchor();
      frame = window.requestAnimationFrame(track);
    };
    track();
    return () => window.cancelAnimationFrame(frame);
  }, [previewVisible, syncAnchor, visualExpanded]);

  React.useEffect(() => {
    if (!expanded || !mediaReady) return;
    if (closeTimerRef.current) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
    syncAnchor();
    const video = videoRef.current;
    if (video && video.currentTime >= videoEnd - 0.04) video.currentTime = videoStart;
    setVisualExpanded(true);
    if (!playerState.isPlaying) void togglePlay();
  }, [expanded, mediaReady, playerState.isPlaying, syncAnchor, togglePlay, videoEnd, videoStart]);

  React.useEffect(() => {
    if (!visualExpanded) setShowLyrics(false);
  }, [visualExpanded]);

  React.useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    if (!visualExpanded) {
      video.pause();
      if (Math.abs(video.currentTime - videoStart) > 0.08) video.currentTime = videoStart;
      setPlaybackVolumeMultiplier(1);
      return;
    }

    const insideSongRange = playbackTime >= songStart && playbackTime < songEnd;
    if (insideSongRange) {
      const desired = Math.max(videoStart, videoStart + playbackTime - songStart);
      if (Math.abs(video.currentTime - desired) > 0.32) video.currentTime = desired;
    }
    const mix = getMemoryAudioMix(Number(row.audio_mix), playerState.volume);
    video.volume = mix.videoVolume;
    setPlaybackVolumeMultiplier(mix.songMultiplier);
    if (playerState.isPlaying) void video.play().catch(() => {});
    else video.pause();
  }, [
    playbackTime,
    playerState.isPlaying,
    playerState.volume,
    row.audio_mix,
    setPlaybackVolumeMultiplier,
    songEnd,
    songStart,
    videoStart,
    visualExpanded,
  ]);

  React.useEffect(() => () => {
    if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    setPlaybackVolumeMultiplier(1);
  }, [setPlaybackVolumeMultiplier]);

  const beginClose = React.useCallback(() => {
    if (closeTimerRef.current) return;
    videoRef.current?.pause();
    setPlaybackVolumeMultiplier(1);
    syncAnchor();
    setVisualExpanded(false);
    closeTimerRef.current = window.setTimeout(() => {
      closeTimerRef.current = null;
      onClose();
    }, reduceMotion ? 120 : CLOSE_DURATION_MS);
  }, [onClose, reduceMotion, setPlaybackVolumeMultiplier, syncAnchor]);

  const handleNaturalProgress = React.useCallback((video: HTMLVideoElement) => {
    if (!visualExpanded) return;
    if (video.currentTime >= videoEnd - 0.04) beginClose();
  }, [beginClose, videoEnd, visualExpanded]);

  if (!anchorRect) return null;

  const isWaitingForFirstFrame = expanded && !mediaReady;
  const surfaceVisible = previewVisible || visualExpanded || isWaitingForFirstFrame;
  const targetRect = visualExpanded
    ? { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight, borderRadius: 0 }
    : anchorRect;

  return createPortal((
    <>
      <motion.div
        className="pointer-events-none fixed inset-0 z-[249] bg-black"
        initial={false}
        animate={{ opacity: visualExpanded ? 0.94 : 0 }}
        transition={{ duration: reduceMotion ? 0.12 : 0.4, ease: [0.22, 0.74, 0.22, 1] }}
        aria-hidden
      />
      <motion.div
        className={`fixed z-[250] overflow-hidden ${visualExpanded ? 'bg-black shadow-[0_28px_90px_rgba(0,0,0,0.5)]' : 'bg-transparent'}`}
        initial={false}
        animate={{
          top: targetRect.top,
          left: targetRect.left,
          width: targetRect.width,
          height: targetRect.height,
          borderRadius: targetRect.borderRadius,
          opacity: surfaceVisible ? 1 : 0,
        }}
        transition={reduceMotion
          ? { duration: 0.12 }
          : { type: 'spring', stiffness: 205, damping: 28, mass: 0.88 }}
        style={{ pointerEvents: surfaceVisible ? 'auto' : 'none', willChange: 'top, left, width, height, border-radius, opacity' }}
        data-testid="memory-video-surface"
        data-expanded={visualExpanded ? 'true' : 'false'}
      >
        <video
          ref={videoRef}
          src={videoUrl}
          poster={posterUrl || song.coverUrl}
          muted={false}
          playsInline
          preload={preloadTargetReached ? 'metadata' : 'auto'}
          className={`h-full w-full bg-black transition-opacity duration-200 ${visualExpanded ? 'object-contain' : 'object-cover'} ${mediaReady ? 'opacity-100' : 'opacity-0'}`}
          onLoadedMetadata={(event) => {
            event.currentTarget.currentTime = Math.max(0, videoStart);
          }}
          onCanPlay={(event) => {
            if (!visualExpanded) event.currentTarget.pause();
            onReady();
          }}
          onProgress={(event) => {
            const video = event.currentTarget;
            if (!Number.isFinite(video.duration) || video.duration <= 0 || video.buffered.length === 0) return;
            let bufferedDuration = 0;
            for (let index = 0; index < video.buffered.length; index += 1) {
              bufferedDuration += Math.max(0, video.buffered.end(index) - video.buffered.start(index));
            }
            if (bufferedDuration / video.duration >= 0.2) onPreloadTargetReached();
          }}
          onTimeUpdate={(event) => handleNaturalProgress(event.currentTarget)}
          onEnded={beginClose}
        />

        {isWaitingForFirstFrame ? (
          <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
            <motion.div
              className="absolute inset-y-[-25%] w-[38%] -skew-x-12 bg-gradient-to-r from-transparent via-white/18 to-transparent blur-xl"
              animate={{ x: ['-140%', '340%'] }}
              transition={{ duration: 1.65, ease: 'easeInOut', repeat: Infinity, repeatDelay: 0.2 }}
            />
          </div>
        ) : !visualExpanded ? (
          <button
            type="button"
            className="absolute inset-0 flex items-end bg-gradient-to-t from-black/52 via-transparent to-transparent p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-red-300/80"
            onClick={onExpand}
            aria-label="打开记忆 MV"
          >
            <span className="flex items-center gap-2 rounded-full bg-black/28 px-3 py-2 text-xs font-black text-white backdrop-blur-lg">
              <Icons.Play size={14} fill="currentColor" />打开这段记忆
            </span>
          </button>
        ) : (
          <>
            <VideoLyricsOverlay
              lyrics={lyrics}
              currentTime={playbackTime}
              duration={song.duration}
              playing={playerState.isPlaying}
              visible={showLyrics}
              onToggle={() => setShowLyrics((value) => !value)}
            />
            <button
              type="button"
              onClick={beginClose}
              className="absolute right-[max(18px,env(safe-area-inset-right))] top-[max(18px,env(safe-area-inset-top))] z-30 grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-black/35 text-white backdrop-blur-xl"
              aria-label="关闭记忆 MV"
            ><Icons.X size={21} /></button>
            <div className="pointer-events-none absolute inset-x-0 bottom-[max(28px,env(safe-area-inset-bottom))] z-30 flex justify-center">
              <span className="rounded-full bg-black/30 px-4 py-2 text-xs font-bold text-white/70 backdrop-blur-xl">{song.title} · 记忆片段</span>
            </div>
          </>
        )}
      </motion.div>
    </>
  ), document.body);
};
