import React, { useState } from 'react';
import { usePlaybackTime, useStore } from '../store';
import { useAuth } from '../auth';
import { Icons } from '../components/Icons';
import { CommentsSheet } from '../components/CommentsSheet';
import { MemoryCardModal } from '../components/MemoryCardModal';
import { UniversalContextMenu } from '../components/UniversalContextMenu';
import { LyricsEmptyState } from '../components/lyrics/LyricsEmptyState';
import { LyricsRenderer } from '../components/lyrics/LyricsRenderer';
import { useModalPresence } from '../modalPresence';
import { SkeletonBlock } from '../components/Skeletons';
import {
  AnimatePresence,
  animate,
  motion,
  Reorder,
  useDragControls,
  useMotionTemplate,
  useMotionValue,
  useReducedMotion,
  useTransform,
  type AnimationPlaybackControls,
} from 'framer-motion';
import type { Song } from '../types';
import { supabaseApi, type SongLyricsRow } from '../supabaseApi';
import { parseLyrics, type LyricsInput, type ParsedLyrics } from '../utils/lyrics';
import { SONG_LYRICS_UPDATED_EVENT, type SongLyricsUpdatedEvent } from '../utils/lyrics/events';
import { PlayerSharedElement } from '../components/motion/PlayerSharedElement';
import { PlayerArtworkTransition } from '../components/motion/PlayerArtworkTransition';
import {
  getPlayerOriginInsets,
  PLAYER_SHELL_DURATION,
  PLAYER_SHELL_EASE,
  PLAYER_SHELL_EXIT_DURATION,
  type PlayerTransitionOrigin,
  type PlayerTransitionPhase,
  type PlayerSharedOrigin,
} from '../components/motion/playerTransition';

const SongLyricsEditorDialog = React.lazy(() => import('../components/lyrics/SongLyricsEditorDialog').then(({ SongLyricsEditorDialog: Component }) => ({
  default: Component,
})));

interface PlayerViewProps {
  onClose: () => void;
  transitionPhase: PlayerTransitionPhase;
  transitionOrigin: PlayerTransitionOrigin;
  sharedOrigin: PlayerSharedOrigin;
  lyricsRequest?: PlayerLyricsRequest | null;
  onLyricsRequestHandled?: (nonce: number) => void;
}

interface PlayerLyricsRequest {
  songId: string;
  nonce: number;
}

type PlayerLyricsLoadState = 'idle' | 'loading' | 'ready' | 'empty' | 'error';

const PLAYER_LYRICS_UI_CACHE_FRESH_MS = 10 * 60_000;
interface PlayerLyricsUiCacheEntry {
  row: SongLyricsRow | null;
  updatedAt: number;
}
const playerLyricsUiCache = new Map<string, PlayerLyricsUiCacheEntry>();
const getPlayerLyricsUiCacheKey = (viewerId: string | undefined, songId: string) => `${viewerId ?? 'anonymous'}:${songId}`;

const shiftLyricsTime = (timeMs: number | null, offsetMs: number) => (
  timeMs === null ? null : Math.max(0, timeMs + offsetMs)
);

const getPlayerLyricsInput = (row: SongLyricsRow): LyricsInput | ParsedLyrics => {
  const input: LyricsInput = { format: row.format, content: row.raw_content };
  if (!row.offset_ms) return input;

  try {
    const parsed = parseLyrics(input);
    return {
      ...parsed,
      lines: parsed.lines.map((line) => ({
        ...line,
        startTimeMs: shiftLyricsTime(line.startTimeMs, row.offset_ms),
        endTimeMs: shiftLyricsTime(line.endTimeMs, row.offset_ms),
        words: line.words.map((word) => ({
          ...word,
          startTimeMs: Math.max(0, word.startTimeMs + row.offset_ms),
          endTimeMs: Math.max(0, word.endTimeMs + row.offset_ms),
        })),
      })),
    };
  } catch {
    return input;
  }
};

const getLyricsErrorMessage = (error: unknown) => {
  if (error instanceof Error && error.message.trim()) return error.message;
  if (typeof error === 'string' && error.trim()) return error;
  return '歌词加载失败，请检查网络后重试。';
};

const formatTime = (time: number) => {
  const min = Math.floor(time / 60);
  const sec = Math.floor(time % 60);
  return `${min}:${sec < 10 ? '0' : ''}${sec}`;
};

const QueueSongRow: React.FC<{
  song: Song;
  currentSongId: string;
  isPlaying: boolean;
  sorting: boolean;
  onPlay: () => void;
  onRemove: () => void;
}> = ({ song, currentSongId, isPlaying, sorting, onPlay, onRemove }) => {
  const dragControls = useDragControls();
  const active = song.id === currentSongId;
  const content = (
    <>
      <img src={song.coverUrl} loading="lazy" decoding="async" className="w-12 h-12 rounded-lg object-cover mr-4 shadow-md" alt="" />
      <div className="flex-1 min-w-0">
        <h4 className={`text-sm font-bold truncate ${active ? 'text-white' : 'text-zinc-300'}`}>{song.title}</h4>
        <p className="text-[11px] text-zinc-500 truncate font-medium mt-0.5">{song.artist}</p>
      </div>
      <div className="flex items-center gap-1">
        {active && isPlaying ? (
          <div className="flex gap-[2px] items-end h-3 mr-3" aria-hidden="true">
            <div className="w-0.5 bg-white animate-[bounce_1s_infinite] h-full" />
            <div className="w-0.5 bg-white animate-[bounce_1.2s_infinite] h-2/3" />
            <div className="w-0.5 bg-white animate-[bounce_0.8s_infinite] h-1/2" />
          </div>
        ) : null}
        {sorting ? (
          <button
            type="button"
            onPointerDown={(event) => {
              event.stopPropagation();
              dragControls.start(event);
            }}
            onClick={(event) => event.stopPropagation()}
            className="w-11 h-11 flex items-center justify-center text-white/55 touch-none cursor-grab active:cursor-grabbing"
            aria-label={`拖动排序 ${song.title}`}
          >
            <Icons.GripVertical size={19} />
          </button>
        ) : (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
            className="w-11 h-11 flex items-center justify-center text-white/25 hover:text-red-500 transition-colors"
            aria-label={`从待播放移除 ${song.title}`}
          >
            <Icons.X size={16} strokeWidth={2} />
          </button>
        )}
      </div>
    </>
  );

  const className = `flex items-center p-3 rounded-2xl transition group touch-pan-y ${active ? 'bg-white/10' : 'hover:bg-white/5'}`;
  const rowStyle: React.CSSProperties = { contentVisibility: 'auto', containIntrinsicSize: '72px' };
  if (!sorting) {
    return <div onClick={onPlay} className={`${className} cursor-pointer`} style={rowStyle}>{content}</div>;
  }
  return (
    <Reorder.Item
      value={song.id}
      dragListener={false}
      dragControls={dragControls}
      onClick={onPlay}
      className={className}
      style={rowStyle}
      whileDrag={{ scale: 1.02, backgroundColor: 'rgba(255,255,255,0.12)', zIndex: 10 }}
    >
      {content}
    </Reorder.Item>
  );
};

export const PlayerView: React.FC<PlayerViewProps> = ({
  onClose,
  transitionPhase,
  transitionOrigin,
  sharedOrigin,
  lyricsRequest,
  onLyricsRequestHandled,
}) => {
  const { user } = useAuth();
  const { playerState, getCurrentSong, songs, togglePlay, pausePlayback, getCurrentAudioSource, nextSong, prevSong, cyclePlaybackMode, seek, setVolume, playSong, removeFromQueue, reorderQueue, toggleFavorite, isFavorite } = useStore();
  const song = getCurrentSong();
  const initialLyricsCacheEntry = song
    ? playerLyricsUiCache.get(getPlayerLyricsUiCacheKey(user?.id, song.id))
    : undefined;
  const playbackTime = usePlaybackTime();
  const [isQueueOpen, setIsQueueOpen] = useState(false);
  const [isQueueClosing, setIsQueueClosing] = useState(false);
  const [isQueueSorting, setIsQueueSorting] = useState(false);
  const [isCommentsOpen, setIsCommentsOpen] = useState(false);
  const [isMemoryOpen, setIsMemoryOpen] = useState(false);
  const [memoryOpenNonce, setMemoryOpenNonce] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [isChangingVolume, setIsChangingVolume] = useState(false);
  const [contextMenuOpen, setContextMenuOpen] = useState(false);
  const [contextMenuOpenNonce, setContextMenuOpenNonce] = useState(0);
  const [menuAnchor, setMenuAnchor] = useState<{ x: number; y: number } | undefined>(undefined);
  const [isLyricsViewOpen, setIsLyricsViewOpen] = useState(false);
  const [lyricsLoadState, setLyricsLoadState] = useState<PlayerLyricsLoadState>(
    initialLyricsCacheEntry ? (initialLyricsCacheEntry.row ? 'ready' : 'empty') : 'idle',
  );
  const [lyricsRow, setLyricsRow] = useState<SongLyricsRow | null>(initialLyricsCacheEntry?.row ?? null);
  const [lyricsError, setLyricsError] = useState<string | null>(null);
  const [lyricsRetryNonce, setLyricsRetryNonce] = useState(0);
  const [isLyricsEditorOpen, setIsLyricsEditorOpen] = useState(false);
  const [lyricsEditorAudioUrl, setLyricsEditorAudioUrl] = useState('');
  const [areLyricsControlsVisible, setAreLyricsControlsVisible] = useState(true);
  const reduceMotion = useReducedMotion();
  const openLyricsEditor = React.useCallback(() => {
    setLyricsEditorAudioUrl(getCurrentAudioSource() || song?.audioUrl || '');
    pausePlayback();
    setIsLyricsEditorOpen(true);
  }, [getCurrentAudioSource, pausePlayback, song?.audioUrl]);
  const initialInsets = getPlayerOriginInsets(transitionOrigin);
  const originInsetsRef = React.useRef(initialInsets);
  originInsetsRef.current = initialInsets;
  const clipProgress = useMotionValue(0);
  const remainingClip = (progress: number) => 1 - Math.max(0, Math.min(1, progress));
  const clipTop = useTransform(clipProgress, (progress) => originInsetsRef.current.top * remainingClip(progress));
  const clipRight = useTransform(clipProgress, (progress) => originInsetsRef.current.right * remainingClip(progress));
  const clipBottom = useTransform(clipProgress, (progress) => originInsetsRef.current.bottom * remainingClip(progress));
  const clipLeft = useTransform(clipProgress, (progress) => originInsetsRef.current.left * remainingClip(progress));
  const clipRadius = useTransform(clipProgress, (progress) => originInsetsRef.current.radius * remainingClip(progress));
  const clipPath = useMotionTemplate`inset(${clipTop}px ${clipRight}px ${clipBottom}px ${clipLeft}px round ${clipRadius}px)`;
  const surfaceOpacity = useTransform(clipProgress, [0, 0.18, 0.55, 1], [0, 1, 1, 1]);
  const clipAnimationRef = React.useRef<AnimationPlaybackControls | null>(null);
  const clipPhaseRef = React.useRef<PlayerTransitionPhase | null>(null);
  const queueCloseTimerRef = React.useRef<number | null>(null);
  const previousArtworkSongIdRef = React.useRef<string | null>(null);
  const currentSongIdRef = React.useRef<string | null>(null);
  const currentLyricsCacheKeyRef = React.useRef<string | null>(null);
  const lyricsTouchStartRef = React.useRef<{ x: number; y: number } | null>(null);
  const lyricsControlsTimerRef = React.useRef<number | null>(null);

  useModalPresence(isMemoryOpen);
  useModalPresence(isQueueOpen);
  useModalPresence(isCommentsOpen);
  React.useEffect(() => {
    if (!isQueueOpen) setIsQueueSorting(false);
  }, [isQueueOpen]);

  const openQueue = React.useCallback(() => {
    if (queueCloseTimerRef.current) window.clearTimeout(queueCloseTimerRef.current);
    queueCloseTimerRef.current = null;
    setIsQueueClosing(false);
    setIsQueueOpen(true);
  }, []);

  const closeQueue = React.useCallback(() => {
    if (isQueueClosing) return;
    if (reduceMotion) {
      setIsQueueOpen(false);
      return;
    }
    setIsQueueClosing(true);
    queueCloseTimerRef.current = window.setTimeout(() => {
      setIsQueueOpen(false);
      setIsQueueClosing(false);
      queueCloseTimerRef.current = null;
    }, 300);
  }, [isQueueClosing, reduceMotion]);

  React.useEffect(() => () => {
    if (queueCloseTimerRef.current) window.clearTimeout(queueCloseTimerRef.current);
  }, []);
  
  currentSongIdRef.current = song?.id ?? null;
  currentLyricsCacheKeyRef.current = song ? getPlayerLyricsUiCacheKey(user?.id, song.id) : null;

  const revealLyricsControls = React.useCallback(() => {
    if (lyricsControlsTimerRef.current) window.clearTimeout(lyricsControlsTimerRef.current);
    lyricsControlsTimerRef.current = null;
    setAreLyricsControlsVisible(true);
    if (!isLyricsViewOpen || !playerState.isPlaying || isSeeking || isChangingVolume) return;
    lyricsControlsTimerRef.current = window.setTimeout(() => {
      setAreLyricsControlsVisible(false);
      lyricsControlsTimerRef.current = null;
    }, 4_200);
  }, [isChangingVolume, isLyricsViewOpen, isSeeking, playerState.isPlaying]);

  React.useEffect(() => {
    revealLyricsControls();
    return () => {
      if (lyricsControlsTimerRef.current) window.clearTimeout(lyricsControlsTimerRef.current);
      lyricsControlsTimerRef.current = null;
    };
  }, [revealLyricsControls, song?.id]);

  React.useEffect(() => {
    let cancelled = false;
    if (!song?.id) {
      setLyricsLoadState('idle');
      setLyricsRow(null);
      setLyricsError(null);
      return () => {
        cancelled = true;
      };
    }

    const cacheKey = getPlayerLyricsUiCacheKey(user?.id, song.id);
    const cachedEntry = playerLyricsUiCache.get(cacheKey);
    if (cachedEntry) {
      setLyricsRow(cachedEntry.row);
      setLyricsLoadState(cachedEntry.row ? 'ready' : 'empty');
      setLyricsError(null);
      if (Date.now() - cachedEntry.updatedAt < PLAYER_LYRICS_UI_CACHE_FRESH_MS) {
        return () => {
          cancelled = true;
        };
      }
    } else {
      setLyricsLoadState('loading');
      setLyricsRow(null);
      setLyricsError(null);
    }

    void supabaseApi.fetchSongLyrics(song.id).then((row) => {
      if (cancelled) return;
      playerLyricsUiCache.set(cacheKey, { row, updatedAt: Date.now() });
      setLyricsRow(row);
      setLyricsLoadState(row ? 'ready' : 'empty');
    }).catch((error: unknown) => {
      if (cancelled) return;
      if (cachedEntry) return;
      setLyricsRow(null);
      setLyricsLoadState('error');
      setLyricsError(getLyricsErrorMessage(error));
    });

    return () => {
      cancelled = true;
    };
  }, [lyricsRetryNonce, song?.id, user?.id]);

  React.useEffect(() => {
    const handleLyricsUpdated = (event: Event) => {
      const detail = (event as SongLyricsUpdatedEvent).detail;
      if (!detail?.songId || detail.songId !== currentSongIdRef.current) return;
      if (currentLyricsCacheKeyRef.current) playerLyricsUiCache.delete(currentLyricsCacheKeyRef.current);
      setLyricsRetryNonce((value) => value + 1);
    };
    window.addEventListener(SONG_LYRICS_UPDATED_EVENT, handleLyricsUpdated);
    return () => window.removeEventListener(SONG_LYRICS_UPDATED_EVENT, handleLyricsUpdated);
  }, []);

  React.useEffect(() => {
    if (!lyricsRequest || lyricsRequest.songId !== song?.id) return;
    setIsLyricsViewOpen(true);
    onLyricsRequestHandled?.(lyricsRequest.nonce);
  }, [lyricsRequest, onLyricsRequestHandled, song?.id]);

  React.useEffect(() => {
    setIsLyricsEditorOpen(false);
  }, [song?.id]);

  const playerLyricsInput = React.useMemo(
    () => lyricsRow ? getPlayerLyricsInput(lyricsRow) : null,
    [lyricsRow?.format, lyricsRow?.raw_content, lyricsRow?.offset_ms],
  );

  const previousArtworkSongId = previousArtworkSongIdRef.current;
  const previousArtworkIndex = previousArtworkSongId ? playerState.queue.indexOf(previousArtworkSongId) : -1;
  const currentArtworkIndex = song ? playerState.queue.indexOf(song.id) : -1;
  const artworkDirection: -1 | 1 = previousArtworkIndex === 0 && currentArtworkIndex === playerState.queue.length - 1
    ? -1
    : previousArtworkIndex === playerState.queue.length - 1 && currentArtworkIndex === 0
      ? 1
      : previousArtworkIndex >= 0 && currentArtworkIndex >= 0 && currentArtworkIndex < previousArtworkIndex
        ? -1
        : 1;
  React.useEffect(() => {
    if (song?.id) previousArtworkSongIdRef.current = song.id;
  }, [song?.id]);
  const isClosing = transitionPhase === 'closing';
  const secondaryInitial = reduceMotion ? false : { opacity: 0, y: 14 };
  const secondaryAnimate = isClosing
    ? { opacity: 0, y: 8 }
    : { opacity: 1, y: 0 };
  const secondaryTransition = (order = 0) => reduceMotion
    ? { duration: 0.12 }
    : isClosing
      ? { duration: 0.14, ease: 'easeIn' as const }
      : { duration: 0.28, delay: 0.1 + order * 0.038, ease: PLAYER_SHELL_EASE };

  const stopClipAnimations = React.useCallback(() => {
    clipAnimationRef.current?.stop();
    clipAnimationRef.current = null;
  }, []);

  const animateClipTo = React.useCallback((target: 0 | 1, duration: number) => {
    stopClipAnimations();
    clipAnimationRef.current = animate(clipProgress, target, {
      duration,
      ease: [...PLAYER_SHELL_EASE] as [number, number, number, number],
    });
  }, [clipProgress, stopClipAnimations]);

  React.useLayoutEffect(() => {
    if (clipPhaseRef.current !== null) return;
    clipPhaseRef.current = transitionPhase;
    clipProgress.set(0);
    if (reduceMotion) {
      clipProgress.set(1);
    }
  }, [clipProgress, reduceMotion, transitionPhase]);

  React.useEffect(() => {
    if (!reduceMotion && clipPhaseRef.current === 'opening') {
      animateClipTo(1, PLAYER_SHELL_DURATION);
    }
    return stopClipAnimations;
  }, [animateClipTo, reduceMotion, stopClipAnimations]);

  React.useLayoutEffect(() => {
    if (clipPhaseRef.current === transitionPhase) return;
    clipPhaseRef.current = transitionPhase;
    if (transitionPhase === 'open') {
      stopClipAnimations();
      clipProgress.set(1);
      return;
    }
    if (reduceMotion) {
      stopClipAnimations();
      clipProgress.set(isClosing ? 0 : 1);
      return;
    }
    animateClipTo(isClosing ? 0 : 1, isClosing ? PLAYER_SHELL_EXIT_DURATION : PLAYER_SHELL_DURATION);
  }, [animateClipTo, clipProgress, isClosing, reduceMotion, stopClipAnimations, transitionPhase]);

  React.useEffect(() => stopClipAnimations, [stopClipAnimations]);

  if (!song) return null;
  const isFav = isFavorite(song.id);
  const playbackModeMeta = {
    sequence: { label: '顺序播放', Icon: Icons.List },
    'repeat-one': { label: '单曲循环', Icon: Icons.Repeat1 },
    shuffle: { label: '随机播放', Icon: Icons.Shuffle },
  }[playerState.playbackMode];
  const PlaybackModeIcon = playbackModeMeta.Icon;

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    seek(Number(e.target.value));
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setVolume(Number(e.target.value));
  };

  const trimStart = Number.isFinite(song.trimStart) ? song.trimStart : 0;
  const trimEnd = Number.isFinite(song.trimEnd) && song.trimEnd > trimStart ? song.trimEnd : song.duration;
  const playableDuration = Math.max(0.1, trimEnd - trimStart);
  const currentTime = Math.max(trimStart, Math.min(trimEnd, playbackTime));
  const progressPct = Math.max(0, Math.min(100, ((currentTime - trimStart) / playableDuration) * 100));
  const remainingTime = Math.max(0, trimEnd - currentTime);
  const volumePct = playerState.volume * 100;

  // Only show songs that are in the queue
  const queueSongs = songs.filter(s => playerState.queue.includes(s.id))
    .sort((a, b) => playerState.queue.indexOf(a.id) - playerState.queue.indexOf(b.id));
  const isOwner = Boolean(user?.id && song.ownerId === user.id);
  const lyricsContent = lyricsLoadState === 'loading' ? (
    <div className="flex h-full min-h-[240px] flex-col items-center justify-center px-6 text-center" data-testid="player-lyrics-loading" role="status" aria-live="polite">
      <Icons.RotateCcw size={24} className="animate-spin text-white/55" aria-hidden="true" />
      <p className="mt-4 text-sm font-bold text-white/75">正在加载歌词…</p>
      <p className="mt-2 text-xs leading-5 text-white/40">正在读取当前歌曲的歌词。</p>
    </div>
  ) : lyricsLoadState === 'error' ? (
    <div className="flex h-full min-h-[240px] flex-col items-center justify-center px-6 text-center" data-testid="player-lyrics-error" role="alert">
      <p className="text-base font-bold text-red-200">歌词加载失败</p>
      <p className="mt-2 max-w-xs text-sm leading-6 text-white/55">{lyricsError}</p>
      <button
        type="button"
        onClick={() => setLyricsRetryNonce((value) => value + 1)}
        className="mt-5 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full bg-white px-5 text-sm font-black text-black transition-colors hover:bg-red-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/70"
        data-testid="player-lyrics-retry"
      >
        <Icons.RotateCcw size={16} aria-hidden="true" />
        重新加载
      </button>
    </div>
  ) : lyricsLoadState === 'empty' ? (
    <div className="flex h-full min-h-[240px] flex-col items-center justify-center px-4 text-center" data-testid="player-lyrics-empty">
      <LyricsEmptyState className="min-h-0 flex-1" />
      {isOwner && (
        <button
          type="button"
          onClick={openLyricsEditor}
          className="mb-5 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-white/15 bg-white/10 px-5 text-sm font-bold text-white transition-colors hover:bg-white/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/70"
          data-testid="player-lyrics-add"
        >
          <Icons.Edit size={16} aria-hidden="true" />
          添加歌词
        </button>
      )}
    </div>
  ) : playerLyricsInput ? (
    <LyricsRenderer
      lyrics={playerLyricsInput}
      currentTime={currentTime}
      duration={Math.max(0, trimEnd)}
      playing={playerState.isPlaying}
      onSeek={seek}
      reducedMotion={Boolean(reduceMotion)}
      className="h-full min-h-0"
      data-testid="player-lyrics-renderer"
    />
  ) : (
    <LyricsEmptyState />
  );
  const handleCoverTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.changedTouches[0];
    lyricsTouchStartRef.current = touch ? { x: touch.clientX, y: touch.clientY } : null;
  };
  const handleCoverTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = lyricsTouchStartRef.current;
    lyricsTouchStartRef.current = null;
    if (!start) return;
    const touch = event.changedTouches[0];
    if (!touch) return;
    const deltaX = touch.clientX - start.x;
    const deltaY = touch.clientY - start.y;
    if (Math.abs(deltaX) < 48 || Math.abs(deltaX) < Math.abs(deltaY)) return;
    setIsLyricsViewOpen(deltaX < 0);
  };

  return (
    <motion.div
      className="fixed inset-0 z-[200] flex flex-col h-screen justify-between py-8 overflow-hidden"
      style={{ clipPath, willChange: 'clip-path', transform: 'translateZ(0)', backfaceVisibility: 'hidden', contain: 'paint' }}
      data-testid="player-transition-shell"
      data-player-transition-phase={transitionPhase}
      onPointerDown={revealLyricsControls}
      onKeyDown={revealLyricsControls}
    >
      {/* 1. Immersive Dynamic Background Layer */}
      <motion.div
        className="absolute inset-0 z-0 scale-125 overflow-hidden pointer-events-none bg-black"
        style={{ opacity: surfaceOpacity }}
        data-player-transition-part="background"
      >
        <AnimatePresence initial={false}>
          <motion.img
            key={song.id}
            src={song.coverUrl}
            decoding="async"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: reduceMotion ? 0.12 : 0.5, ease: 'easeOut' }}
            className="absolute inset-0 w-full h-full object-cover blur-[72px] brightness-[0.55] saturate-[1.6]"
            alt="immersive background"
          />
        </AnimatePresence>
        <div className="absolute inset-0 bg-black/20"></div>
      </motion.div>

      {/* Top Handle indicator */}
      <motion.button
        type="button"
        className="flex justify-center pt-2 pb-2 cursor-pointer relative z-10"
        onClick={onClose}
        aria-label="收起播放页"
        data-testid="player-view-close"
        initial={secondaryInitial}
        animate={secondaryAnimate}
        transition={secondaryTransition(0)}
      >
        <div className="w-10 h-1.5 bg-white/20 rounded-full"></div>
      </motion.button>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col px-8 justify-between mt-2 relative z-10">
        {transitionPhase === 'opening' && !reduceMotion && (
          <motion.div
            aria-hidden
            data-testid="player-secondary-blur-reveal"
            className="pointer-events-none absolute inset-x-2 bottom-0 z-20 h-[38%] rounded-[32px] bg-black/[0.004] backdrop-blur-[4px]"
            initial={{ opacity: 0.92, y: 10 }}
            animate={{ opacity: 0, y: 0, transitionEnd: { display: 'none' } }}
            transition={{ duration: 0.36, delay: 0.025, ease: PLAYER_SHELL_EASE }}
            style={{
              willChange: 'transform, opacity',
              maskImage: 'linear-gradient(to bottom, transparent 0%, black 18%, black 100%)',
              WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 18%, black 100%)',
            }}
          />
        )}

        {/* Cover / lyrics shared layout */}
        <motion.section
          layout={!reduceMotion}
          className={`relative grid min-h-0 ${isLyricsViewOpen ? 'flex-1 gap-x-4 gap-y-3' : 'flex-grow-[2] gap-y-3'}`}
          style={isLyricsViewOpen ? {
            gridTemplateColumns: '76px minmax(0, 1fr)',
            gridTemplateRows: '76px minmax(0, 1fr)',
          } : {
            gridTemplateColumns: 'minmax(0, 1fr)',
            gridTemplateRows: 'minmax(0, 1fr) auto',
          }}
          data-testid="player-cover-area"
          onTouchStart={handleCoverTouchStart}
          onTouchEnd={handleCoverTouchEnd}
          onTouchCancel={() => { lyricsTouchStartRef.current = null; }}
        >
          <motion.div
            layout={!reduceMotion}
            className={`relative self-center justify-self-center ${isLyricsViewOpen ? 'h-[76px] w-[76px]' : 'aspect-square w-[96%] max-w-[400px]'}`}
            transition={{ layout: reduceMotion ? { duration: 0 } : { duration: 0.46, ease: [0.22, 0.74, 0.22, 1] } }}
            data-testid="player-cover-layout"
          >
            <PlayerSharedElement
              className="relative h-full w-full"
              sourceRect={sharedOrigin.cover}
              phase={transitionPhase}
              name="cover"
            >
              <button
                type="button"
                onClick={() => setIsLyricsViewOpen((value) => !value)}
                className="group relative block h-full w-full cursor-pointer rounded-[14px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/80 focus-visible:ring-offset-4 focus-visible:ring-offset-black/40"
                aria-pressed={isLyricsViewOpen}
                aria-label={isLyricsViewOpen ? '查看封面' : '查看歌词'}
                data-testid="player-cover-button"
              >
                <div
                  className={`pointer-events-none absolute inset-[7%] translate-y-[8%] rounded-[24px] bg-black/65 transition-[transform,opacity,filter] duration-500 ease-out ${
                    isLyricsViewOpen
                      ? 'scale-[0.82] opacity-25 blur-[16px]'
                      : playerState.isPlaying
                        ? 'scale-100 opacity-[0.55] blur-[32px]'
                        : 'scale-[0.84] opacity-[0.42] blur-[36px]'
                  }`}
                  data-testid="player-cover-soft-shadow"
                  aria-hidden
                />
                <PlayerArtworkTransition artworkKey={song.id} direction={artworkDirection}>
                  <div
                    className={`relative h-full w-full transition-[transform,opacity] duration-500 ease-out ${isLyricsViewOpen || playerState.isPlaying ? 'scale-100 opacity-100' : 'scale-[0.88] opacity-80'}`}
                    data-testid="player-cover-visual"
                  >
                    <img
                      src={song.coverUrl}
                      alt=""
                      className="h-full w-full rounded-[14px] border border-white/10 object-cover shadow-[0_16px_42px_-22px_rgba(0,0,0,0.42)] transition-[filter] duration-200 group-hover:brightness-105"
                      data-testid="player-cover-image"
                    />
                  </div>
                </PlayerArtworkTransition>
              </button>
            </PlayerSharedElement>
          </motion.div>

          {/* Song Info & Action Buttons */}
          <motion.div
            layout={!reduceMotion}
            className="flex min-w-0 items-center justify-between"
            transition={{ layout: reduceMotion ? { duration: 0 } : { duration: 0.42, ease: [0.22, 0.74, 0.22, 1] } }}
            data-testid="player-song-info"
          >
          <button
            type="button"
            className={`flex-1 min-w-0 pr-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300/70 ${isLyricsViewOpen ? 'cursor-pointer rounded-xl' : 'cursor-default'}`}
            onClick={() => {
              if (isLyricsViewOpen) setIsLyricsViewOpen(false);
            }}
            aria-label={isLyricsViewOpen ? '返回封面' : undefined}
            data-testid="player-song-info-button"
          >
            <PlayerSharedElement sourceRect={sharedOrigin.title} phase={transitionPhase} name="title">
              <h2 className={`${isLyricsViewOpen ? 'text-lg' : 'text-2xl'} truncate font-bold tracking-tight text-white transition-[font-size] duration-300`}>{song.title}</h2>
            </PlayerSharedElement>
            <PlayerSharedElement sourceRect={sharedOrigin.artist} phase={transitionPhase} name="artist">
              <p className={`${isLyricsViewOpen ? 'text-sm' : 'text-lg'} truncate font-medium text-white/60 transition-[font-size] duration-300`}>{song.artist}</p>
            </PlayerSharedElement>
          </button>
          <motion.div
            className="flex items-center gap-2"
            initial={secondaryInitial}
            animate={secondaryAnimate}
            transition={secondaryTransition(1)}
          >
            <button
              onClick={() => toggleFavorite(song.id)}
              className={`w-10 h-10 rounded-full flex items-center justify-center active:scale-90 transition ${isFav ? 'bg-red-500/20 text-red-400' : 'bg-white/10 text-white/90'}`}
              aria-label={isFav ? `取消收藏 ${song.title}` : `收藏 ${song.title}`}
            >
              <Icons.Heart size={18} strokeWidth={1.5} fill={isFav ? 'currentColor' : 'none'} />
            </button>
            <button 
                onClick={(e) => {
                  const rect = e.currentTarget.getBoundingClientRect();
                  setMenuAnchor({ x: rect.left, y: rect.top });
                  setContextMenuOpenNonce((value) => value + 1);
                  setContextMenuOpen(true);
                }}
                className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white/90 active:scale-90 transition"
                aria-label={`打开 ${song.title} 的更多操作`}
                data-testid="player-more-menu"
            >
              <Icons.MoreHorizontal size={18} strokeWidth={1.5} />
            </button>
          </motion.div>
          </motion.div>

          {isLyricsViewOpen && (
            <motion.div
              className="col-span-2 min-h-0 overflow-hidden"
              initial={reduceMotion ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={reduceMotion ? { duration: 0.1 } : { duration: 0.3, delay: 0.08, ease: 'easeOut' }}
              data-testid="player-lyrics-panel"
            >
              {lyricsContent}
            </motion.div>
          )}
        </motion.section>

        <div
          className={`overflow-hidden transition-[max-height,opacity,transform] ease-[cubic-bezier(0.22,0.74,0.22,1)] ${reduceMotion ? 'duration-100' : 'duration-500'} ${isLyricsViewOpen && !areLyricsControlsVisible ? 'pointer-events-none max-h-0 translate-y-3 opacity-0' : 'max-h-[320px] translate-y-0 opacity-100'}`}
          aria-hidden={isLyricsViewOpen && !areLyricsControlsVisible ? 'true' : undefined}
          data-testid="player-lower-controls"
          data-controls-visible={areLyricsControlsVisible ? 'true' : 'false'}
        >
          {/* 5. Progress Bar - Apple style with Thickening Animation */}
          <motion.div
            className={isLyricsViewOpen ? 'mt-3' : 'mt-8'}
            initial={secondaryInitial}
            animate={secondaryAnimate}
            transition={secondaryTransition(2)}
            data-player-transition-part="secondary"
            data-testid="player-progress"
          >
          {playerState.isAudioLoading ? (
            <SkeletonBlock className="w-full h-1.5 rounded-full" />
          ) : (
            <div
              className={`relative w-full bg-white/20 rounded-full overflow-hidden transition-all duration-300 ease-out ${isSeeking ? 'h-[7px]' : 'h-1.5'}`}
            >
              <div
                className="absolute top-0 left-0 h-full bg-white transition-all duration-100 pointer-events-none"
                style={{ width: `${progressPct}%` }}
              ></div>
              <input
                type="range"
                min={trimStart}
                max={trimEnd}
                step="0.1"
                value={currentTime}
                onChange={handleSeek}
                onMouseDown={() => setIsSeeking(true)}
                onMouseUp={() => setIsSeeking(false)}
                onTouchStart={() => setIsSeeking(true)}
                onTouchEnd={() => setIsSeeking(false)}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none z-10"
                aria-label="播放进度"
              />
            </div>
          )}
          <div className="flex justify-between text-[11px] font-bold text-white/40 tracking-wider font-mono mt-2 tabular-nums">
            <span>{formatTime(currentTime)}</span>
            <span>-{formatTime(remainingTime)}</span>
          </div>
        </motion.div>

        {/* Main Playback Controls */}
        <motion.div className="flex items-center justify-around px-4 mt-2" initial={secondaryInitial} animate={secondaryAnimate} transition={secondaryTransition(3)}>
          <button onClick={prevSong} data-testid="player-previous-song" className="w-11 h-11 flex items-center justify-center text-white opacity-80 hover:opacity-100 transition active:scale-90" aria-label="上一首">
            <Icons.SkipBack size={26} fill="currentColor" />
          </button>
          <button 
            onClick={togglePlay} 
            data-testid="player-toggle-play"
            className="w-16 h-16 flex items-center justify-center text-white active:scale-95 transition"
            aria-label={playerState.isPlaying ? '暂停' : '播放'}
          >
            {playerState.isPlaying ? 
              <Icons.Pause size={56} fill="currentColor" /> : 
              <Icons.Play size={56} fill="currentColor" className="ml-1.5" />
            }
          </button>
          <button onClick={nextSong} data-testid="player-next-song" className="w-11 h-11 flex items-center justify-center text-white opacity-80 hover:opacity-100 transition active:scale-90" aria-label="下一首">
            <Icons.SkipForward size={26} fill="currentColor" />
          </button>
        </motion.div>

        {/* 7. Volume Control Slider - Functional with Thickening Animation */}
        <motion.div className="flex items-center gap-4 px-2 my-6 group" initial={secondaryInitial} animate={secondaryAnimate} transition={secondaryTransition(4)}>
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
                  aria-label="音量"
                />
             </div>
          </div>

          <div className="w-4 flex justify-center">
            <Icons.Volume2 size={14} strokeWidth={1.5} className="text-white/40" />
          </div>
        </motion.div>

        {/* Footer Function Bar */}
        <motion.div className="flex justify-center pb-[calc(env(safe-area-inset-bottom)+12px)]" initial={secondaryInitial} animate={secondaryAnimate} transition={secondaryTransition(5)}>
          <div className="flex items-center justify-between w-full max-w-[280px]">
            <button 
              onClick={() => setIsCommentsOpen(true)}
              className={`w-11 h-11 flex items-center justify-center transition active:opacity-60 ${isCommentsOpen ? 'text-white' : 'text-white/40 hover:text-white'}`}
              aria-label="打开评论"
              data-testid="player-open-comments"
            >
              <Icons.MessageSquareQuote size={20} strokeWidth={1.5} />
            </button>
            <button 
              onClick={() => {
                setIsMemoryOpen(true);
                setMemoryOpenNonce((n) => n + 1);
              }}
              className={`w-11 h-11 flex items-center justify-center transition active:opacity-60 ${isMemoryOpen ? 'text-white' : 'text-white/40 hover:text-white'}`}
              aria-label="打开记忆卡片"
            >
              <Icons.Sparkles size={20} strokeWidth={1.5} />
            </button>
            <button 
              onClick={openQueue}
              className={`w-11 h-11 flex items-center justify-center transition active:opacity-60 ${isQueueOpen ? 'text-white' : 'text-white/40 hover:text-white'}`}
              aria-label="打开待播放"
              data-testid="player-open-queue"
            >
              <Icons.List size={20} strokeWidth={1.5} />
            </button>
          </div>
        </motion.div>
        </div>
      </div>

      {/* Memory Card Overlay */}
       <MemoryCardModal song={isMemoryOpen ? song : null} openNonce={memoryOpenNonce} onClose={() => setIsMemoryOpen(false)} />

      {/* Queue/List Overlay */}
      {isQueueOpen && (
        <motion.div
          className="absolute inset-0 z-50"
          data-testid="player-queue-sheet"
          initial={false}
          animate={{ opacity: 1 }}
        >
          <motion.div
            className="absolute inset-0 bg-black/60"
            onClick={closeQueue}
            initial={{ opacity: 0 }}
            animate={{ opacity: isQueueClosing ? 0 : 1 }}
            transition={{ duration: reduceMotion ? 0.1 : 0.2, ease: 'easeOut' }}
          />
          <motion.div
            className="absolute inset-x-0 bottom-0 top-1/3 bg-zinc-900/95 rounded-t-[32px] border-t border-white/10 flex flex-col shadow-[0_-20px_50px_rgba(0,0,0,0.5)] will-change-transform transform-gpu"
            data-testid="player-queue-panel"
            initial={reduceMotion ? { opacity: 0 } : { y: '100%', opacity: 0.86 }}
            animate={isQueueClosing ? { y: '100%', opacity: 0.82 } : { y: 0, opacity: 1 }}
            transition={reduceMotion
              ? { duration: 0.1 }
              : isQueueClosing
                ? { duration: 0.3, ease: [0.32, 0, 0.24, 1] }
                : { type: 'spring', stiffness: 330, damping: 32, mass: 0.9 }}
          >
            <button type="button" data-testid="player-queue-close" className="flex justify-center py-4 cursor-pointer" onClick={closeQueue} aria-label="收起待播放">
              <div className="w-10 h-1.5 bg-white/20 rounded-full"></div>
            </button>
            
            <div className="px-6 py-2 flex justify-between items-center">
              <h3 className="text-lg font-bold text-white tracking-tight">待播放</h3>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setIsQueueSorting((value) => !value)}
                  className={`min-h-11 px-3 rounded-full text-xs font-semibold transition ${isQueueSorting ? 'bg-white text-black' : 'text-white/70 hover:text-white hover:bg-white/10'}`}
                  aria-pressed={isQueueSorting}
                >
                  {isQueueSorting ? '完成' : '排序'}
                </button>
                <button
                  onClick={cyclePlaybackMode}
                  className="min-h-11 px-3 rounded-full flex items-center gap-2 text-white/70 hover:text-white hover:bg-white/10 active:scale-95 transition"
                  aria-label={`切换播放策略，当前为${playbackModeMeta.label}`}
                  title={playbackModeMeta.label}
                >
                  <PlaybackModeIcon size={16} strokeWidth={1.8} />
                  <span className="text-xs font-semibold tracking-tight">{playbackModeMeta.label}</span>
                </button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto overscroll-contain px-4 pb-12 no-scrollbar">
              {isQueueSorting ? (
                <Reorder.Group axis="y" values={queueSongs.map((item) => item.id)} onReorder={reorderQueue} className="space-y-1 mt-4">
                  {queueSongs.map((queueSong) => (
                    <QueueSongRow
                      key={queueSong.id}
                      song={queueSong}
                      currentSongId={song.id}
                      isPlaying={playerState.isPlaying}
                      sorting
                      onPlay={() => playSong(queueSong.id)}
                      onRemove={() => removeFromQueue(queueSong.id)}
                    />
                  ))}
                </Reorder.Group>
              ) : (
                <div className="space-y-1 mt-4">
                  {queueSongs.map((queueSong) => (
                    <QueueSongRow
                      key={queueSong.id}
                      song={queueSong}
                      currentSongId={song.id}
                      isPlaying={playerState.isPlaying}
                      sorting={false}
                      onPlay={() => playSong(queueSong.id)}
                      onRemove={() => removeFromQueue(queueSong.id)}
                    />
                  ))}
                </div>
              )}
                {queueSongs.length === 0 && (
                  <div className="py-20 text-center">
                    <p className="text-zinc-500 italic text-sm">播放列表为空</p>
                  </div>
                )}
            </div>
          </motion.div>
        </motion.div>
      )}

      {/* Comments Sheet Overlay */}
      <CommentsSheet isOpen={isCommentsOpen} onClose={() => setIsCommentsOpen(false)} />

      {isLyricsEditorOpen && (
        <React.Suspense fallback={null}>
          <SongLyricsEditorDialog
            isOpen
            song={song}
            audioUrl={lyricsEditorAudioUrl}
            onClose={() => setIsLyricsEditorOpen(false)}
          />
        </React.Suspense>
      )}

      {/* More Menu */}
      <UniversalContextMenu 
          isOpen={contextMenuOpen} 
          onClose={() => setContextMenuOpen(false)} 
          item={song} 
          type="song"
          anchorPosition={menuAnchor}
          openNonce={contextMenuOpenNonce}
          onOpenLyricsEditor={openLyricsEditor}
      />
    </motion.div>
  );
};
