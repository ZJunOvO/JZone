import React from 'react';
import { motion } from 'framer-motion';
import { Icons } from '../Icons';
import { usePlaybackTime, useStore } from '../../store';
import { supabaseApi, type SongVideoRow } from '../../supabaseApi';
import type { Song } from '../../types';
import { useModalPresence } from '../../modalPresence';
import { getMemoryAudioMix } from '../../utils/songVideo';

interface SongVideoViewerProps {
  row: SongVideoRow;
  song: Song;
  posterUrl?: string;
  onClose: () => void;
}

export const SongVideoViewer: React.FC<SongVideoViewerProps> = ({ row, song, posterUrl, onClose }) => {
  useModalPresence(true);
  const { playerState, pausePlayback, togglePlay, seek, setPlaybackVolumeMultiplier } = useStore();
  const playbackTime = usePlaybackTime();
  const videoRef = React.useRef<HTMLVideoElement>(null);
  const wasPlayingRef = React.useRef(playerState.isPlaying);
  const closedRef = React.useRef(false);
  const [videoUrl, setVideoUrl] = React.useState('');
  const [loadError, setLoadError] = React.useState(false);
  const isMemory = row.kind === 'memory';

  React.useEffect(() => {
    let cancelled = false;
    void supabaseApi.createSignedVideoUrl(row.video_path).then((url) => {
      if (!cancelled) setVideoUrl(url);
    }).catch(() => {
      if (!cancelled) setLoadError(true);
    });
    return () => { cancelled = true; };
  }, [row.video_path]);

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

  const close = React.useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    setPlaybackVolumeMultiplier(1);
    if (!isMemory && wasPlayingRef.current) void togglePlay();
    onClose();
  }, [isMemory, onClose, setPlaybackVolumeMultiplier, togglePlay]);

  React.useEffect(() => {
    if (!isMemory || row.song_end_ms == null) return;
    if (playbackTime >= row.song_end_ms / 1_000) close();
  }, [close, isMemory, playbackTime, row.song_end_ms]);

  return (
    <motion.div className="fixed inset-0 z-[180] bg-black" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={{ duration: 0.28 }}>
      <motion.div className="relative h-full w-full overflow-hidden" initial={{ scale: 0.92, borderRadius: 36 }} animate={{ scale: 1, borderRadius: 0 }} exit={{ scale: 0.94, opacity: 0 }} transition={{ type: 'spring', stiffness: 240, damping: 29 }}>
        {posterUrl && !videoUrl ? <img src={posterUrl} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70 blur-sm" /> : null}
        {videoUrl ? (
          <video
            ref={videoRef}
            src={videoUrl}
            poster={posterUrl}
            autoPlay
            playsInline
            controls={!isMemory}
            preload="auto"
            className="h-full w-full bg-black object-contain"
            onEnded={close}
            onTimeUpdate={(event) => {
              if (row.video_end_ms != null && event.currentTarget.currentTime >= row.video_end_ms / 1_000) close();
            }}
            onError={() => setLoadError(true)}
          />
        ) : null}
        {!videoUrl && !loadError ? <div className="absolute inset-0 grid place-items-center text-sm font-bold text-white/55">正在打开影像…</div> : null}
        {loadError ? <div className="absolute inset-0 grid place-items-center px-8 text-center text-sm font-bold text-white/65">影像暂时无法加载，请检查网络后重试</div> : null}
        <button onClick={close} className="absolute right-[max(18px,env(safe-area-inset-right))] top-[max(18px,env(safe-area-inset-top))] grid h-11 w-11 place-items-center rounded-full border border-white/15 bg-black/35 text-white backdrop-blur-xl" aria-label="关闭 MV"><Icons.X size={21} /></button>
        {isMemory ? <div className="pointer-events-none absolute inset-x-0 bottom-[max(28px,env(safe-area-inset-bottom))] flex justify-center"><span className="rounded-full bg-black/30 px-4 py-2 text-xs font-bold text-white/70 backdrop-blur-xl">{song.title} · 记忆片段</span></div> : null}
      </motion.div>
    </motion.div>
  );
};
