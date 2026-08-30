import React from 'react';
import { motion } from 'framer-motion';
import { Icons } from '../Icons';
import { usePlaybackTime, useStore } from '../../store';
import { supabaseApi, type SongVideoRow } from '../../supabaseApi';
import type { Song } from '../../types';
import { useModalPresence } from '../../modalPresence';
import { getMemoryAudioMix } from '../../utils/songVideo';

export interface SongVideoTransitionOrigin {
  top: number;
  left: number;
  width: number;
  height: number;
  borderRadius: number;
}

interface SongVideoViewerProps {
  row: SongVideoRow;
  song: Song;
  posterUrl?: string;
  initialVideoUrl?: string;
  origin?: SongVideoTransitionOrigin;
  onClose: () => void;
}

const getOriginClipPath = (origin?: SongVideoTransitionOrigin) => {
  if (typeof window === 'undefined') return 'inset(22% 16% 22% 16% round 16px)';
  if (!origin) return 'inset(24% 12% 24% 12% round 18px)';
  const right = Math.max(0, window.innerWidth - origin.left - origin.width);
  const bottom = Math.max(0, window.innerHeight - origin.top - origin.height);
  return `inset(${Math.max(0, origin.top)}px ${right}px ${bottom}px ${Math.max(0, origin.left)}px round ${origin.borderRadius}px)`;
};

export const SongVideoViewer: React.FC<SongVideoViewerProps> = ({ row, song, posterUrl, initialVideoUrl, origin, onClose }) => {
  useModalPresence(true);
  const { playerState, pausePlayback, togglePlay, seek, setPlaybackVolumeMultiplier } = useStore();
  const playbackTime = usePlaybackTime();
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const wasPlayingRef = React.useRef(playerState.isPlaying);
  const closedRef = React.useRef(false);
  const memoryEnteredRef = React.useRef(false);
  const expandTimerRef = React.useRef<number | null>(null);
  const closeTimerRef = React.useRef<number | null>(null);
  const [videoUrl, setVideoUrl] = React.useState(initialVideoUrl ?? '');
  const [loadError, setLoadError] = React.useState(false);
  const [mediaReady, setMediaReady] = React.useState(false);
  const [expanded, setExpanded] = React.useState(false);
  const isMemory = row.kind === 'memory';
  const originClipPath = React.useMemo(() => getOriginClipPath(origin), [origin]);
  const fallbackPoster = posterUrl || song.coverUrl;

  React.useEffect(() => {
    if (initialVideoUrl) {
      setVideoUrl(initialVideoUrl);
      return;
    }
    let cancelled = false;
    void supabaseApi.createSignedVideoUrl(row.video_path).then((url) => {
      if (!cancelled) setVideoUrl(url);
    }).catch(() => {
      if (!cancelled) {
        setLoadError(true);
        expandTimerRef.current = window.setTimeout(() => setExpanded(true), 180);
      }
    });
    return () => {
      cancelled = true;
      if (expandTimerRef.current) window.clearTimeout(expandTimerRef.current);
      if (closeTimerRef.current) window.clearTimeout(closeTimerRef.current);
    };
  }, [initialVideoUrl, row.video_path]);

  React.useEffect(() => {
    if (isMemory) {
      const start = (row.song_start_ms ?? 0) / 1_000;
      const end = (row.song_end_ms ?? row.duration_ms) / 1_000;
      if (playbackTime < start || playbackTime >= end) seek(start);
      setPlaybackVolumeMultiplier(getMemoryAudioMix(Number(row.audio_mix), playerState.volume).songMultiplier);
      if (!playerState.isPlaying) void togglePlay();
    } else {
      pausePlayback();
    }
    return () => setPlaybackVolumeMultiplier(1);
  }, []);

  React.useEffect(() => {
    if (!isMemory || !videoUrl || !videoRef.current) return;
    const video = videoRef.current;
    const songStart = (row.song_start_ms ?? 0) / 1_000;
    const videoStart = row.video_start_ms / 1_000;
    const desired = Math.max(videoStart, videoStart + playbackTime - songStart);
    if (Math.abs(video.currentTime - desired) > 0.32) video.currentTime = desired;
    video.volume = getMemoryAudioMix(Number(row.audio_mix), playerState.volume).videoVolume;
    if (playerState.isPlaying) void video.play().catch(() => {});
    else video.pause();
  }, [isMemory, playbackTime, playerState.isPlaying, playerState.volume, row.audio_mix, row.song_start_ms, row.video_start_ms, videoUrl]);

  const revealVideo = React.useCallback(() => {
    if (mediaReady || expandTimerRef.current) return;
    setMediaReady(true);
    expandTimerRef.current = window.setTimeout(() => {
      setExpanded(true);
      expandTimerRef.current = null;
    }, 320);
  }, [mediaReady]);

  const finishClose = React.useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    setPlaybackVolumeMultiplier(1);
    if (!isMemory && wasPlayingRef.current) void togglePlay();
    onClose();
  }, [isMemory, onClose, setPlaybackVolumeMultiplier, togglePlay]);

  const close = React.useCallback(() => {
    if (closedRef.current || closeTimerRef.current) return;
    setExpanded(false);
    closeTimerRef.current = window.setTimeout(finishClose, 360);
  }, [finishClose]);

  React.useEffect(() => {
    if (!isMemory || row.song_end_ms == null) return;
    const start = (row.song_start_ms ?? 0) / 1_000;
    const end = row.song_end_ms / 1_000;
    if (playbackTime >= start && playbackTime < end) {
      memoryEnteredRef.current = true;
      return;
    }
    if (memoryEnteredRef.current && playbackTime >= end) close();
  }, [close, isMemory, playbackTime, row.song_end_ms, row.song_start_ms]);

  return (
    <motion.div
      className="pointer-events-none fixed inset-0 z-[180]"
      initial={{ backgroundColor: 'rgba(0,0,0,0)' }}
      animate={{ backgroundColor: expanded ? 'rgba(0,0,0,0.94)' : 'rgba(0,0,0,0)' }}
      transition={{ duration: 0.42, ease: [0.22, 0.74, 0.22, 1] }}
      data-testid="song-video-viewer"
      data-video-phase={loadError ? 'error' : expanded ? 'open' : mediaReady ? 'ready' : 'loading'}
    >
      <motion.div
        className="pointer-events-auto absolute inset-0 overflow-hidden bg-black shadow-[0_28px_90px_rgba(0,0,0,0.5)]"
        initial={{ clipPath: originClipPath }}
        animate={{ clipPath: expanded ? 'inset(0px 0px 0px 0px round 0px)' : originClipPath }}
        transition={{ type: 'spring', stiffness: 190, damping: 27, mass: 0.92 }}
        style={{ willChange: 'clip-path' }}
      >
        <motion.img
          src={fallbackPoster}
          alt=""
          className="absolute inset-0 h-full w-full scale-110 object-cover"
          initial={{ opacity: 1, filter: 'brightness(0.74) saturate(1.12)' }}
          animate={{
            opacity: mediaReady ? (expanded ? 0.46 : 0.58) : 1,
            filter: expanded ? 'brightness(0.5) saturate(1.3) blur(28px)' : 'brightness(0.74) saturate(1.12) blur(0px)',
            scale: expanded ? 1.18 : 1.1,
          }}
          transition={{ duration: 0.52, ease: [0.22, 0.74, 0.22, 1] }}
        />

        {videoUrl ? (
          <motion.video
            ref={videoRef}
            src={videoUrl}
            poster={fallbackPoster}
            autoPlay
            playsInline
            controls={expanded && !isMemory}
            preload="auto"
            className="absolute inset-0 h-full w-full bg-transparent object-contain"
            initial={{ opacity: 0, scale: 1.025 }}
            animate={{ opacity: mediaReady ? 1 : 0, scale: mediaReady ? 1 : 1.025 }}
            transition={{ duration: 0.34, ease: 'easeOut' }}
            onLoadedMetadata={(event) => {
              const videoStart = row.video_start_ms / 1_000;
              const songStart = (row.song_start_ms ?? 0) / 1_000;
              const desired = isMemory ? videoStart + Math.max(0, playbackTime - songStart) : videoStart;
              if (Number.isFinite(desired)) event.currentTarget.currentTime = Math.max(0, desired);
            }}
            onCanPlay={(event) => {
              revealVideo();
              void event.currentTarget.play().catch(() => {});
            }}
            onEnded={close}
            onTimeUpdate={(event) => {
              if (row.video_end_ms != null && event.currentTarget.currentTime >= row.video_end_ms / 1_000) close();
            }}
            onError={() => {
              setLoadError(true);
              setExpanded(true);
            }}
          />
        ) : null}

        {!mediaReady && !loadError ? (
          <div className="absolute inset-0 overflow-hidden">
            <motion.div
              className="absolute inset-y-[-25%] w-[44%] -skew-x-12 bg-gradient-to-r from-transparent via-white/20 to-transparent blur-xl"
              animate={{ x: ['-140%', '340%'] }}
              transition={{ duration: 1.8, ease: 'easeInOut', repeat: Infinity, repeatDelay: 0.25 }}
            />
            <div className="absolute inset-x-0 bottom-[12%] flex justify-center">
              <span className="rounded-full border border-white/12 bg-black/20 px-3 py-1.5 text-[11px] font-bold text-white/72 backdrop-blur-xl">正在准备影像</span>
            </div>
          </div>
        ) : null}

        {loadError ? (
          <div className="absolute inset-0 grid place-items-center bg-black/35 px-8 text-center">
            <div>
              <p className="text-sm font-black text-white/82">影像暂时无法加载</p>
              <p className="mt-2 text-xs leading-relaxed text-white/48">请检查网络或视频编码后重试</p>
            </div>
          </div>
        ) : null}

        <motion.button
          onClick={close}
          className="absolute right-[max(18px,env(safe-area-inset-right))] top-[max(18px,env(safe-area-inset-top))] grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-black/35 text-white backdrop-blur-xl"
          aria-label="关闭 MV"
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: expanded ? 1 : 0, scale: expanded ? 1 : 0.8 }}
          transition={{ duration: 0.24 }}
        ><Icons.X size={21} /></motion.button>
        {isMemory ? (
          <motion.div
            className="pointer-events-none absolute inset-x-0 bottom-[max(28px,env(safe-area-inset-bottom))] flex justify-center"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: expanded ? 1 : 0, y: expanded ? 0 : 8 }}
          ><span className="rounded-full bg-black/30 px-4 py-2 text-xs font-bold text-white/70 backdrop-blur-xl">{song.title} · 记忆片段</span></motion.div>
        ) : null}
      </motion.div>
    </motion.div>
  );
};
